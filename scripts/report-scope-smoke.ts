/**
 * Local-only real-database check for round-2 plan wave 3 (correct numbers):
 *   - reports and widgets count every record, past the old 1,000-lead/opportunity and 500-activity caps;
 *   - they follow record access (own / team / all), and the owner, team and date filters;
 *   - dates are the workspace's calendar days (a lead at 20:00 UTC is the next day in India);
 *   - won deals count by the day they closed (migration 0138's "closedAt" trigger);
 *   - the task SLA report works with teams (its team lookup used to fail: uuid = text);
 *   - workspace-level anomaly series stay with all-access viewers;
 *   - an import whose worker stopped resumes from its saved progress (migration 0139).
 * A temporary tenant, removed afterwards.
 * Run: tsx scripts/report-scope-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import {
  getAnomalyDetectionReportForTenant,
  getFunnelByStageReportForTenant,
  getFunnelBySourceCampaignReportForTenant,
  getRepPerformanceReportForTenant,
  getTaskSlaPerformanceReportForTenant,
} from "../src/lib/server/inbuilt-reports";
import { getDashboardWidgetDataForTenant, processImportJob } from "../src/lib/server/crm";
import { NO_REPORT_FILTERS, type ReportFilters } from "../src/lib/server/report-scope";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };
  const filters = (patch: Partial<ReportFilters>): ReportFilters => ({ ...NO_REPORT_FILTERS, ...patch });
  const tenantId = randomUUID();
  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Report scope smoke', now())`, [tenantId]);
    await q(`insert into "TenantConfig" (id, "tenantId", "featureFlags") values ($1, $2, $3)`, [randomUUID(), tenantId, { generalSettings: { timezone: "Asia/Kolkata" } }]);
    const object = async (name: string) => {
      const id = randomUUID();
      await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, $3, $3, now())`, [id, tenantId, name]);
      return id;
    };
    const [leadObject, opportunityObject, activityObject] = [await object("lead"), await object("opportunity"), await object("activity")];
    const teamId = randomUUID();
    await q(`insert into "Team" (id, "tenantId", name) values ($1, $2, 'Smoke team')`, [teamId, tenantId]);
    const person = async (recordAccess: "OWN" | "TEAM" | "ALL", team: string | null) => {
      const roleId = randomUUID();
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, $3, $4, now())`, [roleId, tenantId, `Smoke ${recordAccess} ${roleId.slice(0, 4)}`, { recordAccess, modules: { leads: "write" } }]);
      const id = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "teamId", "updatedAt") values ($1, $2, $3, $4, 'x', $5, $6, now())`,
        [id, tenantId, `scope.${id.slice(0, 8)}@smoke.invalid`, `Smoke ${recordAccess}`, roleId, team]);
      return { id, tenantId, teamId: team, role: { permissions: { recordAccess } } } as any;
    };
    const admin = await person("ALL", null);
    const manager = await person("TEAM", teamId);
    const repA = await person("OWN", teamId);
    const repB = await person("OWN", null);

    // 1,005 leads: 1,000 of repB's (January), 3 of repA's at 20:00 UTC on 25 Oct (26 Oct in India), 2 of the manager's.
    const addLeads = async (count: number, ownerId: string, createdAt: string, source: string) =>
      q(`insert into "Lead" (id, "tenantId", "objectId", name, "ownerId", source, "createdAt", "updatedAt")
         select gen_random_uuid()::text, $1, $2, 'Smoke lead ' || n, $3, $4, $5::timestamptz, now() from generate_series(1, $6) n`,
        [tenantId, leadObject, ownerId, source, createdAt, count]);
    await addLeads(1000, repB.id, "2026-01-10T06:00:00Z", "Website");
    await addLeads(3, repA.id, "2026-10-25T20:00:00Z", "Referral");
    await addLeads(2, manager.id, "2026-09-01T06:00:00Z", "Event");

    const typeId = randomUUID();
    await q(`insert into "OpportunityType" (id, "tenantId", "objectId", name, "updatedAt") values ($1, $2, $3, 'Smoke programme', now())`, [typeId, tenantId, opportunityObject]);
    const stage = async (name: string, order: number, isClosed: boolean, isWon: boolean) => {
      const id = randomUUID();
      await q(`insert into "StageDefinition" (id, "tenantId", "opportunityTypeId", name, "order", "isClosed", "isWon", "updatedAt") values ($1, $2, $3, $4, $5, $6, $7, now())`,
        [id, tenantId, typeId, name, order, isClosed, isWon]);
      return id;
    };
    const [openStage, wonStage] = [await stage("Open", 0, false, false), await stage("Won", 1, true, true)];
    // One opportunity per lead (1,005), created in January, all open.
    await q(`insert into "Opportunity" (id, "tenantId", "objectId", "leadId", "opportunityTypeId", "stageId", title, amount, "ownerId", "createdAt", "updatedAt")
             select gen_random_uuid()::text, $1, $2, l.id, $3, $4, 'Smoke deal', 100, l."ownerId", '2026-01-10T06:00:00Z', now() from "Lead" l where l."tenantId" = $1`,
      [tenantId, opportunityObject, typeId, openStage]);
    const won = (await q(`select o.id from "Opportunity" o where o."tenantId" = $1 and o."ownerId" = $2 limit 1`, [tenantId, repA.id])).rows[0].id;
    await q(`update "Opportunity" set "stageId" = $2 where id = $1`, [won, wonStage]);
    const closedAt = (await q(`select "closedAt" from "Opportunity" where id = $1`, [won])).rows[0].closedAt;
    check(closedAt && Date.now() - new Date(closedAt).getTime() < 60_000, "moving a deal to a won stage stamps its close time");

    const activityTypeId = randomUUID();
    await q(`insert into "ActivityType" (id, "tenantId", "objectId", name, "updatedAt") values ($1, $2, $3, 'Call', now())`, [activityTypeId, tenantId, activityObject]);
    await q(`insert into "Activity" (id, "tenantId", "objectId", "typeId", "leadId", "createdBy", "createdAt", "updatedAt")
             select gen_random_uuid()::text, $1, $2, $3, l.id, l."ownerId", '2026-01-11T06:00:00Z', now()
             from "Lead" l, generate_series(1, 2) n where l."tenantId" = $1 and l."ownerId" = $4 and l.name in ('Smoke lead 1', 'Smoke lead 2')`,
      [tenantId, activityObject, activityTypeId, repB.id]);
    await q(`insert into "Activity" (id, "tenantId", "objectId", "typeId", "leadId", "createdBy", "createdAt", "updatedAt")
             select gen_random_uuid()::text, $1, $2, $3, (select id from "Lead" where "tenantId" = $1 and "ownerId" = $4 limit 1), $4, '2026-01-11T06:00:00Z', now()
             from generate_series(1, 501)`, [tenantId, activityObject, activityTypeId, repB.id]);
    const totalActivities = Number((await q(`select count(*) from "Activity" where "tenantId" = $1`, [tenantId])).rows[0].count);

    // --- Past the old caps (1,000 leads/opportunities, 500 activities).
    const sum = (rows: any[], key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
    const repAll = await getRepPerformanceReportForTenant(admin);
    equal([sum(repAll.rows, "leadsOwned"), sum(repAll.rows, "opportunitiesOwned"), sum(repAll.rows, "activitiesCreated")], [1005, 1005, totalActivities], "rep performance counts every lead, opportunity and activity");
    check(totalActivities > 500, "more activities than the old 500 cap");
    const funnel = await getFunnelByStageReportForTenant(admin);
    equal(sum((funnel as any).rows ?? (funnel as any).stages ?? [], "count"), 1005, "funnel by stage counts every opportunity");

    const widget = async (type: string, config: Record<string, unknown>) => {
      const id = randomUUID();
      await q(`insert into "DashboardWidget" (id, "tenantId", "userId", title, type, config, "updatedAt") values ($1, $2, $3, 'Smoke', $4, $5, now())`, [id, tenantId, admin.id, type, config]);
      return id;
    };
    equal(await getDashboardWidgetDataForTenant(admin, await widget("STAT", { module: "LEADS" })), 1005, "a number widget counts every lead");
    equal(await getDashboardWidgetDataForTenant(admin, await widget("BAR", { module: "OPPORTUNITIES" })), [{ group: "Open", value: 1004 }, { group: "Won", value: 1 }], "a bar widget groups every opportunity in stage order");

    // --- Record access: own, team (own + team members), all.
    const leadsOwned = async (user: any, applied = NO_REPORT_FILTERS) => sum((await getRepPerformanceReportForTenant(user, applied)).rows, "leadsOwned");
    equal(await leadsOwned(repA), 3, "an own-records rep counts only their own leads");
    equal(await leadsOwned(repB), 1000, "another own-records rep counts their own 1,000");
    equal(await leadsOwned(manager), 5, "a team manager counts their own and their team's leads");

    // --- Filters: owner, team, dates (workspace time zone).
    equal(await leadsOwned(admin, filters({ ownerIds: [repA.id] })), 3, "the owner filter narrows to that person's leads");
    equal(await leadsOwned(admin, filters({ teamId })), 5, "the team filter narrows to the team's leads");
    equal(await leadsOwned(repA, filters({ ownerIds: [repB.id] })), 0, "an owner filter can't widen a rep's access");
    const sourceLeads = async (from: string, to: string) => (await getFunnelBySourceCampaignReportForTenant(admin, filters({ from, to }))).totals.leads;
    equal(await sourceLeads("2026-10-26", "2026-10-26"), 3, "a lead at 20:00 UTC on 25 Oct counts on 26 Oct in the workspace's time zone");
    equal(await sourceLeads("2026-10-25", "2026-10-25"), 0, "and not on 25 Oct");
    equal(await sourceLeads("2026-01-01", "2026-12-31"), 1005, "a year's range includes every lead");

    // --- Won deals count by the day they closed.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const funnelOn = async (from: string, to: string) => (await getFunnelByStageReportForTenant(admin, filters({ from, to })) as any);
    const stageCount = (report: any, name: string) => sum((report.rows ?? report.stages ?? []).filter((row: any) => (row.stage ?? row.stageName) === name), "count");
    equal(stageCount(await funnelOn(today, today), "Won"), 1, "the won deal counts on the day it closed");
    equal(stageCount(await funnelOn("2026-01-10", "2026-01-10"), "Won"), 0, "not on the day it was created");
    equal(stageCount(await funnelOn("2026-01-10", "2026-01-10"), "Open"), 1004, "open deals count by the day they were created");

    // --- Task SLA works with teams and follows record access.
    for (const [ownerId, count] of [[repA.id, 2], [repB.id, 3]] as const) {
      await q(`insert into "Task" (id, "tenantId", title, "ownerId", status, priority, "updatedAt") select gen_random_uuid()::text, $1, 'Smoke task', $2, 'OPEN', 'MEDIUM', now() from generate_series(1, $3)`, [tenantId, ownerId, count]);
    }
    equal((await getTaskSlaPerformanceReportForTenant(admin)).totals.totalTasks, 5, "the task SLA report runs (team lookup fixed) and counts every task");
    equal((await getTaskSlaPerformanceReportForTenant(repA)).totals.totalTasks, 2, "and a rep sees only their own tasks");

    // --- Workspace-level anomaly series stay with all-access viewers.
    const domains = async (user: any) => (await getAnomalyDetectionReportForTenant(user)).domains.map((domain) => domain.domain);
    check((await domains(admin)).includes("PAYOUT_AMOUNT"), "an admin sees the payout series");
    check(!(await domains(repA)).includes("PAYOUT_AMOUNT") && (await domains(repA)).includes("LEAD_VOLUME"), "a rep sees their record series, not payouts");

    // --- An import whose worker stopped resumes from its saved progress.
    const jobId = randomUUID();
    await q(`insert into "ImportJob" (id, "tenantId", "userId", module, "filePath", mapping, status, rows, progress, attempts, "leaseExpiresAt", "updatedAt")
             values ($1, $2, $3, 'LEAD', 'smoke', $4, 'PROCESSING', $5, $6, 1, now() - interval '1 minute', now())`,
      [jobId, tenantId, admin.id, { fields: [{ source: "name", target: "name" }, { source: "email", target: "email" }], duplicateMode: "CREATE" },
        JSON.stringify([{ name: "Imported one", email: "one@smoke.invalid" }, { name: "Imported two", email: "two@smoke.invalid" }]),
        { next: 1, created: 1, updated: 0, skipped: 0, errors: [] }]);
    const finished: any = await processImportJob(jobId);
    equal([finished?.status, finished?.stats?.created, finished?.stats?.total], ["COMPLETED", 2, 2], "a stale import is taken over and finishes with the saved count plus the rest");
    equal(Number((await q(`select count(*) from "Lead" where "tenantId" = $1 and name like 'Imported %'`, [tenantId])).rows[0].count), 1, "only the rows after the saved progress were imported again");
    const live = randomUUID();
    await q(`insert into "ImportJob" (id, "tenantId", "userId", module, "filePath", mapping, status, rows, attempts, "leaseExpiresAt", "updatedAt")
             values ($1, $2, $3, 'LEAD', 'smoke', '{}', 'PROCESSING', '[]', 1, now() + interval '4 minutes', now())`, [live, tenantId, admin.id]);
    equal(await processImportJob(live), null, "an import another run still holds is left alone");

    console.log(`report-scope-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
