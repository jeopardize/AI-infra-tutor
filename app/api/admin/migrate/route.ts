import { runMigrations } from "@/lib/data/migrations";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 手动触发数据迁移（也可被 scripts/update.sh 在每次升级后调用拿迁移报告）。
 * POST /api/admin/migrate  -> 执行迁移并返回报告
 * GET  /api/admin/migrate  -> 同样执行（方便 curl），返回报告
 */

async function handle() {
  try {
    const result = await runMigrations();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function POST() {
  return handle();
}

export async function GET() {
  return handle();
}
