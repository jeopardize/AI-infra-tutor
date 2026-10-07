"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FolderTree } from "lucide-react";

export const OTHER_CATEGORY = "其他";
export const OTHER_DIR = "data";
export const OTHER_FILE = "data/other_question.md";

export interface TreeCategory {
  path: string;
  label: string;
  file: string;
}

interface TNode {
  name: string;
  path: string;
  file: string;
  children: TNode[];
  count: number;
}

function buildTree(categories: TreeCategory[], countOf: (path: string) => number): TNode[] {
  const byPath = new Map<string, TNode>();
  for (const c of categories) {
    byPath.set(c.path, {
      name: c.label,
      path: c.path,
      file: c.file,
      children: [],
      count: countOf(c.path),
    });
  }
  const roots: TNode[] = [];
  for (const c of categories) {
    const node = byPath.get(c.path)!;
    const parent = c.path.includes("/") ? c.path.slice(0, c.path.lastIndexOf("/")) : "";
    if (parent && byPath.has(parent)) {
      byPath.get(parent)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const merge = (n: TNode): TNode => {
    n.children.sort((a, b) => a.name.localeCompare(b.name, "zh"));
    return n;
  };
  return roots.map(merge);
}

function TreeNodeView({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: TNode;
  depth: number;
  selected: string;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const isSel = selected === node.path;
  return (
    <li>
      <div
        className={`flex items-center gap-1 rounded-md px-1.5 py-1 cursor-pointer text-xs ${
          isSel
            ? "bg-blue-600 text-white"
            : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
        }`}
        style={{ paddingLeft: depth * 12 + 6 }}
        onClick={() => onSelect(node.path)}
      >
        {node.children.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className="p-0.5 hover:text-blue-600"
            title={open ? "收起" : "展开"}
          >
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <FolderTree className="w-3 h-3 shrink-0 opacity-60" />
        <span className="truncate">{node.name}</span>
        <span className={`ml-auto text-[10px] ${isSel ? "text-blue-100" : "text-zinc-400"}`}>
          {node.count}
        </span>
      </div>
      {open && node.children.length > 0 && (
        <ul>
          {node.children.map((c) => (
            <TreeNodeView
              key={c.path}
              node={c}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function CategoryTree({
  categories,
  countOf,
  selected,
  onSelect,
}: {
  categories: TreeCategory[];
  countOf: (path: string) => number;
  selected: string;
  onSelect: (path: string) => void;
}) {
  const tree = useMemo(() => buildTree(categories, countOf), [categories, countOf]);
  const other = categories.find((c) => c.path === OTHER_DIR);

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50 dark:bg-zinc-950/60 p-2 text-sm">
      <div
        className={`flex items-center gap-1 rounded-md px-1.5 py-1 cursor-pointer text-xs ${
          selected === ""
            ? "bg-blue-600 text-white"
            : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
        }`}
        onClick={() => onSelect("")}
      >
        <span className="w-4" />
        <span>全部分类</span>
      </div>
      <ul>
        {tree.map((n) => (
          <TreeNodeView key={n.path} node={n} depth={0} selected={selected} onSelect={onSelect} />
        ))}
      </ul>
      {other && (
        <div
          className={`flex items-center gap-1 rounded-md px-1.5 py-1 cursor-pointer text-xs mt-1 ${
            selected === OTHER_DIR
              ? "bg-amber-500 text-white"
              : "hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-700 dark:text-amber-300"
          }`}
          onClick={() => onSelect(OTHER_DIR)}
        >
          <span className="w-4" />
          <FolderTree className="w-3 h-3 shrink-0 opacity-60" />
          <span>其他（data/other_question.md）</span>
          <span className="ml-auto text-[10px] opacity-70">{countOf(OTHER_DIR)}</span>
        </div>
      )}
    </div>
  );
}
