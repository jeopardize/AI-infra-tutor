import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveSafe, scanLibrary } from "@/lib/docs/fs";
import { syncPullNotes, syncPushNotes } from "@/lib/docs/sync";
import { loadFromGit } from "@/lib/data/repo-storage";
import type { DocNode } from "@/lib/docs/fs";
import type { QuestionItem } from "@/lib/storage";

/**
 * 题库文件存储。
 *
 * 规则：
 * - 分类严格对应笔记库中的文件夹，每个文件夹下的 `question.md` 收纳该分类的题目
 * - 无法匹配到分类文件夹的题目放在 `data/other_question.md`，界面归为「其他」
 * - 网页端修改题目分类时，自动把它从原文件（含 other_question.md）移到目标文件夹的 question.md
 */

export const OTHER_CATEGORY = "其他";
export const OTHER_DIR = "data";
export const OTHER_FILE = "data/other_question.md";
const MIGRATED_MARKER = "data/questions-migrated.json";

export type BankQuestion = QuestionItem & { file: string };

// ---------------- question.md 文件格式 ----------------
//
// 每道题一个块：
//   <!--Q id=q-xxx ts=... topic=...-->
//   **问题 (zh)** ...
//   **问题 (en)** ...
//   **答案 (zh)** ...
//   **答案 (en)** ...
//   <!--/Q-->

export interface FileSnapshot {
  preamble: string;
  items: BankQuestion[];
}

const FIELD_LABELS = ["**问题 (zh)**", "**问题 (en)**", "**答案 (zh)**", "**答案 (en)**"] as const;

function fieldBetween(
  text: string,
  label: string,
  nextLabelPos: number,
): string {
  const start = text.indexOf(label);
  if (start < 0) return "";
  return text.slice(start + label.length, nextLabelPos >= 0 ? nextLabelPos : text.length).trim();
}

