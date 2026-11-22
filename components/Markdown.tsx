"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import { remarkCallouts } from "@/lib/markdown/callouts";
import { remarkHighlight } from "@/lib/markdown/highlight";
import { remarkPens } from "@/lib/markdown/pens";
import { preprocessNote } from "@/lib/markdown/normalize";
import { rehypeFigDefs } from "@/lib/markdown/figdefs";
import { markdownCodeComponents } from "@/components/markdown/CodeRenderer";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-tutor">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks, remarkHighlight, remarkPens, remarkCallouts]}
        rehypePlugins={[rehypeHighlight, rehypeKatex, rehypeFigDefs]}
        components={markdownCodeComponents}
      >
        {preprocessNote(children)}
      </ReactMarkdown>
    </div>
  );
}
