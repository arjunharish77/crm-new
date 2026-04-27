import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { signAuthToken } from "@/lib/server/auth";

type PlatformBootstrapInput = {
  name: string;
  email: string;
  password: string;
};

type CreateTenantInput = {
  name: string;
  plan?: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  opportunityEnabled?: boolean;
};

type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  roleId: string;
  permissionTemplateId?: string;
  teamId?: string;
  managerId?: string;
  skills?: Record<string, string[] | string>;
};

type UpdateUserInput = {
  name?: string;
  roleId?: string;
  permissionTemplateId?: string;
  teamId?: string;
  managerId?: string;
  skills?: Record<string, string[] | string>;
  status?: string;
};

type RoleInput = {
  name: string;
  description?: string;
  permissionTemplateId?: string | null;
  permissions: {
    modules: Record<string, string>;
    recordAccess: string;
  };
};

type PermissionTemplateInput = {
  name: string;
  description?: string;
  permissions: Record<string, unknown>;
  isActive?: boolean;
};

function asUuidOrNull(value: unknown) {
  const text = typeof value === "string" ? value : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

export async function getBootstrapStatus() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("PlatformAdmin")
    .select("id")
    .eq("isActive", true)
    .limit(1);

  if (error) {
    throw error;
  }

  return {
    needsBootstrap: !data || data.length === 0,
  };
}