function parseBlock(block: string): BankQuestion | null {
  const headMatch = block.match(/<!--Q\s+([^>]*?)-->/);
  if (!headMatch) return null;
  const tokens = new Map<string, string>();
  for (const m of headMatch[1].matchAll(/(\w+)=([^\s>]+)/g)) tokens.set(m[1], m[2]);
  const id = tokens.get("id") ?? "q-legacy";
  const ts = Number(tokens.get("ts")) || Date.now();
  const topicId = tokens.get("topic") || undefined;

  const positions = FIELD_LABELS.map((l) => ({ l, i: block.indexOf(l) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i);

  const find = (l: string) => positions.find((p) => p.l === l);
  const nextPos = (label: string) => {
    const idx = positions.findIndex((p) => p.l === label);
    return idx >= 0 && idx + 1 < positions.length ? positions[idx + 1].i : -1;
  };

  const question = {
    zh: fieldBetween(block, "**问题 (zh)**", nextPos("**问题 (zh)**")),
    en: fieldBetween(block, "**问题 (en)**", nextPos("**问题 (en)**")),
  };
  const answer = {
    zh: fieldBetween(block, "**答案 (zh)**", nextPos("**答案 (zh)**")),
    en: fieldBetween(block, "**答案 (en)**", nextPos("**答案 (en)**")),
  };

  if (!question.zh && !question.en && !answer.zh && !answer.en) return null;
  return {
    id,
    createdAt: ts,
    updatedAt: ts,
    topicId,
    question,
    answer,
    category: "",
  } as BankQuestion;
}

export function parseQuestionFile(text: string): FileSnapshot {
  const first = text.indexOf("<!--Q");
  if (first < 0) return { preamble: text, items: [] };
  const preamble = text.slice(0, first);
  const chunks = text.slice(first).split(/(?=<!--Q\s)/);
  const items: BankQuestion[] = [];
  for (const chunk of chunks) {
    if (!chunk.trim().startsWith("<!--Q")) continue;
    const endIdx = chunk.indexOf("<!--/Q-->");
    const block = endIdx >= 0 ? chunk.slice(0, endIdx) : chunk;
    const parsed = parseBlock(block);
    if (parsed) items.push(parsed);
  }
  return { preamble, items };
}

function serializeItem(item: QuestionItem): string {
  const tokens = ["id=" + item.id, "ts=" + item.updatedAt];
  if (item.topicId) tokens.push("topic=" + item.topicId);
  return [
    `<!--Q ${tokens.join(" ")}-->`,
    "",
    "**问题 (zh)**",
    "",
    item.question.zh.trim(),
    "",
    "**问题 (en)**",
    "",
    item.question.en.trim(),
    "",
    "**答案 (zh)**",
    "",
    item.answer.zh.trim(),
    "",
    "**答案 (en)**",
    "",
    item.answer.en.trim(),
    "",
    "<!--/Q-->" + "",
  ]
    .join("\n");
}

function serializeFile(snapshot: FileSnapshot, items: BankQuestion[]): string {
  let out = snapshot.preamble.replace(/\s*$/, "\n\n");
  for (const it of items) {
    out += serializeItem(it) + "\n";
  }
  return out;
}

// ---------------- 分类（笔记库文件夹） ----------------

export interface BankCategory {
  path: string;
  label: string;
  file: string;
}

const CATEGORY_DIR_EXCLUDE = new Set(["images", "assets", "files", "media", "demos", "附件", "图片"]);

function collectDirs(node: DocNode, prefix: string, out: string[]) {
  for (const child of node.children ?? []) {
    if (child.type !== "dir") continue;
    if (child.name.startsWith(".") || CATEGORY_DIR_EXCLUDE.has(child.name)) continue;
    const rel = prefix ? `${prefix}/${child.name}` : child.name;
    if (rel === OTHER_DIR) continue;
    out.push(rel);
    collectDirs(child, rel, out);
  }
}

export async function listCategories(): Promise<BankCategory[]> {
  const tree = await scanLibrary();
  const dirs: string[] = [];
  if (tree) collectDirs(tree, "", dirs);
  const cats: BankCategory[] = dirs.map((d) => ({
    path: d,
    label: d.split("/").pop() ?? d,
    file: `${d}/question.md`,
  }));
  cats.push({ path: OTHER_DIR, label: OTHER_CATEGORY, file: OTHER_FILE });
  return cats;
}

async function readFileSnapshot(fileRel: string): Promise<FileSnapshot> {
  const abs = resolveSafe(fileRel);
  if (!abs) return { preamble: "", items: [] };
  try {
    return parseQuestionFile(await fs.readFile(abs, "utf-8"));
  } catch {
    return { preamble: "", items: [] };
  }
}

async function writeFileSnapshot(fileRel: string, snapshot: FileSnapshot, items: BankQuestion[]): Promise<void> {
  const abs = resolveSafe(fileRel);
  if (!abs) throw new Error(`invalid path: ${fileRel}`);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, serializeFile(snapshot, items), "utf-8");
}

// ---------------- 读取 ----------------

export async function loadQuestionBank(): Promise<{
  categories: BankCategory[];
  questions: BankQuestion[];
}> {
  await syncPullNotes();
  const categories = await listCategories();
  const questions: BankQuestion[] = [];
  for (const cat of categories) {
    const { items } = await readFileSnapshot(cat.file);
    for (const it of items) {
      questions.push({ ...it, category: cat.label === OTHER_CATEGORY ? OTHER_CATEGORY : cat.label, file: cat.file });
    }
  }
  return { categories, questions };
}

// ---------------- 遗留 JSON 题库迁移 ----------------

export async function migrateLegacyBankIfNeeded(): Promise<void> {
  const markerAbs = resolveSafe(MIGRATED_MARKER);
  if (markerAbs) {
    try {
      await fs.access(markerAbs);
      return;
    } catch {
      // 尚未迁移
    }
  }
  const legacy = await loadFromGit<QuestionItem[]>("question-bank", []);
  if (legacy.length === 0) {
    if (markerAbs) {
      await fs.mkdir(path.dirname(markerAbs), { recursive: true });
      await fs.writeFile(markerAbs, JSON.stringify({ at: Date.now(), imported: 0 }), "utf-8");
      await syncPushNotes("questions: mark legacy bank migration (empty)");
    }
    return;
  }

  const tree = await scanLibrary();
  const dirs: string[] = [];
  if (tree) collectDirs(tree, "", dirs);

  for (const item of legacy) {
    const dirName = item.category?.trim();
    const targetDir = dirName
      ? dirs.find((d) => d === dirName || d.split("/").pop() === dirName)
      : undefined;
    await upsertQuestion(
      { ...item, category: targetDir ? targetDir.split("/").pop()! : OTHER_CATEGORY },
      targetDir ? `${targetDir}/question.md` : OTHER_FILE,
      { deferSync: true },
    );
  }

  if (markerAbs) {
    await fs.mkdir(path.dirname(markerAbs), { recursive: true });
    await fs.writeFile(
      markerAbs,
      JSON.stringify({ at: Date.now(), imported: legacy.length }),
      "utf-8",
    );
  }
  await syncPushNotes(`questions: migrate legacy bank (${legacy.length} items)`);
}

// ---------------- 写入 ----------------

async function removeFromFile(fileRel: string, id: string, deferSync?: boolean): Promise<boolean> {
  const snap = await readFileSnapshot(fileRel);
  const next = snap.items.filter((q) => q.id !== id);
  if (next.length === snap.items.length) return false;
  await writeFileSnapshot(fileRel, snap, next);
  if (!deferSync) {
    await syncPushNotes(`questions: remove ${id} from ${fileRel}`);
  }
  return true;
}

/**
 * 保存题目。分类取自 category（笔记库文件夹名）；
 * prevFile 是题目原所在文件（如 data/other_question.md），与新分类文件不同时自动移动。
 */
export async function upsertQuestion(
  item: QuestionItem,
  prevFile?: string,
  opts?: { deferSync?: boolean },
): Promise<{ file: string; id: string }> {
  if (!opts?.deferSync) await syncPullNotes();
  const now = Date.now();
  const saved: BankQuestion = {
    id: item.id || `q-${now}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: item.createdAt || now,
    updatedAt: now,
    topicId: item.topicId,
    question: { zh: item.question.zh, en: item.question.en },
    answer: { zh: item.answer.zh, en: item.answer.en },
    category: item.category,
    file: "",
  };

  const cats = await listCategories();
  const cat =
    saved.category === OTHER_CATEGORY
      ? cats.find((c) => c.path === OTHER_DIR)!
      : cats.find((c) => c.label === saved.category || c.path === saved.category);
  if (!cat) {
    throw new Error(`笔记库中不存在分类文件夹：${saved.category}`);
  }
  const targetFile = cat.file;

  if (prevFile && prevFile !== targetFile) {
    await removeFromFile(prevFile, saved.id, opts?.deferSync);
  }

  const snap = await readFileSnapshot(targetFile);
  const idx = snap.items.findIndex((q) => q.id === saved.id);
  if (idx >= 0) {
    saved.createdAt = snap.items[idx].createdAt || saved.createdAt;
    saved.topicId = snap.items[idx].topicId;
    snap.items[idx] = saved;
  } else {
    snap.items.unshift(saved);
  }
  await writeFileSnapshot(targetFile, snap, snap.items);
  if (opts?.deferSync) return { file: targetFile, id: saved.id };
  await syncPushNotes(`questions: upsert ${saved.id} in ${targetFile}`);
  return { file: targetFile, id: saved.id };
}

export async function deleteBankQuestion(id: string, file?: string): Promise<boolean> {
  if (file) return removeFromFile(file, id);
  await syncPullNotes();
  const { questions } = await loadQuestionBank();
  const found = questions.find((q) => q.id === id);
  if (!found) return false;
  return removeFromFile(found.file, id);
}

/**
 * 调整某个 question.md 内题目的顺序（网页端拖动排序）。
 * orderedIds 是期望的完整顺序；未出现在其中的题目按原相对顺序追加到末尾。
 */
export async function reorderQuestionFile(
  file: string,
  orderedIds: string[],
): Promise<boolean> {
  await syncPullNotes();
  const snap = await readFileSnapshot(file);
  if (snap.items.length === 0) return false;
  const rank = new Map<string, number>();
  orderedIds.forEach((id, i) => {
    if (!rank.has(id)) rank.set(id, i);
  });
  const known = snap.items.filter((q) => rank.has(q.id));
  const rest = snap.items.filter((q) => !rank.has(q.id));
  known.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  const next = [...known, ...rest];
  if (next.every((q, i) => q.id === snap.items[i].id)) return true;
  await writeFileSnapshot(file, snap, next);
  await syncPushNotes(`questions: reorder ${file} (${next.length} items)`);
  return true;
}
