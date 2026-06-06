"use client";

import { useState } from "react";
import { Download, ExternalLink, Loader2, Trash2, X } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import {
  defaultExportFilename,
  sessionToMarkdown,
} from "@/lib/interviewExport";
import type { InterviewSession } from "@/lib/storage";
import { useT } from "@/lib/i18n/context";

export function InterviewDetailDrawer({
  session,
  exportDir,
  onClose,
  onDelete,
  onOpenExported,
}: {
  session: InterviewSession | null;
  /** 相对 library 根的目录 */
  exportDir: string;
  onClose: () => void;
  onDelete: (id: string) => void;
  /** 导出成功后调用，把笔记路径传上去（便于在 DocDrawer 里打开） */
  onOpenExported?: (path: string) => void;
}) {
  const t = useT();
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgKind, setMsgKind] = useState<"ok" | "err">("ok");

  if (!session) return null;

  const dateStr = new Date(session.at).toLocaleString("zh-CN");
  const transcript = session.messages.slice(1); // 跳过首条触发消息
  const sc = session.scorecard;

  async function exportToMd() {
    if (!session) return;
    setExporting(true);
    setMsg(null);
    try {
      const filename = defaultExportFilename(session);
      const fullPath = exportDir
        ? `${exportDir.replace(/\/$/, "")}/${filename}`
        : filename;
      const content = sessionToMarkdown(session);
      const r = await fetch("/api/docs/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: fullPath,
          content,
          createParents: true,
        }),
      });
      const json = await r.json();
      if (!r.ok) {
        setMsg(`${t.interview.exportFailed}: ${json.error ?? r.statusText}`);
        setMsgKind("err");
        return;
      }
      setMsg(t.interview.exportedTo(fullPath));
      setMsgKind("ok");
      onOpenExported?.(fullPath);
    } catch (e) {
      setMsg(`${t.interview.exportFailed}: ${(e as Error).message}`);
      setMsgKind("err");
    } finally {
      setExporting(false);
    }
  }

  function downloadLocal() {
    if (!session) return;
    const filename = defaultExportFilename(session);
    const blob = new Blob([sessionToMarkdown(session)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function del() {
    if (!session) return;
    if (!confirm(t.interview.confirmRemoveHistoryFile)) return;
    onDelete(session.id);
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-full sm:w-[640px] lg:w-[820px] bg-white dark:bg-zinc-950 z-50 shadow-2xl flex flex-col border-l border-zinc-200 dark:border-zinc-800">
        <header className="flex items-center justify-between gap-2 px-4 h-12 border-b border-zinc-200 dark:border-zinc-800">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-zinc-500 truncate">
              {t.interview.fromHistory} · {dateStr}
            </div>
            <div className="font-medium truncate">
              {session.config.level} · {session.config.focus.join("/")} ·{" "}
              {session.config.durationMin}min
              {sc && (
                <span className="ml-2 text-emerald-600 font-bold">
                  {sc.overall}/100
                </span>
              )}
            </div>
          </div>
          <button
            onClick={exportToMd}
            disabled={exporting}
            title={t.interview.exportMd}
            className="px-2.5 py-1 text-xs rounded-md bg-emerald-600 text-white disabled:opacity-40 hover:bg-emerald-700 flex items-center gap-1"
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            {t.interview.exportMd}
          </button>
          <button
            onClick={downloadLocal}
            title={t.common.download}
            className="px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {t.common.download}
          </button>
          <button
            onClick={del}
            title={t.common.delete}
            className="p-1.5 rounded-md hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-600"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label={t.common.close}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {msg && (
          <div
            className={
              "px-4 py-2 text-xs border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between " +
              (msgKind === "ok"
                ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40"
                : "text-rose-700 bg-rose-50 dark:bg-rose-950/40")
            }
          >
            <span>{msg}</span>
            {msgKind === "ok" && (
              <span className="text-zinc-500">{t.interview.exportedHint}</span>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Scorecard 摘要 */}
          {sc && (
            <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 bg-zinc-50 dark:bg-zinc-900">
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-2xl font-bold text-emerald-600">
                  {sc.overall}
                  <span className="text-xs text-zinc-400">/100</span>
                </span>
                <span className="text-sm text-zinc-600 dark:text-zinc-300">
                  {sc.summary}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <DimBox label={t.interview.dimConceptClarity} value={sc.dimensions.concept_clarity} />
                <DimBox label={t.interview.dimSystemDesign} value={sc.dimensions.system_design} />
                <DimBox label={t.interview.dimPracticalExperience} value={sc.dimensions.practical_experience} />
                <DimBox label={t.interview.dimCommunication} value={sc.dimensions.communication} />
              </div>
              {(sc.knowledge_gaps.length > 0 || sc.next_steps.length > 0) && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {sc.knowledge_gaps.length > 0 && (
                    <div>
                      <div className="font-semibold mb-1 text-amber-700 dark:text-amber-400">
                        {t.interview.knowledgeGapsShort}
                      </div>
                      <ul className="space-y-0.5 text-zinc-700 dark:text-zinc-300">
                        {sc.knowledge_gaps.map((g, i) => (
                          <li key={i}>
                            {g.checkpoint_id && (
                              <code className="mr-1">{g.checkpoint_id}</code>
                            )}
                            {g.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {sc.next_steps.length > 0 && (
                    <div>
                      <div className="font-semibold mb-1 text-blue-700 dark:text-blue-400">
                        {t.interview.nextStepsShort}
                      </div>
                      <ul className="space-y-0.5 text-zinc-700 dark:text-zinc-300">
                        {sc.next_steps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* 完整对话 */}
          <section>
            <h3 className="text-sm font-semibold mb-3 text-zinc-500">
              {t.interview.transcriptCount(transcript.length)}
            </h3>
            <div className="space-y-3">
              {transcript.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user" ? "flex justify-end" : "flex justify-start"
                  }
                >
                  <div
                    className={
                      "max-w-[88%] rounded-lg px-3 py-2 text-sm " +
                      (m.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-100 dark:bg-zinc-800")
                    }
                  >
                    <div
                      className={
                        "text-xs font-semibold mb-1 " +
                        (m.role === "user"
                          ? "text-blue-100"
                          : "text-zinc-500 dark:text-zinc-400")
                      }
                    >
                      {m.role === "user" ? t.interview.me : t.interview.interviewer}
                    </div>
                    {m.role === "assistant" ? (
                      <Markdown>{m.content}</Markdown>
                    ) : (
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="px-4 py-2 text-xs text-zinc-500 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <span>{t.interview.sessionId}: <code>{session.id}</code></span>
          <span>
            {t.interview.exportingTo}: <code>{exportDir || t.interview.libraryRoot}</code>
          </span>
        </footer>
      </aside>
    </>
  );
}

function DimBox({ label, value }: { label: string; value: number }) {
  const color =
    value >= 80 ? "bg-emerald-500" : value >= 60 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="p-2 rounded bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
      <div className="text-zinc-500">{label}</div>
      <div className="flex items-center gap-2 mt-0.5">
        <div className="text-base font-semibold tabular-nums">{value}</div>
        <div className="flex-1 h-1 bg-zinc-200 dark:bg-zinc-800 rounded">
          <div
            className={`h-full rounded ${color}`}
            style={{ width: `${value}%` }}
          />
        </div>
      </div>
    </div>
  );
}
