import { getCheckpoint } from "@/lib/knowledge";
import type { InterviewSession } from "@/lib/storage";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** 文件名安全：去掉路径分隔符、控制字符；中文保留 */
function safeFilenameChunk(s: string): string {
  return s.replace(/[\\/<>:"|?*\0]/g, "").replace(/\s+/g, "-").slice(0, 40);
}

/** 默认导出文件名：面试-YYYYMMDD-HHmm-<level>-<focus>.md */
export function defaultExportFilename(s: InterviewSession): string {
  const d = new Date(s.at);
  const date = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  const time = `${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  const level = safeFilenameChunk(s.config.level);
  const focus = safeFilenameChunk(s.config.focus.join("_"));
  return `面试-${date}-${time}-${level}-${focus}.md`;
}

/** 把一个面试 session 渲染成 markdown 文档 */
export function sessionToMarkdown(s: InterviewSession): string {
  const d = new Date(s.at);
  const dateStr = d.toLocaleString("zh-CN");
  const lines: string[] = [];

  lines.push(`# 模拟面试 · ${dateStr}`);
  lines.push("");
  lines.push("## 面试配置");
  lines.push("");
  lines.push(`- **目标级别**：${s.config.level}`);
  lines.push(`- **侧重方向**：${s.config.focus.join(" / ")}`);
  lines.push(`- **计划时长**：${s.config.durationMin} 分钟`);
  lines.push(`- **会话 ID**：\`${s.id}\``);
  lines.push("");

  if (s.scorecard) {
    const sc = s.scorecard;
    lines.push("## 评分");
    lines.push("");
    lines.push(`**总评：${sc.overall}/100** — ${sc.summary}`);
    lines.push("");
    lines.push("| 维度 | 得分 |");
    lines.push("| --- | --- |");
    lines.push(`| 概念清晰度 | ${sc.dimensions.concept_clarity} |`);
    lines.push(`| 系统设计 | ${sc.dimensions.system_design} |`);
    lines.push(`| 实战经验 | ${sc.dimensions.practical_experience} |`);
    lines.push(`| 表达 | ${sc.dimensions.communication} |`);
    lines.push("");

    if (sc.strengths.length) {
      lines.push("### 亮点");
      lines.push("");
      for (const x of sc.strengths) lines.push(`- ${x}`);
      lines.push("");
    }
    if (sc.weaknesses.length) {
      lines.push("### 短板");
      lines.push("");
      for (const x of sc.weaknesses) lines.push(`- ${x}`);
      lines.push("");
    }
    if (sc.knowledge_gaps.length) {
      lines.push("### 暴露的知识盲点");
      lines.push("");
      for (const g of sc.knowledge_gaps) {
        const cp = g.checkpoint_id ? getCheckpoint(g.checkpoint_id) : undefined;
        const tag = cp
          ? `\`${g.checkpoint_id}\`（${cp.topic.title} · ${cp.checkpoint.name}）`
          : g.checkpoint_id
            ? `\`${g.checkpoint_id}\``
            : "";
        lines.push(`- ${tag ? tag + "：" : ""}${g.description}`);
      }
      lines.push("");
    }
    if (sc.next_steps.length) {
      lines.push("### 下一步建议");
      lines.push("");
      for (const x of sc.next_steps) lines.push(`- ${x}`);
      lines.push("");
    }
  }

  lines.push("## 对话全文");
  lines.push("");
  // 第 0 条是触发面试的内部 user 消息，跳过
  const transcript = s.messages.slice(1);
  for (const m of transcript) {
    if (m.role === "assistant") {
      lines.push(`### 🎙 面试官`);
    } else {
      lines.push(`### 🙋 我`);
    }
    lines.push("");
    lines.push(m.content);
    lines.push("");
  }

  lines.push("---");
  lines.push(`*由 AI Infra Tutor 于 ${new Date().toLocaleString("zh-CN")} 导出*`);
  return lines.join("\n");
}

/** 聚合统计：用于"复盘"卡片 */
export interface InterviewStats {
  count: number;
  avgOverall: number | null;
  avgDims: {
    concept_clarity: number;
    system_design: number;
    practical_experience: number;
    communication: number;
  } | null;
  topGaps: Array<{ checkpoint_id: string; count: number; topicTitle?: string; checkpointName?: string }>;
  trend: Array<{ at: number; overall: number; level: string; focus: string[] }>;
}

export function computeInterviewStats(
  sessions: InterviewSession[],
): InterviewStats {
  const scored = sessions.filter((s) => s.scorecard);
  if (scored.length === 0) {
    return { count: 0, avgOverall: null, avgDims: null, topGaps: [], trend: [] };
  }

  const sumOverall = scored.reduce((a, s) => a + s.scorecard!.overall, 0);
  const dims = scored.reduce(
    (acc, s) => {
      const d = s.scorecard!.dimensions;
      acc.concept_clarity += d.concept_clarity;
      acc.system_design += d.system_design;
      acc.practical_experience += d.practical_experience;
      acc.communication += d.communication;
      return acc;
    },
    { concept_clarity: 0, system_design: 0, practical_experience: 0, communication: 0 },
  );
  const n = scored.length;
  const avgDims = {
    concept_clarity: Math.round(dims.concept_clarity / n),
    system_design: Math.round(dims.system_design / n),
    practical_experience: Math.round(dims.practical_experience / n),
    communication: Math.round(dims.communication / n),
  };

  // 高频盲点
  const gapCount = new Map<string, number>();
  for (const s of scored) {
    for (const g of s.scorecard!.knowledge_gaps) {
      const key = g.checkpoint_id || `__free__:${g.description.slice(0, 30)}`;
      gapCount.set(key, (gapCount.get(key) ?? 0) + 1);
    }
  }
  const topGaps = Array.from(gapCount.entries())
    .map(([key, count]) => {
      if (key.startsWith("__free__:")) {
        return { checkpoint_id: key.slice("__free__:".length), count };
      }
      const cp = getCheckpoint(key);
      return cp
        ? {
            checkpoint_id: key,
            count,
            topicTitle: cp.topic.title,
            checkpointName: cp.checkpoint.name,
          }
        : { checkpoint_id: key, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const trend = scored
    .map((s) => ({
      at: s.at,
      overall: s.scorecard!.overall,
      level: s.config.level,
      focus: s.config.focus,
    }))
    .sort((a, b) => a.at - b.at);

  return {
    count: scored.length,
    avgOverall: Math.round(sumOverall / n),
    avgDims,
    topGaps,
    trend,
  };
}
