"use client";

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { SingleQuestionForm } from "./SingleQuestionForm";
import { BatchQuestionForm } from "./BatchQuestionForm";
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
  // 默认分类：其他（data/other_question.md）
  const [selectedPath, setSelectedPath] = useState<string>("data");

  const resolvedCategory = selectedPath === "data" ? OTHER_CATEGORY : labelOf(categories.find((c) => c.path === selectedPath) ?? { path: selectedPath, label: selectedPath.split("/").pop() ?? selectedPath, file: "" });

  const targetFile = selectedPath === "data" ? "data/other_question.md" : `${selectedPath}/question.md`;

  return (
    <div className="space-y-5">
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
            <SingleQuestionForm category={resolvedCategory} onSaved={() => onSaved?.()} />
          ) : (
            <BatchQuestionForm defaultCategory={resolvedCategory} onSaved={() => onSaved?.()} />
          )}
        </div>
      </div>
    </div>
  );
}
