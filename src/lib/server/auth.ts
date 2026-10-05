import jwt, { type SignOptions } from "jsonwebtoken";
import { cookies } from "next/headers";
import * as pgAuth from "@/lib/repositories/auth-admin-postgres";
import { assertGeneralRateLimit } from "@/lib/server/rate-limit";
import { validateSession, touchSessionIfStale } from "@/lib/server/sessions";
import { beginRequestContext, enterTenantContext } from "@/lib/db/tenant-context";
import { canUseModule, moduleRequirementForRequest } from "@/lib/module-access";
import { ModuleAccessError } from "@/lib/server/module-access-error";

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
    const payload = jwt.verify(token, getJwtSecret()) as JwtPayload & {
      mfaPending?: boolean;
      passwordChangePending?: boolean;
    };
    // F01 fix: signMfaPendingToken/signPasswordChangeToken share this same signing secret and
    // are structurally valid JwtPayloads (both carry "sub"), so without this check a pending
    // MFA/password-change token would pass signature verification here and authenticate as a
    // full session -- these two token purposes have their own dedicated, narrowly-scoped
    // verification functions (verifyMfaPendingToken/verifyPasswordChangeToken) and must never
    // be accepted on the normal authenticated-request path.
    if (payload.mfaPending || payload.passwordChangePending) return null;
    return payload;
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

// Shared by getCurrentUser (cookie/bearer path) and the SSE route's query-string token path --
// F05 fix: the SSE route previously loaded the user straight from the token's "sub" without
// checking tenant suspension or validating the session row, so a suspended tenant's user or a
// revoked session could still open a live notification stream. Every consumer of a verified
// token now goes through the exact same policy.
async function resolveUserFromPayload(payload: JwtPayload) {
  const user = await pgAuth.getCurrentUserById(payload.sub);
  if (!user) return null;
  // changeTenantStatus (and its suspend/unsuspend API routes) has always updated
  // Tenant.status, but nothing ever checked it here -- a "suspended" tenant's users could log
  // in and use the app exactly as before. Platform admins are exempt so they can still
  // investigate/unsuspend a tenant they just locked out.
  if (user.tenantStatus === "SUSPENDED" && !user.isPlatformAdmin) return null;
  // A deactivated or removed user is signed out on their next request, not when their token
  // expires (round-2 plan S3). Same rule as sign-in (api/auth/login): platform admins are exempt
  // from the status check, never from removal.
  if (user.deletedAt) return null;
  if (!user.isPlatformAdmin && user.status && user.status !== "ACTIVE") return null;

  // Session-level enforcement (revocation, idle timeout, absolute timeout) -- see sessions.ts.
  // Every sign-in has issued a session id for longer than a token lives, so a token without one
  // can't be revoked and is refused (round-2 plan S19).
  if (!payload.sid) return null;
  const validation = await validateSession(payload.sid);
  if (!validation.valid) return null;
  touchSessionIfStale(payload.sid, validation.row.lastActiveAt).catch(() => undefined);

  // WP07 (F04): make this request's tenant/user/role visible to the db query layer for the rest
  // of this async chain (see tenant-context.ts) so query()/queryOne()/execute() can set a
  // transaction-local "app.tenant_id" for RLS without every one of their ~90 call sites needing a
  // user argument threaded through. A platform admin with no tenantId simply clears tenant
  // context (still correct: their cross-tenant reads run on the unrestricted pool, gated
  // separately -- see getRuntimePool()).
  enterTenantContext({ tenantId: user.tenantId ?? null, userId: user.id, roleId: user.roleId ?? null });

  return {
    ...user,
    isImpersonating: !!payload.isImpersonating,
    impersonatedBy: payload.impersonatedBy ?? null,
    sessionId: payload.sid ?? null,
  };
}

// Public entry point for callers that already have a raw token from somewhere other than the
// cookie/Authorization-header convention (currently: the notifications SSE route's query-string
// token, since EventSource cannot set a custom header). Applies the identical purpose/
// suspension/session checks as getCurrentUser -- see resolveUserFromPayload.
export async function getUserFromToken(token: string) {
  const payload = await verifyAuthToken(token);
  if (!payload) return null;
  return resolveUserFromPayload(payload);
}

export async function getCurrentUser(request?: Request) {
  const bearerToken = request ? readBearerToken(request) : null;
  const cookieSession = bearerToken ? null : await getSessionFromCookie();
  const token = bearerToken ?? cookieSession?.token ?? null;

  if (!token) {
    return null;
  }

  return getUserFromToken(token);
}

export function requireCurrentUser(request?: Request) {
  // Round-2 plan O5: open the request's context synchronously, before any await, so the route
  // (and its error handler) sees the workspace, user and request id that sign-in fills in.
  if (request) beginRequestContext(request.headers.get("x-request-id"));
  return requireCurrentUserResolved(request);
}

async function requireCurrentUserResolved(request?: Request) {
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
  if (request) assertModuleAccessForRequest(user, request);
  if (request && user.isImpersonating) assertImpersonationAllowsRequest(request);

  return user;
}

// Round-2 plan S11: impersonation is for seeing and fixing records as the person sees them. It
// must not change how anyone signs in or what they may access, so these areas are read-only
// while impersonating: own password and two-factor, users, roles, permission templates,
// sessions, API keys and SCIM settings.
const IMPERSONATION_READ_ONLY_PREFIXES = [
  "/api/auth/change-password",
  "/api/auth/change-expired-password",
  "/api/mfa/",
  "/api/admin/users/",
  "/api/admin/scim/",
  "/api/users",
  "/api/roles",
  "/api/permission-templates",
  "/api/sessions",
  "/api/settings/api-keys",
];

export function impersonationBlocksRequest(method: string, pathname: string) {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return false;
  return IMPERSONATION_READ_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
}

function assertImpersonationAllowsRequest(request: Request) {
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return;
  }
  if (impersonationBlocksRequest(request.method, pathname)) throw new Error("IMPERSONATION_BLOCKED:sign_in_and_access_changes");
}

// Role module permissions (lib/module-access.ts): "none" blocks a module's API, "read" allows
// reads only, "write" create and edit, "full" also delete. Admins are never limited.
function assertModuleAccessForRequest(user: Awaited<ReturnType<typeof getCurrentUser>> & object, request: Request) {
  if (user.isTenantAdmin || user.isPlatformAdmin) return;
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return;
  }
  const requirement = moduleRequirementForRequest(request.method, pathname);
  if (!requirement) return;
  if (!canUseModule(user as any, requirement.module.key, requirement.need)) throw new ModuleAccessError(requirement.module.label, requirement.need);
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
