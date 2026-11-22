"use client";

import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Components } from "react-markdown";
import { ChevronDown, ChevronRight } from "lucide-react";
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

// ---------------- 代码块外壳：语言标签 + 可折叠 ----------------

/** 收起状态外露的行数 */
const COLLAPSED_LINES = 5;

/** 从 hljs 的 className 提取语言名（language-cpp → cpp） */
function extractLang(className?: string | null): string | null {
  const m = /(?:^|\s)language-([\w+#.-]+)/.exec(className ?? "");
  return m && m[1] !== "undefined" ? m[1] : null;
}

/** 统计渲染子树总行数（数 "\n" 文本；hljs 的换行以文本节点存在） */
function countTotalLines(node: ReactNode): number {
  let stop = false;
  let total = 1;
  const walk = (n: ReactNode) => {
    if (stop) return;
    if (Array.isArray(n)) {
      n.forEach(walk);
    } else if (typeof n === "string") {
      for (const ch of n) {
        if (ch === "\n") {
          total += 1;
          if (total > 100_000) {
            // 极端内容保护：截断统计
            stop = true;
            break;
          }
        }
      }
    } else if (React.isValidElement(n)) {
      walk((n.props as { children?: ReactNode }).children);
    }
  };
  if (node) walk(node);
  return total;
}

/** 把渲染子树裁剪到前 maxLines 行；跨越元素边界时逐层收敛，
 *  返回 node=null 表示该子树整体在裁剪线之后 */
function cutToFirstLines(root: ReactNode, maxLines: number): { node: ReactNode; cut: boolean } {
  // 已输出的换行数（前 maxLines-1 个换行允许输出）
  let newlines = 0;
  let cut = false;
  const walk = (n: ReactNode): ReactNode => {
    if (cut) return null;
    if (Array.isArray(n)) {
      const out: ReactNode[] = [];
      for (const item of n) {
        const done = out.length > 0 || (out.length === 0 && false);
        void done;
        const sub = walk(item);
        // 子项把内容裁掉（返回 null/空串）就不需要再继续渲染后续项
        if (sub === null || sub === undefined) {
          cut = true;
          break;
        }
        out.push(sub);
      }
      return out.length === 1 ? out[0] : out;
    }
    if (typeof n === "string") {
      if (!n.includes("\n")) return n;
      const out: ReactNode[] = [];
      for (const part of n.split("\n")) {
        if (out.length > 0) {
          // 本段之前要跨一个换行
          if (newlines >= maxLines - 1) {
            cut = true;
            break;
          }
          newlines += 1;
          out.push("\n");
        }
        if (part) out.push(part);
      }
      return out;
    }
    if (React.isValidElement(n)) {
      const el = n as React.ReactElement<{ children?: ReactNode }>;
      const inner = walk(el.props?.children);
      if (cut && (inner === null || inner === undefined)) return null;
      return React.cloneElement(el, { children: inner });
    }
    if (n === null || n === undefined || typeof n === "boolean") return null;
    return n;
  };
  return { node: walk(root), cut };
}

/** 代码块外壳：头部语言标签 + 折叠按钮；折叠时保留前 5 行 + 底部提示。
 *  内层保持 <pre> 原元素，prose-tutor 的 pre 样式照常生效 */
function CodeShell({
  lang,
  preProps,
  children,
}: {
  lang: string | null;
  preProps: Record<string, unknown>;
  children: ReactNode;
}) {
  const totalLines = useMemo(() => countTotalLines(children), [children]);
  const truncatable = totalLines > COLLAPSED_LINES;
  const [collapsed, setCollapsed] = useState(false);
  const t = useT().docDrawer;

  let body = children;
  if (collapsed && truncatable) {
    body = cutToFirstLines(children, COLLAPSED_LINES).node;
  }

  return (
    <div className="code-shell my-4 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1 bg-zinc-100/80 dark:bg-zinc-800/60 text-[10px] font-mono text-zinc-500 dark:text-zinc-400 select-none shrink-0">
        <span className="uppercase tracking-wider">{lang ?? "text"}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="hidden sm:inline text-zinc-400">{totalLines} 行</span>
          {truncatable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCollapsed((v) => !v);
              }}
              title={collapsed ? t.codeExpand : t.codeCollapse}
              className="flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-blue-600"
            >
              {collapsed ? (
                <ChevronRight className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
              {collapsed ? t.codeExpandShort(totalLines) : t.codeCollapseShort}
            </button>
          )}
        </span>
      </div>
      <div className="code-shell-body relative">
        <pre style={{ margin: 0, borderRadius: 0 }} {...preProps}>
          {body}
        </pre>
      </div>
      {collapsed && truncatable && (
        <div className="px-3 py-1 text-[10px] text-zinc-400 bg-zinc-100/80 dark:bg-zinc-800/60 border-t border-zinc-200 dark:border-zinc-700">
          {t.codeCollapsedMore(totalLines - COLLAPSED_LINES)}
        </div>
      )}
    </div>
  );
}

// ---------------- react-markdown 组件 ----------------

interface HastPosition {
  position?: { start?: { line?: number } };
}

/**
 * react-markdown 的 code/pre 渲染：
 * - mermaid 代码块画图
 * - 其余代码块：语言标签头 + 可折叠外壳；onJump 时点击整块跳到编辑器对应行
 */
function buildCodeComponents(
  onJump?: (line: number) => void,
): Pick<Components, "pre" | "code"> {
  return {
    // pre 的 props 里 node 携带源码位置（start.line = 围栏打开行）
    pre(props) {
      const { node, children, ...preRest } = props as {
        children?: ReactNode;
        node?: HastPosition;
        [k: string]: unknown;
      };
      const child = (Array.isArray(children) ? children[0] : children) as
        | React.ReactElement<{ className?: string }>
        | undefined;
      if (child?.props?.className?.includes("language-mermaid")) {
        return <>{children}</>;
      }
      const lang = extractLang(child?.props?.className);
      const line = node?.position?.start?.line ?? null;
      const jump = onJump && line != null ? () => onJump(line) : undefined;
      return (
        <div
          onClick={jump}
          data-src-line={line ?? undefined}
          style={jump ? { cursor: "pointer" } : undefined}
        >
          <CodeShell lang={lang} preProps={preRest}>
            {children}
          </CodeShell>
        </div>
      );
    },
    code({ className, children, node: _node, ...codeRest }) {
      if (/language-mermaid\b/.test(className ?? "")) {
        return <MermaidDiagram code={String(children).replace(/\n$/, "")} />;
      }
      if (className?.includes("language-")) {
        return (
          <code className={className} {...codeRest} data-lang={extractLang(className) ?? undefined}>
            {children}
          </code>
        );
      }
      return (
        <code className={className} {...codeRest}>
          {children}
        </code>
      );
    },
  };
}

/** 无跳转版本（纯预览） */
export const markdownCodeComponents: Pick<Components, "pre" | "code"> =
  buildCodeComponents();

/** 带跳转版本：点击代码块 → 编辑器对应行（实时预览用） */
export function codeComponentsWithJump(
  onJump: (line: number) => void,
): Pick<Components, "pre" | "code"> {
  return buildCodeComponents(onJump);
}
