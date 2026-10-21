import type { Root, Node, PhrasingContent, Text } from "mdast";

/**
 * remark 插件：支持 ==text== 高亮语法（GFM 不含此扩展）。
 * - ==text== → <mark>text</mark>
 * - 支持组合标记：==加粗强调==、==斜体强调==、==行内代码==（当两侧标记已被上游解析时，
 *   跨兄弟节点配对 ==；纯文本内则先内部解析一层行内标记）
 * - 跳过代码块/行内代码内的 ==，避免误伤
 *
 * 实现：遍历 mdast，产出 type:"strong" 且 data.hName="mark" 的节点
 * （mdast-util-to-hast 会用 data.hName 覆盖渲染标签为 <mark>）。
 */

const MARK_RE = /==((?:[^=]|=(?!=))+?)==/g;

export function remarkHighlight() {
  return (tree: Root) => {
    walk(tree);
  };
}

function walk(node: Node): void {
  const parent = node as { children?: Node[] };
  if (!parent.children) return;
  const kids = parent.children;

  // 先递归子节点（但不进入 code/inlineCode）
  for (const child of kids) {
    if (child.type === "code" || child.type === "inlineCode") continue;
    walk(child);
  }

  // 第一遍：单个文本节点内配对 ==...==
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    if (child.type === "text" && (child as Text).value.includes("==")) {
      const segs = splitMarkText((child as Text).value);
      const changed =
        segs.length > 1 || (segs.length === 1 && segs[0].type !== "text");
      if (changed) {
        kids.splice(i, 1, ...segs);
        i += segs.length - 1;
      }
    }
  }

  // 第二遍：跨兄弟节点配对（==**粗体**== 这类组合，== 被上游解析拆开的情况）
  for (let i = 0; i < kids.length; i++) {
    const opener = kids[i];
    if (!isTextWith(opener, "==")) continue;
    const openIdx = (opener as Text).value.indexOf("==");
    for (let j = i + 1; j < kids.length; j++) {
      const closer = kids[j];
      if (closer.type !== "text") continue; // 中间的行内节点原样保留
      const v = (closer as Text).value;
      const closeIdx = v.indexOf("==");
      if (closeIdx === -1) continue;
      // 组装 mark 节点：开标记之后的内容 + 中间节点 + 闭标记之前的内容
      const children: PhrasingContent[] = [];
      const openRemainder = (opener as Text).value.slice(openIdx + 2);
      if (openRemainder) children.push(...parseInlineMarks(openRemainder));
      for (const mid of kids.slice(i + 1, j)) children.push(mid as PhrasingContent);
      const closeRemainder = v.slice(0, closeIdx);
      if (closeRemainder) children.push(...parseInlineMarks(closeRemainder));
      const markNode: PhrasingContent = {
        type: "strong",
        data: { hName: "mark" },
        children,
      };
      const replacement: PhrasingContent[] = [];
      const before = (opener as Text).value.slice(0, openIdx);
      if (before) replacement.push({ type: "text", value: before });
      replacement.push(markNode);
      const after = v.slice(closeIdx + 2);
      if (after) replacement.push({ type: "text", value: after });
      kids.splice(i, j - i + 1, ...replacement);
      i += replacement.length - 1;
      break;
    }
    // 无闭合 ==：保持原样（渲染字面量）
  }
}

function isTextWith(node: Node, needle: string): boolean {
  return (
    node.type === "text" &&
    typeof (node as Text).value === "string" &&
    (node as Text).value.includes(needle)
  );
}

/** 把含 ==...== 的文本切成 text / mark 节点序列 */
function splitMarkText(value: string): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  let last = 0;
  MARK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARK_RE.exec(value)) !== null) {
    if (m.index > last) out.push({ type: "text", value: value.slice(last, m.index) });
    out.push({
      type: "strong",
      data: { hName: "mark" },
      children: parseInlineMarks(m[1]),
    });
    last = m.index + m[0].length;
  }
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

/** 高亮内部再解析一层行内标记：**粗体**、*斜体*、`代码`（支持组合如 ==**x**==） */
function parseInlineMarks(text: string): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    if (m[2] !== undefined) {
      out.push({ type: "strong", children: [{ type: "text", value: m[2] }] });
    } else if (m[3] !== undefined) {
      out.push({ type: "emphasis", children: [{ type: "text", value: m[3] }] });
    } else if (m[4] !== undefined) {
      out.push({ type: "inlineCode", value: m[4] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}
