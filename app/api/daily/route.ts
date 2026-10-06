import { migrateLegacyBankIfNeeded, loadQuestionBank } from "@/lib/questions/store";
import { ensureDailySet, localDateStr } from "@/lib/questions/daily";
import { loadQuestionProgressSafe } from "@/lib/notify/progress";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/daily
 * 返回今天的每日题目集合（与企业微信 9 点推送保持一致）。
 * 当天没有记录时按掌握度/复习时间重新挑选并持久化。
 */
export async function GET() {
  try {
    await migrateLegacyBankIfNeeded();
    const { questions } = await loadQuestionBank();
    if (!questions.length) {
      return Response.json({
        date: localDateStr(),
        questions: [],
        summary: "",
        emptyReason: "题库为空，请先在题库页面添加题目。",
      });
    }
    const progress = await loadQuestionProgressSafe();
    const set = await ensureDailySet(questions, progress);
    return Response.json(set);
  } catch (err) {
    console.error("[api/daily] GET failed:", err);
    return Response.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
