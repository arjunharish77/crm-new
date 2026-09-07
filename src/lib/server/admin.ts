import * as pgAdmin from "@/lib/repositories/auth-admin-postgres";
import { signAuthToken } from "@/lib/server/auth";
import { createAuditLog } from "@/lib/server/crm";
import { createUserSession } from "@/lib/server/sessions";

// Loose actor shape -- createAuditLog only ever reads id/tenantId off it.
type AuditActor = { id: string; tenantId: string | null };

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
  features?: {
    opportunityEnabled?: boolean;
    automationEnabled?: boolean;
    salesGroupsEnabled?: boolean;
    formBuilderEnabled?: boolean;
    advancedReporting?: boolean;
    apiAccessEnabled?: boolean;
  };
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

export async function createTenantWithAdmin(input: CreateTenantInput) {
  return pgAdmin.createTenantWithAdmin(input);
}

export async function changeTenantStatus(tenantId: string, status: "ACTIVE" | "SUSPENDED") {
  return pgAdmin.changeTenantStatus(tenantId, status);
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

  return { token: accessToken, user };
}