export async function bootstrapPlatformAdmin(input: PlatformBootstrapInput) {
  const supabase = createSupabaseAdminClient();
  const status = await getBootstrapStatus();

  if (!status.needsBootstrap) {
    throw new Error("BOOTSTRAP_ALREADY_COMPLETE");
  }

  const roleId = randomUUID();
  const userId = randomUUID();
  const platformAdminId = randomUUID();
  const passwordHash = await bcrypt.hash(input.password, 10);
  const now = new Date().toISOString();

  await supabase.from("Role").insert({
    id: roleId,
    tenantId: null,
    name: "Super Admin",
    description: "Platform administrator with full access",
    permissions: {
      modules: {
        leads: "full",
        opportunities: "full",
        activities: "full",
        admin: "full",
      },
      recordAccess: "ALL",
      platform: true,
    },
    createdAt: now,
    updatedAt: now,
  });

  await supabase.from("User").insert({
    id: userId,
    tenantId: null,
    email: input.email.toLowerCase(),
    name: input.name,
    password: passwordHash,
    status: "ACTIVE",
    roleId,
    createdAt: now,
    updatedAt: now,
  });

  await supabase.from("PlatformAdmin").insert({
    id: platformAdminId,
    userId,
    permissions: {
      tenants: true,
      users: true,
      roles: true,
      billing: true,
    },
    canImpersonate: true,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}

async function createCoreObjectDefinitions(tenantId: string) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const leadObjectId = randomUUID();
  const opportunityObjectId = randomUUID();
  const activityObjectId = randomUUID();

  await supabase.from("ObjectDefinition").insert([
    { id: leadObjectId, tenantId, name: "lead", label: "Lead", isCustom: false, createdAt: now, updatedAt: now },
    { id: opportunityObjectId, tenantId, name: "opportunity", label: "Opportunity", isCustom: false, createdAt: now, updatedAt: now },
    { id: activityObjectId, tenantId, name: "activity", label: "Activity", isCustom: false, createdAt: now, updatedAt: now },
  ]);

  return {
    leadObjectId,
    opportunityObjectId,
    activityObjectId,
  };
}

async function seedDefaultOpportunityType(tenantId: string, objectId: string) {
  const supabase = createSupabaseAdminClient();
  const opportunityTypeId = randomUUID();
  const now = new Date().toISOString();

  await supabase.from("OpportunityType").insert({
    id: opportunityTypeId,
    tenantId,
    objectId,
    name: "Sales Pipeline",
    description: "Standard sales process",
    order: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  await supabase.from("StageDefinition").insert([
    { id: randomUUID(), tenantId, opportunityTypeId, name: "New", order: 1, probability: 10, color: "#94a3b8", isClosed: false, isWon: false, createdAt: now, updatedAt: now },
    { id: randomUUID(), tenantId, opportunityTypeId, name: "Qualified", order: 2, probability: 30, color: "#60a5fa", isClosed: false, isWon: false, createdAt: now, updatedAt: now },
    { id: randomUUID(), tenantId, opportunityTypeId, name: "Won", order: 3, probability: 100, color: "#22c55e", isClosed: true, isWon: true, createdAt: now, updatedAt: now },
    { id: randomUUID(), tenantId, opportunityTypeId, name: "Lost", order: 4, probability: 0, color: "#ef4444", isClosed: true, isWon: false, createdAt: now, updatedAt: now },
  ]);
}

export async function listTenantUsers(tenantId: string | null) {
  const supabase = createSupabaseAdminClient();
  const usersQuery = supabase
    .from("User")
    .select("id,name,email,status,roleId,permissionTemplateId,managerId,teamId,skills,createdAt")
    .order("createdAt", { ascending: false });

  const scopedUsersQuery = tenantId
    ? usersQuery.eq("tenantId", tenantId)
    : usersQuery.is("tenantId", null);

  let { data: users, error }: { data: any[] | null; error: any } = await scopedUsersQuery;
  if (error && /teamId|permissionTemplateId|schema cache|does not exist/i.test(error.message ?? "")) {
    const fallbackUsersQuery = supabase
      .from("User")
      .select("id,name,email,status,roleId,managerId,skills,createdAt")
      .order("createdAt", { ascending: false });
    const scopedFallbackQuery = tenantId
      ? fallbackUsersQuery.eq("tenantId", tenantId)
      : fallbackUsersQuery.is("tenantId", null);
    const fallback = await scopedFallbackQuery;
    users = fallback.data;
    error = fallback.error;
  }
  if (error) throw error;

  const rolesQuery = supabase
    .from("Role")
    .select("id,name,description,permissionTemplateId,permissions,createdAt,updatedAt");
  const scopedRolesQuery = tenantId
    ? rolesQuery.eq("tenantId", tenantId)
    : rolesQuery.is("tenantId", null);
  const { data: roles, error: roleError } = await scopedRolesQuery;
  if (roleError) throw roleError;

  const roleMap = new Map((roles ?? []).map((role) => [role.id, role]));
  const userMap = new Map((users ?? []).map((user) => [user.id, user]));
  const teamIds = [...new Set((users ?? []).map((user: any) => user.teamId).filter(Boolean))];
  const teamResult = teamIds.length && tenantId
    ? await supabase.from("Team").select("id,name").eq("tenantId", tenantId).in("id", teamIds)
    : { data: [], error: null };
  if (teamResult.error && !/does not exist|schema cache/i.test(teamResult.error.message ?? "")) throw teamResult.error;
  const teamMap = new Map((teamResult.data ?? []).map((team: any) => [team.id, team]));

  return (users ?? []).map((user) => ({
    ...user,
      role: user.roleId ? roleMap.get(user.roleId) ?? undefined : undefined,
    manager: user.managerId
      ? (() => {
          const manager = userMap.get(user.managerId);
          return manager ? { id: manager.id, name: manager.name } : undefined;
        })()
      : undefined,
    team: (user as any).teamId ? teamMap.get((user as any).teamId) ?? undefined : undefined,
    teamId: (user as any).teamId ?? "",
    permissionTemplateId: (user as any).permissionTemplateId ?? "",
    lastLoginAt: null,
  }));
}

export async function createTenantScopedUser(tenantId: string, input: CreateUserInput) {
  const supabase = createSupabaseAdminClient();
  const passwordHash = await bcrypt.hash(input.password, 10);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("User")
    .insert({
      id: randomUUID(),
      tenantId,
      email: input.email.toLowerCase(),
      name: input.name,
      password: passwordHash,
      status: "ACTIVE",
      roleId: input.roleId,
      permissionTemplateId: asUuidOrNull(input.permissionTemplateId),
      teamId: input.teamId || null,
      managerId: input.managerId || null,
      skills: input.skills ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .select("id,name,email,status,roleId,permissionTemplateId,managerId,teamId,skills,createdAt")
    .single();

  if (error && /teamId|permissionTemplateId|schema cache|does not exist/i.test(error.message ?? "")) {
    const fallback = await supabase
      .from("User")
      .insert({
        id: randomUUID(),
        tenantId,
        email: input.email.toLowerCase(),
        name: input.name,
        password: passwordHash,
        status: "ACTIVE",
        roleId: input.roleId,
        managerId: input.managerId || null,
        skills: input.skills ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .select("id,name,email,status,roleId,managerId,skills,createdAt")
      .single();
    if (fallback.error) throw fallback.error;
    return { ...fallback.data, teamId: "" };
  }
  if (error) throw error;
  return data;
}

export async function updateTenantScopedUser(
  tenantId: string,
  userId: string,
  input: UpdateUserInput
) {
  const supabase = createSupabaseAdminClient();
  let result = await supabase
    .from("User")
    .update({
      name: input.name,
      roleId: input.roleId,
      permissionTemplateId: asUuidOrNull(input.permissionTemplateId),
      teamId: input.teamId || null,
      managerId: input.managerId || null,
      skills: input.skills ?? null,
      status: input.status,
    })
    .eq("tenantId", tenantId)
    .eq("id", userId)
    .select("id,name,email,status,roleId,permissionTemplateId,managerId,teamId,skills,createdAt")
    .single();

  if (result.error && /teamId|permissionTemplateId|schema cache|does not exist/i.test(result.error.message ?? "")) {
    result = await supabase
      .from("User")
      .update({
        name: input.name,
        roleId: input.roleId,
        managerId: input.managerId || null,
        skills: input.skills ?? null,
        status: input.status,
      })
      .eq("tenantId", tenantId)
      .eq("id", userId)
      .select("id,name,email,status,roleId,managerId,skills,createdAt")
      .single();
  }

  if (result.error) throw result.error;
  return { ...result.data, teamId: (result.data as any).teamId ?? input.teamId ?? "", permissionTemplateId: (result.data as any).permissionTemplateId ?? input.permissionTemplateId ?? "" };
}

export async function listTenantRoles(tenantId: string | null) {
  const supabase = createSupabaseAdminClient();
  const rolesQuery = supabase
    .from("Role")
    .select("id,name,description,permissionTemplateId,permissions,createdAt,updatedAt")
    .order("name", { ascending: true });

  const scopedRolesQuery = tenantId
    ? rolesQuery.eq("tenantId", tenantId)
    : rolesQuery.is("tenantId", null);

  const { data: roles, error } = await scopedRolesQuery;
  if (error && /permissionTemplateId|schema cache|does not exist/i.test(error.message ?? "")) {
    const fallbackQuery = supabase
      .from("Role")
      .select("id,name,description,permissions,createdAt,updatedAt")
      .order("name", { ascending: true });
    const scopedFallbackQuery = tenantId ? fallbackQuery.eq("tenantId", tenantId) : fallbackQuery.is("tenantId", null);
    const fallback = await scopedFallbackQuery;
    if (fallback.error) throw fallback.error;
    const users = await listTenantUsers(tenantId);
    const roleUsage = new Map<string, number>();
    users.forEach((user) => {
      if (user.roleId) roleUsage.set(user.roleId, (roleUsage.get(user.roleId) ?? 0) + 1);
    });
    return (fallback.data ?? []).map((role) => ({ ...role, permissionTemplateId: "", _count: { users: roleUsage.get(role.id) ?? 0 } }));
  }
  if (error) throw error;

  const users = await listTenantUsers(tenantId);
  const roleUsage = new Map<string, number>();
  users.forEach((user) => {
    if (user.roleId) {
      roleUsage.set(user.roleId, (roleUsage.get(user.roleId) ?? 0) + 1);
    }
  });

  return (roles ?? []).map((role) => ({
    ...role,
    _count: {
      users: roleUsage.get(role.id) ?? 0,
    },
  }));
}

export async function createTenantRole(tenantId: string, input: RoleInput) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("Role")
    .insert({
      id: randomUUID(),
      tenantId,
      name: input.name,
      description: input.description ?? null,
      permissionTemplateId: asUuidOrNull(input.permissionTemplateId),
      permissions: input.permissions,
      createdAt: now,
      updatedAt: now,
    })
    .select("id,name,description,permissionTemplateId,permissions,createdAt,updatedAt")
    .single();

  if (error && /permissionTemplateId|schema cache|does not exist/i.test(error.message ?? "")) {
    const fallback = await supabase
      .from("Role")
      .insert({
        id: randomUUID(),
        tenantId,
        name: input.name,
        description: input.description ?? null,
        permissions: input.permissions,
        createdAt: now,
        updatedAt: now,
      })
      .select("id,name,description,permissions,createdAt,updatedAt")
      .single();
    if (fallback.error) throw fallback.error;
    return { ...fallback.data, permissionTemplateId: "" };
  }
  if (error) throw error;
  return data;
}

export async function updateTenantRole(tenantId: string, roleId: string, input: RoleInput) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("Role")
    .update({
      name: input.name,
      description: input.description ?? null,
      permissionTemplateId: asUuidOrNull(input.permissionTemplateId),
      permissions: input.permissions,
    })
    .eq("tenantId", tenantId)
    .eq("id", roleId)
    .select("id,name,description,permissionTemplateId,permissions,createdAt,updatedAt")
    .single();

  if (error && /permissionTemplateId|schema cache|does not exist/i.test(error.message ?? "")) {
    const fallback = await supabase
      .from("Role")
      .update({
        name: input.name,
        description: input.description ?? null,
        permissions: input.permissions,
      })
      .eq("tenantId", tenantId)
      .eq("id", roleId)
      .select("id,name,description,permissions,createdAt,updatedAt")
      .single();
    if (fallback.error) throw fallback.error;
    return { ...fallback.data, permissionTemplateId: input.permissionTemplateId ?? "" };
  }
  if (error) throw error;
  return data;
}

export async function deleteTenantRole(tenantId: string, roleId: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("Role")
    .delete()
    .eq("tenantId", tenantId)
    .eq("id", roleId);

  if (error) throw error;
}

export async function listPermissionTemplatesForTenant(tenantId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("PermissionTemplate")
    .select("id,name,description,permissions,isActive,createdAt,updatedAt")
    .eq("tenantId", tenantId)
    .order("name", { ascending: true });

  if (error) {
    if (/does not exist|schema cache/i.test(error.message ?? "")) return [];
    throw error;
  }

  return data ?? [];
}

export async function createPermissionTemplateForTenant(tenantId: string, input: PermissionTemplateInput) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("PermissionTemplate")
    .insert({
      id: randomUUID(),
      tenantId,
      name: input.name,
      description: input.description ?? null,
      permissions: input.permissions ?? {},
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .select("id,name,description,permissions,isActive,createdAt,updatedAt")
    .single();

  if (error) throw error;
  return data;
}

export async function updatePermissionTemplateForTenant(tenantId: string, templateId: string, input: PermissionTemplateInput) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("PermissionTemplate")
    .update({
      name: input.name,
      description: input.description ?? null,
      permissions: input.permissions ?? {},
      isActive: input.isActive ?? true,
      updatedAt: new Date().toISOString(),
    })
    .eq("tenantId", tenantId)
    .eq("id", templateId)
    .select("id,name,description,permissions,isActive,createdAt,updatedAt")
    .single();

  if (error) throw error;
  return data;
}

export async function deletePermissionTemplateForTenant(tenantId: string, templateId: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("PermissionTemplate")
    .delete()
    .eq("tenantId", tenantId)
    .eq("id", templateId);

  if (error) throw error;
}

export async function listTenants() {
  const supabase = createSupabaseAdminClient();
  const { data: tenants, error } = await supabase
    .from("Tenant")
    .select("id,name,status,plan,createdAt")
    .order("createdAt", { ascending: false });

  if (error) throw error;

  const [{ data: users }, { data: leads }] = await Promise.all([
    supabase.from("User").select("tenantId"),
    supabase.from("Lead").select("tenantId"),
  ]);

  return (tenants ?? []).map((tenant) => ({
    ...tenant,
    _count: {
      users: (users ?? []).filter((user) => user.tenantId === tenant.id).length,
      leads: (leads ?? []).filter((lead) => lead.tenantId === tenant.id).length,
    },
  }));
}

export async function createTenantWithAdmin(input: CreateTenantInput) {
  const supabase = createSupabaseAdminClient();
  const tenantId = randomUUID();
  const roleId = randomUUID();
  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(input.adminPassword, 10);
  const now = new Date().toISOString();

  await supabase.from("Tenant").insert({
    id: tenantId,
    name: input.name,
    status: "ACTIVE",
    plan: (input.plan ?? "PRO").toUpperCase(),
    createdAt: now,
    updatedAt: now,
  });

  await supabase.from("Role").insert({
    id: roleId,
    tenantId,
    name: "Tenant Admin",
    description: "Full access within tenant",
    permissions: {
      modules: {
        leads: "full",
        opportunities: "full",
        activities: "full",
        admin: "full",
      },
      recordAccess: "ALL",
    },
    createdAt: now,
    updatedAt: now,
  });

  await supabase.from("User").insert({
    id: userId,
    tenantId,
    email: input.adminEmail.toLowerCase(),
    name: input.adminName,
    password: passwordHash,
    status: "ACTIVE",
    roleId,
    createdAt: now,
    updatedAt: now,
  });

  await supabase.from("TenantFeature").insert({
    id: randomUUID(),
    tenantId,
    plan: (input.plan ?? "PRO").toUpperCase(),
    opportunityEnabled: input.opportunityEnabled ?? true,
    automationEnabled: true,
    salesGroupsEnabled: true,
    formBuilderEnabled: true,
    advancedReporting: false,
    apiAccessEnabled: false,
    createdAt: now,
    updatedAt: now,
  });

  const objectIds = await createCoreObjectDefinitions(tenantId);
  await seedDefaultOpportunityType(tenantId, objectIds.opportunityObjectId);

  return { tenantId, userId };
}

export async function changeTenantStatus(tenantId: string, status: "ACTIVE" | "SUSPENDED") {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("Tenant")
    .update({ status })
    .eq("id", tenantId);

  if (error) throw error;
}

export async function getTenantConfigForPlatformAdmin(tenantId: string) {
  const supabase = createSupabaseAdminClient();
  const [{ data: tenant, error: tenantError }, { data: config, error: configError }] = await Promise.all([
    supabase.from("Tenant").select("id,name,status,plan,createdAt").eq("id", tenantId).maybeSingle(),
    supabase.from("TenantConfig").select("featureFlags,storageQuota,userLimit").eq("tenantId", tenantId).maybeSingle(),
  ]);

  if (tenantError) throw tenantError;
  if (configError) throw configError;
  if (!tenant) return null;

  return {
    tenant,
    featureFlags: config?.featureFlags ?? {},
    storageQuota: config?.storageQuota ?? 1,
    userLimit: config?.userLimit ?? null,
  };
}

export async function getTenantUsersForPlatformAdmin(tenantId: string) {
  return listTenantUsers(tenantId);
}

export async function impersonateTenantUser(platformAdminUserId: string, tenantId: string, userId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: user, error } = await supabase
    .from("User")
    .select("id,email,name,tenantId,roleId")
    .eq("id", userId)
    .eq("tenantId", tenantId)
    .maybeSingle();

  if (error) throw error;
  if (!user) throw new Error("USER_NOT_FOUND");

  const accessToken = await signAuthToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    tenantId: user.tenantId,
    roleId: user.roleId,
    isPlatformAdmin: false,
    platformAdminId: null,
    isImpersonating: true,
    impersonatedBy: platformAdminUserId,
  });

  return {
    token: accessToken,
    user,
  };
}
