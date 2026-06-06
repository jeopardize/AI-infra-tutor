import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveSafe } from "@/lib/docs/fs";

export const runtime = "nodejs";

interface CreateBody {
  path: string;
  /** 可选初始内容；默认空 + 一行标题（基于文件名） */
  content?: string;
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
  const abs = resolveSafe(body.path);
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
  const stat = await fs.stat(abs);

  return Response.json({
    path: body.path,
    created: true,
    bytes: stat.size,
    mtime: stat.mtimeMs,
  });
}
