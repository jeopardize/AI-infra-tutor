"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/context";
import { Loader2, Sparkles } from "lucide-react";
import { CATEGORY_META } from "@/lib/knowledge";
import { ALL_TOPICS } from "@/lib/knowledge";

/** 知识库预设分类列表 */
const PRESET_CATEGORIES: string[] = (() => {
  const cats = Object.values(CATEGORY_META).map((m) => m.label);
  const topics = ALL_TOPICS.map((t) => t.title);
  return [...cats, ...topics];
})();

interface ParsedItem {
  category: string;
  question: { zh: string; en: string };
  answer: { zh: string; en: string };
  hasGaps: boolean;
}

interface Props {
  defaultCategory: string;
  onSaved: () => void;
}

export function BatchQuestionForm({ defaultCategory, onSaved }: Props) {
  const t = useT();
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ParsedItem[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [completingAll, setCompletingAll] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [skipCount, setSkipCount] = useState(0);

  function handleParse() {
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const items: ParsedItem[] = [];
    let skipped = 0;

    // 获取已有分类 + 知识库预设分类，帮助判断第一字段是否是分类名
    let existingCats: string[] = [];
    try {
      existingCats = require("@/lib/storage").getCategories();
    } catch {}
    const allKnownCats = [...new Set([...PRESET_CATEGORIES, ...existingCats])];

    for (const line of lines) {
      const parts = line.split("||").map((p) => p.trim());
      let cat: string;
      let qZh = "", qEn = "", aZh = "", aEn = "";

      if (parts.length === 1 && parts[0]) {
        // 只有问题(zh)，使用默认分类
        cat = defaultCategory;
        qZh = parts[0];
      } else if (parts.length === 2) {
        // 两种情况：
        // a) 分类 || 问题(zh)     ——第一字段匹配已有分类
        // b) 问题(zh) || 问题(en) ——第一字段不是分类名
        if (defaultCategory && allKnownCats.length > 0 && allKnownCats.includes(parts[0])) {
          cat = parts[0];
          qZh = parts[1];
        } else if (defaultCategory) {
          cat = defaultCategory;
          qZh = parts[0];
          qEn = parts[1];
        } else {
          cat = parts[0];
          qZh = parts[1];
        }
      } else if (parts.length === 3) {
        if (defaultCategory && allKnownCats.length > 0 && allKnownCats.includes(parts[0])) {
          cat = parts[0];
          qZh = parts[1];
          qEn = parts[2];
        } else if (defaultCategory) {
          cat = defaultCategory;
          qZh = parts[0];
          qEn = parts[1];
          aZh = parts[2];
        } else {
          cat = parts[0];
          qZh = parts[1];
          qEn = parts[2];
        }
      } else {
        // 4+ 部分：分类 || 问题(zh) || 问题(en) || 答案(zh) || [答案(en)]
        cat = parts[0] || defaultCategory;
        qZh = parts[1] || "";
        qEn = parts[2] || "";
        aZh = parts[3] || "";
        aEn = parts[4] || "";
      }

      if (!cat || (!qZh && !qEn && !aZh && !aEn)) {
        skipped++;
        continue;
      }

      items.push({
        category: cat,
        question: { zh: qZh, en: qEn },
        answer: { zh: aZh, en: aEn },
        hasGaps: !qZh || !qEn || !aZh || !aEn,
      });
    }

    setParsed(items);
    setSkipCount(skipped);
    setMsg(
      items.length > 0
        ? { ok: true, text: t.bank.batchParseSuccess(items.length) }
        : { ok: false, text: t.bank.batchParseFailed },
    );
  }

  async function handleAutoCompleteAll() {
    if (!parsed || parsed.length === 0) return;
    setCompletingAll(true);
    setMsg(null);

    const updated = [...parsed];
    let completed = 0;

    const promises = updated.map(async (item, idx) => {
      const tasks: Promise<void>[] = [];

      if (!item.question.en && item.question.zh) {
        tasks.push(
          fetch("/api/bank/auto-complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: item.question.zh, sourceLang: "zh", targetLang: "en", type: "question" }),
          })
            .then((r) => r.json())
            .then((d) => { updated[idx] = { ...updated[idx], question: { ...updated[idx].question, en: d.translated || "" } }; })
            .catch(() => {}),
        );
      }
      if (!item.question.zh && item.question.en) {
        tasks.push(
          fetch("/api/bank/auto-complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: item.question.en, sourceLang: "en", targetLang: "zh", type: "question" }),
          })
            .then((r) => r.json())
            .then((d) => { updated[idx] = { ...updated[idx], question: { ...updated[idx].question, zh: d.translated || "" } }; })
            .catch(() => {}),
        );
      }
      if (!item.answer.en && item.answer.zh) {
        tasks.push(
          fetch("/api/bank/auto-complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: item.answer.zh, sourceLang: "zh", targetLang: "en", type: "answer" }),
          })
            .then((r) => r.json())
            .then((d) => { updated[idx] = { ...updated[idx], answer: { ...updated[idx].answer, en: d.translated || "" } }; })
            .catch(() => {}),
        );
      }
      if (!item.answer.zh && item.answer.en) {
        tasks.push(
          fetch("/api/bank/auto-complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: item.answer.en, sourceLang: "en", targetLang: "zh", type: "answer" }),
          })
            .then((r) => r.json())
            .then((d) => { updated[idx] = { ...updated[idx], answer: { ...updated[idx].answer, zh: d.translated || "" } }; })
            .catch(() => {}),
        );
      }

      await Promise.allSettled(tasks);
      completed++;
      setParsed([...updated]);
    });

    await Promise.all(promises);
    setCompletingAll(false);
  }

  async function handleSaveAll() {
    if (!parsed || parsed.length === 0) return;
    setSaving(true);
    setMsg(null);
    try {
      const { addQuestion } = await import("@/lib/storage");
      for (const item of parsed) {
        addQuestion({
          category: item.category,
          question: item.question,
          answer: item.answer,
        });
      }
      setMsg({ ok: true, text: `${t.bank.saveSuccess}（${parsed.length} ${t.common.save}）` });
      setRaw("");
      setParsed(null);
      onSaved();
    } catch {
      setMsg({ ok: false, text: t.bank.saveFailed });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{t.bank.batchFormatHint}</div>

      <textarea
        className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono"
        rows={8}
        placeholder={t.bank.batchPlaceholder}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />

      <div className="flex gap-2">
        <button
          onClick={handleParse}
          disabled={!raw.trim()}
          className="px-3 py-1.5 text-sm rounded-md bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-40"
        >
          解析并预览
        </button>
        {parsed && parsed.length > 0 && (
          <>
            <button
              onClick={handleAutoCompleteAll}
              disabled={completingAll}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
            >
              {completingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {completingAll ? t.bank.aiCompleting : t.bank.aiAutoCompleteAll}
            </button>
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700"
            >
              {saving ? t.common.loading : t.bank.save}
            </button>
          </>
        )}
      </div>

      {msg && (
        <div className={`text-sm ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
          {msg.text}
        </div>
      )}

      {skipCount > 0 && (
        <div className="text-xs text-zinc-400">跳过了 {skipCount} 行格式错误的条目</div>
      )}

      {parsed && parsed.length > 0 && (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-zinc-100 dark:bg-zinc-800">
              <tr>
                <th className="px-2 py-1 text-left">分类</th>
                <th className="px-2 py-1 text-left">问题(ZH)</th>
                <th className="px-2 py-1 text-left">问题(EN)</th>
                <th className="px-2 py-1 text-left">答案(ZH)</th>
                <th className="px-2 py-1 text-left">答案(EN)</th>
              </tr>
            </thead>
            <tbody>
              {parsed.map((item, i) => (
                <tr key={i} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-2 py-1">{item.category}</td>
                  <td className={`px-2 py-1 ${!item.question.zh ? "text-rose-400" : ""}`}>
                    {item.question.zh || "—"}
                  </td>
                  <td className={`px-2 py-1 ${!item.question.en ? "text-rose-400" : ""}`}>
                    {item.question.en || "—"}
                  </td>
                  <td className={`px-2 py-1 ${!item.answer.zh ? "text-rose-400" : ""}`}>
                    {item.answer.zh || "—"}
                  </td>
                  <td className={`px-2 py-1 ${!item.answer.en ? "text-rose-400" : ""}`}>
                    {item.answer.en || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
