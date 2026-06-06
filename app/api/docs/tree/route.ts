import { libraryRoot, scanLibrary } from "@/lib/docs/fs";

export const runtime = "nodejs";

export async function GET() {
  const tree = await scanLibrary();
  if (!tree) {
    return Response.json(
      {
        error: "library_not_found",
        root: libraryRoot(),
        hint: "笔记库目录不存在。默认 ~/Documents/knowlege_library，或用环境变量 KNOWLEDGE_LIBRARY_PATH 指定。",
      },
      { status: 404 },
    );
  }
  return Response.json({ root: libraryRoot(), tree });
}
