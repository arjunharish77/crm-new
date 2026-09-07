import { randomUUID, createHmac } from "crypto";
import { query, queryOne, execute } from "@/lib/db/query";
import { createUserNotification } from "@/lib/server/notifications";
import { WEBHOOK_EVENT_TYPES, type WebhookEventType } from "@/lib/server/webhook-outbox";
import { decryptSecretAtRestOrNull } from "@/lib/server/secret-encryption";

type TenantUser = { id: string; tenantId: string | null };

const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [1, 5, 30, 120, 720]; // 1m, 5m, 30m, 2h, 12h -- identical schedule to webhook-outbox.ts
const REQUEST_TIMEOUT_MS = 15_000;
const STALE_CREDENTIAL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function backoffMs(attempts: number) {
  const minutes = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length - 1)];
  return minutes * 60 * 1000;
}

function signPayload(secret: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

// Same event vocabulary as WEBHOOK_EVENT_TYPES (outbound webhook governance) -- re-exported
// rather than redefined so the marketplace settings UI's event picker and the webhook
// subscription picker never drift apart.
export { WEBHOOK_EVENT_TYPES as APP_EVENT_TYPES };

// A published app's dailyDeliveryLimit is a single value the app OWNER configures (it lives on
// MarketplaceApp, not per installing tenant) -- read as a global ceiling protecting the app's
// own capacity in aggregate, so this sums usage across every installing tenant rather than
// scoping to one. Per-tenant usage visibility is unaffected -- each tenant still gets its own
// real TenantAppUsage row (migration 0066), this is only the throttle check itself.
async function todayUsageCount(appId: string, today: string) {
  const row = await queryOne<{ total: string | null }>(`select sum("webhookDeliveryCount") as total from "TenantAppUsage" where "appId" = $1 and date = $2`, [appId, today]);
  return Number(row?.total ?? 0);
}

// Called from the same 5 call sites enqueueWebhookEvent already is (leads-postgres.ts /
// opportunities-postgres.ts). Fans out to every app with an active event subscription AND a
// live (INSTALLED) install -- a suspended or never-approved app gets nothing, and its
// subscription rows are simply skipped rather than needing separate cleanup. An app past its
// own configured dailyDeliveryLimit still gets a real (CANCELLED) delivery row with a clear
// reason, rather than the event silently vanishing -- that's what makes throttling visible
// instead of just enforced.
//
// Multi-tenant note: the join to TenantAppInstall explicitly matches i.tenantId = s.tenantId,
// not just i.appId = s.appId -- without that, a subscription row for a tenant whose own install
// isn't INSTALLED yet could incorrectly match some OTHER tenant's live install of the same app
// and fire anyway, a real cross-tenant fan-out bug this rework closes.
export async function enqueueAppEvent(tenantId: string | null, eventType: WebhookEventType, payload: Record<string, unknown>) {
  if (!tenantId) return;
  const apps = await query<{ appId: string; dailyDeliveryLimit: number | null }>(
    `select distinct s."appId", a."dailyDeliveryLimit"
     from "TenantAppEventSubscription" s
     join "MarketplaceApp" a on a.id = s."appId" and a."isActive" = true
     join "TenantAppInstall" i on i."appId" = s."appId" and i."tenantId" = s."tenantId" and i.status = 'INSTALLED'
     where s."tenantId" = $1 and s."isActive" = true and s."eventType" = $2 and a."webhookUrl" is not null`,
    [tenantId, eventType],
  );
  if (!apps.length) return;

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const recordId = typeof payload.id === "string" ? payload.id : randomUUID();
  for (const { appId, dailyDeliveryLimit } of apps) {
    const idempotencyKey = `${eventType}:${recordId}`;

    if (dailyDeliveryLimit != null && (await todayUsageCount(appId, today)) >= dailyDeliveryLimit) {
      await execute(
        `insert into "TenantAppDelivery" (id, "tenantId", "appId", "eventType", payload, "idempotencyKey", status, attempts, error, "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, 'CANCELLED', 0, $7, $8, $8)
         on conflict ("tenantId", "appId", "idempotencyKey") do nothing`,
        [randomUUID(), tenantId, appId, eventType, payload, idempotencyKey, `Daily delivery limit of ${dailyDeliveryLimit} reached`, now],
      ).catch(() => undefined);
      continue;
    }

    await execute(
      `insert into "TenantAppDelivery" (id, "tenantId", "appId", "eventType", payload, "idempotencyKey", status, attempts, "nextRetryAt", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, 'PENDING', 0, $7, $7, $7)
       on conflict ("tenantId", "appId", "idempotencyKey") do nothing`,
      [randomUUID(), tenantId, appId, eventType, payload, idempotencyKey, now],
    ).catch(() => undefined);
  }
}

async function upsertAppHealth(tenantId: string, appId: string, status: "OK" | "DEGRADED" | "ERROR", errorMessage: string | null) {
  const now = new Date().toISOString();
  const existing = await queryOne<{ id: string }>(`select id from "TenantAppHealth" where "tenantId" = $1 and "appId" = $2`, [tenantId, appId]);
  if (existing) {
    if (status === "OK") {
      await execute(`update "TenantAppHealth" set status = $1, "lastCheckedAt" = $2, "lastSuccessAt" = $2, "lastError" = null where id = $3`, [status, now, existing.id]);
    } else {
      await execute(`update "TenantAppHealth" set status = $1, "lastCheckedAt" = $2, "lastError" = $3 where id = $4`, [status, now, errorMessage, existing.id]);
    }
  } else {
    await execute(
      `insert into "TenantAppHealth" (id, "tenantId", "appId", status, "lastCheckedAt", "lastSuccessAt", "lastError") values ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), tenantId, appId, status, now, status === "OK" ? now : null, status === "OK" ? null : errorMessage],
    );
  }
}

async function incrementAppUsage(tenantId: string, appId: string, isError: boolean) {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await queryOne<{ id: string }>(`select id from "TenantAppUsage" where "tenantId" = $1 and "appId" = $2 and date = $3`, [tenantId, appId, today]);
  if (existing) {
    await execute(
      `update "TenantAppUsage" set "webhookDeliveryCount" = "webhookDeliveryCount" + 1, "errorCount" = "errorCount" + $1 where id = $2`,
      [isError ? 1 : 0, existing.id],
    );
  } else {
    await execute(
      `insert into "TenantAppUsage" (id, "tenantId", "appId", date, "requestCount", "webhookDeliveryCount", "errorCount") values ($1, $2, $3, $4, 0, 1, $5)`,
      [randomUUID(), tenantId, appId, today, isError ? 1 : 0],
    );
  }
}

async function deliverOne(row: { id: string; tenantId: string; appId: string; eventType: string; payload: any; attempts: number }) {
  const app = await queryOne<{ webhookUrl: string | null; name: string }>(`select "webhookUrl", name from "MarketplaceApp" where id = $1`, [row.appId]);
  // Scoped by tenantId too, not just appId -- an app with multiple installing tenants has one
  // TenantAppSecret row per tenant (migration 0066); fetching by appId alone would pick an
  // arbitrary tenant's signingSecret to sign EVERY delivery, including ones for other tenants.
  const secretRowEncrypted = await queryOne<{ signingSecret: string }>(`select "signingSecret" from "TenantAppSecret" where "tenantId" = $1 and "appId" = $2`, [row.tenantId, row.appId]);
  const secretRow = secretRowEncrypted ? { signingSecret: decryptSecretAtRestOrNull(secretRowEncrypted.signingSecret) } : null;
  if (!app?.webhookUrl) {
    await execute(`update "TenantAppDelivery" set status = 'CANCELLED', "updatedAt" = $1 where id = $2`, [new Date().toISOString(), row.id]);
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  // tenantId is included so an app serving multiple installing tenants at the same webhookUrl
  // (the app's own backend, one URL regardless of install count) can actually tell them apart --
  // without it, two tenants' events arrive at the same endpoint with no way to attribute either.
  const rawBody = JSON.stringify({ eventType: row.eventType, tenantId: row.tenantId, data: row.payload });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  let httpStatus: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;
  try {
    const headers: Record<string, string> = { "content-type": "application/json", "x-app-timestamp": timestamp, "x-app-event": row.eventType };
    if (secretRow?.signingSecret) headers["x-app-signature"] = signPayload(secretRow.signingSecret, timestamp, rawBody);
    const response = await fetch(app.webhookUrl, { method: "POST", headers, body: rawBody, signal: controller.signal });
    httpStatus = response.status;
    responseBody = (await response.text().catch(() => "")).slice(0, 2000);
    if (!response.ok) errorMessage = `HTTP ${response.status}`;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Network error";
  } finally {
    clearTimeout(timeout);
  }
  const latencyMs = Date.now() - startedAt;

  const now = new Date().toISOString();
  await incrementAppUsage(row.tenantId, row.appId, !!errorMessage);

  if (!errorMessage) {
    await execute(
      `update "TenantAppDelivery" set status = 'DELIVERED', "httpStatus" = $1, "responseBody" = $2, "latencyMs" = $3, "processedAt" = $4, "updatedAt" = $4, error = null where id = $5`,
      [httpStatus, responseBody, latencyMs, now, row.id],
    );
    await upsertAppHealth(row.tenantId, row.appId, "OK", null);
    return;
  }

  const nextAttempts = row.attempts + 1;
  if (nextAttempts >= MAX_ATTEMPTS) {
    // Dead-lettered: FAILED is terminal, same convention webhook-outbox.ts already
    // established -- visible in the delivery log, not auto-retried further.
    await execute(
      `update "TenantAppDelivery" set status = 'FAILED', attempts = $1, "httpStatus" = $2, "responseBody" = $3, "latencyMs" = $4, error = $5, "updatedAt" = $6 where id = $7`,
      [nextAttempts, httpStatus, responseBody, latencyMs, errorMessage, now, row.id],
    );
    await upsertAppHealth(row.tenantId, row.appId, "ERROR", errorMessage);
    const owner = await queryOne<{ id: string }>(`select id from "User" where "tenantId" = $1 order by "createdAt" asc limit 1`, [row.tenantId]);
    if (owner) {
      await createUserNotification({
        tenantId: row.tenantId,
        userId: owner.id,
        title: "App delivery failing",
        message: `Deliveries to "${app.name}" have failed ${nextAttempts} times in a row (last: ${errorMessage}). Delivery has stopped retrying.`,
        data: { type: "marketplace.deliveryFailed", appId: row.appId, eventType: row.eventType },
        category: "INTEGRATIONS",
      }).catch(() => undefined);
    }
    return;
  }

  await execute(
    `update "TenantAppDelivery" set status = 'PENDING', attempts = $1, "nextRetryAt" = $2, "httpStatus" = $3, "responseBody" = $4, "latencyMs" = $5, error = $6, "updatedAt" = $7 where id = $8`,
    [nextAttempts, new Date(Date.now() + backoffMs(nextAttempts)).toISOString(), httpStatus, responseBody, latencyMs, errorMessage, now, row.id],
  );
  await upsertAppHealth(row.tenantId, row.appId, "DEGRADED", errorMessage);
}

// Worker-invoked recurring job, identical shape to processWebhookOutbox: claims due rows one
// at a time via an atomic claim so overlapping worker ticks can't double-send the same delivery.
export async function processAppEventDeliveries(limit = 25) {
  const now = new Date().toISOString();
  const due = await query<{ id: string }>(
    `select id from "TenantAppDelivery" where status = 'PENDING' and ("nextRetryAt" is null or "nextRetryAt" <= $1) order by "createdAt" asc limit $2`,
    [now, limit],
  );
  let processed = 0;
  for (const item of due) {
    const claimed = await queryOne<any>(
      `update "TenantAppDelivery" set status = 'SENDING', "updatedAt" = $1 where id = $2 and status = 'PENDING' returning id, "tenantId", "appId", "eventType", payload, attempts`,
      [new Date().toISOString(), item.id],
    );
    if (!claimed) continue;
    await deliverOne(claimed);
    processed += 1;
  }
  return { processed };
}

export async function listAppDeliveriesForTenant(user: TenantUser, appId: string, limit = 50) {
  if (!user.tenantId) return [];
  return query<any>(
    `select id, "eventType", status, attempts, "httpStatus", "responseBody", "latencyMs", error, "createdAt", "processedAt"
     from "TenantAppDelivery"
     where "tenantId" = $1 and "appId" = $2
     order by "createdAt" desc
     limit $3`,
    [user.tenantId, appId, Math.min(200, Math.max(1, limit))],
  );
}

// Gap checklist Module 16's connector health monitoring, "provider outage marker" sub-item,
// built per explicit user decision on the correlation heuristic: apps are grouped by their own
// `webhookUrl` hostname (parsed in JS, not a SQL-level hostname extraction, since there's no
// portable SQL hostname function this codebase already relies on) -- 2 or more DIFFERENT apps
// (cross-tenant; a provider outage doesn't care whose install it is) simultaneously in
// ERROR/DEGRADED status against the SAME hostname is treated as a likely provider-wide outage,
// distinct from a single app's own `ERROR` status (which could just be that one app's own bug).
function extractWebhookHostname(webhookUrl: string | null | undefined): string | null {
  if (!webhookUrl) return null;
  try {
    return new URL(webhookUrl).hostname || null;
  } catch {
    return null;
  }
}

export async function getSuspectedProviderOutages() {
  const rows = await query<{ appId: string; webhookUrl: string | null; status: string }>(
    `select a.id as "appId", a."webhookUrl", h.status
     from "MarketplaceApp" a
     join "TenantAppHealth" h on h."appId" = a.id
     where h.status in ('ERROR', 'DEGRADED')`,
  );
  const appIdsByHostname = new Map<string, Set<string>>();
  for (const row of rows) {
    const hostname = extractWebhookHostname(row.webhookUrl);
    if (!hostname) continue;
    if (!appIdsByHostname.has(hostname)) appIdsByHostname.set(hostname, new Set());
    appIdsByHostname.get(hostname)!.add(row.appId);
  }
  return [...appIdsByHostname.entries()]
    .filter(([, appIds]) => appIds.size >= 2)
    .map(([hostname, appIds]) => ({ hostname, affectedAppCount: appIds.size }));
}

// "Stale credential warning": no OAuth-style expiring credential exists for these apps (the
// secret is a long-lived rotatable value, not a token with its own expiry) -- adapted
// honestly to mean "hasn't been rotated in 90+ days", a real, meaningful signal for a
// long-lived static secret rather than a literal reinterpretation of "expired".
export async function getAppHealthForTenant(user: TenantUser, appId: string) {
  if (!user.tenantId) return null;
  const [health, backlog, secret, app] = await Promise.all([
    queryOne<any>(`select status, "lastCheckedAt", "lastSuccessAt", "lastError" from "TenantAppHealth" where "tenantId" = $1 and "appId" = $2`, [user.tenantId, appId]),
    queryOne<{ count: string }>(`select count(*) as count from "TenantAppDelivery" where "tenantId" = $1 and "appId" = $2 and status = 'PENDING'`, [user.tenantId, appId]),
    queryOne<{ lastRotatedAt: string | null; createdAt: string }>(`select "lastRotatedAt", "createdAt" from "TenantAppSecret" where "tenantId" = $1 and "appId" = $2`, [user.tenantId, appId]),
    queryOne<{ webhookUrl: string | null }>(`select "webhookUrl" from "MarketplaceApp" where id = $1`, [appId]),
  ]);
  const referenceDate = secret?.lastRotatedAt ?? secret?.createdAt ?? null;
  const staleCredential = referenceDate ? Date.now() - new Date(referenceDate).getTime() > STALE_CREDENTIAL_MS : false;

  let possibleProviderOutage = false;
  let affectedAppCount = 0;
  const hostname = extractWebhookHostname(app?.webhookUrl);
  if (hostname && (health?.status === "ERROR" || health?.status === "DEGRADED")) {
    const outages = await getSuspectedProviderOutages();
    const match = outages.find((outage) => outage.hostname === hostname);
    if (match) {
      possibleProviderOutage = true;
      affectedAppCount = match.affectedAppCount;
    }
  }

  return {
    status: health?.status ?? "UNKNOWN",
    lastCheckedAt: health?.lastCheckedAt ?? null,
    lastSuccessAt: health?.lastSuccessAt ?? null,
    lastError: health?.lastError ?? null,
    queueBacklog: Number(backlog?.count ?? 0),
    staleCredential,
    possibleProviderOutage,
    affectedAppCount,
  };
}

export async function getAppUsageForTenant(user: TenantUser, appId: string, days = 14) {
  if (!user.tenantId) return [];
  return query<any>(
    `select date, "requestCount", "webhookDeliveryCount", "errorCount" from "TenantAppUsage" where "tenantId" = $1 and "appId" = $2 order by date desc limit $3`,
    [user.tenantId, appId, Math.min(90, Math.max(1, days))],
  );
}

// "View cross-tenant health without exposing tenant data" -- a platform admin gets aggregate
// counts by status only (how many apps across the whole platform are OK/DEGRADED/ERROR/
// UNKNOWN), never which tenant, which app, or any payload/request/response content. Deliberately
// the coarsest possible view that still answers "is the marketplace healthy platform-wide."
export async function getCrossTenantAppHealthOverview() {
  const rows = await query<{ status: string; count: string }>(`select status, count(*) as count from "TenantAppHealth" group by status`, []);
  const overview: Record<string, number> = { OK: 0, DEGRADED: 0, ERROR: 0, UNKNOWN: 0 };
  for (const row of rows) overview[row.status] = Number(row.count);
  return overview;
}
