"use client";

import { Suspense, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { AddQuestionsPanel } from "@/components/bank/AddQuestionsPanel";
import { BrowseQuestionsPanel } from "@/components/bank/BrowseQuestionsPanel";

function BankInner() {
  const t = useT();
  const [tab, setTab] = useState<"add" | "browse">("add");
  const [refreshKey, setRefreshKey] = useState(0);

  function afterSave() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 min-w-0">
      <h1 className="text-2xl font-bold mb-1">{t.bank.title}</h1>
      <p className="text-zinc-500 dark:text-zinc-400 mb-6">{t.bank.subtitle}</p>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-zinc-200 dark:border-zinc-800">
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
        <button
          onClick={() => setTab("browse")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            tab === "browse"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          {t.bank.browseTab}
        </button>
      </div>

      <div className="min-w-0">
        {tab === "add" ? (
          <AddQuestionsPanel refreshKey={refreshKey} onSaved={afterSave} />
        ) : (
          <BrowseQuestionsPanel refreshKey={refreshKey} />
        )}
      </div>
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
