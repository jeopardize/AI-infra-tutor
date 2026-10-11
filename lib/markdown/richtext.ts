/**
 * 答题富文本批注工具（反馈：作答后可换文字颜色/高亮做自我批注，
 * 保存为标准答案时保留格式）。
 *
 * 存储格式：内联 HTML 片段（只含 span/mark/b/strong/i/em/u/s/br/p/div/ul/ol/li/code），
 * span 的 style 只允许 color / background-color。纯文本作答不受影响，
 * 渲染时用 isRichText() 区分走 Markdown 还是富文本管线。
 */

/** 允许保留的内联标签 */
const ALLOWED_TAGS = new Set([
  "span",
  "mark",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "strike",
  "br",
  "p",
  "div",
  "ul",
  "ol",
  "li",
  "code",
  "font",
]);

/** 判断文本是否带批注富文本标记 */
export function isRichText(text: string): boolean {
  return /<(?:span|mark|b|strong|i|em|u|s|strike|font)\b[^>]*style=/i.test(text);
}

/** 去掉富文本标记，还原为带换行的纯文本（服务端可用，无 DOM 依赖） */
export function stripRichText(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * 清洗富文本 HTML（浏览器端用 DOMParser）：
 * 只保留白名单标签与安全的行内样式，其余标签剥壳留文本、属性全部剔除。
 */
export function sanitizeRichText(html: string): string {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    // 非浏览器环境兜底：剥掉全部标签
    return stripRichText(html).replace(/\n/g, "<br>");
  }
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const out = sanitizeNode(doc.body) as Element;
  return out.innerHTML;
}

function sanitizeNode(node: Node): Node {
  if (node.nodeType === Node.TEXT_NODE) return node.cloneNode(true);
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return document.createTextNode("");
  }
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) {
    // 剥壳：保留子节点
    const frag = document.createDocumentFragment();
    for (const child of Array.from(el.childNodes)) {
      frag.appendChild(sanitizeNode(child));
    }
    return frag;
  }
  const clean = document.createElement(tag === "font" ? "span" : tag);
  // 只允许 span/mark/font 携带受限 style
  if (tag === "span" || tag === "mark" || tag === "font") {
    const style = (el.getAttribute("style") ?? "").toLowerCase();
    const parts: string[] = [];
    const color = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/);
    if (color) parts.push(`color:${color[1].trim()}`);
    const bg = style.match(/background-color\s*:\s*([^;]+)/);
    if (bg) parts.push(`background-color:${bg[1].trim()}`);
    if (parts.length) clean.setAttribute("style", parts.join(";"));
  }
  for (const child of Array.from(el.childNodes)) {
    clean.appendChild(sanitizeNode(child));
  }
  return clean;
}

/** 富文本可用的文字颜色 / 高亮色板（与工具栏按钮一致） */
export const TEXT_COLORS = [
  { label: "红", value: "#dc2626" },
  { label: "橙", value: "#ea580c" },
  { label: "绿", value: "#16a34a" },
  { label: "蓝", value: "#2563eb" },
] as const;

export const HIGHLIGHT_COLORS = [
  { label: "黄", value: "#fde047" },
  { label: "绿", value: "#86efac" },
  { label: "红", value: "#fca5a5" },
  { label: "蓝", value: "#93c5fd" },
] as const;
