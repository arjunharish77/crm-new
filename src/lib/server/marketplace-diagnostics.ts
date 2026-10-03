import { assertTenantModule } from "@/lib/server/module-entitlements";
import { randomUUID } from "crypto";
import { query, queryOne } from "@/lib/db/query";
import { APP_EVENT_TYPES, getAppHealthForTenant, getAppUsageForTenant, listAppDeliveriesForTenant } from "@/lib/server/marketplace-events";
import { APP_SIGNING_COLUMNS, appSignatureHeaders, type AppSigningRow } from "@/lib/server/app-signing";
import { assertSafeOutboundUrl } from "@/lib/server/outbound-request-guard";

type TenantUser = { id: string; tenantId: string | null };

const REQUEST_TIMEOUT_MS = 15_000;

// "Request inspector" + "sample payloads": mirrors sendTestWebhookDelivery's (outbound webhook
// governance) design exactly -- builds a synthetic sample event, signs and sends it for real
// against the app's endpoint (not a simulation), and returns both the exact request that was
// sent and the live response. Deliberately NOT written to TenantAppDelivery, same reasoning as
// the webhook console: test traffic shouldn't pollute real delivery-health stats.
export async function sendTestAppEvent(user: TenantUser, appId: string, eventType?: string) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  await assertTenantModule(user, "MARKETPLACE");
  const app = await queryOne<{ id: string; webhookUrl: string | null; eventSubscriptions: string[] }>(
    `select id, "webhookUrl", "eventSubscriptions" from "MarketplaceApp" where "tenantId" = $1 and id = $2 limit 1`,
    [user.tenantId, appId],
  );
  if (!app) throw new Error("MARKETPLACE_APP_NOT_FOUND");
  if (!app.webhookUrl) throw new Error("APP_HAS_NO_WEBHOOK_URL");
  const signingRow = await queryOne<NonNullable<AppSigningRow>>(`select ${APP_SIGNING_COLUMNS} from "TenantAppSecret" where "tenantId" = $1 and "appId" = $2`, [user.tenantId, appId]);

  const resolvedEventType = (eventType && (APP_EVENT_TYPES as readonly string[]).includes(eventType) ? eventType : app.eventSubscriptions?.[0]) ?? APP_EVENT_TYPES[0];
  const timestamp = Math.floor(Date.now() / 1000).toString();
  // Same shape real deliveries use (deliverOne, marketplace-events.ts) -- tenantId included so
  // a test event exercises exactly what a real one looks like to the app's own backend.
  const rawBody = JSON.stringify({
    eventType: resolvedEventType,
    tenantId: user.tenantId,
    data: { id: "test-record-id", name: "Test Record", message: "This is a test delivery from the CRM marketplace console." },
  });
  const headers: Record<string, string> = { "content-type": "application/json", "x-app-timestamp": timestamp, "x-app-event": resolvedEventType };
  Object.assign(headers, appSignatureHeaders(signingRow, timestamp, rawBody));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // F07 fix (WP06): same read-oracle exposure as sendTestWebhookDelivery -- this echoes the
    // raw response body straight back to the caller.
    await assertSafeOutboundUrl(app.webhookUrl);
    const response = await fetch(app.webhookUrl, { method: "POST", headers, body: rawBody, signal: controller.signal, redirect: "manual" });
    const responseBody = (await response.text().catch(() => "")).slice(0, 2000);
    return { request: { url: app.webhookUrl, headers, body: rawBody }, httpStatus: response.status, responseBody, error: response.ok ? null : `HTTP ${response.status}` };
  } catch (error) {
    return { request: { url: app.webhookUrl, headers, body: rawBody }, httpStatus: null, responseBody: null, error: error instanceof Error ? error.message : "Network error" };
  } finally {
    clearTimeout(timeout);
  }
}

