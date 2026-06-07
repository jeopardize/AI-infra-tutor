import { getClient, pickModel } from "@/lib/claude/client";

export const runtime = "nodejs";
export const maxDuration = 30;

interface AutoCompleteBody {
  text: string;
  sourceLang: "zh" | "en";
  targetLang: "zh" | "en";
  type: "question" | "answer";
}

export async function POST(req: Request) {
  let body: AutoCompleteBody;
  try {
    body = (await req.json()) as AutoCompleteBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.text || !body.text.trim()) {
    return Response.json({ error: "text is required" }, { status: 400 });
  }

  const client = getClient();

  const systemPrompt =
    body.targetLang === "en"
      ? "You are a bilingual AI Infrastructure Q&A translator. Translate the given Chinese question or answer into natural English. Keep technical terms accurate (e.g., KV cache, all-reduce). Return ONLY valid JSON: {\"translated\": \"...\"}. Do not include any other text."
      : "你是一个双语 AI Infrastructure 问答翻译助手。将给定的英文问题或答案翻译成自然的中文。保持技术术语准确。只返回 JSON：{\"translated\": \"...\"}，不要包含其他文字。";

  const userPrompt =
    body.type === "question"
      ? `Translate the following ${body.sourceLang === "zh" ? "Chinese" : "English"} question to ${body.targetLang === "en" ? "English" : "Chinese"}:\n\n${body.text}`
      : `Translate the following ${body.sourceLang === "zh" ? "Chinese" : "English"} answer to ${body.targetLang === "en" ? "English" : "Chinese"}:\n\n${body.text}`;

  const resp = await client.messages.create({
    model: pickModel("fast"),
    max_tokens: 1024,
    system: [{ type: "text", text: systemPrompt }],
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = resp.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  const match = text.match(/\{[\s\S]*\}/);
  let translated = "";
  if (match) {
    try {
      translated = JSON.parse(match[0]).translated ?? "";
    } catch {
      // Fallback: try to extract translated content
      translated = text.replace(/^[^{]*/, "").replace(/[^}]*$/, "").replace(/[{}"]/g, "").replace(/^translated:/, "").trim();
    }
  } else {
    translated = text.trim();
  }

  return Response.json({ translated });
}
