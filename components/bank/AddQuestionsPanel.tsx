"use client";

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { SingleQuestionForm } from "./SingleQuestionForm";
import { BatchQuestionForm } from "./BatchQuestionForm";
import { ALL_TOPICS, CATEGORY_META } from "@/lib/knowledge";
import { CategoryTree, OTHER_CATEGORY } from "./CategoryTree";
import type { BankCategoryOption } from "./EditQuestionDialog";

interface Props {
  categories: BankCategoryOption[];
  onSaved?: () => void;
}

/** 单层提取题目标签里显示的目录段（取最后一段） */
function labelOf(c: BankCategoryOption): string {
  return c.path === "data" ? OTHER_CATEGORY : c.label;
}

export function AddQuestionsPanel({ categories, onSaved }: Props) {
  const t = useT();
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [topicId, setTopicId] = useState<string>("");
  // 默认分类：其他（data/other_question.md）
  const [selectedPath, setSelectedPath] = useState<string>("data");

  const resolvedCategory = selectedPath === "data" ? OTHER_CATEGORY : labelOf(categories.find((c) => c.path === selectedPath) ?? { path: selectedPath, label: selectedPath.split("/").pop() ?? selectedPath, file: "" });

  const targetFile = selectedPath === "data" ? "data/other_question.md" : `${selectedPath}/question.md`;

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

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 items-start">
        {/* 分类文件夹树（与笔记库一致） */}
        <div>
          <div className="text-xs font-medium text-zinc-500 mb-2">目标分类（写入哪里的 question.md）</div>
          <CategoryTree
            categories={categories}
            countOf={() => 0}
            selected={selectedPath}
            onSelect={setSelectedPath}
          />
          <p className="mt-2 text-[10px] text-zinc-400">
            将写入 <code className="px-1 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded break-all">{targetFile}</code>
          </p>
        </div>

        <div className="min-w-0">
          {mode === "single" ? (
            <SingleQuestionForm category={resolvedCategory} topicId={topicId} onSaved={() => onSaved?.()} />
          ) : (
            <BatchQuestionForm defaultCategory={resolvedCategory} topicId={topicId} onSaved={() => onSaved?.()} />
          )}
        </div>
      </div>
    </div>
  );
}
