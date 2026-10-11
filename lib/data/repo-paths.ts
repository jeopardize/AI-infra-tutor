import path from "node:path";

/**
 * 数据仓库与本地缓存的路径解析（repo-storage / migrations 共用）。
 * - DATA_REPO_PATH：题库 git 仓库的本地路径（默认 ~/apps/data）
 * - DATA_DIR：本地缓存目录（默认 ~/Documents/ai-infra-tutor-data）
 */

export const QB_GIT_DIR = "question-bank";

function expandHome(p: string): string {
  if (!p.startsWith("~")) return p;
  return path.join(process.env.HOME ?? "", p.slice(1));
}

export function dataRepoPath(): string {
  const envPath = process.env.DATA_REPO_PATH;
  if (envPath) return expandHome(envPath);
  return path.join(process.env.HOME ?? "", "apps", "data");
}

export function localCachePath(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "");
  const dir = process.env.DATA_DIR
    ? expandHome(process.env.DATA_DIR)
    : path.join(process.env.HOME ?? "", "Documents", "ai-infra-tutor-data");
  return path.join(dir, `${safe}.json`);
}
