import { NextResponse } from "next/server";
import { z } from "zod";
import { articleWrite } from "@/lib/article-api";
import { audit, parseContent, reasonSchema, saveDraft } from "@/lib/article-revisions";

const schema = z.object({ content: z.unknown(), reason: reasonSchema }).strict();

// Save (create or update) the signed-in editor's open draft for this article.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return articleWrite(["ADMIN", "EDITOR"], async (db, session) => {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!z.string().uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const draft = await saveDraft(db, session.userId, id, parseContent(parsed.data.content), parsed.data.reason);
    return NextResponse.json({ revisionId: draft.id, updatedAt: draft.updated_at });
  });
}

// Discard the editor's own open draft.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return articleWrite(["ADMIN", "EDITOR"], async (db, session) => {
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const removed = await db.query("delete from article_revision where article_id=$1 and created_by=$2 and status='DRAFT' returning id", [id, session.userId]);
    if (removed.rowCount) await audit(db, session.userId, "ARTICLE_DRAFT_DISCARDED", removed.rows[0].id, { articleId: id });
    return NextResponse.json({ ok: true });
  });
}
