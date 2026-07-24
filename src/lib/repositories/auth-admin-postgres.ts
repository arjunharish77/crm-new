import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { query, queryOne, execute, type Queryable } from "@/lib/db/query";
import { withTransaction, type TransactionClient } from "@/lib/db/transaction";

type RoleInput = {
  name: string;
  description?: string;
  permissionTemplateId?: string | null;
  permissions: {
    modules: Record<string, string>;
    recordAccess: string;
    isPartnerRole?: boolean;
  };
};

type PermissionTemplateInput = {
  name: string;
  description?: string;
  permissions: Record<string, unknown>;
  isActive?: boolean;
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

type CreateTenantInput = {
  name: string;
  plan?: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  opportunityEnabled?: boolean;
  features?: {
    opportunityEnabled?: boolean;
    automationEnabled?: boolean;
    salesGroupsEnabled?: boolean;
    formBuilderEnabled?: boolean;
    advancedReporting?: boolean;
    apiAccessEnabled?: boolean;
  };
};

type TenantFeatureFlags = {
  opportunityEnabled: boolean;
  automationEnabled: boolean;
  salesGroupsEnabled: boolean;
  formBuilderEnabled: boolean;
  advancedReporting: boolean;
  apiAccessEnabled: boolean;
};

const DEFAULT_TENANT_FEATURE_FLAGS: TenantFeatureFlags = {
  opportunityEnabled: true,
  automationEnabled: true,
  salesGroupsEnabled: true,
  formBuilderEnabled: true,
  advancedReporting: true,
  apiAccessEnabled: false,
};

function asUuidOrNull(value: unknown) {
  const text = typeof value === "string" ? value : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function cleanPatch(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

async function insertReturning<T>(
  table: string,
  row: Record<string, unknown>,
  returning: string,
  client?: Queryable,
): Promise<T> {
  const columns = Object.keys(row);
  const values = columns.map((column) => row[column]);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const quotedColumns = columns.map((column) => `"${column}"`).join(", ");
  const result = await queryOne<T & Record<string, unknown>>(
    `insert into "${table}" (${quotedColumns}) values (${placeholders}) returning ${returning}`,
    values,
    client,
  );
  if (!result) throw new Error(`${table.toUpperCase()}_INSERT_FAILED`);
  return result as T;
}

async function updateReturning<T>(
  table: string,
  patch: Record<string, unknown>,
  whereSql: string,
  whereValues: unknown[],
  returning: string,
  client?: Queryable,
): Promise<T> {
  const cleaned = cleanPatch(patch);
  const columns = Object.keys(cleaned);
  if (!columns.length) throw new Error(`${table.toUpperCase()}_EMPTY_UPDATE`);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  const values = columns.map((column) => cleaned[column]);
  const result = await queryOne<T & Record<string, unknown>>(
    `update "${table}" set ${assignments} ${whereSql.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + values.length}`)} returning ${returning}`,
    values.concat(whereValues),
    client,
  );
  if (!result) throw new Error(`${table.toUpperCase()}_NOT_FOUND`);
  return result as T;
}

export async function getLoginUserByEmail(email: string) {
  return queryOne<{
    id: string;
    email: string;
    name: string;
    password: string | null;
    tenantId: string | null;
    roleId: string | null;
  }>(
    'select id, email, name, password, "tenantId", "roleId" from "User" where lower(email) = lower($1) limit 1',
    [email],
  );
}

export async function getActivePlatformAdminByUserId(userId: string) {
  return queryOne<{ id: string; isActive: boolean }>(
    'select id, "isActive" from "PlatformAdmin" where "userId"::text = $1 and "isActive" = true limit 1',
    [userId],
  );
}

export async function getBootstrapStatus() {
  const row = await queryOne<{ id: string }>('select id from "PlatformAdmin" where "isActive" = true limit 1');
  return { needsBootstrap: !row };
}

export async function bootstrapPlatformAdmin(input: { name: string; email: string; password: string }) {
  const status = await getBootstrapStatus();
  if (!status.needsBootstrap) throw new Error("BOOTSTRAP_ALREADY_COMPLETE");

  const roleId = randomUUID();
  const userId = randomUUID();
  const platformAdminId = randomUUID();
  const passwordHash = await bcrypt.hash(input.password, 10);
  const now = new Date().toISOString();

  await withTransaction(null, async (tx) => {
    await insertReturning("Role", {
      id: roleId,
      tenantId: null,
      name: "Super Admin",
      description: "Platform administrator with full access",
      permissions: { modules: { leads: "full", opportunities: "full", activities: "full", admin: "full" }, recordAccess: "ALL", platform: true },
      createdAt: now,
      updatedAt: now,
    }, "id", tx);
    await insertReturning("User", {
      id: userId,
      tenantId: null,
      email: input.email.toLowerCase(),
      name: input.name,
      password: passwordHash,
      status: "ACTIVE",
      roleId,
      createdAt: now,
      updatedAt: now,
    }, "id", tx);
    await insertReturning("PlatformAdmin", {
      id: platformAdminId,
      userId,
      permissions: { tenants: true, users: true, roles: true, billing: true },
      canImpersonate: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }, "id", tx);
  });
}

export async function getCurrentUserById(userId: string) {
  const userRecord = await queryOne<any>(
    'select id, email, name, "tenantId", "roleId", "permissionTemplateId" from "User" where id::text = $1 limit 1',
    [userId],
  );
  if (!userRecord) return null;

  const [roleRecord, platformAdminRecord, tenantFeatureRecord, salesGroupMemberships] = await Promise.all([
    userRecord.roleId
      ? queryOne<any>('select id, name, "permissionTemplateId", permissions from "Role" where id::text = $1 limit 1', [String(userRecord.roleId)])
      : Promise.resolve(null),
    getActivePlatformAdminByUserId(userRecord.id),
    userRecord.tenantId
      ? queryOne<any>(
          'select "opportunityEnabled", "automationEnabled", "advancedReporting", "apiAccessEnabled", "salesGroupsEnabled", "formBuilderEnabled" from "TenantFeature" where "tenantId"::text = $1 limit 1',
          [String(userRecord.tenantId)],
        )
      : Promise.resolve(null),
    userRecord.tenantId
      ? query<{ groupId: string }>('select "groupId" from "SalesGroupMember" where "tenantId"::text = $1 and "userId"::text = $2', [String(userRecord.tenantId), String(userRecord.id)])
      : Promise.resolve([]),
  ]);

  let salesGroupTemplateIds: string[] = [];
  const groupIds = salesGroupMemberships.map((member) => member.groupId).filter(Boolean);
  if (groupIds.length && userRecord.tenantId) {
    const groups = await query<{ permissionTemplateId: string | null }>(
      'select "permissionTemplateId" from "SalesGroup" where "tenantId"::text = $1 and id::text = any($2::text[])',
      [String(userRecord.tenantId), groupIds.map(String)],
    );
    salesGroupTemplateIds = groups.map((group) => group.permissionTemplateId).filter((id): id is string => !!id);
  }

  const templateIds = [...salesGroupTemplateIds, roleRecord?.permissionTemplateId, userRecord.permissionTemplateId].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  const permissionTemplates = templateIds.length && userRecord.tenantId
    ? await query<any>(
        'select id, name, permissions, "isActive" from "PermissionTemplate" where "tenantId"::text = $1 and "isActive" = true and id::text = any($2::text[])',
        [String(userRecord.tenantId), templateIds.map(String)],
      )
    : [];

  const rolePermissions = roleRecord?.permissions ?? null;

  return {
    id: userRecord.id,
    email: userRecord.email,
    name: userRecord.name,
    tenantId: userRecord.tenantId,
    roleId: userRecord.roleId,
    permissionTemplateId: userRecord.permissionTemplateId ?? null,
    role: roleRecord,
    permissionTemplates: permissionTemplates.sort((a, b) => templateIds.indexOf(a.id) - templateIds.indexOf(b.id)),
    isPlatformAdmin: !!platformAdminRecord,
    platformAdminId: platformAdminRecord?.id ?? null,
    isPartner: !!rolePermissions?.isPartnerRole,
    isTenantAdmin: rolePermissions?.recordAccess === "ALL" || rolePermissions?.modules?.admin === "full",
    features: tenantFeatureRecord ?? DEFAULT_TENANT_FEATURE_FLAGS,
  };
}

export async function listTenantUsers(tenantId: string | null) {
  const users = await query<any>(
    `select id, name, email, status, "roleId", "permissionTemplateId", "managerId", "teamId", skills, "createdAt"
     from "User"
     where ${tenantId ? '"tenantId"::text = $1' : '"tenantId" is null'}
     order by "createdAt" desc`,
    tenantId ? [tenantId] : [],
  );
  const roles = await listTenantRolesBase(tenantId);
  const roleMap = new Map(roles.map((role) => [role.id, role]));
  const userMap = new Map(users.map((user) => [user.id, user]));
  const teamIds = [...new Set(users.map((user) => user.teamId).filter(Boolean))];
  const teams = teamIds.length && tenantId
    ? await query<any>('select id, name from "Team" where "tenantId"::text = $1 and id::text = any($2::text[])', [tenantId, teamIds.map(String)])
    : [];
  const teamMap = new Map(teams.map((team) => [String(team.id), team]));

  return users.map((user) => ({
    ...user,
    role: user.roleId ? roleMap.get(user.roleId) ?? undefined : undefined,
    manager: user.managerId && userMap.get(user.managerId) ? { id: user.managerId, name: userMap.get(user.managerId).name } : undefined,
    team: user.teamId ? teamMap.get(String(user.teamId)) ?? undefined : undefined,
    teamId: user.teamId ?? "",
    permissionTemplateId: user.permissionTemplateId ?? "",
    lastLoginAt: null,
  }));
}

export async function createTenantScopedUser(tenantId: string, input: CreateUserInput) {
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(input.password, 10);
  return insertReturning("User", {
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
  }, 'id, name, email, status, "roleId", "permissionTemplateId", "managerId", "teamId", skills, "createdAt"');
}

export async function updateTenantScopedUser(tenantId: string, userId: string, input: UpdateUserInput) {
  return updateReturning("User", {
    name: input.name,
    roleId: input.roleId,
    permissionTemplateId: asUuidOrNull(input.permissionTemplateId),
    teamId: input.teamId || null,
    managerId: input.managerId || null,
    skills: input.skills ?? null,
    status: input.status,
    updatedAt: new Date().toISOString(),
  }, 'where "tenantId"::text = $1 and id::text = $2', [tenantId, userId], 'id, name, email, status, "roleId", "permissionTemplateId", "managerId", "teamId", skills, "createdAt"');
}

async function listTenantRolesBase(tenantId: string | null) {
  return query<any>(
    `select id, name, description, "permissionTemplateId", permissions, "createdAt", "updatedAt"
     from "Role"
     where ${tenantId ? '"tenantId"::text = $1' : '"tenantId" is null'}
     order by name asc`,
    tenantId ? [tenantId] : [],
  );
}

export async function listTenantRoles(tenantId: string | null) {
  const [roles, users] = await Promise.all([listTenantRolesBase(tenantId), listTenantUsersForUsage(tenantId)]);
  const roleUsage = new Map<string, number>();
  users.forEach((user) => {
    if (user.roleId) roleUsage.set(user.roleId, (roleUsage.get(user.roleId) ?? 0) + 1);
  });
  return roles.map((role) => ({ ...role, _count: { users: roleUsage.get(role.id) ?? 0 } }));
}

async function listTenantUsersForUsage(tenantId: string | null) {
  return query<{ id: string; roleId: string | null }>(
    `select id, "roleId" from "User" where ${tenantId ? '"tenantId"::text = $1' : '"tenantId" is null'}`,
    tenantId ? [tenantId] : [],
  );
}

export async function createTenantRole(tenantId: string, input: RoleInput) {
  const now = new Date().toISOString();
  return insertReturning("Role", {
    id: randomUUID(),
    tenantId,
    name: input.name,
    description: input.description ?? null,
    permissionTemplateId: asUuidOrNull(input.permissionTemplateId),
    permissions: input.permissions,
    createdAt: now,
    updatedAt: now,
  }, 'id, name, description, "permissionTemplateId", permissions, "createdAt", "updatedAt"');
}

export async function updateTenantRole(tenantId: string, roleId: string, input: RoleInput) {
  return updateReturning("Role", {
    name: input.name,
    description: input.description ?? null,
    permissionTemplateId: asUuidOrNull(input.permissionTemplateId),
    permissions: input.permissions,
    updatedAt: new Date().toISOString(),
  }, 'where "tenantId" = $1 and id = $2', [tenantId, roleId], 'id, name, description, "permissionTemplateId", permissions, "createdAt", "updatedAt"');
}

export async function deleteTenantRole(tenantId: string, roleId: string) {
  await execute('delete from "Role" where "tenantId" = $1 and id = $2', [tenantId, roleId]);
}

export async function listPermissionTemplatesForTenant(tenantId: string) {
  return query<any>(
    'select id, name, description, permissions, "isActive", "createdAt", "updatedAt" from "PermissionTemplate" where "tenantId" = $1 order by name asc',
    [tenantId],
  );
}

export async function createPermissionTemplateForTenant(tenantId: string, input: PermissionTemplateInput) {
  const now = new Date().toISOString();
  return insertReturning("PermissionTemplate", {
    id: randomUUID(),
    tenantId,
    name: input.name,
    description: input.description ?? null,
    permissions: input.permissions ?? {},
    isActive: input.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  }, 'id, name, description, permissions, "isActive", "createdAt", "updatedAt"');
}

export async function updatePermissionTemplateForTenant(tenantId: string, templateId: string, input: PermissionTemplateInput) {
  return updateReturning("PermissionTemplate", {
    name: input.name,
    description: input.description ?? null,
    permissions: input.permissions ?? {},
    isActive: input.isActive ?? true,
    updatedAt: new Date().toISOString(),
  }, 'where "tenantId" = $1 and id = $2', [tenantId, templateId], 'id, name, description, permissions, "isActive", "createdAt", "updatedAt"');
}

export async function deletePermissionTemplateForTenant(tenantId: string, templateId: string) {
  await execute('delete from "PermissionTemplate" where "tenantId" = $1 and id = $2', [tenantId, templateId]);
}

export async function listTenants() {
  const tenants = await query<any>('select id, name, status, plan, "createdAt" from "Tenant" order by "createdAt" desc');
  const [users, leads] = await Promise.all([
    query<{ tenantId: string | null }>('select "tenantId" from "User"'),
    query<{ tenantId: string | null }>('select "tenantId" from "Lead"'),
  ]);
  return tenants.map((tenant) => ({
    ...tenant,
    _count: {
      users: users.filter((user) => user.tenantId === tenant.id).length,
      leads: leads.filter((lead) => lead.tenantId === tenant.id).length,
    },
  }));
}

async function createCoreObjectDefinitions(tenantId: string, tx: TransactionClient) {
  const now = new Date().toISOString();
  const leadObjectId = randomUUID();
  const opportunityObjectId = randomUUID();
  const activityObjectId = randomUUID();
  await insertReturning("ObjectDefinition", { id: leadObjectId, tenantId, name: "lead", label: "Lead", isCustom: false, createdAt: now, updatedAt: now }, "id", tx);
  await insertReturning("ObjectDefinition", { id: opportunityObjectId, tenantId, name: "opportunity", label: "Opportunity", isCustom: false, createdAt: now, updatedAt: now }, "id", tx);
  await insertReturning("ObjectDefinition", { id: activityObjectId, tenantId, name: "activity", label: "Activity", isCustom: false, createdAt: now, updatedAt: now }, "id", tx);
  return { opportunityObjectId };
}

async function seedDefaultOpportunityType(tenantId: string, objectId: string, tx: TransactionClient) {
  const opportunityTypeId = randomUUID();
  const now = new Date().toISOString();
  await insertReturning("OpportunityType", {
    id: opportunityTypeId,
    tenantId,
    objectId,
    name: "Standard Opportunity",
    description: "Standard sales process",
    order: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }, "id", tx);
  for (const stage of [
    ["New", 1, 10, "#94a3b8", false, false],
    ["Qualified", 2, 30, "#60a5fa", false, false],
    ["Won", 3, 100, "#22c55e", true, true],
    ["Lost", 4, 0, "#ef4444", true, false],
  ] as const) {
    await insertReturning("StageDefinition", {
      id: randomUUID(),
      tenantId,
      opportunityTypeId,
      name: stage[0],
      order: stage[1],
      probability: stage[2],
      color: stage[3],
      isClosed: stage[4],
      isWon: stage[5],
      createdAt: now,
      updatedAt: now,
    }, "id", tx);
  }
}

export async function createTenantWithAdmin(input: CreateTenantInput) {
  const tenantId = randomUUID();
  const roleId = randomUUID();
  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(input.adminPassword, 10);
  const now = new Date().toISOString();
  const plan = (input.plan ?? "PRO").toUpperCase();

  await withTransaction(null, async (tx) => {
    await insertReturning("Tenant", { id: tenantId, name: input.name, status: "ACTIVE", plan, createdAt: now, updatedAt: now }, "id", tx);
    await insertReturning("Role", {
      id: roleId,
      tenantId,
      name: "Tenant Admin",
      description: "Full access within tenant",
      permissions: { modules: { leads: "full", opportunities: "full", activities: "full", admin: "full" }, recordAccess: "ALL" },
      createdAt: now,
      updatedAt: now,
    }, "id", tx);
    await insertReturning("User", {
      id: userId,
      tenantId,
      email: input.adminEmail.toLowerCase(),
      name: input.adminName,
      password: passwordHash,
      status: "ACTIVE",
      roleId,
      createdAt: now,
      updatedAt: now,
    }, "id", tx);
    await insertReturning("TenantFeature", {
      id: randomUUID(),
      tenantId,
      plan,
      opportunityEnabled: input.features?.opportunityEnabled ?? input.opportunityEnabled ?? true,
      automationEnabled: input.features?.automationEnabled ?? true,
      salesGroupsEnabled: input.features?.salesGroupsEnabled ?? true,
      formBuilderEnabled: input.features?.formBuilderEnabled ?? true,
      advancedReporting: input.features?.advancedReporting ?? true,
      apiAccessEnabled: input.features?.apiAccessEnabled ?? false,
      createdAt: now,
      updatedAt: now,
    }, "id", tx);
    const objectIds = await createCoreObjectDefinitions(tenantId, tx);
    await seedDefaultOpportunityType(tenantId, objectIds.opportunityObjectId, tx);
  });

  return { tenantId, userId };
}

export async function changeTenantStatus(tenantId: string, status: "ACTIVE" | "SUSPENDED") {
  await execute('update "Tenant" set status = $1 where id = $2', [status, tenantId]);
}

export async function getTenantFeatureFlags(tenantId: string): Promise<TenantFeatureFlags> {
  const row = await queryOne<Partial<TenantFeatureFlags>>(
    'select "opportunityEnabled", "automationEnabled", "salesGroupsEnabled", "formBuilderEnabled", "advancedReporting", "apiAccessEnabled" from "TenantFeature" where "tenantId" = $1 limit 1',
    [tenantId],
  );
  return { ...DEFAULT_TENANT_FEATURE_FLAGS, ...(row ?? {}) };
}

export async function updateTenantFeatureFlags(tenantId: string, flags: Partial<TenantFeatureFlags>) {
  const patch = Object.fromEntries(Object.entries(flags).filter(([, value]) => typeof value === "boolean"));
  const existing = await queryOne<{ id: string }>('select id from "TenantFeature" where "tenantId" = $1 limit 1', [tenantId]);
  if (existing) {
    await updateReturning("TenantFeature", { ...patch, updatedAt: new Date().toISOString() }, 'where "tenantId" = $1', [tenantId], "id");
  } else {
    await insertReturning("TenantFeature", {
      id: randomUUID(),
      tenantId,
      plan: "PRO",
      ...DEFAULT_TENANT_FEATURE_FLAGS,
      ...patch,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, "id");
  }
  return getTenantFeatureFlags(tenantId);
}

export async function getTenantConfigForPlatformAdmin(tenantId: string) {
  const [tenant, config] = await Promise.all([
    queryOne<any>('select id, name, status, plan, "createdAt" from "Tenant" where id = $1 limit 1', [tenantId]),
    queryOne<any>('select "featureFlags", "storageQuota", "userLimit" from "TenantConfig" where "tenantId" = $1 limit 1', [tenantId]),
  ]);
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
  const user = await queryOne<any>('select id, email, name, "tenantId", "roleId" from "User" where id = $1 and "tenantId" = $2 limit 1', [userId, tenantId]);
  if (!user) throw new Error("USER_NOT_FOUND");
  return { user, platformAdminUserId };
}
