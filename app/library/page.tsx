"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  FileText,
  FilePlus,
  Folder,
  FolderPlus,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { DocDrawer } from "@/components/DocDrawer";
import { useT } from "@/lib/i18n/context";

interface DocNode {
  name: string;
  path: string;
  type: "dir" | "file";
  ext?: string;
  children?: DocNode[];
}

interface TreeResp {
  root: string;
  tree: DocNode;
  error?: string;
  hint?: string;
}

export default function LibraryPage() {
  const t = useT();
  const [data, setData] = useState<TreeResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openPath, setOpenPath] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    fetch("/api/docs/tree")
      .then(async (r) => {
        const json = (await r.json()) as TreeResp;
        if (!r.ok) {
          setErr(json.hint || json.error || "未知错误");
          setData(null);
        } else {
          setData(json);
        }
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function createFile(parentPath: string) {
    const name = window.prompt(t.library.newFilePrompt(parentPath));
    if (!name) return;
    if (/[\\/<>:"|?*\0]/.test(name)) {
      alert(t.library.invalidFilename);
      return;
    }
    const filename = /\.(md|markdown)$/i.test(name) ? name : `${name}.md`;
    const fullPath = parentPath ? `${parentPath}/${filename}` : filename;
    const r = await fetch("/api/docs/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: fullPath }),
    });
    const json = await r.json();
    if (!r.ok) {
      alert(t.library.createFailed(json.error));
      return;
    }
    load();
    setOpenPath(fullPath); // 自动打开编辑
  }

  async function createDir(parentPath: string) {
    const name = window.prompt(t.library.newDirPrompt(parentPath));
    if (!name) return;
    if (/[\\/<>:"|?*\0]/.test(name)) {
      alert(t.library.invalidDirname);
      return;
    }
    const fullPath = parentPath ? `${parentPath}/${name}` : name;
    const r = await fetch("/api/docs/mkdir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: fullPath }),
    });
    const json = await r.json();
    if (!r.ok) {
      alert(t.library.createFailed(json.error));
      return;
    }
    load();
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">{t.library.title}</h1>
          <p className="text-zinc-500 text-sm mt-1">{t.library.subtitle}</p>
        </div>
        <button
          onClick={load}
          className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1"
        >
          <RefreshCw className="w-3.5 h-3.5" /> {t.common.refresh}
        </button>
      </div>

      {data?.root && (
        <div className="text-xs text-zinc-500 mb-3 font-mono">{data.root}</div>
      )}

      {loading && (
        <div className="text-zinc-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> {t.library.scanning}
        </div>
      )}

      {err && (
        <div className="text-rose-600 text-sm">
          ⚠️ {err}
          <div className="text-xs text-zinc-500 mt-1">{t.library.setEnvHint}</div>
        </div>
      )}

      {data?.tree && (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-3">
          <Tree
            node={data.tree}
            depth={0}
            onOpen={setOpenPath}
            onNewFile={createFile}
            onNewDir={createDir}
          />
        </div>
      )}

      <DocDrawer
        docPath={openPath}
        onClose={() => setOpenPath(null)}
        onSaved={() => load()}
      />
    </div>
  );
}

function Tree({
  node,
  depth,
  onOpen,
  onNewFile,
  onNewDir,
}: {
  node: DocNode;
  depth: number;
  onOpen: (p: string) => void;
  onNewFile: (parent: string) => void;
  onNewDir: (parent: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(depth < 1);
  const [hover, setHover] = useState(false);
  if (node.type === "file") {
    const isMd = node.ext === ".md" || node.ext === ".markdown";
    const isImg = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(
      node.ext ?? "",
    );
    return (
      <button
        onClick={() => isMd && onOpen(node.path)}
        disabled={!isMd}
        title={isMd ? t.library.clickToOpen : t.library.notPreviewable}
        style={{ paddingLeft: 12 + depth * 16 }}
        className={
          "w-full text-left py-1 text-sm rounded flex items-center gap-1.5 " +
          (isMd
            ? "text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
            : "text-zinc-400 cursor-default")
        }
      >
        <FileText className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{node.name}</span>
        {isImg && <span className="text-[10px] text-zinc-400">img</span>}
      </button>
    );
  }
  const childrenCount = node.children?.length ?? 0;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        style={{ paddingLeft: 12 + depth * 16 }}
        className="group flex items-center gap-1 py-1 text-sm rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 flex-1 min-w-0 font-medium text-left"
        >
          <ChevronRight
            className={
              "w-3.5 h-3.5 shrink-0 transition-transform " +
              (open ? "rotate-90" : "")
            }
          />
          <Folder className="w-3.5 h-3.5 shrink-0 text-amber-500" />
          <span className="truncate">{node.name || "/"}</span>
          <span className="text-[10px] text-zinc-400">({childrenCount})</span>
        </button>
        <div
          className={
            "flex items-center gap-0.5 pr-1 transition-opacity " +
            (hover ? "opacity-100" : "opacity-0")
          }
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNewFile(node.path);
            }}
            title={t.library.newFile}
            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
          >
            <FilePlus className="w-3.5 h-3.5 text-blue-600" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNewDir(node.path);
            }}
            title={t.library.newDir}
            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
          >
            <FolderPlus className="w-3.5 h-3.5 text-amber-600" />
          </button>
        </div>
      </div>
      {open && node.children && (
        <div>
          {node.children.map((c) => (
            <Tree
              key={c.path}
              node={c}
              depth={depth + 1}
              onOpen={onOpen}
              onNewFile={onNewFile}
              onNewDir={onNewDir}
            />
          ))}
        </div>
      )}
    </div>
  );
}
