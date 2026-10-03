/**
 * Local-only real-database check for custom report sharing (decided 2026-10-03):
 *   - a report shared with Everyone is listed to the workspace; an "Only the owner" report is
 *     listed only to its owner and admins, and others can't export or clone it;
 *   - saving without saying who can see it keeps the current choice (the builder used to reset
 *     it on every save); a report created without a choice is shared, as before;
 *   - the governed "Reports" list export works (it selected columns that don't exist) and lists
 *     only reports the person can see.
 * Temporary tenant and export files (in a temporary folder), removed afterwards.
 * Run: tsx scripts/report-sharing-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import assert from "node:assert/strict";

const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "report-sharing-smoke-"));
process.env.FILE_STORAGE_ROOT = storageRoot;
process.env.FILE_STORAGE_DRIVER = "local";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  const { getPool } = await import("../src/lib/db/pool");
  const reports = await import("../src/lib/repositories/reports-dashboards-postgres");
  const { exportCustomReportForTenant } = await import("../src/lib/server/crm");
  const { getExportDownloadForUser, processExportRequest } = await import("../src/lib/server/exports");
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
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Report sharing smoke', now())`, [tenantId]);
    // All record access makes a role a workspace admin in this app, so reps get Own access.
    const roles: Record<string, string> = { OWN: randomUUID(), ALL: randomUUID() };
    for (const [recordAccess, id] of Object.entries(roles)) {
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, $3, $4, now())`, [id, tenantId, `Smoke ${recordAccess}`, { recordAccess }]);
    }
    const person = async (isTenantAdmin = false) => {
      const id = randomUUID();
      const recordAccess = isTenantAdmin ? "ALL" : "OWN";
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`,
        [id, tenantId, `reports.${id.slice(0, 8)}@smoke.invalid`, roles[recordAccess]]);
      return { id, tenantId, isTenantAdmin, role: { permissions: { recordAccess } } } as any;
    };
    const owner = await person();
    const colleague = await person();
    const admin = await person(true);
    const definition = { queryDefinition: { root: "lead", fields: [{ object: "lead", field: "name", label: "Lead Name" }], filters: [], limit: 10 } };
    const listed = async (user: any) => (await reports.listCustomReportsForTenant(user)).map((row: any) => row.name).sort();

    const shared = await reports.createCustomReportForTenant(owner, { name: "Shared report", module: "LEADS", config: definition } as any);
    check(shared.isPublic === true, "a report created without a choice is shared with everyone, as before");
    const mine = await reports.createCustomReportForTenant(owner, { name: "My report", module: "LEADS", config: definition, isPublic: false } as any);

    check((await listed(owner)).join() === "My report,Shared report", "the owner sees both reports");
    check((await listed(colleague)).join() === "Shared report", "a colleague doesn't see the owner-only report");
    check((await listed(admin)).join() === "My report,Shared report", "an admin sees every report");
    await rejects(() => exportCustomReportForTenant(colleague, mine.id), "CUSTOM_REPORT_NOT_FOUND", "a colleague can't export it");
    check(typeof (await exportCustomReportForTenant(owner, mine.id)) === "string", "the owner can export it");
    await rejects(() => reports.cloneCustomReportForTenant(colleague, mine.id, "Copy"), "CUSTOM_REPORT_NOT_FOUND", "a colleague can't clone it");

    const resaved = await reports.updateCustomReportForTenant(owner, mine.id, { name: "My report", module: "LEADS", config: definition } as any);
    check(resaved?.isPublic === false, "saving without a choice keeps it owner-only");
    await reports.updateCustomReportForTenant(owner, mine.id, { name: "My report", module: "LEADS", config: definition, isPublic: true } as any);
    check((await listed(colleague)).join() === "My report,Shared report", "sharing it with everyone lists it to the colleague");
    await reports.updateCustomReportForTenant(owner, mine.id, { name: "My report", module: "LEADS", config: definition, isPublic: false } as any);

    // The request row is written directly rather than through createExportRequestForUser, which
    // also queues a job that a running worker could pick up first (writing elsewhere).
    const request = { id: randomUUID() };
    await q(`insert into "ExportRequest" (id, "tenantId", "userId", "moduleName", status) values ($1, $2, $3, 'REPORTS', 'QUEUED')`, [request.id, tenantId, colleague.id]);
    const done: any = await processExportRequest(request.id);
    check(done.status === "COMPLETED", `the Reports list export completes (status ${done.status}${done.error ? `: ${done.error}` : ""})`);
    const csv = (await getExportDownloadForUser(colleague, request.id)).buffer.toString("utf8");
    check(csv.includes("Shared report") && !csv.includes("My report"), "and lists only the reports the colleague can see");

    console.log(`report-sharing-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
    fs.rmSync(storageRoot, { recursive: true, force: true });
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
