/**
 * Local-only real-database check that leaving a journey stops its scheduled steps:
 *   - exiting (or converting) an enrolment cancels that journey's pending steps for that record
 *     only -- another record's steps and another journey's steps stay;
 *   - unsubscribing (every journey) cancels all journey steps for the record, but not steps of
 *     an ordinary automation;
 *   - already-run steps are untouched; another workspace is untouched.
 * Temporary tenants, removed afterwards.
 * Run: tsx scripts/journey-exit-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { cancelPendingJourneyStepsForRecord, markEnrollmentStatus } from "../src/lib/server/marketing-journeys";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  try {
    for (const id of [tenantId, otherTenantId]) await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Journey exit smoke', now())`, [id]);
    const roleId = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Admin', '{"recordAccess":"ALL"}', now())`, [roleId, tenantId]);
    const userId = randomUUID();
    await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [userId, tenantId, `journey.${userId.slice(0, 8)}@smoke.invalid`, roleId]);
    const user = { id: userId, tenantId, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL" } } } as any;

    const automation = async (tenant: string, name: string) => {
      const id = randomUUID();
      await q(`insert into "AutomationV2" (id, "tenantId", name, trigger, workflow, "updatedAt") values ($1, $2, $3, '{"type":"MANUAL"}', '{"nodes":[],"edges":[]}', now())`, [id, tenant, name]);
      return id;
    };
    const journey = async (tenant: string, automationId: string) => {
      const id = randomUUID();
      await q(`insert into "MarketingJourney" (id, "tenantId", "automationId", name, "targetModule", status, "updatedAt") values ($1, $2, $3, 'Smoke journey', 'LEAD', 'ACTIVE', now())`, [id, tenant, automationId]);
      return id;
    };
    const step = async (tenant: string, automationId: string, recordId: string, status = "PENDING") => {
      const id = randomUUID();
      await q(`insert into "AutomationQueue" (id, "tenantId", "automationId", "entityType", "entityId", status, "runAt") values ($1, $2, $3, 'LEAD', $4, $5, now() + interval '1 day')`, [id, tenant, automationId, recordId, status]);
      return id;
    };
    const statusOf = async (id: string) => (await q(`select status from "AutomationQueue" where id = $1`, [id])).rows[0].status;

    const autoA = await automation(tenantId, "[Journey] A");
    const autoB = await automation(tenantId, "[Journey] B");
    const plain = await automation(tenantId, "Plain automation");
    const journeyA = await journey(tenantId, autoA);
    const journeyB = await journey(tenantId, autoB);
    const leadX = randomUUID();
    const leadY = randomUUID();
    const enrolment = randomUUID();
    await q(`insert into "MarketingJourneyEnrollment" (id, "tenantId", "journeyId", "recordType", "recordId") values ($1, $2, $3, 'LEAD', $4)`, [enrolment, tenantId, journeyA, leadX]);

    const aX = await step(tenantId, autoA, leadX);
    const aXDone = await step(tenantId, autoA, leadX, "COMPLETED");
    const aY = await step(tenantId, autoA, leadY);
    const bX = await step(tenantId, autoB, leadX);
    const plainX = await step(tenantId, plain, leadX);
    const otherAuto = await automation(otherTenantId, "[Journey] other");
    await journey(otherTenantId, otherAuto);
    const otherX = await step(otherTenantId, otherAuto, leadX);

    await markEnrollmentStatus(user, enrolment, "EXITED", "Smoke");
    check((await statusOf(aX)) === "CANCELLED", "exiting cancels that journey's pending steps for the record");
    check((await statusOf(aXDone)) === "COMPLETED", "steps that already ran are untouched");
    check((await statusOf(aY)) === "PENDING", "another record's steps in the same journey stay");
    check((await statusOf(bX)) === "PENDING", "the same record's steps in another journey stay");

    await cancelPendingJourneyStepsForRecord(tenantId, null, "LEAD", leadX);
    check((await statusOf(bX)) === "CANCELLED", "unsubscribing cancels every journey's steps for the record");
    check((await statusOf(plainX)) === "PENDING", "an ordinary automation's steps are not touched");
    check((await statusOf(otherX)) === "PENDING", "another workspace is untouched");

    console.log(`journey-exit-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (const id of [tenantId, otherTenantId]) {
      for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [id]).catch(() => undefined);
      await q(`delete from "Tenant" where id = $1`, [id]);
    }
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
