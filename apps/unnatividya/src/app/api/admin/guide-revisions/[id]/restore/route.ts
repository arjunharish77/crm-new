import { NextResponse } from "next/server";
import { z } from "zod";
import { guideWrite } from "@/lib/guide-api";
import { restoreGuideRevision } from "@/lib/guide-revisions";

// Copy an earlier guide version into the editor's draft. Nothing is published until the draft is
// submitted and applied.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guideWrite(["ADMIN", "EDITOR"], async (db, session) => {
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const draft = await restoreGuideRevision(db, session.userId, id);
    return NextResponse.json({ revisionId: draft.id });
  });
}
