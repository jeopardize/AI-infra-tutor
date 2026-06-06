"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Check,
  ExternalLink,
  Eye,
  Loader2,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { useT } from "@/lib/i18n/context";

interface DocReadResp {
  root: string;
  path: string;
  dir: string;
  name: string;
  content: string;
  bytes: number;
  mtime: number;
  error?: string;
  hint?: string;
}

interface WriteResp {
  path?: string;
  bytes?: number;
  mtime?: number;
  error?: string;
  currentMtime?: number;
  message?: string;
}

export function DocDrawer({
  docPath,
  onClose,
  onSaved,
}: {
  docPath: string | null;
  onClose: () => void;
  /** 保存成功后回调（用于刷新外部列表的 mtime/大小） */
  onSaved?: (path: string, mtime: number) => void;
}) {
  const t = useT();
  const [data, setData] = useState<DocReadResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [draft, setDraft] = useState<string>("");
  const [savedMtime, setSavedMtime] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveMsgKind, setSaveMsgKind] = useState<"ok" | "warn" | "err">("ok");
  const draftRef = useRef<HTMLTextAreaElement>(null);

  // 拉取文档内容
  useEffect(() => {
    if (!docPath) {
      setData(null);
      setErr(null);
      setMode("preview");
      setDraft("");
      setSavedMtime(undefined);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch(`/api/docs/read?path=${encodeURIComponent(docPath)}`)
      .then(async (r) => {
        const json = (await r.json()) as DocReadResp;
        if (cancelled) return;
        if (!r.ok) {
          setErr(json.error ?? "读取失败");
          setData(null);
        } else {
          setData(json);
          setDraft(json.content);
          setSavedMtime(json.mtime);
        }
      })
      .catch((e) => {
        if (!cancelled) setErr((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [docPath]);

  // 切到编辑模式时聚焦
  useEffect(() => {
    if (mode === "edit") {
      draftRef.current?.focus();
    }
  }, [mode]);

  // Cmd/Ctrl+S 保存
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        if (mode === "edit" && dirty && !saving) {
          e.preventDefault();
          void save();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, draft, savedMtime, saving]);

  if (!docPath) return null;

  const dirty = data ? draft !== data.content : false;

  async function save() {
    if (!data) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await fetch("/api/docs/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: data.path,
          content: draft,
          expectMtime: savedMtime,
        }),
      });
      const json = (await r.json()) as WriteResp;
      if (!r.ok) {
        if (r.status === 409 && json.currentMtime) {
          setSaveMsg(t.docDrawer.saveExternalConflict);
          setSaveMsgKind("warn");
        } else {
          setSaveMsg(t.docDrawer.saveFailed(json.error ?? r.statusText));
          setSaveMsgKind("err");
        }
        return;
      }
      // 同步本地状态
      setData({ ...data, content: draft, mtime: json.mtime!, bytes: json.bytes! });
      setSavedMtime(json.mtime);
      setSaveMsg(t.docDrawer.saveOk);
      setSaveMsgKind("ok");
      onSaved?.(data.path, json.mtime!);
      // 2 秒后清掉提示
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (e) {
      setSaveMsg(t.docDrawer.saveFailed((e as Error).message));
      setSaveMsgKind("err");
    } finally {
      setSaving(false);
    }
  }

  function reload() {
    if (!docPath) return;
    setDraft("");
    setData(null);
    setErr(null);
    // 触发 effect 重新 fetch
    const p = docPath;
    setTimeout(() => {
      // 通过 close + reopen 模拟 reload；更简单：直接重新 fetch
      void (async () => {
        setLoading(true);
        const r = await fetch(`/api/docs/read?path=${encodeURIComponent(p)}`);
        const json = (await r.json()) as DocReadResp;
        if (r.ok) {
          setData(json);
          setDraft(json.content);
          setSavedMtime(json.mtime);
          setSaveMsg(null);
        } else {
          setErr(json.error ?? t.docDrawer.readFailed(""));
        }
        setLoading(false);
      })();
    }, 0);
  }

  // 给 react-markdown 用：把相对图片路径改写到 /api/docs/asset
  const baseDir = data?.dir ?? "";
  function rewriteAsset(src: string): string {
    if (!src) return src;
    if (/^(https?:|data:|\/)/.test(src)) return src;
    const joined = baseDir ? `${baseDir}/${src}` : src;
    const parts: string[] = [];
    for (const seg of joined.split("/")) {
      if (seg === "." || seg === "") continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    return `/api/docs/asset?path=${encodeURIComponent(parts.join("/"))}`;
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={() => {
          if (dirty) {
            if (!confirm(t.docDrawer.confirmCloseUnsaved)) return;
          }
          onClose();
        }}
      />
      <aside className="fixed top-0 right-0 h-full w-full sm:w-[640px] lg:w-[820px] bg-white dark:bg-zinc-950 z-50 shadow-2xl flex flex-col border-l border-zinc-200 dark:border-zinc-800">
        <header className="flex items-center justify-between gap-2 px-4 h-12 border-b border-zinc-200 dark:border-zinc-800">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-zinc-500 truncate">
              {t.docDrawer.headerLabel(data?.dir ?? "")}
            </div>
            <div className="font-medium truncate flex items-center gap-1.5">
              {data?.name ?? docPath}
              {dirty && (
                <span className="text-xs text-amber-600">● {t.common.unsaved}</span>
              )}
            </div>
          </div>

          {/* 模式切换 / 保存 */}
          {data && (
            <div className="flex items-center gap-1">
              {mode === "edit" ? (
                <>
                  <button
                    onClick={save}
                    disabled={!dirty || saving}
                    title="Cmd/Ctrl+S"
                    className="px-2.5 py-1 text-xs rounded-md bg-emerald-600 text-white disabled:opacity-40 hover:bg-emerald-700 flex items-center gap-1"
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    {t.common.save}
                  </button>
                  <button
                    onClick={() => setMode("preview")}
                    className="px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" /> {t.common.preview}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setMode("edit")}
                  className="px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1"
                >
                  <Pencil className="w-3.5 h-3.5" /> {t.common.edit}
                </button>
              )}
            </div>
          )}
          <button
            onClick={() => {
              if (dirty && !confirm(t.docDrawer.confirmCloseUnsaved)) return;
              onClose();
            }}
            className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label={t.common.close}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* 顶部消息条（保存结果） */}
        {saveMsg && (
          <div className="px-4 py-2 text-xs flex items-center justify-between bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            <span
              className={
                saveMsgKind === "ok"
                  ? "text-emerald-600 flex items-center gap-1"
                  : "text-rose-600"
              }
            >
              {saveMsgKind === "ok" && <Check className="w-3 h-3" />}
              {saveMsg}
            </span>
            {saveMsgKind === "warn" && (
              <button
                onClick={reload}
                className="text-xs text-blue-600 hover:underline"
              >
                {t.docDrawer.reload}
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 text-zinc-500 p-5">
              <Loader2 className="w-4 h-4 animate-spin" /> {t.docDrawer.loading}
            </div>
          )}
          {err && (
            <div className="text-rose-600 text-sm p-5">
              {t.docDrawer.readFailed(err)}
            </div>
          )}

          {data && mode === "preview" && (
            <div className="p-5">
              {data.content.trim() === "" ? (
                <div className="text-zinc-400 italic">
                  {t.docDrawer.emptyContent}
                </div>
              ) : (
                <div className="prose-tutor">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      img: ({ src, alt, ...rest }) => (
                        <img
                          src={
                            typeof src === "string"
                              ? rewriteAsset(src)
                              : undefined
                          }
                          alt={alt ?? ""}
                          style={{ maxWidth: "100%", height: "auto" }}
                          {...rest}
                        />
                      ),
                      a: ({ href, children, ...rest }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          {...rest}
                        >
                          {children}
                          <ExternalLink className="inline w-3 h-3 ml-0.5 align-baseline" />
                        </a>
                      ),
                    }}
                  >
                    {data.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {data && mode === "edit" && (
            <textarea
              ref={draftRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              className="w-full h-full min-h-[300px] p-5 text-sm font-mono leading-relaxed bg-transparent outline-none resize-none"
              placeholder=""
            />
          )}
        </div>

        {data && (
          <footer className="px-4 py-2 text-xs text-zinc-500 border-t border-zinc-200 dark:border-zinc-800 flex justify-between">
            <span>
              {Math.round((data.bytes ?? 0) / 1024)} KB
              {mode === "edit" && (
                <span className="ml-3">{t.docDrawer.charsCount(draft.length)}</span>
              )}
            </span>
            <span>{t.docDrawer.updatedAt(new Date(data.mtime).toLocaleString())}</span>
          </footer>
        )}
      </aside>
    </>
  );
}
