"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { SingleQuestionForm } from "./SingleQuestionForm";
import { BatchQuestionForm } from "./BatchQuestionForm";
import { CATEGORY_META } from "@/lib/knowledge";
import { ALL_TOPICS } from "@/lib/knowledge";

/** 从知识库中获取预设分类列表：4 大类 + 所有主题标题 */
const PRESET_CATEGORIES: string[] = (() => {
  const cats = Object.values(CATEGORY_META).map((m) => m.label);
  const topics = ALL_TOPICS.map((t) => t.title);
  return [...cats, ...topics];
})();

interface Props {
  refreshKey: number;
  onSaved?: () => void;
}

export function AddQuestionsPanel({ refreshKey, onSaved }: Props) {
  const t = useT();
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [topicId, setTopicId] = useState<string>("");
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  useEffect(() => {
    const { getCategories } = require("@/lib/storage");
    const userCats = getCategories();
    setExistingCategories(userCats);
  }, [refreshKey]);

  /** 合并预设分类 + 用户自定义分类，去重后排序 */
  const allCategories = useMemo(() => {
    return [...new Set([...PRESET_CATEGORIES, ...existingCategories])].sort();
  }, [existingCategories]);

  const resolvedCategory = isNewCategory ? newCategoryName.trim() : category;

  function handleSaved() {
    const { getCategories } = require("@/lib/storage");
    const userCats = getCategories();
    setExistingCategories(userCats);
    onSaved?.();
  }

  return (
    <div className="space-y-5">
      {/* Topic selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          所属主题（Topic）
        </label>
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
        <p className="text-xs text-zinc-500">选择主题后，题目会出现在主页统计和测验系统中</p>
      </div>

      {/* Category selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {t.bank.category}（标签）
        </label>
        {!isNewCategory ? (
          <div className="flex gap-2 items-center">
            <select
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">{t.bank.categoryPlaceholder}</option>
              {allCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              onClick={() => { setIsNewCategory(true); setCategory(""); }}
              className="px-2.5 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0"
            >
              {t.bank.newCategory}
            </button>
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <input
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t.bank.newCategory}
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              autoFocus
            />
            {existingCategories.length > 0 && (
              <button
                onClick={() => { setIsNewCategory(false); setNewCategoryName(""); }}
                className="px-2.5 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0"
              >
                {t.common.cancel}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => setMode("single")}
          className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition ${
            mode === "single"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          {t.bank.singleMode}
        </button>
        <button
          onClick={() => setMode("batch")}
          className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition ${
            mode === "batch"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          {t.bank.batchMode}
        </button>
      </div>

      {/* Category missing warning */}
      {!resolvedCategory && (
        <div className="text-sm text-amber-600 dark:text-amber-400">
          请先选择或输入分类
        </div>
      )}

      {resolvedCategory && mode === "single" && (
        <SingleQuestionForm category={resolvedCategory} topicId={topicId} onSaved={handleSaved} />
      )}

      {mode === "batch" && (
        <BatchQuestionForm defaultCategory={resolvedCategory} topicId={topicId} onSaved={handleSaved} />
      )}
    </div>
  );
}
