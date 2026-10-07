"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { ChatPanel } from "@/components/ChatPanel";
import { AnswerResult } from "@/components/quiz/AnswerResult";
import {
  loadQuestionProgress,
  pushQuizHistory,
  recordQuestionQuizResult,
} from "@/lib/storage";
import type { QuestionItem } from "@/lib/storage";
import type { QuizEvaluation } from "@/app/api/quiz/evaluate/route";
import {
  CalendarDays,
  CheckCircle2,
  Loader2,
  ListChecks,
  Send,
  Sparkles,
  X,
} from "lucide-react";

type DailyQuestion = QuestionItem & { file?: string };

interface DailySet {
  date: string;
  questions: DailyQuestion[];
  summary?: string;
  sentAt?: number;
  error?: string;
  emptyReason?: string;
}

/** 单道题的作答状态（跨页面持久化） */
interface QAnswerState {
  draft: string;
  attempts: string[];
  grading: boolean;
  evaluation: QuizEvaluation | null;
  savedStandard: boolean;
  savingStandard: boolean;
  error: string;
}

const emptyState = (): QAnswerState => ({
  draft: "",
  attempts: [],
  grading: false,
  evaluation: null,
  savedStandard: false,
  savingStandard: false,
  error: "",
});

const KEY_DAILY_STATE = "ai-infra-tutor:daily-answer-state:v1";

interface PersistShape {
  states: Record<string, QAnswerState>;
  openIds: string[];
  savedAt: number;
}

