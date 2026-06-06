import { getClient, pickModel } from "@/lib/claude/client";
import {
  checkpointContextBlock,
  quizEvaluateSystem,
  systemWithCache,
} from "@/lib/claude/prompts";

export const runtime = "nodejs";
export const maxDuration = 90;

interface EvaluateBody {
  checkpointId: string;
  question: string;
  answer: string;
}

const evalTool = {
  name: "submit_evaluation",
  description: "提交对学习者答案的评估",
  input_schema: {
    type: "object" as const,
    properties: {
      score: {
        type: "number",
        description: "0-100，理解的完整度",
      },
      correct_points: {
        type: "array",
        items: { type: "string" },
        description: "学习者答对/答到的关键点",
      },
      gaps: {
        type: "array",
        items: { type: "string" },
        description: "遗漏或没说清楚的关键点",
      },
      misconceptions: {
        type: "array",
        items: { type: "string" },
        description: "学习者的错误认知/概念混淆，若没有则空数组",
      },
      reference_answer: {
        type: "string",
        description: "精炼的参考答案 markdown",
      },
      follow_up: {
        type: "string",
        description: "一个进阶追问，鼓励学习者更深入思考",
      },
    },
    required: [
      "score",
      "correct_points",
      "gaps",
      "misconceptions",
      "reference_answer",
      "follow_up",
    ],
  },
};

export interface QuizEvaluation {
  score: number;
  correct_points: string[];
  gaps: string[];
  misconceptions: string[];
  reference_answer: string;
  follow_up: string;
}

export async function POST(req: Request) {
  const body = (await req.json()) as EvaluateBody;

  let client;
  try {
    client = getClient();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  const userPrompt = `【题面】
${body.question}

【学习者的回答】
${body.answer}

【该 checkpoint 的参考信息】
${checkpointContextBlock(body.checkpointId)}

请调用 submit_evaluation 工具提交结构化评估。`;

  const resp = await client.messages.create({
    model: pickModel("quality"),
    max_tokens: 2048,
    system: systemWithCache(quizEvaluateSystem()),
    tools: [evalTool],
    tool_choice: { type: "tool", name: "submit_evaluation" },
    messages: [{ role: "user", content: userPrompt }],
  });

  const toolUse = resp.content.find((b) => b.type === "tool_use") as
    | { type: "tool_use"; input: QuizEvaluation }
    | undefined;

  if (!toolUse) {
    return Response.json(
      { error: "model did not return a tool call", raw: resp.content },
      { status: 502 },
    );
  }

  return Response.json(toolUse.input);
}
