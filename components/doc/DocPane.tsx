"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import { remarkCallouts } from "@/lib/markdown/callouts";
import { rehypeFigDefs } from "@/lib/markdown/figdefs";
import { remarkHighlight } from "@/lib/markdown/highlight";
import { remarkPens } from "@/lib/markdown/pens";
import { preprocessNote } from "@/lib/markdown/normalize";
import { markdownCodeComponents, codeComponentsWithJump } from "@/components/markdown/CodeRenderer";
import { PdfViewer } from "@/components/doc/PdfViewer";
import { ImageLightbox, type ImageLightboxState } from "@/components/doc/ImageLightbox";
import { cacheGetJSON, cacheSetJSON } from "@/lib/docs/client-cache";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Code,
  ExternalLink,
  Eye,
  Languages,
  ListTree,
  Loader2,
  Pencil,
  PenLine,
  Save,
  X,
} from "lucide-react";
import { useLang, useT } from "@/lib/i18n/context";

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

/** PDF：走 pdf.js 查看器（高亮/标注 + 文本层） */
const PDF_EXT_RE = /\.pdf$/i;

/** 编辑器代码块语言候选（反馈：markdown 需要多种语法代码块输入） */
const TAB_DRAG_TYPE = "application/x-doc-pane-tab";

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
  /** PDF 文件：走 PdfViewer（高亮/标注） */
  pdf?: boolean;
  data: DocReadResp | null;
  loading: boolean;
  err: string | null;
  draft: string;
  mode: "preview" | "edit";
  savedMtime: number | undefined;
  saving: boolean;
  saveMsg: string | null;
  saveMsgKind: "ok" | "warn" | "err";
  /** 网页翻译：译文 markdown（null=未翻译）；transView=true 时预览区显示译文 */
  translated: string | null;
  translating: boolean;
  transView: boolean;
}

