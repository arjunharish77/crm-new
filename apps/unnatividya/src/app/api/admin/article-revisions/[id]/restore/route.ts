import { NextResponse } from "next/server";
import { z } from "zod";
import { articleWrite } from "@/lib/article-api";
import { restoreRevision } from "@/lib/article-revisions";

// Copy an earlier version into the editor's draft (replacing their open draft). Nothing is
// published until the draft is submitted and applied.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return articleWrite(["ADMIN", "EDITOR"], async (db, session) => {
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const draft = await restoreRevision(db, session.userId, id);
    return NextResponse.json({ revisionId: draft.id });
  });
}
