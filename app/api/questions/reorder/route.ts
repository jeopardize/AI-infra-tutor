import { reorderQuestionFile } from "@/lib/questions/store";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ReorderBody {
  file?: string;
  orderedIds?: string[];
}

export async function POST(req: Request) {
  let body: ReorderBody;
  try {
    body = (await req.json()) as ReorderBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.file || !Array.isArray(body.orderedIds)) {
    return Response.json({ error: "file and orderedIds required" }, { status: 400 });
  }
  try {
    const ok = await reorderQuestionFile(body.file, body.orderedIds);
    return Response.json({ ok });
  } catch (err) {
    console.error("[api/questions/reorder] POST failed:", err);
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
