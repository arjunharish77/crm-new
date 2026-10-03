import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { contactSchema, editToken, ownsLead, preferencesSchema, resolvePreferences, validOrigin } from "@/lib/lead-capture";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = editToken(request);
  if (!token || !validOrigin(request) || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid form session." }, { status: 403 });
  if (!checkRateLimit("lead-preferences", clientIp(request), 30, 600000).allowed) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  const json = await request.json().catch(() => null);
  const contact = z.object({ contact: contactSchema }).strict().safeParse(json);
  const input = preferencesSchema.safeParse(json);
  if (!input.success && !contact.success) return NextResponse.json({ error: "Choose a course and optionally a university." }, { status: 400 });
  let selection: Awaited<ReturnType<typeof resolvePreferences>> | undefined;
  try { if (input.success) selection = await resolvePreferences(input.data); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  const db = await pool.connect();
  try {
    await db.query("begin");
    const row = (await db.query("select * from lead_capture where id=$1 for update", [id])).rows[0];
    if (!row || !ownsLead(token, row)) { await db.query("rollback"); return NextResponse.json({ error: "Form session expired. Reopen the form." }, { status: 403 }); }
    if (contact.success) {
      const c = contact.data.contact;
      const emailChanged = row.email !== c.email;
      await db.query(`update lead_capture set name=$2,email=$3,phone=$4,
        email_otp_verified=case when $5 then false else email_otp_verified end,
        email_verified_at=case when $5 then null else email_verified_at end,updated_at=now() where id=$1`,
        [id,c.name,c.email,c.phone,emailChanged]);
      if (emailChanged) await db.query("delete from otp_request where lead_capture_id=$1 and purpose='LEAD_VERIFY'", [id]);
      if (row.name !== c.name || emailChanged || row.phone !== c.phone)
        await db.query("insert into lead_event (lead_capture_id,event_type,metadata) values ($1,'CONTACT_DETAILS_UPDATED',$2)", [id,{ emailVerificationReset: emailChanged }]);
    } else if (selection) {
      await db.query(`update lead_capture set course_preference=$2,course_id=$3,university_id=$4,
        preferences_completed_at=now(),updated_at=now() where id=$1`, [id, selection.coursePreference, selection.courseId, selection.universityId]);
      if (row.course_preference !== selection.coursePreference || row.university_id !== selection.universityId)
        await db.query("insert into lead_event (lead_capture_id,event_type,metadata) values ($1,'PREFERENCES_SAVED',$2)", [id,selection]);
    }
    await db.query("commit");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { await db.query("rollback"); throw error; }
  finally { db.release(); }
}
