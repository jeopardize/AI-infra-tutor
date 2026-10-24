"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import { remarkCallouts } from "@/lib/markdown/callouts";
import { remarkHighlight } from "@/lib/markdown/highlight";
import { markdownCodeComponents } from "@/components/markdown/CodeRenderer";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Code,
  ExternalLink,
  Eye,
  ListTree,
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
  currentMtime?: number;
  error?: string;
  message?: string;
}

interface OutlineItem {
  level: number;
  text: string;
  line: number;
}

/** 从 markdown 源码提取标题大纲（跳过代码块内的 # 行） */
function parseOutline(md: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  let inFence = false;
  md.split("\n").forEach((line, i) => {
    if (/^\s{0,3}(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) return;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (m) items.push({ level: m[1].length, text: m[2], line: i });
  });
  return items;
}

const OUTLINE_HEIGHT_KEY = "doc-drawer-outline-height";

/** 图片扩展名：这些文件直接预览，不当作 markdown 读取 */
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

/** 编辑器代码块语言候选（反馈：markdown 需要多种语法代码块输入） */
const CODE_LANGS = [
  "js",
  "ts",
  "json",
  "python",
  "cpp",
  "java",
  "bash",
  "mermaid",
  "yaml",
  "sql",
  "text",
];

/** 单个打开的笔记标签页（多标签：每个文档独立缓存读取/草稿/编辑状态） */
export interface DocTab {
  path: string;
  /** 图片文件：直接预览，无需读取内容 */
  image?: boolean;
  data: DocReadResp | null;
  loading: boolean;
  err: string | null;
  draft: string;
  mode: "preview" | "edit";
  savedMtime: number | undefined;
  saving: boolean;
  saveMsg: string | null;
  saveMsgKind: "ok" | "warn" | "err";
}

export function newDocTab(path: string): DocTab {
  return {
    path,
    image: IMAGE_EXT_RE.test(path),
    data: null,
    loading: false,
    err: null,
    draft: "",
    mode: "preview",
    savedMtime: undefined,
    saving: false,
    saveMsg: null,
    saveMsgKind: "ok",
  };
}

/**
 * 多标签文档状态管理 hook（DocDrawer 抽屉与笔记库分栏共用）。
 * - docPath 变化时新增/激活标签；null 时清空并回调 onClose（无标签时）
 * - 返回 save/refresh 供外部（如 Cmd+S）触发
 */
export function useDocTabs(options: {
  docPath: string | null;
  onClose: () => void;
  onSaved?: (path: string, mtime: number) => void;
}) {
  const { docPath, onClose, onSaved } = options;
  const t = useT();
  const [tabs, setTabs] = useState<DocTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const fetchingRef = useRef<Set<string>>(new Set());

  const activeTab = tabs.find((tb) => tb.path === activePath) ?? null;
  const dirty = activeTab?.data
    ? activeTab.draft !== activeTab.data.content
    : false;

  // docPath 变化 → 新增/激活标签；null → 关闭全部
  useEffect(() => {
    if (!docPath) {
      setTabs([]);
      setActivePath(null);
      return;
    }
    setTabs((prev) =>
      prev.some((tb) => tb.path === docPath) ? prev : [...prev, newDocTab(docPath)],
    );
    setActivePath(docPath);
  }, [docPath]);

  const updateTab = useCallback((path: string, patch: Partial<DocTab>) => {
    setTabs((prev) => prev.map((tb) => (tb.path === path ? { ...tb, ...patch } : tb)));
  }, []);

  const loadDoc = useCallback(
    (path: string) => {
      if (fetchingRef.current.has(path)) return;
      fetchingRef.current.add(path);
      setTabs((prev) =>
        prev.map((tb) => (tb.path === path ? { ...tb, loading: true, err: null } : tb)),
      );
      fetch(`/api/docs/read?path=${encodeURIComponent(path)}`)
        .then(async (r) => {
          const json = (await r.json()) as DocReadResp;
          setTabs((prev) =>
            prev.map((tb) => {
              if (tb.path !== path) return tb;
              if (!r.ok) {
                return { ...tb, loading: false, err: json.error ?? "读取失败", data: null };
              }
              return { ...tb, loading: false, err: null, data: json, draft: json.content, savedMtime: json.mtime };
            }),
          );
        })
        .catch((e) => {
          setTabs((prev) =>
            prev.map((tb) =>
              tb.path === path ? { ...tb, loading: false, err: (e as Error).message } : tb,
            ),
          );
        })
        .finally(() => {
          fetchingRef.current.delete(path);
        });
    },
    [],
  );

  // 懒加载：激活的标签页尚未拉取内容时请求（图片标签直接走 /api/docs/asset 预览）
  useEffect(() => {
    if (!activePath) return;
    const tb = tabs.find((x) => x.path === activePath);
    if (tb && !tb.image && !tb.data && !tb.loading && !tb.err) loadDoc(activePath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath, tabs.length, loadDoc]);

  const save = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!activeTab?.data) return;
      const path = activeTab.path;
      const silent = opts?.silent ?? false;
      updateTab(path, { saving: true, saveMsg: null });
      try {
        const r = await fetch("/api/docs/write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: activeTab.data.path,
            content: activeTab.draft,
            expectMtime: activeTab.savedMtime,
            autosave: silent,
          }),
        });
        const json = (await r.json()) as WriteResp;
        if (!r.ok) {
          if (r.status === 409 && json.currentMtime) {
            updateTab(path, { saveMsg: t.docDrawer.saveExternalConflict, saveMsgKind: "warn", saving: false });
          } else {
            updateTab(path, { saveMsg: t.docDrawer.saveFailed(json.error ?? r.statusText), saveMsgKind: "err", saving: false });
          }
          return;
        }
        updateTab(path, {
          data: { ...activeTab.data, content: activeTab.draft, mtime: json.mtime!, bytes: json.bytes! },
          savedMtime: json.mtime,
          saveMsg: silent ? t.docDrawer.autoSaved : t.docDrawer.saveOk,
          saveMsgKind: "ok",
          saving: false,
        });
        onSaved?.(activeTab.data.path, json.mtime!);
        setTimeout(() => updateTab(path, { saveMsg: null }), silent ? 1200 : 2000);
      } catch (e) {
        updateTab(path, { saveMsg: t.docDrawer.saveFailed((e as Error).message), saveMsgKind: "err", saving: false });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTab, updateTab, onSaved, t],
  );

  /** 关闭某个标签页；关到最后一个时回调 onClose */
  const closeTab = useCallback(
    (path: string) => {
      const tb = tabs.find((x) => x.path === path);
      if (tb?.data && tb.draft !== tb.data.content && !confirm(t.docDrawer.confirmCloseUnsaved)) return;
      setTabs((prev) => {
        const idx = prev.findIndex((x) => x.path === path);
        const next = prev.filter((x) => x.path !== path);
        if (next.length === 0) {
          setActivePath(null);
          onClose();
        } else if (path === activePath) {
          const neighbor = next[Math.min(idx, next.length - 1)];
          setActivePath(neighbor?.path ?? null);
        }
        return next;
      });
    },
    [tabs, activePath, onClose, t],
  );

  return { tabs, activePath, activeTab, dirty, setActivePath, updateTab, loadDoc, save, closeTab };
}

