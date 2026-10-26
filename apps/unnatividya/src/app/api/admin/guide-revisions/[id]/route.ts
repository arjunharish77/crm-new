import { NextResponse } from "next/server";
import { z } from "zod";
import { guideWrite } from "@/lib/guide-api";
import { reviewGuideRevision } from "@/lib/guide-revisions";

const schema = z.object({ action: z.enum(["APPLY", "REJECT"]), note: z.string().trim().min(5).max(2000) }).strict();

// Publish or send back a submitted guide revision. Administrators only, with a review note.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guideWrite(["ADMIN"], async (db, session) => {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!z.string().uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Provide a review note (at least 5 characters)." }, { status: 400 });
    const status = await reviewGuideRevision(db, session.userId, id, parsed.data.action, parsed.data.note);
    return NextResponse.json({ status });
  });
}
