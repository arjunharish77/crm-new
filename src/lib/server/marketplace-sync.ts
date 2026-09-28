import { randomUUID, createHmac } from "crypto";
import { query, queryOne, execute, queryAsSystem } from "@/lib/db/query";
import { assertModuleEnabled } from "@/lib/server/module-entitlements";
import { getLeadForTenant, getOpportunityForTenant, updateLeadForTenant, updateOpportunityForTenant, listLeadsForTenant, listOpportunitiesForTenant } from "@/lib/server/crm";
import { createUserNotification } from "@/lib/server/notifications";
import { decryptSecretAtRestOrNull } from "@/lib/server/secret-encryption";
import { assertSafeOutboundUrl } from "@/lib/server/outbound-request-guard";

type TenantUser = { id: string; tenantId: string | null };
type SyncModule = "leads" | "opportunities";

const REQUEST_TIMEOUT_MS = 15_000;

// Real, tenant-visible field lists per module -- mapping validation rejects anything outside
// this set rather than silently accepting a typo'd field name that would never actually sync.
// Matches the exact columns leads-postgres.ts/opportunities-postgres.ts already select.
const MAPPABLE_FIELDS: Record<SyncModule, string[]> = {
  leads: ["name", "email", "phone", "company", "source", "status", "score", "tags", "ownerId"],
  opportunities: ["leadId", "opportunityTypeId", "stageId", "title", "amount", "expectedCloseDate", "priority", "tags", "ownerId"],
};

async function assertMarketplaceEnabled(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "MARKETPLACE", {});
}

