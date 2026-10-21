"use client";

import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ChevronRight,
  CloudDownload,
  FileText,
  FilePlus,
  Folder,
  FolderPlus,
  Loader2,
  Pencil,
  PanelLeft,
  RefreshCw,
} from "lucide-react";
import { DocPane } from "@/components/doc/DocPane";
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

/** 笔记树拖拽负载（dataTransfer 中存放源条目相对路径） */
const DRAG_TYPE = "application/x-library-node";

/** 序号前缀排序：带数字序号的在前（按数字升序，同级序号可比），无序号的殿后（按名称） */
function extractPrefixNum(name: string): { num: number | null; rest: string } {
  const m = name.trim().match(/^(\d+)[\s.、\-_]+(.*)$/);
  if (m) return { num: parseInt(m[1], 10), rest: m[2] ?? "" };
  return { num: null, rest: name.trim() };
}

const TREE_WIDTH_KEY = "doc-library-tree-width";
const TREE_DEFAULT_WIDTH = 280;

function sortNodes(nodes: DocNode[]): DocNode[] {
  const sorted = [...nodes].sort((a, b) => {
    const pa = extractPrefixNum(a.name);
    const pb = extractPrefixNum(b.name);
    if (pa.num !== null && pb.num !== null) {
      if (pa.num !== pb.num) return pa.num - pb.num;
      return pa.rest.localeCompare(pb.rest, "zh");
    }
    if (pa.num !== null) return -1;
    if (pb.num !== null) return 1;
    return pa.rest.localeCompare(pb.rest, "zh");
  });
  return sorted;
}

export default function LibraryPage() {
  const t = useT();
  const [data, setData] = useState<TreeResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  // 左右分栏：左侧目录树宽度/展开状态（反馈：页面本身为左右界面，目录可伸缩可调宽）
  const [treeWidth, setTreeWidth] = useState<number | null>(null);
  const [treeOpen, setTreeOpen] = useState(true);

  useEffect(() => {
    const w = Number(localStorage.getItem(TREE_WIDTH_KEY));
    if (Number.isFinite(w) && w >= 160) setTreeWidth(w);
    setTreeOpen(window.innerWidth >= 640);
  }, []);

  // ---------- 目录树宽度拖动（右缘分隔条） ----------
  function startTreeResize(e: ReactPointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = treeWidth ?? TREE_DEFAULT_WIDTH;
    function onMove(ev: globalThis.PointerEvent) {
      const w = Math.min(
        window.innerWidth * 0.6,
        Math.max(160, startW + (ev.clientX - startX)),
      );
      setTreeWidth(w);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setTreeWidth((w) => {
        if (w) localStorage.setItem(TREE_WIDTH_KEY, String(w));
        return w;
      });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

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

  /** 从 GitHub 重新拉取笔记内容，完成后刷新树 */
  async function pullFromGithub() {
    if (pulling) return;
    setPulling(true);
    try {
      const r = await fetch("/api/docs/pull", { method: "POST" });
      const json = (await r.json()) as {
        error?: string;
        mode?: "ff" | "reset" | "unchanged";
        detail?: string;
      };
      if (!r.ok) {
        alert(`拉取失败：${json.error}`);
        return;
      }
      if (json.mode === "reset" && json.detail) {
        alert(json.detail);
      }
    } catch (e) {
      alert(`拉取失败：${(e as Error).message}`);
    } finally {
      setPulling(false);
      load();
    }
  }

  async function renameNode(node: DocNode) {
    const newName = window.prompt(`重命名「${node.name}」为：`, node.name);
    if (!newName || newName.trim() === node.name) return;
    if (/[\\<>:"|?*\0/]/.test(newName.trim())) {
      alert("名称包含非法字符");
      return;
    }
    const r = await fetch("/api/docs/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: node.path, newName: newName.trim() }),
    });
    const json = await r.json();
    if (!r.ok) {
      alert(`重命名失败：${json.error}`);
      return;
    }
    load();
  }

  /** 拖动文件/文件夹到目标文件夹：修改所属目录 */
  async function moveNode(srcPath: string, targetDir: string) {
    if (targetDir === srcPath || targetDir.startsWith(`${srcPath}/`)) return;
    const r = await fetch("/api/docs/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: srcPath, targetDir }),
    });
    const json = (await r.json()) as { error?: string; noop?: boolean };
    if (!r.ok) {
      alert(`移动失败：${json.error}`);
      return;
    }
    // 若抽屉正打开被移动的文档，先关闭（路径已失效）
    setOpenPath((p) => (p && (p === srcPath || p.startsWith(`${srcPath}/`)) ? null : p));
    load();
  }

  // 绑定刷新快捷键：Ctrl/Cmd + R
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") {
        // 仅在没有输入框聚焦时触发表单外刷新
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
          return;
        }
        e.preventDefault();
        load();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [load]);

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
    <div className="h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden">
      {/* 顶部工具条 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setTreeOpen((v) => !v)}
            title={treeOpen ? "收起目录" : "展开目录"}
            className="p-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </button>
          <h1 className="text-base font-bold truncate">{t.library.title}</h1>
          <span className="text-xs text-zinc-400 hidden md:inline truncate">
            {t.library.subtitle}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={pullFromGithub}
            disabled={pulling}
            title="从 GitHub 拉取最新笔记"
            className="px-2.5 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1"
          >
            {pulling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CloudDownload className="w-3.5 h-3.5" />
            )}
            拉取
          </button>
          <button
            onClick={load}
            title={t.library.refreshShortcutHint}
            className="px-2.5 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> {t.common.refresh}
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-400 rounded border border-zinc-200 dark:border-zinc-700 ml-0.5">
              {t.library.refreshShortcutKey}
            </kbd>
          </button>
        </div>
      </div>

      {/* 左右分栏（反馈：页面本身为左右界面——左目录、右文档） */}
      <div className="flex-1 flex min-h-0">
        {/* 左：目录树（可伸缩/可调宽） */}
        {treeOpen && (
          <div
            className="h-full overflow-y-auto overflow-x-hidden border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 shrink-0 relative"
            style={{ width: treeWidth ?? TREE_DEFAULT_WIDTH }}
          >
            {loading && (
              <div className="text-zinc-500 flex items-center gap-2 p-3 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> {t.library.scanning}
              </div>
            )}
            {err && (
              <div className="text-rose-600 text-sm p-3">
                ⚠️ {err}
                <div className="text-xs text-zinc-500 mt-1">{t.library.setEnvHint}</div>
              </div>
            )}
            {data?.root && (
              <div className="text-[10px] text-zinc-400 font-mono px-3 pt-2 pb-1 truncate" title={data.root}>
                {data.root}
              </div>
            )}
            {data?.tree && (
              <div className="px-1.5 pb-3">
                <Tree
                  node={data.tree}
                  depth={0}
                  onOpen={setOpenPath}
                  onNewFile={createFile}
                  onNewDir={createDir}
                  onRename={renameNode}
                  onMoveNode={moveNode}
                />
              </div>
            )}
            {/* 右缘分隔条：拖动调整目录宽度 */}
            <div
              onPointerDown={startTreeResize}
              className="absolute top-0 right-0 h-full w-1.5 cursor-ew-resize hover:bg-blue-500/30"
              title="拖动调整目录宽度"
            />
          </div>
        )}

        {/* 右：文档内容（多标签） */}
        <div className="flex-1 min-w-0 h-full">
          <DocPane
            docPath={openPath}
            onClose={() => setOpenPath(null)}
            onSaved={() => load()}
            placeholder={
              <div className="h-full flex flex-col items-center justify-center gap-2 text-zinc-400 text-sm">
                <FileText className="w-8 h-8" />
                从左侧目录选择一个文档打开
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
}

