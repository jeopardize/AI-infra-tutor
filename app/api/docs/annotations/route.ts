import { promises as fs } from "node:fs";
import path from "node:path";
import { libraryRoot, resolveSafe } from "@/lib/docs/fs";
import { syncPushNotes } from "@/lib/docs/sync";

export const runtime = "nodejs";

/**
 * PDF 标注持久化：以 sidecar JSON 形式存放在笔记库根目录的 `.annotations/` 下
 * （路径扁平化：a/b/c.pdf → .annotations/a__b__c.pdf.annotations.json），
 * 随笔记 git 仓库同步，多端可共享。
 */

function sidecarPath(root: string, rel: string): string {
  const flat = rel.split(path.sep).join("/").replace(/\//g, "__");
  return path.join(root, ".annotations", `${flat}.annotations.json`);
}

interface Annotation {
  id: string;
  page: number;
  /** 归一化矩形（相对页面宽高的 0-1 值） */
  rects: Array<{ x: number; y: number; w: number; h: number }>;
  color: string;
  quote: string;
  note: string;
  createdAt: number;
}

interface AnnotationFile {
  version: 1;
  /** 关联的 PDF 路径 */
  source: string;
  annotations: Annotation[];
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rel = url.searchParams.get("path") ?? "";
  if (!rel) return Response.json({ error: "missing path" }, { status: 400 });
  const root = libraryRoot();
  const abs = sidecarPath(root, rel);
  try {
    const text = await fs.readFile(abs, "utf-8");
    const data = JSON.parse(text) as AnnotationFile;
    return Response.json({ annotations: data.annotations ?? [] });
  } catch {
    return Response.json({ annotations: [] });
  }
}

export async function POST(req: Request) {
  let body: { path?: string; annotations?: Annotation[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const rel = body.path;
  if (!rel || !Array.isArray(body.annotations)) {
    return Response.json({ error: "path and annotations required" }, { status: 400 });
  }
  // 校验 PDF 路径本身合法（防越权写）
  if (!resolveSafe(rel)) {
    return Response.json({ error: "invalid path" }, { status: 400 });
  }
  const root = libraryRoot();
  const abs = sidecarPath(root, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const data: AnnotationFile = {
    version: 1,
    source: rel,
    annotations: body.annotations,
  };
  await fs.writeFile(abs, JSON.stringify(data, null, 2), "utf-8");
  // 标注属于低频离散操作，直接 commit+push 同步到 GitHub
  try {
    await syncPushNotes(`web: annotations ${rel}`);
  } catch (e) {
    return Response.json({
      path: rel,
      saved: true,
      synced: false,
      warn: (e as Error).message,
    });
  }
  return Response.json({ path: rel, saved: true, synced: true });
}
