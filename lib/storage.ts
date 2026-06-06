"use client";

import type { MasteryStatus } from "@/lib/knowledge";
import type { QuizEvaluation } from "@/app/api/quiz/evaluate/route";
import type { Scorecard } from "@/app/api/interview/scorecard/route";

const KEY_PROGRESS = "ai-infra-tutor:progress:v1";
const KEY_QUIZ_HISTORY = "ai-infra-tutor:quiz-history:v1";
const KEY_INTERVIEW = "ai-infra-tutor:interviews:v1";
const KEY_SETTINGS = "ai-infra-tutor:settings:v1";

export interface CheckpointProgress {
  status: MasteryStatus;
  lastReviewedAt?: number;
  attempts: number;
  lastScore?: number;
}

export type ProgressMap = Record<string, CheckpointProgress>;

export interface QuizHistoryItem {
  checkpointId: string;
  topicId: string;
  question: string;
  answer: string;
  evaluation: QuizEvaluation;
  at: number;
}

export interface InterviewSession {
  id: string;
  at: number;
  config: { level: string; focus: string[]; durationMin: number };
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  scorecard?: Scorecard;
}

function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSet<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded etc */
  }
}

// ---------------- Progress ----------------

export function loadProgress(): ProgressMap {
  return safeGet<ProgressMap>(KEY_PROGRESS, {});
}

export function saveProgress(progress: ProgressMap) {
  safeSet(KEY_PROGRESS, progress);
}

export function getCheckpointProgress(
  checkpointId: string,
): CheckpointProgress {
  const p = loadProgress();
  return p[checkpointId] ?? { status: "unknown", attempts: 0 };
}

export function setCheckpointStatus(
  checkpointId: string,
  status: MasteryStatus,
) {
  const p = loadProgress();
  const cur = p[checkpointId] ?? { status: "unknown", attempts: 0 };
  p[checkpointId] = { ...cur, status, lastReviewedAt: Date.now() };
  saveProgress(p);
}

export function recordQuizResult(checkpointId: string, score: number) {
  const p = loadProgress();
  const cur = p[checkpointId] ?? { status: "unknown", attempts: 0 };
  let status: MasteryStatus;
  if (score >= 85) status = "mastered";
  else if (score >= 60) status = "learning";
  else status = "gap";
  p[checkpointId] = {
    status,
    attempts: cur.attempts + 1,
    lastScore: score,
    lastReviewedAt: Date.now(),
  };
  saveProgress(p);
  return status;
}

// ---------------- Quiz history ----------------

export function loadQuizHistory(): QuizHistoryItem[] {
  return safeGet<QuizHistoryItem[]>(KEY_QUIZ_HISTORY, []);
}

export function pushQuizHistory(item: QuizHistoryItem) {
  const list = loadQuizHistory();
  list.unshift(item);
  safeSet(KEY_QUIZ_HISTORY, list.slice(0, 50));
}

// ---------------- Interview sessions ----------------

export function loadInterviews(): InterviewSession[] {
  return safeGet<InterviewSession[]>(KEY_INTERVIEW, []);
}

export function saveInterview(session: InterviewSession) {
  const list = loadInterviews();
  const i = list.findIndex((s) => s.id === session.id);
  if (i >= 0) list[i] = session;
  else list.unshift(session);
  // 提高上限：历史用于复盘，保留 200 条；超过会从最旧的开始淘汰
  safeSet(KEY_INTERVIEW, list.slice(0, 200));
}

export function removeInterview(id: string) {
  const list = loadInterviews();
  safeSet(
    KEY_INTERVIEW,
    list.filter((s) => s.id !== id),
  );
}

export function getInterview(id: string): InterviewSession | undefined {
  return loadInterviews().find((s) => s.id === id);
}

// ---------------- Settings ----------------

export interface AppSettings {
  /** 面试历史导出目录（相对 KNOWLEDGE_LIBRARY_PATH 根） */
  interviewExportDir: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  interviewExportDir: "模拟面试历史",
};

export function loadSettings(): AppSettings {
  const partial = safeGet<Partial<AppSettings>>(KEY_SETTINGS, {});
  return { ...DEFAULT_SETTINGS, ...partial };
}

export function saveSettings(s: AppSettings) {
  safeSet(KEY_SETTINGS, s);
}

// ---------------- Aggregate ----------------

import { ALL_TOPICS } from "@/lib/knowledge";

export interface TopicStat {
  topicId: string;
  total: number;
  mastered: number;
  learning: number;
  gap: number;
  unknown: number;
}

export function computeTopicStats(progress: ProgressMap): TopicStat[] {
  return ALL_TOPICS.map((t) => {
    const stat: TopicStat = {
      topicId: t.id,
      total: t.checkpoints.length,
      mastered: 0,
      learning: 0,
      gap: 0,
      unknown: 0,
    };
    for (const cp of t.checkpoints) {
      const s = progress[cp.id]?.status ?? "unknown";
      stat[s]++;
    }
    return stat;
  });
}
