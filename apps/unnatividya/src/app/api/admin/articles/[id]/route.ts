import { NextResponse } from "next/server";
import { z } from "zod";
import { articleWrite } from "@/lib/article-api";
import { setArticleStatus } from "@/lib/article-revisions";

const schema = z.object({ status: z.enum(["PUBLISHED", "ARCHIVED"]) }).strict();

// Unpublish (ARCHIVED) or republish an article. Administrators only.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return articleWrite(["ADMIN"], async (db, session) => {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!z.string().uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    await setArticleStatus(db, session.userId, id, parsed.data.status);
    return NextResponse.json({ ok: true });
  });
}
