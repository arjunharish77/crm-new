import * as pgApiKeys from "@/lib/repositories/api-keys-postgres";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
  isPlatformAdmin?: boolean;
};

type ModulePermissions = Record<string, "full" | Record<string, boolean>>;

type ApiKeyInput = {
  name?: string;
  permissions?: ModulePermissions;
  ipAllowlist?: string[] | null;
  rateLimitPerMinute?: number;
  expiresAt?: string | null;
};

export async function listApiKeysForTenant(user: TenantUser) {
  return pgApiKeys.listApiKeysForTenant(user);
}

export async function createApiKeyForTenant(user: TenantUser, input: ApiKeyInput) {
  return pgApiKeys.createApiKeyForTenant(user, input);
}

export async function updateApiKeyForTenant(user: TenantUser, id: string, input: ApiKeyInput) {
  return pgApiKeys.updateApiKeyForTenant(user, id, input);
}

export async function revokeApiKeyForTenant(user: TenantUser, id: string) {
  return pgApiKeys.revokeApiKeyForTenant(user, id);
}

export async function rotateApiKeyForTenant(user: TenantUser, id: string) {
  return pgApiKeys.rotateApiKeyForTenant(user, id);
}

export const authenticateApiKeyRequest = pgApiKeys.authenticateApiKeyRequest;
export const hasApiKeyPermission = pgApiKeys.hasApiKeyPermission;
export const ApiKeyAuthenticationError = pgApiKeys.ApiKeyAuthenticationError;
export type ApiKeyAuthError = pgApiKeys.ApiKeyAuthError;
