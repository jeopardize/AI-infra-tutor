"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/context";
import type { QuestionItem } from "@/lib/storage";
import { ALL_TOPICS, CATEGORY_META } from "@/lib/knowledge";
import { Loader2, Sparkles, X } from "lucide-react";

interface Props {
  item: QuestionItem;
  onClose: () => void;
  onSaved: () => void;
}

export function EditQuestionDialog({ item, onClose, onSaved }: Props) {
  const t = useT();
  const [qZh, setQZh] = useState(item.question.zh);
  const [qEn, setQEn] = useState(item.question.en);
  const [aZh, setAZh] = useState(item.answer.zh);
  const [aEn, setAEn] = useState(item.answer.en);
  const [category, setCategory] = useState(item.category);
  const [topicId, setTopicId] = useState(item.topicId || "");
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function doAutoComplete(
    sourceText: string,
    sourceLang: "zh" | "en",
    targetLang: "zh" | "en",
    type: "question" | "answer",
    which: string,
  ) {
    if (!sourceText.trim()) return;
    setCompleting(which);
    try {
      const res = await fetch("/api/bank/auto-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceText, sourceLang, targetLang, type }),
      });
      const data = await res.json();
      if (res.ok && data.translated) {
        if (which === "q2e") setQEn(data.translated);
        else if (which === "e2q") setQZh(data.translated);
        else if (which === "a2e") setAEn(data.translated);
        else if (which === "e2a") setAZh(data.translated);
      }
    } catch {
      // ignore
    } finally {
      setCompleting(null);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const { saveQuestionItem } = await import("@/lib/storage");
      saveQuestionItem({
        ...item,
        category,
        topicId: topicId || undefined,
        question: { zh: qZh, en: qEn },
        answer: { zh: aZh, en: aEn },
      });
      setMsg({ ok: true, text: t.bank.saveSuccess });
      setTimeout(onSaved, 500);
    } catch {
      setMsg({ ok: false, text: t.bank.saveFailed });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-xl bg-white dark:bg-zinc-950 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[90vh]">
          <header className="flex items-center justify-between px-4 h-12 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
            <span className="font-medium text-sm">{t.bank.edit}</span>
            <button onClick={onClose} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
              <X className="w-4 h-4" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">所属主题（Topic）</label>
              <select
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
              >
                <option value="">不关联主题（仅用作题库）</option>
                {ALL_TOPICS.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    [{CATEGORY_META[topic.category].label}] {topic.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">{t.bank.category}（标签）</label>
              <input
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={t.bank.category}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">{t.bank.questionZh}</label>
              <div className="flex gap-2">
                <textarea className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" rows={2} value={qZh} onChange={(e) => setQZh(e.target.value)} />
                {qZh && !qEn ? (
                  <button onClick={() => doAutoComplete(qZh, "zh", "en", "question", "q2e")} disabled={completing === "q2e"} className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 shrink-0 self-start mt-0.5">
                    {completing === "q2e" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    {completing === "q2e" ? t.bank.aiCompleting : t.bank.aiAutoComplete}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">{t.bank.questionEn}</label>
              <div className="flex gap-2">
                <textarea className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" rows={2} value={qEn} onChange={(e) => setQEn(e.target.value)} />
                {qEn && !qZh ? (
                  <button onClick={() => doAutoComplete(qEn, "en", "zh", "question", "e2q")} disabled={completing === "e2q"} className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 shrink-0 self-start mt-0.5">
                    {completing === "e2q" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    {completing === "e2q" ? t.bank.aiCompleting : t.bank.aiAutoComplete}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">{t.bank.answerZh}</label>
              <div className="flex gap-2">
                <textarea className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" rows={3} value={aZh} onChange={(e) => setAZh(e.target.value)} />
                {aZh && !aEn ? (
                  <button onClick={() => doAutoComplete(aZh, "zh", "en", "answer", "a2e")} disabled={completing === "a2e"} className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 shrink-0 self-start mt-0.5">
                    {completing === "a2e" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    {completing === "a2e" ? t.bank.aiCompleting : t.bank.aiAutoComplete}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">{t.bank.answerEn}</label>
              <div className="flex gap-2">
                <textarea className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" rows={3} value={aEn} onChange={(e) => setAEn(e.target.value)} />
                {aEn && !aZh ? (
                  <button onClick={() => doAutoComplete(aEn, "en", "zh", "answer", "e2a")} disabled={completing === "e2a"} className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 shrink-0 self-start mt-0.5">
                    {completing === "e2a" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    {completing === "e2a" ? t.bank.aiCompleting : t.bank.aiAutoComplete}
                  </button>
                ) : null}
              </div>
            </div>

            {msg && (
              <div className={`text-sm ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</div>
            )}
          </div>

          <footer className="flex justify-end gap-2 px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
            <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              {t.common.cancel}
            </button>
            <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700">
              {saving ? t.common.loading : t.common.save}
            </button>
          </footer>
        </div>
      </div>
    </>
  );
}
