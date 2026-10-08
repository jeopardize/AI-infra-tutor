"use client";

import { useState } from "react";
import { FolderPlus, Loader2 } from "lucide-react";

/** 在题库页面直接新建分类文件夹（对应笔记库目录），成功后回调刷新 */
export function NewFolderButton({
  parentPath,
  onCreated,
}: {
  parentPath: string;
  onCreated: (path: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const target = parentPath ? `${parentPath}/${trimmed}` : trimmed;
      const res = await fetch("/api/docs/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: target }),
      });
      if (res.ok) {
        setName("");
        setEditing(false);
        onCreated(target);
      } else {
        const json = (await res.json()) as { error?: string };
        alert(json.error ?? "创建失败");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-1.5 flex items-center gap-1 text-xs text-zinc-500 hover:text-blue-600 px-1.5 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 w-full"
      >
        <FolderPlus className="w-3.5 h-3.5" />
        {parentPath ? `在 ${parentPath} 下新建文件夹` : "新建文件夹"}
      </button>
    );
  }

  return (
    <div className="mt-1.5 flex items-center gap-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void create();
          if (e.key === "Escape") setEditing(false);
        }}
        placeholder="文件夹名（可含 / 建子目录）"
        className="flex-1 min-w-0 px-2 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        onClick={create}
        disabled={busy || !name.trim()}
        className="px-2 py-1 text-xs rounded-md bg-blue-600 text-white disabled:opacity-40"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "确定"}
      </button>
      <button
        onClick={() => setEditing(false)}
        className="px-2 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700"
      >
        取消
      </button>
    </div>
  );
}
