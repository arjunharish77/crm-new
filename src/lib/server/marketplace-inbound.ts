import { randomUUID, timingSafeEqual } from "crypto";
import { query, queryOne, execute } from "@/lib/db/query";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { decryptSecretAtRestOrNull } from "@/lib/server/secret-encryption";
import { runAutomationsForEvent } from "@/lib/repositories/automations-postgres";

type PermissionScope = "read" | "write";

// The real missing half of "scoped app permissions": TenantAppPermissionGrant rows have been
// tracked, diffed on upgrade, and require approval since the security-controls pass -- but
// nothing ever actually checked them, because no inbound endpoint existed for an app to present
// its credential and call back into the CRM. Registered apps could only ever RECEIVE pushed
// webhook events. This is that missing inbound surface: an app presents its own id+secret (the
// exact credential shown once at registration/rotation) and gets exactly the module access an
// admin actually approved, nothing more.
export type MarketplaceAppAuthReason =
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

  const app = await queryOne<{ id: string; isActive: boolean; rateLimitPerMinute: number }>(
    `select id, "isActive", "rateLimitPerMinute" from "MarketplaceApp" where id = $1 limit 1`,
    [appId],
  );
  if (!app) throw new MarketplaceAppAuthenticationError("APP_NOT_FOUND");
  // Covers both a tenant's own suspend (TenantAppInstall.status) and a platform admin's
  // stronger force-suspend (MarketplaceApp.isActive) with the same check the event bus's own
  // enqueueAppEvent already relies on for the outbound direction. A single app-level flag, so
  // this correctly blocks every installing tenant at once regardless of the rework above.
  if (!app.isActive) throw new MarketplaceAppAuthenticationError("APP_SUSPENDED");

  const secretRowsEncrypted = await query<{ tenantId: string; secret: string; previousSecret: string | null; previousSecretExpiresAt: string | null }>(
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

  const install = await queryOne<{ id: string }>(`select id from "TenantAppInstall" where "tenantId" = $1 and "appId" = $2 and status = 'INSTALLED' limit 1`, [tenantId, appId]);
  if (!install) throw new MarketplaceAppAuthenticationError("APP_NOT_INSTALLED");

  // Per-installing-tenant budget against the app's own configured rate limit -- keying only by
  // appId would let one noisy tenant exhaust the shared bucket for every other tenant that
  // installed the same app. checkRateLimit fails open if Redis is unreachable, so an outage
  // degrades to "unlimited," never to "every app locked out."
  const rateLimit = await checkRateLimit({ key: `marketplace-app:${appId}:${tenantId}`, limit: app.rateLimitPerMinute, windowSeconds: 60 });
  if (!rateLimit.allowed) throw new MarketplaceAppAuthenticationError("RATE_LIMITED");

  const grants = await query<{ moduleKey: string; scope: PermissionScope }>(`select "moduleKey", scope from "TenantAppPermissionGrant" where "installId" = $1`, [install.id]);
  const permissions = Object.fromEntries(grants.map((g) => [g.moduleKey, g.scope])) as Record<string, PermissionScope>;

  incrementRequestCount(tenantId, appId).catch(() => undefined);

  return { appId, tenantId, installId: install.id, permissions };
}

export function hasAppPermission(permissions: Record<string, PermissionScope>, moduleKey: string, action: "read" | "write") {
  const scope = permissions[moduleKey];
  if (!scope) return false;
  return action === "read" ? scope === "read" || scope === "write" : scope === "write";
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
