import { saveToGit, loadFromGit } from "@/lib/data/repo-storage";
import type { QuestionItem } from "@/lib/storage";
import type { ServerQuestionProgress } from "@/lib/notify/progress";

/** 每日推送/展示的题目数量（企业微信 8 点推送与网页总览共用） */
export const PUSH_COUNT = 10;

/**
 * 每日题目集合：每天挑选一批，同时用于企业微信 8 点推送和网页总览页。
 */
export interface DailySet {
  date: string;
  questions: QuestionItem[];
  summary?: string;
  sentAt?: number;
}

export function localDateStr(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 优先级：gap > unknown > learning > mastered，越久未复习越靠前。
 * 叠加少量随机抖动，避免分数接近的题目每天以固定顺序霸榜。
 */
export function pickDailyQuestions(
  questions: QuestionItem[],
  progress: ServerQuestionProgress,
): QuestionItem[] {
  const score = (q: QuestionItem) => {
    const p = progress[q.id];
    const status = p?.status ?? "unknown";
    const w = status === "gap" ? 0 : status === "unknown" ? 1 : status === "learning" ? 2 : 3;
    const lastReviewed = p?.lastReviewedAt ?? 0;
    const stale = Math.min(
      (Date.now() - lastReviewed) / (1000 * 60 * 60 * 24),
      30,
    );
    return w * 10 - stale / 3;
  };
  return questions
    .map((q) => ({ q, s: score(q) + Math.random() * 0.8 }))
    .sort((a, b) => a.s - b.s)
    .slice(0, PUSH_COUNT)
    .map((x) => x.q);
}

export async function ensureDailySet(
  questions: QuestionItem[],
  progress: ServerQuestionProgress,
): Promise<DailySet> {
  const today = localDateStr();
  const existing = await loadFromGit<DailySet>("daily-questions", null as unknown as DailySet);
  if (existing && existing.date === today && existing.questions?.length) {
    return existing;
  }
  // 轮换：把上一天集合里的题目往后排，保证每日题目有更新
  const prevIds = new Set(
    existing && existing.date !== today ? (existing.questions ?? []).map((q) => q.id) : [],
  );
  const pool = questions.filter((q) => !prevIds.has(q.id));
  const source = pool.length >= PUSH_COUNT ? pool : questions;
  const set: DailySet = {
    date: today,
    summary: "",
    questions: pickDailyQuestions(source, progress),
  };
  await saveToGit("daily-questions", set);
  return set;
}

export async function markDailySetSent(set: DailySet): Promise<DailySet> {
  const next = { ...set, sentAt: Date.now() };
  await saveToGit("daily-questions", next);
  return next;
}
