import { forcePullNotes } from "@/lib/docs/sync";

export const runtime = "nodejs";
export const maxDuration = 120;

/** 手动触发：从 GitHub 远端重新拉取笔记库（远端为准），完成后前端自行刷新树 */
export async function POST() {
  try {
    const result = await forcePullNotes();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[api/docs/pull] failed:", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
