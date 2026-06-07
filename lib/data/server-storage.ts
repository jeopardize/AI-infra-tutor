import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Server-side JSON file storage.
 * Files are stored in `.data/` at the project root, one file per domain key.
 */

function dataDir(): string {
  return path.join(process.cwd(), ".data");
}

function filePath(key: string): string {
  // Sanitize key: only allow alphanumeric, dash, underscore
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(dataDir(), `${safe}.json`);
}

export async function loadJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const fp = filePath(key);
    const raw = await fs.readFile(fp, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`[server-storage] loadJson("${key}") failed:`, err);
    return fallback;
  }
}

export async function saveJson<T>(key: string, data: T): Promise<void> {
  const dir = dataDir();
  await fs.mkdir(dir, { recursive: true });
  const fp = filePath(key);
  try {
    await fs.writeFile(fp, JSON.stringify(data, null, 2), "utf-8");
    console.log(`[server-storage] Saved "${key}" -> ${fp}`);
  } catch (err) {
    console.error(`[server-storage] saveJson("${key}") failed:`, err);
    throw err; // re-throw so callers know it failed
  }
}
