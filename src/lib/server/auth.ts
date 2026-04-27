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

  let { data: userRecord, error: userError }: { data: any; error: any } = await supabase
    .from("User")
    .select("id,email,name,tenantId,roleId,permissionTemplateId")
    .eq("id", payload.sub)
    .maybeSingle();

  if (userError && /permissionTemplateId|schema cache|does not exist/i.test(userError.message ?? "")) {
    const fallback = await supabase
      .from("User")
      .select("id,email,name,tenantId,roleId")
      .eq("id", payload.sub)
      .maybeSingle();
    userRecord = fallback.data;
    userError = fallback.error;
  }

  if (userError || !userRecord) {
    return null;
  }

  let roleResultPromise = userRecord.roleId
      ? supabase
          .from("Role")
          .select("id,name,permissionTemplateId,permissions")
          .eq("id", userRecord.roleId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });
  let [{ data: roleRecord, error: roleError }, { data: platformAdminRecord }, tenantFeatureResult] = await Promise.all([
    roleResultPromise,
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

  if (roleError && /permissionTemplateId|schema cache|does not exist/i.test(roleError.message ?? "")) {
    const fallback = await (userRecord.roleId
      ? supabase
          .from("Role")
          .select("id,name,permissions")
          .eq("id", userRecord.roleId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }));
    roleRecord = fallback.data ? { ...fallback.data, permissionTemplateId: null } : null;
  }

  let salesGroupTemplateIds: string[] = [];
  if (userRecord.tenantId) {
    const memberResult = await supabase
      .from("SalesGroupMember")
      .select("groupId")
      .eq("tenantId", userRecord.tenantId)
      .eq("userId", userRecord.id);
    const groupIds = (memberResult.data ?? []).map((member: any) => member.groupId).filter((id: unknown) => typeof id === "string" && id.length > 0);
    if (groupIds.length > 0) {
      const groupResult = await supabase
        .from("SalesGroup")
        .select("permissionTemplateId")
        .eq("tenantId", userRecord.tenantId)
        .in("id", groupIds);
      if (!groupResult.error || !/permissionTemplateId|schema cache|does not exist/i.test(groupResult.error.message ?? "")) {
        salesGroupTemplateIds = (groupResult.data ?? [])
          .map((group: any) => group.permissionTemplateId)
          .filter((id: unknown) => typeof id === "string" && id.length > 0);
      }
    }
  }

  const templateIds = [
    ...salesGroupTemplateIds,
    roleRecord?.permissionTemplateId,
    userRecord.permissionTemplateId,
  ].filter((id) => typeof id === "string" && id.length > 0);
  const templateResult = templateIds.length && userRecord.tenantId
    ? await supabase
        .from("PermissionTemplate")
        .select("id,name,permissions,isActive")
        .eq("tenantId", userRecord.tenantId)
        .eq("isActive", true)
        .in("id", templateIds)
    : { data: [], error: null };
  const permissionTemplates = templateResult.error && /does not exist|schema cache/i.test(templateResult.error.message ?? "")
    ? []
    : (templateResult.data ?? []).sort((a: any, b: any) => templateIds.indexOf(a.id) - templateIds.indexOf(b.id));

  return {
    id: userRecord.id,
    email: userRecord.email,
    name: userRecord.name,
    tenantId: userRecord.tenantId,
    roleId: userRecord.roleId,
    permissionTemplateId: userRecord.permissionTemplateId ?? null,
    role: roleRecord,
    permissionTemplates,
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
