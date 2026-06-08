import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Server-side JSON file storage.
 * Files are stored in a dedicated data directory (configurable via env var),
 * separate from the code repository for safe updates.
 *
 * Default: ~/Documents/ai-infra-tutor-data
 * Custom: Set DATA_DIR in .env.local
 */

function dataDir(): string {
  const envPath = process.env.DATA_DIR;
  if (envPath) {
    // Support ~ expansion
    return envPath.startsWith("~")
      ? path.join(os.homedir(), envPath.slice(1))
      : envPath;
  }
  // Default: ~/Documents/ai-infra-tutor-data
  return path.join(os.homedir(), "Documents", "ai-infra-tutor-data");
}

function filePath(key: string): string {
  // Sanitize key: only allow alphanumeric, dash, underscore
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(dataDir(), `${safe}.json`);
}

export async function loadJson<T>(key: string, fallback: T): Promise<T> {
  // Automatically migrate from old location if needed
  await migrateFromOldLocation(key);

  try {
    const fp = filePath(key);
    const raw = await fs.readFile(fp, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`[server-storage] loadJson("${key}") failed:`, err);
    }
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

/**
 * Migrate data from old `.data/` directory to new location.
 * Called automatically when loading data.
 */
async function migrateFromOldLocation(key: string): Promise<void> {
  const oldPath = path.join(process.cwd(), ".data", `${key.replace(/[^a-zA-Z0-9_-]/g, "")}.json`);
  const newPath = filePath(key);

  try {
    // Check if old file exists
    await fs.access(oldPath);

    // Check if new file already exists
    try {
      await fs.access(newPath);
      console.log(`[server-storage] Migration skipped for "${key}": new file already exists`);
      return;
    } catch {
      // New file doesn't exist, proceed with migration
    }

    // Read old file and save to new location
    const data = await fs.readFile(oldPath, "utf-8");
    const dir = dataDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(newPath, data, "utf-8");
    console.log(`[server-storage] Migrated "${key}": ${oldPath} -> ${newPath}`);
  } catch (err) {
    // Old file doesn't exist or migration failed, no problem
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`[server-storage] Migration warning for "${key}":`, err);
    }
  }
}