export default function HomePage() {
  const [daily, setDaily] = useState<DailySet | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [states, setStates] = useState<Record<string, QAnswerState>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/daily");
        const data = (await res.json()) as DailySet;
        setDaily(data);
        if (data.error) setLoadError(data.error);
        if (data.questions?.length) {
          const ids = new Set(data.questions.map((q) => q.id));
          let saved: PersistShape | null = null;
          try {
            saved = JSON.parse(window.localStorage.getItem(KEY_DAILY_STATE) ?? "null");
          } catch {}
          // 只保留属于今日题目的状态（跨页面/刷新恢复）
          if (saved?.states) {
            const kept = Object.fromEntries(
              Object.entries(saved.states).filter(([id]) => ids.has(id)),
            );
            for (const id of Object.keys(kept)) {
              kept[id] = { ...emptyState(), ...kept[id], grading: false, savingStandard: false };
            }
            setStates(kept);
            setOpenIds((saved.openIds ?? []).filter((id) => ids.has(id)));
          }
        }
      } catch (e) {
        setLoadError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 状态变化即持久化（跨页面/刷新恢复）
  useEffect(() => {
    try {
      const shape: PersistShape = { states, openIds, savedAt: Date.now() };
      window.localStorage.setItem(KEY_DAILY_STATE, JSON.stringify(shape));
    } catch {}
  }, [states, openIds]);

  const patchState = useCallback((id: string, patch: Partial<QAnswerState>) => {
    setStates((prev) => ({ ...prev, [id]: { ...emptyState(), ...prev[id], ...patch } }));
  }, []);

  function toggleOpen(id: string) {
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const contextId = openIds[openIds.length - 1];
  const contextQuestion = daily?.questions.find((q) => q.id === contextId);

  /** 提交作答：AI 批改在后台进行，不阻塞其他题目 */
  const submitAnswer = useCallback(
    async (q: DailyQuestion) => {
      const s = states[q.id] ?? emptyState();
      const a = s.draft.trim();
      if (!a || s.grading) return;
      patchState(q.id, { grading: true, error: "" });
      const standard = q.answer.zh || "";
      try {
        const res = await fetch("/api/quiz/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkpointId: `bank-${q.id}`,
            question: q.question.zh || q.question.en,
            answer: a,
            referenceAnswer: standard,
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
        const ev = (await res.json()) as QuizEvaluation;
        setStates((prev) => {
          const cur = { ...emptyState(), ...prev[q.id] };
          return {
            ...prev,
            [q.id]: {
              ...cur,
              grading: false,
              evaluation: ev,
              attempts: [...cur.attempts, a],
              draft: "",
            },
          };
        });
        recordQuestionQuizResult(q.id, ev.score);
        pushQuizHistory({
          questionId: q.id,
          topicId: q.topicId,
          category: q.category,
          source: "bank",
          question: q.question.zh || q.question.en,
          answer: a,
          evaluation: ev,
          at: Date.now(),
        });
      } catch (e) {
        patchState(q.id, { grading: false, error: (e as Error).message });
      }
    },
    [states, patchState],
  );

  /** 把我的本次答案保存为标准答案（写入笔记库 question.md） */
  const saveStandard = useCallback(
    async (q: DailyQuestion, text: string): Promise<boolean> => {
      const s = states[q.id] ?? emptyState();
      if (s.savingStandard) return false;
      patchState(q.id, { savingStandard: true });
      try {
        const res = await fetch("/api/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: q.id,
            topicId: q.topicId,
            category: q.category,
            question: q.question,
            answer: { zh: text, en: q.answer.en },
            createdAt: q.createdAt,
            prevFile: q.file,
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
        setStates((prev) => ({
          ...prev,
          [q.id]: { ...emptyState(), ...prev[q.id], savingStandard: false, savedStandard: true },
        }));
        // 同步更新页面上的标准答案展示
        setDaily((d) =>
          d
            ? {
                ...d,
                questions: d.questions.map((x) =>
                  x.id === q.id ? { ...x, answer: { ...x.answer, zh: text } } : x,
                ),
              }
            : d,
        );
        return true;
      } catch (e) {
        alert(`保存失败：${(e as Error).message}`);
        patchState(q.id, { savingStandard: false });
        return false;
      }
    },
    [states, patchState],
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold">每日题目</h1>
          {daily?.date && (
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <CalendarDays className="w-3.5 h-3.5" />
              {daily.date}
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          与每天早上企业微信推送的题目同步。点击题目展开答题卡片，提交后自动对比标准答案；AI 批改在后台进行，可以同时作答多题。
        </p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="min-w-0 space-y-5">
          {loading ? (
            <div className="p-10 text-center text-zinc-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> 正在加载今日题目…
            </div>
          ) : loadError ? (
            <div className="p-8 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 text-sm">
              加载失败：{loadError}
            </div>
          ) : !daily || daily.questions.length === 0 ? (
            <div className="p-10 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 text-center text-zinc-400">
              <ListChecks className="w-8 h-8 mx-auto mb-2" />
              <p>今日暂无题目</p>
              <p className="text-xs mt-1">{daily?.emptyReason ?? "先去题库页面添加题目吧"}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
              {daily.questions.map((q) => (
                <Fragment key={q.id}>
                  <QuestionCard
                    q={q}
                    open={openIds.includes(q.id)}
                    onToggle={() => toggleOpen(q.id)}
                    state={states[q.id] ?? emptyState()}
                  />
                  {openIds.includes(q.id) && (
                    <div className="md:col-span-2">
                      <AnswerPanel
                        q={q}
                        state={states[q.id] ?? emptyState()}
                        onDraft={(v) => patchState(q.id, { draft: v })}
                        onSubmit={() => submitAnswer(q)}
                        onSaveStandard={(t) => saveStandard(q, t)}
                        onRetry={() => patchState(q.id, { evaluation: null })}
                        onClose={() => setOpenIds((prev) => prev.filter((x) => x !== q.id))}
                      />
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          )}

          {daily?.summary ? (
            <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-5">
              <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-600" /> 笔记缺失点总结
              </h2>
              <Markdown>{daily.summary}</Markdown>
            </section>
          ) : null}
        </div>

        {/* AI 问答 */}
        <aside className="h-[560px] lg:sticky lg:top-20">
          <ChatPanel
            hint="AI 问答：可结合当前题目提问，例如“这题考察什么？”、“给我一个答题思路”"
            placeholder="问任何 AI Infra 相关的问题…"
            context={
              contextQuestion
                ? `当前正在作答的题目：${contextQuestion.question.zh || contextQuestion.question.en}`
                : undefined
            }
          />
        </aside>
      </div>
    </div>
  );
}

function QuestionCard({
  q,
  open,
  onToggle,
  state,
}: {
  q: DailyQuestion;
  open: boolean;
  onToggle: () => void;
  state: QAnswerState;
}) {
  const progress = loadQuestionProgress();
  const p = progress[q.id];
  const isOther = q.category === "其他";
  const hasResult = !!state.evaluation;
  const loadingBadge = state.grading;

  return (
    <button
      onClick={onToggle}
      className={`text-left border rounded-xl p-4 transition bg-white dark:bg-zinc-900 hover:border-blue-400 dark:hover:border-blue-600 focus:outline-none relative ${
        open ? "border-blue-500 ring-2 ring-blue-500/30" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
            isOther
              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
              : "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
          }`}
        >
          {q.category}
        </span>
        {p?.status === "mastered" && "✅"}
        {p?.status === "learning" && "🟡"}
        {p?.status === "gap" && "🔴"}
        {loadingBadge && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
        {!loadingBadge && hasResult && !open && (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        )}
      </div>
      <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100 line-clamp-3">
        {q.question.zh || q.question.en}
      </div>
      <div className="mt-2 text-xs text-zinc-400 flex items-center gap-2">
        {q.answer.zh ? "有标准答案" : "暂无标准答案"}
        {state.attempts.length > 0 && (
          <span className="text-blue-500">已答 {state.attempts.length} 次</span>
        )}
      </div>
    </button>
  );
}

function AnswerPanel({
  q,
  state,
  onDraft,
  onSubmit,
  onSaveStandard,
  onRetry,
  onClose,
}: {
  q: DailyQuestion;
  state: QAnswerState;
  onDraft: (v: string) => void;
  onSubmit: () => void;
  onSaveStandard: (t: string) => Promise<boolean>;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
      {/* 题面头 */}
      <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium">
            {q.category}
          </span>
          <button
            onClick={onClose}
            className="ml-auto text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1"
            title="收起答题卡片"
          >
            <X className="w-3.5 h-3.5" /> 收起
          </button>
        </div>
        <Markdown>{q.question.zh || q.question.en}</Markdown>
      </div>

      <div className="p-5 space-y-4">
        {state.grading && (
          <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 rounded-md px-3 py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            AI 批改中… 可以先去回答其他题目，批改完成后这张卡片会自动更新。
          </div>
        )}

        {!state.evaluation && !state.grading && (
          <div>
            <textarea
              value={state.draft}
              onChange={(e) => onDraft(e.target.value)}
              placeholder="写下你的答案…（可以多次作答，每次提交都会与标准答案对比）"
              className="w-full min-h-[140px] p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-blue-500"
            />
            {state.error && <div className="text-xs text-rose-600 mt-1">{state.error}</div>}
            <div className="mt-2 flex justify-end">
              <button
                onClick={onSubmit}
                disabled={!state.draft.trim()}
                className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1"
              >
                <Send className="w-4 h-4" />
                提交
              </button>
            </div>
          </div>
        )}

        <AnswerResult
          attempts={state.attempts}
          standardAnswer={q.answer.zh}
          grading={state.grading}
          evaluation={state.evaluation}
          savingStandard={state.savingStandard}
          savedStandard={state.savedStandard}
          onSaveStandard={onSaveStandard}
          onRetry={onRetry}
        />
      </div>
    </section>
  );
}
