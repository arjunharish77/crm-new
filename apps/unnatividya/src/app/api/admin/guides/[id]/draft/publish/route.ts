import { NextResponse } from "next/server";
import { z } from "zod";
import { guideWrite } from "@/lib/guide-api";
import { publishGuideDraft } from "@/lib/guide-revisions";

// An administrator publishes their saved guide draft in one step (submit and apply together).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guideWrite(["ADMIN"], async (db, session) => {
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const draft = await publishGuideDraft(db, session.userId, id);
    return NextResponse.json({ revisionId: draft.id, status: "APPLIED" });
  });
}
