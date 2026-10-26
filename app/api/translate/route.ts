export const runtime = "nodejs";

/** 免费翻译服务（无需 API key）：
 *  1) Google gtx（境外可达；国内服务器不可达）
 *  2) MyMemory（国内可达，兜底）
 *  自动降级。单次请求分块，避免 URL 过长。
 */

interface TranslateBody {
  text: string;
  /** ISO 码或 BCP47，如 zh-CN / en */
  target: string;
}

const MAX_TOTAL = 20000;
const CHUNK = 1400;

/** 按段落边界切块，尽量不破坏句子 */
function chunkText(text: string): string[] {
  const paras = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (p.length > CHUNK) {
      if (cur) {
        chunks.push(cur);
        cur = "";
      }
      // 超长段落按行再切
      let lineBuf = "";
      for (const line of p.split("\n")) {
        if ((lineBuf + "\n" + line).length > CHUNK) {
          chunks.push(lineBuf);
          lineBuf = line;
        } else {
          lineBuf = lineBuf ? lineBuf + "\n" + line : line;
        }
      }
      if (lineBuf) chunks.push(lineBuf);
      continue;
    }
    if ((cur + "\n\n" + p).length > CHUNK) {
      chunks.push(cur);
      cur = p;
    } else {
      cur = cur ? cur + "\n\n" + p : p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function googleGtx(text: string, target: string): Promise<string | null> {
  try {
    const url =
      "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t" +
      `&sl=auto&tl=${encodeURIComponent(target)}&q=${encodeURIComponent(text)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const data = (await r.json()) as unknown;
    // 格式：[[["译句","原句",...],...],...]
    const arr = data as [Array<[string, string, ...unknown[]]>, ...unknown[]];
    if (!Array.isArray(arr?.[0])) return null;
    return arr[0]
      .map((seg) => (Array.isArray(seg) ? seg[0] : ""))
      .join("")
      .trim() || null;
  } catch {
    return null;
  }
}

async function myMemory(text: string, target: string): Promise<string | null> {
  try {
    // MyMemory 不支持自动检测源语言：译中文时按英语源，译英文时按中文源
    const pair = /^zh/i.test(target) ? "en|zh-CN" : "zh-CN|en";
    const url =
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}` +
      `&langpair=${encodeURIComponent(pair)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const data = (await r.json()) as {
      responseStatus?: number;
      responseData?: { translatedText?: string };
    };
    const out = data.responseData?.translatedText;
    if (data.responseStatus === 200 && out && !/MYMEMORY WARNING/i.test(out)) {
      return out.trim();
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: TranslateBody;
  try {
    body = (await req.json()) as TranslateBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  const target = (body.target ?? "zh-CN").trim();
  if (!text) return Response.json({ error: "text required" }, { status: 400 });
  if (text.length > MAX_TOTAL) {
    return Response.json(
      { error: `text too long (max ${MAX_TOTAL} chars)` },
      { status: 413 },
    );
  }

  const chunks = chunkText(text);
  const providerUsed = { gtx: 0, mymemory: 0, failed: 0 };
  const out: string[] = [];
  for (const chunk of chunks) {
    let translated = await googleGtx(chunk, target);
    if (translated) {
      providerUsed.gtx++;
    } else {
      translated = await myMemory(chunk, target);
      if (translated) providerUsed.mymemory++;
      else providerUsed.failed++;
    }
    out.push(translated ?? "");
  }
  if (providerUsed.failed === chunks.length) {
    return Response.json({ error: "translation services unreachable" }, { status: 502 });
  }
  return Response.json({
    text: out.join("\n\n"),
    provider: providerUsed.gtx > 0 ? "google" : "mymemory",
    failedChunks: providerUsed.failed,
  });
}
