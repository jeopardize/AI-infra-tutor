import { promises as fs } from "node:fs";
import { repoFromRequest } from "@/lib/docs/repos";
import { resolveSafe } from "@/lib/docs/fs";
import { syncPushNotes } from "@/lib/docs/sync";

export const runtime = "nodejs";

interface MkdirBody {
  path: string;
  /** 多仓库标识（可选） */
  repo?: string;
}

export async function POST(req: Request) {
  let body: MkdirBody;
  try {
    body = (await req.json()) as MkdirBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.path) {
    return Response.json({ error: "path required" }, { status: 400 });
  }
  // 防止用户传明显异常字符（路径分隔符以外）
  if (/[<>:"|?*\0]/.test(body.path)) {
    return Response.json(
      { error: "path contains illegal characters" },
      { status: 400 },
    );
  }
  const repo = await repoFromRequest(req, body.repo);
  if (!repo) return Response.json({ error: "unknown_repo" }, { status: 404 });
  const abs = resolveSafe(body.path, repo.root);
  if (!abs) return Response.json({ error: "invalid path" }, { status: 400 });

  try {
    const stat = await fs.stat(abs);
    if (stat.isDirectory()) {
      return Response.json({ path: body.path, alreadyExists: true });
    }
    return Response.json(
      { error: "path exists and is not a directory" },
      { status: 409 },
    );
  } catch {
    /* not exists, continue */
  }

  await fs.mkdir(abs, { recursive: true });
  // 新建目录后自动 commit + push 到 GitHub
  await syncPushNotes(`web: mkdir ${body.path}`, repo.root);
  return Response.json({ path: body.path, created: true });
}
