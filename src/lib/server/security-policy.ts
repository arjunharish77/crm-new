import { randomUUID } from "crypto";
import { query, queryOne, execute, jsonbParam, queryAsSystem, queryOneAsSystem } from "@/lib/db/query";

// "SecurityPolicy" is a pre-existing table (db-bootstrap/base-schema.sql) that had zero
// backing code anywhere in this app before this pass -- see migration 0076's comment for the
// full audit. This is the first real code to read/write it.
export type SecurityPolicy = {
  id: string;
  tenantId: string | null;
  minPasswordLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  passwordExpiryDays: number;
  preventPasswordReuse: number;
  sessionTimeoutMinutes: number;
  maxConcurrentSessions: number;
  enforceSessionTimeout: boolean;
  maxLoginAttempts: number;
  lockoutDurationMinutes: number;
  enableTwoFactor: boolean;
  allowedIpRanges: unknown;
  blockedIpRanges: unknown;
  enforceIpRestrictions: boolean;
  enforceAuditLogging: boolean;
  logFailedLoginAttempts: boolean;
  requireLoginNotifications: boolean;
  mfaEnforcementMode: "DISABLED" | "OPTIONAL" | "REQUIRED_NEW_USERS" | "REQUIRED_ALL";
  mfaEnforcedSince: string | null;
  mfaGracePeriodDays: number;
  privilegedActionApprovalRequired: boolean;
  // Reassignment governance (distribution engine) -- a dedicated toggle/limit pair, deliberately
  // separate from privilegedActionApprovalRequired above (see migration 0082's comment for why
  // reassignment approval doesn't reuse that existing flag).
  reassignmentApprovalRequired: boolean;
  reassignmentLimitCount: number | null;
  reassignmentLimitWindowDays: number | null;
  createdAt: string;
  updatedAt: string;
};

const COLUMNS =
  'id, "tenantId", "minPasswordLength", "requireUppercase", "requireLowercase", "requireNumbers", "requireSpecialChars", ' +
  '"passwordExpiryDays", "preventPasswordReuse", "sessionTimeoutMinutes", "maxConcurrentSessions", "enforceSessionTimeout", ' +
  '"maxLoginAttempts", "lockoutDurationMinutes", "enableTwoFactor", "allowedIpRanges", "blockedIpRanges", "enforceIpRestrictions", ' +
  '"enforceAuditLogging", "logFailedLoginAttempts", "requireLoginNotifications", "mfaEnforcementMode", "mfaEnforcedSince", ' +
  '"mfaGracePeriodDays", "privilegedActionApprovalRequired", "reassignmentApprovalRequired", "reassignmentLimitCount", ' +
  '"reassignmentLimitWindowDays", "createdAt", "updatedAt"';

// Matches the table's own column DEFAULTs exactly, so a tenant with neither a tenant-specific
// nor a global policy row still gets the same effective values the schema itself always
// intended as sane defaults.
export const DEFAULT_SECURITY_POLICY: Omit<SecurityPolicy, "id" | "tenantId" | "createdAt" | "updatedAt"> = {
  minPasswordLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false,
  passwordExpiryDays: 90,
  preventPasswordReuse: 5,
  sessionTimeoutMinutes: 60,
  maxConcurrentSessions: 3,
  enforceSessionTimeout: true,
  maxLoginAttempts: 5,
  lockoutDurationMinutes: 30,
  enableTwoFactor: false,
  allowedIpRanges: null,
  blockedIpRanges: null,
  enforceIpRestrictions: false,
  enforceAuditLogging: true,
  logFailedLoginAttempts: true,
  requireLoginNotifications: false,
  mfaEnforcementMode: "OPTIONAL",
  mfaEnforcedSince: null,
  mfaGracePeriodDays: 14,
  privilegedActionApprovalRequired: false,
  reassignmentApprovalRequired: false,
  reassignmentLimitCount: null,
  reassignmentLimitWindowDays: null,
};

// Platform-admin management surface: every tenant-specific policy plus the global default row
// (tenantId is null), so an admin can see and edit both from one screen -- matching the
// existing (previously dead) admin/security page's own expectation of a flat list.
// WP07 (F04): CROSS_TENANT_ADMIN, disposition B -- genuinely reads every tenant's policy (plus
// the global default row) at once; platform-admin only, no per-tenant equivalent caller.
export async function listSecurityPolicies() {
  const qualifiedColumns = COLUMNS.split(", ").map((column) => (column.startsWith('"') ? `sp.${column}` : `sp.${column}`)).join(", ");
  const rows = await queryAsSystem<SecurityPolicy & { tenantName: string | null }>(
    `select ${qualifiedColumns}, t.name as "tenantName" from "SecurityPolicy" sp left join "Tenant" t on t.id = sp."tenantId" order by sp."tenantId" nulls first`,
    [],
  );
  if (rows.length) return rows;
  // No rows at all yet (fresh install) -- seed the global default so the admin page always
  // has at least one editable row instead of an empty screen with no way to create one.
  const now = new Date().toISOString();
  const seeded = await queryOneAsSystem<SecurityPolicy>(
    `insert into "SecurityPolicy" (id, "tenantId", "createdAt", "updatedAt") values ($1, null, $2, $2) returning ${COLUMNS}`,
    [randomUUID(), now],
  );
  return seeded ? [{ ...seeded, tenantName: null }] : [];
}

