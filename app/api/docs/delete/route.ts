import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveSafe } from "@/lib/docs/fs";
import { syncPushNotes } from "@/lib/docs/sync";

export const runtime = "nodejs";

/**
 * DELETE /api/docs/delete?path=<相对路径>
 * 删除笔记库中的文件或文件夹（连同内容），同步清理 PDF 标注 sidecar。
 */
export async function DELETE(req: Request) {
  const rel = (new URL(req.url).searchParams.get("path") ?? "").replace(/^\/+|\/+$/g, "");
  if (!rel) return Response.json({ error: "path required" }, { status: 400 });
  const abs = resolveSafe(rel);
  if (!abs || rel === "." || rel.startsWith(".")) {
    return Response.json({ error: "invalid path" }, { status: 400 });
  }
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat) return Response.json({ error: "不存在" }, { status: 404 });

  await fs.rm(abs, { recursive: true, force: true });

  // PDF 标注 sidecar 一并清理：a/b/c.pdf → .annotations/a__b__c.pdf.annotations.json；
  // 文件夹删除时清理其下所有文档对应的 sidecar（按前缀匹配）
  try {
    const annDir = path.join(path.dirname(abs), ".annotations");
    const flat = path.basename(rel).replace(/\//g, "__");
    if (stat.isDirectory()) {
      const prefix = `${flat}__`;
      const files = await fs.readdir(annDir).catch(() => [] as string[]);
      const dirPrefix = `${rel.replace(/\//g, "__")}__`;
      for (const f of files) {
        if (f.startsWith(`${dirPrefix}`)) {
          await fs.rm(path.join(annDir, f), { force: true }).catch(() => {});
        }
      }
      void prefix;
    } else {
      await fs.rm(path.join(annDir, `${flat}.annotations.json`), { force: true }).catch(() => {});
    }
  } catch {
    /* sidecar 清理尽力而为 */
  }

  try {
    await syncPushNotes(`web: delete ${rel}`);
  } catch {
    /* 尽力而为 */
  }
  return Response.json({ ok: true });
}
