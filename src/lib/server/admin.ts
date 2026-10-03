import { type TenantProvisioningInput } from "@/lib/tenant-provisioning";
import * as pgAdmin from "@/lib/repositories/auth-admin-postgres";
import { signAuthToken } from "@/lib/server/auth";
import { createAuditLog } from "@/lib/server/crm";
import { createUserSession } from "@/lib/server/sessions";
import { queryAsSystem, queryOneAsSystem } from "@/lib/db/query";

// Loose actor shape -- createAuditLog only ever reads id/tenantId off it.
type AuditActor = { id: string; tenantId: string | null };

type PlatformBootstrapInput = {
  name: string;
  email: string;
  password: string;
};

type CreateTenantInput = TenantProvisioningInput;

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

const TENANT_FEATURE_KEYS = [
  "opportunityEnabled",
  "automationEnabled",
  "salesGroupsEnabled",
  "formBuilderEnabled",
  "advancedReporting",
  "apiAccessEnabled",
  "payoutsEnabled",
  "gamificationEnabled",
] as const;

type TenantFeatureFlags = Record<(typeof TENANT_FEATURE_KEYS)[number], boolean>;

export async function getBootstrapStatus() {
  return pgAdmin.getBootstrapStatus();
}

export async function bootstrapPlatformAdmin(input: PlatformBootstrapInput) {
  return pgAdmin.bootstrapPlatformAdmin(input);
}

export async function listTenantUsers(tenantId: string | null) {
  return pgAdmin.listTenantUsers(tenantId);
}

export async function createTenantScopedUser(tenantId: string, input: CreateUserInput) {
  return pgAdmin.createTenantScopedUser(tenantId, input);
}

export async function updateTenantScopedUser(tenantId: string, userId: string, input: UpdateUserInput, actor?: AuditActor) {
  const permissionRelevant = input.roleId !== undefined || input.permissionTemplateId !== undefined;
  const before = permissionRelevant ? await pgAdmin.getTenantScopedUserPermissionSummary(tenantId, userId) : null;
  const updated: any = await pgAdmin.updateTenantScopedUser(tenantId, userId, input);
  if (permissionRelevant && actor) {
    await createAuditLog(actor, "UPDATE", "USER_PERMISSIONS", userId, before, {
      roleId: updated.roleId,
      permissionTemplateId: updated.permissionTemplateId,
    }, {
      roleId: { before: before?.roleId ?? null, after: updated.roleId ?? null },
      permissionTemplateId: { before: before?.permissionTemplateId ?? null, after: updated.permissionTemplateId ?? null },
    }).catch(() => undefined);
  }
  return updated;
}

export async function listTenantRoles(tenantId: string | null) {
  return pgAdmin.listTenantRoles(tenantId);
}

export async function createTenantRole(tenantId: string, input: RoleInput, actor?: AuditActor) {
  const role: any = await pgAdmin.createTenantRole(tenantId, input);
  if (actor) await createAuditLog(actor, "CREATE", "ROLE", role.id, null, role, null).catch(() => undefined);
  return role;
}

export async function updateTenantRole(tenantId: string, roleId: string, input: RoleInput, actor?: AuditActor) {
  const before = actor ? await pgAdmin.getTenantRoleById(tenantId, roleId) : null;
  const role = await pgAdmin.updateTenantRole(tenantId, roleId, input);
  if (actor) await createAuditLog(actor, "UPDATE", "ROLE", roleId, before, role, null).catch(() => undefined);
  return role;
}

export async function deleteTenantRole(tenantId: string, roleId: string, actor?: AuditActor) {
  const before = actor ? await pgAdmin.getTenantRoleById(tenantId, roleId) : null;
  await pgAdmin.deleteTenantRole(tenantId, roleId);
  if (actor) await createAuditLog(actor, "DELETE", "ROLE", roleId, before, null, null).catch(() => undefined);
}

export async function listPermissionTemplatesForTenant(tenantId: string) {
  return pgAdmin.listPermissionTemplatesForTenant(tenantId);
}

export async function createPermissionTemplateForTenant(tenantId: string, input: PermissionTemplateInput) {
  return pgAdmin.createPermissionTemplateForTenant(tenantId, input);
}

export async function updatePermissionTemplateForTenant(tenantId: string, templateId: string, input: PermissionTemplateInput) {
  return pgAdmin.updatePermissionTemplateForTenant(tenantId, templateId, input);
}

