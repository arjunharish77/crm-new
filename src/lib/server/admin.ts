import * as pgAdmin from "@/lib/repositories/auth-admin-postgres";
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

export async function updateTenantScopedUser(tenantId: string, userId: string, input: UpdateUserInput) {
  return pgAdmin.updateTenantScopedUser(tenantId, userId, input);
}

export async function listTenantRoles(tenantId: string | null) {
  return pgAdmin.listTenantRoles(tenantId);
}

export async function createTenantRole(tenantId: string, input: RoleInput) {
  return pgAdmin.createTenantRole(tenantId, input);
}

export async function updateTenantRole(tenantId: string, roleId: string, input: RoleInput) {
  return pgAdmin.updateTenantRole(tenantId, roleId, input);
}

export async function deleteTenantRole(tenantId: string, roleId: string) {
  return pgAdmin.deleteTenantRole(tenantId, roleId);
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

export async function impersonateTenantUser(platformAdminUserId: string, tenantId: string, userId: string) {
  const { user } = await pgAdmin.impersonateTenantUser(platformAdminUserId, tenantId, userId);
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

  return { token: accessToken, user };
}
