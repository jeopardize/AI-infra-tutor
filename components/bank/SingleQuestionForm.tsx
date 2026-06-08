"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/context";
import { Loader2, Sparkles } from "lucide-react";

interface Props {
  category: string;
  topicId?: string;
  onSaved: () => void;
}

function Field({
  label,
  value,
  onChange,
  autoCompleteBtn,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoCompleteBtn?: React.ReactNode;
  rows?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</label>
      <div className="flex gap-2">
        <textarea
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          rows={rows || 2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {autoCompleteBtn}
      </div>
    </div>
  );
}

export function SingleQuestionForm({ category, topicId, onSaved }: Props) {
  const t = useT();
  const [qZh, setQZh] = useState("");
  const [qEn, setQEn] = useState("");
  const [aZh, setAZh] = useState("");
  const [aEn, setAEn] = useState("");
  const [completing, setCompleting] = useState<"q2e" | "e2q" | "a2e" | "e2a" | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const canSave = (qZh || qEn || aZh || aEn) && category;

  async function doAutoComplete(
    sourceText: string,
    sourceLang: "zh" | "en",
    targetLang: "zh" | "en",
    type: "question" | "answer",
    which: typeof completing,
  ) {
    if (!sourceText.trim()) return;
    setCompleting(which);
    setMsg(null);
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
      setMsg({ ok: false, text: t.bank.saveFailed });
    } finally {
      setCompleting(null);
    }
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setMsg(null);
    try {
      const { addQuestion } = await import("@/lib/storage");
      addQuestion({
        category,
        topicId: topicId || undefined,
        question: { zh: qZh, en: qEn },
        answer: { zh: aZh, en: aEn },
      });
      setMsg({ ok: true, text: t.bank.saveSuccess });
      setQZh(""); setQEn(""); setAZh(""); setAEn("");
      onSaved();
    } catch {
      setMsg({ ok: false, text: t.bank.saveFailed });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field
        label={t.bank.questionZh}
        value={qZh}
        onChange={setQZh}
        autoCompleteBtn={
          qZh && !qEn ? (
            <button
              onClick={() => doAutoComplete(qZh, "zh", "en", "question", "q2e")}
              disabled={completing === "q2e"}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 shrink-0 self-start mt-0.5"
            >
              {completing === "q2e" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {completing === "q2e" ? t.bank.aiCompleting : t.bank.aiAutoComplete}
            </button>
          ) : null
        }
      />
      <Field
        label={t.bank.questionEn}
        value={qEn}
        onChange={setQEn}
        autoCompleteBtn={
          qEn && !qZh ? (
            <button
              onClick={() => doAutoComplete(qEn, "en", "zh", "question", "e2q")}
              disabled={completing === "e2q"}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 shrink-0 self-start mt-0.5"
            >
              {completing === "e2q" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {completing === "e2q" ? t.bank.aiCompleting : t.bank.aiAutoComplete}
            </button>
          ) : null
        }
        rows={2}
      />
      <Field
        label={t.bank.answerZh}
        value={aZh}
        onChange={setAZh}
        autoCompleteBtn={
          aZh && !aEn ? (
            <button
              onClick={() => doAutoComplete(aZh, "zh", "en", "answer", "a2e")}
              disabled={completing === "a2e"}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 shrink-0 self-start mt-0.5"
            >
              {completing === "a2e" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {completing === "a2e" ? t.bank.aiCompleting : t.bank.aiAutoComplete}
            </button>
          ) : null
        }
        rows={3}
      />
      <Field
        label={t.bank.answerEn}
        value={aEn}
        onChange={setAEn}
        autoCompleteBtn={
          aEn && !aZh ? (
            <button
              onClick={() => doAutoComplete(aEn, "en", "zh", "answer", "e2a")}
              disabled={completing === "e2a"}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 shrink-0 self-start mt-0.5"
            >
              {completing === "e2a" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {completing === "e2a" ? t.bank.aiCompleting : t.bank.aiAutoComplete}
            </button>
          ) : null
        }
        rows={3}
      />

      {msg && (
        <div className={`text-sm ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
          {msg.text}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={!canSave || saving}
        className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700"
      >
        {saving ? t.common.loading : t.bank.save}
      </button>
    </div>
  );
}
