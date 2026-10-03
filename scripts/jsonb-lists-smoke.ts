/**
 * Local-only real-database check that lists written to jsonb columns are stored as JSON arrays
 * (a bare JS array is sent by node-postgres as a Postgres array literal: it errors, or an empty
 * list is stored as {} instead of []). Covers the writes the 2026-10-03 sweep found:
 * Metric.filters, CalculatedMetric.steps, FieldDefinition.options and the SalesGroup routing lists,
 * on create and on update.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/jsonb-lists-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { createMetricForTenant, updateMetricDefinitionForTenant } from "../src/lib/server/metrics";
import { createCalculatedMetricForTenant, updateCalculatedMetricForTenant } from "../src/lib/server/calculated-metrics";
import { createCustomFieldForTenant, updateCustomFieldForTenant } from "../src/lib/server/admin-modules";
import { createSalesGroupForTenant, updateSalesGroupForTenant } from "../src/lib/repositories/admin-modules-postgres";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const stored = async (table: string, column: string, id: string) =>
    (await q(`select jsonb_typeof("${column}") as kind, "${column}"::text as text from "${table}" where id = $1`, [id])).rows[0];
  const tenantId = randomUUID();
  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'jsonb lists smoke', now())`, [tenantId]);
    const roleId = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Admin', '{"recordAccess":"ALL"}', now())`, [roleId, tenantId]);
    const userId = randomUUID();
    await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [userId, tenantId, `jsonb.${userId.slice(0, 8)}@smoke.invalid`, roleId]);
    const user = { id: userId, tenantId, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL" } } } as any;
    await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, 'lead', 'Lead', now())`, [randomUUID(), tenantId]);

    const metric: any = await createMetricForTenant(user, { name: "All leads", root: "lead", aggregation: "COUNT", filters: [] } as any);
    check((await stored("Metric", "filters", metric.id)).text === "[]", "a metric with no filters stores [] (it used to store {})");
    await updateMetricDefinitionForTenant(user, metric.id, { name: "All leads", root: "lead", aggregation: "COUNT", filters: [{ object: "lead", field: "source", operator: "equals", value: "Web" }] } as any);
    check((await stored("Metric", "filters", metric.id)).kind === "array", "updating a metric's filters stores a JSON array");

    const second: any = await createMetricForTenant(user, { name: "Web leads", root: "lead", aggregation: "COUNT", filters: [{ object: "lead", field: "source", operator: "equals", value: "Web" }] } as any);
    const calculated: any = await createCalculatedMetricForTenant(user, { name: "Share", steps: [{ metricId: second.id, operator: null }, { metricId: metric.id, operator: "/" }] } as any);
    check((await stored("CalculatedMetric", "steps", calculated.id)).kind === "array", "a calculated metric's steps are a JSON array");
    await updateCalculatedMetricForTenant(user, calculated.id, { steps: [{ metricId: metric.id, operator: null }, { metricId: second.id, operator: "-" }] } as any);
    check((await stored("CalculatedMetric", "steps", calculated.id)).kind === "array", "and still after an update");

    const field: any = await createCustomFieldForTenant(user, { objectType: "LEAD", key: "intake", label: "Intake", type: "SELECT", options: ["Spring", "Autumn"] });
    check((await stored("FieldDefinition", "options", field.id)).text === '["Spring", "Autumn"]', "a select field's options are a JSON array");
    await updateCustomFieldForTenant(user, field.id, { options: [] });
    check((await stored("FieldDefinition", "options", field.id)).text === "[]", "emptied options store [] (not {})");

    const group: any = await createSalesGroupForTenant(user, { name: "North", territories: ["North"], skills: [] });
    check((await stored("SalesGroup", "territories", group.id)).kind === "array" && (await stored("SalesGroup", "skills", group.id)).text === "[]", "sales group routing lists are JSON arrays");
    await updateSalesGroupForTenant(user, group.id, { languages: ["en", "hi"], territories: null });
    check((await stored("SalesGroup", "languages", group.id)).kind === "array" && (await stored("SalesGroup", "territories", group.id)).kind === null, "and on update (null stays null)");

    console.log(`jsonb-lists-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
