import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { createOtp, hashOtp } from "@/lib/otp";
import { editToken, ownsLead, validOrigin } from "@/lib/lead-capture";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { sendOtpEmail } from "@/lib/zeptomail";

export async function POST(request: Request) {
  const token = editToken(request);
  if (!token || !validOrigin(request)) return NextResponse.json({ error: "Invalid form session." }, { status: 403 });
  const parsed = z.object({ leadId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (!checkRateLimit("otp-send-ip", clientIp(request), 20, 600000).allowed || !checkRateLimit("otp-send-lead", parsed.data.leadId, 5, 600000).allowed)
    return NextResponse.json({ error: "Too many code requests. Try again later." }, { status: 429 });
  const db = await pool.connect();
  try {
    await db.query("begin");
    const lead = (await db.query("select * from lead_capture where id=$1 for update", [parsed.data.leadId])).rows[0];
    if (!lead || !ownsLead(token, lead)) { await db.query("rollback"); return NextResponse.json({ error: "Form session expired. Reopen the form." }, { status: 403 }); }
    if (!lead.preferences_completed_at) { await db.query("rollback"); return NextResponse.json({ error: "Save your course preferences first." }, { status: 400 }); }
    const recent = await db.query("select id from otp_request where lead_capture_id=$1 and purpose='LEAD_VERIFY' and created_at > now()-interval '60 seconds'", [lead.id]);
    if (recent.rowCount) { await db.query("rollback"); return NextResponse.json({ error: "Please wait a minute before requesting another code." }, { status: 429 }); }
    const otp = createOtp();
    const result = await sendOtpEmail({ toEmail: lead.email, toName: lead.name, otp, purpose: "lead" });
    if (!result.ok) { await db.query("rollback"); return NextResponse.json({ error: "Your enquiry is saved, but the verification email could not be sent. Please retry." }, { status: 502 }); }
    await db.query("delete from otp_request where lead_capture_id=$1 and purpose='LEAD_VERIFY'", [lead.id]);
    await db.query(`insert into otp_request (lead_capture_id,channel,purpose,target,otp_hash,expires_at,provider,provider_status)
      values ($1,'EMAIL','LEAD_VERIFY',$2,$3,now()+interval '10 minutes','zeptomail',$4)`, [lead.id,lead.email,hashOtp(otp),String(result.status)]);
    await db.query("insert into lead_event (lead_capture_id,event_type,metadata) values ($1,'EMAIL_OTP_SENT','{}'::jsonb)", [lead.id]);
    await db.query("commit");
    return NextResponse.json({ ok: true });
  } catch { await db.query("rollback"); return NextResponse.json({ error: "Your enquiry is saved. Email delivery is temporarily unavailable; please retry." }, { status: 503 }); }
  finally { db.release(); }
}
