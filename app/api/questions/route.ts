import { libraryRoot } from "@/lib/docs/fs";
import {
  deleteBankQuestion,
  loadQuestionBank,
  migrateLegacyBankIfNeeded,
  upsertQuestion,
  type BankQuestion,
} from "@/lib/questions/store";

export const runtime = "nodejs";
export const maxDuration = 60;

interface UpsertBody extends Omit<BankQuestion, "category"> {
  category?: string;
  prevFile?: string;
}

export async function GET() {
  const root = libraryRoot();
  try {
    await migrateLegacyBankIfNeeded();
    const { categories, questions } = await loadQuestionBank();
    return Response.json({ root, categories, questions });
  } catch (err) {
    console.error("[api/questions] GET failed:", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as UpsertBody;
  try {
    const item = {
      id: body.id || "",
      createdAt: body.createdAt || 0,
      updatedAt: 0,
      topicId: body.topicId,
      category: body.category ?? "其他",
      question: { zh: body.question?.zh ?? "", en: body.question?.en ?? "" },
      answer: { zh: body.answer?.zh ?? "", en: body.answer?.en ?? "" },
      file: "",
    };
    const result = await upsertQuestion(item, body.prevFile);
    return Response.json({ ok: true, file: result.file, id: result.id });
  } catch (err) {
    console.error("[api/questions] POST failed:", err);
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const file = url.searchParams.get("file") ?? "";
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });
  try {
    const ok = await deleteBankQuestion(id, file || undefined);
    return Response.json({ ok });
  } catch (err) {
    console.error("[api/questions] DELETE failed:", err);
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
