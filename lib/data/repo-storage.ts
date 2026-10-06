import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

/**
 * 题库 GitHub 持久化存储。
 *
 * 设计目标：
 * - 题库数据（question-bank.json）不再只存本地磁盘，而是保存到一个独立 git 仓库
 *   （https://github.com/jeopardize/ai_infra_knowlege.git 下的 `question-bank/` 目录），
 *   天然具备：云端备份、版本历史、跨服务器迁移能力。
 * - 迁移性：换服务器只需 `git clone` 该仓库即可拿到全部题库数据，无需手工拷文件。
 * - 兼容性：依然保留本地 JSON 文件作为缓存（DATA_DIR 下的 question-bank.json），
 *   老的 `.data/` / DATA_DIR 数据在首次加载时会自动迁移到 git 仓库。
 *
 * 环境变量：
 * - DATA_REPO_PATH：题库 git 仓库的本地路径（默认 ~/apps/data）
 * - DATA_REPO_REMOTE：远端地址
 */

const DEFAULT_REMOTE = "https://github.com/jeopardize/ai_infra_knowlege.git";

export const QB_GIT_DIR = "question-bank";

/** 含个人隐私、不推送到 git 仓库的 key：只存本地数据目录 */
const LOCAL_ONLY_KEYS = new Set(["resume"]);

function isLocalOnly(key: string): boolean {
  return LOCAL_ONLY_KEYS.has(key);
}

function dataRepoPath(): string {
  const envPath = process.env.DATA_REPO_PATH;
  if (envPath) {
    return envPath.startsWith("~")
      ? path.join(process.env.HOME ?? "", envPath.slice(1))
      : envPath;
  }
  return path.join(process.env.HOME ?? os_homedir(), "apps", "data");
}

function os_homedir(): string {
  return process.env.HOME || "";
}

function gitFilePath(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(dataRepoPath(), QB_GIT_DIR, `${safe}.json`);
}

function localCachePath(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "");
  const dir = process.env.DATA_DIR
    ? (process.env.DATA_DIR.startsWith("~")
        ? path.join(process.env.HOME ?? os_homedir(), process.env.DATA_DIR.slice(1))
        : process.env.DATA_DIR)
    : path.join(os_homedir(), "Documents", "ai-infra-tutor-data");
  return path.join(dir, `${safe}.json`);
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
      else reject(new Error(`git ${args[0]} exit=${code}: ${err.slice(0, 400) || out.slice(0, 400)}`));
    });
  });
}

/** 确保 git 仓库存在（首次自动 clone，之后直接用） */
async function ensureRepo(): Promise<string> {
  const repo = dataRepoPath();
  try {
    await fs.access(path.join(repo, ".git"));
    return repo;
  } catch {
    // clone（到父目录下创建）
    await fs.mkdir(path.dirname(repo), { recursive: true });
    await git(path.dirname(repo), ["clone", DEFAULT_REMOTE, repo]);
    return repo;
  }
}

/**
 * 从 git 仓库加载题库 JSON。
 * 顺序：git 仓库 → 本地缓存文件 → fallback
 * local-only 的 key（如 resume）只读本地缓存。
 */
export async function loadFromGit<T>(key: string, fallback: T): Promise<T> {
  if (isLocalOnly(key)) {
    try {
      const raw = await fs.readFile(localCachePath(key), "utf-8");
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  const fp = gitFilePath(key);
  try {
    await ensureRepo();
    // 尽力 pull 最新（离线时忽略失败）
    try { await git(dataRepoPath(), ["pull", "--ff-only", "origin", "HEAD"]); } catch {}
    const raw = await fs.readFile(fp, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[data-repo] loadFromGit("${key}") failed, trying local cache:`, (err as Error).message);
    // 回退：本地缓存（含老 DATA_DIR 数据）
    try {
      const raw = await fs.readFile(localCachePath(key), "utf-8");
      const parsed = JSON.parse(raw) as T;
      // 首次成功时异步写回 git 仓库（迁移）
      saveToGit(key, parsed).catch(() => {});
      return parsed;
    } catch {
      return fallback;
    }
  }
}

/** 把题库 JSON 写入 git 仓库并 commit + push（尽力而为，失败时留本地缓存）；
 *  local-only 的 key（如 resume）只写本地数据目录，绝不进 git。 */
export async function saveToGit<T>(key: string, data: T): Promise<void> {
  // 无论 git 是否成功，都先写本地缓存（保证数据不丢）
  try {
    await fs.mkdir(path.dirname(localCachePath(key)), { recursive: true });
    await fs.writeFile(localCachePath(key), JSON.stringify(data, null, 2), "utf-8");
  } catch {}

  if (isLocalOnly(key)) {
    console.log(`[data-repo] saved "${key}" to local data dir only (git skipped)`);
    return;
  }

  const fp = gitFilePath(key);
  try {
    await ensureRepo();
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(fp, JSON.stringify(data, null, 2), "utf-8");
    await git(dataRepoPath(), ["add", "-A"]);
    const hasChanges = (await git(dataRepoPath(), ["status", "--porcelain"])).length > 0;
    if (hasChanges) {
      await git(dataRepoPath(), [
        "-c", "user.name=ai-infra-tutor",
        "-c", "user.email=bot@ai-infra-tutor.local",
        "commit", "-m", `data: update ${key}`,
      ]);
      await git(dataRepoPath(), ["push", "origin", "HEAD"]);
    }
    console.log(`[data-repo] saved "${key}" to git repo`);
  } catch (err) {
    console.warn(`[data-repo] saveToGit("${key}") failed, keeping local cache:`, (err as Error).message);
  }
}
