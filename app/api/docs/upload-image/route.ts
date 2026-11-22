import { promises as fs } from "node:fs";
import path from "node:path";
import { repoFromRequest } from "@/lib/docs/repos";
import { resolveSafe } from "@/lib/docs/fs";
import { syncPushNotes } from "@/lib/docs/sync";

export const runtime = "nodejs";

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

interface UploadBody {
  /** 图片所属笔记的目录（相对 libraryRoot；空串表示根目录） */
  dir: string;
  /** 文件名（不含路径），如 photo.png */
  name: string;
  /** 图片内容 base64（无 data: 前缀） */
  dataBase64: string;
  /** 多仓库标识（可选） */
  repo?: string;
}

/** 粘贴/上传图片：保存到 <笔记目录>/images/<name>，返回供 markdown 引用的相对路径 */
export async function POST(req: Request) {
  // 整体兜底（反馈：上传报错收到 HTML 错误页 —— 未捕获异常会变成 Next 500 HTML，
  // 前端解析 JSON 就抛 "Unexpected token '<'"）：任何异常都以 JSON 返回
  try {
    return await handleUpload(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upload failed";
    return Response.json({ error: `server error: ${msg}` }, { status: 500 });
  }
}

async function handleUpload(req: Request) {
  let body: UploadBody;
  try {
    body = (await req.json()) as UploadBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const dir = typeof body.dir === "string" ? body.dir : "";
  const name = (body.name ?? "").trim();
  if (!name || !body.dataBase64) {
    return Response.json(
      { error: "name and dataBase64 required" },
      { status: 400 },
    );
  }
  // 名称不允许路径分隔符与非法字符
  if (/[\\/<>:"|?*\0]/.test(name)) {
    return Response.json({ error: "invalid filename" }, { status: 400 });
  }
  const ext = path.extname(name).toLowerCase();
  if (!IMAGE_MIME[ext]) {
    return Response.json(
      { error: `unsupported image type: ${ext || "(none)"}` },
      { status: 400 },
    );
  }
  // 体积限制：base64 约 15MB（对应原图约 11MB）
  if (body.dataBase64.length > 15_000_000) {
    return Response.json({ error: "image too large (max ~10MB)" }, { status: 413 });
  }

  const repo = await repoFromRequest(req, body.repo);
  if (!repo) return Response.json({ error: "unknown_repo" }, { status: 404 });
  const imagesDirRel = dir ? `${dir}/images` : "images";
  const imagesDirAbs = resolveSafe(imagesDirRel, repo.root);
  const abs = resolveSafe(`${imagesDirRel}/${name}`, repo.root);
  if (!imagesDirAbs || !abs) {
    return Response.json({ error: "invalid path" }, { status: 400 });
  }
  await fs.mkdir(imagesDirAbs, { recursive: true });
  await fs.writeFile(abs, Buffer.from(body.dataBase64, "base64"));
  // 自动 commit + push（尽力而为，失败不阻塞保存）
  try {
    await syncPushNotes(`web: add image ${imagesDirRel}/${name}`, repo.root);
  } catch {
    /* ignore */
  }
  const stat = await fs.stat(abs);
  return Response.json({
    path: `${imagesDirRel}/${name}`,
    bytes: stat.size,
    mtime: stat.mtimeMs,
  });
}
