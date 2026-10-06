"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ALL_CHECKPOINT_IDS,
  ALL_TOPICS,
  CATEGORY_META,
  getCheckpoint,
  localizedCheckpointName,
  localizedTopicTitle,
} from "@/lib/knowledge";
import { KnowledgeMap } from "@/components/KnowledgeMap";
import { Markdown } from "@/components/Markdown";
import { AnswerResult } from "@/components/quiz/AnswerResult";
import { useLang } from "@/lib/i18n/context";
import {
  loadProgress,
  pushQuizHistory,
  recordQuizResult,
  recordQuestionQuizResult,
  type ProgressMap,
} from "@/lib/storage";
import type { QuestionItem } from "@/lib/storage";
import type { QuizEvaluation } from "@/app/api/quiz/evaluate/route";
import { Loader2, Sparkles, Send, BookOpen, Shuffle, Target } from "lucide-react";

type BankQuestion = QuestionItem & { file?: string };

function QuizInner() {
  const { lang, t } = useLang();
  const search = useSearchParams();
  const initialCp = search.get("cp");

  const [progress, setProgress] = useState<ProgressMap>({});
  const [pickedCp, setPickedCp] = useState<string | null>(initialCp);
  const [pickedQuestion, setPickedQuestion] = useState<BankQuestion | null>(null);
  const [question, setQuestion] = useState<string>("");
  const [loadingQ, setLoadingQ] = useState(false);
  const [answer, setAnswer] = useState("");
  const [attempts, setAttempts] = useState<string[]>([]);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<QuizEvaluation | null>(null);
  const [savedStandard, setSavedStandard] = useState(false);
  const [savingStandard, setSavingStandard] = useState(false);
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([]);
  const submitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setProgress(loadProgress());
    // 题库统一从服务端（笔记库 question.md）加载
    fetch("/api/questions")
      .then((r) => r.json())
      .then((d: { questions: BankQuestion[] }) => {
        if (Array.isArray(d.questions) && d.questions.length > 0) {
          setBankQuestions(d.questions);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initialCp) {
      generateForCheckpoint(initialCp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCp]);

  const pickedInfo = useMemo(
    () => (pickedCp ? getCheckpoint(pickedCp) : null),
    [pickedCp],
  );

  function pickRandomWeak(): string {
    // 优先选 gap，其次 unknown，再其次 learning，最后 mastered
    const buckets: Record<string, string[]> = {
      gap: [],
      unknown: [],
      learning: [],
      mastered: [],
    };
    for (const cpId of ALL_CHECKPOINT_IDS) {
      const s = progress[cpId]?.status ?? "unknown";
      buckets[s].push(cpId);
    }
    const ordered = [
      ...buckets.gap,
      ...buckets.unknown,
      ...buckets.learning,
      ...buckets.mastered,
    ];
    return ordered[Math.floor(Math.random() * Math.min(ordered.length, 8))] ?? ALL_CHECKPOINT_IDS[0];
  }

  async function generateForCheckpoint(cpId: string) {
    setPickedCp(cpId);
    setPickedQuestion(null);
    setQuestion("");
    setAnswer("");
    setAttempts([]);
    setEvaluation(null);
    setSavedStandard(false);
    setLoadingQ(true);
    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpointId: cpId, language: lang }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQuestion(`[${t.quiz.generateFailed}] ${data.error ?? res.statusText}`);
      } else {
        setQuestion(data.question);
      }
    } catch (e) {
      setQuestion(`[${t.quiz.netError}] ${(e as Error).message}`);
    } finally {
      setLoadingQ(false);
    }
  }

  function pickBankQuestion(questionId: string) {
    const q = bankQuestions.find((item) => item.id === questionId);
    if (!q) return;
    setPickedCp(null);
    setPickedQuestion(q);
    setQuestion(lang === "en" && q.question.en ? q.question.en : q.question.zh);
    setAnswer("");
    setAttempts([]);
    setEvaluation(null);
    setSavedStandard(false);
  }

  async function submitAnswer() {
    if ((!pickedCp && !pickedQuestion) || !question || !answer.trim() || evaluating) return;
    setEvaluating(true);
    setEvaluation(null);
    try {
      // For bank questions, use the saved answer as reference
      if (pickedQuestion) {
        const res = await fetch("/api/quiz/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkpointId: `bank-${pickedQuestion.id}`,
            question,
            answer,
            language: lang,
            referenceAnswer: lang === "en" && pickedQuestion.answer.en
              ? pickedQuestion.answer.en
              : pickedQuestion.answer.zh,
          }),
        });
        const data = (await res.json()) as QuizEvaluation;
        setEvaluation(data);
        setAttempts((prev) => [...prev, answer]);
        setAnswer("");
        recordQuestionQuizResult(pickedQuestion.id, data.score);
        setProgress(loadProgress());
      } else if (pickedCp) {
        const res = await fetch("/api/quiz/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkpointId: pickedCp,
            question,
            answer,
            language: lang,
          }),
        });
        const data = (await res.json()) as QuizEvaluation;
        setEvaluation(data);
        setAttempts((prev) => [...prev, answer]);
        setAnswer("");
        recordQuizResult(pickedCp, data.score);
        setProgress(loadProgress());
        const info = getCheckpoint(pickedCp);
        if (info) {
          pushQuizHistory({
            checkpointId: pickedCp,
            topicId: info.topic.id,
            question,
            answer,
            evaluation: data,
            at: Date.now(),
          });
        }
      }
      setTimeout(() => submitRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (e) {
      setEvaluation({
        score: 0,
        correct_points: [],
        gaps: [`${t.quiz.evaluateFailed}：${(e as Error).message}`],
        misconceptions: [],
        reference_answer: "",
        follow_up: "",
      });
    } finally {
      setEvaluating(false);
    }
  }

  /** 把当前我的答案保存为该题的标准答案（写回题库 question.md，含分类文件移动） */
  async function saveMyAnswerAsStandard(text: string): Promise<boolean> {
    if (!pickedQuestion) return false;
    setSavingStandard(true);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pickedQuestion.id,
          topicId: pickedQuestion.topicId,
          category: pickedQuestion.category,
          question: pickedQuestion.question,
          answer: { zh: text, en: pickedQuestion.answer.en },
          createdAt: pickedQuestion.createdAt,
          prevFile: pickedQuestion.file,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`保存失败：${err.error ?? res.statusText}`);
        return false;
      }
      setSavedStandard(true);
      return true;
    } catch (e) {
      alert(`保存失败：${(e as Error).message}`);
      return false;
    } finally {
      setSavingStandard(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-1">{t.quiz.title}</h1>
      <p className="text-zinc-500 dark:text-zinc-400 mb-6">
        {t.quiz.subtitle}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* 主区：题目 + 答题 */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={() => generateForCheckpoint(pickRandomWeak())}
              className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1"
            >
              <Shuffle className="w-4 h-4" />
              {t.quiz.randomFromWeak}
            </button>
            <select
              onChange={(e) => e.target.value && generateForCheckpoint(e.target.value)}
              value=""
              className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            >
              <option value="">{t.quiz.pickPlaceholder}</option>
              {ALL_TOPICS.map((topic) => (
                <optgroup
                  key={topic.id}
                  label={`[${CATEGORY_META[topic.category].label}] ${localizedTopicTitle(topic, lang)}`}
                >
                  {topic.checkpoints.map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      {localizedCheckpointName(cp, lang)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {bankQuestions.length > 0 && (
              <select
                onChange={(e) => e.target.value && pickBankQuestion(e.target.value)}
                value=""
                className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              >
                <option value="">从题库选题…</option>
                {[...new Set(bankQuestions.map((q) => q.category))].sort().map((cat) => (
                  <optgroup key={cat} label={cat}>
                    {bankQuestions
                      .filter((q) => q.category === cat)
                      .map((q) => (
                        <option key={q.id} value={q.id}>
                          {(q.question.zh || q.question.en).slice(0, 50)}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            )}
            {pickedCp && (
              <button
                onClick={() => generateForCheckpoint(pickedCp)}
                disabled={loadingQ}
                className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1"
              >
                <Sparkles className="w-4 h-4" />
                {t.quiz.nextQuestion}
              </button>
            )}
          </div>

          {pickedInfo && (
            <div className="text-xs text-zinc-500">
              {t.quiz.currentCheckpoint}：
              <Link
                href={`/learn/${pickedInfo.topic.id}`}
                className="text-blue-600 hover:underline"
              >
                {localizedTopicTitle(pickedInfo.topic, lang)}
              </Link>{" "}
              · <strong>{localizedCheckpointName(pickedInfo.checkpoint, lang)}</strong>
            </div>
          )}
          {pickedQuestion && (
            <div className="text-xs text-zinc-500">
              题库题目 · 分类：<strong>{pickedQuestion.category}</strong>
            </div>
          )}

          {/* 题面卡片 */}
          {question && (
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-5 min-h-[100px]">
              {loadingQ ? (
                <div className="flex items-center gap-2 text-zinc-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> {t.quiz.generating}
                </div>
              ) : (
                <Markdown>{question}</Markdown>
              )}
            </div>
          )}

          {!question && !loadingQ && (
            <div className="border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-10 text-sm text-zinc-400 flex flex-col items-center gap-2">
              <Target className="w-6 h-6" />
              {t.quiz.pickToStart}
            </div>
          )}

          {/* 答题区 */}
          {question && !loadingQ && (
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-4">
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={t.quiz.answerPlaceholder}
                className="w-full min-h-[140px] p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-blue-500"
              />
              <div className="mt-2 flex justify-end">
                <button
                  onClick={submitAnswer}
                  disabled={evaluating || !answer.trim()}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1"
                >
                  {evaluating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t.quiz.aiGrading}
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      {t.quiz.submitAnswer}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* 提交结果：对比卡片 + AI 解析 */}
          <div ref={submitRef} className="scroll-mt-20">
            {!evaluating && (
              <AnswerResult
                attempts={attempts}
                standardAnswer={
                  pickedQuestion
                    ? lang === "en" && pickedQuestion.answer.en
                      ? pickedQuestion.answer.en
                      : pickedQuestion.answer.zh
                    : ""
                }
                grading={evaluating}
                evaluation={evaluation}
                savingStandard={savingStandard}
                savedStandard={savedStandard}
                onSaveStandard={pickedQuestion ? saveMyAnswerAsStandard : undefined}
                onRetry={() => setEvaluation(null)}
              />
            )}
          </div>

          {evaluation && !evaluating && (
            <div className="flex items-center gap-2">
              {pickedInfo && (
                <Link
                  href={`/learn/${pickedInfo.topic.id}`}
                  className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1"
                >
                  <BookOpen className="w-4 h-4" />
                  {t.quiz.reviewTopic}
                </Link>
              )}
              <button
                onClick={() => generateForCheckpoint(pickRandomWeak())}
                className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
              >
                {t.quiz.nextOne}
              </button>
            </div>
          )}
        </div>

        {/* 侧栏：知识图谱 */}
        <aside className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-4 h-fit lg:sticky lg:top-20">
          <div className="text-sm font-semibold mb-3">{t.quiz.knowledgeMap}</div>
          <KnowledgeMap
            progress={progress}
            onPick={generateForCheckpoint}
            highlightId={pickedCp ?? undefined}
          />
        </aside>
      </div>
    </div>
  );
}

export default function QuizPage() {
  return (
    <Suspense
      fallback={<div className="p-6 text-zinc-500">Loading...</div>}
    >
      <QuizInner />
    </Suspense>
  );
}
