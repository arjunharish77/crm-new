import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { verifyOtpHash } from "@/lib/otp";
import { editToken, ownsLead, validOrigin } from "@/lib/lead-capture";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const token = editToken(request);
  if (!token || !validOrigin(request)) return NextResponse.json({ error: "Invalid form session." }, { status: 403 });
  const parsed = z.object({ leadId: z.string().uuid(), otp: z.string().regex(/^\d{4,6}$/) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your email verification code." }, { status: 400 });
  if (!checkRateLimit("otp-verify", clientIp(request), 30, 600000).allowed) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  const db = await pool.connect();
  try {
    await db.query("begin");
    const lead = (await db.query("select * from lead_capture where id=$1 for update", [parsed.data.leadId])).rows[0];
    if (!lead || !ownsLead(token, lead)) { await db.query("rollback"); return NextResponse.json({ error: "Form session expired." }, { status: 403 }); }
    if (!lead.preferences_completed_at) { await db.query("rollback"); return NextResponse.json({ error: "Complete your preferences first." }, { status: 400 }); }
    const row = (await db.query(`select * from otp_request where lead_capture_id=$1 and purpose='LEAD_VERIFY'
      and channel='EMAIL' order by created_at desc limit 1 for update`, [lead.id])).rows[0];
    if (!row || row.target !== lead.email || new Date(row.expires_at).getTime() <= Date.now() || row.attempts >= 5) {
      await db.query("rollback"); return NextResponse.json({ error: "Code expired. Request a new code." }, { status: 400 });
    }
    if (!verifyOtpHash(parsed.data.otp, row.otp_hash)) {
      await db.query("update otp_request set attempts=attempts+1 where id=$1", [row.id]);
      await db.query("commit"); return NextResponse.json({ error: "Incorrect code. Please try again." }, { status: 400 });
    }
    if (!row.verified_at) {
      await db.query("update otp_request set verified_at=now() where id=$1", [row.id]);
      await db.query("update lead_capture set email_otp_verified=true,email_verified_at=now(),updated_at=now() where id=$1", [lead.id]);
      await db.query("insert into lead_event (lead_capture_id,event_type,metadata) values ($1,'EMAIL_OTP_VERIFIED','{}'::jsonb)", [lead.id]);
    }
    await db.query("commit");
    const response = NextResponse.json({ ok: true });
    response.cookies.set("uv_compare_access", `${lead.id}.${token}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 86400 });
    return response;
  } catch (error) { await db.query("rollback"); throw error; }
  finally { db.release(); }
}
