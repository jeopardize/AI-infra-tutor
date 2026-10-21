"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { remarkCallouts } from "@/lib/markdown/callouts";
import { remarkHighlight } from "@/lib/markdown/highlight";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-tutor">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkHighlight, remarkCallouts]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
