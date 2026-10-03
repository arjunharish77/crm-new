/**
 * Local-only real-database check for the two scheduled report sweeps' tenant selection:
 *   - dataQuality.processScheduledScan: one scorecard per tenant per tenant-local day, never-
 *     scanned tenants first, tenants with reporting off skipped (not crashing the run);
 *   - cases.refreshAnalyticsSnapshots: only tenants with cases and reporting + Service Desk on,
 *     missing/oldest snapshots first, fresh snapshots (< 15 min) left alone.
 * Temporary tenants, removed afterwards. Other local tenants may also be processed (exactly as the
 * worker would) -- assertions only look at the temporary tenants.
 * Run: tsx scripts/report-sweeps-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { refreshCaseAnalyticsSnapshots, runScheduledDataQualityScan } from "../src/lib/server/inbuilt-reports";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  const one = async (sql: string, args: unknown[] = []) => (await q(sql, args)).rows[0];
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const tenants: string[] = [];
  const isOurs = (list: string[], id: string) => list.includes(id);
  const newTenant = async (name: string) => {
    const id = randomUUID();
    tenants.push(id);
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, $2, now())`, [id, name]);
    return id;
  };
  const scorecards = async (id: string) => (await one(`select count(*)::int as n from "DataQualityScorecard" where "tenantId" = $1`, [id])).n as number;
  const addCase = async (id: string) => {
    const [type, status, priority] = [randomUUID(), randomUUID(), randomUUID()];
    await q(`insert into "CaseType" (id, "tenantId", name, "updatedAt") values ($1, $2, 'Smoke', now())`, [type, id]);
    await q(`insert into "CaseStatus" (id, "tenantId", name, category, "updatedAt") values ($1, $2, 'Open', 'OPEN', now())`, [status, id]);
    await q(`insert into "CasePriority" (id, "tenantId", name, "updatedAt") values ($1, $2, 'Normal', now())`, [priority, id]);
    await q(`insert into "Case" (id, "tenantId", "caseNumber", subject, "typeId", "statusId", "priorityId", "updatedAt") values ($1, $2, 1, 'Smoke', $3, $4, $5, now())`, [randomUUID(), id, type, status, priority]);
  };

  try {
    // --- Data quality: eligibility, once per local day, fairness under a small batch limit.
    const fresh = [await newTenant("Sweep smoke A"), await newTenant("Sweep smoke B"), await newTenant("Sweep smoke C")];
    // Reporting turned off: since decision 15 the Reports module alone decides (migration 0126
    // turned every advancedReporting=false flag into a DISABLED module).
    const flagOff = await newTenant("Sweep smoke reporting off");
    await q(`insert into "TenantModuleEntitlement" (id, "tenantId", "moduleKey", status) values ($1, $2, 'REPORTS', 'DISABLED')`, [randomUUID(), flagOff]);
    const moduleOff = await newTenant("Sweep smoke Reports suspended");
    await q(`insert into "TenantModuleEntitlement" (id, "tenantId", "moduleKey", status) values ($1, $2, 'REPORTS', 'SUSPENDED')`, [randomUUID(), moduleOff]);

    // Batch of 1 per run: three runs must reach three different never-scanned tenants.
    for (let run = 0; run < fresh.length; run++) await runScheduledDataQualityScan(1);
    check((await Promise.all(fresh.map(scorecards))).every((n) => n === 1), "a batch limit of 1 still reaches every never-scanned tenant, one per run");
    const results = await runScheduledDataQualityScan(1000);
    check(!results.some((row) => isOurs(fresh, row.tenantId)), "a tenant already scanned today is not scanned again");
    check((await scorecards(flagOff)) === 0 && (await scorecards(moduleOff)) === 0 && results.every((row) => !row.failed), "tenants with reporting off are skipped and the run does not fail");

    // A tenant whose last scorecard is from a previous local day is due again.
    await q(`update "DataQualityScorecard" set "generatedAt" = now() - interval '2 days' where "tenantId" = $1`, [fresh[0]]);
    await runScheduledDataQualityScan(1000);
    check((await scorecards(fresh[0])) === 2, "scanned again on a new local day");

    // The local day follows the tenant's time zone (UTC+14 here, far from the server default).
    const zoned = await newTenant("Sweep smoke Kiritimati");
    await q(`insert into "TenantConfig" (id, "tenantId", "featureFlags") values ($1, $2, '{"generalSettings":{"timezone":"Pacific/Kiritimati"}}')`, [randomUUID(), zoned]);
    const last = new Date(Date.now() - 20 * 60 * 60 * 1000);
    await q(`insert into "DataQualityScorecard" (id, "tenantId", "generatedAt", "staleDays", totals, issues, "createdAt") values ($1, $2, $3, 30, '{}', '[]', $3)`, [randomUUID(), zoned, last]);
    const localDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Kiritimati" }).format(date);
    const expectDue = localDay(last) < localDay(new Date());
    await runScheduledDataQualityScan(1000);
    check((await scorecards(zoned)) === (expectDue ? 2 : 1), `"today" is the tenant's local day (last scan 20h ago, due: ${expectDue})`);

    // --- Case analytics snapshots.
    const withCases = [await newTenant("Sweep smoke cases 1"), await newTenant("Sweep smoke cases 2")];
    for (const id of withCases) await addCase(id);
    const casesReportingOff = await newTenant("Sweep smoke cases, reporting off");
    await addCase(casesReportingOff);
    await q(`insert into "TenantModuleEntitlement" (id, "tenantId", "moduleKey", status) values ($1, $2, 'REPORTS', 'DISABLED')`, [randomUUID(), casesReportingOff]);
    const casesDeskOff = await newTenant("Sweep smoke cases, service desk off");
    await addCase(casesDeskOff);
    await q(`insert into "TenantModuleEntitlement" (id, "tenantId", "moduleKey", status) values ($1, $2, 'SERVICE_DESK', 'DISABLED')`, [randomUUID(), casesDeskOff]);
    const snapshotAt = async (id: string) => (await one(`select "generatedAt" from "CaseAnalyticsSnapshot" where "tenantId" = $1`, [id]))?.generatedAt as Date | undefined;

    for (let run = 0; run < withCases.length; run++) await refreshCaseAnalyticsSnapshots(1);
    check((await Promise.all(withCases.map(snapshotAt))).every(Boolean), "a batch limit of 1 still reaches every tenant with cases, one per run");
    const outcome = await refreshCaseAnalyticsSnapshots(1000);
    check(!(await snapshotAt(casesReportingOff)) && !(await snapshotAt(casesDeskOff)) && outcome.failed === 0, "tenants with reporting or Service Desk off are skipped and the run does not fail");
    check(!(await snapshotAt(fresh[1])), "tenants without cases get no snapshot");
    const before = await snapshotAt(withCases[0]);
    await refreshCaseAnalyticsSnapshots(1000);
    check((await snapshotAt(withCases[0]))?.getTime() === before?.getTime(), "a snapshot younger than 15 minutes is left alone");
    await q(`update "CaseAnalyticsSnapshot" set "generatedAt" = now() - interval '20 minutes' where "tenantId" = $1`, [withCases[0]]);
    await refreshCaseAnalyticsSnapshots(1000);
    check(((await snapshotAt(withCases[0]))?.getTime() ?? 0) > Date.now() - 60_000, "a snapshot older than 15 minutes is refreshed");

    console.log(JSON.stringify({ status: "passed", checks }));
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (const id of tenants) {
      for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId" = $1`, [id]).catch(() => undefined);
      await q(`delete from "Tenant" where id = $1`, [id]);
    }
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