function signPayload(secret: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

async function requireOwnInstall(user: TenantUser, installId: string) {
  const install = await queryOne<{ id: string; appId: string }>(`select id, "appId" from "TenantAppInstall" where "tenantId" = $1 and id = $2 limit 1`, [user.tenantId, installId]);
  if (!install) throw new Error("APP_INSTALL_NOT_FOUND");
  return install;
}

export async function getOrCreateSyncConfig(user: TenantUser, installId: string) {
  await assertMarketplaceEnabled(user);
  await requireOwnInstall(user, installId);
  const existing = await queryOne<any>(`select * from "TenantAppSyncConfig" where "installId" = $1`, [installId]);
  if (existing) return existing;
  const now = new Date().toISOString();
  const created = await queryOne<any>(
    `insert into "TenantAppSyncConfig" (id, "tenantId", "installId", "createdAt", "updatedAt") values ($1, $2, $3, $4, $4) returning *`,
    [randomUUID(), user.tenantId, installId, now],
  );
  if (!created) throw new Error("SYNC_CONFIG_CREATE_FAILED");
  return created;
}

const PATCHABLE_FIELDS = ["syncDirection", "syncCadenceMinutes", "enabledModules", "defaultOwnerId", "conflictResolution", "notifyOnFailure"] as const;

export async function updateSyncConfig(user: TenantUser, installId: string, patch: Partial<Record<(typeof PATCHABLE_FIELDS)[number], unknown>>) {
  await getOrCreateSyncConfig(user, installId); // ensure a row exists
  if (patch.syncDirection !== undefined && !["CRM_TO_APP", "APP_TO_CRM", "BIDIRECTIONAL"].includes(String(patch.syncDirection))) {
    throw new Error("INVALID_SYNC_DIRECTION");
  }
  if (patch.conflictResolution !== undefined && !["CRM_WINS", "APP_WINS", "NEWEST_WINS"].includes(String(patch.conflictResolution))) {
    throw new Error("INVALID_CONFLICT_RESOLUTION");
  }
  if (patch.enabledModules !== undefined && !(patch.enabledModules as string[]).every((m) => m === "leads" || m === "opportunities")) {
    throw new Error("INVALID_ENABLED_MODULE");
  }

  const columns: string[] = [];
  const values: unknown[] = [];
  let index = 1;
  for (const field of PATCHABLE_FIELDS) {
    if (patch[field] === undefined) continue;
    columns.push(`"${field}" = $${index}`);
    values.push(patch[field]);
    index += 1;
  }
  if (!columns.length) return getOrCreateSyncConfig(user, installId);
  columns.push(`"updatedAt" = $${index}`);
  values.push(new Date().toISOString());
  index += 1;
  const updated = await queryOne<any>(
    `update "TenantAppSyncConfig" set ${columns.join(", ")} where "installId" = $${index} returning *`,
    [...values, installId],
  );
  if (!updated) throw new Error("SYNC_CONFIG_NOT_FOUND");
  return updated;
}

export async function listFieldMappingsForInstall(user: TenantUser, installId: string) {
  await assertMarketplaceEnabled(user);
  await requireOwnInstall(user, installId);
  return query<any>(`select id, module, "crmField", "appField" from "TenantAppFieldMapping" where "installId" = $1 order by module, "crmField"`, [installId]);
}

// "Mapping validation": every crmField must be a real, mappable column for its module --
// rejected at save time with a clear error rather than silently accepted and discovered broken
// only once a sync actually runs (or, worse, an app PATCH silently no-ops on a typo'd field).
export async function setFieldMappings(user: TenantUser, installId: string, moduleKey: SyncModule, mappings: Array<{ crmField: string; appField: string }>) {
  await assertMarketplaceEnabled(user);
  await requireOwnInstall(user, installId);
  const validFields = MAPPABLE_FIELDS[moduleKey];
  if (!validFields) throw new Error("INVALID_MODULE");
  for (const mapping of mappings) {
    if (!validFields.includes(mapping.crmField)) throw new Error(`INVALID_CRM_FIELD:${mapping.crmField}`);
    if (!mapping.appField?.trim()) throw new Error("APP_FIELD_REQUIRED");
  }

  await execute(`delete from "TenantAppFieldMapping" where "installId" = $1 and module = $2`, [installId, moduleKey]);
  const now = new Date().toISOString();
  for (const mapping of mappings) {
    await execute(
      `insert into "TenantAppFieldMapping" (id, "tenantId", "installId", module, "crmField", "appField", "createdAt") values ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), user.tenantId, installId, moduleKey, mapping.crmField, mapping.appField.trim(), now],
    );
  }
  return listFieldMappingsForInstall(user, installId);
}

// Pure, DB-free transform -- directly unit-testable, and reused by both the CRM_TO_APP
// reconciliation push and the inbound PATCH endpoint's APP_TO_CRM translation.
export function applyFieldMapping(record: Record<string, unknown>, mappings: Array<{ crmField: string; appField: string }>, direction: "toApp" | "toCrm") {
  if (!mappings.length) return { ...record };
  const result: Record<string, unknown> = {};
  const mapped = new Set<string>();
  for (const { crmField, appField } of mappings) {
    const sourceKey = direction === "toApp" ? crmField : appField;
    const targetKey = direction === "toApp" ? appField : crmField;
    if (sourceKey in record) {
      result[targetKey] = record[sourceKey];
      mapped.add(sourceKey);
    }
  }
  for (const [key, value] of Object.entries(record)) {
    if (!mapped.has(key) && !(key in result)) result[key] = value;
  }
  return result;
}

async function fetchModuleRecordsForSync(user: TenantUser, moduleKey: SyncModule, since: string | null) {
  const result = moduleKey === "leads" ? await listLeadsForTenant(user, 1, 200) : await listOpportunitiesForTenant(user, 200);
  const rows: any[] = Array.isArray(result) ? result : ((result as any)?.data ?? []);
  if (!since) return rows;
  return rows.filter((row) => new Date(row.updatedAt).getTime() > new Date(since).getTime());
}

async function sendSyncBatch(webhookUrl: string, signingSecret: string | null, moduleKey: SyncModule, records: unknown[]) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const rawBody = JSON.stringify({ type: "sync", module: moduleKey, records });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // F07 fix (WP06): this sends real tenant record data (leads/opportunities) to an app-
    // supplied URL -- an SSRF here doesn't just probe internal services, it exfiltrates tenant
    // data to wherever the destination actually resolves.
    await assertSafeOutboundUrl(webhookUrl);
    const headers: Record<string, string> = { "content-type": "application/json", "x-app-timestamp": timestamp, "x-app-event": "sync" };
    if (signingSecret) headers["x-app-signature"] = signPayload(signingSecret, timestamp, rawBody);
    const response = await fetch(webhookUrl, { method: "POST", headers, body: rawBody, signal: controller.signal, redirect: "manual" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function incrementSyncCount(tenantId: string, appId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await queryOne<{ id: string }>(`select id from "TenantAppUsage" where "tenantId" = $1 and "appId" = $2 and date = $3`, [tenantId, appId, today]);
  if (existing) {
    await execute(`update "TenantAppUsage" set "syncCount" = "syncCount" + 1 where id = $1`, [existing.id]);
  } else {
    await execute(
      `insert into "TenantAppUsage" (id, "tenantId", "appId", date, "requestCount", "webhookDeliveryCount", "errorCount", "syncCount") values ($1, $2, $3, $4, 0, 0, 0, 1)`,
      [randomUUID(), tenantId, appId, today],
    );
  }
}

// The actual CRM_TO_APP scheduled reconciliation: unlike the real-time event bus (fires once,
// on the exact moment a record changes), this is a periodic full pass over records updated
// since the last successful sync -- catches anything the event bus missed (a delivery that
// exhausted retries, a record touched before the app was even installed) rather than only
// reacting going forward.
export async function runSyncForInstall(installId: string) {
  const config = await queryOne<any>(`select * from "TenantAppSyncConfig" where "installId" = $1`, [installId]);
  if (!config || config.syncDirection === "APP_TO_CRM") return { skipped: true };

  const install = await queryOne<{ tenantId: string; appId: string }>(`select "tenantId", "appId" from "TenantAppInstall" where id = $1 and status = 'INSTALLED'`, [installId]);
  if (!install) return { skipped: true };
  const app = await queryOne<{ webhookUrl: string | null; name: string }>(`select "webhookUrl", name from "MarketplaceApp" where id = $1 and "isActive" = true`, [install.appId]);
  const secretRowEncrypted = await queryOne<{ signingSecret: string }>(`select "signingSecret" from "TenantAppSecret" where "tenantId" = $1 and "appId" = $2`, [install.tenantId, install.appId]);
  const secretRow = secretRowEncrypted ? { signingSecret: decryptSecretAtRestOrNull(secretRowEncrypted.signingSecret) } : null;
  const user = { id: install.appId, tenantId: install.tenantId };
  const now = new Date().toISOString();

  if (!app?.webhookUrl) {
    await execute(`update "TenantAppSyncConfig" set "lastSyncedAt" = $1, "lastSyncStatus" = 'FAILED', "lastSyncError" = $2 where "installId" = $3`, [now, "App has no webhookUrl configured", installId]);
    return { skipped: true };
  }

  let totalSynced = 0;
  let errorMessage: string | null = null;
  try {
    for (const moduleKey of (config.enabledModules as SyncModule[]) ?? []) {
      const mappings = await query<{ crmField: string; appField: string }>(`select "crmField", "appField" from "TenantAppFieldMapping" where "installId" = $1 and module = $2`, [installId, moduleKey]);
      const records = await fetchModuleRecordsForSync(user, moduleKey, config.lastSyncedAt);
      if (!records.length) continue;
      const mapped = records.map((record) => applyFieldMapping(record, mappings, "toApp"));
      await sendSyncBatch(app.webhookUrl, secretRow?.signingSecret ?? null, moduleKey, mapped);
      totalSynced += records.length;
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Sync failed";
  }

  await execute(
    `update "TenantAppSyncConfig" set "lastSyncedAt" = $1, "lastSyncStatus" = $2, "lastSyncError" = $3 where "installId" = $4`,
    [now, errorMessage ? "FAILED" : "OK", errorMessage, installId],
  );
  await execute(
    `insert into "TenantAppSyncRun" (id, "tenantId", "installId", status, "recordsSynced", "errorMessage", "createdAt") values ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), install.tenantId, installId, errorMessage ? "FAILED" : "SUCCESS", totalSynced, errorMessage, now],
  );
  if (!errorMessage) await incrementSyncCount(install.tenantId, install.appId);

  if (errorMessage && config.notifyOnFailure) {
    const owner = await queryOne<{ id: string }>(`select id from "User" where "tenantId" = $1 order by "createdAt" asc limit 1`, [install.tenantId]);
    if (owner) {
      await createUserNotification({
        tenantId: install.tenantId,
        userId: owner.id,
        title: "App sync failed",
        message: `Scheduled sync for "${app.name}" failed: ${errorMessage}`,
        data: { type: "marketplace.syncFailed", appId: install.appId, installId },
        category: "INTEGRATIONS",
      }).catch(() => undefined);
    }
  }

  return { recordsSynced: totalSynced, status: errorMessage ? "FAILED" : "SUCCESS", errorMessage };
}

