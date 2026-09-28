import { queryOne } from "@/lib/db/query";
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

/** Attribute API writes to the key's real creator; ApiKey IDs are not User foreign keys. */
export async function buildApiKeyWriteActor(apiKey: {id:string;createdBy:string|null}, tenantId:string) {
 const owner = apiKey.createdBy ? await queryOne<{id:string}>('select id from "User" where id=$1 and "tenantId"=$2 and status=\'ACTIVE\' and "deletedAt" is null',[apiKey.createdBy,tenantId]) : null;
 if(!owner)throw new ApiKeyAuthenticationError("API_KEY_OWNER_UNAVAILABLE");
 return {id:owner.id,tenantId,apiKeyId:apiKey.id};
}
