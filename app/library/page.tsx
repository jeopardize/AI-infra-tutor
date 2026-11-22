"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowLeft,
  ChevronRight,
  ChevronsDownUp,
  CloudDownload,
  FileDown,
  FileText,
  FilePlus,
  FileUp,
  Folder,
  FolderGit2,
  FolderPlus,
  Loader2,
  Pencil,
  PanelLeft,
  Plus,
  RefreshCw,
  Columns2,
  Trash2,
  X,
} from "lucide-react";
import { DocPane, type DocPaneApi } from "@/components/doc/DocPane";
import { useT } from "@/lib/i18n/context";
import { cacheGetJSON, cacheSetJSON } from "@/lib/docs/client-cache";

interface DocNode {
  name: string;
  path: string;
  type: "dir" | "file";
  ext?: string;
  children?: DocNode[];
}

interface TreeResp {
  repo?: string;
  root: string;
  tree: DocNode;
  error?: string;
  hint?: string;
}

/** /api/docs/repos 列表项 */
interface LibraryRepoMeta {
  id: string;
  name: string;
  remote: string;
  root: string;
  managed: boolean;
  addedAt?: string;
  exists: boolean;
  isRepo: boolean;
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
const SPLIT_RATIO_KEY = "doc-library-split-ratio";
const TREE_DEFAULT_WIDTH = 280;
/** 当前选择的笔记仓库标识（多仓库；缺省进入仓库选择页） */
const REPO_KEY = "doc-library-repo-id";
const REPO_DEFAULT_ID = "default";
/** 右键菜单项（反馈：目录树右键现在只有重命名，新增删除/新建入口） */
type MenuAction = "rename" | "delete" | "newFile" | "newDir";

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
  // 分屏：右侧独立文档栏（md+md / pdf+md / 图片+md 等任意组合）
  const [rightPath, setRightPath] = useState<string | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [focused, setFocused] = useState<"left" | "right">("left");
  // 分屏比例（左栏宽度百分比，可拖动调节）
  const [splitRatio, setSplitRatio] = useState(50);
  const splitBoxRef = useRef<HTMLDivElement>(null);
  const [pulling, setPulling] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  // 左右分栏：左侧目录树宽度/展开状态（反馈：页面本身为左右界面，目录可伸缩可调宽）
  const [treeWidth, setTreeWidth] = useState<number | null>(null);
  const [treeOpen, setTreeOpen] = useState(true);
  // URL 导入 PDF 对话框
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importDir, setImportDir] = useState("");
  const [importName, setImportName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  // 目录树：全部收起信号（每次 +1 触发所有节点折叠）；右键菜单
  const [collapseTick, setCollapseTick] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number; node: DocNode } | null>(null);
  /** 分屏标签跨栏拖拽：两栏 DocPane 的 API */
  const leftApiRef = useRef<DocPaneApi | null>(null);
  const rightApiRef = useRef<DocPaneApi | null>(null);

  // ---------- 多仓库 ----------
  const [repos, setRepos] = useState<LibraryRepoMeta[] | null>(null);
  const [reposLoading, setReposLoading] = useState(true);
  /** 当前进入的仓库；null = 停留在仓库选择页 */
  const [repoId, setRepoId] = useState<string | null>(null);
  const [repoBusyId, setRepoBusyId] = useState<string | null>(null);
  const [repoForm, setRepoForm] = useState({ name: "", url: "" });
  const [addingRepo, setAddingRepo] = useState(false);
  const [repoMsg, setRepoMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  /** 已做过会话快照恢复的仓库（每个仓库只恢复一次） */
  const restoredRepoRef = useRef<string | null>(null);

  /** 另一栏拖来一个标签 → 本栏打开 + 源栏静默移除（未保存提示确认） */
  const adoptInto = useCallback(
    (pane: "left" | "right") => (path: string) => {
      if (!splitOpen || focused !== pane) setFocused(pane);
      if (pane === "left") setOpenPath(path);
      else setRightPath(path);
      const srcApi = pane === "left" ? rightApiRef.current : leftApiRef.current;
      const dstApi = pane === "left" ? leftApiRef.current : rightApiRef.current;
      if (srcApi && srcApi.hasTab(path)) {
        // 未保存的修改在移动时会跟到新栏？当前会话标签内容存于源栏，静默移除会丢未存改动 → 提示
        if (srcApi.hasUnsaved(path) && !window.confirm(t.library.moveUnsavedConfirm)) return;
        srcApi.closeTab(path, { silent: true });
      }
      void dstApi;
    },
    [splitOpen, focused, t],
  );

  const refreshRepos = useCallback(async (): Promise<LibraryRepoMeta[]> => {
    try {
      const r = await fetch("/api/docs/repos");
      const json = (await r.json()) as { repos?: LibraryRepoMeta[] };
      const list = json.repos ?? [];
      setRepos(list);
      cacheSetJSON("doc-repos", list);
      return list;
    } catch {
      setRepos([]);
      return [];
    } finally {
      setReposLoading(false);
    }
  }, []);

  // 初次挂载：读取上次选择的仓库 + 拉取仓库列表；之后每次变化写快照
  useEffect(() => {
    const saved = localStorage.getItem(REPO_KEY);
    // 会话缓存（反馈：切页面回来不要重新拉取）：先立即恢复列表，后台静默校验
    const cachedRepos = cacheGetJSON<LibraryRepoMeta[]>("doc-repos");
    if (cachedRepos) {
      setRepos(cachedRepos);
      setReposLoading(false);
    }
    refreshRepos().then((list) => {
      if (saved && list.some((r) => r.id === saved)) setRepoId(saved);
      else if (saved) localStorage.removeItem(REPO_KEY);
    });
  }, [refreshRepos]);

  /** 选定仓库后（每个仓库只做一次）恢复上次离开时的打开状态 */
  useEffect(() => {
    if (!repoId || restoredRepoRef.current === repoId || typeof window === "undefined") return;
    restoredRepoRef.current = repoId;
    const key = repoId === REPO_DEFAULT_ID ? "doc-library-page" : `doc-library-page@${repoId}`;
    let s = null;
    try {
      s = JSON.parse(sessionStorage.getItem(key) ?? "null");
    } catch { /* ignore */ }
    if (window.innerWidth >= 640 && s) {
      setOpenPath(s.openPath ?? null);
      setRightPath(s.rightPath ?? null);
      setSplitOpen(!!s.splitOpen && !!s.rightPath);
      setFocused(s.focused === "right" ? "right" : "left");
    }
    setTreeOpen(window.innerWidth >= 640);
    setSplitRatio(() => {
      const r = Number(localStorage.getItem(SPLIT_RATIO_KEY));
      return Number.isFinite(r) && r >= 20 && r <= 80 ? r : 50;
    });
  }, [repoId]);

  useEffect(() => {
    if (typeof window === "undefined" || !repoId) return;
    const key = repoId === REPO_DEFAULT_ID ? "doc-library-page" : `doc-library-page@${repoId}`;
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({ openPath, rightPath, splitOpen, focused }),
      );
    } catch {
      /* ignore */
    }
  }, [repoId, openPath, rightPath, splitOpen, focused]);

  useEffect(() => {
    const w = Number(localStorage.getItem(TREE_WIDTH_KEY));
    if (Number.isFinite(w) && w >= 160) setTreeWidth(w);
    setTreeOpen(window.innerWidth >= 640);
    const r = Number(localStorage.getItem(SPLIT_RATIO_KEY));
    if (Number.isFinite(r) && r >= 20 && r <= 80) setSplitRatio(r);
  }, []);

  // ---------- 分屏比例拖动（两栏之间分隔条） ----------
  function startSplitResize(e: ReactPointerEvent) {
    e.preventDefault();
    const box = splitBoxRef.current;
    if (!box) return;
    const boxLeft = box.getBoundingClientRect().left;
    const boxW = box.clientWidth;
    let lastW = (splitRatio / 100) * boxW;
    function onMove(ev: globalThis.PointerEvent) {
      lastW = Math.min(boxW * 0.8, Math.max(boxW * 0.2, ev.clientX - boxLeft));
      setSplitRatio(Math.round((lastW / boxW) * 100));
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setSplitRatio((r) => {
        localStorage.setItem(SPLIT_RATIO_KEY, String(r));
        return r;
      });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

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

  /** 打开文档到当前聚焦的分栏（未分屏时固定左侧） */
  function openDoc(p: string) {
    if (splitOpen && focused === "right") setRightPath(p);
    else setOpenPath(p);
  }

  // ---------- 多仓库：列表/进出/新增/删除 ----------

  /** 进入某个仓库（目录树按其根展示） */
  const enterRepo = useCallback((id: string) => {
    localStorage.setItem(REPO_KEY, id);
    setOpenPath(null);
    setRightPath(null);
    setSplitOpen(false);
    setRepoMsg(null);
    setTreeOpen(window.innerWidth >= 640);
    setRepoId(id);
  }, []);

  /** 返回仓库选择页（可切换/管理仓库） */
  const exitToPicker = useCallback(() => {
    localStorage.removeItem(REPO_KEY);
    setRepoId(null);
    setRepoMsg(null);
    setReposLoading(true);
    refreshRepos();
  }, [refreshRepos]);

  /** 新增 git 仓库：服务器端自动 clone（默认 ~/Documents/knowlege_libraries） */
  async function submitAddRepo() {
    const url = repoForm.url.trim();
    if (!url || addingRepo) return;
    setAddingRepo(true);
    setRepoMsg(null);
    try {
      const r = await fetch("/api/docs/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, name: repoForm.name.trim() }),
      });
      const json = (await r.json()) as { error?: string; reused?: boolean; repo?: { id: string; name: string } };
      if (!r.ok || !json.repo) {
        setRepoMsg({ kind: "err", text: json.error ?? "添加失败" });
        return;
      }
      setRepoMsg({
        kind: "ok",
        text: json.reused
          ? `已登记现有克隆：${json.repo.name}`
          : `克隆完成：${json.repo.name}`,
      });
      setRepoForm({ name: "", url: "" });
      await refreshRepos();
      // 成功后直接进入新仓库
      enterRepo(json.repo.id);
    } catch (e) {
      setRepoMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setAddingRepo(false);
    }
  }

  /** 删除仓库：受管仓库连同本地克隆删除（远端不受影响）；默认仓库仅移出列表 */
  async function deleteRepo(repo: LibraryRepoMeta) {
    const msg = repo.managed
      ? `删除仓库「${repo.name}」？\n将同时删除本地克隆目录（远端 GitHub 不受影响）`
      : `从列表移除「${repo.name}」？（本地目录不会被删除）`;
    if (!window.confirm(msg)) return;
    if (repo.id === repoId) exitToPicker();
    setRepoBusyId(repo.id);
    setRepoMsg(null);
    try {
      const r = await fetch(`/api/docs/repos?id=${encodeURIComponent(repo.id)}`, { method: "DELETE" });
      const json = (await r.json()) as { error?: string };
      if (!r.ok) {
        setRepoMsg({ kind: "err", text: json.error ?? "删除失败" });
        return;
      }
      setRepoMsg({ kind: "ok", text: `已删除：${repo.name}` });
      refreshRepos();
    } finally {
      setRepoBusyId(null);
    }
  }

  /** 修改仓库展示名（不影响 git 地址与本地目录） */
  async function renameRepo(repo: LibraryRepoMeta) {
    const newName = window.prompt(`修改仓库名称（当前：${repo.name}）`, repo.name);
    if (!newName || newName.trim() === repo.name) return;
    const name = newName.trim();
    if (name.length > 100) {
      setRepoMsg({ kind: "err", text: "名称过长（最多 100 字符）" });
      return;
    }
    setRepoBusyId(repo.id);
    setRepoMsg(null);
    try {
      const r = await fetch("/api/docs/repos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: repo.id, name }),
      });
      const json = (await r.json()) as { error?: string };
      if (!r.ok) {
        setRepoMsg({ kind: "err", text: json.error ?? "改名失败" });
        return;
      }
      setRepoMsg({ kind: "ok", text: `已改名：${name}` });
      refreshRepos();
    } finally {
      setRepoBusyId(null);
    }
  }

  const load = useCallback(() => {
    if (!repoId) {
      setLoading(false);
      setErr(null);
      setData(null);
      return;
    }
    // 会话缓存（反馈：切页面/刷新回来不要重新拉取刷新）：先展示缓存树，后台静默校验
    const cacheKey = `doc-tree:${repoId}`;
    const cached = cacheGetJSON<TreeResp>(cacheKey);
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setErr(null);
    fetch(`/api/docs/tree?repo=${encodeURIComponent(repoId)}`)
      .then(async (r) => {
        const json = (await r.json()) as TreeResp;
        if (r.status === 404 && json.error === "unknown_repo") {
          // 仓库在服务器端已被删除：清掉本机记住的选择，回到仓库列表
          localStorage.removeItem(REPO_KEY);
          setRepoId(null);
          return;
        }
        if (!r.ok) {
          setErr(json.hint || json.error || "未知错误");
          setData(null);
        } else {
          // 与缓存一致 → 不重设（避免每次切回都重渲染整棵树）
          const prev = cacheGetJSON<TreeResp>(cacheKey);
          const same = prev && JSON.stringify(prev) === JSON.stringify(json);
          if (!same) {
            cacheSetJSON(cacheKey, json);
            setData(json);
          }
        }
      })
      .catch((e) => {
        // 有缓存时网络失败不打断当前内容
        if (!cacheGetJSON<TreeResp>(cacheKey)) setErr((e as Error).message);
      })
      .finally(() => setLoading(false));
  }, [repoId]);

  useEffect(load, [load]);

  /** 从 GitHub 重新拉取笔记内容，完成后刷新树 */
  async function pullFromGithub() {
    if (pulling) return;
    setPulling(true);
    try {
      const r = await fetch(`/api/docs/pull${repoId ? `?repo=${encodeURIComponent(repoId)}` : ""}`, { method: "POST" });
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

  /** 重命名/删除后：清理所有分屏里失效的路径标签（prefix=匹配父路径） */
  const purgeStaleTabs = useCallback(
    (oldPath: string, { prefixMatch = false }: { prefixMatch?: boolean } = {}) => {
      for (const api of [leftApiRef.current, rightApiRef.current]) {
        if (!api) continue;
        for (const p of api.tabs()) {
          const hit = prefixMatch ? p === oldPath || p.startsWith(`${oldPath}/`) : p === oldPath;
          if (hit) api.closeTab(p, { silent: true });
        }
      }
      setOpenPath((open) => (open && (prefixMatch ? open === oldPath || open.startsWith(`${oldPath}/`) : open === oldPath) ? null : open));
      setRightPath((rp) => (rp && (prefixMatch ? rp === oldPath || rp.startsWith(`${oldPath}/`) : rp === oldPath) ? null : rp));
    },
    [],
  );

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
      body: JSON.stringify({ path: node.path, newName: newName.trim(), repo: repoId }),
    });
    const json = await r.json();
    if (!r.ok) {
      alert(`重命名失败：${json.error}`);
      return;
    }
    // 重命名后：旧路径标签失效 → 清理；若被重命名的文件正开着，直接打开新路径
    const newRel = node.path.split("/").slice(0, -1).concat(newName.trim()).join("/");
    if (node.type === "file" && openPath === node.path) setOpenPath(newRel);
    if (node.type === "file" && rightPath === node.path) setRightPath(newRel);
    purgeStaleTabs(node.path, { prefixMatch: node.type === "dir" });
    load();
  }

  /** 删除文件/文件夹（文件夹连同内容；PDF 的标注 sidecar 由后端一并清理） */
  async function deleteNode(node: DocNode) {
    const what = node.type === "dir" ? `文件夹「${node.name}」及其全部内容` : `「${node.name}」`;
    if (!window.confirm(`${t.library.confirmDelete(what)}`)) return;
    const r = await fetch(`/api/docs/delete?path=${encodeURIComponent(node.path)}${repoId ? `&repo=${encodeURIComponent(repoId)}` : ""}`, {
      method: "DELETE",
    });
    const json = (await r.json()) as { error?: string };
    if (!r.ok) {
      alert(`${t.library.deleteFailed(json.error ?? r.statusText)}`);
      return;
    }
    // 正在打开的文档若被删，先关闭（含各分屏常驻标签）
    purgeStaleTabs(node.path, { prefixMatch: node.type === "dir" });
    load();
  }

  /** 拖动文件/文件夹到目标文件夹：修改所属目录 */
  async function moveNode(srcPath: string, targetDir: string) {
    if (targetDir === srcPath || targetDir.startsWith(`${srcPath}/`)) return;
    const r = await fetch("/api/docs/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: srcPath, targetDir, repo: repoId }),
    });
    const json = (await r.json()) as { error?: string; noop?: boolean };
    if (!r.ok) {
      alert(`移动失败：${json.error}`);
      return;
    }
    // 若抽屉正打开被移动的文档，先关闭（路径已失效）
    setOpenPath((p) => (p && (p === srcPath || p.startsWith(`${srcPath}/`)) ? null : p));
    setRightPath((p) => (p && (p === srcPath || p.startsWith(`${srcPath}/`)) ? null : p));
    load();
  }

  /** 拖入本地 PDF 文件（浏览器下载兜底：不再需要手动上传入口） */
  async function uploadFile(dirPath: string, file: File) {
    setUploading(`${file.name}`);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("dir", dirPath);
      form.append("name", file.name);
      if (repoId) form.append("repo", repoId);
      const r = await fetch("/api/docs/upload-file", { method: "POST", body: form });
      const json = (await r.json()) as { path?: string; error?: string };
      if (!r.ok || !json.path) {
        alert(`${t.library.importFailed(json.error ?? r.statusText)}`);
        return;
      }
      load();
      openDoc(json.path);
    } finally {
      setUploading(null);
    }
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
      body: JSON.stringify({ path: fullPath, repo: repoId }),
    });
    const json = await r.json();
    if (!r.ok) {
      alert(t.library.createFailed(json.error));
      return;
    }
    load();
    openDoc(fullPath); // 自动打开编辑
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
      body: JSON.stringify({ path: fullPath, repo: repoId }),
    });
    const json = await r.json();
    if (!r.ok) {
      alert(t.library.createFailed(json.error));
      return;
    }
    load();
  }

  /** URL 直接导入 PDF（服务器抓取，免本地上传） */
  async function submitImport() {
    const url = importUrl.trim();
    if (!url) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const r = await fetch("/api/docs/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, dir: importDir.trim(), name: importName.trim(), repo: repoId }),
      });
      const json = (await r.json()) as { path?: string; error?: string };
      if (!r.ok || !json.path) {
        setImportMsg({ kind: "err", text: t.library.importFailed(json.error ?? r.statusText) });
        return;
      }
      setImportMsg({ kind: "ok", text: t.library.importOk(json.path) });
      setImportUrl("");
      setImportName("");
      load();
      openDoc(json.path);
    } catch (e) {
      setImportMsg({ kind: "err", text: t.library.importFailed((e as Error).message) });
    } finally {
      setImporting(false);
    }
  }

  // ---------- 仓库选择页：进笔记库先选仓库；这里同时提供新增/删除仓库 ----------
  if (!repoId) {
    return (
      <div className="h-[calc(100dvh-3.5rem)] overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <FolderGit2 className="w-5 h-5 text-amber-500" /> 选择笔记仓库
            </h1>
            <p className="text-xs text-zinc-500 mt-1 leading-5">
              同一个笔记库可以挂载多个 git 仓库。选定仓库后按原有目录树方式浏览与编辑；
              新增仓库会在服务器端自动 clone，删除仓库只影响本地克隆（远端 GitHub 不受影响）。
            </p>
          </div>

          {/* 仓库列表 */}
          <div className="space-y-2">
            {reposLoading && (
              <div className="text-zinc-500 flex items-center justify-center gap-2 text-sm py-6">
                <Loader2 className="w-4 h-4 animate-spin" /> 加载仓库列表…
              </div>
            )}
            {!reposLoading && repos?.length === 0 && (
              <div className="text-sm text-zinc-500 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-6 text-center">
                暂无仓库。先在下方添加一个 git 仓库。
              </div>
            )}
            {repos?.map((repo) => (
              <div
                key={repo.id}
                className="group flex items-center gap-2 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-amber-300 dark:hover:border-amber-800/60 bg-white dark:bg-zinc-950"
              >
                <button onClick={() => enterRepo(repo.id)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderGit2 className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="font-medium truncate">{repo.name}</span>
                    {repo.id === REPO_DEFAULT_ID && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-500 shrink-0">默认</span>
                    )}
                    {repo.id !== REPO_DEFAULT_ID && (!repo.exists || !repo.isRepo) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-600 shrink-0">本地目录缺失</span>
                    )}
                    {repo.exists && repo.isRepo && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 shrink-0">git 就绪</span>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] text-zinc-400 font-mono truncate" title={repo.remote}>{repo.remote}</div>
                  <div className="text-[10px] text-zinc-400 font-mono truncate" title={repo.root}>{repo.root}</div>
                </button>
                {repoBusyId === repo.id ? (
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-400 shrink-0" />
                ) : (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => renameRepo(repo)}
                      title="修改仓库名称"
                      className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 opacity-60 group-hover:opacity-100"
                    >
                      <Pencil className="w-4 h-4 text-zinc-500" />
                    </button>
                    <button
                      onClick={() => deleteRepo(repo)}
                      title="删除该仓库"
                      className="p-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 opacity-60 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4 text-rose-500" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {repoMsg && (
              <div className={"text-xs " + (repoMsg.kind === "ok" ? "text-emerald-600" : "text-rose-600")}>
                {repoMsg.text}
              </div>
            )}
          </div>

          {/* 新增仓库 */}
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3 bg-white dark:bg-zinc-950">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-blue-600" /> 新增 git 仓库
            </h2>
            <label className="block text-xs text-zinc-500">
              显示名（可选）
              <input
                value={repoForm.name}
                onChange={(e) => setRepoForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例如：机器学习笔记"
                className="mt-1 w-full px-2.5 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 outline-none focus:border-blue-500"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Git 地址
              <input
                value={repoForm.url}
                onChange={(e) => setRepoForm((f) => ({ ...f, url: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter" && !addingRepo) submitAddRepo(); }}
                placeholder="https://github.com/owner/repo.git"
                className="mt-1 w-full px-2.5 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 outline-none focus:border-blue-500"
              />
            </label>
            <button
              onClick={submitAddRepo}
              disabled={addingRepo || !repoForm.url.trim()}
              className="w-full py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              {addingRepo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {addingRepo ? "克隆中…（可能需要一分钟）" : "添加并克隆"}
            </button>
            <p className="text-[10px] text-zinc-400 leading-4">
              克隆落到服务器的多仓库目录（默认 ~/Documents/knowlege_libraries，可用 KNOWLEDGE_LIBRARIES_PATH 覆盖）。
              若目标目录已存在且是 git 仓库，会直接登记使用。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-3.5rem)] flex flex-col overflow-hidden">
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
          {/* 当前仓库：点击回到仓库列表（切换/管理仓库） */}
          <button
            onClick={exitToPicker}
            title="切换 / 管理仓库（新增或删除 git 仓库）"
            className="shrink-0 flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-amber-300 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 max-w-[40vw]"
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            <span className="truncate">
              {repos?.find((r) => r.id === repoId)?.name ?? repoId}
            </span>
          </button>
          <span className="text-xs text-zinc-400 hidden md:inline truncate">
            {t.library.subtitle}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => {
              setSplitOpen((v) => {
                if (v) setRightPath(null);
                return !v;
              });
            }}
            title={t.library.splitHint}
            className="hidden md:inline-flex px-2.5 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1"
          >
            <Columns2 className="w-3.5 h-3.5" /> {t.library.splitBtn}
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              files.forEach((f) => uploadFile("", f));
              e.target.value = "";
            }}
          />
          <button
            onClick={() => uploadInputRef.current?.click()}
            title="上传 PDF（或将 PDF 拖到目录树的文件夹上）"
            className="px-2.5 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1"
          >
            <FileUp className="w-3.5 h-3.5" /> 上传
          </button>
          <button
            onClick={() => setImportOpen(true)}
            title={t.library.importUrlTitle}
            className="px-2.5 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1"
          >
            <FileDown className="w-3.5 h-3.5" /> {t.library.importUrlBtn}
          </button>
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

      {/* 左右分栏（反馈：页面本身为左右界面——左目录、右文档）；手机端目录为全屏浮层 */}
      <div className="flex-1 flex min-h-0 relative">
        {/* 左：目录树（可伸缩/可调宽） */}
        {treeOpen && (
          <div
            className="h-full overflow-y-auto overflow-x-hidden border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 relative shrink-0 max-sm:absolute max-sm:inset-y-0 max-sm:left-0 max-sm:right-0 max-sm:z-30 max-sm:w-full sm:[width:var(--tree-w)]"
            style={{ "--tree-w": `${treeWidth ?? TREE_DEFAULT_WIDTH}px` } as React.CSSProperties}
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
              <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-mono px-3 pt-2 pb-1">
                <span className="truncate flex-1" title={data.root}>{data.root}</span>
                <button
                  onClick={() => setCollapseTick((v) => v + 1)}
                  title={t.library.collapseAll}
                  className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 shrink-0"
                >
                  <ChevronsDownUp className="w-3 h-3" />
                </button>
              </div>
            )}
            {data?.tree && (
              <div
                className="px-1.5 pb-3 min-h-[60%]"
                onDragOver={(e) => {
                  // 树空白处也可拖入本机 PDF（上传到根目录）
                  if (!e.dataTransfer.types.includes("Files")) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  if (!e.dataTransfer.files?.length) return;
                  e.preventDefault();
                  for (const f of Array.from(e.dataTransfer.files)) uploadFile("", f);
                }}
              >
                <Tree
                  node={data.tree}
                  depth={0}
                  collapseTick={collapseTick}
                  onOpen={(p) => {
                    if (splitOpen) {
                      if (focused === "left") setOpenPath(p);
                      else setRightPath(p);
                    } else {
                      setOpenPath(p);
                    }
                    if (window.innerWidth < 640) setTreeOpen(false);
                  }}
                  onNewFile={createFile}
                  onNewDir={createDir}
                  onRename={renameNode}
                  onDelete={deleteNode}
                  onMoveNode={moveNode}
                  onUploadFile={uploadFile}
                  onMenu={(e, node) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, node });
                  }}
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

        {/* 右：文档内容（分屏时左右两栏，点击分栏切换聚焦；目录树新打开的文件进入聚焦栏） */}
        <div
          ref={splitBoxRef}
          className={"flex-1 min-w-0 h-full flex min-h-0 " + (splitOpen ? "flex-col md:flex-row" : "")}
          style={splitOpen ? ({ "--split": `${splitRatio}%` } as React.CSSProperties) : undefined}
        >
          <div
            onPointerDown={() => setFocused("left")}
            className={
              "min-w-0 min-h-0 " +
              (splitOpen
                ? "flex-1 md:flex-none md:[width:var(--split)]" +
                  (focused === "left" ? " ring-1 ring-inset ring-blue-500/40" : "")
                : "flex-1")
            }
          >
            <DocPane
              docPath={openPath}
              sessionKey={`library-left@${repoId}`}
              repo={repoId}
              paneId="left"
              onForeignDrop={splitOpen ? adoptInto("left") : undefined}
              apiRef={leftApiRef}
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
          {splitOpen && (
            <>
              {/* 分隔条：拖动调整两栏比例 */}
              <div
                onPointerDown={startSplitResize}
                className="hidden md:block w-1.5 shrink-0 cursor-ew-resize bg-zinc-200 dark:bg-zinc-800 hover:bg-blue-500/40"
                title="拖动调整两栏比例"
              />
              <div
                onPointerDown={() => setFocused("right")}
                className={
                  "min-w-0 min-h-0 flex-1 md:flex-none md:[width:calc(100%-var(--split)-6px)]" +
                  (focused === "right" ? " ring-1 ring-inset ring-blue-500/40" : "")
                }
              >
                <DocPane
                  docPath={rightPath}
                  sessionKey={`library-right@${repoId}`}
                  repo={repoId}
                  paneId="right"
                  onForeignDrop={adoptInto("right")}
                  apiRef={rightApiRef}
                  onClose={() => setRightPath(null)}
                  onSaved={() => load()}
                  placeholder={
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-zinc-400 text-sm px-6 text-center">
                      <Columns2 className="w-8 h-8" />
                      {t.library.splitPlaceholder}
                    </div>
                  }
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* 上传进度提示（反馈：大文件上传毫无反应感） */}
      {uploading && (
        <div className="fixed bottom-4 right-4 z-[80] flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 text-zinc-100 text-xs shadow-lg max-w-[70vw]">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span className="truncate">{t.library.uploading}</span>
          <span className="text-zinc-400 truncate">{uploading}</span>
        </div>
      )}

      {/* 目录树右键菜单 */}
      {menu && (
        <div className="fixed inset-0 z-[70]" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}>
          <div
            className="absolute min-w-36 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-xl text-sm"
            style={{ left: menu.x, top: menu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {menu.node.type === "dir" && (
              <>
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                  onClick={() => { setMenu(null); createFile(menu.node.path); }}
                >
                  <FilePlus className="w-3.5 h-3.5 text-blue-600" /> {t.library.menuNewFile}
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                  onClick={() => { setMenu(null); createDir(menu.node.path); }}
                >
                  <FolderPlus className="w-3.5 h-3.5 text-amber-600" /> {t.library.menuNewDir}
                </button>
                <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
              </>
            )}
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
              onClick={() => { setMenu(null); renameNode(menu.node); }}
            >
              <Pencil className="w-3.5 h-3.5 text-zinc-500" /> {t.library.menuRename}
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2"
              onClick={() => { setMenu(null); deleteNode(menu.node); }}
            >
              <Trash2 className="w-3.5 h-3.5" /> {t.library.menuDelete}
            </button>
          </div>
        </div>
      )}

      {/* URL 导入 PDF 对话框 */}
      {importOpen && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={() => !importing && setImportOpen(false)}>
          <div
            className="w-full max-w-md rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-2xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <FileDown className="w-4 h-4 text-blue-600" /> {t.library.importUrlTitle}
              </h2>
              <button
                onClick={() => setImportOpen(false)}
                disabled={importing}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label={t.common.close}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block text-xs text-zinc-500">
              {t.library.importUrlLabel}
              <input
                autoFocus
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !importing) submitImport(); }}
                placeholder={t.library.importUrlPlaceholder}
                className="mt-1 w-full px-2.5 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 outline-none focus:border-blue-500"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              {t.library.importDirLabel}
              <input
                value={importDir}
                onChange={(e) => setImportDir(e.target.value)}
                placeholder="例如：papers"
                className="mt-1 w-full px-2.5 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 outline-none focus:border-blue-500"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              {t.library.importNameLabel}
              <input
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder={t.library.importNamePlaceholder}
                className="mt-1 w-full px-2.5 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 outline-none focus:border-blue-500"
              />
            </label>
            {importing && (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t.library.importing}
              </div>
            )}
            {importMsg && (
              <div className={"text-xs " + (importMsg.kind === "ok" ? "text-emerald-600" : "text-rose-600")}>
                {importMsg.text}
              </div>
            )}
            <button
              onClick={submitImport}
              disabled={importing || !importUrl.trim()}
              className="w-full py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              {t.library.importUrlBtn}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Tree({
  node,
  depth,
  collapseTick,
  onOpen,
  onNewFile,
  onNewDir,
  onRename,
  onDelete,
  onMoveNode,
  onUploadFile,
  onMenu,
}: {
  node: DocNode;
  depth: number;
  collapseTick: number;
  onOpen: (p: string) => void;
  onNewFile: (parent: string) => void;
  onNewDir: (parent: string) => void;
  onRename: (node: DocNode) => void;
  onDelete: (node: DocNode) => void;
  onMoveNode: (srcPath: string, targetDir: string) => void;
  onUploadFile: (dir: string, file: File) => void;
  onMenu: (e: React.MouseEvent, node: DocNode) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(depth < 1);
  const [hover, setHover] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  // 「全部收起」：collapseTick 变化时折叠本节点
  useEffect(() => {
    if (collapseTick > 0) setOpen(false);
  }, [collapseTick]);
  if (node.type === "file") {
    const isMd = node.ext === ".md" || node.ext === ".markdown";
    const isPdf = node.ext === ".pdf";
    const isImg = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(
      node.ext ?? "",
    );
    const openable = isMd || isPdf;
    return (
      <button
        onClick={() => openable && onOpen(node.path)}
        disabled={!openable}
        title={openable ? t.library.clickToOpen : t.library.notPreviewable}
        style={{ paddingLeft: 12 + depth * 16 }}
        className={
          "w-full text-left py-1 text-sm rounded flex items-center gap-1.5 group " +
          (openable
            ? "text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
            : "text-zinc-400 cursor-default")
        }
        onContextMenu={(e) => onMenu(e, node)}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, node.path);
          e.dataTransfer.effectAllowed = "move";
        }}
      >
        <FileText className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{node.name}</span>
        {isImg && <span className="text-[10px] text-zinc-400">img</span>}
        {isPdf && <span className="text-[10px] text-rose-400">pdf</span>}
        {openable && <span className="flex-1" />}
        {openable && (
          <span
            className="hidden group-hover:flex items-center gap-0.5 pr-1"
            onClick={(e) => e.stopPropagation()}
          >
            <span
              role="button"
              onClick={() => onRename(node)}
              title={t.library.menuRename}
              className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
              <Pencil className="w-3 h-3 text-zinc-500" />
            </span>
            <span
              role="button"
              onClick={() => onDelete(node)}
              title={t.library.menuDelete}
              className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950/60"
            >
              <Trash2 className="w-3 h-3 text-rose-500" />
            </span>
          </span>
        )}
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
          e.stopPropagation();
          setDropActive(false);
          // 优先处理拖入的本机文件（PDF 等）
          if (e.dataTransfer.files?.length) {
            for (const f of Array.from(e.dataTransfer.files)) {
              onUploadFile(node.path, f);
            }
            return;
          }
          const src = e.dataTransfer.getData(DRAG_TYPE);
          if (!src || src === node.path || src.startsWith(`${node.path}/`)) return;
          onMoveNode(src, node.path);
        }}
        title="可将文件/文件夹拖到这里"
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 flex-1 min-w-0 font-medium text-left"
          onContextMenu={(e) => onMenu(e, node)}
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
            title={t.library.menuRename}
            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
          >
            <Pencil className="w-3.5 h-3.5 text-zinc-500" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node);
            }}
            title={t.library.menuDelete}
            className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950/60"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
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
              collapseTick={collapseTick}
              onOpen={onOpen}
              onNewFile={onNewFile}
              onNewDir={onNewDir}
              onRename={onRename}
              onDelete={onDelete}
              onMoveNode={onMoveNode}
              onUploadFile={onUploadFile}
              onMenu={onMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}