export async function deletePermissionTemplateForTenant(tenantId: string, templateId: string) {
  return pgAdmin.deletePermissionTemplateForTenant(tenantId, templateId);
}

export async function listTenants() {
  return pgAdmin.listTenants();
}

// F23 fix (WP11): /dashboard/admin/usage previously called an API route that didn't exist
// (/api/platform-admin/usage/overview), silently falling back to showing 0 for every number --
// indistinguishable from "genuinely zero usage." All real, platform-wide counts, straightforward
// to compute directly (no new tables/infrastructure needed).
// WP07 (F04): CROSS_TENANT_ADMIN, disposition B -- genuinely aggregates across every tenant at
// once; platform-admin only, no per-tenant equivalent caller exists.
export async function getPlatformUsageOverview() {
  const [tenantCounts, userTotal, usersByTenant, leadTotal, opportunityTotal, activityTotal] = await Promise.all([
    queryAsSystem<{ status: string; count: number }>(`select status, count(*)::int as count from "Tenant" group by status`),
    queryOneAsSystem<{ count: number }>(`select count(*)::int as count from "User" where "tenantId" is not null`),
    queryAsSystem<{ tenantId: string; count: number }>(
      `select "tenantId", count(*)::int as count from "User" where "tenantId" is not null group by "tenantId" order by count(*) desc limit 20`,
    ),
    queryOneAsSystem<{ count: number }>(`select count(*)::int as count from "Lead"`),
    queryOneAsSystem<{ count: number }>(`select count(*)::int as count from "Opportunity"`),
    queryOneAsSystem<{ count: number }>(`select count(*)::int as count from "Activity"`),
  ]);
  const countFor = (status: string) => tenantCounts.find((row) => row.status === status)?.count ?? 0;
  return {
    tenants: {
      total: tenantCounts.reduce((sum, row) => sum + row.count, 0),
      active: countFor("ACTIVE"),
      suspended: countFor("SUSPENDED"),
      // No tenant in this app's real status vocabulary is ever "TRIAL" today (changeTenantStatus
      // only accepts ACTIVE/SUSPENDED) -- reported honestly as 0 rather than fabricated, and
      // forward-compatible if that status is ever introduced.
      trial: countFor("TRIAL"),
    },
    users: {
      total: userTotal?.count ?? 0,
      byTenant: usersByTenant.map((row) => ({ tenantId: row.tenantId, count: row.count })),
    },
    data: {
      leads: leadTotal?.count ?? 0,
      opportunities: opportunityTotal?.count ?? 0,
      activities: activityTotal?.count ?? 0,
    },
  };
}

// F23 fix (WP11): /dashboard/admin/usage also called /api/platform-admin/automation/stats,
// equally absent. AutomationExecution already records every run's status/timing -- real,
// platform-wide aggregation, not a new tracking mechanism.
// WP07 (F04): CROSS_TENANT_ADMIN, disposition B -- same reasoning as getPlatformUsageOverview.
export async function getPlatformAutomationStats() {
  const [totalRules, executionCounts, last24h, topRules] = await Promise.all([
    queryOneAsSystem<{ count: number }>(`select count(*)::int as count from "AutomationV2" where "deletedAt" is null`),
    queryAsSystem<{ status: string; count: number }>(`select status, count(*)::int as count from "AutomationExecution" group by status`),
    queryOneAsSystem<{ count: number }>(`select count(*)::int as count from "AutomationExecution" where "startedAt" >= now() - interval '24 hours'`),
    queryAsSystem<{ automationId: string; ruleName: string | null; count: number }>(
      `select e."automationId", a.name as "ruleName", count(*)::int as count
       from "AutomationExecution" e
       left join "AutomationV2" a on a.id = e."automationId"
       group by e."automationId", a.name
       order by count(*) desc
       limit 10`,
    ),
  ]);
  const countFor = (status: string) => executionCounts.find((row) => row.status === status)?.count ?? 0;
  return {
    totalRules: totalRules?.count ?? 0,
    executions: {
      total: executionCounts.reduce((sum, row) => sum + row.count, 0),
      success: countFor("COMPLETED"),
      failed: countFor("FAILED"),
      last24h: last24h?.count ?? 0,
    },
    topRules: topRules.map((row) => ({
      ruleId: row.automationId,
      ruleName: row.ruleName ?? "(deleted rule)",
      executionCount: row.count,
    })),
  };
}

export async function createTenantWithAdmin(input: CreateTenantInput, actor?: { id: string }) {
  return pgAdmin.createTenantWithAdmin(input, actor);
}

