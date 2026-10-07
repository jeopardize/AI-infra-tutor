import { loadFromGit, saveToGit } from "@/lib/data/repo-storage";

export const runtime = "nodejs";

export interface FeedbackItem {
  id: string;
  content: string;
  createdAt: number;
  status: "open" | "done";
  processedAt?: number;
  note?: string;
}

export async function GET() {
  const items = await loadFromGit<FeedbackItem[]>("feedback", []);
  return Response.json({ items });
}

export async function POST(req: Request) {
  const action = new URL(req.url).searchParams.get("action");

  // action=clear-done：清掉全部已处理反馈（总结已沉淀在版本提交记录里）
  if (action === "clear-done") {
    const items = await loadFromGit<FeedbackItem[]>("feedback", []);
    const done = items.filter((it) => it.status === "done");
    if (done.length === 0) {
      return Response.json({ ok: true, cleared: 0 });
    }
    await saveToGit<FeedbackItem[]>(
      "feedback",
      items.filter((it) => it.status !== "done"),
    );
    return Response.json({ ok: true, cleared: done.length });
  }

  // 默认：提交一条新反馈
  let body: { content?: string };
  try {
    body = (await req.json()) as { content?: string };
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const content = body.content?.trim();
  if (!content) {
    return Response.json({ error: "content required" }, { status: 400 });
  }
  const items = await loadFromGit<FeedbackItem[]>("feedback", []);
  const item: FeedbackItem = {
    id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    content,
    createdAt: Date.now(),
    status: "open",
  };
  items.push(item);
  await saveToGit<FeedbackItem[]>("feedback", items);
  return Response.json({ item });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const items = await loadFromGit<FeedbackItem[]>("feedback", []);
  const next = items.filter((it) => it.id !== id);
  if (next.length === items.length) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  await saveToGit<FeedbackItem[]>("feedback", next);
  return Response.json({ ok: true });
}
