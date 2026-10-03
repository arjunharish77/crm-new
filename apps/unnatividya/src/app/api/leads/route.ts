import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { contactSchema, CONTACT_CONSENT_TEXT, CONTACT_CONSENT_VERSION, editToken, ownsLead, tokenHash, validOrigin } from "@/lib/lead-capture";

export async function POST(request: Request) {
  const token = editToken(request);
  if (!token || !validOrigin(request)) return NextResponse.json({ error: "Invalid form session. Reopen the form." }, { status: 403 });
  if (!checkRateLimit("lead-capture", clientIp(request), 10, 10 * 60 * 1000).allowed)
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  const parsed = contactSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid name, email and international phone number, and accept contact consent." }, { status: 400 });
  const lead = parsed.data;
  const db = await pool.connect();
  try {
    await db.query("begin");
    await db.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [lead.submissionKey]);
    const existing = await db.query("select * from lead_capture where submission_key = $1 for update", [lead.submissionKey]);
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (!ownsLead(token, row)) { await db.query("rollback"); return NextResponse.json({ error: "Form session expired. Reopen the form." }, { status: 403 }); }
      if (row.name !== lead.name || row.email !== lead.email || row.phone !== lead.phone) {
        await db.query("rollback");
        return NextResponse.json({ error: "Details were already saved. Use the existing enquiry to continue." }, { status: 409 });
      }
      await db.query("commit");
      return NextResponse.json({ leadId: row.id, crmSyncStatus: row.crm_sync_status }, { headers: { "Cache-Control": "no-store" } });
    }
    const config = (await db.query("select is_enabled from crm_sync_config order by created_at limit 1")).rows[0];
    const syncStatus = config?.is_enabled ? "PENDING" : "DISABLED";
    // Store only a pathname, never personal query strings from a referrer.
    let sourcePath: string | null = null;
    try { sourcePath = new URL(request.headers.get("referer") || "").pathname; } catch { /* no referrer */ }
    const created = await db.query(`insert into lead_capture
      (name,email,phone,source_path,source_page_type,consent_accepted,crm_sync_status,
       submission_key,edit_token_hash,edit_expires_at,consent_version,consent_recorded_at)
      values ($1,$2,$3,$4,$5,true,$6,$7,$8,now()+interval '24 hours',$9,now()) returning id`,
      [lead.name,lead.email,lead.phone,sourcePath,lead.intent || "apply_now",syncStatus,lead.submissionKey,tokenHash(token),CONTACT_CONSENT_VERSION]);
    const leadId = created.rows[0].id;
    await db.query(`insert into lead_event (lead_capture_id,event_type,metadata) values ($1,'CONTACT_DETAILS_SAVED',$2)`,
      [leadId, { consentVersion: CONTACT_CONSENT_VERSION, consentText: CONTACT_CONSENT_TEXT, preferencesComplete: false }]);
    await db.query("commit");
    return NextResponse.json({ leadId, crmSyncStatus: syncStatus }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { await db.query("rollback"); throw error; }
  finally { db.release(); }
}
