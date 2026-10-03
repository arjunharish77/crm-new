import { type TenantProvisioningInput, resolveTenantProvisioning, effectiveTenantFeatures, type PlatformModuleOption } from "@/lib/tenant-provisioning";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { query, queryOne, execute, queryAsSystem, queryOneAsSystem, executeAsSystem, type Queryable } from "@/lib/db/query";
import { withTransaction, type TransactionClient } from "@/lib/db/transaction";
import { assertSeatAvailable, lockTenantSeats } from "@/lib/server/usage-limits";
import { seedDefaultLeadStatuses } from "@/lib/repositories/lead-statuses-postgres";

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
  isAvailableForAssignment?: boolean;
};

type CreateTenantInput = TenantProvisioningInput;

type TenantFeatureFlags = {
  opportunityEnabled: boolean;
  automationEnabled: boolean;
  salesGroupsEnabled: boolean;
  formBuilderEnabled: boolean;
  advancedReporting: boolean;
  apiAccessEnabled: boolean;
  payoutsEnabled: boolean;
  gamificationEnabled: boolean;
};

const DEFAULT_TENANT_FEATURE_FLAGS: TenantFeatureFlags = {
  opportunityEnabled: true,
  automationEnabled: true,
  salesGroupsEnabled: true,
  formBuilderEnabled: true,
  advancedReporting: true,
  apiAccessEnabled: false,
  payoutsEnabled: true,
  gamificationEnabled: true,
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

// WP07 (F04) pre-auth/system inventory: PRE_AUTH, disposition B -- this is the login flow's own
// cross-tenant bootstrap lookup (searching by email BEFORE any tenant is known), so it must run
// on the unrestricted system pool explicitly rather than depend on ENFORCE_TENANT_RLS staying
// off. See 25_AUDIT_REMEDIATION_PLAN.md "## WP07 pre-auth/system path inventory".
export async function getLoginUserByEmail(email: string) {
  return queryOneAsSystem<{
    id: string;
    email: string;
    name: string;
    password: string | null;
    tenantId: string | null;
    roleId: string | null;
    status: string | null;
    mfaEnabled: boolean;
    mfaRequired: boolean | null;
    createdAt: string;
    passwordChangedAt: string | null;
  }>(
    'select id, email, name, password, "tenantId", "roleId", status, "mfaEnabled", "mfaRequired", "createdAt", "passwordChangedAt" from "User" where lower(email) = lower($1) limit 1',
    [email],
  );
}

// Same shape as getLoginUserByEmail, by id -- used by the MFA-verify step (auth/mfa/verify),
// which only has the userId from the short-lived MFA-pending token's `sub` claim, not the
// original login email. Re-verifying status here (not just trusting the earlier password-check
// step already did) means a user can't bypass the deactivated/suspended checks by completing
// login through this second step instead of the first.
// WP07 (F04): PRE_AUTH, disposition B -- called only from the MFA-verify and
// change-expired-password continuations, both of which have nothing but a bare userId from a
// short-lived pending token and no session/tenant context established yet.
export async function getLoginUserById(id: string) {
  return queryOneAsSystem<{
    id: string;
    email: string;
    name: string;
    password: string | null;
    tenantId: string | null;
    roleId: string | null;
    status: string | null;
    mfaEnabled: boolean;
    mfaRequired: boolean | null;
    createdAt: string;
    passwordChangedAt: string | null;
  }>(
    'select id, email, name, password, "tenantId", "roleId", status, "mfaEnabled", "mfaRequired", "createdAt", "passwordChangedAt" from "User" where id = $1 limit 1',
    [id],
  );
}

// WP07 (F04): PRE_AUTH, disposition B -- called from login/mfa-verify/change-expired-password
// (all pre-session) and from the platform-admin notifications/SSE route right after the token's
// own tenant is resolved. "Tenant" is the tenant registry itself (its PK is the tenant id, no
// separate tenantId column), so a lookup by a single explicit id here can never leak a
// different tenant's data -- always safe on the system pool regardless of caller.
export async function isTenantSuspended(tenantId: string | null) {
  if (!tenantId) return false;
  const tenant = await queryOneAsSystem<{ status: string }>('select status from "Tenant" where id = $1 limit 1', [tenantId]);
  return tenant?.status === "SUSPENDED";
}

// WP07 (F04): PRE_AUTH, disposition B -- "PlatformAdmin" is a global (non-tenant-scoped) table,
// and every caller of this function (login, mfa-verify, change-expired-password,
// getCurrentUserById's own bootstrap below) runs before/without an established tenant context.
export async function getActivePlatformAdminByUserId(userId: string) {
  return queryOneAsSystem<{ id: string; isActive: boolean }>(
    'select id, "isActive" from "PlatformAdmin" where "userId"::text = $1 and "isActive" = true limit 1',
    [userId],
  );
}

// WP07 (F04): PRE_AUTH, disposition B -- runs before any user/session/tenant exists at all (the
// very first platform admin has not been created yet).
export async function getBootstrapStatus() {
  const row = await queryOneAsSystem<{ id: string }>('select id from "PlatformAdmin" where "isActive" = true limit 1');
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
      passwordChangedAt: now,
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

// WP07 (F04): PRE_AUTH, disposition B -- this is the ONE function that runs on literally every
// authenticated request (via resolveUserFromPayload in auth.ts) BEFORE tenant context is
// entered -- it's the bootstrap that discovers who the request even belongs to, so it cannot
// depend on ambient tenant context existing yet (see 25_AUDIT_REMEDIATION_PLAN.md "## WP07
// pre-auth/system path inventory" for why this, not just the login-by-email path, is the
// highest-blast-radius pre-auth call site in the app). Every query below runs on the system
// pool explicitly; resolveUserFromPayload enters real tenant context immediately after this
// function returns, and every query anywhere else in the app runs after that point.
export async function getCurrentUserById(userId: string) {
  const userRecord = await queryOneAsSystem<any>(
    'select id, email, name, "tenantId", "roleId", "permissionTemplateId", "mfaEnabled", "teamId" from "User" where id::text = $1 limit 1',
    [userId],
  );
  if (!userRecord) return null;

  const [roleRecord, platformAdminRecord, tenantFeatureRecord, salesGroupMemberships, tenantRecord, tenantConfigRecord] = await Promise.all([
    userRecord.roleId
      ? queryOneAsSystem<any>('select id, name, "permissionTemplateId", permissions from "Role" where id::text = $1 limit 1', [String(userRecord.roleId)])
      : Promise.resolve(null),
    getActivePlatformAdminByUserId(userRecord.id),
    userRecord.tenantId
      ? queryOneAsSystem<any>(
          'select "opportunityEnabled", "automationEnabled", "advancedReporting", "apiAccessEnabled", "salesGroupsEnabled", "formBuilderEnabled", "payoutsEnabled", "gamificationEnabled" from "TenantFeature" where "tenantId"::text = $1 limit 1',
          [String(userRecord.tenantId)],
        )
      : Promise.resolve(null),
    userRecord.tenantId
      ? queryAsSystem<{ groupId: string }>('select "groupId" from "SalesGroupMember" where "tenantId"::text = $1 and "userId"::text = $2', [String(userRecord.tenantId), String(userRecord.id)])
      : Promise.resolve([]),
    // Parallelized into the same fan-out (near-zero extra latency) rather than a second
    // round-trip -- needed so getCurrentUser can actually enforce tenant suspension, which
    // changeTenantStatus/the suspend+unsuspend API routes have always updated but nothing has
    // ever checked until now, and so the dashboard can render the maintenance banner.
    userRecord.tenantId
      ? queryOneAsSystem<any>('select status, environment, name from "Tenant" where id::text = $1 limit 1', [String(userRecord.tenantId)])
      : Promise.resolve(null),
    userRecord.tenantId
      ? queryOneAsSystem<any>('select "maintenanceActive", "maintenanceMessage" from "TenantConfig" where "tenantId"::text = $1 limit 1', [String(userRecord.tenantId)])
      : Promise.resolve(null),
  ]);

  // Only explicit non-default overrides are stored -- a module with no row here is
  // enabled, same "missing -> enabled" convention as TenantFeature's defaults, so the
  // client only needs to check `moduleEntitlements[key] !== 'DISABLED' && !== 'SUSPENDED'`.
  const moduleEntitlementRows = userRecord.tenantId
    ? await queryAsSystem<{ moduleKey: string; status: string }>(
        'select "moduleKey", status from "TenantModuleEntitlement" where "tenantId"::text = $1',
        [String(userRecord.tenantId)],
      )
    : [];
  const moduleEntitlements = Object.fromEntries(moduleEntitlementRows.map((row) => [row.moduleKey, row.status]));

  let salesGroupTemplateIds: string[] = [];
  const groupIds = salesGroupMemberships.map((member) => member.groupId).filter(Boolean);
  if (groupIds.length && userRecord.tenantId) {
    const groups = await queryAsSystem<{ permissionTemplateId: string | null }>(
      'select "permissionTemplateId" from "SalesGroup" where "tenantId"::text = $1 and id::text = any($2::text[])',
      [String(userRecord.tenantId), groupIds.map(String)],
    );
    salesGroupTemplateIds = groups.map((group) => group.permissionTemplateId).filter((id): id is string => !!id);
  }

  const templateIds = [...salesGroupTemplateIds, roleRecord?.permissionTemplateId, userRecord.permissionTemplateId].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  const permissionTemplates = templateIds.length && userRecord.tenantId
    ? await queryAsSystem<any>(
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
    // F03 fix (WP04): needed so TEAM-scoped record access (leads-postgres.ts/
    // opportunities-postgres.ts) can resolve "records owned by anyone on my own team" --
    // previously unused here, so a role configured as "TEAM" in the Roles UI silently behaved
    // like "ALL" (no team-membership context was ever available to check against).
    teamId: userRecord.teamId ?? null,
    permissionTemplateId: userRecord.permissionTemplateId ?? null,
    role: roleRecord,
    permissionTemplates: permissionTemplates.sort((a, b) => templateIds.indexOf(a.id) - templateIds.indexOf(b.id)),
    isPlatformAdmin: !!platformAdminRecord,
    platformAdminId: platformAdminRecord?.id ?? null,
    isPartner: !!rolePermissions?.isPartnerRole,
    isTenantAdmin: rolePermissions?.recordAccess === "ALL" || rolePermissions?.modules?.admin === "full",
    features: effectiveTenantFeatures({...DEFAULT_TENANT_FEATURE_FLAGS,...tenantFeatureRecord},moduleEntitlements),
    moduleEntitlements,
    // Shown in the header and account menu instead of the raw tenant id (UI/UX plan §11.6 M).
    tenantName: tenantRecord?.name ?? null,
    tenantStatus: tenantRecord?.status ?? "ACTIVE",
    tenantEnvironment: tenantRecord?.environment ?? "PRODUCTION",
    maintenanceActive: tenantConfigRecord?.maintenanceActive ?? false,
    maintenanceMessage: tenantConfigRecord?.maintenanceMessage ?? null,
    mfaEnabled: !!userRecord.mfaEnabled,
  };
}

export async function listTenantUsers(tenantId: string | null) {
  const users = await query<any>(
    `select id, name, email, status, "roleId", "permissionTemplateId", "managerId", "teamId", skills, "isAvailableForAssignment", "createdAt"
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

// F02 fix (WP03): a tenant admin (or, before that fix, any internal user) could previously
// assign a roleId/teamId/managerId/permissionTemplateId belonging to a DIFFERENT tenant to a
// user -- the User row's own update was tenant-scoped, but the referenced ids never were.
// Every reference actually supplied in the input is checked here before the write proceeds.
async function assertUserReferencesBelongToTenant(tenantId: string, input: { roleId?: string; teamId?: string; managerId?: string; permissionTemplateId?: string }) {
  const checks: Promise<void>[] = [];
  if (input.roleId) {
    checks.push(
      queryOne('select id from "Role" where "tenantId" = $1 and id = $2 limit 1', [tenantId, input.roleId]).then((row) => {
        if (!row) throw new Error("ROLE_NOT_FOUND_FOR_TENANT");
      }),
    );
  }
  if (input.teamId) {
    checks.push(
      queryOne('select id from "Team" where "tenantId"::text = $1 and id::text = $2 limit 1', [tenantId, input.teamId]).then((row) => {
        if (!row) throw new Error("TEAM_NOT_FOUND_FOR_TENANT");
      }),
    );
  }
  if (input.managerId) {
    checks.push(
      queryOne('select id from "User" where "tenantId"::text = $1 and id::text = $2 limit 1', [tenantId, input.managerId]).then((row) => {
        if (!row) throw new Error("MANAGER_NOT_FOUND_FOR_TENANT");
      }),
    );
  }
  const templateId = asUuidOrNull(input.permissionTemplateId);
  if (templateId) {
    checks.push(
      queryOne('select id from "PermissionTemplate" where "tenantId"::text = $1 and id::text = $2 limit 1', [tenantId, templateId]).then((row) => {
        if (!row) throw new Error("PERMISSION_TEMPLATE_NOT_FOUND_FOR_TENANT");
      }),
    );
  }
  await Promise.all(checks);
}

export async function createTenantScopedUser(tenantId: string, input: CreateUserInput) {
  await assertUserReferencesBelongToTenant(tenantId, input);
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(input.password, 10);
  const row = {
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
    passwordChangedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  // Seat limits (Module 21): the tenant seat lock serializes this check with every other user
  // creation/activation, so two admins cannot both take the last seat.
  return withTransaction(null, async (tx) => {
    await lockTenantSeats(tx, tenantId);
    await assertSeatAvailable(tx, tenantId, { roleId: input.roleId, becomesActive: true });
    return insertReturning("User", row, 'id, name, email, status, "roleId", "permissionTemplateId", "managerId", "teamId", skills, "createdAt"', tx);
  });
}

export async function getTenantScopedUserPermissionSummary(tenantId: string, userId: string) {
  return queryOne<{ id: string; roleId: string | null; permissionTemplateId: string | null }>(
    'select id, "roleId", "permissionTemplateId" from "User" where "tenantId"::text = $1 and id::text = $2 limit 1',
    [tenantId, userId],
  );
}

// F28 fix: previously every field here was always included in the patch (falsy/omitted
// teamId/managerId/skills all collapsed to an explicit `null`), so cleanPatch's own
// undefined-only filter never caught them -- patching just `isAvailableForAssignment` silently
// wiped team/manager/skills on every call. Now only a field the caller actually supplied is
// ever included; an explicit empty string ("") still means "clear it", omission does not.
export async function updateTenantScopedUser(tenantId: string, userId: string, input: UpdateUserInput) {
  await assertUserReferencesBelongToTenant(tenantId, input);
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.roleId !== undefined) patch.roleId = input.roleId;
  if (input.permissionTemplateId !== undefined) patch.permissionTemplateId = asUuidOrNull(input.permissionTemplateId);
  if (input.teamId !== undefined) patch.teamId = input.teamId || null;
  if (input.managerId !== undefined) patch.managerId = input.managerId || null;
  if (input.skills !== undefined) patch.skills = input.skills;
  if (input.status !== undefined) patch.status = input.status;
  if (input.isAvailableForAssignment !== undefined) patch.isAvailableForAssignment = input.isAvailableForAssignment;
  const returning = 'id, name, email, status, "roleId", "permissionTemplateId", "managerId", "teamId", skills, "isAvailableForAssignment", "createdAt"';
  if (input.status === undefined && input.roleId === undefined) {
    return updateReturning("User", patch, 'where "tenantId"::text = $1 and id::text = $2', [tenantId, userId], returning);
  }
  // Reactivation or a role change can consume a seat (internal <-> partner): same seat lock and
  // limit check as creation, against the user's resulting role and status.
  return withTransaction(null, async (tx) => {
    await lockTenantSeats(tx, tenantId);
    const previous = (await tx.query<{ roleId: string | null; status: string | null; deletedAt: string | null }>(
      'select "roleId", status, "deletedAt" from "User" where "tenantId"::text = $1 and id::text = $2 for update',
      [tenantId, userId],
    )).rows[0];
    if (previous) {
      const nextStatus = input.status !== undefined ? input.status : previous.status;
      await assertSeatAvailable(tx, tenantId, {
        roleId: input.roleId !== undefined ? input.roleId : previous.roleId,
        becomesActive: !previous.deletedAt && (nextStatus ?? "ACTIVE") === "ACTIVE",
        previous: { roleId: previous.roleId, active: !previous.deletedAt && (previous.status ?? "ACTIVE") === "ACTIVE" },
      });
    }
    return updateReturning("User", patch, 'where "tenantId"::text = $1 and id::text = $2', [tenantId, userId], returning, tx);
  });
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

export async function getTenantRoleById(tenantId: string, roleId: string) {
  return queryOne<any>(
    'select id, name, description, "permissionTemplateId", permissions, "createdAt", "updatedAt" from "Role" where "tenantId" = $1 and id = $2 limit 1',
    [tenantId, roleId],
  );
}

async function assertPermissionTemplateBelongsToTenant(tenantId: string, permissionTemplateId?: string | null) {
  const templateId = asUuidOrNull(permissionTemplateId);
  if (!templateId) return;
  const row = await queryOne('select id from "PermissionTemplate" where "tenantId"::text = $1 and id::text = $2 limit 1', [tenantId, templateId]);
  if (!row) throw new Error("PERMISSION_TEMPLATE_NOT_FOUND_FOR_TENANT");
}

export async function createTenantRole(tenantId: string, input: RoleInput) {
  await assertPermissionTemplateBelongsToTenant(tenantId, input.permissionTemplateId);
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
  await assertPermissionTemplateBelongsToTenant(tenantId, input.permissionTemplateId);
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

// WP07 (F04): CROSS_TENANT_ADMIN, disposition B -- genuinely reads across every tenant at once
// (platform-admin tenant list/usage dashboard); the caller's own ambient context is the
// platform admin's own (typically null) tenantId, which could never legitimately scope a
// multi-tenant aggregate like this even if entered.
export async function listTenants() {
  const tenants = await queryAsSystem<any>('select id, name, status, plan, "createdAt" from "Tenant" order by "createdAt" desc');
  const [users, leads] = await Promise.all([
    queryAsSystem<{ tenantId: string | null }>('select "tenantId" from "User"'),
    queryAsSystem<{ tenantId: string | null }>('select "tenantId" from "Lead"'),
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

export async function createTenantWithAdmin(input: CreateTenantInput, actor?: { id: string }) {
  const tenantId = randomUUID();
  const roleId = randomUUID();
  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(input.adminPassword, 10);
  const now = new Date().toISOString();
  const plan = (input.plan ?? "PRO").toUpperCase();

  await withTransaction(null, async (tx) => {
    const catalog=await query<PlatformModuleOption>('select "key", name, category, "isCore" from "PlatformModule" order by "key"',[],tx);
    const selection=resolveTenantProvisioning(catalog,input);
    await insertReturning("Tenant", { id: tenantId, name: input.name, status: "ACTIVE", plan, createdAt: now, updatedAt: now }, "id", tx);
    await seedDefaultLeadStatuses(tenantId, tx);
    // Usage limits chosen at creation (Module 21). Omitted/blank = unlimited: no row at all.
    const limits = input.limits;
    if (limits && Object.values(limits).some((value) => value !== null && value !== undefined)) {
      await tx.query(
        `insert into "TenantUsageLimit" ("tenantId", "maxActiveUsers", "maxPartnerLogins", "maxStorageMb", "maxMonthlyMessages", "updatedBy", "updatedAt") values ($1, $2, $3, $4, $5, $6, now())`,
        [tenantId, limits.maxActiveUsers ?? null, limits.maxPartnerLogins ?? null, limits.maxStorageMb ?? null, limits.maxMonthlyMessages ?? null, actor?.id ?? null],
      );
    }
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
      passwordChangedAt: now,
      createdAt: now,
      updatedAt: now,
    }, "id", tx);
    await insertReturning("TenantFeature", {
      id: randomUUID(),
      tenantId,
      plan,
      ...selection.features,
      createdAt: now,
      updatedAt: now,
    }, "id", tx);
    for (const entitlement of selection.modules) {
      await insertReturning("TenantModuleEntitlement", {id:randomUUID(),tenantId,...entitlement,updatedBy:actor?.id??null,effectiveAt:now,createdAt:now,updatedAt:now},"id",tx);
      await insertReturning("TenantModuleAuditLog", {id:randomUUID(),tenantId,moduleKey:entitlement.moduleKey,action:entitlement.status,reason:"Initial tenant provisioning",performedBy:actor?.id??null,performedAt:now},"id",tx);
    }
    const objectIds = await createCoreObjectDefinitions(tenantId, tx);
    await seedDefaultOpportunityType(tenantId, objectIds.opportunityObjectId, tx);
  });

  return { tenantId, userId };
}

// WP07 (F04): CROSS_TENANT_ADMIN, disposition B -- only reachable from platform-admin
// suspend/unsuspend routes and the privileged-action-request approval flow, both of which act
// on a tenantId OTHER than the calling admin's own ambient (typically null) one.
export async function changeTenantStatus(tenantId: string, status: "ACTIVE" | "SUSPENDED") {
  const updated = await executeAsSystem('update "Tenant" set status = $1 where id = $2', [status, tenantId]);
  if (!updated) throw new Error("TENANT_NOT_FOUND");
}

export async function getTenantFeatureFlags(tenantId: string): Promise<TenantFeatureFlags> {
  const row = await queryOne<Partial<TenantFeatureFlags>>(
    'select "opportunityEnabled", "automationEnabled", "salesGroupsEnabled", "formBuilderEnabled", "advancedReporting", "apiAccessEnabled", "payoutsEnabled", "gamificationEnabled" from "TenantFeature" where "tenantId" = $1 limit 1',
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

// WP07 (F04): CROSS_TENANT_ADMIN, disposition B -- only reachable from
// GET /api/platform-admin/tenants/[id]/config, reading a tenant other than the admin's own.
export async function getTenantConfigForPlatformAdmin(tenantId: string) {
  const [tenant, config] = await Promise.all([
    queryOneAsSystem<any>('select id, name, status, plan, environment, "createdAt" from "Tenant" where id = $1 limit 1', [tenantId]),
    queryOneAsSystem<any>('select "featureFlags", "storageQuota", "userLimit", "maintenanceActive", "maintenanceMessage" from "TenantConfig" where "tenantId" = $1 limit 1', [tenantId]),
  ]);
  if (!tenant) return null;
  return {
    tenant,
    featureFlags: config?.featureFlags ?? {},
    storageQuota: config?.storageQuota ?? 1,
    userLimit: config?.userLimit ?? null,
    maintenanceActive: config?.maintenanceActive ?? false,
    maintenanceMessage: config?.maintenanceMessage ?? null,
  };
}

// WP07 (F04): CROSS_TENANT_ADMIN, disposition B -- only reachable from
// PATCH /api/platform-admin/tenants/[id]/environment.
export async function changeTenantEnvironment(tenantId: string, environment: "PRODUCTION" | "SANDBOX" | "TEST") {
  const row = await queryOneAsSystem<any>('update "Tenant" set environment = $1 where id = $2 returning id, environment', [environment, tenantId]);
  if (!row) throw new Error("TENANT_NOT_FOUND");
  return row;
}

// TenantConfig has no row for most tenants today (confirmed: only ever read, never inserted at
// tenant-creation time) -- upsert-on-write rather than assuming a row already exists, following
// this session's own established pattern for "settings row that may not exist yet".
// WP07 (F04): CROSS_TENANT_ADMIN, disposition B -- only reachable from
// PUT /api/platform-admin/tenants/[id]/maintenance, acting on a tenant other than the admin's own.
export async function upsertTenantMaintenanceBanner(tenantId: string, input: { active: boolean; message?: string | null }) {
  const existing = await queryOneAsSystem<{ id: string }>('select id from "TenantConfig" where "tenantId" = $1 limit 1', [tenantId]);
  if (existing) {
    return queryOneAsSystem<any>(
      'update "TenantConfig" set "maintenanceActive" = $1, "maintenanceMessage" = $2 where id = $3 returning "maintenanceActive", "maintenanceMessage"',
      [input.active, input.message ?? null, existing.id],
    );
  }
  return queryOneAsSystem<any>(
    'insert into "TenantConfig" (id, "tenantId", "featureFlags", "maintenanceActive", "maintenanceMessage") values ($1, $2, $3, $4, $5) returning "maintenanceActive", "maintenanceMessage"',
    [randomUUID(), tenantId, {}, input.active, input.message ?? null],
  );
}

// NOT converted -- see 25_AUDIT_REMEDIATION_PLAN.md "## WP07 pre-auth/system path inventory"
// open question: this delegates to listTenantUsers, which is ALSO called directly by the normal
// authenticated /api/users route for a tenant admin's own tenant. Converting listTenantUsers
// itself to the system pool would incorrectly bypass RLS for that ordinary per-tenant caller too
// -- flagged as needing an optional-client/pool-parameter split (the same shape WP08 already
// used for createAuditLog/enqueueWebhookEvent) rather than guessed at here.
export async function getTenantUsersForPlatformAdmin(tenantId: string) {
  return listTenantUsers(tenantId);
}

// WP07 (F04): CROSS_TENANT_ADMIN, disposition B -- only reachable from
// POST /api/platform-admin/impersonate, looking up a user in a tenant other than the admin's own.
export async function impersonateTenantUser(platformAdminUserId: string, tenantId: string, userId: string) {
  const user = await queryOneAsSystem<any>('select id, email, name, "tenantId", "roleId" from "User" where id = $1 and "tenantId" = $2 limit 1', [userId, tenantId]);
  if (!user) throw new Error("USER_NOT_FOUND");
  return { user, platformAdminUserId };
}
