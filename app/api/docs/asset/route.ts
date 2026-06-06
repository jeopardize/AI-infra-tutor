import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveSafe } from "@/lib/docs/fs";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rel = url.searchParams.get("path") ?? "";
  if (!rel) return new Response("missing path", { status: 400 });
  const abs = resolveSafe(rel);
  if (!abs) return new Response("invalid path", { status: 400 });

  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile()) return new Response("not a file", { status: 400 });
    const buf = await fs.readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    const type = MIME[ext] ?? "application/octet-stream";
    return new Response(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    return new Response((e as Error).message, { status: 404 });
  }
}
