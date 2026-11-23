import { promises as fs } from "node:fs";
import path from "node:path";
import { repoFromRequest } from "@/lib/docs/repos";
import { resolveSafe } from "@/lib/docs/fs";
import { syncPushNotes } from "@/lib/docs/sync";

export const runtime = "nodejs";

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

/**
 * 图片重命名后更新所有 md 笔记中的引用（相对路径），避免断链。
 * 引用以各 md 所在目录为基准计算（如笔记在 dir/、图片在 dir/images/，引用为 images/a.png）。
 * 仅当图片位于该笔记目录子树内时才重写；跳过 .git/.annotations/node_modules。
 */
async function updateImageRefs(root: string, fromRel: string, toRel: string): Promise<number> {
  const SKIP = new Set([".git", ".annotations", "node_modules"]);
  let changed = 0;
  async function* walk(dir: string): AsyncGenerator<string> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP.has(e.name)) continue;
        yield* walk(abs);
      } else if (/\.(md|markdown)$/i.test(e.name)) {
        yield abs;
      }
    }
  }
  for await (const mdAbs of walk(root)) {
    const mdDir = path.dirname(path.relative(root, mdAbs).split(path.sep).join("/"));
    const oldRef = path.posix.relative(mdDir === "." ? "" : mdDir, fromRel);
    if (oldRef.startsWith("..")) continue;
    const newRef = path.posix.relative(mdDir === "." ? "" : mdDir, toRel);
    const raw = await fs.readFile(mdAbs, "utf-8");
    if (!raw.includes(oldRef)) continue;
    await fs.writeFile(mdAbs, raw.split(oldRef).join(newRef), "utf-8");
    changed += 1;
  }
  return changed;
}

interface RenameBody {
  /** 相对路径（文件或文件夹） */
  path: string;
  /** 新名字（不含路径） */
  newName: string;
  /** 多仓库标识（可选） */
  repo?: string;
}

export async function POST(req: Request) {
  let body: RenameBody;
  try {
    body = (await req.json()) as RenameBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.path || !body.newName?.trim()) {
    return Response.json({ error: "path and newName required" }, { status: 400 });
  }
  const name = body.newName.trim();
  if (/[\\<>:"|?*\0/]/.test(name)) {
    return Response.json({ error: "名称包含非法字符" }, { status: 400 });
  }
  const repo = await repoFromRequest(req, body.repo);
  if (!repo) return Response.json({ error: "unknown_repo" }, { status: 404 });
  const abs = resolveSafe(body.path, repo.root);
  if (!abs) return Response.json({ error: "invalid path" }, { status: 400 });

  const stat = await fs.stat(abs).catch(() => null);
  if (!stat) return Response.json({ error: "源不存在" }, { status: 404 });

  const newRel = body.path
    .split("/")
    .slice(0, -1)
    .concat(name)
    .join("/");
  const newAbs = resolveSafe(newRel, repo.root);
  if (!newAbs) return Response.json({ error: "invalid target path" }, { status: 400 });

  try {
    await fs.access(newAbs);
    return Response.json({ error: "同名文件/文件夹已存在" }, { status: 409 });
  } catch {}

  await fs.rename(abs, newAbs);
  // 图片重命名：同步更新 md 引用，避免笔记里断链
  let refsUpdated = 0;
  if (IMAGE_EXT_RE.test(body.path)) {
    refsUpdated = await updateImageRefs(repo.root, body.path, newRel).catch(() => 0);
  }
  await syncPushNotes(`web: rename ${body.path} -> ${name}`, repo.root);
  return Response.json({ ok: true, path: newRel, refsUpdated });
}