// "Webhook replay": re-queues a fresh delivery with the exact same payload/eventType as a past
// one (any status -- most useful for a FAILED/dead-lettered delivery after the admin fixes
// their endpoint). A new row with a fresh idempotency key, not a resurrection of the old one,
// so it gets its own independent attempt count/history rather than mutating history.
export async function replayAppDelivery(user: TenantUser, deliveryId: string) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  await assertTenantModule(user, "MARKETPLACE");
  const original = await queryOne<{ appId: string; eventType: string; payload: any }>(
    `select "appId", "eventType", payload from "TenantAppDelivery" where "tenantId" = $1 and id = $2 limit 1`,
    [user.tenantId, deliveryId],
  );
  if (!original) throw new Error("APP_DELIVERY_NOT_FOUND");

  const now = new Date().toISOString();
  const idempotencyKey = `replay:${deliveryId}:${randomUUID()}`;
  const replayed = await queryOne<{ id: string }>(
    `insert into "TenantAppDelivery" (id, "tenantId", "appId", "eventType", payload, "idempotencyKey", status, attempts, "nextRetryAt", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, 'PENDING', 0, $7, $7, $7)
     returning id`,
    [randomUUID(), user.tenantId, original.appId, original.eventType, original.payload, idempotencyKey, now],
  );
  if (!replayed) throw new Error("APP_DELIVERY_REPLAY_FAILED");
  return { deliveryId: replayed.id };
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// "Logs export": a plain CSV of this app's delivery history -- deliberately a direct query +
// synchronous string build, not routed through the async export-governance pipeline (exports.ts),
// since a single app's delivery log is small and this needs to feel instant, not queued.
export async function exportAppDeliveryLogsCsv(user: TenantUser, appId: string) {
  await assertTenantModule(user, "MARKETPLACE");
  const deliveries = await listAppDeliveriesForTenant(user, appId, 500);
  const header = ["id", "eventType", "status", "attempts", "httpStatus", "latencyMs", "error", "createdAt", "processedAt"];
  const rows = deliveries.map((d: any) => [d.id, d.eventType, d.status, d.attempts, d.httpStatus ?? "", d.latencyMs ?? "", d.error ?? "", d.createdAt, d.processedAt ?? ""]);
  return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

// "Support bundle generation": a single downloadable JSON snapshot for troubleshooting --
// config (never secrets), install/permission state, health, recent deliveries, and usage.
// Deliberately excludes TenantAppSecret entirely (not even masked fields) since this is meant
// to be shared with whoever is debugging the app, which shouldn't require re-establishing the
// same secret-handling discipline the rest of this module already has.
export async function generateAppSupportBundle(user: TenantUser, appId: string) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  await assertTenantModule(user, "MARKETPLACE");
  const app = await queryOne<any>(
    `select id, name, description, category, "webhookUrl", "redirectUrls", "eventSubscriptions", "requestedPermissions", "dailyDeliveryLimit", "createdAt"
     from "MarketplaceApp" where "tenantId" = $1 and id = $2 limit 1`,
    [user.tenantId, appId],
  );
  if (!app) throw new Error("MARKETPLACE_APP_NOT_FOUND");

  const install = await queryOne<any>(
    `select id, status, "approvedAt", "suspendedAt", "suspendedReason", "pendingPermissions" from "TenantAppInstall" where "tenantId" = $1 and "appId" = $2 limit 1`,
    [user.tenantId, appId],
  );
  const grants = install
    ? await query<any>(`select "moduleKey", scope, "grantedAt" from "TenantAppPermissionGrant" where "installId" = $1`, [install.id])
    : [];
  const [health, usage, deliveries] = await Promise.all([
    getAppHealthForTenant(user, appId),
    getAppUsageForTenant(user, appId, 14),
    listAppDeliveriesForTenant(user, appId, 50),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    app,
    install: install ?? null,
    permissionGrants: grants,
    health,
    usage,
    recentDeliveries: deliveries,
  };
}
