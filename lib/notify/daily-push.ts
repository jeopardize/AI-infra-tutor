import { syncPullNotes } from "@/lib/docs/sync";
import { scanLibrary } from "@/lib/docs/fs";
import { getClient, pickModel } from "@/lib/claude/client";
import { systemWithCache } from "@/lib/claude/prompts";
import { sendWecomMarkdown } from "@/lib/notify/wecom";
import { loadQuestionProgressSafe } from "@/lib/notify/progress";
import { ALL_TOPICS } from "@/lib/knowledge";
import {
  loadQuestionBank,
  migrateLegacyBankIfNeeded,
  type BankQuestion,
} from "@/lib/questions/store";
import { ensureDailySet, markDailySetSent, type DailySet } from "@/lib/questions/daily";
import type { QuestionItem } from "@/lib/storage";

/**
 * 每日 8 点推送到企业微信（智能机器人长连接）：
 * 1. 从题库（笔记库 question.md 文件）挑选当日题目并持久化（与网页总览页共用）
 * 2. 结合笔记库目录和掌握度统计，让 LLM 生成"笔记缺失点"总结
 */

const DAILY_SYSTEM = `你是 AI Infra 学习助手的日报撰写器。用户每天早上会收到两份内容：
1. 今日题目（你只需要原样引用题目，不要自己出题）
2. 笔记缺失点总结（根据用户的笔记目录和掌握情况，指出哪些主题的笔记明显缺失或太薄弱，给出 2-4 条具体建议，每条注明该去补哪个方向的笔记）

要求：中文、简洁、markdown 格式、总字数不超过 600。缺失点总结直接给结论，不要客套。`;

function formatQuestions(qs: QuestionItem[]): string {
  return qs
    .map((q, i) => `${i + 1}. **${q.question.zh || q.question.en}**`)
    .join("\n");
}

/** 遍历笔记库，返回相对路径列表 */
async function collectNotePaths(): Promise<string[]> {
  const tree = await scanLibrary();
  if (!tree?.children) return [];
  const out: string[] = [];
  const walk = (nodes: NonNullable<typeof tree.children>, prefix: string) => {
    for (const n of nodes) {
      const rel = prefix ? `${prefix}/${n.name}` : n.name;
      if (n.type === "dir") {
        if (n.children) walk(n.children, rel);
      } else if (/\.(md|markdown)$/i.test(n.name)) {
        out.push(rel);
      }
    }
  };
  walk(tree.children, "");
  return out;
}

function masteryStats(questions: QuestionItem[], progress: Record<string, { status?: string; lastReviewedAt?: number }>) {
  const stats = new Map<string, { total: number; mastered: number; learning: number; gap: number; unknown: number }>();
  for (const topic of ALL_TOPICS) {
    const s = { total: 0, mastered: 0, learning: 0, gap: 0, unknown: 0 };
    for (const cp of topic.checkpoints) {
      const status = progress[cp.id]?.status ?? "unknown";
      s.total++;
      s[status as "mastered" | "learning" | "gap" | "unknown"]++;
    }
    for (const q of questions.filter((q) => q.topicId === topic.id)) {
      const status = progress[q.id]?.status ?? "unknown";
      s.total++;
      s[status as "mastered" | "learning" | "gap" | "unknown"]++;
    }
    if (s.total > 0) stats.set(topic.id, s);
  }
  return stats;
}

/** 去掉 file 字段，得到普通 QuestionItem */
function toPlain(q: QuestionItem): QuestionItem {
  const { id, topicId, category, question, answer, createdAt, updatedAt } = q;
  return { id, topicId, category, question, answer, createdAt, updatedAt };
}

async function generateSummary(
  picked: QuestionItem[],
  progress: Record<string, { status?: string; lastReviewedAt?: number }>,
): Promise<string> {
  const notePaths = await collectNotePaths();
  const stats = masteryStats(picked, progress);
  const statsText = ALL_TOPICS.filter((t) => stats.has(t.id))
    .map((t) => {
      const s = stats.get(t.id)!;
      return `- ${t.title}（${t.category}）: 共${s.total}项，已掌握${s.mastered}，学习中${s.learning}，未掌握${s.gap}，未覆盖${s.unknown}`;
    })
    .join("\n");

  try {
    const client = getClient();
    const userPrompt = `## 今日题目（原样保留在消息开头）
${formatQuestions(picked)}

## 笔记库文件列表（部分）
${notePaths.slice(0, 120).join("\n")}

## 各主题掌握情况
${statsText || "（暂无掌握度数据）"}

请按系统提示生成今日日报。`;
    const resp = await client.messages.create({
      model: pickModel("quality"),
      max_tokens: 1500,
      system: systemWithCache(DAILY_SYSTEM),
      messages: [{ role: "user", content: userPrompt }],
    });
    return resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
  } catch (err) {
    console.error("[daily] LLM failed:", (err as Error).message);
    return `## 笔记缺失点总结\n\n（LLM 调用失败，仅列出薄弱主题）\n${statsText}`;
  }
}

export async function runDailyPush(): Promise<{ ok: boolean; message: string }> {
  // 1. 拉取笔记最新 + 读取题库（笔记库 question.md 文件，含遗留迁移）
  await syncPullNotes();
  await migrateLegacyBankIfNeeded();
  const { questions } = await loadQuestionBank();
  if (questions.length === 0) {
    await sendWecomMarkdown("**今日 AI Infra 复习**\n\n题库为空，请先在题库页面添加题目。");
    return { ok: true, message: "题库为空，已发送空题提示" };
  }

  const progress = await loadQuestionProgressSafe();
  const set: DailySet = await ensureDailySet(questions, progress);
  const picked = set.questions.map(toPlain);

  const summary = await generateSummary(picked, progress);
  await markDailySetSent({ ...set, summary });

  // 4. 发送
  const header = `# 📚 今日 AI Infra 复习 (${new Date().toLocaleDateString("zh-CN")})\n\n## 今日题目\n${formatQuestions(picked)}\n\n`;
  const ok = await sendWecomMarkdown(header + summary);
  return {
    ok,
    message: ok ? "已推送到企业微信" : "企业微信推送失败（检查 WECOM_BOT_ID/SECRET）",
  };
}

// ---- CLI 入口：node -r ts-node/register 或 next 打包后由 cron 调 ----
if (process.env.RUN_DAILY_PUSH === "1") {
  runDailyPush()
    .then((r) => {
      console.log(`[daily] result: ${r.message}`);
      process.exit(0);
    })
    .catch((e) => {
      console.error("[daily] failed:", e);
      process.exit(1);
    });
}
