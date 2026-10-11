"use client";

import { Markdown } from "@/components/Markdown";
import { isRichText, sanitizeRichText } from "@/lib/markdown/richtext";

/**
 * 统一渲染"可含批注富文本"的文本：
 * 带内联 HTML 批注（字色/高亮）→ sanitized HTML + pre-wrap；
 * 纯文本/普通 markdown → Markdown 管线（remark-breaks 保换行）。
 */
export function AnswerBody({ text }: { text: string }) {
  if (isRichText(text)) {
    return (
      <div
        className="prose-tutor whitespace-pre-wrap break-words"
        dangerouslySetInnerHTML={{ __html: sanitizeRichText(text) }}
      />
    );
  }
  return <Markdown>{text}</Markdown>;
}
