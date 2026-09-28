import { NextResponse, type NextRequest } from "next/server";

const adminSessionCookieName = "uv_admin_session";

const publicAdminPaths = new Set([
  "/admin/login",
  "/admin/setup",
  "/api/admin/setup",
  "/api/admin/login/request",
  "/api/admin/login/verify",
  "/api/admin/logout",
]);

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function bytesToBase64Url(bytes: ArrayBuffer) {
  let binary = "";
  new Uint8Array(bytes).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// F26 fix (WP16): must stay in lockstep with admin-auth.ts's own sessionSecret() -- this edge
// runtime can't import that Node module, so the same fail-closed rule (no silently-guessable
// fallback in production) is duplicated here rather than shared.
function sessionSecret() {
  const secret = process.env.UNNATIVIDYA_SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "UNNATIVIDYA_SESSION_SECRET must be set in production -- refusing to verify CMS admin sessions with the insecure development default.",
    );
  }
  return "dev-secret-change-me";
}

async function verifyAdminCookie(token: string | undefined) {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const secret = sessionSecret();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = bytesToBase64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  if (expected !== signature) return false;

  try {
    const session = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as { exp?: number };
    return Boolean(session.exp && session.exp >= Math.floor(Date.now() / 1000));
  } catch {
    return false;
  }
}

// F26 fix (WP16): admin/layout.tsx needs to tell a legitimately-public admin page (login, setup)
// apart from every other admin page so it can redirect a revoked/deactivated session to login
// instead of silently rendering that page's content with no sidebar -- see its own comment for
// why this can't just rely on this proxy's own (cheaper, DB-less) check.
function withPathnameHeader(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-uv-admin-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (publicAdminPaths.has(pathname)) return withPathnameHeader(request);

  const valid = await verifyAdminCookie(request.cookies.get(adminSessionCookieName)?.value);
  if (valid) return withPathnameHeader(request);

  if (pathname.startsWith("/api/admin")) {
    return NextResponse.json({ error: "CMS admin login required" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/admin/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
