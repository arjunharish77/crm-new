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

async function verifyAdminCookie(token: string | undefined) {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const secret = process.env.UNNATIVIDYA_SESSION_SECRET || "dev-secret-change-me";
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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (publicAdminPaths.has(pathname)) return NextResponse.next();

  const valid = await verifyAdminCookie(request.cookies.get(adminSessionCookieName)?.value);
  if (valid) return NextResponse.next();

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
