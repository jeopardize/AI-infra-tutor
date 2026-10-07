"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n/context";
import type { QuestionItem } from "@/lib/storage";
import { EditQuestionDialog, type BankCategoryOption } from "./EditQuestionDialog";
import { CategoryTree } from "./CategoryTree";
import { exportAsJson, exportAsMarkdown } from "./exportUtils";
import { Download, Search } from "lucide-react";

export type BankQuestion = QuestionItem & { file?: string };

const OTHER_CATEGORY = "其他";

interface Props {
  refreshKey: number;
  categories: BankCategoryOption[];
  items: BankQuestion[];
  onChange: () => void;
}

interface EditableRowProps {
  item: BankQuestion;
  categories: BankCategoryOption[];
  onEdit: () => void;
  onDelete: () => void;
}

function QuestionCard({ item, categories, onEdit, onDelete }: EditableRowProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyText(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 max-w-full overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition rounded-lg min-w-0"
      >
        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 font-medium ${
          item.category === OTHER_CATEGORY
            ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
            : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
        }`}>
          {item.category}
        </span>
        <span className="text-sm text-zinc-800 dark:text-zinc-200 truncate flex-1 min-w-0">
          {item.question.zh || item.question.en}
        </span>
        {item.answer.zh ? (
          <span className="text-[10px] text-emerald-600 shrink-0">有答案</span>
        ) : (
          <span className="text-[10px] text-zinc-400 shrink-0">无答案</span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-3 mt-0 overflow-hidden">
          <div className="text-[10px] text-zinc-400">
            存放：{item.category === OTHER_CATEGORY ? "data/other_question.md" : `${item.category}/question.md`}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-zinc-500 mb-1 flex items-center gap-2">
              <span>{t.bank.questionZh}</span>
              <button onClick={() => copyText(item.question.zh)} className="text-zinc-400 hover:text-zinc-600">
                {copied ? "✓" : "⧉"}
              </button>
            </div>
            <div className="text-sm text-zinc-800 dark:text-zinc-200 break-words overflow-hidden">{item.question.zh || "—"}</div>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-zinc-500 mb-1">{t.bank.questionEn}</div>
            <div className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words overflow-hidden">{item.question.en || "—"}</div>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-zinc-500 mb-1">{t.bank.answerZh}</div>
            <div className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words overflow-hidden">{item.answer.zh || "（暂无，可在答题页提交后点“设为标准答案”生成）"}</div>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-zinc-500 mb-1">{t.bank.answerEn}</div>
            <div className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words overflow-hidden">{item.answer.en || "—"}</div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onEdit}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              ✏️ {t.bank.edit}
            </button>
            <button
              onClick={onDelete}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30"
            >
              🗑 {t.bank.delete}
            </button>
          </div>
        </div>
      )}

      {open && categories.length === 0 && (
        <div className="text-xs text-zinc-400 px-3 pb-2">分类列表为空</div>
      )}
    </div>
  );
}

export function BrowseQuestionsPanel({ refreshKey, categories, items, onChange }: Props) {
  const t = useT();
  const [filterPath, setFilterPath] = useState("");
  const [searchText, setSearchText] = useState("");
  const [editing, setEditing] = useState<BankQuestion | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const countOf = useCallback(
    (path: string): number => {
      if (path === "data") {
        return items.filter((q) => q.file === "data/other_question.md").length;
      }
      const own = `${path}/question.md`;
      return items.filter((q) => q.file === own || q.file?.startsWith(`${path}/`)).length;
    },
    [items],
  );

  const filtered = useMemo(() => {
    return items.filter((q) => {
      let matchCategory = true;
      if (filterPath === "data") {
        matchCategory = q.file === "data/other_question.md";
      } else if (filterPath) {
        const own = `${filterPath}/question.md`;
        matchCategory = q.file === own || (q.file?.startsWith(`${filterPath}/`) ?? false);
      }
      const matchSearch =
        !searchText ||
        q.question.zh.includes(searchText) ||
        q.question.en.toLowerCase().includes(searchText.toLowerCase()) ||
        q.answer.zh.includes(searchText) ||
        q.answer.en.toLowerCase().includes(searchText.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [items, filterPath, searchText]);

  async function handleDelete(item: BankQuestion) {
    if (!confirm(t.bank.deleteConfirm)) return;
    setDeletingId(item.id);
    try {
      const params = new URLSearchParams({ id: item.id });
      if (item.file) params.set("file", item.file);
      const res = await fetch(`/api/questions?${params}`, { method: "DELETE" });
      if (res.ok) onChange();
      else alert("删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  function handleExportJson() {
    exportAsJson(filtered);
  }

  function handleExportMarkdown() {
    exportAsMarkdown(filtered);
  }

  const otherCount = items.filter((q) => q.category === OTHER_CATEGORY).length;

  return (
    <div className="space-y-4">
      {/* 提示语：题库逻辑 */}
      <div className="text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2">
        分类严格对应笔记库文件夹：每类题目存放在对应文件夹的 <code className="px-1 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded">question.md</code> 里；
        无法确认分类的题目放在 <code className="px-1 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded">data/other_question.md</code>
        （显示为「其他」{otherCount > 0 ? `，当前 ${otherCount} 题` : ""}）。
        在网页中编辑题目并修改分类时，会自动把它移动到所属文件夹的 question.md 下。
      </div>

      {/* 分类：文件夹树 */}
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 items-start">
        <CategoryTree
          categories={categories}
          countOf={countOf}
          selected={filterPath}
          onSelect={(p) => setFilterPath((prev) => (prev === p ? "" : p))}
        />

        <div className="space-y-3 min-w-0">
          {/* Search + export */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t.bank.searchPlaceholder}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              <button
                onClick={handleExportJson}
                disabled={filtered.length === 0}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
              >
                <Download className="w-3 h-3" />
                {t.bank.exportJson}
              </button>
              <button
                onClick={handleExportMarkdown}
                disabled={filtered.length === 0}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
              >
                <Download className="w-3 h-3" />
                {t.bank.exportMarkdown}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="text-xs text-zinc-500">
            {filtered.length} / {items.length}
          </div>

          {/* Cards */}
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-zinc-400 dark:text-zinc-500">
              {t.bank.noQuestions}
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {filtered.map((q) => (
                <QuestionCard
                  key={q.id}
                  item={q}
                  categories={categories}
                  onEdit={() => setEditing(q)}
                  onDelete={() => handleDelete(q)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <EditQuestionDialog
          item={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChange();
          }}
        />
      )}

      {deletingId && (
        <div className="fixed bottom-4 right-4 text-xs text-zinc-500 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 shadow">
          删除中… {deletingId}
        </div>
      )}
    </div>
  );
}
