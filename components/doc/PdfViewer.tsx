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

function PdfPageContent({
  pdfjs,
  doc,
  pageNo,
  width,
  annotations,
  activeColor,
  onCreate,
  onToggleAnnotation,
}: {
  pdfjs: any;
  doc: any;
  pageNo: number;
  width: number;
  annotations: PdfAnnotation[];
  activeColor: string;
  onCreate: (a: PdfAnnotation) => void;
  /** 点击命中标注 → 打开编辑气泡；点空白 → 关闭 */
  onToggleAnnotation: (a: PdfAnnotation | null, x: number, y: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(true);

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

  /** 选中文字 → 生成高亮标注 */
  function handleMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
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
    if (!rects.length) return;
    onCreate({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      page: pageNo,
      rects,
      color: activeColor,
      quote: sel.toString().trim(),
      note: "",
      createdAt: Date.now(),
    });
    sel.removeAllRanges();
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
      onClick={handleClick}
    >
      <canvas ref={canvasRef} className="block" />
      {/* 文本层（选择用） */}
      <div ref={textRef} className="pdf-text-layer" />
      {/* 标注层（纯视觉，点击命中由 handleClick 处理，不挡文字选择） */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        {pageAnns.map((a) =>
          a.rects.map((r, i) => (
            <div
              key={`${a.id}-${i}`}
              className="absolute rounded-[2px]"
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.w * 100}%`,
                height: `${r.h * 100}%`,
                background: colorAlpha(a.color, 0.38),
                borderBottom: `2px solid ${colorAlpha(a.color, 0.9)}`,
              }}
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
  const [pop, setPop] = useState<{ ann: PdfAnnotation; x: number; y: number } | null>(null);

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
          for (const en of entries) {
            const p = Number((en.target as HTMLElement).dataset.page);
            if (en.isIntersecting) next.add(p);
          }
          return next;
        });
      },
      { root, rootMargin: "800px 0px" },
    );
    Object.values(pageEls.current).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [numPages, doc]);

  const setPage = (p: number) => {
    const el = pageEls.current[p];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const curPage = visible.size ? Math.min(...visible) : 1;

  const createAnnotation = useCallback(
    (a: PdfAnnotation) => updateAnns([...(annsRef.current ?? []), a]),
    [updateAnns],
  );

  const patchAnnotation = (id: string, patch: Partial<PdfAnnotation>) =>
    updateAnns((annsRef.current ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const deleteAnnotation = (id: string) =>
    updateAnns((annsRef.current ?? []).filter((a) => a.id !== id));

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
        <button onClick={() => setListOpen(true)}
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
        onScroll={() => setPop(null)}>
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
                  activeColor={color}
                  onCreate={(a) => { createAnnotation(a); setPop(null); }}
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
            onChange={(e) => patchAnnotation(pop.ann.id, { note: e.target.value })}
            placeholder={t.docDrawer.pdfNotePlaceholder}
            className="w-full h-16 text-xs p-1.5 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 resize-none outline-none focus:border-blue-500"
          />
        </div>
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
