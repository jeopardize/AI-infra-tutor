import type { Root, Node, PhrasingContent, Text } from "mdast";
import { parseInlineMarks } from "./highlight";

/**
 * remark 插件：红笔/蓝笔批注语法（反馈：md 笔记批注需要快速切换字色）。
 * - %%r:文字%% / %%红:文字%% → 红色文字
 * - %%b:文字%% / %%蓝:文字%% → 蓝色文字
 * - 内容再解析一层行内标记（**粗体**、*斜体*、`代码`，复用 ==高亮== 的解析）
 * - 支持跨兄弟节点配对（内容里的 ** 被上游解析拆开时仍能闭合）
 * - 跳过代码块/行内代码内的 %%，避免误伤
 *
 * 实现：遍历 mdast，产出带 data.hName="span" + 行内 style 颜色的节点
 * （mdast-util-to-hast 会按 data 覆盖渲染标签与属性）。
 */

const PEN_RE = /%%\s*([rb红蓝])\s*[:：]((?:[^%]|%(?!%))*)%%/g;
const OPENER_RE = /%%\s*([rb红蓝])\s*[:：]/;

const PEN_COLORS: Record<string, string> = {
  r: "#dc2626",
  红: "#dc2626",
  b: "#2563eb",
  蓝: "#2563eb",
};

export function remarkPens() {
  return (tree: Root) => {
    walk(tree);
  };
}

function walk(node: Node): void {
  const parent = node as { children?: Node[] };
  if (!parent.children) return;
  const kids = parent.children;

  for (const child of kids) {
    if (child.type === "code" || child.type === "inlineCode") continue;
    walk(child);
  }

  // 第一遍：单个文本节点内配对 %%c:...%%
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    if (child.type !== "text") continue;
    const value = (child as Text).value;
    if (!value.includes("%%")) continue;
    const segs = splitPenText(value);
    if (segs.length > 1 || (segs.length === 1 && segs[0].type !== "text")) {
      kids.splice(i, 1, ...segs);
      i += segs.length - 1;
    }
  }

  // 第二遍：跨兄弟节点配对（%%r:内容**粗**%% 中 ** 被上游解析拆开的情况）
  for (let i = 0; i < kids.length; i++) {
    const opener = kids[i];
    if (opener.type !== "text") continue;
    const ov = (opener as Text).value;
    const om = ov.match(OPENER_RE);
    if (!om || om.index === undefined) continue;
    for (let j = i + 1; j < kids.length; j++) {
      const closer = kids[j];
      if (closer.type !== "text") continue; // 中间的行内节点原样保留
      const v = (closer as Text).value;
      const closeIdx = v.indexOf("%%");
      if (closeIdx === -1) continue;
      const children: PhrasingContent[] = [];
      const openRest = ov.slice(om.index + om[0].length);
      if (openRest) children.push(...parseInlineMarks(openRest));
      for (const mid of kids.slice(i + 1, j)) children.push(mid as PhrasingContent);
      const closeRest = v.slice(0, closeIdx);
      if (closeRest) children.push(...parseInlineMarks(closeRest));
      const node = makePenNode(om[1], children);
      const replacement: PhrasingContent[] = [];
      const before = ov.slice(0, om.index);
      if (before) replacement.push({ type: "text", value: before });
      replacement.push(node);
      const after = v.slice(closeIdx + 2);
      if (after) replacement.push({ type: "text", value: after });
      kids.splice(i, j - i + 1, ...replacement);
      i += replacement.length - 1;
      break;
    }
    // 无闭合 %%：保持原样（渲染字面量）
  }
}

/** 把含 %%c:...%% 的文本切成 text / pen 节点序列 */
function splitPenText(value: string): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  let last = 0;
  PEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PEN_RE.exec(value)) !== null) {
    if (m.index > last) out.push({ type: "text", value: value.slice(last, m.index) });
    out.push(makePenNode(m[1], parseInlineMarks(m[2])));
    last = m.index + m[0].length;
  }
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

function makePenNode(colorKey: string, children: PhrasingContent[]): PhrasingContent {
  return {
    type: "emphasis",
    data: {
      hName: "span",
      hProperties: { style: `color:${PEN_COLORS[colorKey] ?? "#dc2626"}` },
    },
    children,
  };
}
