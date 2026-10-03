import { isModuleEnabledForTenant } from "@/lib/server/module-entitlements";
import { randomUUID, timingSafeEqual } from "crypto";
import { query, queryOne, execute, queryOneAsSystem, queryAsSystem } from "@/lib/db/query";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { decryptSecretAtRestOrNull } from "@/lib/server/secret-encryption";
import { runAutomationsForEvent } from "@/lib/repositories/automations-postgres";
import type { RecordAccessLevel } from "@/lib/server/record-scope";
import { enterTenantContext } from "@/lib/db/tenant-context";

type PermissionScope = "read" | "write";

// The real missing half of "scoped app permissions": TenantAppPermissionGrant rows have been
// tracked, diffed on upgrade, and require approval since the security-controls pass -- but
// nothing ever actually checked them, because no inbound endpoint existed for an app to present
// its credential and call back into the CRM. Registered apps could only ever RECEIVE pushed
// webhook events. This is that missing inbound surface: an app presents its own id+secret (the
// exact credential shown once at registration/rotation) and gets exactly the module access an
// admin actually approved, nothing more.
export type MarketplaceAppAuthReason =
  | "MODULE_DISABLED"
  | "MISSING_CREDENTIALS"
  | "APP_NOT_FOUND"
  | "APP_SUSPENDED"
  | "APP_NOT_INSTALLED"
  | "INVALID_SECRET"
  | "RATE_LIMITED";

export class MarketplaceAppAuthenticationError extends Error {
  reason: MarketplaceAppAuthReason;
  constructor(reason: MarketplaceAppAuthReason) {
    super(reason);
    this.reason = reason;
  }
}

