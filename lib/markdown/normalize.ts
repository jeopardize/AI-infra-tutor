/**
 * 笔记 markdown 源码规范化预处理（渲染前逐行扫描，代码围栏感知）：
 *
 * 1. 引用块内的代码围栏修复（反馈：> 后插入代码块无法正常渲染、# 注释被当成标题）
 *    CommonMark 要求引用里的围栏每一行都带 > 前缀，笔记常漏写内容行前缀，
 *    围栏断裂后内容变成普通段落（# 注释行还会被解析成标题）。
 *    处理：`> ```lang` 开头的围栏，把到闭合围栏（同一标记）之间的行都补上引用前缀，
 *    找不到闭合围栏时保持原样不动。
 *
 * 2. 红笔/蓝笔多行块拆分（反馈：%%r:...%% 跨行时不渲染红色）
 *    remark 无法跨块级结构（列表/标题/引用）配对行内标记，把跨行笔块按行拆成
 *    每行一个 span，行首的列表/引用标记留在 span 外（保住块级解析）。
 *    同行内自闭合的 %%c:...%% 原样保留（remarkPens 插件本来就能配对）。
 */

const FENCE_OPEN_RE = /^([ \t]*>+[ \t]?)?(```+|~~~+)/;
const FENCE_CLOSE_RE = /^[ \t]*(```+|~~~+)[ \t]*$/;
const STRIP_QUOTE_RE = /^[ \t]*>+[ \t]?/;
/** 行首块级前缀：缩进/引用/列表标记（拆笔块时要留在 span 外面） */
const BLOCK_PFX_RE = /^[ \t]*(?:>[ \t]*)*(?:\d{1,9}[.)][ \t]|[-*+][ \t])?/;
const PEN_OPEN_RE = /^([\s\S]*?)%%([rb红蓝])\s*[:：]([\s\S]*)$/;

import { preprocessFigRefs } from "./figrefs";

/** 单行内容包进笔 span；行首块级前缀保留在外面；空行/纯前缀行不包 */
function wrapPenLine(line: string, color: string): string {
  const m = line.match(BLOCK_PFX_RE);
  const pfx = m ? m[0] : "";
  const rest = line.slice(pfx.length);
  if (rest.trim() === "") return line;
  return `${pfx}%%${color}:${rest}%%`;
}

export function preprocessNote(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  // 顶层普通围栏（无引用前缀）：原样透传
  let plainChar: string | null = null;
  // 带引用前缀的围栏：正在补前缀
  let quoteChar: string | null = null;
  let quotePfx = "";
  // 未闭合的笔块颜色
  let pen: string | null = null;

  while (i < lines.length) {
    const line = lines[i];

    // ---------- 普通围栏内：只认同标记闭合行 ----------
    if (plainChar) {
      const m = line.match(FENCE_CLOSE_RE);
      if (m && m[1][0] === plainChar) plainChar = null;
      out.push(line);
      i += 1;
      continue;
    }

    // ---------- 引用围栏内：补引用前缀 ----------
    if (quoteChar) {
      const stripped = line.replace(STRIP_QUOTE_RE, "");
      const m = stripped.match(FENCE_CLOSE_RE);
      if (m && m[1][0] === quoteChar) {
        quoteChar = null;
        out.push(STRIP_QUOTE_RE.test(line) ? line : quotePfx + line);
      } else {
        out.push(STRIP_QUOTE_RE.test(line) ? line : quotePfx + line);
      }
      i += 1;
      continue;
    }

    // ---------- 引用围栏 opener（> ```lang）：先确认有闭合行才启用修复 ----------
    const qm = line.match(FENCE_OPEN_RE);
    if (qm && qm[1]) {
      const char = qm[2][0];
      let close = -1;
      for (let j = i + 1; j < lines.length; j++) {
        const stripped = lines[j].replace(STRIP_QUOTE_RE, "");
        const m = stripped.match(FENCE_CLOSE_RE);
        if (m && m[1][0] === char) {
          close = j;
          break;
        }
      }
      if (close !== -1) {
        quoteChar = char;
        quotePfx = qm[1];
        out.push(line);
        i += 1;
        continue;
      }
      // 找不到闭合围栏：保持原样（可能只是行内文本），继续正常处理
    }

    // ---------- 普通围栏 opener ----------
    if (qm && !qm[1]) {
      plainChar = qm[2][0];
      out.push(line);
      i += 1;
      continue;
    }

    // ---------- 笔块进行中：拆行包裹 ----------
    if (pen) {
      const closeIdx = line.indexOf("%%");
      if (closeIdx === -1) {
        out.push(wrapPenLine(line, pen));
      } else {
        out.push(wrapPenLine(line.slice(0, closeIdx), pen) + line.slice(closeIdx + 2));
        pen = null;
      }
      i += 1;
      continue;
    }

    // ---------- 笔块 opener ----------
    const pm = line.match(PEN_OPEN_RE);
    if (pm) {
      const [, before, color, rest] = pm;
      const closeIdx = rest.indexOf("%%");
      if (closeIdx !== -1) {
        // 同行自闭合：remarkPens 插件可配对，原样保留
        out.push(line);
      } else {
        pen = color;
        // opener 行的剩余内容包进 span；before 原样保留（可能以列表/引用前缀开头）
        const wrapped = rest.trim() === "" ? "" : wrapPenLine(rest, color);
        out.push(before + wrapped);
      }
      i += 1;
      continue;
    }

    out.push(line);
    i += 1;
  }
  // 图片交叉引用改写（figrefs 自带围栏感知，在规范化后的文本上运行）
  return preprocessFigRefs(out.join("\n"));
}
