"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { ChatPanel } from "@/components/ChatPanel";
import { AnswerResult } from "@/components/quiz/AnswerResult";
import {
  loadQuestionProgress,
  pushQuizHistory,
  recordQuestionQuizResult,
  addFavorite,
  removeFavorite,
  loadFavorites,
} from "@/lib/storage";
import { Star } from "lucide-react";
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

/** 单道题的作答状态 */
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

const KEY_DAILY_STATE = "ai-infra-tutor:daily-answer-state:v2";

interface PersistShape {
  states: Record<string, QAnswerState>;
  openIds: string[];
  savedAt: number;
}

/**
 * 客户端导航期间也存活的全局记忆：
 * - SPA 内切页不丢（memStore 常驻）
 * - 刷新/关页后从 localStorage 恢复
 * - 批改请求在后台完成时，即使页面已切走，结果也写入 memStore，返回后可见
 */
let memStore: PersistShape | null = null;

function readPersist(): PersistShape {
  if (!memStore) {
    let shape: PersistShape = { states: {}, openIds: [], savedAt: 0 };
    try {
      shape =
        (JSON.parse(window.localStorage.getItem(KEY_DAILY_STATE) ?? "null") as PersistShape) ??
        shape;
    } catch {}
    memStore = shape;
  }
  return memStore;
}

function writePersist(shape: PersistShape): void {
  memStore = shape;
  try {
    window.localStorage.setItem(KEY_DAILY_STATE, JSON.stringify(shape));
  } catch {}
}

