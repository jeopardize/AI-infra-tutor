"use client";

import { useEffect, useState } from "react";
import type { Components } from "react-markdown";
import { useT } from "@/lib/i18n/context";

let seq = 0;

/** mermaid 代码块 → SVG 图（客户端按需加载 mermaid，随主题切换 light/dark） */
export function MermaidDiagram({ code }: { code: string }) {
  const t = useT().docDrawer;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = `mmd-${++seq}-${Date.now().toString(36)}`;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: document.documentElement.classList.contains("dark")
            ? "dark"
            : "default",
        });
        const { svg } = await mermaid.render(id, code);
        if (!cancelled) setSvg(svg);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (failed) {
    return (
      <div className="my-4">
        <div className="text-rose-600 text-xs mb-1">{t.mermaidFailed}</div>
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    );
  }
  if (!svg) {
    return (
      <pre>
        <code>{code}</code>
      </pre>
    );
  }
  return (
    <div
      className="mermaid-wrap overflow-x-auto my-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** react-markdown 的 code/pre 渲染：mermaid 代码块画图，其余语言交给 rehype-highlight */
export const markdownCodeComponents: Pick<Components, "pre" | "code"> = {
  pre({ children, ...rest }) {
    const child = (Array.isArray(children) ? children[0] : children) as
      | { props?: { className?: string } }
      | undefined;
    if (child?.props?.className?.includes("language-mermaid")) {
      return <>{children}</>;
    }
    const { node: _node, ...preRest } = rest;
    return <pre {...preRest}>{children}</pre>;
  },
  code({ className, children, ...rest }) {
    const { node: _node, ...codeRest } = rest;
    if (/language-mermaid\b/.test(className ?? "")) {
      return <MermaidDiagram code={String(children).replace(/\n$/, "")} />;
    }
    return (
      <code className={className} {...codeRest}>
        {children}
      </code>
    );
  },
};
