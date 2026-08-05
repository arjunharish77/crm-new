import { NextResponse } from "next/server";
import { adminSessionCookieName, getAdminSession } from "@/lib/admin-auth";
import { query } from "@/lib/db";

export async function POST() {
  const session = await getAdminSession();
  if (session) {
    await query(
      `insert into cms_audit_log (user_id, action, entity_type, entity_id, metadata)
       values ($1, 'CMS_LOGOUT', 'cms_user', $2, '{}'::jsonb)`,
      [session.userId, session.userId],
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminSessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
