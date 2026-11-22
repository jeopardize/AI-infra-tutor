"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Pin, PinOff, X, Check } from "lucide-react";
import { useT } from "@/lib/i18n/context";

/**
 * 图片 lightbox（反馈：图片可点开预览、可调显示大小、可固定在桌面上并拖动位置）。
 * - 遮罩模式：全屏查看，滚轮/滑块缩放，ESC/点击遮罩关闭
 * - 固定模式（Pin）：变成悬浮窗钉在页面上，可拖动、可拉伸调宽，边看文档边参考图片
 * - ESC 两种模式都可退出（防图片被调得过大/过小无法恢复）；拖拽进行中按 ESC 先还原本次拖拽
 * - onApplyWidth：把当前宽度以 `![alt](src "W")` 语法写回 markdown（DocPane 提供）
 */
export interface ImageLightboxState {
  /** 已改写过的资源 URL（可直接显示） */
  src: string;
  /** markdown 源文里的原始路径（回写宽度用；外部图片为 null） */
  originalSrc: string | null;
  alt?: string;
}

const MIN_W = 180;
const MAX_W = 1600;

export function ImageLightbox({
  state,
  canApply,
  onClose,
  onApplyWidth,
}: {
  state: ImageLightboxState | null;
  /** 当前激活标签处于编辑模式（回写只对 draft 有意义） */
  canApply: boolean;
  onClose: () => void;
  onApplyWidth?: (width: number) => void;
}) {
  const t = useT();
  const [pinned, setPinned] = useState(false);
  const [width, setWidth] = useState(720);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    kind: "move" | "resize";
    startX: number;
    startY: number;
    startPos: { x: number; y: number };
    startW: number;
  } | null>(null);
  // 拖拽增量经 rAF 合帧后再提交（每帧最多一次重排），避免 pointermove 高频 setState 造成闪烁
  const rafRef = useRef(0);
  const pendingRef = useRef<{ dx: number; dy: number } | null>(null);

  // 打开/关闭时复位
  useEffect(() => {
    if (state) {
      setPinned(false);
      setPos(null);
      setWidth((w) => Math.min(Math.max(w, MIN_W), Math.min(window.innerWidth - 48, MAX_W)));
    }
  }, [state?.src]);

  // ESC：遮罩/固定两种模式都可退出；拖拽进行中按 ESC 先还原到拖拽前（再按一次才关闭）
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const d = dragRef.current;
      if (d) {
        dragRef.current = null;
        pendingRef.current = null;
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
        setPos(d.startPos);
        setWidth(d.startW);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, onClose]);

  if (!state) return null;

  function onPointerDown(e: ReactPointerEvent, kind: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      startPos: pos ?? {
        x: Math.max(16, (window.innerWidth - width) / 2),
        y: Math.max(16, window.innerHeight * 0.12),
      },
      startW: width,
    };
    if (!pos) setPos(dragRef.current.startPos);
  }
  /** 拖拽增量 → 尺寸/位置；固定模式调宽时左缘固定（pos 已在固定时确定），且不超出视口右缘 */
  function applyDrag(dx: number, dy: number) {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === "move") {
      const nx = Math.min(Math.max(d.startPos.x + dx, -width + 120), window.innerWidth - 120);
      const ny = Math.min(Math.max(d.startPos.y + dy, 0), window.innerHeight - 60);
      setPos({ x: nx, y: ny });
    } else {
      const maxW = Math.min(MAX_W, window.innerWidth - (pos?.x ?? 16) - 24);
      setWidth(Math.min(maxW, Math.max(MIN_W, d.startW + dx)));
    }
  }
  function onPointerMove(e: ReactPointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    pendingRef.current = { dx: e.clientX - d.startX, dy: e.clientY - d.startY };
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const p = pendingRef.current;
      pendingRef.current = null;
      if (p) applyDrag(p.dx, p.dy);
    });
  }
  function onPointerUp() {
    // 补上合帧期间最后一次增量，避免丢尾；然后清空拖拽状态
    const p = pendingRef.current;
    pendingRef.current = null;
    if (p) applyDrag(p.dx, p.dy);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    dragRef.current = null;
  }

  const applyBtn = canApply && onApplyWidth && state.originalSrc ? (
    <button
      onClick={() => {
        onApplyWidth(width);
        onClose();
      }}
      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-500 text-xs shrink-0"
    >
      <Check className="w-3.5 h-3.5" />
      {t.docDrawer.imgApplyWidth}
    </button>
  ) : null;

  /* ---------- 固定模式：悬浮窗 ---------- */
  if (pinned) {
    const p = pos ?? { x: Math.max(16, (window.innerWidth - width) / 2), y: Math.max(16, window.innerHeight * 0.12) };
    return (
      <div
        className="fixed z-[70] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl overflow-visible"
        style={{ left: p.x, top: p.y, width }}
      >
        {/* 标题栏：拖动移动（按钮/滑块等交互元素不触发拖动） */}
        <div
          className="flex items-center gap-1 px-2 py-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-t-lg border-b border-zinc-200 dark:border-zinc-700 cursor-move select-none"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("button,input")) return;
            onPointerDown(e, "move");
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <Pin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="text-xs text-zinc-500 truncate flex-1 min-w-0">{state.alt || t.docDrawer.imgPreview}</span>
          <input
            type="range"
            min={MIN_W}
            max={Math.min(MAX_W, 1400)}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-24 shrink-0 accent-blue-600"
            title={t.docDrawer.imgSize}
          />
          <button
            onClick={() => setPinned(false)}
            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 shrink-0"
            title={t.docDrawer.imgUnpin}
          >
            <PinOff className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 shrink-0"
            title={t.common.close}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.src}
            alt={state.alt ?? ""}
            className="rounded max-w-none"
            style={{ width: "100%", height: "auto" }}
            draggable={false}
          />
        </div>
        {/* 右下角拉伸把手：调宽度（高按比例） */}
        <div
          className="absolute -right-1.5 -bottom-1.5 w-4 h-4 cursor-nwse-resize touch-none"
          onPointerDown={(e) => onPointerDown(e, "resize")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="absolute inset-0 rounded-full bg-zinc-400/40 hover:bg-blue-500/60" />
        </div>
      </div>
    );
  }

  /* ---------- 遮罩模式 ---------- */
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/80 flex flex-col items-center justify-center"
      onClick={onClose}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5 mb-2 rounded-full bg-zinc-900/90 dark:bg-zinc-800 text-white shadow-xl text-xs max-w-[92vw]">
        <input
          type="range"
          min={MIN_W}
          max={Math.min(MAX_W, 1400)}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          onClick={(e) => e.stopPropagation()}
          className="w-40 shrink-0 accent-blue-500"
          title={t.docDrawer.imgSize}
        />
        <span className="w-12 text-center tabular-nums shrink-0">{width}px</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            // 固定时立即确定位置：之后调宽左缘不动（否则每帧按 width 重新居中，拖宽时左右缘同时移动导致画面晃动/闪烁）
            setPos({ x: Math.max(16, (window.innerWidth - width) / 2), y: Math.max(16, window.innerHeight * 0.12) });
            setPinned(true);
          }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full hover:bg-zinc-700 shrink-0"
          title={t.docDrawer.imgPin}
        >
          <Pin className="w-3.5 h-3.5" />
          {t.docDrawer.imgPin}
        </button>
        {applyBtn}
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-zinc-700 shrink-0"
          title={t.common.close}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={state.src}
        alt={state.alt ?? ""}
        className="rounded shadow-2xl max-w-none"
        style={{ width, height: "auto" }}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
      />
      <div className="mt-2 text-[11px] text-zinc-400">{t.docDrawer.imgEscHint}</div>
    </div>
  );
}
