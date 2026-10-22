"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import { remarkCallouts } from "@/lib/markdown/callouts";
import { remarkHighlight } from "@/lib/markdown/highlight";
import { markdownCodeComponents } from "@/components/markdown/CodeRenderer";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-tutor">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkHighlight, remarkCallouts]}
        rehypePlugins={[rehypeHighlight]}
        components={markdownCodeComponents}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
