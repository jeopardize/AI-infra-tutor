"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/context";
import { SingleQuestionForm } from "./SingleQuestionForm";
import { BatchQuestionForm } from "./BatchQuestionForm";
import { ALL_TOPICS, CATEGORY_META } from "@/lib/knowledge";
import type { BankCategoryOption } from "./EditQuestionDialog";

interface Props {
  categories: BankCategoryOption[];
  onSaved?: () => void;
}

export function AddQuestionsPanel({ categories, onSaved }: Props) {
  const t = useT();
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [topicId, setTopicId] = useState<string>("");

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

      {/* Category selection: 会直接决定 question.md 存放位置 */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {t.bank.category}（笔记库文件夹 · 决定文件存放位置）
        </label>
        <p className="text-xs text-zinc-500">
          在下方模式中选择目标分类；题目会被写入对应文件夹的 question.md
          {` `}（「其他」→ data/other_question.md）
        </p>
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

      {mode === "single" ? (
        <SingleQuestionPanel categories={categories} topicId={topicId} onSaved={onSaved} />
      ) : (
        <CategoryBatchPanel categories={categories} topicId={topicId} onSaved={onSaved} />
      )}
    </div>
  );
}

function SingleQuestionPanel({
  categories,
  topicId,
  onSaved,
}: {
  categories: BankCategoryOption[];
  topicId: string;
  onSaved?: () => void;
}) {
  const [category, setCategory] = useState("");
  return (
    <>
      <CategoryPicker categories={categories} value={category} onChange={setCategory} />
      {category ? (
        <SingleQuestionForm category={category} topicId={topicId} onSaved={() => onSaved?.()} />
      ) : (
        <div className="text-sm text-amber-600 dark:text-amber-400">请先选择分类</div>
      )}
    </>
  );
}

function CategoryBatchPanel({
  categories,
  topicId,
  onSaved,
}: {
  categories: BankCategoryOption[];
  topicId: string;
  onSaved?: () => void;
}) {
  const [category, setCategory] = useState("");
  return (
    <>
      <CategoryPicker categories={categories} value={category} onChange={setCategory} allowEmpty />
      <BatchQuestionForm defaultCategory={category} topicId={topicId} onSaved={() => onSaved?.()} />
    </>
  );
}

export function CategoryPicker({
  categories,
  value,
  onChange,
  allowEmpty,
}: {
  categories: BankCategoryOption[];
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <select
      className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{allowEmpty ? "不指定（每行可用「分类 || 题目」分别指定）" : "选择分类…"}</option>
      {categories.map((c) => (
        <option key={c.path} value={c.label}>
          {c.path === "data" ? "其他（data/other_question.md）" : `${c.label}（${c.path}/question.md）`}
        </option>
      ))}
    </select>
  );
}
