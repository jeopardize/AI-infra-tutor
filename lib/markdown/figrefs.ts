/**
 * Pandoc 式图片交叉引用（{#fig:id} 定义 + [@fig:id] 引用）预处理。
 *
 * 输入示例：
 *   报文如[@fig:ROCEv2_write]所示
 *   ![Rocev2_write](images/Rocev2_write.png){#fig:ROCEv2_write}
 *
 * 输出：
 *   报文如[图 1](#figdef-ROCEv2_write)所示          （可点击跳转的编号链接）
 *   ![图 1：Rocev2_write](images/Rocev2_write.png "figdef:ROCEv2_write")
 *   （img 组件识别 title 标记后渲染为 <figure id="figdef-..."> 带编号题注）
 *
 * 编号按 {#fig:id} 在文档中的出现顺序；代码围栏内的内容不处理。
 */

const FENCE_RE = /```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g;
const IMG_DEF_RE = /!\[([^\]]*)\]\(([^)\s]+)\)\s*\{#fig:([\w-]+)\}/g;
/** 引用同时接受 [@fig:id] 与 {@fig:id}（反馈：用户写花括号也能识别；定义标记为 {#fig:id} 不受影响） */
const REF_RE = /(?:\[@|\{@)fig:([\w-]+)(?:\]|\})/g;
const DEF_RE = /\{#fig:([\w-]+)\}/g;

interface Segment {
  text: string;
  fenced: boolean;
}

function splitFences(md: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const m of md.matchAll(FENCE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) segments.push({ text: md.slice(last, idx), fenced: false });
    segments.push({ text: m[0], fenced: true });
    last = idx + m[0].length;
  }
  if (last < md.length) segments.push({ text: md.slice(last), fenced: false });
  return segments;
}

export function preprocessFigRefs(md: string): string {
  const segments = splitFences(md);

  // 1) 编号：{#fig:id} 按出现顺序（引用可出现在定义之前，编号仍与定义一致）
  const num = new Map<string, number>();
  let n = 0;
  for (const seg of segments) {
    if (seg.fenced) continue;
    for (const m of seg.text.matchAll(DEF_RE)) {
      if (!num.has(m[1])) num.set(m[1], ++n);
    }
  }

  // 2) 引用替换 & 图片定义改写
  for (const seg of segments) {
    if (seg.fenced) continue;
    seg.text = seg.text.replace(REF_RE, (_w, id: string) =>
      num.has(id)
        ? `[图 ${num.get(id)}](#figdef-${id})`
        : `⚠️${_w}`,
    );
    seg.text = seg.text.replace(
      IMG_DEF_RE,
      (_w, alt: string, src: string, id: string) =>
        num.has(id)
          ? `![图 ${num.get(id)}：${alt}](${src} "figdef:${id}")`
          : _w,
    );
  }

  return segments.map((s) => s.text).join("");
}
