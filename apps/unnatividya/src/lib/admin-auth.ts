import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { query } from "@/lib/db";

export const adminSessionCookieName = "uv_admin_session";
const sessionTtlSeconds = 60 * 60 * 8;

export type AdminSession = {
  userId: string;
  email: string;
  role: "ADMIN" | "EDITOR" | "VIEWER";
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

function sessionSecret() {
  return process.env.UNNATIVIDYA_SESSION_SECRET || "dev-secret-change-me";
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

export function createAdminSessionToken(input: Omit<AdminSession, "exp">) {
  const payload = base64UrlEncode(JSON.stringify({ ...input, exp: Math.floor(Date.now() / 1000) + sessionTtlSeconds }));
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
    if (!parsed.userId || !parsed.email || !parsed.role || !parsed.exp) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(adminSessionCookieName)?.value);
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
