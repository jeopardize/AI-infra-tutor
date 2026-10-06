import { loadFromGit, saveToGit } from "@/lib/data/repo-storage";

export const runtime = "nodejs";

/**
 * Generic JSON data API (persisted to git repo + local cache).
 *
 * GET /api/data/resume        -> returns saved JSON
 * PUT /api/data/resume        -> saves request body as JSON
 * GET /api/data/question-bank -> returns saved JSON
 * PUT /api/data/question-bank -> saves request body as JSON
 *
 * Data is stored in a dedicated git repository (see lib/data/repo-storage.ts)
 * so it survives server restarts and is easy to migrate between servers.
 * Domain param `[domain]` is sanitized to [a-zA-Z0-9_-] only.
 */

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ domain: string }> },
) {
  const { domain } = await params;
  const data = await loadFromGit<unknown>(domain, null);
  return Response.json(data ?? { _empty: true });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ domain: string }> },
) {
  const { domain } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  try {
    await saveToGit(domain, body);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[api/data] PUT "${domain}" failed:`, err);
    return Response.json({ error: "failed to save data" }, { status: 500 });
  }
}
