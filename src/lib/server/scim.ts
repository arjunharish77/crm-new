import { randomUUID, randomBytes } from "crypto";
import { query, queryOne, execute, jsonbParam } from "@/lib/db/query";
import { createTenantScopedUser, updateTenantScopedUser } from "@/lib/server/admin";
import { createTeamForTenant, updateTeamForTenant, deleteTeamForTenant, addTeamMemberForTenant, removeTeamMemberForTenant } from "@/lib/server/admin-modules";

// SCIM 2.0 (RFC 7643/7644) core Users + Groups, authenticated via the existing ApiKey bearer
// system (see authenticateApiKeyRequest / the "users" module permission scope) rather than a
// separate SCIM-specific credential -- one fewer credential type for a tenant admin to manage,
// and the exact precedent /api/v1/leads already established for this app's developer-facing
// API surface. A SCIM Group maps 1:1 onto an existing Team (the closest native concept to an
// IdP group); "role/team/sales-group mapping" is the Team's own defaultRoleId/
// defaultSalesGroupId columns (migration 0073) -- adding a user to a Team via a Group PATCH
// applies that Team's configured Role/SalesGroup to the user automatically.
//
// Known, stated limitation: this app has no SSO/SAML login of its own -- only password-based
// /api/auth/login. SCIM provisions the User row (identity, profile, team/role assignment,
// active status) but does not by itself grant the provisioned user a way to actually sign in;
// an admin still needs to set a real password via the existing Users UI (or a future
// password-reset flow, which doesn't exist yet either) before they can log in directly. This is
// an honest architectural gap, not something SCIM alone can close.

export class ScimError extends Error {
  status: number;
  scimType?: string;
  constructor(status: number, message: string, scimType?: string) {
    super(message);
    this.status = status;
    this.scimType = scimType;
  }
}

type ScimContext = { tenantId: string; actorId: string };

function pseudoUser(ctx: ScimContext) {
  return { id: ctx.actorId, tenantId: ctx.tenantId };
}

