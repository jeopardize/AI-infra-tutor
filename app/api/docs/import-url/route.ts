import { promises as fs } from "node:fs";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import { libraryRoot, resolveSafe } from "@/lib/docs/fs";
import { syncPushNotes } from "@/lib/docs/sync";

export const runtime = "nodejs";

/**
 * 从 URL 直接抓取 PDF 存入笔记库（免「下载到本地再上传」）。
 * 安全：仅 http(s)；逐跳校验禁止内网地址（防 SSRF）；限 50MB。
 * 下载用 node:https（实测 undici/fetch 对某些站点 body 流会卡死）。
 */

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_MS = 5 * 60 * 1000; // 总时长上限（部分境外站点限速很慢，给足时间）
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT / 云 metadata
  }
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) {
    return true;
  }
  return false;
}

function assertPublicHttpUrl(u: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    throw new Error("URL 格式无效");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("仅支持 http/https 链接");
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new Error("不允许访问内网地址");
  }
  return parsed;
}

function sanitizeName(name: string): string {
  let n = decodeURIComponent(name).replace(/[\0/\\<>:"|?*\s]+/g, "_").replace(/^\.+/, "");
  if (!/\.pdf$/i.test(n)) n += ".pdf";
  return n.slice(-120);
}

function download(urlStr: string): Promise<{ status: number; location: string | null; headers: Record<string, string>; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.get(
      u,
      {
        headers: { "User-Agent": UA, Accept: "application/pdf,*/*" },
        timeout: 60_000,
      },
      (res) => {
        const startedAt = Date.now();
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (c: Buffer) => {
          if (Date.now() - startedAt > MAX_TOTAL_MS) {
            req.destroy();
            reject(new Error("下载超时（超过 5 分钟，请换更快的链接或本地下载后拖拽上传）"));
            return;
          }
          total += c.length;
          if (total > MAX_BYTES) {
            req.destroy();
            reject(new Error(`文件超过 ${MAX_BYTES / 1024 / 1024}MB 限制`));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location ?? null,
            headers: res.headers as Record<string, string>,
            body: Buffer.concat(chunks),
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("下载超时（60s）")));
    req.on("error", reject);
  });
}

export async function POST(req: Request) {
  let body: { url?: string; dir?: string; name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.url) return Response.json({ error: "url required" }, { status: 400 });

  // 逐跳重定向校验，防 SSRF
  let currentUrl: URL;
  try {
    currentUrl = assertPublicHttpUrl(body.url);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  let resp: Awaited<ReturnType<typeof download>> | null = null;
  try {
    for (let hop = 0; hop < 6; hop++) {
      assertPublicHttpUrl(currentUrl.href);
      const r = await download(currentUrl.href);
      if (r.status >= 300 && r.status < 400 && r.location) {
        currentUrl = new URL(r.location, currentUrl);
        continue;
      }
      resp = r;
      break;
    }
  } catch (e) {
    const msg = (e as Error).message;
    return Response.json(
      {
        error: /超时|timeout/i.test(msg)
          ? "下载超时：该站点可能无法从服务器直连（可本地下载后拖拽 PDF 进笔记库）"
          : `下载失败：${msg}`,
      },
      { status: 502 },
    );
  }
  if (!resp || resp.status < 200 || resp.status >= 300) {
    return Response.json(
      { error: `下载失败：HTTP ${resp?.status ?? "无响应"}` },
      { status: 502 },
    );
  }
  const buf = resp.body;
  const contentType = resp.headers["content-type"] ?? "";
  if (buf.length >= 5 && /^\s*<(!doctype|html)/i.test(buf.subarray(0, 64).toString("latin1"))) {
    return Response.json(
      { error: "该链接返回的是网页而非 PDF（请复制直接指向 .pdf 文件的链接）" },
      { status: 415 },
    );
  }
  if (buf.length < 5 || !buf.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
    return Response.json(
      { error: `该链接不是 PDF 文件（content-type: ${contentType || "未知"}）` },
      { status: 415 },
    );
  }

  // 目标目录（可选，须在笔记库内）
  const root = libraryRoot();
  let dirAbs = root;
  const dir = (body.dir ?? "").replace(/^\/+|\/+$/g, "");
  if (dir) {
    const safe = resolveSafe(dir);
    if (!safe) return Response.json({ error: "invalid dir" }, { status: 400 });
    await fs.mkdir(safe, { recursive: true });
    dirAbs = safe;
  }
  const name = sanitizeName(body.name || currentUrl.pathname.split("/").pop() || "imported.pdf");
  const rel = dir ? `${dir}/${name}` : name;
  const abs = resolveSafe(rel);
  if (!abs) return Response.json({ error: "invalid path" }, { status: 400 });
  await fs.writeFile(abs, buf);
  try {
    await syncPushNotes(`web: import pdf ${rel}`);
  } catch { /* 尽力而为，失败不影响本地入库 */ }
  return Response.json({ path: rel, bytes: buf.length });
}
