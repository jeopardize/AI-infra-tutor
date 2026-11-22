import { promises as fs } from "node:fs";
import path from "node:path";
import { repoFromRequest } from "@/lib/docs/repos";
import { resolveSafe } from "@/lib/docs/fs";
import { syncPushNotes } from "@/lib/docs/sync";

export const runtime = "nodejs";

interface CreateBody {
  path: string;
  /** 可选初始内容；默认空 + 一行标题（基于文件名） */
  content?: string;
  /** 多仓库标识（可选） */
  repo?: string;
}

export async function POST(req: Request) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.path) {
    return Response.json({ error: "path required" }, { status: 400 });
  }
  if (!/\.(md|markdown)$/i.test(body.path)) {
    return Response.json(
      { error: "only .md / .markdown files can be created" },
      { status: 400 },
    );
  }
  const repo = await repoFromRequest(req, body.repo);
  if (!repo) return Response.json({ error: "unknown_repo" }, { status: 404 });
  const abs = resolveSafe(body.path, repo.root);
  if (!abs) return Response.json({ error: "invalid path" }, { status: 400 });

  // 已存在则拒绝（避免覆盖）
  try {
    await fs.access(abs);
    return Response.json(
      { error: "file already exists" },
      { status: 409 },
    );
  } catch {
    /* not exists, proceed */
  }

  // 父目录不存在就 mkdir -p
  await fs.mkdir(path.dirname(abs), { recursive: true });

  const title = path.basename(body.path).replace(/\.(md|markdown)$/i, "");
  const initial = body.content ?? `# ${title}\n\n`;
  await fs.writeFile(abs, initial, "utf-8");
  // 新建笔记后自动 commit + push 到 GitHub
  await syncPushNotes(`web: create ${body.path}`, repo.root);
  const stat = await fs.stat(abs);

  return Response.json({
    path: body.path,
    created: true,
    bytes: stat.size,
    mtime: stat.mtimeMs,
  });
}
