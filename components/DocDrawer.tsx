"use client";

import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { DocPane } from "@/components/doc/DocPane";

const DRAWER_WIDTH_KEY = "doc-drawer-width";

/**
 * 固定侧边抽屉形态的文档查看器（学习页/面试页使用）。
 * 文档面板主体在 components/doc/DocPane.tsx；笔记库页面用的是分栏形态，不经过本组件。
 */
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
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const w = Number(localStorage.getItem(DRAWER_WIDTH_KEY));
    if (Number.isFinite(w) && w >= 420) setWidth(w);
  }, []);

  if (!docPath) return null;

  return (
    <aside
      className="fixed top-0 right-0 h-full w-full sm:w-[560px] lg:w-[680px] bg-white dark:bg-zinc-950 z-50 shadow-2xl flex flex-col border-l border-zinc-200 dark:border-zinc-800 max-sm:w-full!"
      style={width ? { width } : undefined}
    >
      {/* 左缘拉宽手柄 */}
      <div
        onPointerDown={startWidthResize}
        className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize hover:bg-blue-500/30 z-20"
        title="拖动调整宽度"
      />
      <DocPane docPath={docPath} onClose={onClose} onSaved={onSaved} splitVar />
    </aside>
  );

  // ---------- 拉宽抽屉（左缘拖动） ----------
  function startWidthResize(e: ReactPointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const fallback =
      typeof window === "undefined"
        ? 680
        : window.innerWidth < 640
          ? window.innerWidth
          : window.innerWidth < 1024
            ? 560
            : 680;
    const startW = width ?? fallback;
    function onMove(ev: globalThis.PointerEvent) {
      const w = Math.min(
        window.innerWidth - 24,
        Math.max(420, startW + (startX - ev.clientX)),
      );
      setWidth(w);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setWidth((w) => {
        if (w) localStorage.setItem(DRAWER_WIDTH_KEY, String(w));
        return w;
      });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
}
