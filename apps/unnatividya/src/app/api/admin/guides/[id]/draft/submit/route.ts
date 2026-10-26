import { NextResponse } from "next/server";
import { z } from "zod";
import { guideWrite } from "@/lib/guide-api";
import { submitGuideDraft } from "@/lib/guide-revisions";

// Send the editor's saved guide draft for review. It is locked from then on.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guideWrite(["ADMIN", "EDITOR"], async (db, session) => {
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const draft = await submitGuideDraft(db, session.userId, id);
    return NextResponse.json({ revisionId: draft.id });
  });
}
