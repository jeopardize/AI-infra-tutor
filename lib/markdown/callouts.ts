/**
 * remark 插件：支持 Obsidian 风格提示块
 *
 *   > [!important] 内容...
 *   > [!Note] 内容...
 *
 * 渲染为带颜色徽标的 callout：important → 红色，Note → 蓝色。
 * 匹配时把 `[!type]` 标记从文本中剥掉，并在 blockquote 上挂 className，
 * 样式见 app/globals.css 的 .callout-* 规则。
 */

const CALLOUT_TYPES = new Set(["important", "note"]);

const MARKER_RE = /^\[!(\w+)\][ \t]*/i;

interface MdxNode {
  type?: string;
  value?: string;
  children?: MdxNode[];
  data?: { hProperties?: Record<string, unknown> } & Record<string, unknown>;
}

function walkNode(node: MdxNode): void {
  if (!node || typeof node !== "object") return;
  const children = node.children;
  if (Array.isArray(children)) {
    for (const child of children) walkNode(child);
  }
  if (node.type !== "blockquote") return;

  const para = children?.find((c) => c.type === "paragraph");
  if (!para?.children) return;
  const firstText = para.children.find((c) => c.type === "text");
  const raw = firstText?.value;
  if (!raw) return;
  const m = raw.match(MARKER_RE);
  if (!m) return;
  const type = m[1].toLowerCase();
  if (!CALLOUT_TYPES.has(type)) return;

  // 剥掉 [!type] 标记，保留正文（标记后无正文时直接删掉整段，避免空段落）
  const rest = raw.slice(m[0].length);
  firstText.value = rest;
  if (!rest.trim() && para.children.length === 1) {
    para.children = [];
  }

  node.data = node.data ?? {};
  node.data.hProperties = {
    ...node.data.hProperties,
    className: ["callout", `callout-${type}`],
  };
}

export function remarkCallouts() {
  return (tree: MdxNode) => {
    walkNode(tree);
  };
}
