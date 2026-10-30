import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
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

/**
 * 笔记库文件访问。支持 HTTP Range（大 PDF 关键：pdf.js 按 Range 流式分片加载，
 * 否则必须整文件下载完才开始渲染首页——超大扫描版 PDF 会显得"毫无动静"）。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rel = url.searchParams.get("path") ?? "";
  if (!rel) return new Response("missing path", { status: 400 });
  const abs = resolveSafe(rel);
  if (!abs) return new Response("invalid path", { status: 400 });

  let stat;
  try {
    stat = await fs.stat(abs);
    if (!stat.isFile()) return new Response("not a file", { status: 400 });
  } catch {
    return new Response("not found", { status: 404 });
  }
  const ext = path.extname(abs).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";
  const size = stat.size;

  // Range 分片（仅对大文件；jpg 等小图反复随机访问切片反而无益）
  const rangeHdr = req.headers.get("range");
  if (rangeHdr && size > 1024 * 1024) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHdr);
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : Math.min(start + 1024 * 1024 - 1, size - 1);
      if (!m[1] && m[2]) {
        // bytes=-N：后缀区间
        start = Math.max(0, size - parseInt(m[2], 10));
        end = size - 1;
      }
      if (isNaN(start) || isNaN(end) || start > end || start >= size) {
        return new Response("range not satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }
      end = Math.min(end, size - 1);
      const len = end - start + 1;
      try {
        const stream = Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream;
        return new Response(stream, {
          status: 206,
          headers: {
            "Content-Type": type,
            "Content-Length": String(len),
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
          },
        });
      } catch {
        return new Response("read failed", { status: 500 });
      }
    }
  }

  const buf = await fs.readFile(abs);
  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-cache",
    },
  });
}
