import { loadFromGit, saveToGit } from "@/lib/data/repo-storage";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 答题历史（服务端持久化到 git 数据仓库）。
 *
 * GET  /api/quiz-history  -> 返回最近半年内的历史（超期条目顺带清理）
 * POST /api/quiz-history  -> 追加一条或多条（body 为单条对象或数组），同样清理超期
 */

const RETENTION_MS = 182 * 24 * 60 * 60 * 1000; // 半年

export interface QuizHistoryEntry {
  at: number;
  source?: "checkpoint" | "bank";
  checkpointId?: string;
  topicId?: string;
  questionId?: string;
  category?: string;
  question: string;
  answer: string;
  evaluation?: {
    score: number;
    correct_points: string[];
    gaps: string[];
    misconceptions: string[];
    reference_answer: string;
    follow_up: string;
  };
}

async function pruneAndSave(list: QuizHistoryEntry[]): Promise<QuizHistoryEntry[]> {
  const cutoff = Date.now() - RETENTION_MS;
  const kept = list.filter((h) => (h.at ?? 0) >= cutoff);
  if (kept.length !== list.length) {
    console.log(`[quiz-history] pruned ${list.length - kept.length} entries older than 182 days`);
  }
  await saveToGit("quiz-history", kept);
  return kept;
}

export async function GET() {
  try {
    const list = await loadFromGit<QuizHistoryEntry[]>("quiz-history", []);
    // 读取时顺带把超期数据清掉
    const cutoff = Date.now() - RETENTION_MS;
    const kept = (list ?? []).filter((h) => (h.at ?? 0) >= cutoff);
    if (kept.length !== (list ?? []).length) {
      await saveToGit("quiz-history", kept);
    }
    return Response.json(kept);
  } catch (err) {
    console.error("[quiz-history] GET failed:", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as QuizHistoryEntry | QuizHistoryEntry[];
    const incoming = (Array.isArray(body) ? body : [body]).filter(
      (h) => h && h.question && h.answer,
    );
    const list = await loadFromGit<QuizHistoryEntry[]>("quiz-history", []);
    const merged = [...incoming, ...(list ?? [])];
    const kept = await pruneAndSave(merged);
    return Response.json({ ok: true, count: kept.length });
  } catch (err) {
    console.error("[quiz-history] POST failed:", err);
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