// tenantId = "global" (a real string, not the literal null) is what the pre-existing frontend
// page already sends for the default policy's row -- see savePolicy's `tenantId || "global"`.
export async function getOrCreateSecurityPolicy(tenantIdOrGlobal: string) {
  const tenantId = tenantIdOrGlobal === "global" ? null : tenantIdOrGlobal;
  const existing = await queryOne<SecurityPolicy>(
    `select ${COLUMNS} from "SecurityPolicy" where ${tenantId ? '"tenantId" = $1' : '"tenantId" is null'} limit 1`,
    tenantId ? [tenantId] : [],
  );
  if (existing) return existing;
  const now = new Date().toISOString();
  const created = await queryOne<SecurityPolicy>(
    `insert into "SecurityPolicy" (id, "tenantId", "createdAt", "updatedAt") values ($1, $2, $3, $3) returning ${COLUMNS}`,
    [randomUUID(), tenantId, now],
  );
  if (!created) throw new Error("SECURITY_POLICY_CREATE_FAILED");
  return created;
}

const EDITABLE_FIELDS = [
  "minPasswordLength", "requireUppercase", "requireLowercase", "requireNumbers", "requireSpecialChars",
  "passwordExpiryDays", "preventPasswordReuse", "sessionTimeoutMinutes", "maxConcurrentSessions",
  "enforceSessionTimeout", "maxLoginAttempts", "lockoutDurationMinutes", "enableTwoFactor",
  "allowedIpRanges", "blockedIpRanges", "enforceIpRestrictions", "enforceAuditLogging",
  "logFailedLoginAttempts", "requireLoginNotifications", "mfaEnforcementMode", "mfaGracePeriodDays",
  "privilegedActionApprovalRequired", "reassignmentApprovalRequired", "reassignmentLimitCount", "reassignmentLimitWindowDays",
] as const;

const REQUIRED_MFA_MODES = new Set(["REQUIRED_NEW_USERS", "REQUIRED_ALL"]);

export async function updateSecurityPolicy(tenantIdOrGlobal: string, patch: Record<string, unknown>) {
  const current = await getOrCreateSecurityPolicy(tenantIdOrGlobal);
  const tenantId = tenantIdOrGlobal === "global" ? null : tenantIdOrGlobal;
  const columns: string[] = EDITABLE_FIELDS.filter((key) => key in patch);
  if (columns.length === 0) return current;

  const patchValues: Record<string, unknown> = { ...patch };
  // "Enforcement rollout mode" -- mfaEnforcedSince is the anchor REQUIRED_NEW_USERS compares a
  // user's own createdAt against, and the anchor the grace-period deadline is computed from for
  // REQUIRED_ALL. Auto-stamped the moment the policy transitions INTO a required mode from a
  // non-required one, not directly editable -- an admin flipping the mode is what should start
  // the clock, not a value they'd otherwise have to remember to set themselves.
  if (columns.includes("mfaEnforcementMode") && REQUIRED_MFA_MODES.has(String(patch.mfaEnforcementMode)) && !REQUIRED_MFA_MODES.has(current.mfaEnforcementMode)) {
    columns.push("mfaEnforcedSince");
    patchValues.mfaEnforcedSince = new Date().toISOString();
  }

  // "allowedIpRanges"/"blockedIpRanges" are jsonb columns storing an array -- a raw array
  // parameter would be misserialized by node-postgres (see jsonbParam's own doc comment in
  // db/query.ts). No caller sends these today (latent-only), but a dynamic column-driven patch
  // like this one is exactly the shape that's easy to miss when a caller eventually does.
  const JSONB_ARRAY_FIELDS = new Set(["allowedIpRanges", "blockedIpRanges"]);
  const values: unknown[] = columns.map((key) => (JSONB_ARRAY_FIELDS.has(key) ? jsonbParam(patchValues[key]) : patchValues[key]));
  const assignments = columns.map((key, index) => `"${key}" = $${index + 1}`);
  values.push(new Date().toISOString());
  assignments.push(`"updatedAt" = $${values.length}`);
  values.push(tenantId);

  const updated = await queryOne<SecurityPolicy>(
    `update "SecurityPolicy" set ${assignments.join(", ")} where ${tenantId ? `"tenantId" = $${values.length}` : `"tenantId" is null`} returning ${COLUMNS}`,
    values,
  );
  if (!updated) throw new Error("SECURITY_POLICY_UPDATE_FAILED");
  return updated;
}

// The actual per-request resolver: a tenant-specific policy row wins if one exists, otherwise
// fall back to the global row, otherwise the hardcoded schema-matching defaults above -- so
// login/session enforcement always has a real value to check against even before any admin
// ever visits the settings page.
export async function getEffectiveSecurityPolicy(tenantId: string | null): Promise<typeof DEFAULT_SECURITY_POLICY> {
  const rows = await query<SecurityPolicy>(
    `select ${COLUMNS} from "SecurityPolicy" where ${tenantId ? '"tenantId" = $1 or "tenantId" is null' : '"tenantId" is null'} order by "tenantId" nulls last limit ${tenantId ? 2 : 1}`,
    tenantId ? [tenantId] : [],
  );
  const specific = tenantId ? rows.find((row) => row.tenantId === tenantId) : null;
  const fallback = rows.find((row) => row.tenantId === null);
  const resolved = specific ?? fallback;
  if (!resolved) return DEFAULT_SECURITY_POLICY;
  return resolved;
}
