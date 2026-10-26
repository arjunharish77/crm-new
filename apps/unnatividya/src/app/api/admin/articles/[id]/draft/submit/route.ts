import { NextResponse } from "next/server";
import { z } from "zod";
import { articleWrite } from "@/lib/article-api";
import { submitDraft } from "@/lib/article-revisions";

// Send the editor's saved draft for review. It is locked from then on.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return articleWrite(["ADMIN", "EDITOR"], async (db, session) => {
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const draft = await submitDraft(db, session.userId, id);
    return NextResponse.json({ revisionId: draft.id });
  });
}
