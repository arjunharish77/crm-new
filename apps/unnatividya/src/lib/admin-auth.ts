import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { query } from "@/lib/db";

export const adminSessionCookieName = "uv_admin_session";
const sessionTtlSeconds = 60 * 60 * 8;

export type AdminSession = {
  userId: string;
  email: string;
  role: "ADMIN" | "EDITOR" | "VIEWER";
  iat: number;
  exp: number;
};

export type CmsUser = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: "ADMIN" | "EDITOR" | "VIEWER";
  two_factor_enabled: boolean;
};

// F26 fix (WP16): this used to silently fall back to a hardcoded, publicly-known string whenever
// the env var was unset -- in production that means every admin session cookie is forgeable by
// anyone who has read this file (or the audit bundle). Fail closed instead: refuse to sign or
// verify anything in production without a real configured secret, rather than quietly accepting
// a known one. Dev/test keep the fallback so local setup still works with zero configuration.
function sessionSecret() {
  const secret = process.env.UNNATIVIDYA_SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "UNNATIVIDYA_SESSION_SECRET must be set in production -- refusing to sign or verify CMS admin sessions with the insecure development default.",
    );
  }
  return "dev-secret-change-me";
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createAdminSessionToken(input: Omit<AdminSession, "exp" | "iat">) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({ ...input, iat: now, exp: now + sessionTtlSeconds }));
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminSessionToken(token: string | undefined): AdminSession | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as AdminSession;
    if (!parsed.userId || !parsed.email || !parsed.role || !parsed.exp || !parsed.iat) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// F26 fix (WP16): a validly-signed, unexpired token only proves a session was issued at some
// point in the past -- it says nothing about whether that admin still exists, is still active,
// still holds the same role, or has been revoked since. Reload the authoritative row from
// Postgres on every call so a deactivated admin (is_active = false) or a forced-revocation
// (session_valid_after bumped past this token's issued-at time) stops working immediately
// instead of silently working until the cookie's own 8h expiry.
export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const parsed = verifyAdminSessionToken(cookieStore.get(adminSessionCookieName)?.value);
  if (!parsed) return null;

  const result = await query<{ role: CmsUser["role"]; is_active: boolean; session_valid_after: string }>(
    `select role, is_active, session_valid_after from cms_user where id = $1`,
    [parsed.userId],
  );
  const row = result.rows[0];
  if (!row || !row.is_active) return null;

  // Compare at whole-second granularity on both sides. `iat` is already floored to a whole second
  // (see createAdminSessionToken), but session_valid_after is a full-precision timestamptz -- a
  // brand-new account's row can carry e.g. :00.900 while the very next request's token gets
  // iat = floor(:00.950) = :00 (i.e. :00.000). Comparing raw milliseconds would then read
  // session_valid_after (900ms into the second) as "later than" iat (0ms into the same second)
  // and reject a session that was issued correctly, purely from an artifact of iat's own
  // truncation -- not a real revocation. Flooring session_valid_after to seconds first removes
  // that asymmetry.
  const validAfterSeconds = Math.floor(new Date(row.session_valid_after).getTime() / 1000);
  if (validAfterSeconds > parsed.iat) return null;

  return { ...parsed, role: row.role };
}

export async function findCmsUserByEmail(email: string) {
  const result = await query<CmsUser>(
    `select id, email, name, password_hash, role, two_factor_enabled
     from cms_user
     where lower(email) = lower($1)
     limit 1`,
    [email],
  );
  return result.rows[0] || null;
}

export async function isAdminTwoFactorRequired(user: CmsUser) {
  const setting = await query<{ value: boolean }>(
    `select coalesce((value)::boolean, true) as value
     from site_setting
     where key = 'cms.admin2fa.enabled'
     limit 1`,
  );
  const globalEnabled = setting.rows[0]?.value ?? true;
  return globalEnabled && user.two_factor_enabled;
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionTtlSeconds,
  };
}
