/**
 * Local-only real-database check for dashboard edit-mode drafts (decision 29, extended
 * 2026-10-03):
 *   - moving, resizing and removing widgets go to the tab's draft; the widgets don't change;
 *   - only the owner's own widgets on that tab can be in the draft;
 *   - Publish applies the draft (layouts and removals), clears it and records a tab version;
 *   - an empty draft is cleared; another person can't touch the tab's draft.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/dashboard-drafts-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { discardDashboardTabDraftForTenant, publishDashboardTabVersion, saveDashboardTabDraftForTenant } from "../src/lib/repositories/dashboard-tabs-postgres";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const tenantId = randomUUID();
  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Dashboard drafts smoke', now())`, [tenantId]);
    const roleId = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Rep', '{"recordAccess":"OWN"}', now())`, [roleId, tenantId]);
    const person = async () => {
      const id = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [id, tenantId, `dash.${id.slice(0, 8)}@smoke.invalid`, roleId]);
      return { id, tenantId, isTenantAdmin: false, role: { permissions: { recordAccess: "OWN" } } } as any;
    };
    const owner = await person();
    const other = await person();
    const tabId = randomUUID();
    await q(`insert into "DashboardTab" (id, "tenantId", "userId", name, "order", "isDefault", "currentVersion", "viewCount") values ($1, $2, $3, 'Mine', 0, true, 0, 0)`, [tabId, tenantId, owner.id]);
    const widget = async (userId: string, title: string) => {
      const id = randomUUID();
      await q(`insert into "DashboardWidget" (id, "tenantId", "userId", "tabId", title, type, config, w, h, x, y, "updatedAt") values ($1, $2, $3, $4, $5, 'COUNT', '{}', 4, 3, 0, 0, now())`, [id, tenantId, userId, tabId, title]);
      return id;
    };
    const moved = await widget(owner.id, "Leads");
    const removed = await widget(owner.id, "Tasks");
    const foreign = await widget(other.id, "Not mine");
    const box = async (id: string) => (await q(`select x, y, w, h from "DashboardWidget" where id = $1`, [id])).rows[0];

    const saved = await saveDashboardTabDraftForTenant(owner, tabId, { layouts: { [moved]: { x: 4, y: 2, w: 6, h: 4 }, [foreign]: { x: 8, y: 8, w: 2, h: 2 } }, removed: [removed, foreign] });
    check(saved.draft && Object.keys(saved.draft.layouts).join() === moved && saved.draft.removed.join() === removed, "the draft keeps only the owner's own widgets on the tab");
    check((await box(moved)).x === 0 && (await q(`select 1 from "DashboardWidget" where id = $1`, [removed])).rowCount === 1, "the widgets don't change while it's a draft");
    check((await saveDashboardTabDraftForTenant(other, tabId, { layouts: {} }).catch((error) => error.message)) === "DASHBOARD_TAB_NOT_FOUND", "another person can't touch the tab's draft");

    const published = await publishDashboardTabVersion(owner, tabId, "Rearranged");
    const after = await box(moved);
    check(after.x === 4 && after.y === 2 && after.w === 6 && after.h === 4, "Publish applies the layout change");
    check((await q(`select 1 from "DashboardWidget" where id = $1`, [removed])).rowCount === 0 && (await q(`select 1 from "DashboardWidget" where id = $1`, [foreign])).rowCount === 1, "and the removal, of the owner's widget only");
    check(!published.draft && published.currentVersion === 1, "it clears the draft and records version 1");

    await saveDashboardTabDraftForTenant(owner, tabId, { layouts: { [moved]: { x: 0, y: 0, w: 4, h: 3 } }, removed: [] });
    const discarded = await discardDashboardTabDraftForTenant(owner, tabId);
    check(!discarded.draft && (await box(moved)).x === 4, "Discard drops the draft and leaves the published layout");

    console.log(`dashboard-drafts-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
