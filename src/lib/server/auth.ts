import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

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

  const supabase = createSupabaseAdminClient();

  const { data: userRecord, error: userError } = await supabase
    .from("User")
    .select("id,email,name,tenantId,roleId")
    .eq("id", payload.sub)
    .maybeSingle();

  if (userError || !userRecord) {
    return null;
  }

  const [{ data: roleRecord }, { data: platformAdminRecord }, tenantFeatureResult] = await Promise.all([
    userRecord.roleId
      ? supabase
          .from("Role")
          .select("id,name,permissions")
          .eq("id", userRecord.roleId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("PlatformAdmin")
      .select("id,isActive")
      .eq("userId", userRecord.id)
      .eq("isActive", true)
      .maybeSingle(),
    userRecord.tenantId
      ? supabase
          .from("TenantFeature")
          .select("opportunityEnabled,automationEnabled,advancedReporting,apiAccessEnabled,salesGroupsEnabled,formBuilderEnabled")
          .eq("tenantId", userRecord.tenantId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  return {
    id: userRecord.id,
    email: userRecord.email,
    name: userRecord.name,
    tenantId: userRecord.tenantId,
    roleId: userRecord.roleId,
    role: roleRecord,
    isPlatformAdmin: !!platformAdminRecord,
    platformAdminId: platformAdminRecord?.id ?? null,
    isImpersonating: !!payload.isImpersonating,
    impersonatedBy: payload.impersonatedBy ?? null,
    features: tenantFeatureResult?.data ?? {
      opportunityEnabled: true,
      automationEnabled: true,
      salesGroupsEnabled: true,
      formBuilderEnabled: true,
      advancedReporting: false,
      apiAccessEnabled: false,
    },
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
