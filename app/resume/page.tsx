"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/context";
import type { ResumeData } from "@/lib/resume";
import { createDefaultResumeData, serverLoadResumeData, serverSaveResumeData } from "@/lib/resume";
import { ResumeEditor } from "@/components/resume/ResumeEditor";
import { ResumePreview } from "@/components/resume/ResumePreview";

export default function ResumePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <ResumeShell />
    </div>
  );
}

function ResumeShell() {
  const t = useT();
  const [data, setData] = useState<ResumeData>(createDefaultResumeData);
  const [isPrinting, setIsPrinting] = useState(false);
  const [autoFitStatus, setAutoFitStatus] = useState<"idle" | "fitting">("idle");
  const previewRef = useRef<HTMLDivElement>(null);

  // Load from server (with localStorage fallback) on mount
  useEffect(() => {
    serverLoadResumeData().then(setData);
  }, []);

  // Auto-save with 500ms debounce — saves to both localStorage and server
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dataRef = useRef(data);
  dataRef.current = data;

  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      serverSaveResumeData(dataRef.current);
    }, 500);
  }, []);

  useEffect(() => {
    if (data === createDefaultResumeData()) return; // skip initial
    debouncedSave();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Auto-fit
  function handleAutoFit() {
    const el = previewRef.current;
    if (!el) return;
    setAutoFitStatus("fitting");

    // A4 height in CSS px: 297mm * (96dpi / 25.4mm/in)
    const pageHeightPx = (297 * 96) / 25.4;
    const candidates: Array<{ marginMm: number; lineSpacing: number; scrollHeight: number }> = [];

    const margins = [25, 22, 20, 18, 16, 14, 12, 10];
    const spacings = [1.5, 1.4, 1.3, 1.2, 1.1, 1.0];

    for (const m of margins) {
      for (const s of spacings) {
        el.style.padding = `${m}mm`;
        el.style.lineHeight = String(s);
        // Force browser reflow
        void el.offsetHeight;
        const h = el.scrollHeight;
        if (h <= pageHeightPx + 5) {
          setData((prev) => ({
            ...prev,
            settings: { marginMm: m, lineSpacing: s },
          }));
          setAutoFitStatus("idle");
          return;
        }
        candidates.push({ marginMm: m, lineSpacing: s, scrollHeight: h });
      }
    }

    // Nothing fits perfectly; use tightest (last = 10mm, 1.0)
    const tightest = candidates[candidates.length - 1];
    setData((prev) => ({
      ...prev,
      settings: {
        marginMm: tightest.marginMm,
        lineSpacing: tightest.lineSpacing,
      },
    }));
    setAutoFitStatus("idle");
  }

  // PDF export
  function handleExportPdf() {
    setIsPrinting(true);
    // Wait one frame for React to render print-only layout
    requestAnimationFrame(() => {
      window.print();
    });
  }

  useEffect(() => {
    if (!isPrinting) return;
    function onPrintEnd() {
      setIsPrinting(false);
    }
    window.addEventListener("afterprint", onPrintEnd);
    return () => window.removeEventListener("afterprint", onPrintEnd);
  }, [isPrinting]);

  return (
    <div className={`flex flex-col md:flex-row gap-6 ${isPrinting ? "print-mode" : ""}`}>
      {/* Left: Editor */}
      {!isPrinting && (
        <div className="w-full md:w-[420px] shrink-0 space-y-4">
          <div>
            <h1 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
              {t.resume.title}
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">{t.resume.subtitle}</p>
          </div>

          <ResumeEditor
            data={data}
            onChange={setData}
            onAutoFit={handleAutoFit}
            autoFitStatus={autoFitStatus}
          />

          {!isPrinting && (
            <button
              onClick={handleExportPdf}
              className="w-full px-4 py-2.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium"
            >
              {t.resume.exportPdf}
            </button>
          )}
        </div>
      )}

      {/* Right: Preview */}
      <div className={`flex-1 min-w-0 ${isPrinting ? "w-full" : ""}`}>
        {!isPrinting && (
          <div className="mb-2 text-xs text-zinc-400">{t.resume.fillTip}</div>
        )}
        <ResumePreview data={data} isPrinting={isPrinting} previewRef={previewRef} />
      </div>
    </div>
  );
}
