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

export interface ForcePullResult {
  /** ff：fast-forward 合并成功；reset：本地与远端分叉，已强制重置到远端；unchanged：无需变更/离线 */
  mode: "ff" | "reset" | "unchanged";
  detail?: string;
}

/** 用户主动触发的强制拉取：GitHub 远端为准。
 *  先 fetch，再尝试 ff 合并；本地已分叉（本地领先提交或历史不一致）时
 *  reset --hard 到远端并如实告知（之前未 push 成功的本地提交会丢失）。 */
export async function forcePullNotes(): Promise<ForcePullResult> {
  const root = notesRepoRoot();
  if (!(await isRepo(root))) {
    return { mode: "unchanged", detail: "笔记库目录不是 git 仓库" };
  }
  try {
    await git(root, ["fetch", "origin"]);
  } catch (err) {
    return { mode: "unchanged", detail: `fetch 失败（网络？）：${(err as Error).message}` };
  }
  const local = await git(root, ["rev-parse", "HEAD"]).catch(() => "");
  const remote = await git(root, ["rev-parse", "origin/HEAD"]).catch(() => "");
  if (!remote) return { mode: "unchanged", detail: "无法解析远端 HEAD" };
  if (local === remote) return { mode: "unchanged", detail: "本地已是最新" };

  try {
    await git(root, ["merge", "--ff-only", "origin/HEAD"]);
    return { mode: "ff" };
  } catch {
    const beforeDesc = await git(root, ["log", "--oneline", "-3", "HEAD"]).catch(
      () => "",
    );
    await git(root, ["reset", "--hard", "origin/HEAD"]);
    console.warn(
      "[notes-sync] force pull: local diverged, reset to remote. abandoned:\n",
      beforeDesc,
    );
    return {
      mode: "reset",
      detail: `本地与远端分叉，已强制重置到 GitHub 最新。被放弃的本地提交：\n${beforeDesc}`,
    };
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
