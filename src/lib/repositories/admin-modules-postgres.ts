import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";

type TenantUser = {
  id: string;
  tenantId: string | null;
};

type GeneralSettings = {
  companyName: string;
  timezone: string;
  currency: string;
  language: string;
  dateFormat: string;
};

function requireTenantId(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return user.tenantId;
}

function asUuidOrNull(value: unknown) {
  const text = typeof value === "string" ? value : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function cleanPatch(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

async function insertReturning<T>(table: string, row: Record<string, unknown>, returning: string) {
  const columns = Object.keys(row);
  const values = columns.map((column) => row[column]);
  const result = await queryOne<T & Record<string, unknown>>(
    `insert into "${table}" (${columns.map((column) => `"${column}"`).join(", ")}) values (${columns.map((_, index) => `$${index + 1}`).join(", ")}) returning ${returning}`,
    values,
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
) {
  const cleaned = cleanPatch(patch);
  const columns = Object.keys(cleaned);
  if (!columns.length) throw new Error(`${table.toUpperCase()}_EMPTY_UPDATE`);
  const values = columns.map((column) => cleaned[column]);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  const shiftedWhere = whereSql.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + values.length}`);
  const result = await queryOne<T & Record<string, unknown>>(
    `update "${table}" set ${assignments} ${shiftedWhere} returning ${returning}`,
    values.concat(whereValues),
  );
  if (!result) throw new Error(`${table.toUpperCase()}_NOT_FOUND`);
  return result as T;
}

async function usersById(tenantId: string, userIds: string[]) {
  if (!userIds.length) return new Map<string, any>();
  const users = await query<any>(
    'select id, name, email from "User" where "tenantId"::text = $1 and id::text = any($2::text[])',
    [tenantId, userIds.map(String)],
  );
  return new Map(users.map((user) => [user.id, user]));
}

export async function listTeamsForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  const teams = await query<any>(
    'select id, name, description, "leadId", department, "workingHours", timezone, "isActive", "createdAt", "updatedAt" from "Team" where "tenantId"::text = $1 order by "createdAt" desc',
    [tenantId],
  );
  const teamIds = teams.map((team) => String(team.id));
  const members = teamIds.length
    ? await query<any>('select id, "teamId", "userId", role, "joinedAt" from "TeamMember" where "tenantId"::text = $1 and "teamId"::text = any($2::text[])', [tenantId, teamIds])
    : [];
  const userMap = await usersById(tenantId, [...new Set(members.map((member) => member.userId).filter(Boolean))]);

  return teams.map((team) => {
    const teamMembers = members
      .filter((member) => String(member.teamId) === String(team.id))
      .map((member) => ({ ...member, user: userMap.get(member.userId) ?? null }))
      .filter((member) => member.user);
    return { ...team, members: teamMembers, memberCount: teamMembers.length, _count: { members: teamMembers.length } };
  });
}

export async function createTeamForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const now = new Date().toISOString();
  const data = await insertReturning<any>("Team", {
    id: randomUUID(),
    tenantId,
    name: String(input.name ?? "").trim(),
    description: input.description ? String(input.description) : null,
    leadId: asUuidOrNull(input.leadId),
    department: input.department ? String(input.department) : null,
    workingHours: input.workingHours ?? null,
    timezone: input.timezone ? String(input.timezone) : "UTC",
    isActive: input.isActive !== false,
    createdAt: now,
    updatedAt: now,
  }, 'id, name, description, "leadId", department, "workingHours", timezone, "isActive", "createdAt", "updatedAt"');
  return { ...data, memberCount: 0, _count: { members: 0 }, members: [] };
}

export async function updateTeamForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const payload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ["name", "description", "leadId", "department", "workingHours", "timezone", "isActive"]) {
    if (key in input) payload[key] = input[key] || null;
  }
  if ("leadId" in payload) payload.leadId = asUuidOrNull(payload.leadId);
  return updateReturning<any>("Team", payload, 'where "tenantId"::text = $1 and id::text = $2', [tenantId, id], 'id, name, description, "leadId", department, "workingHours", timezone, "isActive", "createdAt", "updatedAt"');
}

export async function deleteTeamForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  await withTransaction(user, async (tx) => {
    await tx.query('delete from "TeamMember" where "tenantId"::text = $1 and "teamId"::text = $2', [tenantId, id]);
    await tx.query('delete from "Team" where "tenantId"::text = $1 and id::text = $2', [tenantId, id]);
  });
}

export async function addTeamMemberForTenant(user: TenantUser, teamId: string, memberInput: { userId: string; role?: string }) {
  const tenantId = requireTenantId(user);
  const now = new Date().toISOString();
  return insertReturning<any>("TeamMember", {
    id: randomUUID(),
    tenantId,
    teamId,
    userId: memberInput.userId,
    role: memberInput.role ?? "MEMBER",
    joinedAt: now,
  }, 'id, "teamId", "userId", role, "joinedAt"');
}

export async function removeTeamMemberForTenant(user: TenantUser, teamId: string, userId: string) {
  const tenantId = requireTenantId(user);
  await execute('delete from "TeamMember" where "tenantId"::text = $1 and "teamId"::text = $2 and "userId"::text = $3', [tenantId, teamId, userId]);
}

export async function listSalesGroupsForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  const [groups, members] = await Promise.all([
    query<any>(
      'select id, name, description, "managerId", "permissionTemplateId", "isActive", "createdAt", "updatedAt" from "SalesGroup" where "tenantId" = $1 order by "createdAt" desc',
      [tenantId],
    ),
    query<any>('select id, "groupId", "userId", role, "joinedAt" from "SalesGroupMember" where "tenantId" = $1', [tenantId]),
  ]);
  const userMap = await usersById(tenantId, [...new Set(members.map((member) => member.userId).filter(Boolean))]);

  return groups.map((group) => {
    const groupMembers = members
      .filter((member) => member.groupId === group.id)
      .map((member) => ({ ...member, user: userMap.get(member.userId) ?? null }))
      .filter((member) => member.user);
    return { ...group, members: groupMembers, _count: { members: groupMembers.length } };
  });
}

export async function createSalesGroupForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const now = new Date().toISOString();
  return insertReturning<any>("SalesGroup", {
    id: randomUUID(),
    tenantId,
    name: String(input.name ?? "").trim(),
    description: input.description ? String(input.description) : null,
    managerId: input.managerId ? String(input.managerId) : null,
    permissionTemplateId: asUuidOrNull(input.permissionTemplateId),
    territories: input.territories ?? null,
    zipCodes: input.zipCodes ?? null,
    states: input.states ?? null,
    countries: input.countries ?? null,
    skills: input.skills ?? null,
    languages: input.languages ?? null,
    productLines: input.productLines ?? null,
    maxLeadsPerMember: Number(input.maxLeadsPerMember ?? 50),
    workingHours: input.workingHours ?? null,
    timezone: input.timezone ? String(input.timezone) : "UTC",
    isActive: input.isActive !== false,
    createdAt: now,
    updatedAt: now,
  }, 'id, name, description, "managerId", "permissionTemplateId", "isActive", "createdAt", "updatedAt"');
}

export async function updateSalesGroupForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const payload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of [
    "name",
    "description",
    "managerId",
    "permissionTemplateId",
    "territories",
    "zipCodes",
    "states",
    "countries",
    "skills",
    "languages",
    "productLines",
    "workingHours",
    "timezone",
    "isActive",
  ]) {
    if (key in input) payload[key] = key === "permissionTemplateId" ? asUuidOrNull(input[key]) : input[key];
  }
  if ("maxLeadsPerMember" in input) payload.maxLeadsPerMember = Number(input.maxLeadsPerMember ?? 50);
  return updateReturning<any>("SalesGroup", payload, 'where "tenantId" = $1 and id = $2', [tenantId, id], 'id, name, description, "managerId", "permissionTemplateId", "isActive", "createdAt", "updatedAt"');
}

export async function deleteSalesGroupForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  await execute('delete from "SalesGroup" where "tenantId" = $1 and id = $2', [tenantId, id]);
}

export async function addSalesGroupMemberForTenant(
  user: TenantUser,
  groupId: string,
  memberInput: { userId: string; role?: string },
) {
  const tenantId = requireTenantId(user);
  return insertReturning<any>("SalesGroupMember", {
    id: randomUUID(),
    groupId,
    userId: memberInput.userId,
    tenantId,
    role: memberInput.role ?? "MEMBER",
    joinedAt: new Date().toISOString(),
  }, 'id, "groupId", "userId", role, "joinedAt"');
}

export async function removeSalesGroupMemberForTenant(user: TenantUser, groupId: string, userId: string) {
  const tenantId = requireTenantId(user);
  await execute('delete from "SalesGroupMember" where "tenantId" = $1 and "groupId" = $2 and "userId" = $3', [tenantId, groupId, userId]);
}

function getGeneralSettingsFromFeatureFlags(featureFlags: unknown): Omit<GeneralSettings, "companyName"> {
  const settings =
    featureFlags &&
    typeof featureFlags === "object" &&
    !Array.isArray(featureFlags) &&
    "generalSettings" in featureFlags &&
    featureFlags.generalSettings &&
    typeof featureFlags.generalSettings === "object" &&
    !Array.isArray(featureFlags.generalSettings)
      ? (featureFlags.generalSettings as Record<string, unknown>)
      : {};

  return {
    timezone: typeof settings.timezone === "string" && settings.timezone.trim() ? settings.timezone : "Asia/Kolkata",
    currency: typeof settings.currency === "string" ? settings.currency : "INR",
    language: typeof settings.language === "string" ? settings.language : "en",
    dateFormat: "dd/MM/yyyy",
  };
}

export async function getGeneralSettingsForTenant(user: TenantUser): Promise<GeneralSettings> {
  const tenantId = requireTenantId(user);
  const [tenant, config] = await Promise.all([
    queryOne<{ name: string }>('select name from "Tenant" where id = $1 limit 1', [tenantId]),
    queryOne<{ featureFlags: Record<string, unknown> | null }>('select "featureFlags" from "TenantConfig" where "tenantId" = $1 limit 1', [tenantId]),
  ]);
  return { companyName: tenant?.name ?? "", ...getGeneralSettingsFromFeatureFlags(config?.featureFlags) };
}

export async function updateGeneralSettingsForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const now = new Date().toISOString();
  const tenantName = String(input.companyName ?? "").trim();
  const existingConfig = await queryOne<{ id: string; featureFlags: Record<string, unknown> | null }>(
    'select id, "featureFlags" from "TenantConfig" where "tenantId" = $1 limit 1',
    [tenantId],
  );
  const featureFlags =
    existingConfig?.featureFlags && typeof existingConfig.featureFlags === "object" && !Array.isArray(existingConfig.featureFlags)
      ? { ...existingConfig.featureFlags }
      : {};
  featureFlags.generalSettings = {
    timezone: typeof input.timezone === "string" && input.timezone.trim() ? input.timezone : "Asia/Kolkata",
    currency: String(input.currency ?? "INR"),
    language: String(input.language ?? "en"),
    dateFormat: "dd/MM/yyyy",
  };

  await withTransaction(user, async (tx) => {
    if (tenantName) {
      await tx.query('update "Tenant" set name = $1, "updatedAt" = $2 where id = $3', [tenantName, now, tenantId]);
    }
    if (existingConfig?.id) {
      await tx.query('update "TenantConfig" set "featureFlags" = $1 where "tenantId" = $2 and id = $3', [
        featureFlags,
        tenantId,
        existingConfig.id,
      ]);
    } else {
      await tx.query('insert into "TenantConfig" (id, "tenantId", "featureFlags") values ($1, $2, $3)', [
        randomUUID(),
        tenantId,
        featureFlags,
      ]);
    }
  });

  return getGeneralSettingsForTenant(user);
}
