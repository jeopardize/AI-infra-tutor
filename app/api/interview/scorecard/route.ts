import { getClient, pickModel } from "@/lib/claude/client";
import {
  interviewScorecardSystem,
  type PromptLang,
} from "@/lib/claude/prompts";

export const runtime = "nodejs";
export const maxDuration = 180;

interface ScorecardBody {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  config: { level: string; focus: string[]; durationMin: number };
  language?: PromptLang;
}

export interface Scorecard {
  overall: number;
  summary: string;
  dimensions: {
    concept_clarity: number;
    system_design: number;
    practical_experience: number;
    communication: number;
  };
  strengths: string[];
  weaknesses: string[];
  knowledge_gaps: Array<{ checkpoint_id: string; description: string }>;
  next_steps: string[];
}

/** 从模型文本输出中解析出 JSON 对象 */
function extractJson(text: string): Scorecard | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const s = fenced ? fenced[1] : text;
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Scorecard;
  } catch {
    return null;
  }
}

const SCHEMA_INSTRUCTION =
  lang_neutral_schema();

function lang_neutral_schema() {
  return `JSON 字段定义（必须全部包含）：
{
  "overall": number 0-100,
  "summary": string 一句话总评,
  "dimensions": {
    "concept_clarity": number, "system_design": number,
    "practical_experience": number, "communication": number
  },
  "strengths": string[] 亮点,
  "weaknesses": string[] 明显短板,
  "knowledge_gaps": [{"checkpoint_id": string, "description": string}],
  "next_steps": string[] 下一步学习建议
}`;
}

export async function POST(req: Request) {
  const body = (await req.json()) as ScorecardBody;
  const lang: PromptLang = body.language === "en" ? "en" : "zh";

  let client;
  try {
    client = getClient();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  const transcript = body.messages
    .map((m) => {
      if (lang === "en") {
        return `**${m.role === "user" ? "Candidate" : "Interviewer"}**: ${m.content}`;
      }
      return `**${m.role === "user" ? "候选人" : "面试官"}**：${m.content}`;
    })
    .join("\n\n");

  const userPrompt =
    lang === "en"
      ? `Below is the just-completed mock interview transcript. Config: ${JSON.stringify(
          body.config,
        )}

---

${transcript}

---

Based on the above, output the scorecard as JSON text (no tool calling). All string fields must be in English.`
      : `以下是刚结束的模拟面试完整对话。配置：${JSON.stringify(body.config)}

---

${transcript}

---

请基于上面对话，直接输出评分报告 JSON 文本（不要调用工具、不要输出其他内容）。所有字段用中文。`;

  // 注意：当前代理（ark）调用 tools 时会偶发空 tool_use（{"raw_arguments": ""}），
  // 改为纯文本 JSON 输出更稳定。
  const JSON_SYSTEM_SUFFIX =
    lang === "en"
      ? `\n\n---\n\n[FORMAT] Output ONLY one JSON object (no tool calls, no prose). Schema:\n${SCHEMA_INSTRUCTION}`
      : `\n\n---\n\n【输出格式】只输出一个 JSON 对象（不要调用工具、不要输出任何其他文字）。Schema：\n${SCHEMA_INSTRUCTION}`;
  const system = interviewScorecardSystem(lang) + JSON_SYSTEM_SUFFIX;

  const MAX_TRIES = 2;
  let scorecard: Scorecard | null = null;
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
    scorecard = extractJson(text);
    console.log(`[scorecard] try ${i + 1}: parsed=${!!scorecard} textLen=${text.length}`);
    if (scorecard) break;
  }

  if (!scorecard) {
    return Response.json(
      { error: "failed to parse scorecard from model output" },
      { status: 502 },
    );
  }

  return Response.json(scorecard);
}
