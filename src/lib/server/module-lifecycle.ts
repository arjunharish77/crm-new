import { randomUUID } from "crypto";
import type { TransactionClient } from "@/lib/db/transaction";

// Module lifecycle hooks (Module 21; decision confirmed 2026-09-29): when a module's effective
// state goes from on to off, its live work is paused and recorded in "ModulePausedItem"; when it
// comes back on, exactly those items are put back -- and only while they are still in the state
// this code left them in, so anything a person changed in between (or paused themselves before
// the switch-off) is never overwritten. Records are never deleted or rewritten otherwise.
//
// Each spec pauses one kind of live item: `live` selects items currently running/scheduled,
// `paused` is what they are set to, and `columns` are the columns captured and restored.
type PauseSpec = { table: string; live: string; paused: Record<string, unknown>; columns: string[] };

export const MODULE_PAUSE_SPECS: Record<string, PauseSpec[]> = {
  AUTOMATIONS: [{ table: "AutomationV2", live: `"isActive" = true and "deletedAt" is null`, paused: { isActive: false }, columns: ["isActive"] }],
  MARKETING: [{ table: "MarketingCampaign", live: `status in ('SCHEDULED', 'RUNNING')`, paused: { status: "PAUSED" }, columns: ["status"] }],
  JOURNEY_ORCHESTRATION: [{ table: "MarketingJourney", live: `status in ('SCHEDULED', 'ACTIVE')`, paused: { status: "PAUSED" }, columns: ["status"] }],
  TELEPHONY: [{ table: "CallCampaign", live: `status = 'ACTIVE'`, paused: { status: "PAUSED" }, columns: ["status"] }],
  REPORTS: [{ table: "ReportSchedule", live: `"isActive" = true`, paused: { isActive: false }, columns: ["isActive"] }],
  DISTRIBUTION: [{ table: "AssignmentRule", live: `"isActive" = true`, paused: { isActive: false }, columns: ["isActive"] }],
  FORMS: [{ table: "Form", live: `"isActive" = true and "deletedAt" is null`, paused: { isActive: false }, columns: ["isActive"] }],
  DATA_PLATFORM: [
    { table: "WebhookSubscription", live: `"isActive" = true`, paused: { isActive: false }, columns: ["isActive"] },
    { table: "ExternalIntegration", live: `"isActive" = true`, paused: { isActive: false }, columns: ["isActive"] },
  ],
};

const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

/** Pause the module's live work for a tenant. Returns how many items were paused. */
export async function pauseModuleWork(tx: TransactionClient, tenantId: string, moduleKey: string) {
  let paused = 0;
  for (const spec of MODULE_PAUSE_SPECS[moduleKey] ?? []) {
    const selectColumns = spec.columns.map(quote).join(", ");
    const live = (await tx.query(`select id, ${selectColumns} from ${quote(spec.table)} where "tenantId" = $1 and ${spec.live} for update`, [tenantId])).rows;
    if (!live.length) continue;
    const assignments = Object.keys(spec.paused).map((column, index) => `${quote(column)} = $${index + 3}`).join(", ");
    const updated = (await tx.query(
      `update ${quote(spec.table)} set ${assignments}, "updatedAt" = now() where "tenantId" = $1 and id = any($2::text[]) returning id`,
      [tenantId, live.map((row) => row.id), ...Object.values(spec.paused)],
    )).rows.map((row) => row.id as string);
    const byId = new Map(live.map((row) => [row.id as string, row]));
    for (const id of updated) {
      const row = byId.get(id)!;
      const previousState = Object.fromEntries(spec.columns.map((column) => [column, row[column]]));
      await tx.query(
        `insert into "ModulePausedItem" (id, "tenantId", "moduleKey", "entityTable", "entityId", "previousState", "pausedState")
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict ("tenantId", "entityTable", "entityId") where "restoredAt" is null do nothing`,
        [randomUUID(), tenantId, moduleKey, spec.table, id, JSON.stringify(previousState), JSON.stringify(spec.paused)],
      );
      paused++;
    }
  }
  return paused;
}

/** Restore work this module paused, where it is still in the paused state. Returns counts. */
export async function restoreModuleWork(tx: TransactionClient, tenantId: string, moduleKey: string) {
  const open = (await tx.query(
    `select id, "entityTable", "entityId", "previousState", "pausedState" from "ModulePausedItem"
     where "tenantId" = $1 and "moduleKey" = $2 and "restoredAt" is null for update`,
    [tenantId, moduleKey],
  )).rows;
  const known = new Set((MODULE_PAUSE_SPECS[moduleKey] ?? []).map((spec) => spec.table));
  let restored = 0;
  let skipped = 0;
  for (const item of open) {
    if (known.has(item.entityTable)) {
      const previous = item.previousState as Record<string, unknown>;
      const pausedState = item.pausedState as Record<string, unknown>;
      const columns = Object.keys(previous);
      const assignments = columns.map((column, index) => `${quote(column)} = $${index + 3}`).join(", ");
      const stillPaused = Object.keys(pausedState).map((column, index) => `${quote(column)} is not distinct from $${columns.length + 3 + index}`).join(" and ");
      const result = await tx.query(
        `update ${quote(item.entityTable)} set ${assignments}, "updatedAt" = now() where "tenantId" = $1 and id = $2 and ${stillPaused} returning id`,
        [tenantId, item.entityId, ...columns.map((column) => previous[column]), ...Object.values(pausedState)],
      );
      if (result.rows.length) restored++;
      else skipped++;
    }
    await tx.query(`update "ModulePausedItem" set "restoredAt" = now() where id = $1`, [item.id]);
  }
  return { restored, skipped };
}

/** Live-work counts currently paused by module (for the platform-admin Modules section). */
export async function countPausedWork(query: (sql: string, params: unknown[]) => Promise<{ moduleKey: string; count: number }[]>, tenantId: string) {
  const rows = await query(`select "moduleKey", count(*)::int as count from "ModulePausedItem" where "tenantId" = $1 and "restoredAt" is null group by "moduleKey"`, [tenantId]);
  return Object.fromEntries(rows.map((row) => [row.moduleKey, row.count]));
}
