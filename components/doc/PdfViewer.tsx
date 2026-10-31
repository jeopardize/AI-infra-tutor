"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  FileText,
  List,
  ListTree,
  Loader2,
  Save,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useLang } from "@/lib/i18n/context";

/* ---------- pdf.js CDN 运行时加载（防瘫：不进 node_modules） ---------- */

const PDFJS_VERSION = "3.11.174";
const PDFJS_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/legacy/build`;

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

let pdfjsPromise: Promise<any> | null = null;

function loadPdfjs(): Promise<any> {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfjsPromise) {
    pdfjsPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `${PDFJS_BASE}/pdf.min.js`;
      s.async = true;
      s.onload = () => {
        const lib = window.pdfjsLib;
        if (lib) {
          lib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`;
          resolve(lib);
        } else {
          pdfjsPromise = null;
          reject(new Error("pdf.js loaded but missing global"));
        }
      };
      s.onerror = () => {
        pdfjsPromise = null;
        reject(new Error("pdf.js CDN load failed"));
      };
      document.head.appendChild(s);
    });
  }
  return pdfjsPromise;
}

/* ---------- 标注数据结构与配色 ---------- */

export interface PdfAnnotation {
  id: string;
  page: number;
  /** 归一化矩形（相对页面宽高的 0-1） */
  rects: Array<{ x: number; y: number; w: number; h: number }>;
  color: string;
  /** highlight=填充高亮（默认）；underline=下划线 */
  kind: "highlight" | "underline";
  quote: string;
  note: string;
  createdAt: number;
}

const COLORS = [
  { value: "#fde047", zh: "黄色", en: "Yellow" },
  { value: "#86efac", zh: "绿色", en: "Green" },
  { value: "#93c5fd", zh: "蓝色", en: "Blue" },
  { value: "#f9a8d4", zh: "粉色", en: "Pink" },
  { value: "#fca5a5", zh: "红色", en: "Red" },
];

function colorAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ---------- 单页渲染（canvas + 文本层 + 标注层） ---------- */

/** 合并同行重叠矩形（反馈：标点符号区域被涂好几遍导致颜色不均）。
 *  pdf.js 文本层按 span 切分，全角标点的字形框与前文重叠，逐 span 画半透明色会出现深色叠影；
 *  垂直重叠超过一半视为同一行，合并为一个大矩形，保证同一次高亮内颜色均匀。 */
function mergeRects<T extends { x: number; y: number; w: number; h: number }>(rects: T[]): T[] {
  if (rects.length < 2) return rects;
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: T[] = [];
  for (const r of sorted) {
    const prev = out[out.length - 1];
    if (prev) {
      const overlap = Math.min(prev.y + prev.h, r.y + r.h) - Math.max(prev.y, r.y);
      const minH = Math.min(prev.h, r.h);
      if (minH > 0 && overlap > minH * 0.5) {
        const right = Math.max(prev.x + prev.w, r.x + r.w);
        const bottom = Math.max(prev.y + prev.h, r.y + r.h);
        prev.x = Math.min(prev.x, r.x);
        prev.y = Math.min(prev.y, r.y);
        prev.w = right - prev.x;
        prev.h = bottom - prev.y;
        continue;
      }
    }
    out.push({ ...r });
  }
  return out;
}

