import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { QB_GIT_DIR, dataRepoPath, localCachePath } from "./repo-paths";

/**
 * 数据迁移机制（反馈：每次升级都必须确保已有数据迁移）。
 *
 * - 迁移注册表 MIGRATIONS：每项 { id, description, run }，按顺序执行且幂等。
 * - 已应用记录存在数据 git 仓库 question-bank/migrations.json（与业务数据同仓库，天然随云端备份）。
 * - 触发时机：
 *   1) 服务启动（instrumentation.ts register()，每次升级重启后自动跑）
 *   2) 每次升级（scripts/update.sh 在 pm2 重启后调用 POST /api/admin/migrate 拿迁移报告）
 *   3) 手动：POST /api/admin/migrate
 *
 * 这里刻意不经过 repo-storage 的 loadFromGit（它每个 key 都会 git pull），
 * 而是单次 pull + 直接读写文件，最后一次性 commit + push。
 */

export interface MigrationResult {
  /** 本次新应用的迁移 id */
  applied: string[];
  /** 已应用、本次跳过的迁移 id */
  skipped: string[];
  /** 各数据文件的处理情况 */
  details: string[];
}

interface MigrationMeta {
  applied: string[];
  updatedAt?: number;
}

interface Migration {
  id: string;
  description: string;
  /** 返回该迁移对数据做的变更描述列表（无变更返回空数组） */
  run: (ctx: MigrationIO) => Promise<string[]>;
}

/** 迁移可用的读写通道 */
export interface MigrationIO {
  /** 读某个 key 的当前值（git 仓库优先，本地缓存回退；file 泛指任意业务 key） */
  read: <T>(key: string, fallback: T) => Promise<T>;
  /** 写某个 key（写 git 仓库 + 本地缓存） */
  write: <T>(key: string, value: T) => Promise<void>;
}

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn("git", args, { cwd, timeout: 120_000 });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`git ${args[0]} exit=${code}: ${err.slice(0, 300) || out.slice(0, 300)}`));
    });
  });
}

async function ensureRepo(): Promise<string> {
  const repo = dataRepoPath();
  try {
    await fs.access(path.join(repo, ".git"));
    return repo;
  } catch {
    await fs.mkdir(path.dirname(repo), { recursive: true });
    await git(path.dirname(repo), [
      "clone",
      process.env.DATA_REPO_REMOTE ?? "https://github.com/jeopardize/ai_infra_knowlege.git",
      repo,
    ]);
    return repo;
  }
}

function readJson<T>(fp: string, fallback: T): Promise<T> {
  return fs
    .readFile(fp, "utf-8")
    .then((raw) => JSON.parse(raw) as T)
    .catch(() => fallback);
}

const io: MigrationIO = {
  async read<T>(key: string, fallback: T): Promise<T> {
    const fromGit = await readJson<T>(path.join(dataRepoPath(), QB_GIT_DIR, `${key}.json`), fallback);
    if (fromGit !== fallback) return fromGit;
    return readJson<T>(localCachePath(key), fallback);
  },
  async write(key, value) {
    const repo = await ensureRepo();
    const fp = path.join(repo, QB_GIT_DIR, `${key}.json`);
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(fp, JSON.stringify(value, null, 2), "utf-8");
    // 本地缓存同步写，保证 git 不可用时数据仍在
    try {
      const cache = localCachePath(key);
      await fs.mkdir(path.dirname(cache), { recursive: true });
      await fs.writeFile(cache, JSON.stringify(value, null, 2), "utf-8");
    } catch {}
  },
};

/** —— 迁移注册表（新增迁移时往这里追加，永远不要修改已发布的迁移） —— */
const MIGRATIONS: Migration[] = [
  {
    id: "2026-10-11-schema-normalize",
    description: "规范化各数据文件结构：feedback 项补 status 字段、favorites/quiz-history 保证为数组、question-progress 为对象",
    async run(ctx) {
      const changes: string[] = [];

      // feedback
      const feedback = await ctx.read<unknown[]>("feedback", []);
      if (Array.isArray(feedback)) {
        let touched = false;
        for (const it of feedback) {
          if (it && typeof it === "object") {
            const o = it as Record<string, unknown>;
            if (typeof o.status !== "string" || !["open", "done"].includes(o.status)) {
              o.status = "open";
              touched = true;
            }
            if (typeof o.id !== "string" && o.createdAt) {
              o.id = `fb_${o.createdAt}_migrated`;
              touched = true;
            }
          }
        }
        if (touched || feedback.length === 0) {
          await ctx.write("feedback", feedback);
          changes.push(`feedback: 规范化 ${feedback.length} 条`);
        }
      }

      // favorites / quiz-history 必须为数组
      for (const key of ["favorites", "quiz-history"] as const) {
        const v = await ctx.read<unknown>(key, []);
        if (!Array.isArray(v)) {
          await ctx.write(key, []);
          changes.push(`${key}: 非数组已重置为 []`);
        }
      }

      // question-progress 必须为对象
      const progress = await ctx.read<unknown>("question-progress", {});
      if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
        await ctx.write("question-progress", {});
        changes.push("question-progress: 已重置为 {}");
      }

      return changes;
    },
  },
];

/**
 * 执行全部未应用的迁移。幂等：重复调用只会跳过已应用项。
 * 结束时把变更与 meta 一次性 commit + push 到数据 git 仓库。
 */
export async function runMigrations(): Promise<MigrationResult> {
  const result: MigrationResult = { applied: [], skipped: [], details: [] };
  const repo = await ensureRepo();

  // 单次 pull，拿到云端最新数据与迁移记录
  try {
    await git(repo, ["pull", "--ff-only", "origin", "HEAD"]);
  } catch (err) {
    result.details.push(`git pull 失败（离线？），使用本地数据继续: ${(err as Error).message.slice(0, 120)}`);
  }

  const metaFp = path.join(repo, QB_GIT_DIR, "migrations.json");
  const meta = await readJson<MigrationMeta>(metaFp, { applied: [] });
  const appliedSet = new Set(meta.applied ?? []);

  for (const m of MIGRATIONS) {
    if (appliedSet.has(m.id)) {
      result.skipped.push(m.id);
      continue;
    }
    try {
      const changes = await m.run(io);
      appliedSet.add(m.id);
      result.applied.push(m.id);
      result.details.push(`✓ ${m.id}: ${m.description}${changes.length ? `（${changes.join("；")}）` : ""}`);
    } catch (err) {
      result.details.push(`✗ ${m.id} 失败: ${(err as Error).message}`);
    }
  }

  // 一次性提交（有文件变更或 meta 变更时）
  try {
    await fs.writeFile(metaFp, JSON.stringify({ applied: [...appliedSet], updatedAt: Date.now() }, null, 2), "utf-8");
    await git(repo, ["add", "-A"]);
    if ((await git(repo, ["status", "--porcelain"])).length > 0) {
      await git(repo, [
        "-c", "user.name=ai-infra-tutor",
        "-c", "user.email=bot@ai-infra-tutor.local",
        "commit", "-m", `migrate: ${result.applied.join(", ") || "no-op"}`,
      ]);
      await git(repo, ["push", "origin", "HEAD"]).catch(() => {
        result.details.push("git push 失败（数据已提交本地仓库，稍后由 notes-sync 兜底推送）");
      });
    }
  } catch (err) {
    result.details.push(`迁移结果提交失败: ${(err as Error).message.slice(0, 200)}`);
  }

  console.log(`[migrations] applied=${result.applied.length} skipped=${result.skipped.length}`);
  return result;
}
