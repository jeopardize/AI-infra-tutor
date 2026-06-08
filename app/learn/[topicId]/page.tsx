"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CATEGORY_META,
  MASTERY_META,
  getTopic,
  localizedCheckpointInterviewAngles,
  localizedCheckpointMisconceptions,
  localizedCheckpointMustKnow,
  localizedCheckpointName,
  localizedResourceTitle,
  localizedTopicSummary,
  localizedTopicTitle,
  type Checkpoint,
  type MasteryStatus,
} from "@/lib/knowledge";
import { Markdown } from "@/components/Markdown";
import { ChatPanel } from "@/components/ChatPanel";
import { MasteryDot } from "@/components/MasteryBadge";
import { DocDrawer } from "@/components/DocDrawer";
import { useLang } from "@/lib/i18n/context";
import {
  loadProgress,
  setCheckpointStatus,
  loadQuestions,
  loadQuestionProgress,
  type ProgressMap,
  type QuestionItem,
} from "@/lib/storage";
import { ArrowLeft, BookText, Check, ExternalLink, Sparkles } from "lucide-react";

export default function LearnTopicPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = use(params);
  const topic = getTopic(topicId);
  if (!topic) notFound();
  const { lang, t } = useLang();

  const [activeCp, setActiveCp] = useState<Checkpoint>(topic.checkpoints[0]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [bankQuestions, setBankQuestions] = useState<QuestionItem[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<QuestionItem | null>(null);

  useEffect(() => {
    setProgress(loadProgress());
    const questions = loadQuestions();
    setBankQuestions(questions.filter((q) => q.topicId === topicId));
  }, [topicId]);

  function markStatus(status: MasteryStatus) {
    if (activeCp) {
      setCheckpointStatus(activeCp.id, status);
      setProgress(loadProgress());
    } else if (activeQuestion) {
      const { recordQuestionQuizResult } = require("@/lib/storage");
      const score = status === "mastered" ? 100 : status === "learning" ? 70 : 50;
      recordQuestionQuizResult(activeQuestion.id, score);
      setProgress(loadProgress());
    }
  }

  function selectCheckpoint(cp: Checkpoint) {
    setActiveCp(cp);
    setActiveQuestion(null);
  }

  function selectBankQuestion(q: QuestionItem) {
    setActiveQuestion(q);
    setActiveCp(null as any);
  }

  const meta = CATEGORY_META[topic.category];
  const questionProgress = loadQuestionProgress();
  const curStatus = activeCp
    ? (progress[activeCp.id]?.status ?? "unknown")
    : activeQuestion
      ? (questionProgress[activeQuestion.id]?.status ?? "unknown")
      : "unknown";

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> {t.learn.backToDashboard}
      </Link>

      <div className="flex items-center gap-2 mb-1 text-xs text-zinc-500">
        <span>{meta.emoji}</span>
        <span>{t.categories[topic.category].label}</span>
      </div>
      <h1 className="text-2xl font-bold mb-1">{localizedTopicTitle(topic, lang)}</h1>
      <p className="text-zinc-500 dark:text-zinc-400 mb-6">{localizedTopicSummary(topic, lang)}</p>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_360px] gap-4">
        {/* 左：checkpoint 列表 */}
        <aside className="space-y-1">
          <div className="text-xs font-medium text-zinc-500 mb-2 px-2">
            {t.learn.checkpointsLabel(topic.checkpoints.length)}
          </div>
          {topic.checkpoints.map((cp) => {
            const s = progress[cp.id]?.status ?? "unknown";
            const active = activeCp && cp.id === activeCp.id;
            return (
              <button
                key={cp.id}
                onClick={() => selectCheckpoint(cp)}
                className={
                  "w-full text-left px-3 py-2 rounded-md flex items-start gap-2 text-sm transition " +
                  (active
                    ? "bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-200")
                }
              >
                <span className="mt-1.5">
                  <MasteryDot status={s} />
                </span>
                <span>{localizedCheckpointName(cp, lang)}</span>
              </button>
            );
          })}

          {bankQuestions.length > 0 && (
            <>
              <div className="text-xs font-medium text-zinc-500 mt-4 pt-4 mb-2 px-2 border-t border-zinc-200 dark:border-zinc-800">
                {t.learn.bankQuestionsLabel(bankQuestions.length)}
              </div>
              {bankQuestions.map((q) => {
                const s = questionProgress[q.id]?.status ?? "unknown";
                const active = activeQuestion && q.id === activeQuestion.id;
                const displayText = lang === "en" && q.question.en ? q.question.en : q.question.zh;
                return (
                  <button
                    key={q.id}
                    onClick={() => selectBankQuestion(q)}
                    className={
                      "w-full text-left px-3 py-2 rounded-md flex items-start gap-2 text-sm transition " +
                      (active
                        ? "bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-200")
                    }
                  >
                    <span className="mt-1.5">
                      <MasteryDot status={s} />
                    </span>
                    <span className="truncate min-w-0">{displayText}</span>
                  </button>
                );
              })}
            </>
          )}

          {topic.localDocs && topic.localDocs.length > 0 && (
            <div className="pt-4">
              <div className="text-xs font-medium text-zinc-500 mb-2 px-2 flex items-center gap-1">
                <BookText className="w-3 h-3" /> {t.learn.myNotes}
              </div>
              {topic.localDocs.map((p) => (
                <button
                  key={p}
                  onClick={() => setOpenDoc(p)}
                  className="w-full text-left px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:text-blue-600 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded flex items-start gap-1"
                  title={p}
                >
                  <BookText className="w-3 h-3 mt-0.5 shrink-0" />
                  <span className="truncate">{prettyDocName(p)}</span>
                </button>
              ))}
            </div>
          )}

          {topic.resources.length > 0 && (
            <div className="pt-4">
              <div className="text-xs font-medium text-zinc-500 mb-2 px-2">
                {t.learn.recommendedResources}
              </div>
              {topic.resources.map((r) => (
                <a
                  key={r.url}
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:text-blue-600"
                >
                  <ExternalLink className="w-3 h-3" /> {localizedResourceTitle(r, lang)}
                </a>
              ))}
            </div>
          )}
        </aside>

        {/* 中：当前 checkpoint 内容 */}
        <article className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">
              {activeCp
                ? localizedCheckpointName(activeCp, lang)
                : activeQuestion
                  ? (lang === "en" && activeQuestion.question.en ? activeQuestion.question.en : activeQuestion.question.zh)
                  : ""}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">
                {t.mastery[curStatus]}
              </span>
              <button
                onClick={() => markStatus("mastered")}
                className="px-2.5 py-1 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                {t.learn.markMastered}
              </button>
              {activeCp && (
                <Link
                  href={`/quiz?cp=${activeCp.id}`}
                  className="px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  {t.learn.quizMe}
                </Link>
              )}
            </div>
          </div>

          {activeCp && (
            <>
              <section className="mb-5">
                <Markdown>{localizedCheckpointMustKnow(activeCp, lang)}</Markdown>
              </section>

              {topic.localDocs && topic.localDocs.length > 0 && (
                <section className="mb-5 p-3 rounded-md bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-900">
                  <h3 className="text-sm font-semibold text-violet-700 dark:text-violet-300 mb-2 flex items-center gap-1">
                    <BookText className="w-3.5 h-3.5" /> {t.learn.relatedMyNotes}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {topic.localDocs.map((p) => (
                      <button
                        key={p}
                        onClick={() => setOpenDoc(p)}
                        className="px-2.5 py-1 text-xs rounded-md bg-white dark:bg-zinc-900 border border-violet-200 dark:border-violet-900 hover:border-violet-400 text-violet-800 dark:text-violet-200 flex items-center gap-1"
                      >
                        <BookText className="w-3 h-3" />
                        {prettyDocName(p)}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {activeCp.commonMisconceptions.length > 0 && (
                <section className="mb-5 p-3 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900">
                  <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-300 mb-2">
                    {t.learn.commonMisconceptions}
                  </h3>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-rose-900 dark:text-rose-100">
                    {localizedCheckpointMisconceptions(activeCp, lang).map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </section>
              )}

              {activeCp.interviewAngles.length > 0 && (
                <section className="p-3 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900">
                  <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2">
                    {t.learn.interviewAngles}
                  </h3>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-blue-900 dark:text-blue-100">
                    {localizedCheckpointInterviewAngles(activeCp, lang).map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {activeQuestion && (
            <>
              <section className="mb-5">
                <h3 className="text-sm font-semibold mb-2">{t.bank.questionZh}</h3>
                <Markdown>{activeQuestion.question.zh}</Markdown>
              </section>

              {activeQuestion.question.en && (
                <section className="mb-5">
                  <h3 className="text-sm font-semibold mb-2">{t.bank.questionEn}</h3>
                  <Markdown>{activeQuestion.question.en}</Markdown>
                </section>
              )}

              <section className="mb-5 p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900">
                <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mb-2">
                  {t.bank.answerZh}
                </h3>
                <Markdown>{activeQuestion.answer.zh}</Markdown>
              </section>

              {activeQuestion.answer.en && (
                <section className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900">
                  <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mb-2">
                    {t.bank.answerEn}
                  </h3>
                  <Markdown>{activeQuestion.answer.en}</Markdown>
                </section>
              )}
            </>
          )}
        </article>

        {/* 右：Chat */}
        <div className="h-[calc(100vh-160px)] min-h-[480px] lg:sticky lg:top-20">
          <ChatPanel
            topicId={topic.id}
            checkpointId={activeCp ? activeCp.id : activeQuestion ? `bank-${activeQuestion.id}` : ""}
            hint={
              activeCp
                ? t.learn.chatHint(localizedCheckpointName(activeCp, lang))
                : activeQuestion
                  ? t.learn.chatHint(lang === "en" && activeQuestion.question.en ? activeQuestion.question.en : activeQuestion.question.zh)
                  : t.learn.chatPlaceholder
            }
            placeholder={t.learn.chatPlaceholder}
          />
        </div>
      </div>

      <DocDrawer docPath={openDoc} onClose={() => setOpenDoc(null)} />
    </div>
  );
}

function prettyDocName(p: string): string {
  const seg = p.split("/").pop() ?? p;
  return seg.replace(/\.(md|markdown)$/i, "");
}
