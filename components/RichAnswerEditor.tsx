"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  HIGHLIGHT_COLORS,
  TEXT_COLORS,
  sanitizeRichText,
  stripRichText,
} from "@/lib/markdown/richtext";
import { Highlighter, Palette, RotateCcw } from "lucide-react";

/**
 * 答题富文本编辑器（contentEditable）：
 * - 支持换行（Enter）、加粗等基本输入
 * - 工具栏：文字颜色 / 高亮（选中文本后点击生效）——用于 AI 批改后自我批注
 * - 值为受控的 HTML 字符串（经 sanitizeRichText 清洗），纯文本场景完全兼容
 */

interface RichAnswerEditorProps {
  /** 受控 HTML 值（纯文本时也会被包装处理） */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** 只读展示（用于已提交答案的批注编辑场景） */
  editable?: boolean;
  className?: string;
}

export function RichAnswerEditor({
  value,
  onChange,
  placeholder,
  minHeight = 140,
  editable = true,
  className = "",
}: RichAnswerEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  // 避免受控更新时丢失光标：仅在外部值与当前内容不同步时重写
  const innerRef = useRef("");

  const syncFromValue = useCallback(
    (html: string) => {
      const el = ref.current;
      if (!el) return;
      const current = el.innerHTML;
      innerRef.current = html;
      // 清洗后比对，避免相同内容反复重写
      if (current !== html && sanitizeRichText(current) !== sanitizeRichText(html)) {
        el.innerHTML = html;
      }
    },
    [],
  );

  useEffect(() => {
    syncFromValue(value);
  }, [value, syncFromValue]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    const html = el.innerHTML;
    innerRef.current = html;
    onChange(sanitizeRichText(html));
  }

  function exec(cmd: string, arg: string) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    try {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand(cmd, false, arg);
    } catch {
      // 浏览器不支持时静默失败
    }
    emit();
  }

  function clearFormat() {
    const el = ref.current;
    if (!el) return;
    el.focus();
    try {
      document.execCommand("removeFormat");
      document.execCommand("hiliteColor", false, "transparent");
    } catch {}
    emit();
  }

  const plainEmpty = !stripRichText(value).trim();

  return (
    <div className={`relative ${className}`}>
      {editable && (
        <div className="flex flex-wrap items-center gap-1 mb-1.5 text-xs text-zinc-500">
          <span className="flex items-center gap-1 mr-0.5">
            <Palette className="w-3.5 h-3.5" /> 字色
          </span>
          {TEXT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                exec("foreColor", c.value);
              }}
              title={`文字颜色：${c.label}`}
              className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-700 hover:scale-110 transition-transform"
              style={{ background: c.value }}
            />
          ))}
          <span className="flex items-center gap-1 mx-1 mr-0.5">
            <Highlighter className="w-3.5 h-3.5" /> 高亮
          </span>
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                exec("hiliteColor", c.value);
              }}
              title={`高亮：${c.label}`}
              className="w-5 h-5 rounded border border-zinc-300 dark:border-zinc-700 hover:scale-110 transition-transform"
              style={{ background: c.value }}
            />
          ))}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              clearFormat();
            }}
            title="清除所选格式"
            className="ml-1 flex items-center gap-1 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <RotateCcw className="w-3 h-3" /> 清除格式
          </button>
        </div>
      )}
      <div
        ref={ref}
        contentEditable={editable}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        onInput={editable ? emit : undefined}
        onBlur={editable ? emit : undefined}
        data-placeholder={plainEmpty ? placeholder : undefined}
        className={`rich-answer w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-blue-500 overflow-y-auto whitespace-pre-wrap break-words ${
          plainEmpty ? "is-empty" : ""
        }`}
        style={{ minHeight }}
      />
    </div>
  );
}
