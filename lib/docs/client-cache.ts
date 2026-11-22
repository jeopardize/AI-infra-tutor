/**
 * 客户端会话缓存（反馈：笔记库来回切页面后不要重新拉取和刷新）。
 * 模块级 Map（本会话内存）+ sessionStorage 持久（刷新/新标签也能命中）。
 * 只存小体积 JSON；超出上限静默丢弃（try/catch 兜配额）。
 */

const mem = new Map<string, unknown>();

const MAX_JSON_LEN = 400_000;

export function cacheGetJSON<T>(key: string): T | null {
  if (mem.has(key)) return mem.get(key) as T;
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as T;
    mem.set(key, v);
    return v;
  } catch {
    return null;
  }
}

export function cacheSetJSON(key: string, value: unknown): void {
  mem.set(key, value);
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify(value);
    if (raw.length > MAX_JSON_LEN) return;
    sessionStorage.setItem(key, raw);
  } catch {
    /* 配额满/不可用：忽略，内存缓存仍有效 */
  }
}
