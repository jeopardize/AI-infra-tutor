import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadJson, saveJson } from "@/lib/data/server-storage";
import { git, NOTES_REMOTE, notesRepoRoot } from "./sync";

/**
 * 笔记库多仓库管理。
 *
 * 默认仓库 = 原有单仓（KNOWLEDGE_LIBRARY_PATH / ~/Documents/knowlege_library）。
 * 额外新增的仓库由应用统一 clone 到「多仓库根目录」（默认 ~/Documents/knowlege_libraries），
 * 注册表本体存放在数据目录（/api/data 同一套 server-storage）。
 * 每次进笔记库先选择仓库，再按原来的目录树方式浏览/读写。
 */

export interface LibraryRepo {
  /** 标识（也是新增仓库的本地目录名）；default = 默认笔记库 */
  id: string;
  /** 展示名 */
  name: string;
  /** git 远端地址 */
  remote: string;
  /** 本地根目录（绝对路径） */
  root: string;
  /** 是否为本应用克隆并管理的仓库：删除时连同本地目录一起删除 */
  managed: boolean;
  addedAt?: string;
}

interface RegistryEntry {
  id: string;
  name: string;
  remote: string;
  addedAt: string;
}

interface RegistryFile {
  version: 1;
  /** 用户已把默认仓库从列表删除（避免下次误恢复） */
  defaultsRemoved?: boolean;
  repos: RegistryEntry[];
}

const REGISTRY_KEY = "library-repos";
const DEFAULT_ID = "default";
const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export const DEFAULT_REPO_ID = DEFAULT_ID;

/** 多仓库本地克隆根目录（默认 ~/Documents/knowlege_libraries，可用环境变量覆盖） */
export function librariesHome(): string {
  const envPath = process.env.KNOWLEDGE_LIBRARIES_PATH;
  if (envPath && envPath.trim()) {
    const v = envPath.trim();
    return v.startsWith("~") ? path.join(os.homedir(), v.slice(1)) : path.resolve(v);
  }
  return path.join(os.homedir(), "Documents", "knowlege_libraries");
}

async function loadRegistry(): Promise<RegistryFile | null> {
  try {
    const raw = await loadJson<RegistryFile | null>(REGISTRY_KEY, null);
    if (raw && raw.version === 1 && Array.isArray(raw.repos)) return raw;
  } catch {
    /* fallback */
  }
  return null;
}

function defaultEntry(): RegistryEntry {
  return { id: DEFAULT_ID, name: "默认笔记库", remote: NOTES_REMOTE, addedAt: "" };
}

function toRepo(e: RegistryEntry): LibraryRepo {
  const isDefault = e.id === DEFAULT_ID;
  return {
    id: e.id,
    name: e.name,
    remote: e.remote,
    root: isDefault ? notesRepoRoot() : path.join(librariesHome(), e.id),
    managed: !isDefault,
    addedAt: e.addedAt,
  };
}

/** 注册表列表（首次访问时自动登记默认仓库；被手动删除过的默认仓库不会复活） */
export async function listLibraryRepos(): Promise<LibraryRepo[]> {
  let reg = await loadRegistry();
  if (!reg) {
    reg = { version: 1, repos: [defaultEntry()] };
    await saveJson(REGISTRY_KEY, reg).catch(() => {});
    return [toRepo(defaultEntry())];
  }
  return reg.repos.map(toRepo);
}

/**
 * 解析仓库标识。
 * - 空/未传 → 默认仓库（兼容旧入口）
 * - 未知 id → null（调用方应返回 404 unknown_repo）
 */
export async function getLibraryRepo(id: string | null | undefined): Promise<LibraryRepo | null> {
  if (id == null || id === "") {
    const reg = await loadRegistry();
    return toRepo(reg?.repos.find((r) => r.id === DEFAULT_ID) ?? defaultEntry());
  }
  if (!ID_RE.test(id)) return null;
  const repos = await listLibraryRepos();
  return repos.find((r) => r.id === id) ?? null;
}

/** 从请求里解析仓库：query `repo` 优先，其次 JSON body 里的 `repo` 字段 */
export async function repoFromRequest(req: Request, repoInBody?: unknown): Promise<LibraryRepo | null> {
  const q = new URL(req.url).searchParams.get("repo");
  const id = q !== null && q !== "" ? q : typeof repoInBody === "string" && repoInBody ? repoInBody : "";
  return await getLibraryRepo(id);
}

