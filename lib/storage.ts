"use client";

import type { MasteryStatus } from "@/lib/knowledge";
import type { QuizEvaluation } from "@/app/api/quiz/evaluate/route";
import type { Scorecard } from "@/app/api/interview/scorecard/route";

const KEY_PROGRESS = "ai-infra-tutor:progress:v1";
const KEY_QUESTION_PROGRESS = "ai-infra-tutor:question-progress:v1";
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

// ---------------- Question Bank Progress ----------------

export interface QuestionProgress {
  status: MasteryStatus;
  lastReviewedAt?: number;
  attempts: number;
  lastScore?: number;
}

export type QuestionProgressMap = Record<string, QuestionProgress>;

export function loadQuestionProgress(): QuestionProgressMap {
  return safeGet<QuestionProgressMap>(KEY_QUESTION_PROGRESS, {});
}

export function saveQuestionProgress(progress: QuestionProgressMap) {
  safeSet(KEY_QUESTION_PROGRESS, progress);
}

export function getQuestionProgress(questionId: string): QuestionProgress {
  const p = loadQuestionProgress();
  return p[questionId] ?? { status: "unknown", attempts: 0 };
}

export function recordQuestionQuizResult(questionId: string, score: number) {
  const p = loadQuestionProgress();
  const cur = p[questionId] ?? { status: "unknown", attempts: 0 };
  let status: MasteryStatus;
  if (score >= 85) status = "mastered";
  else if (score >= 60) status = "learning";
  else status = "gap";
  p[questionId] = {
    status,
    attempts: cur.attempts + 1,
    lastScore: score,
    lastReviewedAt: Date.now(),
  };
  saveQuestionProgress(p);
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

// ---------------- Question Bank ----------------

export const KEY_QUESTION_BANK = "ai-infra-tutor:question-bank:v1";

export interface QuestionItem {
  id: string;
  category: string;
  topicId?: string; // 关联的 topic ID，可选
  question: { zh: string; en: string };
  answer: { zh: string; en: string };
  createdAt: number;
  updatedAt: number;
}

export function loadQuestions(): QuestionItem[] {
  return safeGet<QuestionItem[]>(KEY_QUESTION_BANK, []);
}

export function saveQuestions(items: QuestionItem[]) {
  safeSet(KEY_QUESTION_BANK, items);
}

export function addQuestion(
  item: Omit<QuestionItem, "id" | "createdAt" | "updatedAt">,
): QuestionItem {
  const list = loadQuestions();
  const now = Date.now();
  const newItem: QuestionItem = {
    ...item,
    id: `q-${now}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now,
    updatedAt: now,
  };
  list.unshift(newItem);
  saveQuestions(list);
  syncQuestionsToServer(); // persist to server
  return newItem;
}

export function updateQuestion(
  id: string,
  updates: Partial<Omit<QuestionItem, "id" | "createdAt">>,
): boolean {
  const list = loadQuestions();
  const idx = list.findIndex((q) => q.id === id);
  if (idx < 0) return false;
  list[idx] = { ...list[idx], ...updates, updatedAt: Date.now() };
  saveQuestions(list);
  syncQuestionsToServer(); // persist to server
  return true;
}

export function deleteQuestion(id: string): boolean {
  const list = loadQuestions();
  const filtered = list.filter((q) => q.id !== id);
  if (filtered.length === list.length) return false;
  saveQuestions(filtered);
  syncQuestionsToServer(); // persist to server
  return true;
}

/** 保存（创建或覆盖）一个指定 ID 的题目，用于知识库题目首次编辑保存 */
export function saveQuestionItem(item: QuestionItem) {
  const list = loadQuestions();
  const idx = list.findIndex((q) => q.id === item.id);
  if (idx >= 0) {
    list[idx] = { ...item, updatedAt: Date.now() };
  } else {
    list.unshift({ ...item });
  }
  saveQuestions(list);
  syncQuestionsToServer(); // persist to server
}

export function getCategories(): string[] {
  const qs = loadQuestions();
  return [...new Set(qs.map((q) => q.category))].sort();
}

// ---------------- Server sync (question bank) ----------------

const API_DOMAIN_QB = "question-bank";

/** 将当前题库同步到服务端（fire-and-forget，但会检查响应和记录错误） */
export function syncQuestionsToServer(): void {
  const questions = loadQuestions();
  fetch(`/api/data/${API_DOMAIN_QB}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(questions),
  })
    .then((res) => {
      if (!res.ok) {
        console.error(
          `[syncQuestions] Server returned ${res.status} ${res.statusText}`,
        );
      } else {
        console.log(
          `[syncQuestions] Synced ${questions.length} questions to server`,
        );
      }
    })
    .catch((err) => {
      console.error("[syncQuestions] Network error syncing to server:", err);
    });
}

/** 优先从服务端加载题库，服务端不可用时回退到 localStorage */
export async function loadQuestionsFromServer(): Promise<void> {
  try {
    const res = await fetch(`/api/data/${API_DOMAIN_QB}`);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json) && json.length > 0) {
        console.log(
          `[loadQuestions] Loaded ${json.length} questions from server`,
        );
        saveQuestions(json);
        return;
      } else {
        console.log(
          `[loadQuestions] Server returned empty data, keeping localStorage`,
          Array.isArray(json) ? "(empty array)" : "(no data)",
        );
      }
    } else {
      console.error(
        `[loadQuestions] Server returned ${res.status}`,
      );
    }
  } catch (err) {
    console.error("[loadQuestions] Network error loading from server:", err);
  }
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
  const questionProgress = loadQuestionProgress();
  const questions = loadQuestions();

  return ALL_TOPICS.map((t) => {
    const stat: TopicStat = {
      topicId: t.id,
      total: t.checkpoints.length,
      mastered: 0,
      learning: 0,
      gap: 0,
      unknown: 0,
    };

    // Count checkpoint progress
    for (const cp of t.checkpoints) {
      const s = progress[cp.id]?.status ?? "unknown";
      stat[s]++;
    }

    // Count question bank progress for this topic
    const topicQuestions = questions.filter((q) => q.topicId === t.id);
    stat.total += topicQuestions.length;
    for (const q of topicQuestions) {
      const s = questionProgress[q.id]?.status ?? "unknown";
      stat[s]++;
    }

    return stat;
  });
}
