import { loadFromGit, saveToGit } from "@/lib/data/repo-storage";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 收藏/错题本。
 *
 * 规则：
 * - 某题作答分数 < 60 时自动加入收藏（错题复习惯）
 * - 其余情况由用户在题目旁手动点收藏按钮加入，再点取消
 *
 * GET  /api/favorites             -> 全部收藏 id（Set 形式的数组，按收藏时间倒序）
 * POST /api/favorites             -> body {questionId, auto?}：加入收藏
 * DELETE /api/favorites?id=<qid>  -> 取消收藏
 */

export interface FavoriteEntry {
  questionId: string;
  favoritedAt: number;
  /** true = 分数不达标自动加入 */
  auto?: boolean;
  /** 加入时的分数（若有） */
  score?: number;
  /** 备注（题目摘要，便于展示） */
  label?: string;
}

export async function GET() {
  const list = await loadFromGit<FavoriteEntry[]>("favorites", []);
  return Response.json(list);
}

function mergeAndSave(
  list: FavoriteEntry[],
  entry: FavoriteEntry,
): Promise<void> {
  const next = [entry, ...list.filter((f) => f.questionId !== entry.questionId)];
  return saveToGit("favorites", next);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<FavoriteEntry>;
    if (!body.questionId) {
      return Response.json({ error: "questionId required" }, { status: 400 });
    }
    const list = await loadFromGit<FavoriteEntry[]>("favorites", []);
    const existing = list.find((f) => f.questionId === body.questionId);
    if (existing) {
      return Response.json({ ok: true, already: true });
    }
    await mergeAndSave(list, {
      questionId: body.questionId,
      favoritedAt: Date.now(),
      auto: !!body.auto,
      score: body.score,
      label: body.label,
    });
    return Response.json({ ok: true, already: false });
  } catch (err) {
    console.error("[favorites] POST failed:", err);
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const list = await loadFromGit<FavoriteEntry[]>("favorites", []);
  const next = list.filter((f) => f.questionId !== id);
  if (next.length === list.length) {
    return Response.json({ ok: true, already: true });
  }
  await saveToGit("favorites", next);
  return Response.json({ ok: true });
}