/** 校验 git 远端地址：支持 https(s) 与 git@ssh 两种写法，返回建议目录名 */
function parseRemote(url: string): { remote: string; suggestedId: string } | null {
  const t = url.trim();
  if (!t) return null;
  const m = t.match(/^(?:(?:https?:\/\/[^/]+\/)|git@[^:/]+:)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i);
  if (!m) return null;
  let id = m[2].replace(/[^a-zA-Z0-9_-]/g, "");
  if (!ID_RE.test(id)) id = `repo-${Date.now().toString(36)}`;
  return { remote: /\.git$/.test(t) ? t : `${t}.git`, suggestedId: id };
}

export async function addLibraryRepo(
  url: string,
  displayName?: string,
): Promise<{ repo: LibraryRepo; reused: boolean } | { error: string }> {
  const parsed = parseRemote(url);
  if (!parsed) {
    return { error: "无法识别的 git 地址（支持 https://…/owner/repo.git 或 git@…:owner/repo.git）" };
  }
  const name = (displayName ?? "").trim() || parsed.suggestedId;
  if (!ID_RE.test(parsed.suggestedId)) {
    return { error: "推导出的目录名不合法" };
  }
  const reg =
    (await loadRegistry()) ?? { version: 1 as const, repos: [defaultEntry()] };
  if (reg.repos.some((r) => r.id === parsed.suggestedId)) {
    return { error: `仓库已存在（${parsed.suggestedId}）` };
  }
  const home = librariesHome();
  const root = path.join(home, parsed.suggestedId);
  let reused = false;
  try {
    await fs.access(root);
    // 目录已存在：是 git 仓库则直接收编（比如手动 clone 过），否则拒绝
    try {
      await fs.access(path.join(root, ".git"));
      reused = true;
    } catch {
      return { error: `目录已被占用且不是 git 仓库：${root}` };
    }
  } catch {
    await fs.mkdir(home, { recursive: true });
    try {
      await git(home, ["clone", parsed.remote, parsed.suggestedId], 300_000);
    } catch (err) {
      // clone 失败清理半成品目录，避免下次误判"已占用"
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
      return { error: `clone 失败：${(err as Error).message}` };
    }
  }
  reg.repos = [
    ...reg.repos,
    { id: parsed.suggestedId, name, remote: parsed.remote, addedAt: new Date().toISOString() },
  ];
  await saveJson(REGISTRY_KEY, reg);
  return {
    repo: toRepo(reg.repos[reg.repos.length - 1]),
    reused,
  };
}

export async function removeLibraryRepo(id: string): Promise<{ ok: boolean; removedDir?: boolean } | { error: string }> {
  if (!ID_RE.test(id) && id !== DEFAULT_ID) return { error: "invalid id" };
  const reg = await loadRegistry();
  const entry = reg?.repos.find((r) => r.id === id);
  if (!entry) {
    // 默认仓库即使未写入注册表也允许"移除出列表"
    if (id === DEFAULT_ID && reg) {
      reg.defaultsRemoved = true;
      await saveJson(REGISTRY_KEY, reg);
      return { ok: true };
    }
    return { error: "仓库不存在" };
  }
  const repo = toRepo(entry);
  if (reg) {
    reg.repos = reg.repos.filter((r) => r.id !== id);
    await saveJson(REGISTRY_KEY, reg);
  }
  if (id === DEFAULT_ID) {
    // 默认仓库只出列表，不删除目录
    return { ok: true, removedDir: false };
  }
  // 受管仓库：连同本地克隆一起删除（远端 GitHub 不受影响）
  const home = librariesHome();
  const rel = path.relative(home, repo.root);
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
    await fs.rm(repo.root, { recursive: true, force: true }).catch(() => {});
    return { ok: true, removedDir: true };
  }
  return { ok: true, removedDir: false };
}

/** 修改仓库展示名（id 与本地目录名不变） */
export async function renameLibraryRepo(id: string, newName: string): Promise<{ ok: boolean; name: string } | { error: string }> {
  const name = newName.trim();
  if (!name) return { error: "名称不能为空" };
  if (name.length > 100) return { error: "名称过长（最多 100 字符）" };
  let reg = await loadRegistry();
  if (!reg) {
    if (id !== DEFAULT_ID) return { error: "仓库不存在" };
    reg = { version: 1, repos: [defaultEntry()] };
    reg.repos[0].name = name;
    await saveJson(REGISTRY_KEY, reg);
    return { ok: true, name };
  }
  const entry = reg.repos.find((r) => r.id === id);
  if (!entry) {
    // 默认仓库尚未登记注册表（defaultsRemoved=false 但也允许改名：登记进来）
    if (id !== DEFAULT_ID) return { error: "仓库不存在" };
    reg.repos = [defaultEntry(), ...reg.repos];
    reg.repos[0].name = name;
    await saveJson(REGISTRY_KEY, reg);
    return { ok: true, name };
  }
  entry.name = name;
  await saveJson(REGISTRY_KEY, reg);
  return { ok: true, name };
}