function PdfPageContent({
  pdfjs,
  doc,
  pageNo,
  width,
  annotations,
  onCreate,
  onToggleAnnotation,
}: {
  pdfjs: any;
  doc: any;
  pageNo: number;
  width: number;
  annotations: PdfAnnotation[];
  onCreate: (sel: { rects: PdfAnnotation["rects"]; quote: string; x: number; y: number } | null) => void;
  /** 点击命中标注 → 打开编辑气泡；点空白 → 关闭 */
  onToggleAnnotation: (a: PdfAnnotation | null, x: number, y: number) => void;
}) {
  const { t } = useLang();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(true);
  /** 扫描版页面（无文字层）：没有可选文字 → 改为拖拽框选矩形高亮（反馈：批注无法使用） */
  const [hasText, setHasText] = useState<boolean | null>(null);
  const [dragRect, setDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragStartRef = useRef<{ px: number; py: number; bx: number; by: number; bw: number; bh: number } | null>(null);
  /** 拖拽刚结束 → 吞掉紧随的 click（避免框选后的单击又触发标注气泡命中检测） */
  const suppressClickRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let renderTask: any = null;
    let textTask: any = null;
    setRendering(true);
    (async () => {
      try {
        const page = await doc.getPage(pageNo);
        if (cancelled) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const base = page.getViewport({ scale: 1 });
        const scale = (width * dpr) / base.width;
        const vp = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${(vp.height * width) / vp.width}px`;
        renderTask = page.render({ canvasContext: ctx, viewport: vp });
        await renderTask.promise;
        if (cancelled) return;
        // 文本层：支持选择文字生成高亮
        const tl = textRef.current;
        if (tl) {
          tl.innerHTML = "";
          const tc = await page.getTextContent();
          if (cancelled) return;
          setHasText(tc.items.some((it: { str?: string }) => it.str && it.str.trim() !== ""));
          tl.style.setProperty("--scale-factor", String(width / base.width));
          if (typeof pdfjs.renderTextLayer === "function") {
            textTask = pdfjs.renderTextLayer({
              textContentSource: tc,
              container: tl,
              viewport: page.getViewport({ scale: width / base.width }),
            });
            await textTask.promise;
          }
        }
        if (!cancelled) setRendering(false);
      } catch (e) {
        // 渲染被取消（RenderTaskCancelled）不算错误
        const msg = (e as Error)?.message ?? "";
        if (!cancelled && !/cancel/i.test(msg)) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
      try { renderTask?.cancel(); } catch { /* ignore */ }
      try { textTask?.cancel(); } catch { /* ignore */ }
    };
  }, [pdfjs, doc, pageNo, width]);

  /** 选中文字 → 记录待选区（右键菜单里再选「高亮/下划线」；反馈：默认点击不高亮） */
  function selectionRects(): PdfAnnotation["rects"] | null {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return null;
    const rects = Array.from(sel.getRangeAt(0).getClientRects())
      .filter(
        (r) =>
          r.width > 1 &&
          r.height > 1 &&
          r.bottom > box.top &&
          r.top < box.bottom,
      )
      .map((r) => ({
        x: Math.max(0, (r.left - box.left) / box.width),
        y: Math.max(0, (r.top - box.top) / box.height),
        w: Math.min(1, r.width / box.width),
        h: r.height / box.height,
      }));
    return rects.length ? mergeRects(rects) : null;
  }

  function handleMouseUp() {
    // 扫描版页面走拖拽框选（onRectDragEnd），不做文字选区
    if (hasText === false) return;
    // 仅刷新待选区；无选择时清除（不高亮、不清除选区显示）
    const rects = selectionRects();
    onCreate(rects ? { rects, quote: window.getSelection()!.toString().trim(), x: 0, y: 0 } : null);
  }

  /** 扫描版页面（无文字层）：拖拽框选矩形 → 待选区 → 浮动条选高亮/下划线 */
  function onRectDragStart(e: React.MouseEvent) {
    if (e.button !== 0 || hasText !== false) return;
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    dragStartRef.current = { px: e.clientX, py: e.clientY, bx: box.left, by: box.top, bw: box.width, bh: box.height };
    suppressClickRef.current = false;
  }
  function onRectDragMove(e: React.MouseEvent) {
    const st = dragStartRef.current;
    if (!st) return;
    const x1 = Math.min(st.px, e.clientX);
    const x2 = Math.max(st.px, e.clientX);
    const y1 = Math.min(st.py, e.clientY);
    const y2 = Math.max(st.py, e.clientY);
    setDragRect({
      x: (x1 - st.bx) / st.bw,
      y: (y1 - st.by) / st.bh,
      w: (x2 - x1) / st.bw,
      h: (y2 - y1) / st.bh,
    });
  }
  function onRectDragEnd(e: React.MouseEvent) {
    const st = dragStartRef.current;
    dragStartRef.current = null;
    const rect = dragRect;
    setDragRect(null);
    if (!st || !rect) return;
    if (rect.w * st.bw < 8 || rect.h * st.bh < 8) return; // 轻点不算框选
    suppressClickRef.current = true;
    onCreate({ rects: [rect], quote: t.docDrawer.pdfRectQuote, x: e.clientX, y: e.clientY });
  }

  /** 右键：有待选区时弹出「高亮/下划线」菜单（拦截浏览器默认菜单） */
  function handleContextMenu(e: React.MouseEvent) {
    const rects = selectionRects();
    if (!rects) return; // 无选择 → 浏览器默认菜单
    e.preventDefault();
    onCreate({
      rects,
      quote: window.getSelection()!.toString().trim(),
      x: e.clientX,
      y: e.clientY,
    });
  }

  /** 点击命中检测：点在标注矩形上 → 编辑气泡；点空白 → 关闭 */
  function handleClick(e: React.MouseEvent) {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const nx = (e.clientX - box.left) / box.width;
    const ny = (e.clientY - box.top) / box.height;
    const hit = annotations
      .filter((a) => a.page === pageNo)
      .find((a) =>
        a.rects.some(
          (r) => nx >= r.x && nx <= r.x + r.w && ny >= r.y && ny <= r.y + r.h,
        ),
      );
    onToggleAnnotation(hit ?? null, e.clientX, e.clientY);
  }

  const pageAnns = annotations.filter((a) => a.page === pageNo);

  return (
    <div
      ref={wrapRef}
      className="relative bg-white shadow-md mx-auto"
      style={{ width }}
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
      onClick={(e) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        handleClick(e);
      }}
      onMouseDown={onRectDragStart}
      onMouseMove={onRectDragMove}
      onMouseUpCapture={onRectDragEnd}
    >
      <canvas ref={canvasRef} className="block" />
      {/* 文本层（选择用） */}
      <div ref={textRef} className="pdf-text-layer" />
      {/* 扫描版：拖拽框选预览矩形 */}
      {dragRect && hasText === false && (
        <div
          className="absolute z-30 rounded-[2px] border-2 border-blue-500 bg-blue-500/25 pointer-events-none"
          style={{
            left: `${dragRect.x * 100}%`,
            top: `${dragRect.y * 100}%`,
            width: `${dragRect.w * 100}%`,
            height: `${dragRect.h * 100}%`,
          }}
        />
      )}
      {/* 扫描版提示（一次性显示在该页顶部） */}
      {hasText === false && (
        <div className="absolute left-0 right-0 top-0 z-10 px-3 py-1 text-[10px] text-zinc-400 bg-white/80 dark:bg-zinc-950/70 text-center pointer-events-none">
          {t.docDrawer.pdfScanHint}
        </div>
      )}
      {/* 标注层（纯视觉，点击命中由 handleClick 处理，不挡文字选择） */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        {pageAnns.map((a) =>
          mergeRects(a.rects).map((r, i) => (
            <div
              key={`${a.id}-${i}`}
              className="absolute rounded-[2px]"
              style={
                (a.kind ?? "highlight") === "underline"
                  ? {
                      left: `${r.x * 100}%`,
                      top: `${r.y * 100}%`,
                      width: `${r.w * 100}%`,
                      height: `${r.h * 100}%`,
                      background: "transparent",
                      borderBottom: `2.5px solid ${colorAlpha(a.color, 0.95)}`,
                    }
                  : {
                      left: `${r.x * 100}%`,
                      top: `${r.y * 100}%`,
                      width: `${r.w * 100}%`,
                      height: `${r.h * 100}%`,
                      background: colorAlpha(a.color, 0.38),
                      borderBottom: `2px solid ${colorAlpha(a.color, 0.9)}`,
                    }
              }
            />
          )),
        )}
      </div>
      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-300 bg-white/60">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}
    </div>
  );
}

/* ---------- 主查看器 ---------- */

/** PDF 目录树节点（递归渲染章节） */
function OutlineNode({
  item,
  depth,
  pathId,
  onJump,
}: {
  item: { title?: string; dest: unknown; items?: unknown[] };
  depth: number;
  pathId: string;
  onJump: (item: { dest: unknown; title?: string }) => void;
}) {
  const kids = Array.isArray(item.items) ? item.items : [];
  return (
    <div>
      <button
        onClick={() => onJump(item)}
        className="w-full text-left py-1 pr-2 text-sm rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 truncate"
        style={{ paddingLeft: 8 + depth * 12 }}
        title={item.title ?? ""}
      >
        {item.title || "—"}
      </button>
      {kids.map((c, i) => (
        <OutlineNode key={`${pathId}-${i}`} item={c as any} depth={depth + 1} onJump={onJump} pathId={`${pathId}-${i}`} />
      ))}
    </div>
  );
}

export function PdfViewer({ path }: { path: string }) {
  const { t, lang } = useLang();
  const [pdfjs, setPdfjs] = useState<any>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [doc, setDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(720);
  const [zoom, setZoom] = useState(1);
  const [visible, setVisible] = useState<Set<number>>(new Set([1]));
  const [color, setColor] = useState(COLORS[0].value);
  const [anns, setAnns] = useState<PdfAnnotation[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const [listOpen, setListOpen] = useState(false);
  /** PDF 内置目录（getOutline），面板展示并可跳转（反馈：PDF 需要目录跳转） */
  const [outline, setOutline] = useState<any[] | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const outlinePageCache = useRef<Map<string, number>>(new Map());
  const [pop, setPop] = useState<{ ann: PdfAnnotation; x: number; y: number } | null>(null);
  /** 待选区：已框选文字、等右键/浮动条选择「高亮/下划线」 */
  const [pending, setPending] = useState<{
    page: number;
    rects: PdfAnnotation["rects"];
    quote: string;
  } | null>(null);
  /** 右键菜单位置（null=不显示） */
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef<Record<number, HTMLDivElement | null>>({});
  const annsRef = useRef<PdfAnnotation[]>([]);
  const dirtyRef = useRef(false);

  /* 加载 pdf.js 与文档 */
  useEffect(() => {
    let cancelled = false;
    let d: any = null;
    setLoadErr(null);
    (async () => {
      try {
        const lib = await loadPdfjs();
        if (cancelled) return;
        setPdfjs(lib);
        d = await lib.getDocument({
          url: `/api/docs/asset?path=${encodeURIComponent(path)}`,
        }).promise;
        if (cancelled) return;
        setDoc(d);
        setNumPages(d.numPages);
        // 恢复上次阅读位置（页码/缩放）
        try {
          const saved = JSON.parse(localStorage.getItem(`pdf-pos:${path}`) ?? "null") as
            | { page?: number; zoom?: number }
            | null;
          if (saved?.zoom && saved.zoom >= 0.5 && saved.zoom <= 2.5) setZoom(saved.zoom);
          if (saved?.page && saved.page > 1) {
            setTimeout(() => setPage(Math.min(saved.page!, d.numPages)), 80);
          }
        } catch {
          /* ignore */
        }
        // 目录：加载失败不应影响主流程
        setOutline(null);
        outlinePageCache.current = new Map();
        d.getOutline().then((o: any[] | null) => setOutline(o)).catch(() => setOutline(null));
      } catch (e) {
        if (!cancelled) setLoadErr((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      try { d?.destroy?.(); } catch { /* ignore */ }
    };
  }, [path]);

  /* 加载标注 */
  useEffect(() => {
    setAnns(null);
    setDirty(false);
    dirtyRef.current = false;
    fetch(`/api/docs/annotations?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((j: { annotations?: PdfAnnotation[] }) => {
        setAnns(j.annotations ?? []);
        annsRef.current = j.annotations ?? [];
      })
      .catch(() => setAnns([]));
  }, [path]);

  const updateAnns = useCallback((next: PdfAnnotation[]) => {
    annsRef.current = next;
    setAnns(next);
    setDirty(true);
    dirtyRef.current = true;
  }, []);

  const persist = useCallback(async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setDirty(false);
    setSaveState("saving");
    try {
      const r = await fetch("/api/docs/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, annotations: annsRef.current }),
      });
      if (!r.ok) throw new Error(await r.text());
      setSaveState("ok");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      dirtyRef.current = true;
      setDirty(true);
      setSaveState("err");
    }
  }, [path]);

  /* 变更后 1.2s 自动保存；卸载时兜底保存 */
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(persist, 1200);
    return () => clearTimeout(timer);
  }, [anns, dirty, persist]);

  useEffect(() => {
    return () => {
      if (dirtyRef.current) {
        fetch("/api/docs/annotations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, annotations: annsRef.current }),
          keepalive: true,
        });
      }
    };
  }, [path]);

  /* 容器宽度 → 页面宽度 */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setWidth(Math.max(280, el.clientWidth - 24));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);

  /* 可视页懒渲染 */
  useEffect(() => {
    if (!numPages) return;
    const root = scrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev);
          let changed = false;
          for (const en of entries) {
            const p = Number((en.target as HTMLElement).dataset.page);
            if (en.isIntersecting) {
              if (!next.has(p)) { next.add(p); changed = true; }
            } else if (next.has(p)) {
              // 视口外（含 800px 缓冲外）卸载页面，超大 PDF 不会内存/渲染堆积
              next.delete(p);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      },
      { root, rootMargin: "1200px 0px" },
    );
    Object.values(pageEls.current).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [numPages, doc]);

  const [curPage, setCurPage] = useState(1);
  const curPageRef = useRef(1);

  /* 阅读位置记忆：页码/缩放变化时落盘（反馈：切页面回来应维持之前的状态） */
  useEffect(() => {
    if (!doc) return;
    try {
      localStorage.setItem(`pdf-pos:${path}`, JSON.stringify({ page: curPage, zoom }));
    } catch {
      /* ignore */
    }
  }, [curPage, zoom, doc, path]);

  const setPage = (p: number) => {
    curPageRef.current = p;
    setCurPage(p);
    const el = pageEls.current[p];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* 当前页跟踪（反馈：页码显示不随滚动更新）：视口上 1/3 处所在的页 */
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !numPages) return;
    let raf = 0;
    const update = () => {
      const rr = root.getBoundingClientRect();
      const y = rr.top + Math.min(rr.height / 3, 200);
      for (const el of Object.values(pageEls.current)) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top <= y && r.bottom > y) {
          const p = Number(el.dataset.page);
          if (p && p !== curPageRef.current) {
            curPageRef.current = p;
            setCurPage(p);
          }
          return;
        }
      }
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      root.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [numPages, doc]);

  /** 子页回调：null=清除待选区；x/y>0 表示来自右键（打开菜单），否则仅更新待选区 */
  const handlePending = useCallback(
    (
      page: number,
      sel: { rects: PdfAnnotation["rects"]; quote: string; x: number; y: number } | null,
    ) => {
      if (!sel) {
        setPending(null);
        setMenu(null);
        return;
      }
      setPending({ page, rects: sel.rects, quote: sel.quote });
      setMenu(sel.x > 0 || sel.y > 0 ? { x: sel.x, y: sel.y } : null);
    },
    [],
  );

  /** 从待选区创建标注（kind 由菜单/浮动条决定） */
  const createFromPending = useCallback(
    (kind: "highlight" | "underline") => {
      if (!pending) return;
      const a: PdfAnnotation = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        page: pending.page,
        rects: pending.rects,
        color,
        kind,
        quote: pending.quote,
        note: "",
        createdAt: Date.now(),
      };
      updateAnns([...(annsRef.current ?? []), a]);
      window.getSelection()?.removeAllRanges();
      setPending(null);
      setMenu(null);
      setPop(null);
    },
    [pending, color, updateAnns],
  );

  const patchAnnotation = (id: string, patch: Partial<PdfAnnotation>) =>
    updateAnns((annsRef.current ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const deleteAnnotation = (id: string) =>
    updateAnns((annsRef.current ?? []).filter((a) => a.id !== id));

  /** 目录条目 → 页码（dest 可能是命名串或 [ref] 数组；带缓存） */
  async function outlineTargetPage(dest: unknown): Promise<number | null> {
    if (dest == null) return null;
    const key = typeof dest === "string" ? `s:${dest}` : JSON.stringify(dest);
    const cached = outlinePageCache.current.get(key);
    if (cached) return cached;
    try {
      const arr = typeof dest === "string" ? await doc.getDestination(dest) : dest;
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const idx = await doc.getPageIndex(arr[0]);
      if (idx >= 0) {
        outlinePageCache.current.set(key, idx + 1);
        return idx + 1;
      }
      return null;
    } catch {
      return null;
    }
  }

  const jumpOutline = async (item: { dest: unknown; title?: string }) => {
    const p = await outlineTargetPage(item.dest);
    if (p) {
      setPage(p);
      setOutlineOpen(false);
    }
  };

  if (loadErr) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-sm text-zinc-500">
        <span className="text-rose-600">{t.docDrawer.pdfFailed(loadErr)}</span>
        <button
          onClick={() => { pdfjsPromise = null; setLoadErr(null); setDoc(null); }}
          className="px-3 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          {t.docDrawer.pdfRetry}
        </button>
      </div>
    );
  }
  if (!doc || anns === null) {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-zinc-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> {t.docDrawer.pdfLoading}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 relative">
      {/* 工具条 */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 text-xs overflow-x-auto shrink-0">
        <button onClick={() => setPage(curPage - 1)} disabled={curPage <= 1}
          className="p-1 rounded disabled:opacity-30 hover:bg-zinc-200 dark:hover:bg-zinc-800">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="tabular-nums text-zinc-500 shrink-0">
          {curPage}/{numPages}
        </span>
        <button onClick={() => setPage(curPage + 1)} disabled={curPage >= numPages}
          className="p-1 rounded disabled:opacity-30 hover:bg-zinc-200 dark:hover:bg-zinc-800">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <span className="w-px h-4 bg-zinc-300 dark:bg-zinc-700 mx-0.5 shrink-0" />
        <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
          className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800" title="缩小">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="tabular-nums text-zinc-500 shrink-0">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
          className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800" title="放大">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <span className="w-px h-4 bg-zinc-300 dark:bg-zinc-700 mx-0.5 shrink-0" />
        {/* 高亮颜色选择 */}
        {COLORS.map((c) => (
          <button
            key={c.value}
            onClick={() => setColor(c.value)}
            title={lang === "zh" ? c.zh : c.en}
            className={"w-4 h-4 rounded-full border shrink-0 " + (color === c.value ? "ring-2 ring-offset-1 ring-blue-500 border-transparent" : "border-zinc-300 dark:border-zinc-600")}
            style={{ background: c.value }}
          />
        ))}
        <button onClick={() => { window.getSelection()?.removeAllRanges(); }}
          title={t.docDrawer.pdfClearSelection}
          className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 shrink-0">
          <Eraser className="w-3.5 h-3.5" />
        </button>
        <span className="w-px h-4 bg-zinc-300 dark:bg-zinc-700 mx-0.5 shrink-0" />
        <button
          onClick={() => { setOutlineOpen(true); setListOpen(false); }}
          disabled={!outline?.length}
          className="px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800 flex items-center gap-1 shrink-0 disabled:opacity-30"
          title={t.docDrawer.pdfOutline}
        >
          <ListTree className="w-3.5 h-3.5" />
          {t.docDrawer.pdfOutline}
        </button>
        <button onClick={() => { setListOpen(true); setOutlineOpen(false); }}
          className="px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800 flex items-center gap-1 shrink-0">
          <List className="w-3.5 h-3.5" />
          {t.docDrawer.pdfAnnotationList}
          {anns.length > 0 && <span className="text-blue-600">{anns.length}</span>}
        </button>
        <button
          onClick={persist}
          disabled={!dirty || saveState === "saving"}
          className={"px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0 " + (dirty ? "bg-emerald-600 text-white hover:bg-emerald-700" : "text-zinc-400")}
        >
          {saveState === "saving" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {t.common.save}
        </button>
        <span className={"shrink-0 " + (saveState === "err" ? "text-rose-600" : "text-emerald-600")}>
          {saveState === "ok" && t.docDrawer.pdfSaved}
          {saveState === "err" && t.docDrawer.pdfSaveFailed}
          {dirty && saveState === "idle" && <span className="text-amber-600">●</span>}
        </span>
      </div>

      {/* 页面滚动区 */}
      <div ref={scrollRef} className="flex-1 overflow-auto min-h-0 bg-zinc-100 dark:bg-zinc-900"
        onScroll={() => { setPop(null); setMenu(null); setPending(null); }}>
        <div className="py-3 flex flex-col" style={{ width: width * zoom + 24, margin: "0 auto", maxWidth: "none" }}>
          {Array.from({ length: numPages }, (_, i) => (
            <div
              key={i + 1}
              data-page={i + 1}
              ref={(el) => { pageEls.current[i + 1] = el; }}
              className="shrink-0"
            >
              {visible.has(i + 1) ? (
                <PdfPageContent
                  pdfjs={pdfjs}
                  doc={doc}
                  pageNo={i + 1}
                  width={width * zoom}
                  annotations={anns}
                  onCreate={(sel) => handlePending(i + 1, sel)}
                  onToggleAnnotation={(a, x, y) => setPop(a ? { ann: a, x, y } : null)}
                />
              ) : (
                <div
                  className="bg-white shadow-md mx-auto flex items-center justify-center text-zinc-300"
                  style={{ width: width * zoom, height: width * zoom * 1.3 }}
                >
                  <FileText className="w-6 h-6" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 右键菜单：高亮 / 下划线 / 取消 */}
      {menu && pending && (
        <div
          className="fixed z-[60] w-36 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl p-1 text-sm"
          style={{
            left: Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 800) - 160),
            top: Math.min(menu.y, (typeof window !== "undefined" ? window.innerHeight : 600) - 140),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => createFromPending("highlight")}
            className="w-full text-left px-3 py-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
          >
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: colorAlpha(color, 0.6) }} />
            {t.docDrawer.pdfHighlight}
          </button>
          <button
            onClick={() => createFromPending("underline")}
            className="w-full text-left px-3 py-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
          >
            <span className="w-3 h-0.5 rounded inline-block" style={{ background: color }} />
            {t.docDrawer.pdfUnderline}
          </button>
          <button
            onClick={() => {
              window.getSelection()?.removeAllRanges();
              setPending(null);
              setMenu(null);
            }}
            className="w-full text-left px-3 py-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"
          >
            {t.docDrawer.pdfClearSelection}
          </button>
        </div>
      )}

      {/* 待选区浮动条（触屏长按无法右键时的入口；桌面端选择后也可用） */}
      {pending && !menu && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-2 py-1.5 rounded-full bg-zinc-900/90 dark:bg-zinc-800 text-white shadow-xl text-xs">
          <span className="px-1 text-zinc-300 truncate max-w-[180px] hidden sm:inline">
            {pending.quote.slice(0, 24)}…
          </span>
          <button
            onClick={() => createFromPending("highlight")}
            className="px-2.5 py-1 rounded-full bg-yellow-400 text-zinc-900 hover:bg-yellow-300 font-medium"
          >
            {t.docDrawer.pdfHighlight}
          </button>
          <button
            onClick={() => createFromPending("underline")}
            className="px-2.5 py-1 rounded-full bg-blue-500 hover:bg-blue-400"
          >
            {t.docDrawer.pdfUnderline}
          </button>
          <button
            onClick={() => {
              window.getSelection()?.removeAllRanges();
              setPending(null);
            }}
            className="p-1 rounded-full hover:bg-zinc-700"
            title={t.docDrawer.pdfClearSelection}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 标注编辑气泡 */}
      {pop && (
        <div
          className="fixed z-[60] w-64 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl p-2.5"
          style={{
            left: Math.min(pop.x, (typeof window !== "undefined" ? window.innerWidth : 800) - 280),
            top: Math.min(pop.y, (typeof window !== "undefined" ? window.innerHeight : 600) - 200),
          } as CSSProperties}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1 mb-1.5">
            <div className="flex rounded-md border border-zinc-300 dark:border-zinc-700 overflow-hidden mr-1">
              <button
                onClick={() => patchAnnotation(pop.ann.id, { kind: "highlight" })}
                className={"px-1.5 py-0.5 " + ((pop.ann.kind ?? "highlight") === "highlight" ? "bg-blue-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800")}
              >
                {t.docDrawer.pdfHighlight}
              </button>
              <button
                onClick={() => patchAnnotation(pop.ann.id, { kind: "underline" })}
                className={"px-1.5 py-0.5 " + (pop.ann.kind === "underline" ? "bg-blue-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800")}
              >
                {t.docDrawer.pdfUnderline}
              </button>
            </div>
            {COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => patchAnnotation(pop.ann.id, { color: c.value })}
                className={"w-4 h-4 rounded-full border " + (pop.ann.color === c.value ? "ring-2 ring-offset-1 ring-blue-500 border-transparent" : "border-zinc-300 dark:border-zinc-600")}
                style={{ background: c.value }}
              />
            ))}
            <button
              onClick={() => { deleteAnnotation(pop.ann.id); setPop(null); }}
              className="ml-auto p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-zinc-400 hover:text-rose-600"
              title={t.docDrawer.pdfDeleteAnnotation}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {pop.ann.quote && (
            <div className="text-[10px] text-zinc-400 line-clamp-2 mb-1">{pop.ann.quote}</div>
          )}
          <textarea
            value={pop.ann.note}
            onChange={(e) => {
              // pop.ann 是打开气泡时的快照，必须同步更新 pop 本体，否则受控 input 的值永远不变、无法输入
              patchAnnotation(pop.ann.id, { note: e.target.value });
              const v = e.target.value;
              setPop((p) => (p && p.ann.id === pop.ann.id ? { ...p, ann: { ...p.ann, note: v } } : p));
            }}
            placeholder={t.docDrawer.pdfNotePlaceholder}
            className="w-full h-16 text-xs p-1.5 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 resize-none outline-none focus:border-blue-500"
          />
        </div>
      )}

      {/* PDF 目录（章节大纲）面板 */}
      {outlineOpen && (
        <>
          <div className="absolute inset-0 z-40 bg-black/20" onClick={() => setOutlineOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 z-50 w-72 max-w-full bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-3 h-10 border-b border-zinc-200 dark:border-zinc-800 text-xs font-medium shrink-0">
              <span className="flex items-center gap-1.5">
                <ListTree className="w-3.5 h-3.5" />
                {t.docDrawer.pdfOutline}
              </span>
              <button onClick={() => setOutlineOpen(false)} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {(outline ?? []).length === 0 && (
                <div className="text-xs text-zinc-400 text-center py-6">{t.docDrawer.pdfNoOutline}</div>
              )}
              {(outline ?? []).map((it, i) => (
                <OutlineNode key={`o-${i}`} item={it} pathId={`o-${i}`} depth={0} onJump={jumpOutline} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* 标注列表面板 */}
      {listOpen && (
        <>
          <div className="absolute inset-0 z-40 bg-black/20" onClick={() => setListOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 z-50 w-72 max-w-full bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-3 h-10 border-b border-zinc-200 dark:border-zinc-800 text-xs font-medium shrink-0">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                {t.docDrawer.pdfAnnotationList}（{anns.length}）
              </span>
              <button onClick={() => setListOpen(false)} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {anns.length === 0 && (
                <div className="text-xs text-zinc-400 text-center py-6">{t.docDrawer.pdfNoAnnotations}</div>
              )}
              {anns.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { setPage(a.page); setListOpen(false); }}
                  className="w-full text-left p-2 rounded border border-zinc-200 dark:border-zinc-800 hover:border-blue-400 text-xs"
                  style={{ borderLeft: `3px solid ${a.color}` }}
                >
                  <div className="text-zinc-400 mb-0.5">P{a.page}</div>
                  {a.quote && <div className="line-clamp-2 text-zinc-600 dark:text-zinc-300">{a.quote}</div>}
                  {a.note && <div className="mt-1 text-blue-600 dark:text-blue-400 line-clamp-2">📝 {a.note}</div>}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
