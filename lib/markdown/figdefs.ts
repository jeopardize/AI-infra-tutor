/**
 * 表格/公式交叉引用（{#tbl:id}/{#eq:id} 定义 + [@tbl:id]/[@eq:id] 引用）rehype 预处理。
 *
 * 用法示例：
 *   结果见[@tbl:perf]与[@eq:loss]。
 *
 *   | 方案 | 时延 |
 *   |---|---|
 *   | A | 1ms |
 *   : 性能对比 {#tbl:perf}
 *
 *   $$
 *   L = \\sum_i l_i
 *   $$
 *   : 损失函数 {#eq:loss}
 *
 * 输出：表格/公式（katex-display）被包裹为 <figure id="figdef-...">，
 * 题注 <figcaption> 带编号（表 1 / 式 (1)）；引用被替换为可点击跳转的编号链接。
 * 必须挂在 rehypeKatex 之后（需识别 katex-display 元素）。
 * 图片交叉引用（{#fig:id}）由 lib/markdown/figrefs.ts 字符串层处理，互不干扰。
 */

import type { Root, RootContent, Element, ElementContent } from "hast";

const CAPTION_RE = /^[:：]?\s*(.*?)[ \t]*\{#(tbl|eq):([\w-]+)\}\s*$/;
/** 引用同时接受 [@tbl:id] 与 {@tbl:id}（图片 [@fig:id] 由 figrefs.ts 字符串层处理） */
const REF_RE = /(?:\[@|\{@)(tbl|eq):([\w-]+)(?:\]|\})/g;

const KIND_LABEL: Record<string, string> = { tbl: "表", eq: "式" };

interface Def {
  kind: string;
  id: string;
  no: number;
  caption: string;
}

function isKatexDisplay(el: Element): boolean {
  const cls = el.properties?.className;
  return Array.isArray(cls) && cls.includes("katex-display");
}

function captionOf(el: RootContent | undefined): { kind: string; id: string; caption: string } | null {
  if (
    el &&
    el.type === "element" &&
    (el as Element).tagName === "p" &&
    (el as Element).children.length === 1 &&
    (el as Element).children[0].type === "text"
  ) {
    const m = CAPTION_RE.exec(((el as Element).children[0] as { value: string }).value);
    if (m) return { kind: m[2], id: m[3], caption: m[1] };
  }
  return null;
}

/** 块级元素间的换行 text 节点要跳过：找 kids[i] 之后第一个非空白兄弟 */
function nextBlock(kids: RootContent[], i: number): number {
  let j = i + 1;
  while (j < kids.length && kids[j].type === "text" && (kids[j] as { value: string }).value.trim() === "") j++;
  return j;
}

export function rehypeFigDefs() {
  return (tree: Root) => {
    const kids = tree.children;
    const num = new Map<string, Def>();
    const counters: Record<string, number> = { tbl: 0, eq: 0 };

    // 1) 编号与题注提取：table / katex-display 的下一个非空白兄弟 <p> 为题注
    for (let i = 0; i < kids.length; i++) {
      const el = kids[i];
      if (el?.type !== "element") continue;
      let kind: string | null = null;
      if (el.tagName === "table") kind = "tbl";
      else if (isKatexDisplay(el)) kind = "eq";
      if (!kind) continue;
      const cap = captionOf(kids[nextBlock(kids, i)]);
      if (!cap || cap.kind !== kind) continue;
      if (!num.has(cap.id)) {
        counters[kind]++;
        num.set(cap.id, { kind, id: cap.id, no: counters[kind], caption: cap.caption });
      }
    }

    // 2) 引用替换（所有文本节点，含段落/列表/表格单元格内）
    //    替换产生的片段用 i 跳过，不再重扫（未知引用的 ⚠️ 文本仍含 ref 模式，重扫会无限循环）
    const walkAll = (nodes: RootContent[]) => {
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.type === "text" && /[@](tbl|eq):/.test(n.value)) {
          const parts: ElementContent[] = [];
          let last = 0;
          for (const m of n.value.matchAll(REF_RE)) {
            const idx = m.index ?? 0;
            if (idx > last) parts.push({ type: "text", value: n.value.slice(last, idx) });
            const def = num.get(m[2]);
            if (def) {
              const label = def.kind === "eq" ? `式 (${def.no})` : `${KIND_LABEL[def.kind]} ${def.no}`;
              parts.push({
                type: "element",
                tagName: "a",
                properties: { href: `#figdef-${def.id}` },
                children: [{ type: "text", value: label }],
              });
            } else {
              parts.push({ type: "text", value: `⚠️${m[0]}` });
            }
            last = idx + m[0].length;
          }
          if (last < n.value.length) parts.push({ type: "text", value: n.value.slice(last) });
          if (parts.length) {
            nodes.splice(i, 1, ...parts);
            i += parts.length - 1;
          }
        } else if (n.type === "element") {
          walkAll(n.children);
        }
      }
    };
    walkAll(kids);

    // 3) 定义改写：包裹 figure + figcaption；删除题注段落（含中间的空白 text 节点）
    for (let i = 0; i < kids.length; i++) {
      const el = kids[i];
      if (el?.type !== "element") continue;
      let kind: string | null = null;
      if (el.tagName === "table") kind = "tbl";
      else if (isKatexDisplay(el)) kind = "eq";
      if (!kind) continue;
      const j = nextBlock(kids, i);
      const cap = captionOf(kids[j]);
      if (!cap || cap.kind !== kind || !num.has(cap.id)) continue;
      const def = num.get(cap.id)!;
      kids.splice(i + 1, j - i); // 删除题注段落及中间空白节点
      const label = def.kind === "eq" ? `式 (${def.no})` : `${KIND_LABEL[def.kind]} ${def.no}`;
      const figcaption: Element = {
        type: "element",
        tagName: "figcaption",
        properties: { className: ["text-xs", "text-zinc-500", "dark:text-zinc-400", "mt-1"] },
        children: [{ type: "text", value: `${label}${def.caption ? `　${def.caption}` : ""}` }],
      };
      const figure: Element = {
        type: "element",
        tagName: "figure",
        properties: {
          id: `figdef-${def.id}`,
          className: ["my-4", "scroll-mt-16", "mx-auto", "w-fit", "max-w-full"],
        },
        children: [el, figcaption],
      };
      kids[i] = figure;
    }
  };
}
