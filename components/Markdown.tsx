"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkCallouts } from "@/lib/markdown/callouts";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-tutor">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkCallouts]}>{children}</ReactMarkdown>
    </div>
  );
}
