"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/context";
import type { QuestionItem } from "@/lib/storage";
import { EditQuestionDialog } from "./EditQuestionDialog";
import { ChevronDown, ChevronRight, Copy, Check, Pencil, Trash2 } from "lucide-react";

interface Props {
  item: QuestionItem;
  onDelete: (id: string) => void;
  onUpdate: () => void;
}

export function QuestionRow({ item, onDelete, onUpdate }: Props) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const isKbItem = item.createdAt === 0 || item.id.startsWith("kb-");

  function copyText(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleDelete() {
    if (isKbItem) {
      if (confirm("确定从列表中隐藏此题目？")) {
        onDelete(item.id);
      }
    } else {
      if (confirm(t.bank.deleteConfirm)) {
        const { deleteQuestion } = require("@/lib/storage");
        deleteQuestion(item.id);
        onDelete(item.id);
      }
    }
  }

  const dateStr = item.createdAt > 0
    ? new Date(item.createdAt).toLocaleDateString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <>
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 w-full overflow-hidden">
        {/* Collapsed row */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition rounded-lg min-w-0 overflow-hidden"
        >
          {expanded ? <ChevronDown className="w-4 h-4 shrink-0 text-zinc-400" /> : <ChevronRight className="w-4 h-4 shrink-0 text-zinc-400" />}
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 shrink-0 whitespace-nowrap">
            {item.category}
          </span>
          <span className="text-sm text-zinc-800 dark:text-zinc-200 truncate flex-1 min-w-0 overflow-hidden">
            {item.question.zh || item.question.en}
          </span>
          {dateStr && <span className="text-xs text-zinc-400 shrink-0 whitespace-nowrap">{dateStr}</span>}
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="px-3 pb-3 space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-3 mt-0 w-full overflow-hidden">
            {/* Question */}
            <div className="min-w-0 w-full overflow-hidden">
              <div className="text-xs font-medium text-zinc-500 mb-1 flex items-center gap-2">
                <span>{t.bank.questionZh}</span>
                <button onClick={() => copyText(item.question.zh)} className="text-zinc-400 hover:text-zinc-600">
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <div className="text-sm text-zinc-800 dark:text-zinc-200 break-words">{item.question.zh}</div>
            </div>
            <div className="min-w-0 w-full overflow-hidden">
              <div className="text-xs font-medium text-zinc-500 mb-1 flex items-center gap-2">
                <span>{t.bank.questionEn}</span>
                <button onClick={() => copyText(item.question.en)} className="text-zinc-400 hover:text-zinc-600">
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <div className="text-sm text-zinc-800 dark:text-zinc-200 break-words">{item.question.en}</div>
            </div>
            {/* Answer */}
            <div className="min-w-0 w-full overflow-hidden">
              <div className="text-xs font-medium text-zinc-500 mb-1">{t.bank.answerZh}</div>
              <div className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words">{item.answer.zh}</div>
            </div>
            <div className="min-w-0 w-full overflow-hidden">
              <div className="text-xs font-medium text-zinc-500 mb-1">{t.bank.answerEn}</div>
              <div className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words">{item.answer.en}</div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <Pencil className="w-3 h-3" />
                {t.bank.edit}
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30"
              >
                <Trash2 className="w-3 h-3" />
                {isKbItem ? "隐藏" : t.bank.delete}
              </button>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <EditQuestionDialog
          item={item}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); onUpdate(); }}
        />
      )}
    </>
  );
}
