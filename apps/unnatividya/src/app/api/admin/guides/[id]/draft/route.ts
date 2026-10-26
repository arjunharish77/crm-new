import { NextResponse } from "next/server";
import { z } from "zod";
import { guideWrite } from "@/lib/guide-api";
import { guideAudit, guideReasonSchema, saveGuideDraft } from "@/lib/guide-revisions";

const schema = z.object({ content: z.unknown(), reason: guideReasonSchema }).strict();

// Save (create or update) the signed-in editor's open draft for this guide (Wave 5 C3).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guideWrite(["ADMIN", "EDITOR"], async (db, session) => {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!z.string().uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const draft = await saveGuideDraft(db, session.userId, id, parsed.data.content, parsed.data.reason);
    return NextResponse.json({ revisionId: draft.id, updatedAt: draft.updated_at });
  });
}

// Discard the editor's own open draft.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guideWrite(["ADMIN", "EDITOR"], async (db, session) => {
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const removed = await db.query("delete from guide_revision where guide_id=$1 and created_by=$2 and status='DRAFT' returning id", [id, session.userId]);
    if (removed.rowCount) await guideAudit(db, session.userId, "GUIDE_DRAFT_DISCARDED", removed.rows[0].id, { guideId: id });
    return NextResponse.json({ ok: true });
  });
}
