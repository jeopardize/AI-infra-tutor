"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { remarkCallouts } from "@/lib/markdown/callouts";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-tutor">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, remarkCallouts]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
