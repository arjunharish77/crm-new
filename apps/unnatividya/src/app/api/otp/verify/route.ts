import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { verifyOtpHash } from "@/lib/otp";

const schema = z.object({
  leadId: z.string().uuid(),
  otp: z.string().trim().min(4).max(6),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid OTP" }, { status: 400 });
  }

  const latest = await query<{ id: string; otp_hash: string; expires_at: string; attempts: number }>(
    `select id, otp_hash, expires_at, attempts
     from otp_request
     where lead_capture_id = $1 and purpose = 'LEAD_VERIFY' and channel = 'EMAIL' and verified_at is null
     order by created_at desc
     limit 1`,
    [parsed.data.leadId],
  );

  if (!latest.rowCount) {
    return NextResponse.json({ error: "OTP not found" }, { status: 404 });
  }

  const requestRow = latest.rows[0];
  if (new Date(requestRow.expires_at).getTime() < Date.now() || requestRow.attempts >= 5) {
    return NextResponse.json({ error: "OTP expired" }, { status: 400 });
  }

  const verified = verifyOtpHash(parsed.data.otp, requestRow.otp_hash);
  if (!verified) {
    await query(`update otp_request set attempts = attempts + 1 where id = $1`, [requestRow.id]);
    return NextResponse.json({ error: "OTP invalid" }, { status: 400 });
  }

  await query(`update otp_request set verified_at = now() where id = $1`, [requestRow.id]);
  await query(
    `update lead_capture
     set email_otp_verified = true, email_verified_at = now(), updated_at = now()
     where id = $1`,
    [parsed.data.leadId],
  );
  await query(
    `insert into lead_event (lead_capture_id, event_type, metadata)
     values ($1, 'EMAIL_OTP_VERIFIED', '{}'::jsonb)`,
    [parsed.data.leadId],
  );

  return NextResponse.json({ ok: true });
}
