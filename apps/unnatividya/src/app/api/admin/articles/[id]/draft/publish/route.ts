import { NextResponse } from "next/server";
import { z } from "zod";
import { articleWrite } from "@/lib/article-api";
import { publishDraft } from "@/lib/article-revisions";

// An administrator publishes their saved article draft in one step (submit and apply together).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return articleWrite(["ADMIN"], async (db, session) => {
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const draft = await publishDraft(db, session.userId, id);
    return NextResponse.json({ revisionId: draft.id, status: "APPLIED" });
  });
}
