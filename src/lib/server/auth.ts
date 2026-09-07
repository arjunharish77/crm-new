import jwt, { type SignOptions } from "jsonwebtoken";
import { cookies } from "next/headers";
import * as pgAuth from "@/lib/repositories/auth-admin-postgres";
import { assertGeneralRateLimit } from "@/lib/server/rate-limit";
import { validateSession, touchSessionIfStale } from "@/lib/server/sessions";

type JwtPayload = {
  sub: string;
  email: string;
  tenantId: string | null;
  roleId?: string | null;
  isPlatformAdmin?: boolean;
  platformAdminId?: string | null;
  name?: string;
  isImpersonating?: boolean;
  impersonatedBy?: string | null;
  // References a real UserSession row (see sessions.ts) -- optional so a token issued before
  // this feature shipped (or a test that hand-builds a payload) doesn't crash getCurrentUser;
  // it just skips session-level enforcement for that one token until it naturally expires.
  sid?: string;
};

const TOKEN_COOKIE = "token";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("Missing env var: JWT_SECRET");
  }

  return secret;
}

export async function signAuthToken(payload: JwtPayload, opts: { expiresIn?: SignOptions["expiresIn"] } = {}) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: opts.expiresIn ?? "7d" });
}

// A distinct, narrowly-scoped token for the gap between "password verified" and "MFA code
// verified" -- deliberately NOT a real JwtPayload (no roleId/isPlatformAdmin/sid), so even if
// leaked it can only be used against POST /api/auth/mfa/verify, which does nothing but check an
// MFA code; it can't be presented anywhere a real session token would be accepted. 5-minute
// expiry -- long enough to type a 6-digit code, short enough that a captured token is useless
// shortly after.
export async function signMfaPendingToken(userId: string) {
  return jwt.sign({ sub: userId, mfaPending: true }, getJwtSecret(), { expiresIn: "5m" });
}

export async function verifyMfaPendingToken(token: string): Promise<string | null> {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { sub: string; mfaPending?: boolean };
    return payload.mfaPending ? payload.sub : null;
  } catch {
    return null;
  }
}

// Same shape/reasoning as signMfaPendingToken -- issued when login-route.ts finds the user's
// password has passed its policy-driven expiry, to bridge "password already proven correct at
// login" to "here's a new one" without a second full login. Deliberately not a real JwtPayload
// for the same reason: leaking it only lets someone set a new password (still bound to this one
// account, still requires the new password to pass strength/reuse checks), not access the app.
export async function signPasswordChangeToken(userId: string) {
  return jwt.sign({ sub: userId, passwordChangePending: true }, getJwtSecret(), { expiresIn: "5m" });
}

export async function verifyPasswordChangeToken(token: string): Promise<string | null> {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { sub: string; passwordChangePending?: boolean };
    return payload.passwordChangePending ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function readTokenFromRequest() {
  const cookieStore = await cookies();
  return cookieStore.get(TOKEN_COOKIE)?.value ?? null;
}

export function readBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length);
}

export async function verifyAuthToken(token: string): Promise<JwtPayload | null> {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch {
    return null;
  }
}

export async function getSessionFromCookie() {
  const token = await readTokenFromRequest();

  if (!token) {
    return null;
  }

  const payload = await verifyAuthToken(token);
  if (!payload) {
    return null;
  }

  return { token, payload };
}

export async function getCurrentUser(request?: Request) {
  const bearerToken = request ? readBearerToken(request) : null;
  const cookieSession = bearerToken ? null : await getSessionFromCookie();
  const token = bearerToken ?? cookieSession?.token ?? null;

  if (!token) {
    return null;
  }

  const payload = await verifyAuthToken(token);
  if (!payload) {
    return null;
  }

  const user = await pgAuth.getCurrentUserById(payload.sub);
  if (!user) return null;
  // changeTenantStatus (and its suspend/unsuspend API routes) has always updated
  // Tenant.status, but nothing ever checked it here -- a "suspended" tenant's users could log
  // in and use the app exactly as before. Platform admins are exempt so they can still
  // investigate/unsuspend a tenant they just locked out.
  if (user.tenantStatus === "SUSPENDED" && !user.isPlatformAdmin) return null;

  // Session-level enforcement (revocation, idle timeout, absolute timeout) -- see sessions.ts.
  // A token with no "sid" (issued before this feature shipped) skips this entirely rather than
  // being treated as invalid, so already-logged-in users aren't force-logged-out by this
  // deploy; it naturally stops applying once that token's own JWT expiry passes.
  if (payload.sid) {
    const validation = await validateSession(payload.sid);
    if (!validation.valid) return null;
    touchSessionIfStale(payload.sid, validation.row.lastActiveAt).catch(() => undefined);
  }

  return {
    ...user,
    isImpersonating: !!payload.isImpersonating,
    impersonatedBy: payload.impersonatedBy ?? null,
    sessionId: payload.sid ?? null,
  };
}

export async function requireCurrentUser(request?: Request) {
  const user = await getCurrentUser(request);

  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  // General per-user/per-tenant abuse ceiling -- checked here, not in getCurrentUser, since
  // that's also called for non-throwing/page-level auth checks (dashboard layout renders,
  // etc.) that fire far more often than real user actions and would make this hard to
  // calibrate without false positives. requireCurrentUser is what nearly every API route
  // actually calls to gate a real action.
  await assertGeneralRateLimit(user);

  return user;
}

export async function requirePlatformAdmin(request?: Request) {
  const user = await requireCurrentUser(request);

  if (!user.isPlatformAdmin) {
    throw new Error("FORBIDDEN");
  }

  return user;
}

// Reject requests from PARTNER-role users. Most existing tenant API routes only check
// requireCurrentUser (authenticated), not role authorization — there's no general RBAC
// enforcement in this app today. Since partners are external users, routes touching
// Internal/admin data paths use this instead of propagating nullable tenant context into new surfaces.
export async function requireInternalUser(request?: Request) {
  const user = await requireCurrentUser(request);

  if (user.isPartner) {
    throw new Error("FORBIDDEN");
  }

  return user;
}

// Tenant-admin gate for new admin-only surface (partner management, commission rules,
// payout approval). Mirrors the "Tenant Admin" seed role's permissions shape
// (recordAccess: "ALL" or modules.admin === "full") since no requireTenantAdmin
// helper existed anywhere in the app prior to this.
export async function requireTenantAdmin(request?: Request) {
  const user = await requireCurrentUser(request);

  if (!user.isPlatformAdmin && !user.isTenantAdmin) {
    throw new Error("FORBIDDEN");
  }

  return user;
}
