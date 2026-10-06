"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { AddQuestionsPanel } from "@/components/bank/AddQuestionsPanel";
import { BrowseQuestionsPanel, type BankQuestion } from "@/components/bank/BrowseQuestionsPanel";
import type { BankCategoryOption } from "@/components/bank/EditQuestionDialog";
import { Loader2 } from "lucide-react";

interface QuestionsResp {
  root?: string;
  categories?: { path: string; label: string; file: string }[];
  questions?: BankQuestion[];
  error?: string;
}

function BankInner() {
  const t = useT();
  const [tab, setTab] = useState<"add" | "browse">("browse");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [categories, setCategories] = useState<BankCategoryOption[]>([]);
  const [items, setItems] = useState<BankQuestion[]>([]);
  const [root, setRoot] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/questions");
      const data = (await res.json()) as QuestionsResp;
      if (data.error) {
        setLoadError(data.error);
        setItems([]);
        setCategories([]);
      } else {
        setCategories(data.categories ?? []);
        setItems(data.questions ?? []);
        setRoot(data.root ?? "");
        setLoadError("");
      }
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const afterChange = () => setRefreshKey((k) => k + 1);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-1">{t.bank.title}</h1>
      <p className="text-zinc-500 dark:text-zinc-400 mb-2">{t.bank.subtitle}</p>
      <p className="text-xs text-zinc-400 mb-6 break-all">
        题库根目录：{root || "~/Documents/knowlege_library"} —— 分类对应文件夹中的 question.md；「其他」对应 data/other_question.md
      </p>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => setTab("browse")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            tab === "browse"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          浏览题库
        </button>
        <button
          onClick={() => setTab("add")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            tab === "add"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          {t.bank.addTab}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-8 text-zinc-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> 正在读取笔记库题库…
        </div>
      ) : loadError ? (
        <div className="p-8 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 text-sm">
          读取失败：{loadError}
        </div>
      ) : tab === "browse" ? (
        <BrowseQuestionsPanel
          refreshKey={refreshKey}
          categories={categories}
          items={items}
          onChange={afterChange}
        />
      ) : (
        <AddQuestionsPanel categories={categories} onSaved={afterChange} />
      )}
    </div>
  );
}

export default function BankPage() {
  return (
    <Suspense fallback={<div className="p-6 text-zinc-500">Loading...</div>}>
      <BankInner />
    </Suspense>
  );
}
