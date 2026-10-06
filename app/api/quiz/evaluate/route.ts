import { getClient, pickModel } from "@/lib/claude/client";
import {
  checkpointContextBlock,
  quizEvaluateSystem,
  type PromptLang,
} from "@/lib/claude/prompts";

export const runtime = "nodejs";
export const maxDuration = 90;

interface EvaluateBody {
  checkpointId: string;
  question: string;
  answer: string;
  language?: PromptLang;
  /** 题库中该题目的标准答案；提供时优先于 checkpoint 参考信息 */
  referenceAnswer?: string;
}

export interface QuizEvaluation {
  score: number;
  correct_points: string[];
  gaps: string[];
  misconceptions: string[];
  reference_answer: string;
  follow_up: string;
}

/** 从模型文本输出中解析出 JSON 对象 */
function extractJson(text: string): QuizEvaluation | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const s = fenced ? fenced[1] : text;
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as QuizEvaluation;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as EvaluateBody;
  const lang: PromptLang = body.language === "en" ? "en" : "zh";

  let client;
  try {
    client = getClient();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  const userPrompt =
    lang === "en"
      ? `【Question】
${body.question}

【Learner's answer】
${body.answer}

${
  body.referenceAnswer?.trim()
    ? `【Standard answer (ground truth)】\n${body.referenceAnswer.trim()}\n\nGrade strictly against this standard answer. In your analysis, tell the learner exactly which parts are covered/missing relative to it.`
    : `【Reference info for this checkpoint】\n${checkpointContextBlock(body.checkpointId, lang)}`
}

Respond in ALL-JSON text (no tool calling), exactly one JSON object with ALL these fields:
{"score": number 0-100, "correct_points": string[], "gaps": string[], "misconceptions": string[], "reference_answer": string markdown, "follow_up": string}
All string fields in English. Return ONLY the JSON object.`
      : `【题面】
${body.question}

【学习者的回答】
${body.answer}

${
  body.referenceAnswer?.trim()
    ? `【标准答案】\n${body.referenceAnswer.trim()}\n\n请严格以标准答案为基准评分，在解析中明确指出学习者答到了标准答案的哪些点、遗漏了哪些点。`
    : `【该 checkpoint 的参考信息】\n${checkpointContextBlock(body.checkpointId, lang)}`
}

请直接输出 JSON 文本（不要使用工具调用、不要输出其他内容），且必须是一个完整的 JSON 对象，包含全部字段：
{"score": 数字0-100, "correct_points": 字符串数组, "gaps": 字符串数组, "misconceptions": 字符串数组, "reference_answer": 精炼的参考答案markdown, "follow_up": 一个进阶追问}
所有字段用中文。只返回 JSON 对象本身。`;

  // 注意：当前代理（ark）调用 tools 时会偶发空 tool_use（{"raw_arguments": ""}），
  // 改为纯文本 JSON 输出，稳定性远高于 tool_choice。
  const JSON_SYSTEM_SUFFIX =
    lang === "en"
      ? "\n\n---\n\n[FORMAT] Output ONLY one JSON object (no tool calls, no prose). All fields in English."
      : "\n\n---\n\n【输出格式】只输出一个 JSON 对象（不要调用工具、不要输出任何其他文字），所有字段用中文。";
  const system = quizEvaluateSystem(lang) + JSON_SYSTEM_SUFFIX;

  // 最多重试 2 次，解析失败时重试
  const MAX_TRIES = 2;
  let evaluation: QuizEvaluation | null = null;
  for (let i = 0; i < MAX_TRIES; i++) {
    const resp = await client.messages.create({
      model: pickModel("quality"),
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
    evaluation = extractJson(text);
    console.log(`[quiz/evaluate] try ${i + 1}: parsed=${!!evaluation} textLen=${text.length}`);
    if (evaluation) break;
  }

  if (!evaluation) {
    return Response.json(
      { error: "failed to parse evaluation from model output" },
      { status: 502 },
    );
  }

  return Response.json(evaluation);
}
