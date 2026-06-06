import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/** 笔记库根目录。默认 ~/Documents/knowlege_library，可用环境变量覆盖。 */
export function libraryRoot(): string {
  const fromEnv = process.env.KNOWLEDGE_LIBRARY_PATH;
  if (fromEnv && fromEnv.trim()) return path.resolve(fromEnv);
  return path.join(os.homedir(), "Documents", "knowlege_library");
}

/**
 * 把用户传入的相对路径安全解析为绝对路径。
 * 防止路径穿越：解析后必须仍在 libraryRoot 之内。
 */
export function resolveSafe(relPath: string): string | null {
  const root = libraryRoot();
  // 拒绝绝对路径
  if (path.isAbsolute(relPath)) return null;
  const abs = path.resolve(root, relPath);
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return abs;
}

export interface DocNode {
  name: string;
  /** 相对于 libraryRoot 的 POSIX 风格路径 */
  path: string;
  type: "dir" | "file";
  /** 仅 file：扩展名（含点，小写） */
  ext?: string;
  children?: DocNode[];
}

const IGNORE = new Set([".git", ".DS_Store", "node_modules", ".obsidian"]);

export async function scanLibrary(): Promise<DocNode | null> {
  const root = libraryRoot();
  try {
    await fs.access(root);
  } catch {
    return null;
  }
  return await walk(root, "");
}

async function walk(absDir: string, relDir: string): Promise<DocNode> {
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  const children: DocNode[] = [];
  for (const e of entries) {
    if (IGNORE.has(e.name)) continue;
    const rel = relDir ? `${relDir}/${e.name}` : e.name;
    const abs = path.join(absDir, e.name);
    if (e.isDirectory()) {
      const sub = await walk(abs, rel);
      // 跳过完全没有可见文件的目录（避免一大堆空文件夹）
      if ((sub.children?.length ?? 0) > 0) children.push(sub);
    } else if (e.isFile()) {
      children.push({
        name: e.name,
        path: rel,
        type: "file",
        ext: path.extname(e.name).toLowerCase(),
      });
    }
  }
  // 目录在前，文件在后；同类按名字排
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, "zh");
  });
  return {
    name: relDir ? path.basename(relDir) : path.basename(absDir),
    path: relDir,
    type: "dir",
    children,
  };
}