export function newDocTab(path: string): DocTab {
  return {
    path,
    image: IMAGE_EXT_RE.test(path),
    pdf: PDF_EXT_RE.test(path),
    data: null,
    loading: false,
    err: null,
    draft: "",
    mode: "preview",
    savedMtime: undefined,
    saving: false,
    saveMsg: null,
    saveMsgKind: "ok",
    translated: null,
    translating: false,
    transView: false,
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
  /** 会话快照 key（反馈：切页面后回来恢复之前打开的标签）；不传则不持久化 */
  storageKey?: string;
  /** 多仓库标识（笔记库）：读写/资产请求带上 */
  repo?: string | null;
}) {
  const { docPath, onClose, onSaved, repo } = options;
  const t = useT();
  const storageKey = options.storageKey ?? null;
  const [tabs, setTabs] = useState<DocTab[]>(() => {
    if (!storageKey || typeof window === "undefined") return [];
    try {
      const snap = JSON.parse(sessionStorage.getItem(`doc-tabs:${storageKey}`) ?? "null") as
        | { paths?: string[]; active?: string; modes?: Record<string, string> }
        | null;
      if (!snap?.paths?.length) return [];
      return snap.paths
        .slice(0, 12)
        .map((p) => ({ ...newDocTab(p), mode: (snap.modes?.[p] as DocTab["mode"]) ?? "preview" }));
    } catch {
      return [];
    }
  });
  const [activePath, setActivePath] = useState<string | null>(() => {
    if (!storageKey || typeof window === "undefined") return null;
    try {
      const snap = JSON.parse(sessionStorage.getItem(`doc-tabs:${storageKey}`) ?? "null") as
        | { active?: string }
        | null;
      return snap?.active ?? null;
    } catch {
      return null;
    }
  });
  const fetchingRef = useRef<Set<string>>(new Set());

  // 标签快照：路径/激活项/各标签模式（内容不存，激活时再拉取）
  useEffect(() => {
    if (!storageKey) return;
    try {
      if (tabs.length === 0) sessionStorage.removeItem(`doc-tabs:${storageKey}`);
      else
        sessionStorage.setItem(
          `doc-tabs:${storageKey}`,
          JSON.stringify({
            paths: tabs.map((tb) => tb.path),
            active: activePath,
            modes: Object.fromEntries(tabs.map((tb) => [tb.path, tb.mode])),
          }),
        );
    } catch {
      /* 忽略配额错误 */
    }
  }, [tabs, activePath, storageKey]);

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
      // 会话缓存（反馈：切页面回来不要重新拉取刷新）：先用缓存内容立即渲染，再后台校验
      const cacheKey = `doc-read:${repo ?? "default"}:${path}`;
      const cached = cacheGetJSON<DocReadResp>(cacheKey);
      if (cached?.content != null) {
        setTabs((prev) =>
          prev.map((tb) =>
            tb.path === path && !tb.data ? { ...tb, loading: true, err: null, data: cached, draft: cached.content, savedMtime: cached.mtime } : tb,
          ),
        );
      }
      fetchingRef.current.add(path);
      setTabs((prev) =>
        prev.map((tb) => (tb.path === path ? { ...tb, loading: true, err: null } : tb)),
      );
      fetch(`/api/docs/read?path=${encodeURIComponent(path)}${repo ? `&repo=${encodeURIComponent(repo)}` : ""}`)
        .then(async (r) => {
          const json = (await r.json()) as DocReadResp;
          setTabs((prev) =>
            prev.map((tb) => {
              if (tb.path !== path) return tb;
              if (!r.ok) {
                return { ...tb, loading: false, err: json.error ?? "读取失败", data: null };
              }
              // 内容没变（与缓存一致）→ 不重设 data/draft，避免编辑态与滚动位置被打断
              if (
                cached?.content === json.content &&
                cached?.mtime === json.mtime &&
                tb.data?.mtime === json.mtime
              ) {
                return { ...tb, loading: false, err: null };
              }
              cacheSetJSON(cacheKey, json);
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
    [repo],
  );

  // 懒加载：激活的标签页尚未拉取内容时请求（图片/PDF 标签直接走 /api/docs/asset 预览）
  useEffect(() => {
    if (!activePath) return;
    const tb = tabs.find((x) => x.path === activePath);
    if (tb && !tb.image && !tb.pdf && !tb.data && !tb.loading && !tb.err) loadDoc(activePath);
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
            repo: repo ?? undefined,
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
        // 保存后同步会话缓存，避免切页面回来又被旧缓存覆盖回退
        cacheSetJSON(`doc-read:${repo ?? "default"}:${activeTab.data.path}`, {
          ...activeTab.data,
          content: activeTab.draft,
          mtime: json.mtime!,
          bytes: json.bytes!,
        });
        onSaved?.(activeTab.data.path, json.mtime!);
        setTimeout(() => updateTab(path, { saveMsg: null }), silent ? 1200 : 2000);
      } catch (e) {
        updateTab(path, { saveMsg: t.docDrawer.saveFailed((e as Error).message), saveMsgKind: "err", saving: false });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTab, updateTab, onSaved, t, repo],
  );

  /** 关闭某个标签页；关到最后一个时回调 onClose（opts.silent=true 跳过“未保存”确认，供跨栏移动使用） */
  const closeTab = useCallback(
    (path: string, opts?: { silent?: boolean }) => {
      const tb = tabs.find((x) => x.path === path);
      if (tb?.data && tb.draft !== tb.data.content && !opts?.silent && !confirm(t.docDrawer.confirmCloseUnsaved)) return;
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
export interface DocPaneApi {
  /** 静默关闭标签（opts.silent=true 时跳过未保存确认）*/
  closeTab(path: string, opts?: { silent?: boolean }): void;
  hasTab(path: string): boolean;
  hasUnsaved(path: string): boolean;
  /** 本分栏当前打开的标签路径（重命名/删除后剔除失效标签用） */
  tabs(): string[];
}

export function DocPane({
  docPath,
  onClose,
  onSaved,
  splitVar = false,
  placeholder,
  sessionKey,
  /** 多仓库标识（笔记库）：读写/资产请求带上，区分不同 git 仓库 */
  repo,
  /** 分屏标识（笔记库左/右栏），配合 onForeignDrop 实现跨栏拖拽移动标签 */
  paneId,
  /** 另一个分屏拖来一个标签 → 宿主负责打开到本栏 */
  onForeignDrop,
  /** 向宿主暴露本分栏的标签 API（closeTab 等） */
  apiRef,
}: {
  docPath: string | null;
  onClose: () => void;
  /** 保存成功后回调（用于刷新外部列表的 mtime/大小） */
  onSaved?: (path: string, mtime: number) => void;
  /** 打开时把宽度写入 --drawer-w CSS 变量（让被抽屉覆盖的页面让位；分栏布局传 false） */
  splitVar?: boolean;
  /** 无文档打开时的占位内容 */
  placeholder?: React.ReactNode;
  /** 会话快照 key：切页面返回后恢复该分栏之前打开的标签与编辑/预览状态 */
  sessionKey?: string;
  /** 多仓库标识（笔记库） */
  repo?: string | null;
  paneId?: "left" | "right";
  onForeignDrop?: (path: string) => void;
  apiRef?: RefObject<DocPaneApi | null>;
}) {
  const t = useT();
  const { lang } = useLang();
  const draftRef = useRef<HTMLTextAreaElement>(null);
  /** 实时预览容器（编辑器点击 → 预览同步滚动到对应位置，反馈：来回翻找很耗时间） */
  const previewRef = useRef<HTMLDivElement>(null);
  /** 键盘编辑（Enter 续写/Tab 缩进）后的光标位置：等 draft 重渲染后统一生效（比 rAF 可靠，避免光标跳到文档末尾）。
   *  scrollTop：值替换会让 textarea 滚动复位，需要带回原滚动位置（反馈：红/蓝笔输入时视图跳动） */
  const pendingCaretRef = useRef<{ pos: number; sel: number; scrollTop?: number } | null>(null);
  /** 分屏拖动时整栏高亮 */
  const [paneDropActive, setPaneDropActive] = useState(false);
  const [codeLang, setCodeLang] = useState("js");
  /** 红笔/蓝笔批注（反馈：md 笔记批注快速切换字色）："r"红 / "b"蓝 / null 关闭 */
  const [pen, setPen] = useState<"r" | "b" | null>(null);
  /** 图片 lightbox（反馈：预览图片可点开、调大小、固定桌面拖动） */
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
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
  } = useDocTabs({ docPath, onClose, onSaved, storageKey: sessionKey, repo });

  // 标签 API 暴露给宿主（分屏跨栏拖拽用）
  useEffect(() => {
    if (apiRef) {
      apiRef.current = {
        closeTab: (path, opts) => closeTab(path, opts),
        hasTab: (path) => tabs.some((tb) => tb.path === path),
        hasUnsaved: (path) => {
          const tb = tabs.find((x) => x.path === path);
          return !!tb?.data && tb.draft !== tb.data.content;
        },
        tabs: () => tabs.map((tb) => tb.path),
      };
    }
  });

  useEffect(() => {
    const p = pendingCaretRef.current;
    if (!p || !draftRef.current) return;
    pendingCaretRef.current = null;
    const ta = draftRef.current;
    ta.focus({ preventScroll: true });
    try {
      ta.setSelectionRange(p.pos, p.sel);
    } catch {
      /* 光标越界时忽略 */
    }
    // setSelectionRange 可能把视口滚到光标处；笔输入时要保持原滚动位置完全不变
    if (p.scrollTop !== undefined) ta.scrollTop = p.scrollTop;
  }, [activeTab?.draft]);

  /** 实时预览点击块级元素 → 编辑器光标定位到对应行并选中该行（反馈：预览点击定位编辑） */
  const jumpToEditLine = useCallback((line: number) => {
    const ta = draftRef.current;
    if (!ta) return;
    const lines = ta.value.split("\n");
    let off = 0;
    for (let i = 0; i < Math.min(line - 1, lines.length); i++) off += (lines[i]?.length ?? 0) + 1;
    const row = Math.max(0, Math.min(line - 1, lines.length - 1));
    const sel = Math.min(off + (lines[row]?.length ?? 0), ta.value.length);
    ta.focus({ preventScroll: true });
    try {
      ta.setSelectionRange(off, sel);
    } catch {
      /* ignore */
    }
    // 软换行（长段落自动折行）会让"行号×行高"严重偏离实际渲染位置，
    // 用镜像 div 精确测量第 row 行的像素偏移，再定位到视口上 1/3 处
    const top = measureTextareaLineTop(ta, row);
    ta.scrollTop = Math.max(0, Math.min(top - ta.clientHeight / 3, ta.scrollHeight - ta.clientHeight));
  }, []);

  /** 打开图片 lightbox（预览/实时预览中的图片点击） */
  const openImage = useCallback((st: ImageLightboxState) => setLightbox(st), []);

  /** 把实时预览滚到源码行号（1 起）对应的块（反馈：编辑器点击/大纲点击要联动预览）。
   *  预览块带 data-src-line（源码行号），取行号 ≤ 该行的最后一个块，
   *  只滚预览容器自身（不动外层页面）。 */
  const scrollPreviewToLine = useCallback((line: number) => {
    const root = previewRef.current;
    if (!root) return;
    let target: HTMLElement | null = null;
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-src-line]"))) {
      if (Number(el.dataset.srcLine) <= line) target = el;
      else break;
    }
    if (!target) return;
    const delta = target.getBoundingClientRect().top - root.getBoundingClientRect().top;
    root.scrollTop += delta - 8;
  }, []);

  /** 编辑器点击 → 右侧实时预览滚到光标所在源码行对应的块（反馈：来回翻找很耗时间）。 */
  const syncPreviewToCaret = useCallback(() => {
    const ta = draftRef.current;
    if (!ta) return;
    scrollPreviewToLine(ta.value.slice(0, ta.selectionStart).split("\n").length);
  }, [scrollPreviewToLine]);

  /** 把 lightbox 中选定的宽度写回 markdown：![alt](src) → ![alt](src "W")
   *  （反馈：插入的图片显示过大，希望可调大小） */
  const applyImageWidth = useCallback((w: number) => {
    if (!lightbox?.originalSrc || !activeTab?.data) return;
    const src = lightbox.originalSrc;
    // 匹配该图片引用（可已有宽度 title），替换/写入宽度
    const esc = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(!\\[[^\\]]*\\]\\(\\s*${esc})(\\s+"[^"]*")?(\\s*\\))`);
    const target = activeTab.mode === "edit" ? "draft" : "data.content";
    const text = target === "draft" ? activeTab.draft : activeTab.data.content;
    if (!re.test(text)) return;
    const next = text.replace(re, `$1 "${w}"$3`);
    if (target === "draft") {
      updateTab(activeTab.path, { draft: next });
    } else {
      // 阅读模式：直接改内容并落盘（保持阅读流畅，不强制切编辑）
      updateTab(activeTab.path, { data: { ...activeTab.data, content: next } });
      void fetch("/api/docs/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: activeTab.data.path,
          content: next,
          expectMtime: activeTab.savedMtime,
          repo: repo ?? undefined,
        }),
      })
        .then(async (r) => {
          const j = (await r.json()) as WriteResp;
          if (r.ok && j.mtime) {
            updateTab(activeTab.path, { savedMtime: j.mtime, saveMsg: t.docDrawer.saveOk, saveMsgKind: "ok" });
            cacheSetJSON(`doc-read:${repo ?? "default"}:${activeTab.data!.path}`, {
              ...activeTab.data,
              content: next,
              mtime: j.mtime,
              bytes: j.bytes ?? activeTab.data!.bytes,
            });
          } else {
            updateTab(activeTab.path, { saveMsg: t.docDrawer.saveFailed(j.error ?? ""), saveMsgKind: "err" });
          }
        })
        .catch(() => {
          updateTab(activeTab.path, { saveMsg: t.docDrawer.saveFailed("network"), saveMsgKind: "err" });
        });
      setTimeout(() => updateTab(activeTab.path, { saveMsg: null }), 2000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightbox, activeTab, updateTab, t, repo]);

  /** 网页翻译：预览模式下整篇翻译（代码块/链接/行内代码保持原样），缓存到标签页 */
  const translateDoc = useCallback(async () => {
    if (!activeTab?.data) return;
    const tabPath = activeTab.path;
    if (activeTab.translated !== null) {
      updateTab(tabPath, { transView: true });
      return;
    }
    updateTab(tabPath, { translating: true });
    try {
      const target = lang === "zh" ? "en" : "zh-CN";
      // 保护围栏代码块、行内代码、链接/图片/URL（避免被机翻破坏语法）
      const tokens: string[] = [];
      let text = activeTab.data.content.replace(
        /```[\s\S]*?(?:```|$)/g,
        (m) => `\u0001${tokens.push(m) - 1}\u0001`,
      );
      text = text.replace(
        /`[^`\n]+`|!\[[^\]]*\]\([^)]*\)|\[[^\]]*\]\([^)]*\)|https?:\/\/\S+/g,
        (m) => `\u0001${tokens.push(m) - 1}\u0001`,
      );
      const r = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, target }),
      });
      const j = (await r.json()) as { text?: string; error?: string };
      if (!r.ok || !j.text) throw new Error(j.error ?? r.statusText);
      const translated = j.text.replace(
        /\u0001(\d+)\u0001/g,
        (_, i) => tokens[Number(i)] ?? "",
      );
      updateTab(tabPath, { translating: false, translated, transView: true });
    } catch (e) {
      updateTab(tabPath, { translating: false, translated: null, transView: false });
      updateTab(tabPath, {
        saveMsg: t.docDrawer.translateFailed((e as Error).message),
        saveMsgKind: "err",
      });
      setTimeout(() => updateTab(tabPath, { saveMsg: null }), 3000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, updateTab, lang]);

  // 大纲面板：桌面默认展开；手机端默认收起（节省纵向空间）
  const [outlineOpen, setOutlineOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 640,
  );
  const [outlineHeight, setOutlineHeight] = useState(170);
  // 编辑模式实时预览（反馈：编辑时插入的图片要立即可见）
  const [livePreview, setLivePreview] = useState(true);
  const [previewDraft, setPreviewDraft] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setPreviewDraft(activeTab?.draft ?? ""), 300);
    return () => clearTimeout(timer);
  }, [activeTab?.draft]);

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
      // 多个预览标签常驻且 id 相同（md-h-N），必须先限定在"当前激活标签"的容器里找，
      // 否则 getElementById 会命中第一个（可能不可见的）标签并滚动错误文档
      const root = document.querySelector(`[data-mdtab="${CSS.escape(activeTab.path)}"]`);
      const el = root?.querySelector(`#md-h-${index}`);
      el?.scrollIntoView({ block: "start", behavior: "smooth" });
    } else {
      const ta = draftRef.current;
      if (!ta) return;
      // 软换行会让"行号×行高"严重偏离实际位置：用同款样式的镜像 div 精确测量第 N 行顶部
      const top = measureTextareaLineTop(ta, h.line);
      ta.scrollTop = Math.max(0, top - 40);
      // 实时预览开启时联动滚动到同一标题（反馈：大纲点击要同步实时渲染）
      if (livePreview) scrollPreviewToLine(h.line + 1);
    }
  }

  /** 用与 textarea 相同样式的镜像 div 测量第 line 行（0 起）渲染后的顶部偏移 */
  function measureTextareaLineTop(ta: HTMLTextAreaElement, line: number): number {
    const cs = getComputedStyle(ta);
    const mirror = document.createElement("div");
    // 影响换行与行高的样式全部照搬；宽度一致才能保证折行一致
    const KEBAB = [
      "font-family", "font-size", "font-weight", "letter-spacing", "line-height",
      "white-space", "word-break", "overflow-wrap", "word-spacing", "tab-size",
      "text-transform", "text-indent", "padding", "border-width", "box-sizing", "width",
    ];
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.top = "0";
    mirror.style.left = "-9999px";
    for (const k of KEBAB) mirror.style.setProperty(k, cs.getPropertyValue(k));
    mirror.setAttribute("aria-hidden", "true");
    const lines = ta.value.split("\n");
    lines.forEach((ln, i) => {
      const row = document.createElement("div");
      row.textContent = ln.length ? ln : "\u200b";
      mirror.appendChild(row);
    });
    document.body.appendChild(mirror);
    const rows = Array.from(mirror.children) as HTMLElement[];
    const top = rows[line]?.offsetTop ?? mirror.scrollHeight;
    document.body.removeChild(mirror);
    return top;
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
    return `/api/docs/asset?path=${encodeURIComponent(parts.join("/"))}${repo ? `&repo=${encodeURIComponent(repo)}` : ""}`;
  }

  // ---------- 编辑器：插入代码块（包裹选中文本） ----------
  /** 插入片段后的光标/滚动恢复：值替换会让浏览器把 textarea 的滚动复位到顶部、
   *  选区挪到 0（未聚焦状态下），插入大段内容必跳回开头。
   *  在新值基础上：镜像测量 caret 所在行的像素位置，把该行滚回原可见位置 */
  function restoreCaretAfterEdit(caret: number) {
    requestAnimationFrame(() => {
      const ta = draftRef.current;
      if (!ta) return;
      ta.focus({ preventScroll: true });
      const row = Math.max(
        0,
        ta.value.slice(0, Math.min(caret, ta.value.length)).split("\n").length - 1,
      );
      const top = measureTextareaLineTop(ta, row);
      ta.scrollTop = Math.max(0, Math.min(top - 40, ta.scrollHeight - ta.clientHeight));
      try {
        ta.setSelectionRange(caret, caret);
      } catch {
        /* ignore */
      }
    });
  }

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
    restoreCaretAfterEdit(caret);
  }

  // ---------- 编辑器：插入表格（反馈：缺少表格插入） ----------
  function insertTable() {
    const ta = draftRef.current;
    if (!ta || !activeTab) return;
    const input = window.prompt(t.docDrawer.insertTableSize, "3x4");
    if (input === null) return;
    const m = input.trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
    if (!m || Number(m[1]) < 1 || Number(m[2]) < 1) {
      window.alert(t.docDrawer.insertTableInvalid);
      return;
    }
    const rows = Number(m[1]);
    const cols = Number(m[2]);
    const header = `| ${Array.from({ length: cols }, (_, c) => `列${c + 1}`).join(" | ")} |`;
    const sep = `| ${Array.from({ length: cols }, () => "---").join(" | ")} |`;
    const body = Array.from({ length: rows - 1 }, () =>
      `| ${Array.from({ length: cols }, () => " ").join(" | ")} |`,
    );
    const snippet = [header, sep, ...body].join("\n");
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const head = activeTab.draft.slice(0, start);
    const tail = activeTab.draft.slice(end);
    const headPad =
      head.trim() === "" ? "" : head.endsWith("\n\n") ? "" : head.endsWith("\n") ? "\n" : "\n\n";
    const tailPad =
      tail.trim() === "" ? "" : tail.startsWith("\n\n") ? "" : tail.startsWith("\n") ? "\n" : "\n\n";
    const ins = headPad + snippet + tailPad;
    updateTab(activeTab.path, { draft: head + ins + tail });
    const caret = start + headPad.length + snippet.length;
    restoreCaretAfterEdit(caret);
  }

  // ---------- 编辑器：红笔/蓝笔批注（反馈：md 笔记批注快速切换字色） ----------
  /** 语法 %%r:文字%% / %%b:文字%%（remarkPens 渲染）；开启笔后输入即带色、选中文字一键换色 */
  const PEN_OPEN = { r: "%%r:", b: "%%b:" } as const;

  // 切换标签时结束笔模式（开启笔时光标处已放入含闭合标记的空色块，文档始终良构，无需善后）
  useEffect(() => {
    setPen(null);
  }, [activePath]);

  /** 笔开关后的光标恢复：保持滚动位置完全不变（反馈：点击红/蓝笔后编辑区上移、正在编辑处跑出视野） */
  function restoreCaretKeepScroll(caret: number) {
    const ta = draftRef.current;
    const scrollTop = ta?.scrollTop ?? 0;
    requestAnimationFrame(() => {
      const ta2 = draftRef.current;
      if (!ta2) return;
      ta2.focus({ preventScroll: true });
      try {
        ta2.setSelectionRange(caret, caret);
      } catch {
        /* ignore */
      }
      ta2.scrollTop = scrollTop;
    });
  }

  function togglePen(c: "r" | "b") {
    const ta = draftRef.current;
    if (pen === c) {
      setPen(null);
      return;
    }
    if (!ta || !activeTab) {
      setPen(c);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start !== end) {
      // 一键换色：包裹选中文本，一次性生效后退出笔模式
      const sel = activeTab.draft.slice(start, end);
      const wrapped = `${PEN_OPEN[c]}${sel}%%`;
      updateTab(activeTab.path, {
        draft: activeTab.draft.slice(0, start) + wrapped + activeTab.draft.slice(end),
      });
      restoreCaretKeepScroll(start + wrapped.length);
      setPen(null);
    } else {
      // 无选中：进入输入模式——光标处放入空色块（%%c:%%），后续输入落在闭合标记之前
      const open = `${PEN_OPEN[c]}%%`;
      updateTab(activeTab.path, {
        draft: activeTab.draft.slice(0, start) + open + activeTab.draft.slice(end),
      });
      restoreCaretKeepScroll(start + PEN_OPEN[c].length);
      setPen(c);
    }
  }

  // ---------- 编辑器：Tab 缩进（反馈：Tab 插入缩进且预览中不失效） ----------
  /** 正文插入两个全角空格（markdown 预览不折叠，引用块前后缩进都保持）；
   *  代码围栏内插入半角空格保持代码语义 */
  const INDENT_TEXT = "　　";
  const INDENT_CODE = "  ";

  function insideFence(text: string, pos: number): boolean {
    let fence = false;
    for (const line of text.slice(0, pos).split("\n")) {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    }
    return fence;
  }

  /** 缩进单位：正文用全角空格（预览不折叠）；代码围栏/引用/列表行内用半角空格（产生真实嵌套层级）。
   *  有序列表行按标记宽度自适应：Tab 在 "1. " 行内插 3 格、"10. " 插 4 格——
   *  二级列表要求缩进 ≥ 标记+空格宽，固定 2 格在有序列表下只能打平（反馈：二级列表不生效） */
  function indentUnit(text: string, pos: number): string {
    if (insideFence(text, pos)) return INDENT_CODE;
    const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
    const lineHead = text.slice(lineStart, pos);
    const qm = lineHead.match(/^[ \t]*>+[ \t]*/);
    const qLen = qm ? qm[0].length : 0;
    const rest = qLen ? lineHead.slice(qLen) : lineHead;
    const om = rest.match(/^[ \t]*(\d{1,9})\.[ \t]/);
    const um = rest.match(/^[ \t]*[*+-][ \t]/);
    if (om) return " ".repeat(qLen + om[1].length + 2);
    if (um) return " ".repeat(qLen + um[0].length);
    return INDENT_TEXT;
  }

  function onEditorKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!activeTab) return;
    // 输入法组合中的 Enter/Tab（候选确认等）不劫持（反馈：markdown 中文输入回车后光标乱跳到底部）
    if ((e.nativeEvent as KeyboardEvent).isComposing || e.keyCode === 229) return;
    const ta = e.currentTarget;
    const value = ta.value;
    const s = ta.selectionStart;
    const end = ta.selectionEnd;

    // ---------- 红笔/蓝笔（反馈：切换颜色后输入文字即带色） ----------
    // 文档里闭合标记常驻（%%c:%%），可打印字符插在光标处即落进当前色块；
    // 光标已移出色块（后面不是 %%）时就地新开一个色块，文档始终保持良构
    if (pen && e.key === "Escape") {
      setPen(null);
      return;
    }
    if (pen && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const closeAtCaret = value.slice(s, s + 2) === "%%";
      const ins = closeAtCaret
        ? e.key
        : `${PEN_OPEN[pen]}${e.key}%%`;
      const next = value.slice(0, s) + ins + value.slice(end);
      // 新开色块时光标落在首字之后、闭合标记之前，后续输入继续进块
      const caret = closeAtCaret ? s + ins.length : s + PEN_OPEN[pen].length + 1;
      const scrollTop = ta.scrollTop;
      updateTab(activeTab.path, { draft: next });
      pendingCaretRef.current = { pos: caret, sel: caret, scrollTop };
      return;
    }
    // 笔模式下回车：本行色块随闭合标记自然收束，换行后续开同一支笔
    if (pen && e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && s === end) {
      e.preventDefault();
      const open = `${PEN_OPEN[pen]}%%`;
      const next = value.slice(0, s) + "\n" + open + value.slice(end);
      const caret = s + 1 + PEN_OPEN[pen].length;
      const scrollTop = ta.scrollTop;
      updateTab(activeTab.path, { draft: next });
      pendingCaretRef.current = { pos: caret, sel: caret, scrollTop };
      return;
    }

    // ---------- Enter：自动续写引用/列表前缀（反馈：嵌套结构不用手写前缀） ----------
    if (
      e.key === "Enter" &&
      !e.shiftKey && !e.ctrlKey && !e.metaKey &&
      s === end && !insideFence(value, s)
    ) {
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      const curLine = value.slice(lineStart, s);
      // 扫描行首前缀：空格/tab/引用符号
      let i = 0;
      while (
        i < curLine.length &&
        (curLine[i] === " " || curLine[i] === "\t" || curLine[i] === ">")
      ) {
        i++;
      }
      const prefixRaw = curLine.slice(0, i);
      const afterPrefix = curLine.slice(i);
      const lm = afterPrefix.match(/^([*+-] |(\d+)\. )/);
      const markerRaw = lm ? lm[1] : "";
      const content = afterPrefix.slice(markerRaw.length);
      const isQuote = prefixRaw.includes(">");
      const isList = !!markerRaw;

      if (isQuote || isList) {
        // 当前行只有前缀没有内容 → 回车退出该层（删掉前缀）
        if (content.trim() === "") {
          e.preventDefault();
          const next = value.slice(0, lineStart) + value.slice(s);
          updateTab(activeTab.path, { draft: next });
          pendingCaretRef.current = { pos: lineStart, sel: lineStart };
          return;
        }
        // 有内容 → 新行续写前缀（引用原样续；有序列表递增编号）
        e.preventDefault();
        let cont = prefixRaw;
        if (isList) {
          cont += lm![2] ? `${Number(lm![2]) + 1}. ` : markerRaw;
        } else if (cont.endsWith(">")) {
          cont += " ";
        }
        const next = value.slice(0, s) + "\n" + cont + value.slice(s);
        const caret = s + 1 + cont.length;
        updateTab(activeTab.path, { draft: next });
        pendingCaretRef.current = { pos: caret, sel: caret };
        return;
      }
      // 无前缀 → 默认行为
      return;
    }

    // cmd/Ctrl+[ = 反缩进；cmd/Ctrl+] = 增加一级缩进（反馈：快捷键）
    if (e.key !== "Tab" && !((e.metaKey || e.ctrlKey) && (e.key === "[" || e.key === "]"))) return;
    e.preventDefault();
    const outdent = e.key === "Tab" ? e.shiftKey : e.key === "[";

    // 有选择（哪怕单行）或反缩进 → 行级缩进/反缩进
    if (s !== end || outdent) {
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      const lineEndIdx = value.indexOf("\n", Math.max(end - 1, s));
      const segEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
      const lines = value.slice(lineStart, segEnd).split("\n");
      let delta = 0;
      let firstDelta = 0;
      const processed = lines.map((line, i) => {
        const m = line.match(/^(\u3000\u3000|\t| {1,4})/);
        if (outdent) {
          const cut = m ? m[1].length : 0;
          if (i === 0) firstDelta = -cut;
          delta -= cut;
          return line.slice(cut);
        }
        const ins = indentUnit(value, lineStart);
        if (i === 0) firstDelta = ins.length;
        delta += ins.length;
        return ins + line;
      });
      const next =
        value.slice(0, lineStart) + processed.join("\n") + value.slice(segEnd);
      updateTab(activeTab.path, { draft: next });
      pendingCaretRef.current = {
        pos: Math.max(lineStart, s + firstDelta),
        sel: Math.max(lineStart, end + delta),
      };
      return;
    }

    if (outdent) {
      // 反缩进：删除光标所在行行首一个缩进单位
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      const m = value.slice(lineStart).match(/^(\u3000\u3000|\t| {1,4})/);
      if (!m) return;
      const next = value.slice(0, lineStart) + value.slice(lineStart + m[1].length);
      const caret = Math.max(lineStart, s - m[1].length);
      updateTab(activeTab.path, { draft: next });
      pendingCaretRef.current = { pos: caret, sel: caret };
      return;
    }

    // 普通插入
    const ins = indentUnit(value, s);
    const next = value.slice(0, s) + ins + value.slice(end);
    const caret = s + ins.length;
    updateTab(activeTab.path, { draft: next });
    pendingCaretRef.current = { pos: caret, sel: caret };
  }

  // ---------- 编辑器：粘贴图片 → 上传到 <笔记目录>/images/ 并插入引用 ----------

  /** 大图压缩（反馈：上传图片报错，服务器 body/内存受限）：>1.5MB 的位图缩到 ≤1600px 宽再传。
   *  SVG/GIF 直接原样上传；压缩失败也回退原图（尽力而为） */
  async function compressPastedImage(file: File): Promise<{ dataUrl: string; ext: string }> {
    const extFromType = (file.type.split("/")[1] ?? "png").replace("jpeg", "jpg");
    const rawUrl = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(new Error("read clipboard image failed"));
      fr.readAsDataURL(file);
    });
    if (file.size <= 1_500_000 || extFromType === "svg" || extFromType === "gif") {
      return { dataUrl: rawUrl, ext: extFromType };
    }
    try {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("decode failed"));
        img.src = rawUrl;
      });
      const maxW = 1600;
      const scale = Math.min(1, maxW / (img.naturalWidth || maxW));
      if (scale >= 1) return { dataUrl: rawUrl, ext: extFromType };
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return { dataUrl: rawUrl, ext: extFromType };
      // 有透明通道的 png 保持 png（白底填充会毁截图叠加层）；其余转 jpeg 大幅减小体积
      const keepPng = extFromType === "png" && /^data:image\/png/i.test(rawUrl) && hasAlpha(ctx, img, canvas);
      const outType = keepPng ? "image/png" : "image/jpeg";
      if (!keepPng) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const out = canvas.toDataURL(outType, 0.85);
      // 压缩反而更大（罕见）→ 回退原图
      return out.length < rawUrl.length ? { dataUrl: out, ext: keepPng ? "png" : "jpg" } : { dataUrl: rawUrl, ext: extFromType };
    } catch {
      return { dataUrl: rawUrl, ext: extFromType };
    }
  }

  /** 采样检测图片是否有透明像素（决定 png 是否保真） */
  function hasAlpha(ctx: CanvasRenderingContext2D, img: HTMLImageElement, canvas: HTMLCanvasElement): boolean {
    try {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < d.length; i += 4 * 97) {
        if (d[i] < 250) return true;
      }
    } catch {
      /* 跨域等：按有透明处理，走 png */
      return true;
    }
    return false;
  }

  function onEditorPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {    const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
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
      const { dataUrl, ext } = await compressPastedImage(file);
      // 名称扩展名跟随实际压缩结果（png→jpg 转换时修正）
      name = name.replace(/\.[^.]+$/, "") + `.${ext}`;
      const dataBase64 = dataUrl.split(",")[1] ?? "";
      const r = await fetch("/api/docs/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dir: tab.data.dir, name, dataBase64, repo: repo ?? undefined }),
      });
      // 服务端可能返回 HTML 错误页（网关 413/5xx 等）——直接 r.json() 会抛
      // "Unexpected token '<'"（反馈：上传图片报错）。解析失败给可理解的提示。
      let json: { path?: string; error?: string } = {};
      let parseFailed = false;
      try {
        json = (await r.json()) as { path?: string; error?: string };
      } catch {
        parseFailed = true;
      }
      if (!r.ok || !json.path) {
        const reason = parseFailed
          ? t.docDrawer.pasteImageServerError(r.status)
          : json.error ?? r.statusText;
        updateTab(path, {
          saveMsg: t.docDrawer.pasteImageFailed(reason),
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
    <div
      className="h-full flex flex-col bg-white dark:bg-zinc-950"
      onDragOver={(e) => {
        // 分屏拖动：接受另一个分屏拖来的标签（反馈：左右拖拽切换）
        if (onForeignDrop && Array.from(e.dataTransfer.types || []).includes(TAB_DRAG_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setPaneDropActive(true);
        }
      }}
      onDragLeave={(e) => {
        if (paneDropActive && e.currentTarget === e.target) setPaneDropActive(false);
      }}
      onDrop={(e) => {
        const path = e.dataTransfer.getData(TAB_DRAG_TYPE);
        setPaneDropActive(false);
        if (!path || !onForeignDrop) return;
        e.preventDefault();
        if (tabs.some((tb) => tb.path === path)) {
          setActivePath(path); // 本分屏已有 → 仅激活
        } else {
          onForeignDrop(path);
        }
      }}
    >
      {paneDropActive && (
        <div className="absolute inset-0 z-40 bg-blue-500/10 ring-2 ring-inset ring-blue-500 pointer-events-none" />
      )}
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
              <>
                <button
                  onClick={translateDoc}
                  disabled={activeTab.translating}
                  title={t.docDrawer.translateBtn}
                  className="px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1 disabled:opacity-50"
                >
                  {activeTab.translating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Languages className="w-3.5 h-3.5" />
                  )}
                  {activeTab.translating ? t.docDrawer.translating : t.docDrawer.translateBtn}
                </button>
                <button
                  onClick={() => updateTab(activeTab.path, { mode: "edit" })}
                  className="px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1"
                >
                  <Pencil className="w-3.5 h-3.5" /> {t.common.edit}
                </button>
              </>
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
                draggable
                onDragStart={(e) => {
                  // 分屏拖动：把本分屏的标签拖到另一个分屏（反馈：左右拖拽切换）
                  e.dataTransfer.setData(TAB_DRAG_TYPE, tb.path);
                  e.dataTransfer.effectAllowed = "move";
                }}
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

      {/* 原文/译文切换（翻译完成后显示） */}
      {activeTab?.data && activeTab.mode === "preview" && activeTab.translated !== null && (
        <div className="px-4 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 flex items-center gap-2 text-xs shrink-0">
          <div className="flex rounded-md border border-zinc-300 dark:border-zinc-700 overflow-hidden">
            <button
              onClick={() => updateTab(activeTab.path, { transView: false })}
              className={"px-2 py-0.5 " + (!activeTab.transView ? "bg-blue-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800")}
            >
              {t.docDrawer.originalView}
            </button>
            <button
              onClick={() => updateTab(activeTab.path, { transView: true })}
              className={"px-2 py-0.5 " + (activeTab.transView ? "bg-blue-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800")}
            >
              {t.docDrawer.translatedView}
            </button>
          </div>
          <span className="text-[10px] text-zinc-400">{t.docDrawer.translateHint}</span>
        </div>
      )}

      {/* 内容区：各文档标签常驻栈（反馈：PDF 切换回来不要重新加载）。
          非激活标签 visibility:hidden（保留布局盒，IntersectionObserver 伸展仍有效，已渲染页面不回收） */}
      <div className="flex-1 relative min-h-0">
        {activeTab?.loading && (
          <div className="absolute left-5 top-5 z-30 flex items-center gap-2 text-zinc-500 bg-white/80 dark:bg-zinc-950/80 rounded px-2 py-1">
            <Loader2 className="w-4 h-4 animate-spin" /> {t.docDrawer.loading}
          </div>
        )}
        {activeTab?.err && (
          <div className="absolute left-5 top-5 z-30 text-rose-600 text-sm bg-white/80 dark:bg-zinc-950/80 rounded px-2 py-1">
            {t.docDrawer.readFailed(activeTab.err)}
          </div>
        )}

        {/* PDF 标签：全部常驻，仅隐藏非激活 */}
        {tabs.map((tb) =>
          tb.pdf ? (
            <div
              key={tb.path}
              className={
                "absolute inset-0 md:inset-0 " +
                (tb.path === activePath
                  ? ""
                  : "invisible pointer-events-none max-sm:hidden")
              }
              aria-hidden={tb.path !== activePath}
            >
              <div className="h-full min-h-0">
                <PdfViewer path={tb.path} active={tb.path === activePath} repo={repo} />
              </div>
            </div>
          ) : null,
        )}

        {/* 图片标签：激活时渲染（浏览器有缓存，切换成本低） */}
        {tabs.map((tb) =>
          tb.image && tb.path === activePath ? (
            <div
              key={tb.path}
              className="absolute inset-0 flex items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-900/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/docs/asset?path=${encodeURIComponent(tb.path)}${repo ? `&repo=${encodeURIComponent(repo)}` : ""}`}
                alt={tb.path}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : null,
        )}

        {/* markdown 预览标签：常驻栈 */}
        {tabs.map((tb) =>
          tb.data && tb.mode === "preview" ? (
            <div
              key={tb.path}
              data-mdtab={tb.path}
              className={
                "absolute inset-0 overflow-y-auto " +
                (tb.path === activePath
                  ? ""
                  : "invisible pointer-events-none max-sm:hidden")
              }
              aria-hidden={tb.path !== activePath}
            >
              <div className="p-5">
                {(tb.transView ? tb.translated ?? "" : tb.data.content).trim() === "" ? (
                  <div className="text-zinc-400 italic">
                    {t.docDrawer.emptyContent}
                  </div>
                ) : (
                  <div className="prose-tutor">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath, remarkBreaks, remarkHighlight, remarkPens, remarkCallouts]}
                      rehypePlugins={[rehypeHighlight, rehypeKatex, rehypeFigDefs]}
                       components={buildMarkdownComponents(rewriteAsset, undefined, openImage)}
                    >
                      {preprocessNote(tb.transView ? tb.translated ?? "" : tb.data.content)}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ) : null,
        )}

        {/* 编辑模式标签：常驻栈（textarea ref 只接激活标签，光标定位不串扰） */}
        {tabs.map((tb) =>
          tb.data && tb.mode === "edit" ? (
            (() => {
              const isActive = tb.path === activePath;
              return (
                <div
                  key={tb.path}
                  className={
                    "absolute inset-0 flex flex-col min-h-0 " +
                    (isActive ? "" : "invisible pointer-events-none max-sm:hidden")
                  }
                  aria-hidden={!isActive}
                >
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
                    <button
                      onClick={insertTable}
                      className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      {t.docDrawer.insertTable}
                    </button>
                    {/* 红笔/蓝笔批注（反馈：md 批注快速切换字色）：
                        选中文字点击即一键换色；无选中则开启后直接输入即带色，Esc 或再点一次结束 */}
                    <span className="flex items-center gap-1 ml-1">
                      <button
                        onClick={() => togglePen("r")}
                        title={t.docDrawer.penRed}
                        className={
                          "p-1.5 rounded border flex items-center " +
                          (pen === "r"
                            ? "border-red-500 bg-red-50 dark:bg-red-950/40"
                            : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800")
                        }
                      >
                        <PenLine className="w-3.5 h-3.5 text-red-600" />
                      </button>
                      <button
                        onClick={() => togglePen("b")}
                        title={t.docDrawer.penBlue}
                        className={
                          "p-1.5 rounded border flex items-center " +
                          (pen === "b"
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
                            : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800")
                        }
                      >
                        <PenLine className="w-3.5 h-3.5 text-blue-600" />
                      </button>
                    </span>
                    {/* 实时预览开关（反馈：编辑时插入的图片要立即可见） */}
                    <button
                      onClick={() => setLivePreview((v) => !v)}
                      title={t.docDrawer.livePreview}
                      className={"px-2 py-1 rounded border flex items-center gap-1 " + (livePreview ? "border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-950/40" : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800")}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {t.docDrawer.livePreview}
                    </button>
                    <span className="ml-auto text-zinc-400 text-[10px]">
                      {t.docDrawer.autoSaved} 5s
                    </span>
                  </div>
                  <div className="flex-1 flex min-h-0">
                    <textarea
                      ref={isActive ? draftRef : undefined}
                      value={tb.draft}
                      onChange={(e) => updateTab(tb.path, { draft: e.target.value })}
                      onPaste={onEditorPaste}
                      onKeyDown={onEditorKeyDown}
                      onClick={syncPreviewToCaret}
                      spellCheck={false}
                      className="flex-1 min-w-0 min-h-[280px] p-4 sm:p-5 text-[16px] sm:text-sm font-mono leading-relaxed bg-transparent outline-none resize-none"
                      placeholder=""
                    />
                    {isActive && livePreview && (
                      <div
                        ref={previewRef}
                        className="hidden md:block w-1/2 min-w-0 overflow-y-auto border-l border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-950"
                      >
                        <div className="prose-tutor">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath, remarkBreaks, remarkHighlight, remarkPens, remarkCallouts]}
                            rehypePlugins={[rehypeHighlight, rehypeKatex, rehypeFigDefs]}
                             components={buildMarkdownComponents(rewriteAsset, jumpToEditLine, openImage)}
                          >
                            {preprocessNote(previewDraft)}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          ) : null,
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

      {/* 图片 lightbox：点开预览 / 调宽度 / 固定桌面（反馈） */}
      <ImageLightbox
        state={lightbox}
        canApply={!!activeTab?.data}
        onClose={() => setLightbox(null)}
        onApplyWidth={applyImageWidth}
      />
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
  /** 传入时：实时预览里点击块级元素 → 跳到左侧编辑器对应行（反馈：预览点击定位编辑） */
  jumpToEdit?: (line: number) => void,
  /** 传入时：点击图片打开 lightbox（反馈：图片可点开、调大小、固定桌面） */
  onOpenImage?: (st: ImageLightboxState) => void,
): Components {
  let headingIdx = -1;
  const heading = (Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") =>
    function Heading({ children, ...rest }: { children?: React.ReactNode; node?: unknown }) {
      headingIdx += 1;
      const line = (rest as { node?: { position?: { start?: { line?: number } } } }).node?.position?.start?.line ?? null;
      return (
        <Tag
          id={`md-h-${headingIdx}`}
          className="scroll-mt-2"
          data-src-line={line ?? undefined}
          onClick={jumpToEdit && line ? () => jumpToEdit(line) : undefined}
          style={jumpToEdit && line ? { cursor: "pointer" } : undefined}
        >
          {children}
        </Tag>
      );
    };
  /** 块级元素（p/li）包装：点击 → 跳编辑器对应行 */
  const jumpBlock = <P extends { node?: unknown }>(Tag: "p" | "li" | "tr") => {
    const Comp = function JumpBlock(props: P & { children?: React.ReactNode }) {
      const { node, ...rest } = props as P & { node?: { position?: { start?: { line?: number } } }; children?: React.ReactNode };
      const line = node?.position?.start?.line ?? null;
      return (
        <Tag
          {...(rest as unknown as Record<string, unknown>)}
          data-src-line={line ?? undefined}
          onClick={jumpToEdit && line ? () => jumpToEdit(line) : undefined}
          style={jumpToEdit && line ? { cursor: "pointer" } : undefined}
        >
          {(props as { children?: React.ReactNode }).children}
        </Tag>
      );
    };
    return Comp;
  };
  const components: Components = {
    // 实时预览传 jumpToEdit：点击代码块跳到编辑器对应行（语言标签/折叠仍然生效）
    ...(jumpToEdit ? codeComponentsWithJump(jumpToEdit) : markdownCodeComponents),
    h1: heading("h1"),
    h2: heading("h2"),
    h3: heading("h3"),
    h4: heading("h4"),
    h5: heading("h5"),
    h6: heading("h6"),
    img: ({ src, alt, title, ...rest }) => {
      // title 为纯数字/带 px → 指定显示宽度（反馈：图片插入后过大，宽度可调）
      // 语法：![alt](src "600") 或 ![alt](src "600px")
      const wMatch =
        typeof title === "string" && !title.startsWith("figdef:")
          ? title.trim().match(/^(\d{2,4})(?:px)?$/)
          : null;
      const fixedW = wMatch ? Math.min(Number(wMatch[1]), 2000) : null;
      const imgEl = (
        <img
          src={typeof src === "string" ? rewriteAsset(src) : undefined}
          alt={alt ?? ""}
          style={{
            maxWidth: "100%",
            height: "auto",
            ...(fixedW ? { width: `${fixedW}px` } : null),
          }}
          onClick={
            onOpenImage && typeof src === "string"
              ? () => onOpenImage({ src: rewriteAsset(src), originalSrc: src, alt })
              : undefined
          }
          className={onOpenImage ? "cursor-zoom-in" : undefined}
          {...rest}
        />
      );
      // Pandoc 式图片定义（figrefs.ts 改写）：渲染为带编号题注的 figure，id 供 [@fig:id] 跳转
      const figId =
        typeof title === "string" && title.startsWith("figdef:")
          ? title.slice("figdef:".length)
          : null;
      if (!figId) return imgEl;
      return (
        <figure id={`figdef-${figId}`} className="my-4 text-center scroll-mt-16">
          <span className="inline-block max-w-full">{imgEl}</span>
          <figcaption className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            {alt}
          </figcaption>
        </figure>
      );
    },
    a: ({ href, children, ...rest }) => (
      <a
        href={href}
        {...(href?.startsWith("#") ? {} : { target: "_blank", rel: "noopener noreferrer" })}
        onClick={jumpToEdit ? (e) => e.stopPropagation() : undefined}
        {...rest}
      >
        {children}
        {!href?.startsWith("#") && (
          <ExternalLink className="inline w-3 h-3 ml-0.5 align-baseline" />
        )}
      </a>
    ),
  };
  if (!jumpToEdit) return components;
  return {
    ...components,
    // 点击预览块级元素跳到编辑器对应行（表格：按行 tr 精确定位）
    p: jumpBlock("p"),
    li: jumpBlock("li"),
    tr: jumpBlock("tr"),
  };
}
