import { NextResponse } from "next/server";
import { z } from "zod";
import { articleWrite } from "@/lib/article-api";
import { reviewRevision, scheduleRevision, unscheduleRevision } from "@/lib/article-revisions";

const note = z.string().trim().min(5).max(2000);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("APPLY"), note }).strict(),
  z.object({ action: z.literal("REJECT"), note }).strict(),
  // Wave 5 C2: an exact instant (ISO 8601 with an offset); the form sends India time (+05:30).
  z.object({ action: z.literal("SCHEDULE"), note, publishAt: z.string().datetime({ offset: true }) }).strict(),
  z.object({ action: z.literal("UNSCHEDULE") }).strict(),
]);

// Apply (publish), reject, schedule or unschedule a submitted revision. Administrators only; every
// action except unscheduling needs a review note.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return articleWrite(["ADMIN"], async (db, session) => {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!z.string().uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Provide a review note (at least 5 characters) and, to schedule, a valid date and time." }, { status: 400 });
    const body = parsed.data;
    if (body.action === "SCHEDULE") { await scheduleRevision(db, session.userId, id, new Date(body.publishAt), body.note); return NextResponse.json({ status: "SCHEDULED", publishAt: new Date(body.publishAt).toISOString() }); }
    if (body.action === "UNSCHEDULE") { await unscheduleRevision(db, session.userId, id); return NextResponse.json({ status: "NEEDS_REVIEW" }); }
    const status = await reviewRevision(db, session.userId, id, body.action, body.note);
    return NextResponse.json({ status });
  });
}
