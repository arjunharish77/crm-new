import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { createOtp, hashOtp } from "@/lib/otp";
import { sendOtpEmail } from "@/lib/zeptomail";

const schema = z.object({
  leadId: z.string().uuid(),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid OTP request" }, { status: 400 });
  }

  const lead = await query<{ id: string; email: string; name: string }>(
    `select id, email, name from lead_capture where id = $1`,
    [parsed.data.leadId],
  );
  if (!lead.rowCount) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const otp = createOtp();
  const result = await sendOtpEmail({
    toEmail: lead.rows[0].email,
    toName: lead.rows[0].name,
    otp,
    purpose: "lead",
  });

  await query(
    `insert into otp_request (
      lead_capture_id, channel, purpose, target, otp_hash, expires_at, provider, provider_status
    )
    values ($1, 'EMAIL', 'LEAD_VERIFY', $2, $3, now() + interval '10 minutes', 'zeptomail', $4)`,
    [lead.rows[0].id, lead.rows[0].email, hashOtp(otp), String(result.status)],
  );
  await query(
    `insert into lead_event (lead_capture_id, event_type, metadata)
     values ($1, 'EMAIL_OTP_SENT', $2)`,
    [lead.rows[0].id, { provider: "zeptomail", status: result.status }],
  );

  return NextResponse.json({ ok: result.ok });
}