// Worker-invoked recurring job: finds every sync config whose cadence has elapsed and runs it.
// A config with syncCadenceMinutes null is manual-only (triggered via sync-now), never picked
// up here.
// WP07 (F04): BACKGROUND_JOB, disposition B -- worker-invoked recurring job, discovers due
// sync configs across every tenant at once.
export async function processDueAppSyncs(limit = 25) {
  const due = await queryAsSystem<{ installId: string }>(
    `select "installId" from "TenantAppSyncConfig"
     where "syncCadenceMinutes" is not null
       and ("lastSyncedAt" is null or "lastSyncedAt" < now() - ("syncCadenceMinutes" || ' minutes')::interval)
     limit $1`,
    [limit],
  );
  let processed = 0;
  for (const row of due) {
    await runSyncForInstall(row.installId);
    processed += 1;
  }
  return { processed };
}

export async function listSyncRunsForInstall(user: TenantUser, installId: string, limit = 50) {
  await assertMarketplaceEnabled(user);
  await requireOwnInstall(user, installId);
  return query<any>(
    `select id, status, "recordsSynced", "errorMessage", "createdAt" from "TenantAppSyncRun" where "installId" = $1 order by "createdAt" desc limit $2`,
    [installId, Math.min(200, Math.max(1, limit))],
  );
}

