import { getClient, pickModel, type Mode } from "@/lib/claude/client";
import {
  checkpointContextBlock,
  interviewSystem,
  systemWithCache,
  topicContextBlock,
  tutorSystemPrompt,
} from "@/lib/claude/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatBody {
  messages: ChatMessage[];
  /** "learn" => 学习答疑； "interview" => 模拟面试 */
  mode: "learn" | "interview";
  speed?: Mode;
  /** learn 模式下当前的 topic / checkpoint */
  topicId?: string;
  checkpointId?: string;
  /** interview 模式参数 */
  interview?: { level: string; focus: string[]; durationMin: number };
}

export async function POST(req: Request) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  if (!body.messages || body.messages.length === 0) {
    return new Response("messages required", { status: 400 });
  }

  let systemText: string;
  if (body.mode === "interview") {
    if (!body.interview) {
      return new Response("interview opts required", { status: 400 });
    }
    systemText = interviewSystem(body.interview);
  } else {
    const parts: string[] = [tutorSystemPrompt()];
    if (body.topicId) {
      parts.push("\n---\n【当前学习上下文】\n" + topicContextBlock(body.topicId));
    }
    if (body.checkpointId) {
      parts.push(
        "\n---\n【当前 checkpoint 详情】\n" +
          checkpointContextBlock(body.checkpointId),
      );
    }
    systemText = parts.join("\n");
  }

  let client;
  try {
    client = getClient();
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const sdkStream = client.messages.stream({
          model: pickModel(body.speed),
          max_tokens: 2048,
          system: systemWithCache(systemText),
          messages: body.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        });

        for await (const event of sdkStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (e) {
        const msg = `\n\n[error] ${(e as Error).message}`;
        controller.enqueue(encoder.encode(msg));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
