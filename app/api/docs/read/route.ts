import { promises as fs } from "node:fs";
import path from "node:path";
import { libraryRoot, resolveSafe } from "@/lib/docs/fs";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rel = url.searchParams.get("path") ?? "";
  if (!rel) {
    return Response.json({ error: "missing path" }, { status: 400 });
  }
  const abs = resolveSafe(rel);
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
      root: libraryRoot(),
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
