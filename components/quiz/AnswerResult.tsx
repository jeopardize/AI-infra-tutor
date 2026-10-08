"use client";

import { useState } from "react";
import { Markdown } from "@/components/Markdown";
import type { QuizEvaluation } from "@/app/api/quiz/evaluate/route";
import { BookOpenCheck, FileQuestion, Loader2, MessageSquareText } from "lucide-react";

interface AnswerResultProps {
  attempts: string[];
  /** 标准答案，为空字符串时右侧显示空状态 */
  standardAnswer: string;
  grading: boolean;
  evaluation: QuizEvaluation | null;
  /** 将我的答案保存为标准答案（题库题目才有加分按钮） */
  onSaveStandard?: (text: string) => Promise<boolean>;
  savingStandard?: boolean;
  savedStandard?: boolean;
  onRetry?: () => void;
}

export function AnswerResult({
  attempts,
  standardAnswer,
  grading,
  evaluation,
  onSaveStandard,
  savingStandard,
  savedStandard,
  onRetry,
}: AnswerResultProps) {
  const [askedText, setAskedText] = useState("");
  const latest = attempts[attempts.length - 1] ?? "";

  if (grading) {
    return (
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-8 flex items-center justify-center gap-2 text-zinc-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        AI 正在批改你的答案…
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className="border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-6 text-sm text-zinc-400 text-center">
        提交答案后，这里会出现「作答对比」和「AI 答案解析」
      </div>
    );
  }

  async function handleSaveStandard() {
    if (!onSaveStandard || !latest.trim()) return;
    if (!confirm("确认将本次我的答案设为该题的标准答案吗？")) return;
    const ok = await onSaveStandard(latest);
    if (ok) setAskedText("已保存为标准答案");
  }

  const scoreColor =
    evaluation.score >= 85
      ? "text-emerald-600"
      : evaluation.score >= 60
        ? "text-amber-600"
        : "text-rose-600";

  return (
    <div className="space-y-4">
      {/* 卡片一：作答对比 */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-5">
        <div className="flex items-center gap-2 mb-3">
          <FileQuestion className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-sm">作答对比</h3>
          <button
            onClick={onRetry}
            className="ml-auto text-xs px-2.5 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            再答一次
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 左：我的答案 */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50 dark:bg-zinc-950/40">
            <h4 className="text-xs font-semibold text-zinc-500 mb-2">我的答案</h4>
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {[...attempts].reverse().map((a, i) => (
                <div key={i} className="rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3">
                  <div className="text-[10px] text-zinc-400 mb-1">第 {attempts.length - i} 次作答</div>
                  <div className="text-sm prose-tutor break-words"><Markdown>{a}</Markdown></div>
                </div>
              ))}
            </div>
          </div>

          {/* 右：标准答案 */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50 dark:bg-zinc-950/40">
            <h4 className="text-xs font-semibold text-zinc-500 mb-2">标准答案</h4>
            {standardAnswer ? (
              <div className="max-h-72 overflow-y-auto">
                <Markdown>{standardAnswer}</Markdown>
              </div>
            ) : (
              <div className="h-full min-h-[120px] flex flex-col items-center justify-center gap-1.5 text-zinc-300 dark:text-zinc-600">
                <BookOpenCheck className="w-8 h-8" />
                <div className="text-xs text-zinc-400">暂无标准答案</div>
              </div>
            )}
          </div>
        </div>

        {onSaveStandard && (
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleSaveStandard}
              disabled={savingStandard || !latest.trim() || savedStandard}
              className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              {savingStandard ? "保存中…" : savedStandard || askedText ? "已保存为标准答案" : "将我的答案设为标准答案"}
            </button>
            <span className="text-xs text-zinc-400">把这次作答沉淀到题库标准答案</span>
          </div>
        )}
      </section>

      {/* 卡片二：AI 答案解析 */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquareText className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-sm">AI 答案解析</h3>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-zinc-400">完成度</div>
            <div className={`text-2xl font-bold ${scoreColor} leading-none`}>
              {evaluation.score}
              <span className="text-xs text-zinc-400">/100</span>
            </div>
          </div>
        </div>

        {evaluation.correct_points.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">答对的点</h4>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {evaluation.correct_points.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        )}

        {evaluation.gaps.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-rose-700 dark:text-rose-400 mb-1">遗漏/错误点</h4>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {evaluation.gaps.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        )}

        {evaluation.misconceptions.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">概念误区</h4>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {evaluation.misconceptions.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        )}

        {evaluation.reference_answer && (
          <div>
            <h4 className="text-xs font-semibold mb-1">AI 参考答案</h4>
            <Markdown>{evaluation.reference_answer}</Markdown>
          </div>
        )}

        {evaluation.follow_up && (
          <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900">
            <h4 className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">进阶追问</h4>
            <div className="text-sm">{evaluation.follow_up}</div>
          </div>
        )}
      </section>
    </div>
  );
}