/**
 * 文档面板主体：多标签 + 大纲 + 预览/编辑 + 页脚。
 * 不含定位与宽度拖拽（宿主决定布局：DocDrawer 为固定抽屉，笔记库为分栏右区）。
 */
export function DocPane({
  docPath,
  onClose,
  onSaved,
  splitVar = false,
  placeholder,
}: {
  docPath: string | null;
  onClose: () => void;
  /** 保存成功后回调（用于刷新外部列表的 mtime/大小） */
  onSaved?: (path: string, mtime: number) => void;
  /** 打开时把宽度写入 --drawer-w CSS 变量（让被抽屉覆盖的页面让位；分栏布局传 false） */
  splitVar?: boolean;
  /** 无文档打开时的占位内容 */
  placeholder?: React.ReactNode;
}) {
  const t = useT();
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const [codeLang, setCodeLang] = useState("js");
  const {
    tabs,
    activePath,
    activeTab,
    dirty,
    setActivePath,
    updateTab,
    loadDoc,
    save,
    closeTab,
  } = useDocTabs({ docPath, onClose, onSaved });

  // 大纲面板：桌面默认展开；手机端默认收起（节省纵向空间）
  const [outlineOpen, setOutlineOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 640,
  );
  const [outlineHeight, setOutlineHeight] = useState(170);

  useEffect(() => {
    const h = Number(localStorage.getItem(OUTLINE_HEIGHT_KEY));
    if (Number.isFinite(h) && h >= 64 && h <= 420) setOutlineHeight(h);
  }, []);

  // 分屏宽度通知（反馈：分屏时页面 markdown 让出抽屉宽度）
  useEffect(() => {
    if (!splitVar) return;
    function fallbackWidth(): number {
      if (typeof window === "undefined") return 680;
      if (window.innerWidth < 640) return window.innerWidth;
      if (window.innerWidth < 1024) return 560;
      return 680;
    }
    function apply() {
      if (!docPath) {
        document.documentElement.style.removeProperty("--drawer-w");
        return;
      }
      const w = fallbackWidth();
      if (window.innerWidth < 640) {
        document.documentElement.style.removeProperty("--drawer-w");
      } else {
        document.documentElement.style.setProperty("--drawer-w", `${w}px`);
      }
    }
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      document.documentElement.style.removeProperty("--drawer-w");
    };
  }, [docPath, splitVar]);

  // 切到编辑模式时聚焦
  useEffect(() => {
    if (activeTab?.mode === "edit") {
      draftRef.current?.focus();
    }
  }, [activePath, activeTab?.mode]);

  // Cmd/Ctrl+S 保存
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        if (activePath && dirty && !activeTab?.saving) {
          e.preventDefault();
          void save();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePath, dirty, activeTab?.saving, save]);

  // 自动保存：编辑模式下每 5 秒静默保存（反馈：笔记保存默认 5s 一次；
  // 打字会重置计时，等价于停顿 5s 后保存；autosave 只写本地不触发 git push）
  useEffect(() => {
    if (activeTab?.mode !== "edit") return;
    const timer = setInterval(() => {
      if (dirty && !activeTab?.saving && activeTab?.data) void save({ silent: true });
    }, 5000);
    return () => clearInterval(timer);
  }, [dirty, activeTab?.mode, activeTab?.saving, activeTab?.data, save]);

  function jumpToHeading(h: OutlineItem, index: number) {
    if (!activeTab) return;
    if (activeTab.mode === "preview") {
      const el = document.getElementById(`md-h-${index}`);
      el?.scrollIntoView({ block: "start", behavior: "smooth" });
    } else {
      const ta = draftRef.current;
      if (!ta) return;
      const lineH = 24;
      ta.scrollTop = Math.max(0, h.line * lineH - 40);
    }
  }

  // 给 react-markdown 用：把相对图片路径改写到 /api/docs/asset
  const baseDir = activeTab?.data?.dir ?? "";  function rewriteAsset(src: string): string {
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

  // ---------- 编辑器：插入代码块（包裹选中文本） ----------
  function insertCodeBlock() {
    const ta = draftRef.current;
    if (!ta || !activeTab) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = activeTab.draft.slice(start, end);
    const snippet = `\`\`\`${codeLang}\n${sel}\n\`\`\``;
    const next = activeTab.draft.slice(0, start) + snippet + activeTab.draft.slice(end);
    updateTab(activeTab.path, { draft: next });
    const caret = sel ? start + snippet.length : start + 4 + codeLang.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  }

  // ---------- 编辑器：粘贴图片 → 上传到 <笔记目录>/images/ 并插入引用 ----------
  function onEditorPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
      f.type.startsWith("image/"),
    );
    if (!file || !activeTab?.data) return;
    e.preventDefault();
    void uploadPastedImage(file);
  }

  async function uploadPastedImage(file: File) {
    const tab = activeTab;
    if (!tab?.data) return;
    const path = tab.path;
    const ts = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const extFromType = (file.type.split("/")[1] ?? "png").replace("jpeg", "jpg");
    const defName = `Pasted-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.${extFromType}`;
    // 反馈：图片名称可自行修改（默认给个带时间戳的建议名）
    const input = window.prompt(t.docDrawer.pasteImageName(defName), defName);
    if (!input) return;
    let name = input.trim();
    if (!IMAGE_EXT_RE.test(name)) name += `.${extFromType}`;
    updateTab(path, { saving: true });
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.onerror = () => rej(new Error("read clipboard image failed"));
        fr.readAsDataURL(file);
      });
      const dataBase64 = dataUrl.split(",")[1] ?? "";
      const r = await fetch("/api/docs/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dir: tab.data.dir, name, dataBase64 }),
      });
      const json = (await r.json()) as { path?: string; error?: string };
      if (!r.ok || !json.path) {
        updateTab(path, {
          saveMsg: t.docDrawer.pasteImageFailed(json.error ?? r.statusText),
          saveMsgKind: "err",
          saving: false,
        });
        return;
      }
      const rel = tab.data.dir
        ? json.path.slice(tab.data.dir.length + 1)
        : json.path;
      const md = `![${name.replace(/\.[^.]+$/, "")}](${rel})`;
      const ta = draftRef.current;
      const at = ta ? ta.selectionStart : tab.draft.length;
      const needNl = at > 0 && tab.draft[at - 1] !== "\n";
      const next =
        tab.draft.slice(0, at) + (needNl ? "\n" : "") + md + "\n" + tab.draft.slice(at);
      updateTab(path, { draft: next, saving: false });
      requestAnimationFrame(() => {
        const el = draftRef.current;
        if (el) {
          const caret = at + (needNl ? 1 : 0) + md.length + 1;
          el.focus();
          el.setSelectionRange(caret, caret);
        }
      });
    } catch (e) {
      updateTab(path, {
        saveMsg: t.docDrawer.pasteImageFailed((e as Error).message),
        saveMsgKind: "err",
        saving: false,
      });
    }
  }

  const outlineSource = activeTab
    ? activeTab.mode === "edit"
      ? activeTab.draft
      : activeTab.data?.content ?? ""
    : "";
  const outline = parseOutline(outlineSource);

  if (!docPath && !tabs.length) {
    return <>{placeholder ?? null}</>;
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      <header className="flex items-center justify-between gap-2 px-4 h-12 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-zinc-500 truncate">
            {t.docDrawer.headerLabel(activeTab?.data?.dir ?? "")}
          </div>
          <div className="font-medium truncate flex items-center gap-1.5">
            {activeTab?.data?.name ?? activePath}
            {dirty && (
              <span className="text-xs text-amber-600">● {t.common.unsaved}</span>
            )}
          </div>
        </div>

        {/* 模式切换 / 保存 */}
        {activeTab?.data && (
          <div className="flex items-center gap-1">
            {activeTab.mode === "edit" ? (
              <>
                <button
                  onClick={() => save()}
                  disabled={!dirty || activeTab.saving}
                  title="Cmd/Ctrl+S"
                  className="px-2.5 py-1 text-xs rounded-md bg-emerald-600 text-white disabled:opacity-40 hover:bg-emerald-700 flex items-center gap-1"
                >
                  {activeTab.saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {t.common.save}
                </button>
                <button
                  onClick={() => updateTab(activeTab.path, { mode: "preview" })}
                  className="px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5" /> {t.common.preview}
                </button>
              </>
            ) : (
              <button
                onClick={() => updateTab(activeTab.path, { mode: "edit" })}
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

      {/* 多标签页 */}
      {tabs.length > 1 && (
        <div className="flex items-stretch overflow-x-auto border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 shrink-0">
          {tabs.map((tb) => {
            const isActive = tb.path === activePath;
            const tabDirty = tb.data && tb.draft !== tb.data.content;
            return (
              <div
                key={tb.path}
                className={`group flex items-center gap-1 px-3 py-1.5 text-xs border-r border-zinc-200 dark:border-zinc-800 whitespace-nowrap cursor-pointer max-w-[220px] ${
                  isActive
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border-b-2 border-b-blue-600"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                }`}
                onClick={() => setActivePath(tb.path)}
                title={tb.path}
              >
                <span className="truncate">
                  {tb.err ? "⚠ " : ""}
                  {tb.data?.name ?? tb.path.split("/").pop()}
                  {tabDirty && <span className="text-amber-600"> ●</span>}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tb.path);
                  }}
                  className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-red-500 shrink-0"
                  aria-label="关闭标签页"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 顶部消息条（保存结果） */}
      {activeTab?.saveMsg && (
        <div className="px-4 py-2 text-xs flex items-center justify-between bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <span
            className={
              activeTab.saveMsgKind === "ok"
                ? "text-emerald-600 flex items-center gap-1"
                : "text-rose-600"
            }
          >
            {activeTab.saveMsgKind === "ok" && <Check className="w-3 h-3" />}
            {activeTab.saveMsg}
          </span>
          {activeTab.saveMsgKind === "warn" && (
            <button
              onClick={() => loadDoc(activeTab.path)}
              className="text-xs text-blue-600 hover:underline"
            >
              {t.docDrawer.reload}
            </button>
          )}
        </div>
      )}

      {/* 文档大纲：可收缩展开，高度可上下拖动调整 */}
      {outline.length > 0 && (
        <div
          className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 relative shrink-0"
          style={outlineOpen ? { height: outlineHeight } : undefined}
        >
          <button
            onClick={() => setOutlineOpen((v) => !v)}
            className="w-full flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            <ListTree className="w-3.5 h-3.5" />
            大纲（{outline.length}）
            {outlineOpen ? (
              <ChevronUp className="w-3 h-3 ml-auto" />
            ) : (
              <ChevronDown className="w-3 h-3 ml-auto" />
            )}
          </button>
          {outlineOpen && (
            <>
              <ul className="h-[calc(100%-30px)] overflow-y-auto px-4 pb-2">
                {outline.map((h, i) => (
                  <li key={i}>
                    <button
                      onClick={() => jumpToHeading(h, i)}
                      className="block w-full text-left text-[0.9rem] leading-snug text-zinc-600 dark:text-zinc-300 hover:text-blue-600 dark:hover:text-blue-400 truncate py-0.5"
                      style={{ paddingLeft: (h.level - 1) * 14 }}
                      title={h.text}
                    >
                      {h.text}
                    </button>
                  </li>
                ))}
              </ul>
              <div
                onPointerDown={startOutlineResize}
                className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-blue-500/30"
                title="上下拖动调整大纲区域大小"
              />
            </>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab?.loading && (
          <div className="flex items-center gap-2 text-zinc-500 p-5">
            <Loader2 className="w-4 h-4 animate-spin" /> {t.docDrawer.loading}
          </div>
        )}
        {activeTab?.err && (
          <div className="text-rose-600 text-sm p-5">
            {t.docDrawer.readFailed(activeTab.err)}
          </div>
        )}

        {activeTab?.image && (
          <div className="h-full flex items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-900/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/docs/asset?path=${encodeURIComponent(activeTab.path)}`}
              alt={activeTab.path}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        )}

        {activeTab?.data && activeTab.mode === "preview" && (
          <div className="p-5">
            {activeTab.data.content.trim() === "" ? (
              <div className="text-zinc-400 italic">
                {t.docDrawer.emptyContent}
              </div>
            ) : (
              <div className="prose-tutor">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkBreaks, remarkHighlight, remarkCallouts]}
                  rehypePlugins={[rehypeHighlight]}
                  components={buildMarkdownComponents(rewriteAsset)}
                >
                  {activeTab.data.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {activeTab?.data && activeTab.mode === "edit" && (
          <div className="h-full flex flex-col min-h-0">
            {/* 编辑工具条：插入多语法代码块（反馈：markdown 缺少代码块输入） */}
            <div className="flex items-center gap-1.5 px-4 py-1 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 text-xs shrink-0">
              <Code className="w-3.5 h-3.5 text-zinc-400" />
              <select
                value={codeLang}
                onChange={(e) => setCodeLang(e.target.value)}
                className="px-1.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              >
                {CODE_LANGS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <button
                onClick={insertCodeBlock}
                className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {t.docDrawer.insertCodeBlock}
              </button>
              <span className="ml-auto text-zinc-400 text-[10px]">
                {t.docDrawer.autoSaved} 5s
              </span>
            </div>
            <textarea
              ref={draftRef}
              value={activeTab.draft}
              onChange={(e) => updateTab(activeTab.path, { draft: e.target.value })}
              onPaste={onEditorPaste}
              spellCheck={false}
              className="w-full flex-1 min-h-[280px] p-4 sm:p-5 text-[16px] sm:text-sm font-mono leading-relaxed bg-transparent outline-none resize-none"
              placeholder=""
            />
          </div>
        )}
      </div>

      {activeTab?.data && (
        <footer className="px-4 py-2 text-xs text-zinc-500 border-t border-zinc-200 dark:border-zinc-800 flex justify-between shrink-0">
          <span>
            {Math.round((activeTab.data.bytes ?? 0) / 1024)} KB
            {activeTab.mode === "edit" && (
              <span className="ml-3">{t.docDrawer.charsCount(activeTab.draft.length)}</span>
            )}
          </span>
          <span>{t.docDrawer.updatedAt(new Date(activeTab.data.mtime).toLocaleString())}</span>
        </footer>
      )}
    </div>
  );

  // ---------- 大纲高度拖动（上下伸缩） ----------
  function startOutlineResize(e: ReactPointerEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = outlineHeight;
    function onMove(ev: globalThis.PointerEvent) {
      const h = Math.min(420, Math.max(64, startH + (ev.clientY - startY)));
      setOutlineHeight(h);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setOutlineHeight((h) => {
        localStorage.setItem(OUTLINE_HEIGHT_KEY, String(h));
        return h;
      });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
}

/** 构建渲染组件：给每个标题按出现顺序加 md-h-N 锚点（与大纲一一对应） */
function buildMarkdownComponents(
  rewriteAsset: (src: string) => string,
): Components {
  let headingIdx = -1;
  const heading = (Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") =>
    function Heading({ children }: { children?: React.ReactNode }) {
      headingIdx += 1;
      return (
        <Tag id={`md-h-${headingIdx}`} className="scroll-mt-2">
          {children}
        </Tag>
      );
    };
  return {
    ...markdownCodeComponents,
    h1: heading("h1"),
    h2: heading("h2"),
    h3: heading("h3"),
    h4: heading("h4"),
    h5: heading("h5"),
    h6: heading("h6"),
    img: ({ src, alt, ...rest }) => (
      <img
        src={typeof src === "string" ? rewriteAsset(src) : undefined}
        alt={alt ?? ""}
        style={{ maxWidth: "100%", height: "auto" }}
        {...rest}
      />
    ),
    a: ({ href, children, ...rest }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
        <ExternalLink className="inline w-3 h-3 ml-0.5 align-baseline" />
      </a>
    ),
  };
}
