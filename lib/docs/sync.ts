import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";

/**
 * 笔记库 Git 同步工具。
 *
 * 设计：本地笔记目录是一个独立的 git 仓库，远端仓库
 * https://github.com/jeopardize/ai_infra_knowlege.git 是"最完整且最新"的版本。
 * - 应用（网页端）每次读取前先 pull（拿最新远端内容）
 * - 网页端每次写操作（write/create/mkdir）后自动 commit + push
 * - 本地编辑器编辑由用户手动 push（或本机 launchd 定时任务）
 *
 * 所有 git 操作都是"尽力而为"（best-effort）：网络不可用时不阻塞主流程，
 * 失败仅记录日志。
 */

export const NOTES_REMOTE = "https://github.com/jeopardize/ai_infra_knowlege.git";

export function notesRepoRoot(): string {
  const fromEnv = process.env.KNOWLEDGE_LIBRARY_PATH;
  if (fromEnv && fromEnv.trim()) return path.resolve(fromEnv.trim());
  return path.join(os.homedir(), "Documents", "knowlege_library");
}

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn("git", args, { cwd, timeout: 60_000 });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`git ${args[0]} exit=${code}: ${err.slice(0, 500) || out.slice(0, 500)}`));
    });
  });
}

async function isRepo(root: string): Promise<boolean> {
  try {
    await fs.access(path.join(root, ".git"));
    return true;
  } catch {
    return false;
  }
}

/** 读取前同步：pull 远端最新（尽量 fast-forward，失败不影响读取本地内容） */
export async function syncPullNotes(): Promise<void> {
  const root = notesRepoRoot();
  if (!(await isRepo(root))) return;
  try {
    await git(root, ["pull", "--ff-only", "origin", "HEAD"]);
  } catch (err) {
    console.warn("[notes-sync] pull failed (keep local):", (err as Error).message);
  }
}

/** 写操作后同步：add + commit + push（尽力而为） */
export async function syncPushNotes(message: string): Promise<void> {
  const root = notesRepoRoot();
  if (!(await isRepo(root))) return;
  try {
    await git(root, ["add", "-A"]);
    // 若没有变更，commit 会失败——视为成功（nothing to commit）
    const hasChanges = (await git(root, ["status", "--porcelain"])).length > 0;
    if (hasChanges) {
      await git(root, [
        "-c", "user.name=ai-infra-tutor",
        "-c", "user.email=bot@ai-infra-tutor.local",
        "commit", "-m", message,
      ]);
    }
    await git(root, ["push", "origin", "HEAD"]);
  } catch (err) {
    console.warn("[notes-sync] push failed (will retry next write):", (err as Error).message);
  }
}