export async function triggerSyncNow(user: TenantUser, installId: string) {
  await assertMarketplaceEnabled(user);
  await requireOwnInstall(user, installId);
  return runSyncForInstall(installId);
}

// "Sync dry run": computes exactly what a real sync would send -- record counts per module and
// a sample mapped payload -- without ever calling the app's webhookUrl or writing a run row.
export async function dryRunSync(user: TenantUser, installId: string) {
  await assertMarketplaceEnabled(user);
  await requireOwnInstall(user, installId);
  const config = await queryOne<any>(`select * from "TenantAppSyncConfig" where "installId" = $1`, [installId]);
  if (!config) throw new Error("SYNC_CONFIG_NOT_FOUND");

  const preview: Record<string, { count: number; sample: unknown }> = {};
  for (const moduleKey of (config.enabledModules as SyncModule[]) ?? []) {
    const mappings = await query<{ crmField: string; appField: string }>(`select "crmField", "appField" from "TenantAppFieldMapping" where "installId" = $1 and module = $2`, [installId, moduleKey]);
    const records = await fetchModuleRecordsForSync(user, moduleKey, config.syncDirection === "APP_TO_CRM" ? null : config.lastSyncedAt);
    preview[moduleKey] = { count: records.length, sample: records[0] ? applyFieldMapping(records[0], mappings, "toApp") : null };
  }
  return { syncDirection: config.syncDirection, preview };
}

export { MAPPABLE_FIELDS };
export async function getLeadOrOpportunityForConflictCheck(user: TenantUser, moduleKey: SyncModule, id: string) {
  return moduleKey === "leads" ? getLeadForTenant(user, id) : getOpportunityForTenant(user, id);
}
export async function applyModuleUpdate(user: TenantUser, moduleKey: SyncModule, id: string, payload: Record<string, unknown>) {
  return moduleKey === "leads" ? updateLeadForTenant(user, id, payload) : updateOpportunityForTenant(user, id, payload);
}

// Used directly on the inbound PATCH hot path -- an already-authenticated request already knows
// its own installId, so this skips the tenant-ownership re-check getOrCreateSyncConfig does for
// the settings UI. A config/mappings that were never configured are treated as "no mapping, no
// conflict policy beyond the CRM_WINS default" rather than an error -- sync settings are opt-in.
export async function loadSyncContext(installId: string, moduleKey: SyncModule) {
  const config = await queryOne<any>(`select * from "TenantAppSyncConfig" where "installId" = $1`, [installId]);
  const mappings = await query<{ crmField: string; appField: string }>(`select "crmField", "appField" from "TenantAppFieldMapping" where "installId" = $1 and module = $2`, [installId, moduleKey]);
  return { config, mappings };
}

// Conflict resolution, stated honestly as an approximation: the two systems don't share a
// clock or a version number, so "conflict" here specifically means "the app's PATCH included
// expectedUpdatedAt (what it last read) and the CRM record has since changed." Without
// expectedUpdatedAt, there's nothing to compare against, so the update is always allowed --
// an app that never sends it gets the pre-existing, no-conflict-detection behavior. NEWEST_WINS
// can't truly compare "newest" without the app's own last-modified timestamp (which we don't
// have), so it degrades to the same outcome as CRM_WINS in this asymmetric case -- the CRM's
// current state is trusted over a stale read, not a coin flip.
// Applied on the way IN from the app (both create and update): translate app-field-named keys
// back to real CRM field names, then fill in "default ownership" if the app didn't specify an
// owner itself -- both no-ops when no sync config/mapping was ever set up (opt-in, not a
// behavior change for an app that never touches this feature).
export async function prepareIncomingPayload(installId: string, moduleKey: SyncModule, body: Record<string, unknown>) {
  const { config, mappings } = await loadSyncContext(installId, moduleKey);
  const translated = mappings.length ? applyFieldMapping(body, mappings, "toCrm") : { ...body };
  if (!translated.ownerId && config?.defaultOwnerId) translated.ownerId = config.defaultOwnerId;
  return translated;
}

export function resolveUpdateConflict(conflictResolution: string, currentUpdatedAt: string, expectedUpdatedAt: unknown) {
  if (typeof expectedUpdatedAt !== "string" || !expectedUpdatedAt) return { allowed: true as const };
  if (new Date(expectedUpdatedAt).getTime() === new Date(currentUpdatedAt).getTime()) return { allowed: true as const };
  if (conflictResolution === "APP_WINS") return { allowed: true as const };
  return {
    allowed: false as const,
    reason: conflictResolution === "NEWEST_WINS" ? "CRM record is newer than what the app last saw" : "CRM record has been modified since the app last read it",
  };
}
