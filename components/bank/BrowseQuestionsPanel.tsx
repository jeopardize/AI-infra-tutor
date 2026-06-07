"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n/context";
import type { QuestionItem } from "@/lib/storage";
import { QuestionRow } from "./QuestionRow";
import { exportAsJson, exportAsMarkdown } from "./exportUtils";
import { Download, EyeOff, Search } from "lucide-react";
import { CATEGORY_META, ALL_TOPICS } from "@/lib/knowledge";

const KEY_HIDDEN_KB = "ai-infra-tutor:hidden-kb-checkpoints:v1";

/** 从知识库中获取预设分类列表 */
const PRESET_CATEGORIES: string[] = (() => {
  const cats = Object.values(CATEGORY_META).map((m) => m.label);
  const topics = ALL_TOPICS.map((t) => t.title);
  return [...cats, ...topics];
})();

/** 将知识库 checkpoint 生成为 QuestionItem 列表 */
function generateKbQuestions(): QuestionItem[] {
  const items: QuestionItem[] = [];
  for (const topic of ALL_TOPICS) {
    for (const cp of topic.checkpoints) {
      items.push({
        id: `kb-${cp.id}`,
        category: topic.title,
        question: {
          zh: cp.interviewAngles[0] || cp.name,
          en: cp.interviewAnglesEn?.[0] || cp.nameEn || "",
        },
        answer: { zh: cp.mustKnow, en: cp.mustKnowEn || "" },
        createdAt: 0,
        updatedAt: 0,
      });
    }
  }
  return items;
}

const KB_QUESTIONS = generateKbQuestions();

function loadHiddenKbIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY_HIDDEN_KB);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveHiddenKbIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_HIDDEN_KB, JSON.stringify([...ids]));
  } catch {
    /* quota exceeded */
  }
}

interface Props {
  refreshKey: number;
}

export function BrowseQuestionsPanel({ refreshKey }: Props) {
  const t = useT();
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [hiddenKbIds, setHiddenKbIds] = useState<Set<string>>(loadHiddenKbIds);
  const [filterCategory, setFilterCategory] = useState("");
  const [searchText, setSearchText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const { loadQuestions, loadQuestionsFromServer } = require("@/lib/storage");
    // Try server first, then localStorage
    loadQuestionsFromServer().then(() => {
      setQuestions(loadQuestions());
    });
    setHiddenKbIds(loadHiddenKbIds());
  }, [refreshKey]);

  /** 合并知识库预置题目与用户自定义题目，用户编辑过的版本优先 */
  const mergedQuestions = useMemo(() => {
    const userMap = new Map(questions.map((q) => [q.id, q]));
    const result: QuestionItem[] = [];

    for (const kb of KB_QUESTIONS) {
      if (hiddenKbIds.has(kb.id)) continue;
      result.push(userMap.get(kb.id) || kb);
    }

    // 纯用户自定义题目（非 kb- 前缀）
    for (const q of questions) {
      if (!q.id.startsWith("kb-")) {
        result.push(q);
      }
    }

    return result;
  }, [questions, hiddenKbIds]);

  const categories = useMemo(() => {
    const cats = [...new Set(mergedQuestions.map((q) => q.category))];
    return [...new Set([...PRESET_CATEGORIES, ...cats])].sort();
  }, [mergedQuestions]);

  const filtered = useMemo(() => {
    return mergedQuestions.filter((q) => {
      const matchCategory = !filterCategory || q.category === filterCategory;
      const matchSearch =
        !searchText ||
        q.question.zh.includes(searchText) ||
        q.question.en.toLowerCase().includes(searchText.toLowerCase()) ||
        q.answer.zh.includes(searchText) ||
        q.answer.en.toLowerCase().includes(searchText.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [mergedQuestions, filterCategory, searchText]);

  function handleDelete(id: string) {
    if (id.startsWith("kb-")) {
      const next = new Set(hiddenKbIds);
      next.add(id);
      setHiddenKbIds(next);
      saveHiddenKbIds(next);
    } else {
      const { deleteQuestion } = require("@/lib/storage");
      deleteQuestion(id);
      setQuestions((prev) => prev.filter((q) => q.id !== id));
    }
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function handleUpdate() {
    const { loadQuestions } = require("@/lib/storage");
    setQuestions(loadQuestions());
    setHiddenKbIds(loadHiddenKbIds());
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleExportJson() {
    const items =
      selected.size > 0
        ? mergedQuestions.filter((q) => selected.has(q.id))
        : filtered;
    exportAsJson(items);
  }

  function handleExportMarkdown() {
    const items =
      selected.size > 0
        ? mergedQuestions.filter((q) => selected.has(q.id))
        : filtered;
    exportAsMarkdown(items);
  }

  function handleShowHidden() {
    setHiddenKbIds(new Set());
    saveHiddenKbIds(new Set());
  }

  const kbCount = KB_QUESTIONS.length;
  const hiddenCount = hiddenKbIds.size;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          className="px-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="">{t.bank.allCategories}</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={t.bank.searchPlaceholder}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>

        {hiddenCount > 0 && (
          <button
            onClick={handleShowHidden}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <EyeOff className="w-3 h-3" />
            显示已隐藏 ({hiddenCount})
          </button>
        )}

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
        {filtered.length} / {mergedQuestions.length}{" "}
        <span className="text-zinc-400">
          （知识库 {kbCount - hiddenCount}/{kbCount}）
        </span>
        {selected.size > 0 && ` (${selected.size} 已选)`}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-400 dark:text-zinc-500">
          {t.bank.noQuestions}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((q) => (
            <div key={q.id} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={selected.has(q.id)}
                onChange={() => toggleSelect(q.id)}
                className="mt-3 ml-1 shrink-0"
              />
              <div className="flex-1">
                <QuestionRow item={q} onDelete={handleDelete} onUpdate={handleUpdate} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
