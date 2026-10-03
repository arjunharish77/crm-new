/**
 * Local-only real-database check for custom report drafts (decision 29, extended 2026-10-03):
 *   - a report made in the builder starts as an unpublished draft: only its owner sees it and it
 *     can't be exported; a report made any other way is published as version 1, as before;
 *   - Publish makes the draft what runs, as the next version; saving more changes only touches
 *     the draft (exports keep using the published report) until the next Publish;
 *   - a draft that matches the published report again is cleared; nothing to publish is refused;
 *   - Restore makes an old version the draft; Discard drops the draft;
 *   - a change made outside the builder applies at once and is recorded as a version;
 *   - a clone is published as its version 1.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/report-drafts-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import {
  cloneCustomReportForTenant,
  createCustomReportForTenant,
  discardCustomReportDraftForTenant,
  listCustomReportsForTenant,
  publishCustomReportVersion,
  restoreCustomReportVersion,
  updateCustomReportForTenant,
} from "../src/lib/repositories/reports-dashboards-postgres";
import { exportCustomReportForTenant } from "../src/lib/server/crm";

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
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Report drafts smoke', now())`, [tenantId]);
    const roleId = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Rep', '{"recordAccess":"OWN"}', now())`, [roleId, tenantId]);
    const person = async () => {
      const id = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [id, tenantId, `drafts.${id.slice(0, 8)}@smoke.invalid`, roleId]);
      return { id, tenantId, isTenantAdmin: false, role: { permissions: { recordAccess: "OWN" } } } as any;
    };
    const owner = await person();
    const colleague = await person();
    const definition = (labels: string[]) => ({ queryDefinition: { root: "lead", fields: labels.map((label) => ({ object: "lead", field: label === "Email" ? "email" : "name", label })), filters: [], limit: 10 } });
    const versions = async (id: string) => (await q(`select version from "CustomReportVersion" where "reportId" = $1 order by version`, [id])).rows.map((row) => row.version).join(",");
    const row = async (id: string) => (await q(`select config, draft, "currentVersion" from "CustomReport" where id = $1`, [id])).rows[0];

    const viaApi: any = await createCustomReportForTenant(owner, { name: "API report", module: "LEADS", config: definition(["Name"]) });
    check(viaApi.currentVersion === 1 && (await versions(viaApi.id)) === "1", "a report made outside the builder is published as version 1");

    const report: any = await createCustomReportForTenant(owner, { name: "Builder report", module: "LEADS", config: definition(["Name"]), draft: true });
    check(report.currentVersion === 0 && report.draft && Object.keys(report.config ?? {}).length === 0, "a builder report starts as an unpublished draft");
    check(!(await listCustomReportsForTenant(colleague)).some((item: any) => item.id === report.id), "only its owner sees an unpublished report");
    await rejects(() => exportCustomReportForTenant(owner, report.id), "CUSTOM_REPORT_NOT_PUBLISHED", "an unpublished report can't be exported");

    await publishCustomReportVersion(owner, report.id, "First");
    const published = await row(report.id);
    check(published.currentVersion === 1 && !published.draft && published.config.queryDefinition.fields.length === 1, "Publish makes the draft what runs, as version 1");
    check((await listCustomReportsForTenant(colleague)).some((item: any) => item.id === report.id), "once published, the workspace sees it");

    await updateCustomReportForTenant(owner, report.id, { name: "Builder report", module: "LEADS", config: definition(["Name", "Email"]), draft: true });
    const drafted = await row(report.id);
    check(drafted.draft && drafted.config.queryDefinition.fields.length === 1, "a saved change only touches the draft");
    const csv = await exportCustomReportForTenant(owner, report.id);
    check(csv.split("\n")[0] === '"Name"', "exports keep using the published report (one column, not the draft's two)");

    await updateCustomReportForTenant(owner, report.id, { name: "Builder report", module: "LEADS", config: definition(["Name"]), draft: true });
    check(!(await row(report.id)).draft, "a draft that matches what's published again is cleared");
    await rejects(() => publishCustomReportVersion(owner, report.id), "CUSTOM_REPORT_NOTHING_TO_PUBLISH", "nothing to publish is refused");

    await updateCustomReportForTenant(owner, report.id, { name: "Renamed report", module: "LEADS", config: definition(["Name", "Email"]), draft: true });
    check((await q(`select name from "CustomReport" where id = $1`, [report.id])).rows[0].name === "Renamed report", "the name applies at once");
    await publishCustomReportVersion(owner, report.id, "Second");
    check((await row(report.id)).config.queryDefinition.fields.length === 2 && (await versions(report.id)) === "1,2", "the next Publish is version 2");

    await restoreCustomReportVersion(owner, report.id, 1);
    const restored = await row(report.id);
    check(restored.draft?.config?.queryDefinition?.fields?.length === 1 && restored.config.queryDefinition.fields.length === 2, "Restore makes version 1 the draft; what runs is unchanged");
    await discardCustomReportDraftForTenant(owner, report.id);
    check(!(await row(report.id)).draft, "Discard drops the draft");
    const fresh: any = await createCustomReportForTenant(owner, { name: "New", module: "LEADS", config: definition(["Name"]), draft: true });
    await rejects(() => discardCustomReportDraftForTenant(owner, fresh.id), "CUSTOM_REPORT_NOT_PUBLISHED", "a never-published report has nothing to go back to");

    await updateCustomReportForTenant(owner, viaApi.id, { name: "API report", module: "LEADS", config: definition(["Name", "Email"]) });
    const direct = await row(viaApi.id);
    check(direct.config.queryDefinition.fields.length === 2 && direct.currentVersion === 2 && (await versions(viaApi.id)) === "1,2", "a change outside the builder applies at once as a new version");

    const clone: any = await cloneCustomReportForTenant(owner, report.id, "Copy");
    check(clone.currentVersion === 1 && (await versions(clone.id)) === "1", "a clone is published as its version 1");

    console.log(`report-drafts-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
