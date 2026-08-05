import { NextResponse } from "next/server";
import { z } from "zod";
import { adminCookieOptions, adminSessionCookieName, createAdminSessionToken, findCmsUserByEmail } from "@/lib/admin-auth";
import { query } from "@/lib/db";
import { verifyOtpHash } from "@/lib/otp";

const schema = z.object({
  email: z.string().trim().email(),
  otp: z.string().trim().min(4).max(6),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
  }

  const user = await findCmsUserByEmail(parsed.data.email);
  if (!user) {
    return NextResponse.json({ error: "Invalid verification code" }, { status: 401 });
  }

  const latest = await query<{ id: string; otp_hash: string; expires_at: string; attempts: number }>(
    `select id, otp_hash, expires_at, attempts
     from otp_request
     where cms_user_id = $1 and purpose = 'ADMIN_2FA' and channel = 'EMAIL' and verified_at is null
     order by created_at desc
     limit 1`,
    [user.id],
  );
  const requestRow = latest.rows[0];
  if (!requestRow) {
    return NextResponse.json({ error: "Verification code not found" }, { status: 404 });
  }
  if (new Date(requestRow.expires_at).getTime() < Date.now() || requestRow.attempts >= 5) {
    return NextResponse.json({ error: "Verification code expired" }, { status: 400 });
  }
  if (!verifyOtpHash(parsed.data.otp, requestRow.otp_hash)) {
    await query(`update otp_request set attempts = attempts + 1 where id = $1`, [requestRow.id]);
    return NextResponse.json({ error: "Verification code invalid" }, { status: 400 });
  }

  await query(`update otp_request set verified_at = now() where id = $1`, [requestRow.id]);
  await query(
    `insert into cms_audit_log (user_id, action, entity_type, entity_id, metadata)
     values ($1, 'CMS_LOGIN_SUCCESS', 'cms_user', $1, $2)`,
    [user.id, { twoFactor: true }],
  );

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    adminSessionCookieName,
    createAdminSessionToken({ userId: user.id, email: user.email, role: user.role }),
    adminCookieOptions(),
  );
  return response;
}
