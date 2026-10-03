/**
 * Local-only real-database check for tenant-configurable lead statuses (UI/UX plan decision 6,
 * migration 0124):
 *   - a tenant gets the five defaults; new leads get the first Open status;
 *   - statuses are matched by key or label, unknown ones are refused, a lead's current status is kept;
 *   - the category drives "closed": call queues, Next Best Action and retention all use
 *     crm_lead_status_category, and changing a status's category changes it for existing leads;
 *   - list filters by status (normalised key) and by category;
 *   - a status in use can't be deleted, the last active Open status can't be removed, reorder works.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/lead-statuses-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import {
  createLeadStatusForTenant,
  deleteLeadStatusForTenant,
  listLeadStatusesForTenant,
  reorderLeadStatusesForTenant,
  updateLeadStatusForTenant,
} from "../src/lib/repositories/lead-statuses-postgres";
import { createLeadForTenant, listLeadIdsForTenant, updateLeadForTenant } from "../src/lib/repositories/leads-postgres";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const rejects = async (run: () => Promise<unknown>, code: string, label: string) => {
    await assert.rejects(run, (error: any) => error?.message === code, `${label} (expected ${code})`);
    checks++;
  };

  const tenantId = randomUUID();
  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Lead status smoke', now())`, [tenantId]);
    const roleId = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke admin', '{"recordAccess":"ALL"}', now())`, [roleId, tenantId]);
    const userId = randomUUID();
    await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [userId, tenantId, `status.${userId.slice(0, 6)}@smoke.invalid`, roleId]);
    const user = { id: userId, tenantId, role: { permissions: { recordAccess: "ALL" } } } as any;
    const category = async (leadId: string) => (await q(`select crm_lead_status_category("tenantId", status) as c from "Lead" where id = $1`, [leadId])).rows[0].c;

    const defaults = await listLeadStatusesForTenant(user);
    check(defaults.map((s) => s.key).join(",") === "NEW,CONTACTED,QUALIFIED,CONVERTED,LOST", "a tenant gets the five defaults in order");

    const nurture = await createLeadStatusForTenant(user, { label: "Nurture", category: "OPEN", tone: "warning" });
    const disqualified = await createLeadStatusForTenant(user, { label: "Not a fit", category: "LOST" });
    check(nurture?.key === "NURTURE" && disqualified?.key === "NOT_A_FIT", "new statuses get keys from their names");
    await rejects(() => createLeadStatusForTenant(user, { label: "nurture", category: "OPEN" }), "LEAD_STATUS_DUPLICATE", "names are unique");

    const plain = await createLeadForTenant(user, { name: "Status smoke plain" });
    check(plain.status === "NEW", "a new lead gets the first Open status");
    const byLabel = await createLeadForTenant(user, { name: "Status smoke label", status: "nurture" });
    check(byLabel.status === "NURTURE", "a status can be given by its label, any case");
    await rejects(() => createLeadForTenant(user, { name: "Status smoke bad", status: "Bogus" }), "LEAD_STATUS_UNKNOWN", "an unknown status is refused");

    // A legacy free-text value already on a lead keeps working until it changes.
    await q(`update "Lead" set status = 'Legacy value' where id = $1`, [plain.id]);
    const kept = await updateLeadForTenant(user, plain.id, { status: "Legacy value", name: "Status smoke plain" });
    check(kept?.status === "Legacy value", "a lead's current status is kept even if it isn't defined");
    check((await category(plain.id)) === "OPEN", "an undefined value is Open");

    const lost = await updateLeadForTenant(user, byLabel.id, { status: "NOT_A_FIT" });
    check(lost?.status === "NOT_A_FIT" && (await category(byLabel.id)) === "LOST", "a custom Lost status makes the lead closed");

    // Everything that asks "closed?" uses the category.
    await q(`update "Lead" set "ownerId" = $1 where "tenantId" = $2`, [userId, tenantId]);
    const openQueue = (await q(`select id from "Lead" where "tenantId" = $1 and "ownerId" = $2 and crm_lead_status_category("tenantId", status) = 'OPEN'`, [tenantId, userId])).rows.map((r) => r.id);
    check(openQueue.includes(plain.id) && !openQueue.includes(byLabel.id), "call queue / NBA open-lead test leaves out the Lost lead");

    const lostIds = (await listLeadIdsForTenant(user, [{ logic: "AND", conditions: [{ field: "statusCategory", operator: "equals", value: "LOST" }] }] as any)).ids;
    check(lostIds.length === 1 && lostIds[0] === byLabel.id, "filter by category");
    const keyIds = (await listLeadIdsForTenant(user, [{ logic: "AND", conditions: [{ field: "status", operator: "equals", value: "LEGACY_VALUE" }] }] as any)).ids;
    check(keyIds.length === 1 && keyIds[0] === plain.id, "status filter compares normalised keys");

    // Changing a status's category changes it for every lead that has it.
    await updateLeadStatusForTenant(user, disqualified!.id, { category: "OPEN" });
    check((await category(byLabel.id)) === "OPEN", "category change applies to existing leads");

    await rejects(() => deleteLeadStatusForTenant(user, disqualified!.id), "LEAD_STATUS_IN_USE", "a status in use can't be deleted");
    const unused = await createLeadStatusForTenant(user, { label: "Unused", category: "LOST" });
    check((await deleteLeadStatusForTenant(user, unused!.id)).deleted, "an unused status can be deleted");

    // Keep one active Open status.
    const all = await listLeadStatusesForTenant(user, { includeInactive: true });
    const open = all.filter((s) => s.category === "OPEN");
    for (const status of open.slice(1)) await updateLeadStatusForTenant(user, status.id, { isActive: false });
    await rejects(() => updateLeadStatusForTenant(user, open[0].id, { isActive: false }), "LEAD_STATUS_LAST_OPEN", "the last active Open status stays");
    await rejects(() => updateLeadStatusForTenant(user, open[0].id, { category: "LOST" }), "LEAD_STATUS_LAST_OPEN", "the last Open status keeps its category");
    const fresh = await createLeadForTenant(user, { name: "Status smoke default" });
    check(fresh.status === open[0].key, "new leads use the remaining active Open status");
    await rejects(() => createLeadForTenant(user, { name: "Status smoke off", status: open[1].key }), "LEAD_STATUS_UNKNOWN", "a turned-off status can't be chosen");

    const reversed = [...all].reverse().map((s) => s.id).filter((id) => id !== unused!.id);
    const reordered = await reorderLeadStatusesForTenant(user, reversed);
    check(reordered[0].id === reversed[0], "reorder");
    await rejects(() => reorderLeadStatusesForTenant(user, reversed.slice(1)), "LEAD_STATUS_ORDER_INVALID", "reorder must list every status");

    console.log(`lead-statuses-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId" = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