async function logScimSync(
  tenantId: string,
  resourceType: "USER" | "GROUP",
  resourceId: string | null,
  action: "CREATE" | "UPDATE" | "DEACTIVATE" | "DELETE" | "MEMBERSHIP_CHANGE",
  payload: unknown,
  status: "SUCCESS" | "ERROR",
  errorMessage: string | null = null,
) {
  await execute(
    `insert into "ScimSyncLog" (id, "tenantId", "resourceType", "resourceId", action, payload, status, "errorMessage", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [randomUUID(), tenantId, resourceType, resourceId, action, jsonbParam(payload), status, errorMessage, new Date().toISOString()],
  ).catch(() => undefined);
}

// ---------------------------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------------------------

const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const SCIM_LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";

function baseUrl() {
  return process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
}

function scimUserResource(row: any) {
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: row.id,
    externalId: row.externalId ?? undefined,
    userName: row.email,
    name: { formatted: row.name },
    displayName: row.name,
    emails: [{ value: row.email, primary: true }],
    active: row.status === "ACTIVE",
    roles: row.roleName ? [{ value: row.roleName, primary: true }] : [],
    meta: {
      resourceType: "User",
      created: row.createdAt,
      lastModified: row.updatedAt ?? row.createdAt,
      location: `${baseUrl()}/api/scim/v2/Users/${row.id}`,
    },
  };
}

function scimGroupResource(row: any, members: Array<{ id: string; name: string }>) {
  return {
    schemas: [SCIM_GROUP_SCHEMA],
    id: row.id,
    externalId: row.externalId ?? undefined,
    displayName: row.name,
    members: members.map((m) => ({ value: m.id, display: m.name })),
    meta: {
      resourceType: "Group",
      created: row.createdAt,
      lastModified: row.updatedAt ?? row.createdAt,
      location: `${baseUrl()}/api/scim/v2/Groups/${row.id}`,
    },
  };
}

export function scimListResponse(resources: unknown[], totalResults: number, startIndex: number, itemsPerPage: number) {
  return {
    schemas: [SCIM_LIST_SCHEMA],
    totalResults,
    startIndex,
    itemsPerPage,
    Resources: resources,
  };
}

// Minimal, deliberately narrow filter support: `attr eq "value"` only, for the 3 attributes a
// real IdP (Okta/Azure AD) actually sends on every provisioning sync -- userName (their primary
// correlation key), emails.value (same value in this app, email IS the username), and
// externalId (their own id for the resource). Any other filter expression is rejected with a
// clear SCIM error rather than silently ignored, so a client relying on unsupported filter
// semantics fails loudly instead of getting a wrong, unfiltered result set.
function parseEqFilter(filter: string | null): { field: "email" | "externalId"; value: string } | null {
  if (!filter) return null;
  const match = filter.match(/^(userName|emails(?:\.value)?|externalId)\s+eq\s+"([^"]*)"$/i);
  if (!match) throw new ScimError(400, `Unsupported filter expression: ${filter}`, "invalidFilter");
  const attr = match[1].toLowerCase();
  const value = match[2];
  if (attr === "externalid") return { field: "externalId", value };
  return { field: "email", value };
}

// ---------------------------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------------------------

const USER_SELECT = `select u.id, u.email, u.name, u.status, u."externalId", u."createdAt", u."updatedAt", r.name as "roleName"
  from "User" u left join "Role" r on r.id = u."roleId"
  where u."tenantId"::text = $1 and u."deletedAt" is null`;

export async function listScimUsers(ctx: ScimContext, opts: { filter?: string | null; startIndex?: number; count?: number }) {
  const parsed = parseEqFilter(opts.filter ?? null);
  const startIndex = Math.max(1, opts.startIndex ?? 1);
  const count = Math.min(200, Math.max(1, opts.count ?? 50));

  const values: unknown[] = [ctx.tenantId];
  let clause = "";
  if (parsed) {
    values.push(parsed.value);
    clause = parsed.field === "email" ? ` and lower(u.email) = lower($${values.length})` : ` and u."externalId" = $${values.length}`;
  }

  const [rows, countRow] = await Promise.all([
    query<any>(`${USER_SELECT}${clause} order by u."createdAt" asc limit ${count} offset ${startIndex - 1}`, values),
    queryOne<{ count: string }>(`select count(*) as count from "User" u where u."tenantId"::text = $1 and u."deletedAt" is null${clause}`, values),
  ]);

  return scimListResponse(rows.map(scimUserResource), Number(countRow?.count ?? 0), startIndex, rows.length);
}

export async function getScimUserById(ctx: ScimContext, id: string) {
  const row = await queryOne<any>(`${USER_SELECT} and u.id::text = $2`, [ctx.tenantId, id]);
  if (!row) throw new ScimError(404, "User not found");
  return scimUserResource(row);
}

async function resolveScimRoleId(ctx: ScimContext, scimBody: any): Promise<string> {
  const requestedRoleName = Array.isArray(scimBody.roles) && scimBody.roles[0]?.value ? String(scimBody.roles[0].value) : null;
  if (requestedRoleName) {
    const role = await queryOne<{ id: string }>(`select id from "Role" where "tenantId"::text = $1 and lower(name) = lower($2) limit 1`, [ctx.tenantId, requestedRoleName]);
    if (role) return role.id;
  }
  const tenantFeature = await queryOne<{ defaultScimRoleId: string | null }>(`select "defaultScimRoleId" from "TenantFeature" where "tenantId" = $1 limit 1`, [ctx.tenantId]);
  if (tenantFeature?.defaultScimRoleId) return tenantFeature.defaultScimRoleId;
  throw new ScimError(400, "No role could be resolved for this user -- send a `roles` value matching an existing Role name, or configure a default SCIM role for this workspace.", "invalidValue");
}

function scimUserNameAndEmail(scimBody: any) {
  const email = String(scimBody.userName || scimBody.emails?.[0]?.value || "").trim().toLowerCase();
  if (!email) throw new ScimError(400, "userName (or emails[0].value) is required", "invalidValue");
  const name = String(scimBody.displayName || scimBody.name?.formatted || [scimBody.name?.givenName, scimBody.name?.familyName].filter(Boolean).join(" ") || email).trim();
  return { email, name };
}

export async function createScimUser(ctx: ScimContext, scimBody: any) {
  const { email, name } = scimUserNameAndEmail(scimBody);
  const roleId = await resolveScimRoleId(ctx, scimBody);
  const active = scimBody.active !== false;

  let created: { id: string } | undefined;
  try {
    // IdP-provisioned users authenticate via SSO at the IdP, not this app's own password
    // login -- a random, never-communicated password is set so the row satisfies User.password
    // NOT NULL without implying a usable credential exists.
    created = (await createTenantScopedUser(ctx.tenantId, {
      name,
      email,
      password: randomBytes(24).toString("hex"),
      roleId,
    })) as { id: string } | undefined;
  } catch (error) {
    if (error instanceof Error && error.message.includes("duplicate")) throw new ScimError(409, "A user with this email already exists", "uniqueness");
    throw error;
  }
  if (!created) throw new ScimError(500, "User creation failed");

  const now = new Date().toISOString();
  await execute(`update "User" set "externalId" = $1, status = $2, "updatedAt" = $3 where id = $4`, [scimBody.externalId ?? null, active ? "ACTIVE" : "INACTIVE", now, created.id]);

  await logScimSync(ctx.tenantId, "USER", created.id, "CREATE", { email, externalId: scimBody.externalId ?? null }, "SUCCESS");
  return getScimUserById(ctx, created.id);
}

async function applyScimUserPatch(ctx: ScimContext, id: string, patch: { name?: string; email?: string; active?: boolean; externalId?: string | null; roleId?: string }) {
  const existing = await queryOne<{ id: string; status: string }>(`select id, status from "User" where "tenantId"::text = $1 and id::text = $2 and "deletedAt" is null`, [ctx.tenantId, id]);
  if (!existing) throw new ScimError(404, "User not found");

  if (patch.name !== undefined || patch.roleId !== undefined) {
    await updateTenantScopedUser(ctx.tenantId, id, { name: patch.name, roleId: patch.roleId, status: patch.active === undefined ? undefined : patch.active ? "ACTIVE" : "INACTIVE" });
  } else if (patch.active !== undefined) {
    await updateTenantScopedUser(ctx.tenantId, id, { status: patch.active ? "ACTIVE" : "INACTIVE" });
  }
  if (patch.email !== undefined || patch.externalId !== undefined) {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (patch.email !== undefined) { values.push(patch.email); sets.push(`email = $${values.length}`); }
    if (patch.externalId !== undefined) { values.push(patch.externalId); sets.push(`"externalId" = $${values.length}`); }
    values.push(new Date().toISOString()); sets.push(`"updatedAt" = $${values.length}`);
    values.push(ctx.tenantId, id);
    await execute(`update "User" set ${sets.join(", ")} where "tenantId"::text = $${values.length - 1} and id::text = $${values.length}`, values);
  }

  const action = patch.active === false && existing.status === "ACTIVE" ? "DEACTIVATE" : "UPDATE";
  await logScimSync(ctx.tenantId, "USER", id, action, patch, "SUCCESS");
}

export async function replaceScimUser(ctx: ScimContext, id: string, scimBody: any) {
  const { email, name } = scimUserNameAndEmail(scimBody);
  const roleId = await resolveScimRoleId(ctx, scimBody).catch(() => undefined);
  await applyScimUserPatch(ctx, id, { name, email, active: scimBody.active !== false, externalId: scimBody.externalId ?? null, roleId });
  return getScimUserById(ctx, id);
}

// SCIM PATCH (RFC 7644 §3.5.2) operations -- supports the handful of paths a real IdP actually
// sends: `active` (deprovision/reprovision -- the operation that matters most), `userName`/
// `emails`/`emails[type eq "work"].value` (email change), `name.formatted`/`displayName`,
// `externalId`. Any other path is a silent no-op rather than a hard failure, matching SCIM's
// own tolerant-PATCH convention (an IdP sending an attribute this app doesn't model shouldn't
// break the sync for the attributes it does support).
export async function patchScimUser(ctx: ScimContext, id: string, operations: Array<{ op: string; path?: string; value?: unknown }>) {
  const patch: { name?: string; email?: string; active?: boolean; externalId?: string | null } = {};
  for (const operation of operations) {
    const op = String(operation.op ?? "").toLowerCase();
    const path = String(operation.path ?? "").toLowerCase();
    if (path === "active" || (!path && typeof (operation.value as any)?.active === "boolean")) {
      const value = path === "active" ? operation.value : (operation.value as any)?.active;
      patch.active = op === "remove" ? false : Boolean(value);
    } else if (path.startsWith("username") || path.startsWith("emails")) {
      if (op !== "remove" && typeof operation.value === "string") patch.email = operation.value.trim().toLowerCase();
    } else if (path.startsWith("name") || path === "displayname") {
      if (op !== "remove" && typeof operation.value === "string") patch.name = operation.value;
    } else if (path === "externalid") {
      patch.externalId = op === "remove" ? null : String(operation.value ?? "");
    }
  }
  await applyScimUserPatch(ctx, id, patch);
  return getScimUserById(ctx, id);
}

export async function deleteScimUser(ctx: ScimContext, id: string) {
  const existing = await queryOne<{ id: string }>(`select id from "User" where "tenantId"::text = $1 and id::text = $2 and "deletedAt" is null`, [ctx.tenantId, id]);
  if (!existing) throw new ScimError(404, "User not found");
  const now = new Date().toISOString();
  await execute(`update "User" set status = 'INACTIVE', "deletedAt" = $1, "deletedBy" = $2, "updatedAt" = $1 where id = $3`, [now, ctx.actorId, id]);
  await logScimSync(ctx.tenantId, "USER", id, "DELETE", null, "SUCCESS");
}

// ---------------------------------------------------------------------------------------------
// Groups (-> Team)
// ---------------------------------------------------------------------------------------------

const GROUP_SELECT = `select id::text as id, name, "externalId", "createdAt", "updatedAt" from "Team" where "tenantId"::text = $1`;

async function groupMembers(tenantId: string, teamId: string) {
  return query<{ id: string; name: string }>(
    `select u.id, u.name from "TeamMember" tm join "User" u on u.id = tm."userId" where tm."tenantId"::text = $1 and tm."teamId"::text = $2`,
    [tenantId, teamId],
  );
}

export async function listScimGroups(ctx: ScimContext, opts: { filter?: string | null; startIndex?: number; count?: number }) {
  const startIndex = Math.max(1, opts.startIndex ?? 1);
  const count = Math.min(200, Math.max(1, opts.count ?? 50));
  const displayNameMatch = opts.filter?.match(/^displayName\s+eq\s+"([^"]*)"$/i);
  if (opts.filter && !displayNameMatch) throw new ScimError(400, `Unsupported filter expression: ${opts.filter}`, "invalidFilter");

  const values: unknown[] = [ctx.tenantId];
  let clause = "";
  if (displayNameMatch) { values.push(displayNameMatch[1]); clause = ` and lower(name) = lower($${values.length})`; }

  const [rows, countRow] = await Promise.all([
    query<any>(`${GROUP_SELECT}${clause} order by "createdAt" asc limit ${count} offset ${startIndex - 1}`, values),
    queryOne<{ count: string }>(`select count(*) as count from "Team" where "tenantId"::text = $1${clause}`, values),
  ]);
  const resources = await Promise.all(rows.map(async (row) => scimGroupResource(row, await groupMembers(ctx.tenantId, row.id))));
  return scimListResponse(resources, Number(countRow?.count ?? 0), startIndex, rows.length);
}

export async function getScimGroupById(ctx: ScimContext, id: string) {
  const row = await queryOne<any>(`${GROUP_SELECT} and id::text = $2`, [ctx.tenantId, id]);
  if (!row) throw new ScimError(404, "Group not found");
  return scimGroupResource(row, await groupMembers(ctx.tenantId, id));
}

// Applies the Team's own defaultRoleId/defaultSalesGroupId (if configured) to a user newly
// added to it -- the actual "role/team/sales-group mapping" mechanism: membership in an
// IdP-synced group carries real, automatic consequences in this app, not just a label.
async function applyGroupDefaults(ctx: ScimContext, teamId: string, userId: string) {
  const team = await queryOne<{ defaultRoleId: string | null; defaultSalesGroupId: string | null }>(
    `select "defaultRoleId", "defaultSalesGroupId" from "Team" where "tenantId"::text = $1 and id::text = $2`,
    [ctx.tenantId, teamId],
  );
  if (!team) return;
  if (team.defaultRoleId) {
    await updateTenantScopedUser(ctx.tenantId, userId, { roleId: team.defaultRoleId });
  }
  if (team.defaultSalesGroupId) {
    await execute(
      `insert into "SalesGroupMember" (id, "groupId", "userId", "tenantId", role, "joinedAt")
       values ($1, $2, $3, $4, 'MEMBER', $5)
       on conflict do nothing`,
      [randomUUID(), team.defaultSalesGroupId, userId, ctx.tenantId, new Date().toISOString()],
    ).catch(() => undefined);
  }
}

export async function createScimGroup(ctx: ScimContext, scimBody: any) {
  const displayName = String(scimBody.displayName ?? "").trim();
  if (!displayName) throw new ScimError(400, "displayName is required", "invalidValue");

  const created = await createTeamForTenant(pseudoUser(ctx), { name: displayName });
  if (!created?.id) throw new ScimError(500, "Group creation failed");
  await execute(`update "Team" set "externalId" = $1 where id = $2`, [scimBody.externalId ?? null, created.id]);

  const memberIds = Array.isArray(scimBody.members) ? scimBody.members.map((m: any) => String(m.value)).filter(Boolean) : [];
  for (const userId of memberIds) {
    await addTeamMemberForTenant(pseudoUser(ctx), created.id, { userId }).catch(() => undefined);
    await applyGroupDefaults(ctx, created.id, userId);
  }

  await logScimSync(ctx.tenantId, "GROUP", created.id, "CREATE", { displayName, memberCount: memberIds.length }, "SUCCESS");
  return getScimGroupById(ctx, created.id);
}

export async function replaceScimGroup(ctx: ScimContext, id: string, scimBody: any) {
  const displayName = String(scimBody.displayName ?? "").trim();
  if (!displayName) throw new ScimError(400, "displayName is required", "invalidValue");
  const existing = await queryOne<{ id: string }>(`select id from "Team" where "tenantId"::text = $1 and id::text = $2`, [ctx.tenantId, id]);
  if (!existing) throw new ScimError(404, "Group not found");

  await updateTeamForTenant(pseudoUser(ctx), id, { name: displayName });
  await execute(`update "Team" set "externalId" = $1 where id = $2`, [scimBody.externalId ?? null, id]);

  const currentMembers = await groupMembers(ctx.tenantId, id);
  const nextMemberIds = new Set<string>(Array.isArray(scimBody.members) ? scimBody.members.map((m: any) => String(m.value)) : []);
  const currentMemberIds = new Set(currentMembers.map((m) => m.id));
  for (const member of currentMembers) {
    if (!nextMemberIds.has(member.id)) await removeTeamMemberForTenant(pseudoUser(ctx), id, member.id).catch(() => undefined);
  }
  for (const userId of nextMemberIds) {
    if (!currentMemberIds.has(userId)) {
      await addTeamMemberForTenant(pseudoUser(ctx), id, { userId }).catch(() => undefined);
      await applyGroupDefaults(ctx, id, userId);
    }
  }

  await logScimSync(ctx.tenantId, "GROUP", id, "MEMBERSHIP_CHANGE", { displayName, memberCount: nextMemberIds.size }, "SUCCESS");
  return getScimGroupById(ctx, id);
}

// SCIM PATCH for Groups -- almost always `members` add/remove in real IdP traffic (Okta/Azure
// AD push individual membership changes as PATCH, reserving PUT for a full-group edit).
export async function patchScimGroup(ctx: ScimContext, id: string, operations: Array<{ op: string; path?: string; value?: unknown }>) {
  const existing = await queryOne<{ id: string }>(`select id from "Team" where "tenantId"::text = $1 and id::text = $2`, [ctx.tenantId, id]);
  if (!existing) throw new ScimError(404, "Group not found");

  let membershipChanged = false;
  for (const operation of operations) {
    const op = String(operation.op ?? "").toLowerCase();
    const path = String(operation.path ?? "").toLowerCase();
    if (path === "displayname" && op !== "remove" && typeof operation.value === "string") {
      await updateTeamForTenant(pseudoUser(ctx), id, { name: operation.value });
      continue;
    }
    if (!path.startsWith("members")) continue;
    membershipChanged = true;
    const values = Array.isArray(operation.value) ? operation.value : operation.value ? [operation.value] : [];
    const userIds = values.map((v: any) => String(v.value ?? v)).filter(Boolean);
    if (op === "remove") {
      for (const userId of userIds) await removeTeamMemberForTenant(pseudoUser(ctx), id, userId).catch(() => undefined);
    } else {
      for (const userId of userIds) {
        await addTeamMemberForTenant(pseudoUser(ctx), id, { userId }).catch(() => undefined);
        await applyGroupDefaults(ctx, id, userId);
      }
    }
  }
  if (membershipChanged) await logScimSync(ctx.tenantId, "GROUP", id, "MEMBERSHIP_CHANGE", { operations }, "SUCCESS");
  return getScimGroupById(ctx, id);
}

export async function deleteScimGroup(ctx: ScimContext, id: string) {
  const existing = await queryOne<{ id: string }>(`select id from "Team" where "tenantId"::text = $1 and id::text = $2`, [ctx.tenantId, id]);
  if (!existing) throw new ScimError(404, "Group not found");
  await deleteTeamForTenant(pseudoUser(ctx), id);
  await logScimSync(ctx.tenantId, "GROUP", id, "DELETE", null, "SUCCESS");
}

// ---------------------------------------------------------------------------------------------
// Reconciliation report
// ---------------------------------------------------------------------------------------------

export async function listScimSyncLog(tenantId: string, limit = 100) {
  return query<any>(
    `select id, "resourceType", "resourceId", action, payload, status, "errorMessage", "createdAt"
     from "ScimSyncLog" where "tenantId" = $1 order by "createdAt" desc limit $2`,
    [tenantId, Math.min(500, Math.max(1, limit))],
  );
}

// The consistency half of "reconciliation reports": every User this app believes was
// SCIM-provisioned (has an externalId), alongside whether they've had ANY sync activity in the
// last 30 days -- a user with an externalId but no recent activity likely means the IdP's
// sync job stopped running or the user was removed from scope there without a corresponding
// deprovisioning push ever arriving, worth an admin's attention either way.
export async function getScimReconciliationSummary(tenantId: string) {
  const [users, recentActivity] = await Promise.all([
    query<{ id: string; name: string; email: string; status: string; externalId: string }>(
      `select id, name, email, status, "externalId" from "User" where "tenantId"::text = $1 and "externalId" is not null and "deletedAt" is null order by name asc`,
      [tenantId],
    ),
    query<{ resourceId: string; createdAt: string }>(
      `select "resourceId", max("createdAt") as "createdAt" from "ScimSyncLog" where "tenantId" = $1 and "resourceType" = 'USER' group by "resourceId"`,
      [tenantId],
    ),
  ]);
  const lastActivityByUserId = new Map(recentActivity.map((row) => [row.resourceId, row.createdAt]));
  const staleThreshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return users.map((user) => {
    const lastActivity = lastActivityByUserId.get(user.id) ?? null;
    return {
      ...user,
      lastActivity,
      stale: !lastActivity || new Date(lastActivity).getTime() < staleThreshold,
    };
  });
}

export async function getDefaultScimRoleId(tenantId: string) {
  const row = await queryOne<{ defaultScimRoleId: string | null }>(`select "defaultScimRoleId" from "TenantFeature" where "tenantId" = $1 limit 1`, [tenantId]);
  return row?.defaultScimRoleId ?? null;
}

export async function setDefaultScimRoleId(tenantId: string, roleId: string | null) {
  await execute(`update "TenantFeature" set "defaultScimRoleId" = $1, "updatedAt" = $2 where "tenantId" = $3`, [roleId, new Date().toISOString(), tenantId]);
}