function safeEqualUtf8(a: string, b: string) {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

function matchesSecret(candidate: string, row: { secret: string; previousSecret: string | null; previousSecretExpiresAt: string | null }) {
  if (safeEqualUtf8(candidate, row.secret)) return true;
  if (row.previousSecret && row.previousSecretExpiresAt && new Date(row.previousSecretExpiresAt).getTime() > Date.now()) {
    if (safeEqualUtf8(candidate, row.previousSecret)) return true;
  }
  return false;
}

async function incrementRequestCount(tenantId: string, appId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await queryOne<{ id: string }>(`select id from "TenantAppUsage" where "tenantId" = $1 and "appId" = $2 and date = $3`, [tenantId, appId, today]);
  if (existing) {
    await execute(`update "TenantAppUsage" set "requestCount" = "requestCount" + 1 where id = $1`, [existing.id]);
  } else {
    await execute(
      `insert into "TenantAppUsage" (id, "tenantId", "appId", date, "requestCount", "webhookDeliveryCount", "errorCount") values ($1, $2, $3, $4, 1, 0, 0)`,
      [randomUUID(), tenantId, appId, today],
    );
  }
}

// Same `Authorization: Bearer <id>.<secret>` shape as the API-key console (api-keys.ts) --
// deliberately, so a caller doesn't need to learn a second credential format. The two systems
// stay independent (separate tables, separate id namespaces from separate randomUUID() calls,
// so no collision risk) rather than merged into one, since an ApiKey and a MarketplaceApp are
// genuinely different subjects with different lifecycles (a key is created directly by an
// admin; an app goes through registration + a separate install-approval step).
//
// Multi-tenant note: a published app can be installed by many different tenants, each with
// its own TenantAppSecret row (migration 0066 -- unique on tenantId+appId, not appId alone).
// The wire credential is still just <appId>.<secret> (no tenant id in the token), so the
// installing tenant is resolved by finding WHICH tenant's secret the presented value matches,
// not read off the app's own owning tenantId -- reading it off the app row would silently
// authenticate every installing tenant's calls as the app's original owner, a real cross-tenant
// data leak this rework exists specifically to close.
export async function authenticateMarketplaceAppRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new MarketplaceAppAuthenticationError("MISSING_CREDENTIALS");
  const token = authHeader.slice("Bearer ".length).trim();
  const separatorIndex = token.indexOf(".");
  if (separatorIndex === -1) throw new MarketplaceAppAuthenticationError("MISSING_CREDENTIALS");
  const appId = token.slice(0, separatorIndex);
  const secret = token.slice(separatorIndex + 1);

  // WP07 (F04): DELEGATED_API, disposition B -- which tenant installed this app is exactly what
  // the secret-matching step below discovers; genuinely pre-tenant, like a login-by-email
  // lookup. See 25_AUDIT_REMEDIATION_PLAN.md "## WP07 pre-auth/system path inventory".
  const app = await queryOneAsSystem<{ id: string; isActive: boolean; rateLimitPerMinute: number }>(
    `select id, "isActive", "rateLimitPerMinute" from "MarketplaceApp" where id = $1 limit 1`,
    [appId],
  );
  if (!app) throw new MarketplaceAppAuthenticationError("APP_NOT_FOUND");
  // Covers both a tenant's own suspend (TenantAppInstall.status) and a platform admin's
  // stronger force-suspend (MarketplaceApp.isActive) with the same check the event bus's own
  // enqueueAppEvent already relies on for the outbound direction. A single app-level flag, so
  // this correctly blocks every installing tenant at once regardless of the rework above.
  if (!app.isActive) throw new MarketplaceAppAuthenticationError("APP_SUSPENDED");

  const secretRowsEncrypted = await queryAsSystem<{ tenantId: string; secret: string; previousSecret: string | null; previousSecretExpiresAt: string | null }>(
    `select "tenantId", secret, "previousSecret", "previousSecretExpiresAt" from "TenantAppSecret" where "appId" = $1`,
    [appId],
  );
  const secretRows = secretRowsEncrypted.map((row) => ({
    ...row,
    secret: decryptSecretAtRestOrNull(row.secret) ?? "",
    previousSecret: decryptSecretAtRestOrNull(row.previousSecret),
  }));
  const matchedSecretRow = secretRows.find((row) => matchesSecret(secret, row));
  if (!matchedSecretRow) throw new MarketplaceAppAuthenticationError("INVALID_SECRET");
  const tenantId = matchedSecretRow.tenantId;

  // WP07 (F04): DELEGATED_API -- the installing tenant is now known (read off the matched
  // TenantAppSecret row), so ambient tenant context is entered here, before the (tenant-scoped)
  // install lookup right below and everything this authenticated request goes on to do --
  // mirroring what resolveUserFromPayload does for the normal cookie-session path. Strictly
  // more correct than routing this request's later CRUD (listLeadsForTenant et al, shared with
  // the normal session-authenticated path) through the system pool, which would permanently
  // disable RLS's defense-in-depth for every /api/v1/apps/** request instead of just letting it
  // work correctly.
  enterTenantContext({ tenantId, userId: null, roleId: null });

  const install = await queryOne<{ id: string; recordAccess: RecordAccessLevel; ownerUserId: string | null; fieldPermissions: Record<string, unknown> | null }>(
    `select id, "recordAccess", "ownerUserId", "fieldPermissions" from "TenantAppInstall" where "tenantId" = $1 and "appId" = $2 and status = 'INSTALLED' limit 1`,
    [tenantId, appId],
  );
  if (!install) throw new MarketplaceAppAuthenticationError("APP_NOT_INSTALLED");
  // Installed-app credentials must stop working the moment a platform admin turns the tenant's
  // Marketplace module off -- otherwise an app keeps reading/writing the tenant's leads and
  // opportunities through /api/v1/apps/** after it was supposedly disabled.
  if (!(await isModuleEnabledForTenant(tenantId, "MARKETPLACE"))) throw new MarketplaceAppAuthenticationError("MODULE_DISABLED");

  // Per-installing-tenant budget against the app's own configured rate limit -- keying only by
  // appId would let one noisy tenant exhaust the shared bucket for every other tenant that
  // installed the same app. checkRateLimit fails open if Redis is unreachable, so an outage
  // degrades to "unlimited," never to "every app locked out."
  const rateLimit = await checkRateLimit({ key: `marketplace-app:${appId}:${tenantId}`, limit: app.rateLimitPerMinute, windowSeconds: 60 });
  if (!rateLimit.allowed) throw new MarketplaceAppAuthenticationError("RATE_LIMITED");

  const grants = await query<{ moduleKey: string; scope: PermissionScope }>(`select "moduleKey", scope from "TenantAppPermissionGrant" where "installId" = $1`, [install.id]);
  const permissions = Object.fromEntries(grants.map((g) => [g.moduleKey, g.scope])) as Record<string, PermissionScope>;

  incrementRequestCount(tenantId, appId).catch(() => undefined);

  return {
    appId,
    tenantId,
    installId: install.id,
    permissions,
    recordAccess: install.recordAccess,
    ownerUserId: install.ownerUserId,
    fieldPermissions: install.fieldPermissions,
  };
}

