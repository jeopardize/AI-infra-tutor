"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ALL_CHECKPOINT_IDS,
  ALL_TOPICS,
  CATEGORY_META,
  getCheckpoint,
} from "@/lib/knowledge";
import { KnowledgeMap } from "@/components/KnowledgeMap";
import { Markdown } from "@/components/Markdown";
import {
  loadProgress,
  pushQuizHistory,
  recordQuizResult,
  type ProgressMap,
} from "@/lib/storage";
import type { QuizEvaluation } from "@/app/api/quiz/evaluate/route";
import { Loader2, Sparkles, Send, BookOpen, Shuffle, Target } from "lucide-react";

function QuizInner() {
  const search = useSearchParams();
  const initialCp = search.get("cp");

  const [progress, setProgress] = useState<ProgressMap>({});
  const [pickedCp, setPickedCp] = useState<string | null>(initialCp);
  const [question, setQuestion] = useState<string>("");
  const [loadingQ, setLoadingQ] = useState(false);
  const [answer, setAnswer] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<QuizEvaluation | null>(null);

  useEffect(() => {
    setProgress(loadProgress());
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
    setQuestion("");
    setAnswer("");
    setEvaluation(null);
    setLoadingQ(true);
    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpointId: cpId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQuestion(`[出题失败] ${data.error ?? res.statusText}`);
      } else {
        setQuestion(data.question);
      }
    } catch (e) {
      setQuestion(`[网络错误] ${(e as Error).message}`);
    } finally {
      setLoadingQ(false);
    }
  }

  async function submitAnswer() {
    if (!pickedCp || !question || !answer.trim() || evaluating) return;
    setEvaluating(true);
    setEvaluation(null);
    try {
      const res = await fetch("/api/quiz/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkpointId: pickedCp,
          question,
          answer,
        }),
      });
      const data = (await res.json()) as QuizEvaluation;
      setEvaluation(data);
      recordQuizResult(pickedCp, data.score);
      const fresh = loadProgress();
      setProgress(fresh);
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
    } catch (e) {
      setEvaluation({
        score: 0,
        correct_points: [],
        gaps: [`评判失败：${(e as Error).message}`],
        misconceptions: [],
        reference_answer: "",
        follow_up: "",
      });
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-1">查漏补缺</h1>
      <p className="text-zinc-500 dark:text-zinc-400 mb-6">
        挑一个 checkpoint，AI 出一道开放题；写下你的答案，AI 会指出盲点并更新掌握度。
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
              从弱项随机一道
            </button>
            <select
              onChange={(e) => e.target.value && generateForCheckpoint(e.target.value)}
              value=""
              className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            >
              <option value="">从主题中选...</option>
              {ALL_TOPICS.map((t) => (
                <optgroup
                  key={t.id}
                  label={`[${CATEGORY_META[t.category].label}] ${t.title}`}
                >
                  {t.checkpoints.map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      {cp.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {pickedCp && (
              <button
                onClick={() => generateForCheckpoint(pickedCp)}
                disabled={loadingQ}
                className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1"
              >
                <Sparkles className="w-4 h-4" />
                换一道
              </button>
            )}
          </div>

          {pickedInfo && (
            <div className="text-xs text-zinc-500">
              当前考点：
              <Link
                href={`/learn/${pickedInfo.topic.id}`}
                className="text-blue-600 hover:underline"
              >
                {pickedInfo.topic.title}
              </Link>{" "}
              · <strong>{pickedInfo.checkpoint.name}</strong>
            </div>
          )}

          {/* 题面 */}
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-5 min-h-[140px]">
            {loadingQ ? (
              <div className="flex items-center gap-2 text-zinc-500">
                <Loader2 className="w-4 h-4 animate-spin" /> 正在出题...
              </div>
            ) : question ? (
              <Markdown>{question}</Markdown>
            ) : (
              <div className="text-zinc-400 text-sm flex items-center gap-2">
                <Target className="w-4 h-4" /> 点击上方按钮开始
              </div>
            )}
          </div>

          {/* 答题区 */}
          {question && !evaluation && (
            <div>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="把你的想法写下来——长一点更容易暴露盲点，AI 会给你详细反馈"
                className="w-full min-h-[160px] p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm outline-none focus:border-blue-500"
              />
              <div className="mt-2 flex justify-end">
                <button
                  onClick={submitAnswer}
                  disabled={evaluating || !answer.trim()}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm disabled:opacity-40 flex items-center gap-1"
                >
                  {evaluating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      AI 批改中...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      提交答案
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* 评估结果 */}
          {evaluation && (
            <EvaluationView
              evaluation={evaluation}
              checkpointId={pickedCp!}
              onRetry={() => {
                setEvaluation(null);
                setAnswer("");
              }}
              onNext={() => generateForCheckpoint(pickRandomWeak())}
            />
          )}
        </div>

        {/* 侧栏：知识图谱 */}
        <aside className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-4 h-fit lg:sticky lg:top-20">
          <div className="text-sm font-semibold mb-3">知识掌握地图</div>
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

function EvaluationView({
  evaluation,
  checkpointId,
  onRetry,
  onNext,
}: {
  evaluation: QuizEvaluation;
  checkpointId: string;
  onRetry: () => void;
  onNext: () => void;
}) {
  const info = getCheckpoint(checkpointId);
  const scoreColor =
    evaluation.score >= 85
      ? "text-emerald-600"
      : evaluation.score >= 60
        ? "text-amber-600"
        : "text-rose-600";

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-zinc-500">得分</div>
          <div className={`text-3xl font-bold ${scoreColor}`}>
            {evaluation.score}
            <span className="text-base text-zinc-400">/100</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRetry}
            className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            重答这题
          </button>
          {info && (
            <Link
              href={`/learn/${info.topic.id}`}
              className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1"
            >
              <BookOpen className="w-4 h-4" />
              回顾知识点
            </Link>
          )}
          <button
            onClick={onNext}
            className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            下一题
          </button>
        </div>
      </div>

      {evaluation.correct_points.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
            ✓ 答到的点
          </h3>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {evaluation.correct_points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {evaluation.gaps.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-400 mb-1">
            × 遗漏或不到位
          </h3>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {evaluation.gaps.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {evaluation.misconceptions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-1">
            ⚠ 概念误解
          </h3>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {evaluation.misconceptions.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {evaluation.reference_answer && (
        <div>
          <h3 className="text-sm font-semibold mb-1">📘 参考答案</h3>
          <Markdown>{evaluation.reference_answer}</Markdown>
        </div>
      )}

      {evaluation.follow_up && (
        <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900">
          <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-1">
            🔍 进阶追问
          </h3>
          <div className="text-sm">{evaluation.follow_up}</div>
        </div>
      )}
    </div>
  );
}

export default function QuizPage() {
  return (
    <Suspense
      fallback={<div className="p-6 text-zinc-500">加载中...</div>}
    >
      <QuizInner />
    </Suspense>
  );
}
