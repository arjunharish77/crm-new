import { randomUUID, randomBytes, createHmac, timingSafeEqual } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import { DatabaseError } from "@/lib/db/errors";
import { checkRateLimit, clientIpFromRequest } from "@/lib/server/rate-limit";
import { assertFeatureEnabled, isFeatureEnabledForTenant } from "@/lib/server/entitlements";
import { assertNotImpersonating } from "@/lib/server/sessions";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
  isPlatformAdmin?: boolean;
  isImpersonating?: boolean;
};

type ModulePermissions = Record<string, "full" | Record<string, boolean>>;

type ApiKeyRow = {
  id: string;
  tenantId: string;
  name: string;
  secret: string;
  previousSecret: string | null;
  previousSecretExpiresAt: string | null;
  permissions: ModulePermissions;
  ipAllowlist: string[] | null;
  rateLimitPerMinute: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  isActive: boolean;
  revokedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

const REPLAY_WINDOW_SECONDS = 5 * 60;
const ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;

const COLUMNS =
  'id, "tenantId", name, secret, "previousSecret", "previousSecretExpiresAt", permissions, "ipAllowlist", "rateLimitPerMinute", "expiresAt", "lastUsedAt", "lastUsedIp", "isActive", "revokedAt", "createdBy", "createdAt", "updatedAt"';

// Excludes secret/previousSecret -- the plaintext value is only ever returned once, at
// creation/rotation time, matching the "shown once" convention this kind of credential needs
// regardless of how it's stored at rest.
function toPublicApiKey(row: ApiKeyRow) {
  const { secret: _secret, previousSecret: _previousSecret, ...rest } = row;
  return rest;
}

export async function listApiKeysForTenant(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertFeatureEnabled(user.tenantId, "apiAccessEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  const rows = await query<ApiKeyRow>(
    `select ${COLUMNS} from "ApiKey" where "tenantId" = $1 order by "createdAt" desc`,
    [user.tenantId],
  );
  return rows.map(toPublicApiKey);
}

export async function createApiKeyForTenant(
  user: TenantUser,
  input: { name?: string; permissions?: ModulePermissions; ipAllowlist?: string[] | null; rateLimitPerMinute?: number; expiresAt?: string | null },
) {
  assertNotImpersonating(user, "create_api_key");
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertFeatureEnabled(user.tenantId, "apiAccessEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  const name = input.name?.trim();
  if (!name) throw new Error("API_KEY_NAME_REQUIRED");

  const id = randomUUID();
  const secret = randomBytes(24).toString("hex");
  const now = new Date().toISOString();
  try {
    const row = await queryOne<ApiKeyRow>(
      `insert into "ApiKey"
        (id, "tenantId", name, secret, permissions, "ipAllowlist", "rateLimitPerMinute", "expiresAt", "isActive", "createdBy", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, $10)
       returning ${COLUMNS}`,
      [
        id,
        user.tenantId,
        name,
        secret,
        input.permissions ?? {},
        input.ipAllowlist?.length ? input.ipAllowlist : null,
        Math.max(1, Math.round(input.rateLimitPerMinute ?? 60)),
        input.expiresAt ?? null,
        user.id,
        now,
      ],
    );
    if (!row) throw new Error("API_KEY_INSERT_FAILED");
    // The only time the plaintext secret is ever returned -- callers must copy it now.
    return { ...toPublicApiKey(row), secret };
  } catch (error) {
    if (error instanceof DatabaseError && error.code === "23505") throw new Error("DUPLICATE_API_KEY_NAME");
    throw error;
  }
}

export async function updateApiKeyForTenant(
  user: TenantUser,
  id: string,
  input: { name?: string; permissions?: ModulePermissions; ipAllowlist?: string[] | null; rateLimitPerMinute?: number; expiresAt?: string | null },
) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertFeatureEnabled(user.tenantId, "apiAccessEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("API_KEY_NAME_REQUIRED");
    patch.name = name;
  }
  if (input.permissions !== undefined) patch.permissions = input.permissions;
  if (input.ipAllowlist !== undefined) patch.ipAllowlist = input.ipAllowlist?.length ? input.ipAllowlist : null;
  if (input.rateLimitPerMinute !== undefined) patch.rateLimitPerMinute = Math.max(1, Math.round(input.rateLimitPerMinute));
  if (input.expiresAt !== undefined) patch.expiresAt = input.expiresAt;

  const columns = Object.keys(patch);
  const values = columns.map((column) => patch[column]);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  try {
    const row = await queryOne<ApiKeyRow>(
      `update "ApiKey" set ${assignments} where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2} returning ${COLUMNS}`,
      [...values, user.tenantId, id],
    );
    if (!row) throw new Error("API_KEY_NOT_FOUND");
    return toPublicApiKey(row);
  } catch (error) {
    if (error instanceof DatabaseError && error.code === "23505") throw new Error("DUPLICATE_API_KEY_NAME");
    throw error;
  }
}

// Soft-revoke ("revoke flow") -- keeps the row (and its usage/audit history) rather than
// deleting it, matching this session's established convention for credential-bearing rows
// (WebhookSubscription.isActive, ExternalIntegration.isActive) over hard delete.
export async function revokeApiKeyForTenant(user: TenantUser, id: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertFeatureEnabled(user.tenantId, "apiAccessEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  const now = new Date().toISOString();
  const row = await queryOne<ApiKeyRow>(
    `update "ApiKey" set "isActive" = false, "revokedAt" = $1, "updatedAt" = $1 where "tenantId" = $2 and id = $3 returning ${COLUMNS}`,
    [now, user.tenantId, id],
  );
  if (!row) throw new Error("API_KEY_NOT_FOUND");
  return toPublicApiKey(row);
}

// Same rotation shape as rotateInboundWebhookSecret: the outgoing secret keeps working for a
// 24h grace window (previousSecret/previousSecretExpiresAt) instead of invalidating in-flight
// callers instantly -- a key is a long-lived credential potentially embedded in a script that
// isn't watching for an out-of-band "you must update now" signal.
export async function rotateApiKeyForTenant(user: TenantUser, id: string) {
  assertNotImpersonating(user, "rotate_api_key");
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertFeatureEnabled(user.tenantId, "apiAccessEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  const existing = await queryOne<ApiKeyRow>(`select ${COLUMNS} from "ApiKey" where "tenantId" = $1 and id = $2 limit 1`, [user.tenantId, id]);
  if (!existing) throw new Error("API_KEY_NOT_FOUND");

  const now = new Date();
  const secret = randomBytes(24).toString("hex");
  const row = await queryOne<ApiKeyRow>(
    `update "ApiKey"
     set secret = $1, "previousSecret" = $2, "previousSecretExpiresAt" = $3, "updatedAt" = $4
     where id = $5
     returning ${COLUMNS}`,
    [secret, existing.secret, new Date(now.getTime() + ROTATION_GRACE_MS).toISOString(), now.toISOString(), id],
  );
  if (!row) throw new Error("API_KEY_ROTATE_FAILED");
  return { ...toPublicApiKey(row), secret };
}

function hmacHex(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqualHex(a: string, b: string) {
  const bufferA = Buffer.from(a, "hex");
  const bufferB = Buffer.from(b, "hex");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

function safeEqualUtf8(a: string, b: string) {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export type ApiKeyAuthError =
  | "MISSING_CREDENTIALS"
  | "API_KEY_NOT_FOUND"
  | "API_KEY_REVOKED"
  | "API_KEY_EXPIRED"
  | "FEATURE_DISABLED"
  | "INVALID_SECRET"
  | "STALE_TIMESTAMP"
  | "INVALID_SIGNATURE"
  | "IP_NOT_ALLOWED"
  | "RATE_LIMITED";

export class ApiKeyAuthenticationError extends Error {
  reason: ApiKeyAuthError;
  constructor(reason: ApiKeyAuthError) {
    super(reason);
    this.reason = reason;
  }
}

function matchesSecret(candidate: string, row: ApiKeyRow) {
  if (safeEqualUtf8(candidate, row.secret)) return true;
  if (row.previousSecret && row.previousSecretExpiresAt && new Date(row.previousSecretExpiresAt).getTime() > Date.now()) {
    if (safeEqualUtf8(candidate, row.previousSecret)) return true;
  }
  return false;
}

function matchesSignature(signature: string, timestamp: string, method: string, path: string, rawBody: string, row: ApiKeyRow) {
  const signedPayload = `${timestamp}.${method.toUpperCase()}.${path}.${rawBody}`;
  if (safeEqualHex(hmacHex(row.secret, signedPayload), signature)) return true;
  if (row.previousSecret && row.previousSecretExpiresAt && new Date(row.previousSecretExpiresAt).getTime() > Date.now()) {
    if (safeEqualHex(hmacHex(row.previousSecret, signedPayload), signature)) return true;
  }
  return false;
}

function ipAllowed(ip: string, allowlist: string[] | null) {
  if (!allowlist || allowlist.length === 0) return true;
  return allowlist.includes(ip);
}

/**
 * The one entry point external callers authenticate through -- supports two modes:
 *  - Simple bearer: `Authorization: Bearer <keyId>.<secret>` (secret sent directly).
 *  - Signed: `X-Api-Key-Id`, `X-Api-Timestamp`, `X-Api-Signature` headers, no secret ever sent
 *    over the wire -- the "request signing" sub-item, reusing the exact timestamp-bound
 *    HMAC-SHA256 + timingSafeEqual scheme this session already built for inbound/outbound
 *    webhook governance (inbound-webhooks.ts / webhook-outbox.ts), for consistency.
 * Enforces expiry, revocation, IP allowlist, per-key rate limit, and records last-used
 * tracking -- all in one place so every route that authenticates via API key gets every
 * sub-item of this checklist item for free, rather than each route re-implementing a subset.
 */
export async function authenticateApiKeyRequest(
  request: Request,
  context: { method: string; path: string; rawBody: string },
) {
  const authHeader = request.headers.get("authorization");
  const keyIdHeader = request.headers.get("x-api-key-id");
  const timestampHeader = request.headers.get("x-api-timestamp");
  const signatureHeader = request.headers.get("x-api-signature");

  let keyId: string | null = null;
  let mode: "bearer" | "signed";
  let bearerSecret: string | null = null;

  if (keyIdHeader && timestampHeader && signatureHeader) {
    mode = "signed";
    keyId = keyIdHeader;
  } else if (authHeader?.startsWith("Bearer ")) {
    mode = "bearer";
    const token = authHeader.slice("Bearer ".length).trim();
    const separatorIndex = token.indexOf(".");
    if (separatorIndex === -1) throw new ApiKeyAuthenticationError("MISSING_CREDENTIALS");
    keyId = token.slice(0, separatorIndex);
    bearerSecret = token.slice(separatorIndex + 1);
  } else {
    throw new ApiKeyAuthenticationError("MISSING_CREDENTIALS");
  }
  if (!keyId) throw new ApiKeyAuthenticationError("MISSING_CREDENTIALS");

  const row = await queryOne<ApiKeyRow>(`select ${COLUMNS} from "ApiKey" where id = $1 limit 1`, [keyId]);
  if (!row) throw new ApiKeyAuthenticationError("API_KEY_NOT_FOUND");
  if (!row.isActive) throw new ApiKeyAuthenticationError("API_KEY_REVOKED");
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) throw new ApiKeyAuthenticationError("API_KEY_EXPIRED");
  // A tenant that disabled API Access after this key was created loses live access
  // immediately, the same "module off -> no-op/deny, not a crash" convention this session's
  // other feature gates (runAutomationsForEvent, distributeRecord) already established.
  if (!(await isFeatureEnabledForTenant(row.tenantId, "apiAccessEnabled"))) throw new ApiKeyAuthenticationError("FEATURE_DISABLED");

  if (mode === "bearer") {
    if (!bearerSecret || !matchesSecret(bearerSecret, row)) throw new ApiKeyAuthenticationError("INVALID_SECRET");
  } else {
    const timestampSeconds = Number(timestampHeader);
    if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > REPLAY_WINDOW_SECONDS) {
      throw new ApiKeyAuthenticationError("STALE_TIMESTAMP");
    }
    if (!matchesSignature(signatureHeader!, timestampHeader!, context.method, context.path, context.rawBody, row)) {
      throw new ApiKeyAuthenticationError("INVALID_SIGNATURE");
    }
  }

  const ip = clientIpFromRequest(request);
  if (!ipAllowed(ip, row.ipAllowlist)) throw new ApiKeyAuthenticationError("IP_NOT_ALLOWED");

  const rateLimit = await checkRateLimit({ key: `apikey:${row.id}`, limit: row.rateLimitPerMinute, windowSeconds: 60 });
  if (!rateLimit.allowed) throw new ApiKeyAuthenticationError("RATE_LIMITED");

  const now = new Date().toISOString();
  execute(`update "ApiKey" set "lastUsedAt" = $1, "lastUsedIp" = $2 where id = $3`, [now, ip, row.id]).catch(() => undefined);

  return { apiKey: toPublicApiKey(row), tenantId: row.tenantId, mode };
}

export function hasApiKeyPermission(permissions: ModulePermissions | undefined, moduleName: string, action: string) {
  const scope = permissions?.[moduleName];
  if (!scope) return false;
  if (scope === "full") return true;
  return scope[action] === true;
}