export function hasAppPermission(permissions: Record<string, PermissionScope>, moduleKey: string, action: "read" | "write") {
  const scope = permissions[moduleKey];
  if (!scope) return false;
  return action === "read" ? scope === "read" || scope === "write" : scope === "write";
}

// WP04 fix: builds the "user" object every /api/v1/apps/* route passes into the shared
// leads-postgres.ts/opportunities-postgres.ts repository functions. `id`/`tenantId` are unchanged
// (an app's own identity, used for audit/createdBy attribution exactly as before) -- the only new
// behavior is that when a tenant admin has configured this install with OWN/TEAM record-scope
// and/or field-permission masking, those now actually apply, via the exact same
// recordAccessLevel/fieldPermissionMap functions an internal user's role goes through. Default
// (recordAccess "ALL", no fieldPermissions) reproduces today's unrestricted behavior exactly, so
// an install nobody has explicitly configured is completely unaffected by this fix.
// `fieldPermissions` (the install's own column) is expected in the same shape as
// Role.permissions.fieldPermissions -- keyed by the plural module name ("leads"/"opportunities"),
// e.g. `{ "leads": { "email": "hidden" } }` -- so it flows straight through field-permissions.ts's
// existing "legacy" (role-level, not permission-template-level) lookup path unchanged.
export async function buildAppScopedActor(auth: {
  appId: string;
  tenantId: string;
  recordAccess: RecordAccessLevel;
  ownerUserId: string | null;
  fieldPermissions: Record<string, unknown> | null;
}) {
  let ownerTeamId: string | null = null;
  if (auth.recordAccess === "TEAM" && auth.ownerUserId) {
    const owner = await queryOne<{ teamId: string | null }>(`select "teamId" from "User" where id = $1 and "tenantId" = $2`, [auth.ownerUserId, auth.tenantId]);
    ownerTeamId = owner?.teamId ?? null;
  }
  return {
    id: auth.appId,
    tenantId: auth.tenantId,
    teamId: ownerTeamId,
    recordScopeActorId: auth.recordAccess === "ALL" ? undefined : auth.ownerUserId,
    role: {
      permissions: {
        recordAccess: auth.recordAccess,
        fieldPermissions: auth.fieldPermissions ?? undefined,
      },
    },
  };
}

// Gap checklist Module 16's app event bus, "triggers" half (an external app originating a CRM
// automation trigger, not just receiving webhook pushes) -- built per explicit user decision.
// Gated by the exact same "automations" write grant call_app_action's OUTBOUND direction already
// requires (marketplace-postgres.ts's invokeAppAction) -- this is that check's mirror image, so
// an install that can't have the CRM call ITS actions can't make the CRM run ITS automations
// either. Fires through the same runAutomationsForEvent every other domain (leads, tasks, cases,
// communications) already funnels through -- no parallel matching engine. A tenant's automation
// opts in by setting trigger.type = "APP_EVENT" and, to scope it to one specific app/event pair,
// trigger.appId/trigger.eventName (see triggerMatches' APP_EVENT branch) -- otherwise it fires for
// every app-originated event, same "catch-all" precedent as CALL_MISSED etc using the lead scope.
export async function fireAppAutomationTrigger(
  auth: { appId: string; tenantId: string; permissions: Record<string, PermissionScope> },
  eventName: string,
  payload: Record<string, unknown>,
) {
  if (!hasAppPermission(auth.permissions, "automations", "write")) {
    throw new Error("AUTOMATIONS_WRITE_PERMISSION_REQUIRED");
  }
  const trimmedEventName = eventName?.trim();
  if (!trimmedEventName) throw new Error("EVENT_NAME_REQUIRED");

  return runAutomationsForEvent(
    { id: auth.appId, tenantId: auth.tenantId },
    "APP_EVENT",
    "APP_EVENT",
    randomUUID(),
    { appId: auth.appId, eventName: trimmedEventName, payload: payload ?? {} },
  );
}