export async function changeTenantStatus(tenantId: string, status: "ACTIVE" | "SUSPENDED") {
  return pgAdmin.changeTenantStatus(tenantId, status);
}

// Suspending a workspace needs a reason, and suspending or reactivating one leaves an entry in
// that workspace's audit log with who did it and why (Section 8 #12: neither was recorded).
// `requestId` is set when the change ran on approval of a privileged-action request.
export async function setTenantStatusForPlatformAdmin(
  actor: { id: string },
  tenantId: string,
  status: "ACTIVE" | "SUSPENDED",
  input: { reason?: string | null; requestId?: string; approvedBy?: string | null } = {},
) {
  const reason = String(input.reason ?? "").trim().slice(0, 1000);
  if (status === "SUSPENDED" && !reason) throw new Error("SUSPEND_REASON_REQUIRED");
  await pgAdmin.changeTenantStatus(tenantId, status);
  // Attributed to the workspace (not the platform admin's own, usually-null tenant) so it shows
  // in that workspace's audit log, as impersonation does.
  await createAuditLog(
    { id: actor.id, tenantId },
    status === "SUSPENDED" ? "TENANT_SUSPENDED" : "TENANT_REACTIVATED",
    "TENANT",
    tenantId,
    null,
    { status },
    { platformAdminUserId: actor.id, reason: reason || null, ...(input.requestId ? { requestId: input.requestId, approvedBy: input.approvedBy ?? null } : {}) },
  );
}

export async function changeTenantEnvironment(tenantId: string, environment: "PRODUCTION" | "SANDBOX" | "TEST") {
  return pgAdmin.changeTenantEnvironment(tenantId, environment);
}

export async function upsertTenantMaintenanceBanner(tenantId: string, input: { active: boolean; message?: string | null }) {
  return pgAdmin.upsertTenantMaintenanceBanner(tenantId, input);
}

export async function getTenantFeatureFlags(tenantId: string): Promise<TenantFeatureFlags> {
  return pgAdmin.getTenantFeatureFlags(tenantId);
}

export async function updateTenantFeatureFlags(tenantId: string, flags: Partial<TenantFeatureFlags>) {
  return pgAdmin.updateTenantFeatureFlags(tenantId, flags);
}

export async function getTenantConfigForPlatformAdmin(tenantId: string) {
  return pgAdmin.getTenantConfigForPlatformAdmin(tenantId);
}

export async function getTenantUsersForPlatformAdmin(tenantId: string) {
  return pgAdmin.getTenantUsersForPlatformAdmin(tenantId);
}

export async function impersonateTenantUser(platformAdminUserId: string, tenantId: string, userId: string, reason: string) {
  const trimmedReason = reason.trim();
  // "Explicit reason" (gap checklist item's own named sub-item) -- previously "no 'reason' is
  // ever captured or required when starting impersonation." Required, not merely accepted, so
  // it can't be silently skipped by an API caller that omits it.
  if (!trimmedReason) throw new Error("IMPERSONATION_REASON_REQUIRED");

  const { user } = await pgAdmin.impersonateTenantUser(platformAdminUserId, tenantId, userId);

  // Real UserSession row, and -- as a direct side effect of createUserSession's own
  // isImpersonation branch -- a genuinely shorter absolute expiry (4h) than a normal login's
  // 7d, closing a specific, previously-confirmed gap ("the impersonation token gets the exact
  // same 7-day expiry as a normal login, no shorter time limit specific to impersonation").
  const session = await createUserSession({
    userId: user.id,
    tenantId: user.tenantId,
    isImpersonation: true,
    impersonatedBy: platformAdminUserId,
    reason: trimmedReason,
  });

  const accessToken = await signAuthToken(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      roleId: user.roleId,
      isPlatformAdmin: false,
      platformAdminId: null,
      isImpersonating: true,
      impersonatedBy: platformAdminUserId,
      sid: session.id,
    },
    { expiresIn: session.expiresInSeconds },
  );

  // Attributed to the impersonated tenant (not the platform admin's own, usually-null
  // tenant) so it surfaces in that tenant's own audit dashboard where it's actionable.
  await createAuditLog(
    { id: platformAdminUserId, tenantId: user.tenantId },
    "IMPERSONATE",
    "USER",
    user.id,
    null,
    null,
    { platformAdminUserId, reason: trimmedReason, sessionId: session.id },
  ).catch(() => undefined);

  return { token: accessToken, user, expiresInSeconds: session.expiresInSeconds };
}
