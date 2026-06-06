import { getClient, pickModel } from "@/lib/claude/client";
import {
  interviewScorecardSystem,
  systemWithCache,
  type PromptLang,
} from "@/lib/claude/prompts";

export const runtime = "nodejs";
export const maxDuration = 120;

interface ScorecardBody {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  config: { level: string; focus: string[]; durationMin: number };
  language?: PromptLang;
}

const scorecardTool = {
  name: "submit_scorecard",
  description: "提交面试评分报告",
  input_schema: {
    type: "object" as const,
    properties: {
      overall: { type: "number", description: "总评 0-100" },
      summary: {
        type: "string",
        description: "一句话总评（中文，200 字以内）",
      },
      dimensions: {
        type: "object",
        properties: {
          concept_clarity: { type: "number" },
          system_design: { type: "number" },
          practical_experience: { type: "number" },
          communication: { type: "number" },
        },
        required: [
          "concept_clarity",
          "system_design",
          "practical_experience",
          "communication",
        ],
      },
      strengths: {
        type: "array",
        items: { type: "string" },
        description: "亮点",
      },
      weaknesses: {
        type: "array",
        items: { type: "string" },
        description: "明显短板",
      },
      knowledge_gaps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            checkpoint_id: {
              type: "string",
              description:
                "对应的 checkpoint id，如果不能精确对应就用接近的或空字符串",
            },
            description: {
              type: "string",
              description: "盲点说明，便于学习者理解差距在哪",
            },
          },
          required: ["checkpoint_id", "description"],
        },
      },
      next_steps: {
        type: "array",
        items: { type: "string" },
        description: "下一步学习建议",
      },
    },
    required: [
      "overall",
      "summary",
      "dimensions",
      "strengths",
      "weaknesses",
      "knowledge_gaps",
      "next_steps",
    ],
  },
};

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

Based on the above, call submit_scorecard. All string fields must be in English.`
      : `以下是刚结束的模拟面试完整对话。配置：${JSON.stringify(
          body.config,
        )}

---

${transcript}

---

请基于上面对话，调用 submit_scorecard 工具生成评分报告。`;

  const resp = await client.messages.create({
    model: pickModel("quality"),
    max_tokens: 2048,
    system: systemWithCache(interviewScorecardSystem(lang)),
    tools: [scorecardTool],
    tool_choice: { type: "tool", name: "submit_scorecard" },
    messages: [{ role: "user", content: userPrompt }],
  });

  const toolUse = resp.content.find((b) => b.type === "tool_use") as
    | { type: "tool_use"; input: Scorecard }
    | undefined;

  if (!toolUse) {
    return Response.json(
      { error: "model did not return a tool call" },
      { status: 502 },
    );
  }

  return Response.json(toolUse.input);
}
