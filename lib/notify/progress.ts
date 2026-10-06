import { loadFromGit } from "@/lib/data/repo-storage";

/**
 * 题目掌握度数据存在浏览器 localStorage，服务端读不到。
 * 浏览器端会定期通过 PUT /api/data/question-progress 上报，这里读该数据。
 * 若从未上报过，返回空 Map（每日推送会按"全部未掌握"处理）。
 */
export type ServerQuestionProgress = Record<
  string,
  { status: "mastered" | "learning" | "gap" | "unknown"; lastReviewedAt?: number; attempts?: number }
>;

export async function loadQuestionProgressSafe(): Promise<ServerQuestionProgress> {
  try {
    return await loadFromGit<ServerQuestionProgress>("question-progress", {});
  } catch {
    return {};
  }
}
