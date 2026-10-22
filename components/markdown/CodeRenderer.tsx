"use client";

import { useEffect, useState } from "react";
import type { Components } from "react-markdown";
import { useT } from "@/lib/i18n/context";

let seq = 0;
let loading: Promise<MermaidAPI> | null = null;

/** mermaid 从 CDN 运行时加载：不进构建产物，避免小内存服务器构建 OOM */
interface MermaidAPI {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, code: string) => Promise<{ svg: string }>;
}

function loadMermaid(): Promise<MermaidAPI> {
  const w = window as unknown as {
    mermaid?: MermaidAPI;
    __mermaidLoading?: Promise<MermaidAPI>;
  };
  if (w.mermaid) return Promise.resolve(w.mermaid);
  if (w.__mermaidLoading) return w.__mermaidLoading;
  loading = new Promise<MermaidAPI>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
    s.async = true;
    s.onload = () => {
      if (w.mermaid) resolve(w.mermaid);
      else reject(new Error("mermaid loaded but missing global"));
    };
    s.onerror = () => {
      w.__mermaidLoading = undefined;
      reject(new Error("mermaid CDN load failed"));
    };
    document.head.appendChild(s);
  });
  w.__mermaidLoading = loading;
  return loading;
}

/** mermaid 代码块 → SVG 图（运行时从 CDN 按需加载，随主题切换 light/dark） */
export function MermaidDiagram({ code }: { code: string }) {
  const t = useT().docDrawer;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = `mmd-${++seq}-${Date.now().toString(36)}`;
    (async () => {
      try {
        const mermaid = await loadMermaid();
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
