import { promises as fs } from "node:fs";
import { resolveSafe } from "@/lib/docs/fs";
import { syncPushNotes } from "@/lib/docs/sync";

export const runtime = "nodejs";

interface RenameBody {
  /** 相对路径（文件或文件夹） */
  path: string;
  /** 新名字（不含路径） */
  newName: string;
}

export async function POST(req: Request) {
  let body: RenameBody;
  try {
    body = (await req.json()) as RenameBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.path || !body.newName?.trim()) {
    return Response.json({ error: "path and newName required" }, { status: 400 });
  }
  const name = body.newName.trim();
  if (/[\\<>:"|?*\0/]/.test(name)) {
    return Response.json({ error: "名称包含非法字符" }, { status: 400 });
  }
  const abs = resolveSafe(body.path);
  if (!abs) return Response.json({ error: "invalid path" }, { status: 400 });

  const stat = await fs.stat(abs).catch(() => null);
  if (!stat) return Response.json({ error: "源不存在" }, { status: 404 });

  const newRel = body.path
    .split("/")
    .slice(0, -1)
    .concat(name)
    .join("/");
  const newAbs = resolveSafe(newRel);
  if (!newAbs) return Response.json({ error: "invalid target path" }, { status: 400 });

  try {
    await fs.access(newAbs);
    return Response.json({ error: "同名文件/文件夹已存在" }, { status: 409 });
  } catch {}

  await fs.rename(abs, newAbs);
  await syncPushNotes(`web: rename ${body.path} -> ${name}`);
  return Response.json({ ok: true, path: newRel });
}
