import { NextResponse } from "next/server";
import { z } from "zod";
import {
  adminCookieOptions,
  adminSessionCookieName,
  createAdminSessionToken,
  findCmsUserByEmail,
  isAdminTwoFactorRequired,
} from "@/lib/admin-auth";
import { query } from "@/lib/db";
import { createOtp, hashOtp } from "@/lib/otp";
import { verifyPassword } from "@/lib/password";
import { sendOtpEmail } from "@/lib/zeptomail";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid login details" }, { status: 400 });
  }

  const user = await findCmsUserByEmail(parsed.data.email);
  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    await query(
      `insert into cms_audit_log (action, entity_type, metadata)
       values ('CMS_LOGIN_FAILED', 'cms_user', $1)`,
      [{ email: parsed.data.email.toLowerCase() }],
    );
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  if (!(await isAdminTwoFactorRequired(user))) {
    const response = NextResponse.json({ ok: true, requiresOtp: false });
    response.cookies.set(
      adminSessionCookieName,
      createAdminSessionToken({ userId: user.id, email: user.email, role: user.role }),
      adminCookieOptions(),
    );
    await query(
      `insert into cms_audit_log (user_id, action, entity_type, entity_id, metadata)
       values ($1, 'CMS_LOGIN_SUCCESS', 'cms_user', $1, $2)`,
      [user.id, { twoFactor: false }],
    );
    return response;
  }

  const otp = createOtp();
  const result = await sendOtpEmail({
    toEmail: user.email,
    toName: user.name,
    otp,
    purpose: "admin",
  });

  await query(
    `insert into otp_request (
       cms_user_id, channel, purpose, target, otp_hash, expires_at, provider, provider_status
     )
     values ($1, 'EMAIL', 'ADMIN_2FA', $2, $3, now() + interval '10 minutes', 'zeptomail', $4)`,
    [user.id, user.email, hashOtp(otp), String(result.status)],
  );
  await query(
    `insert into cms_audit_log (user_id, action, entity_type, entity_id, metadata)
     values ($1, 'CMS_ADMIN_OTP_SENT', 'cms_user', $1, $2)`,
    [user.id, { provider: "zeptomail", status: result.status }],
  );

  return NextResponse.json({
    ok: result.ok,
    requiresOtp: true,
    email: user.email.replace(/^(.{2}).*(@.*)$/, "$1***$2"),
  });
}
