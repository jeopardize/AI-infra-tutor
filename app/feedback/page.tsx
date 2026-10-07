"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n/context";
import {
  Loader2,
  Send,
  Trash2,
  MessageSquarePlus,
  Archive,
} from "lucide-react";
import type { FeedbackItem } from "@/app/api/feedback/route";

export default function FeedbackPage() {
  const { t } = useLang();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/feedback");
      const data = (await res.json()) as { items: FeedbackItem[] };
      setItems(data.items.sort((a, b) => b.createdAt - a.createdAt));
    } catch {
      setError("load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error();
      setContent("");
      await load();
    } catch {
      setError(t.feedback.submit + " failed");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(t.feedback.deleteConfirm)) return;
    await fetch(`/api/feedback?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await load();
  };

  const open = items.filter((it) => it.status === "open").length;
  const done = items.length - open;

  const clearDone = async () => {
    if (!confirm(`确认清掉 ${done} 条已处理反馈吗？（处理摘要已沉淀在版本发布记录中）`)) return;
    const res = await fetch("/api/feedback?action=clear-done", { method: "POST" });
    if (res.ok) await load();
    else setError("清除失败");
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
        <MessageSquarePlus className="w-6 h-6 text-[#1a73e8]" />
        {t.feedback.title}
      </h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
        {t.feedback.subtitle}
      </p>

      {/* 提交框 */}
      <div className="mt-6 border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 bg-white dark:bg-[#292a2d]">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t.feedback.placeholder}
          rows={4}
          className="w-full resize-y text-sm bg-transparent outline-none min-h-24"
        />
        <div className="flex justify-end items-center gap-3 mt-2">
          {content.trim() && (
            <span className="text-xs text-zinc-400">{content.length}</span>
          )}
          <button
            onClick={submit}
            disabled={!content.trim() || submitting}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md bg-[#1a73e8] text-white disabled:opacity-40 hover:bg-[#1557b0] transition-colors"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {t.feedback.submit}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-500 mt-2">{error}</p>}

      {/* 列表 */}
      <div className="mt-6 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
        <span>{items.length ? t.feedback.count(items.length, done) : ""}</span>
        <div className="flex items-center gap-2">
          {done > 0 && (
            <button
              onClick={clearDone}
              title="已处理意见的总结已在每次版本发布的提交信息中沉淀，清掉列表即可"
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Archive className="w-3.5 h-3.5" /> 清掉已处理（{done}）
            </button>
          )}
          <span className="text-xs">{t.feedback.note}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-zinc-400 py-10">
          {t.feedback.empty}
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {/* 待处理排前，已处理靠后淡化 */}
          {[...items]
            .sort((a, b) => {
              if ((a.status === "open") !== (b.status === "open")) return a.status === "open" ? -1 : 1;
              return b.createdAt - a.createdAt;
            })
            .map((it) => (
            <li
              key={it.id}
              className={`border rounded-lg p-4 bg-white dark:bg-[#292a2d] ${
                it.status === "open"
                  ? "border-zinc-200 dark:border-zinc-700"
                  : "border-zinc-100 dark:border-zinc-800 opacity-70"
              }`}
            >
              <div className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
                <span
                  className={`px-1.5 py-0.5 rounded ${
                    it.status === "open"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  }`}
                >
                  {it.status === "open"
                    ? t.feedback.statusOpen
                    : t.feedback.statusDone}
                </span>
                <span>
                  {new Date(it.createdAt).toLocaleString("zh-CN")}
                </span>
                <button
                  onClick={() => remove(it.id)}
                  title={t.common.delete}
                  className="ml-auto p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-sm whitespace-pre-wrap">{it.content}</p>
              {it.note && (
                <p className="text-xs text-zinc-400 mt-2 border-t border-dashed border-zinc-200 dark:border-zinc-700 pt-2">
                  {it.note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
