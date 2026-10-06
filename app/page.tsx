"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { ChatPanel } from "@/components/ChatPanel";
import { AnswerResult } from "@/components/quiz/AnswerResult";
import { loadQuestionProgress, recordQuestionQuizResult } from "@/lib/storage";
import type { QuestionItem } from "@/lib/storage";
import type { QuizEvaluation } from "@/app/api/quiz/evaluate/route";
import { CalendarDays, ChevronUp, Loader2, ListChecks, Send, Sparkles } from "lucide-react";

type DailyQuestion = QuestionItem & { file?: string };

interface DailySet {
  date: string;
  questions: DailyQuestion[];
  summary?: string;
  sentAt?: number;
  error?: string;
  emptyReason?: string;
}

export default function HomePage() {
  const [daily, setDaily] = useState<DailySet | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/daily");
        const data = (await res.json()) as DailySet;
        setDaily(data);
        if (data.error) setLoadError(data.error);
      } catch (e) {
        setLoadError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const activeQuestion = daily?.questions.find((q) => q.id === activeId) ?? null;

  function pickForAnswer(q: QuestionItem) {
    setActiveId(q.id);
    setTimeout(() => workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold">每日企业微信题目</h1>
          {daily?.date && (
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <CalendarDays className="w-3.5 h-3.5" />
              {daily.date}
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          与每天 9 点企业微信推送的题目同步。点击题目作答，提交后自动对比标准答案并获得 AI 解析。
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
            <DailyQuestionCards
              questions={daily.questions}
              activeId={activeId}
              onPick={pickForAnswer}
            />
          )}

          {/* 答题工作区 */}
          <div ref={workspaceRef} className="scroll-mt-20">
            {activeQuestion && (
              <AnswerWorkspace
                key={activeQuestion.id}
                question={activeQuestion}
                onStandardUpdated={(zh) => {
                  setDaily((d) =>
                    d
                      ? {
                          ...d,
                          questions: d.questions.map((q) =>
                            q.id === activeQuestion.id ? { ...q, answer: { ...q.answer, zh } } : q,
                          ),
                        }
                      : d,
                  );
                }}
              />
            )}
          </div>

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
            context={activeQuestion ? `当前正在作答的题目：${activeQuestion.question.zh || activeQuestion.question.en}` : undefined}
          />
        </aside>
      </div>
    </div>
  );
}

function DailyQuestionCards({
  questions,
  activeId,
  onPick,
}: {
  questions: DailyQuestion[];
  activeId: string | null;
  onPick: (q: DailyQuestion) => void;
}) {
  const progress = loadQuestionProgress();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {questions.map((q, i) => {
        const p = progress[q.id];
        const isOther = q.category === "其他";
        return (
          <button
            key={q.id}
            onClick={() => onPick(q)}
            className={`text-left border rounded-xl p-4 transition bg-white dark:bg-zinc-900 hover:border-blue-400 dark:hover:border-blue-600 focus:outline-none ${
              activeId === q.id ? "border-blue-500 ring-2 ring-blue-500/30" : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                isOther
                  ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                  : "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
              }`}>
                {q.category}
              </span>
              {p?.status === "mastered" && "✅"}
              {p?.status === "learning" && "🟡"}
              {p?.status === "gap" && "🔴"}
              {i === 0 && <span className="text-[10px] text-zinc-400">#1</span>}
            </div>
            <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100 line-clamp-3">
              {q.question.zh || q.question.en}
            </div>
            <div className="mt-2 text-xs text-zinc-400 flex items-center">
              {q.answer.zh ? "有标准答案" : "暂无标准答案"}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function AnswerWorkspace({
  question,
  onStandardUpdated,
}: {
  question: DailyQuestion;
  onStandardUpdated: (zh: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [attempts, setAttempts] = useState<string[]>([]);
  const [grading, setGrading] = useState(false);
  const [evaluation, setEvaluation] = useState<QuizEvaluation | null>(null);
  const [savedStandard, setSavedStandard] = useState(false);
  const [savingStandard, setSavingStandard] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  async function handleSubmit() {
    const a = draft.trim();
    if (!a || grading) return;
    setGrading(true);
    setSubmitError("");
    try {
      const standard = question.answer.zh || "";
      const res = await fetch("/api/quiz/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkpointId: `bank-${question.id}`,
          question: question.question.zh || question.question.en,
          answer: a,
          referenceAnswer: standard,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      const ev = (await res.json()) as QuizEvaluation;
      setEvaluation(ev);
      setAttempts((prev) => [...prev, a]);
      setDraft("");
      recordQuestionQuizResult(question.id, ev.score);
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setGrading(false);
    }
  }

  async function handleSaveStandard(text: string): Promise<boolean> {
    setSavingStandard(true);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: question.id,
          topicId: question.topicId,
          category: question.category,
          question: question.question,
          answer: { zh: text, en: question.answer.en },
          createdAt: question.createdAt,
          prevFile: question.file,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      setSavedStandard(true);
      onStandardUpdated(text);
      return true;
    } catch (e) {
      alert(`保存失败：${(e as Error).message}`);
      return false;
    } finally {
      setSavingStandard(false);
    }
  }

  return (
    <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 overflow-hidden">
      {/* 题面头 */}
      <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium">
            {question.category}
          </span>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="ml-auto text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-0.5"
          >
            <ChevronUp className={`w-3.5 h-3.5 transition ${collapsed ? "rotate-90" : ""}`} />
            {collapsed ? "展开" : "收起"}
          </button>
        </div>
        {collapsed ? (
          <div className="text-sm text-zinc-500 line-clamp-1">
            {question.question.zh || question.question.en}
          </div>
        ) : (
          <Markdown>{question.question.zh || question.question.en}</Markdown>
        )}
      </div>

      {!collapsed && (
        <div className="p-5 space-y-4">
          {/* 答题输入 */}
          {!evaluation && (
            <div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="写下你的答案…（可以多次作答，每次提交都会与标准答案对比）"
                className="w-full min-h-[140px] p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-blue-500"
              />
              {submitError && <div className="text-xs text-rose-600 mt-1">{submitError}</div>}
              <div className="mt-2 flex justify-end">
                <button
                  onClick={handleSubmit}
                  disabled={grading || !draft.trim()}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1"
                >
                  <Send className="w-4 h-4" />
                  提交
                </button>
              </div>
            </div>
          )}

          <AnswerResult
            attempts={attempts}
            standardAnswer={question.answer.zh}
            grading={grading}
            evaluation={evaluation}
            savingStandard={savingStandard}
            savedStandard={savedStandard}
            onSaveStandard={handleSaveStandard}
            onRetry={() => setEvaluation(null)}
          />
        </div>
      )}
    </section>
  );
}
