import { promises as fs } from "node:fs";
import path from "node:path";
import { getLibraryRepo } from "@/lib/docs/repos";
import { resolveSafe } from "@/lib/docs/fs";
import { syncPullNotes } from "@/lib/docs/sync";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rel = url.searchParams.get("path") ?? "";
  if (!rel) {
    return Response.json({ error: "missing path" }, { status: 400 });
  }
  const repo = await getLibraryRepo(url.searchParams.get("repo"));
  if (!repo) return Response.json({ error: "unknown_repo" }, { status: 404 });
  // 读取前先从 GitHub 拉取远端最新笔记
  await syncPullNotes(repo.root);
  const abs = resolveSafe(rel, repo.root);
  if (!abs) {
    return Response.json({ error: "invalid path" }, { status: 400 });
  }
  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile()) {
      return Response.json({ error: "not a file" }, { status: 400 });
    }
    const text = await fs.readFile(abs, "utf-8");
    return Response.json({
      repo: repo.id,
      root: repo.root,
      path: rel,
      dir: path.posix.dirname(rel.split(path.sep).join("/")),
      name: path.basename(rel),
      content: text,
      bytes: stat.size,
      mtime: stat.mtimeMs,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
}
