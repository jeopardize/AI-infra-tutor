import { getLibraryRepo } from "@/lib/docs/repos";
import { scanLibrary } from "@/lib/docs/fs";
import { syncPullNotes } from "@/lib/docs/sync";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const repo = await getLibraryRepo(new URL(req.url).searchParams.get("repo"));
  if (!repo) return Response.json({ error: "unknown_repo" }, { status: 404 });
  // 读取前先从 GitHub 拉取远端最新笔记（尽力而为，失败用本地内容兜底）
  await syncPullNotes(repo.root);
  const tree = await scanLibrary(repo.root);
  if (!tree) {
    return Response.json(
      {
        error: "library_not_found",
        repo: repo.id,
        root: repo.root,
        hint: `笔记库目录不存在：${repo.root}。环境变量 KNOWLEDGE_LIBRARIES_PATH 可指定多仓库克隆根目录。`,
      },
      { status: 404 },
    );
  }
  return Response.json({ repo: repo.id, root: repo.root, tree });
}
