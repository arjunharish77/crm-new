export type AppUserContext = {
  id: string;
  tenantId: string | null;
  roleId?: string | null;
  role?: string | null;
  permissions?: string[];
  teamIds?: string[];
  salesGroupIds?: string[];
  isPlatformAdmin?: boolean;
  isPartner?: boolean;
};

export type TenantScopedContext = AppUserContext & {
  tenantId: string;
};

export function requireTenantContext(user: AppUserContext): TenantScopedContext {
  if (!user.tenantId) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }
  return user as TenantScopedContext;
}