export default function HomePage() {
  const [daily, setDaily] = useState<DailySet | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [states, setStates] = useState<Record<string, QAnswerState>>({});
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [restored, setRestored] = useState(false);

  // 恢复：优先模块级记忆（同一次会话内切页），否则用 localStorage（冷启动/刷新）
  useEffect(() => {
    const fromMem = memStore !== null;
    const shape = readPersist();
    const clean: Record<string, QAnswerState> = {};
    for (const [id, s] of Object.entries(shape.states ?? {})) {
      clean[id] = {
        ...emptyState(),
        ...s,
        // 冷启动（刷新）时不要恢复悬挂的"批改中"状态；SPA 内切页返回则保留（请求可能仍在后台）
        grading: fromMem ? !!s.grading : false,
        savingStandard: false,
      };
    }
    setStates(clean);
    setOpenIds((shape.openIds ?? []).filter(Boolean));
    setRestored(true);
    loadFavorites().then(setFavorites);
  }, []);

  // 状态变化即持久化
  useEffect(() => {
    if (!restored) return;
    writePersist({ states, openIds, savedAt: Date.now() });
  }, [restored, states, openIds]);

  // 统一提交入口：同时写 memStore（切页存活）和 React state
  const commitStates = useCallback(
    (updater: (prev: Record<string, QAnswerState>) => Record<string, QAnswerState>) => {
      const shape = readPersist();
      const next = updater(shape.states ?? {});
      memStore = { ...shape, states: next, savedAt: Date.now() };
      setStates(next);
    },
    [],
  );

  const commitOpenIds = useCallback((updater: (prev: string[]) => string[]) => {
    const shape = readPersist();
    const next = updater(shape.openIds ?? []);
    memStore = { ...shape, openIds: next, savedAt: Date.now() };
    setOpenIds(next);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/daily");
        const data = (await res.json()) as DailySet;
        setDaily(data);
        if (data.error) setLoadError(data.error);
        const ids = new Set((data.questions ?? []).map((q) => q.id));
        // 清掉不属于今日的旧状态
        commitStates((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([id]) => ids.has(id))),
        );
        commitOpenIds((prev) => prev.filter((id) => ids.has(id)));
      } catch (e) {
        setLoadError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [commitStates, commitOpenIds]);

  function toggleOpen(id: string) {
    commitOpenIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const contextId = openIds[openIds.length - 1];
  const contextQuestion = daily?.questions.find((q) => q.id === contextId);

  /** 提交作答：AI 批改在后台进行，切页也不丢结果 */
  const submitAnswer = useCallback(
    (q: DailyQuestion) => {
      const prev = readPersist().states ?? {};
      const s = { ...emptyState(), ...prev[q.id] };
      const a = s.draft.trim();
      if (!a || s.grading) return;
      commitStates((p) => ({
        ...p,
        [q.id]: { ...emptyState(), ...p[q.id], grading: true, error: "" },
      }));
      (async () => {
        try {
          const res = await fetch("/api/quiz/evaluate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              checkpointId: `bank-${q.id}`,
              question: q.question.zh || q.question.en,
              answer: a,
              referenceAnswer: q.answer.zh || "",
            }),
          });
          if (!res.ok)
            throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
          const ev = (await res.json()) as QuizEvaluation;
          commitStates((p) => {
            const cur = { ...emptyState(), ...p[q.id] };
            return {
              ...p,
              [q.id]: {
                ...cur,
                grading: false,
                evaluation: ev,
                attempts: [...cur.attempts, a],
                draft: "",
              },
            };
          });
          recordQuestionQuizResult(
            q.id,
            ev.score,
            (q.question.zh || q.question.en).slice(0, 60),
          );
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
          commitStates((p) => ({
            ...p,
            [q.id]: {
              ...emptyState(),
              ...p[q.id],
              grading: false,
              error: (e as Error).message,
            },
          }));
        }
      })();
    },
    [commitStates],
  );

  /** 把我的本次答案保存为标准答案（写入笔记库 question.md） */
  const saveStandard = useCallback(
    async (q: DailyQuestion, text: string): Promise<boolean> => {
      const prev = readPersist().states ?? {};
      const s = { ...emptyState(), ...prev[q.id] };
      if (s.savingStandard) return false;
      commitStates((p) => ({
        ...p,
        [q.id]: { ...emptyState(), ...p[q.id], savingStandard: true },
      }));
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
        if (!res.ok)
          throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
        commitStates((p) => ({
          ...p,
          [q.id]: { ...emptyState(), ...p[q.id], savingStandard: false, savedStandard: true },
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
        commitStates((p) => ({
          ...p,
          [q.id]: { ...emptyState(), ...p[q.id], savingStandard: false },
        }));
        return false;
      }
    },
    [commitStates],
  );

  const patchDraft = useCallback(
    (id: string, v: string) => {
      commitStates((p) => ({ ...p, [id]: { ...emptyState(), ...p[id], draft: v } }));
    },
    [commitStates],
  );

  const toggleFavorite = useCallback(
    (id: string, label: string) => {
      const isFav = favorites.has(id);
      const updater = isFav ? removeFavorite : addFavorite;
      // 乐观更新
      setFavorites((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(id);
        else next.add(id);
        return next;
      });
      updater(id, label).then((ok) => {
        if (!ok) {
          setFavorites((prev) => {
            const next = new Set(prev);
            if (isFav) next.add(id);
            else next.delete(id);
            return next;
          });
        }
      });
    },
    [favorites],
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
          与每天早上企业微信推送的题目同步。点击题目展开答题卡片，提交后自动对比标准答案；AI 批改在后台进行，切页不丢结果。
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
                    favorited={favorites.has(q.id)}
                    onToggleFavorite={() =>
                      toggleFavorite(q.id, (q.question.zh || q.question.en).slice(0, 60))
                    }
                  />
                  {openIds.includes(q.id) && (
                    <div className="md:col-span-2">
                      <AnswerPanel
                        q={q}
                        state={states[q.id] ?? emptyState()}
                        onDraft={(v) => patchDraft(q.id, v)}
                        onSubmit={() => submitAnswer(q)}
                        onSaveStandard={(t) => saveStandard(q, t)}
                        onRetry={() =>
                          commitStates((p) => ({
                            ...p,
                            [q.id]: { ...emptyState(), ...p[q.id], evaluation: null },
                          }))
                        }
                        onClose={() =>
                          commitOpenIds((prev) => prev.filter((x) => x !== q.id))
                        }
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
  favorited,
  onToggleFavorite,
}: {
  q: DailyQuestion;
  open: boolean;
  onToggle: () => void;
  state: QAnswerState;
  favorited: boolean;
  onToggleFavorite: () => void;
}) {
  const progress = loadQuestionProgress();
  const p = progress[q.id];
  const isOther = q.category === "其他";
  const hasResult = !!state.evaluation || state.grading;

  return (
    <div
      onClick={onToggle}
      className={`text-left border rounded-xl p-4 transition bg-white dark:bg-zinc-900 hover:border-blue-400 dark:hover:border-blue-600 cursor-pointer relative ${
        open ? "border-blue-500 ring-2 ring-blue-500/30" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        title={favorited ? "取消收藏（错题本）" : "加入收藏/错题本"}
        className="absolute top-3 right-3 p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <Star
          className={`w-4 h-4 ${favorited ? "text-amber-400 fill-amber-400" : "text-zinc-300 dark:text-zinc-600"}`}
        />
      </button>
      <div className="flex items-center gap-2 mb-2 pr-6">
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
        {state.grading && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
        {!state.grading && hasResult && !open && (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        )}
      </div>
      <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100 line-clamp-3">
        {q.question.zh || q.question.en}
      </div>
      <div className="mt-2 text-xs text-zinc-400 flex items-center gap-2">
        {favorited && <span className="text-amber-500">★ 错题本</span>}
        {q.answer.zh ? "有标准答案" : "暂无标准答案"}
        {state.attempts.length > 0 && (
          <span className="text-blue-500">已答 {state.attempts.length} 次</span>
        )}
      </div>
    </div>
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
            AI 批改中… 可以切换页面或去回答其他题目，批改完成后这张卡片会自动更新。
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
