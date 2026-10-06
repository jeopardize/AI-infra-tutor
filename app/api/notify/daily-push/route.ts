import { runDailyPush } from "@/lib/notify/daily-push";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/notify/daily-push
 * 触发一次"每日 9 点"推送（用于 cron 或手动测试）。
 */
export async function POST() {
  try {
    const result = await runDailyPush();
    return Response.json(result);
  } catch (err) {
    console.error("[api/notify/daily-push] failed:", err);
    return Response.json(
      { ok: false, message: (err as Error).message },
      { status: 500 },
    );
  }
}
