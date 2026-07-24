import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import * as pgAuth from "@/lib/repositories/auth-admin-postgres";

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
};

const TOKEN_COOKIE = "token";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("Missing env var: JWT_SECRET");
  }

  return secret;
}

export async function signAuthToken(payload: JwtPayload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
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
  return {
    ...user,
    isImpersonating: !!payload.isImpersonating,
    impersonatedBy: payload.impersonatedBy ?? null,
  };
}

export async function requireCurrentUser(request?: Request) {
  const user = await getCurrentUser(request);

  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

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
