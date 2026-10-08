import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveSafe } from "@/lib/docs/fs";
import { syncPushNotes } from "@/lib/docs/sync";

export const runtime = "nodejs";

interface MoveBody {
  /** 相对路径（要移动的文件或文件夹） */
  path: string;
  /** 目标文件夹相对路径（"" 表示根目录） */
  targetDir: string;
}

export async function POST(req: Request) {
  let body: MoveBody;
  try {
    body = (await req.json()) as MoveBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.path || typeof body.targetDir !== "string") {
    return Response.json({ error: "path and targetDir required" }, { status: 400 });
  }
  const srcAbs = resolveSafe(body.path);
  if (!srcAbs) return Response.json({ error: "invalid source path" }, { status: 400 });

  const stat = await fs.stat(srcAbs).catch(() => null);
  if (!stat) return Response.json({ error: "源不存在" }, { status: 404 });

  const targetDir = body.targetDir.replace(/^\/*|\/*$/g, "");
  const targetDirAbs = targetDir ? resolveSafe(targetDir) : resolveSafe(".");
  if (targetDirAbs === null) return Response.json({ error: "invalid target dir" }, { status: 400 });

  const targetDirStat = await fs.stat(targetDirAbs).catch(() => null);
  if (!targetDirStat || !targetDirStat.isDirectory()) {
    return Response.json({ error: "目标文件夹不存在" }, { status: 404 });
  }

  const name = path.basename(body.path);
  const newRel = targetDir ? `${targetDir}/${name}` : name;
  if (newRel === body.path) {
    return Response.json({ ok: true, path: newRel, noop: true });
  }

  // 目标已存在同名文件/文件夹
  const newAbs = resolveSafe(newRel)!;
  const exists = await fs.stat(newAbs).catch(() => null);
  if (exists) return Response.json({ error: "目标文件夹下已存在同名文件/文件夹" }, { status: 409 });

  // 不能把文件夹移动到它自身或其子目录里
  if (stat.isDirectory()) {
    const rel = path.relative(srcAbs, newAbs);
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
      return Response.json({ error: "不能移动到自身或其子文件夹" }, { status: 400 });
    }
  }

  try {
    await fs.rename(srcAbs, newAbs);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
  await syncPushNotes(`web: move ${body.path} -> ${newRel}`);
  return Response.json({ ok: true, path: newRel });
}
