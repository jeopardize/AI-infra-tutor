import { getClient, pickModel } from "@/lib/claude/client";
import {
  checkpointContextBlock,
  quizGenerateSystem,
  systemWithCache,
} from "@/lib/claude/prompts";
import { getCheckpoint } from "@/lib/knowledge";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { checkpointId } = (await req.json()) as { checkpointId: string };
  const found = getCheckpoint(checkpointId);
  if (!found) {
    return new Response("checkpoint not found", { status: 404 });
  }

  let client;
  try {
    client = getClient();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  const userPrompt = `请基于以下 checkpoint 出**一道**开放题：

${checkpointContextBlock(checkpointId)}

只返回 JSON，不要别的：\`{"question": "..."}\``;

  const resp = await client.messages.create({
    model: pickModel("quality"),
    max_tokens: 1024,
    system: systemWithCache(quizGenerateSystem()),
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = resp.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  // 尽量从模型输出里抠 JSON
  const match = text.match(/\{[\s\S]*\}/);
  let question = "";
  if (match) {
    try {
      const obj = JSON.parse(match[0]);
      question = obj.question ?? "";
    } catch {
      question = text;
    }
  } else {
    question = text;
  }

  return Response.json({
    question,
    checkpointId,
    topicId: found.topic.id,
    topicTitle: found.topic.title,
    checkpointName: found.checkpoint.name,
  });
}
