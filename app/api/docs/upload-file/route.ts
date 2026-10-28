import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveSafe } from "@/lib/docs/fs";
import { syncPushNotes } from "@/lib/docs/sync";

export const runtime = "nodejs";

const MAX_BYTES = 200 * 1024 * 1024;

/** 拖拽/按钮上传 PDF 到笔记库（被墙站点兜底：本地浏览器下载后直接拖进来） */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "expected multipart form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `文件超过 ${MAX_BYTES / 1024 / 1024}MB 限制` },
      { status: 413 },
    );
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length < 5 || !buf.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
    return Response.json({ error: "不是有效的 PDF 文件" }, { status: 415 });
  }

  const dir = String(form.get("dir") ?? "").replace(/^\/+|\/+$/g, "");
  let name = String(form.get("name") ?? file.name ?? "imported.pdf");
  name = decodeURIComponent(name).replace(/[\0/\\<>:"|?*\s]+/g, "_").replace(/^\.+/, "");
  if (!/\.pdf$/i.test(name)) name += ".pdf";
  name = name.slice(-120);

  const rel = dir ? `${dir}/${name}` : name;
  const abs = resolveSafe(rel);
  if (!abs) return Response.json({ error: "invalid path" }, { status: 400 });
  if (dir) await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf);
  try {
    await syncPushNotes(`web: upload pdf ${rel}`);
  } catch { /* 尽力而为 */ }
  return Response.json({ path: rel, bytes: buf.length });
}
