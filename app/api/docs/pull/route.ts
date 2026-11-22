import { getLibraryRepo } from "@/lib/docs/repos";
import { forcePullNotes } from "@/lib/docs/sync";

export const runtime = "nodejs";
export const maxDuration = 120;

/** 手动触发：从 GitHub 远端重新拉取笔记库（远端为准），完成后前端自行刷新树；
 *  可用 query/body `repo` 指定多仓库中的某一仓。 */
export async function POST(req: Request) {
  const repo = await getLibraryRepo(new URL(req.url).searchParams.get("repo"));
  if (!repo) return Response.json({ error: "unknown_repo" }, { status: 404 });
  try {
    const result = await forcePullNotes(repo.root);
    return Response.json({ ok: true, repo: repo.id, ...result });
  } catch (err) {
    console.error("[api/docs/pull] failed:", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
