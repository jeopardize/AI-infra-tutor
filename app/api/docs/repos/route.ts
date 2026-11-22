import { promises as fs } from "node:fs";
import {
  addLibraryRepo,
  DEFAULT_REPO_ID,
  librariesHome,
  listLibraryRepos,
  removeLibraryRepo,
  renameLibraryRepo,
} from "@/lib/docs/repos";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const list = await listLibraryRepos();
  const repos = await Promise.all(
    list.map(async (r) => {
      const [exists, isRepo] = await Promise.all([
        fs.access(r.root).then(
          () => true,
          () => false,
        ),
        fs.access(`${r.root}/.git`).then(
          () => true,
          () => false,
        ),
      ]);
      return { ...r, exists, isRepo };
    }),
  );
  return Response.json({ repos, librariesHome: librariesHome(), defaultId: DEFAULT_REPO_ID });
}

export async function POST(req: Request) {
  let body: { url?: string; name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.url || !body.url.trim()) {
    return Response.json({ error: "url required" }, { status: 400 });
  }
  try {
    const result = await addLibraryRepo(body.url.trim(), body.name);
    if ("error" in result) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    return Response.json(result);
  } catch (err) {
    console.error("[api/docs/repos] add failed:", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  try {
    const result = await removeLibraryRepo(id);
    if ("error" in result) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    return Response.json(result);
  } catch (err) {
    console.error("[api/docs/repos] remove failed:", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

/** 修改仓库展示名（id/目录名不变） */
export async function PATCH(req: Request) {
  let body: { id?: string; name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.id || !body.name) {
    return Response.json({ error: "id and name required" }, { status: 400 });
  }
  try {
    const result = await renameLibraryRepo(body.id, body.name);
    if ("error" in result) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    return Response.json(result);
  } catch (err) {
    console.error("[api/docs/repos] rename failed:", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
