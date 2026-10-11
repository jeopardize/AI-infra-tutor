/**
 * Next.js 服务启动钩子：每次服务实例启动（含每次升级重启）时自动执行数据迁移，
 * 确保已有数据始终迁移到当前版本结构（反馈：每次升级都要确保已有数据迁移）。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { runMigrations } = await import("./lib/data/migrations");
      const result = await runMigrations();
      if (result.applied.length > 0) {
        console.log(`[migrations] 启动迁移完成: ${result.applied.join(", ")}`);
      }
    } catch (err) {
      console.warn("[migrations] 启动迁移失败（不影响服务启动，可稍后手动触发）:", (err as Error).message);
    }
  }
}
