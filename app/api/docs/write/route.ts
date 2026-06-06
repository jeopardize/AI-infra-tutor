import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveSafe } from "@/lib/docs/fs";

export const runtime = "nodejs";

interface WriteBody {
  path: string;
  content: string;
  /** 若传入：要求当前文件 mtime 等于此值，避免覆盖外部更新（可选） */
  expectMtime?: number;
  /** 默认 false：路径上的父目录如果不存在则失败；true 时自动 mkdir -p */
  createParents?: boolean;
}

export async function POST(req: Request) {
  let body: WriteBody;
  try {
    body = (await req.json()) as WriteBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.path || typeof body.content !== "string") {
    return Response.json(
      { error: "path and content required" },
      { status: 400 },
    );
  }
  // 只允许 markdown
  if (!/\.(md|markdown)$/i.test(body.path)) {
    return Response.json(
      { error: "only .md / .markdown files are writable" },
      { status: 400 },
    );
  }
  const abs = resolveSafe(body.path);
  if (!abs) return Response.json({ error: "invalid path" }, { status: 400 });

  // 父目录存在性
  const parent = path.dirname(abs);
  try {
    await fs.access(parent);
  } catch {
    if (body.createParents) {
      await fs.mkdir(parent, { recursive: true });
    } else {
      return Response.json(
        { error: "parent directory does not exist" },
        { status: 400 },
      );
    }
  }

  // 可选的乐观锁：mtime 匹配检查
  if (body.expectMtime != null) {
    try {
      const stat = await fs.stat(abs);
      if (Math.abs(stat.mtimeMs - body.expectMtime) > 1) {
        return Response.json(
          {
            error: "mtime_mismatch",
            currentMtime: stat.mtimeMs,
            message:
              "文件在外部被修改过。请刷新后再保存以避免覆盖。",
          },
          { status: 409 },
        );
      }
    } catch {
      // 文件不存在，按新建处理（落到下面 writeFile）
    }
  }

  await fs.writeFile(abs, body.content, "utf-8");
  const stat = await fs.stat(abs);
  return Response.json({
    path: body.path,
    bytes: stat.size,
    mtime: stat.mtimeMs,
  });
}
