import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { contactSchema, CONTACT_CONSENT_TEXT, CONTACT_CONSENT_VERSION, editToken, ownsLead, preferencesSchema, resolvePreferences, validOrigin } from "@/lib/lead-capture";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { MARKETING_CONSENT_TEXT, MARKETING_CONSENT_VERSION, requestSubscription } from "@/lib/newsletter";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = editToken(request);
  if (!token || !validOrigin(request) || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid form session." }, { status: 403 });
  if (!checkRateLimit("lead-preferences", clientIp(request), 30, 600000).allowed) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  const json = await request.json().catch(() => null);
  const contact = z.object({ contact: contactSchema }).strict().safeParse(json);
  const input = preferencesSchema.safeParse(json);
  const feeCategoryProvided = input.success && input.data.feeCategoryKey !== undefined;
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
      if (row.consent_version !== CONTACT_CONSENT_VERSION) {
        await db.query("update lead_capture set consent_version=$2, consent_recorded_at=now() where id=$1", [id, CONTACT_CONSENT_VERSION]);
        await db.query("insert into lead_event (lead_capture_id,event_type,metadata) values ($1,'CONTACT_CONSENT_REAFFIRMED',$2)",
          [id, { consentVersion: CONTACT_CONSENT_VERSION, consentText: CONTACT_CONSENT_TEXT }]);
      }
      const marketing = c.marketingConsent === true;
      // The current Apply now form omits marketingConsent. Keep an existing opt-in
      // when the email is unchanged, but never carry it to a different email address.
      if ((c.marketingConsent !== undefined && (marketing !== row.marketing_consent || (marketing && emailChanged))) ||
          (c.marketingConsent === undefined && emailChanged && row.marketing_consent)) {
        await db.query("update lead_capture set marketing_consent=$2, marketing_consent_version=$3, marketing_consent_at=$4 where id=$1",
          [id, marketing, marketing ? MARKETING_CONSENT_VERSION : row.marketing_consent_version, marketing ? new Date() : row.marketing_consent_at]);
        // A pending sign-up for an earlier address, or one no longer opted in, is dropped.
        await db.query("update newsletter_subscriber set status='UNSUBSCRIBED', unsubscribed_at=now(), confirm_token_hash=null, updated_at=now() where lead_capture_id=$1 and status='PENDING' and ($2 = false or lower(email) <> lower($3))", [id, marketing, c.email]);
        if (marketing) await requestSubscription(db, { email: c.email, source: "LEAD_FORM", sourcePath: row.source_path, leadId: id, consentVersion: MARKETING_CONSENT_VERSION });
        if (marketing !== row.marketing_consent)
          await db.query("insert into lead_event (lead_capture_id,event_type,metadata) values ($1,$2,$3)", [id, marketing ? "MARKETING_CONSENT_GIVEN" : "MARKETING_CONSENT_WITHDRAWN", marketing ? { consentVersion: MARKETING_CONSENT_VERSION, consentText: MARKETING_CONSENT_TEXT } : { via: "lead_form" }]);
      }
    } else if (selection) {
      await db.query(`update lead_capture set course_preference=$2,course_id=$3,university_id=$4,
        preferences_completed_at=now(),updated_at=now() where id=$1`, [id, selection.coursePreference, selection.courseId, selection.universityId]);
      if (row.course_preference !== selection.coursePreference || row.university_id !== selection.universityId || feeCategoryProvided)
        await db.query("insert into lead_event (lead_capture_id,event_type,metadata) values ($1,'PREFERENCES_SAVED',$2)", [id,selection]);
    }
    await db.query("commit");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { await db.query("rollback"); throw error; }
  finally { db.release(); }
}