function Tree({
  node,
  depth,
  onOpen,
  onNewFile,
  onNewDir,
  onRename,
  onMoveNode,
}: {
  node: DocNode;
  depth: number;
  onOpen: (p: string) => void;
  onNewFile: (parent: string) => void;
  onNewDir: (parent: string) => void;
  onRename: (node: DocNode) => void;
  onMoveNode: (srcPath: string, targetDir: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(depth < 1);
  const [hover, setHover] = useState(false);
  const [dropActive, setDropActive] = useState(false);
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
        onContextMenu={(e) => {
          e.preventDefault();
          onRename(node);
        }}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, node.path);
          e.dataTransfer.effectAllowed = "move";
        }}
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
        className={
          "group flex items-center gap-1 py-1 text-sm rounded " +
          (dropActive
            ? "bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-400"
            : "hover:bg-zinc-100 dark:hover:bg-zinc-800")
        }
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropActive(false);
          const src = e.dataTransfer.getData(DRAG_TYPE);
          if (!src || src === node.path || src.startsWith(`${node.path}/`)) return;
          onMoveNode(src, node.path);
        }}
        title="可将文件/文件夹拖到这里"
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 flex-1 min-w-0 font-medium text-left"
          onContextMenu={(e) => {
            e.preventDefault();
            onRename(node);
          }}
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRename(node);
            }}
            title="重命名"
            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
          >
            <Pencil className="w-3.5 h-3.5 text-zinc-500" />
          </button>
        </div>
      </div>
      {open && node.children && (
        <div>
          {sortNodes(node.children).map((c) => (
            <Tree
              key={c.path}
              node={c}
              depth={depth + 1}
              onOpen={onOpen}
              onNewFile={onNewFile}
              onNewDir={onNewDir}
              onRename={onRename}
              onMoveNode={onMoveNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}
