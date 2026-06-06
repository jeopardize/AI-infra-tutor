import { promises as fs } from "node:fs";
import { resolveSafe } from "@/lib/docs/fs";

export const runtime = "nodejs";

interface MkdirBody {
  path: string;
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
  const abs = resolveSafe(body.path);
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
  return Response.json({ path: body.path, created: true });
}
