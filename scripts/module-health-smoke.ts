/**
 * Local-only real-database check for module health badges (Module 21): every check's SQL runs
 * against the real schema, setup-incomplete / backed-up / failing / dependency / trial-expired
 * states, the 15-minute grace and 20% failure thresholds, once-a-day notices, snapshots, the
 * worker's due-tenant query, and tenant isolation. Two temporary tenants, removed afterwards.
 * Run: tsx scripts/module-health-smoke.ts   (also with ENFORCE_TENANT_RLS=true and
 * TENANT_DATABASE_URL pointing at a restricted role, to prove snapshot writes pass RLS)
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { runWithTenantContext } from "../src/lib/db/tenant-context";
import { createTenantScopedUser } from "../src/lib/repositories/auth-admin-postgres";
import { getModuleHealthForTenantAdmin, listModuleHealthAcrossTenants, refreshTenantModuleHealth, tenantsDueForHealthCheck, type ModuleHealth } from "../src/lib/server/module-health";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl(), process.env.TENANT_DATABASE_URL].filter(Boolean)) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  const one = async (sql: string, args: unknown[] = []) => (await q(sql, args)).rows[0];
  const [tenant, other] = [randomUUID(), randomUUID()];
  const adminRole = randomUUID();
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const health = async (tenantId = tenant) => Object.fromEntries((await refreshTenantModuleHealth(tenantId)).map((row) => [row.moduleKey, row])) as Record<string, ModuleHealth>;
  const automation = randomUUID();
  const queue = (tenantId: string, minutesAgo: number) => q(
    `insert into "AutomationQueue" (id, "tenantId", "automationId", "entityType", "entityId", status, "runAt") values ($1, $2, $3, 'LEAD', 'x', 'PENDING', now() - ($4 || ' minutes')::interval)`,
    [randomUUID(), tenantId, automation, minutesAgo],
  );
  const outbox = (status: string, n: number) => Promise.all(Array.from({ length: n }, () => q(
    `insert into "CommunicationOutbox" (id, "tenantId", channel, recipient, body, status, "sourceType", "updatedAt") values ($1, $2, 'EMAIL', 'a@example.invalid', 'x', $3, 'MARKETING_CAMPAIGN', now())`,
    [randomUUID(), tenant, status],
  )));

  try {
    for (const [id, name] of [[tenant, "Module health smoke"], [other, "Module health smoke (other)"]]) await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, $2, now())`, [id, name]);
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke admin', '{"modules":{"admin":"full"}}', now())`, [adminRole, tenant]);
    // Under ENFORCE_TENANT_RLS the user-admin repository needs the tenant's context, as in a request.
    await runWithTenantContext({ tenantId: tenant, userId: null, roleId: null }, () => createTenantScopedUser(tenant, { name: "Smoke admin", email: `h-${randomUUID()}@example.invalid`, password: "Sm0ke-Passw0rd!", roleId: adminRole } as never));

    // Every check runs against the real schema without error.
    let h = await health();
    const failedChecks = Object.values(h).filter((row) => row.checksFailed > 0).map((row) => row.moduleKey);
    check(failedChecks.length === 0, `every health check query runs (failed: ${failedChecks.join(", ")})`);
    check(h.LEADS && !h.LEADS.checked, "core modules have no checks");
    check(h.QUALITY_MANAGEMENT.state === "NOT_AVAILABLE", "placeholder modules show as not built");
    check(h.DISTRIBUTION.state === "SETUP_INCOMPLETE" && h.DISTRIBUTION.issues[0].action?.href === "/dashboard/settings/automation/assignment-rules", "no assignment rule -> setup incomplete with a next step");

    // Setup completes once an active rule exists.
    await q(`insert into "AssignmentRule" (id, "tenantId", name, "entityType", strategy, "isActive", "updatedAt") values ($1, $2, 'Smoke', 'LEAD', 'ROUND_ROBIN', true, now())`, [randomUUID(), tenant]);
    h = await health();
    check(h.DISTRIBUTION.state === "HEALTHY", "active assignment rule -> healthy");

    // Backlog: only work more than 15 minutes overdue counts; another tenant's work never does.
    await q(`insert into "AutomationV2" (id, "tenantId", name, trigger, "isActive", "updatedAt") values ($1, $2, 'Smoke', '{}', true, now())`, [automation, tenant]);
    await queue(tenant, 5);
    await queue(other, 60);
    h = await health();
    check(h.AUTOMATIONS.state === "HEALTHY", "work 5 minutes overdue is not a backlog; other tenant's backlog not counted");
    await queue(tenant, 30);
    await queue(tenant, 45);
    h = await health();
    const backlog = h.AUTOMATIONS.issues.find((issue) => issue.kind === "WORKER_BACKLOG");
    check(h.AUTOMATIONS.state === "WORKER_BACKLOG" && backlog?.count === 2 && /2 scheduled automation steps are more than 15 minutes overdue/.test(backlog.message), `backlog counts only overdue work (${backlog?.message})`);
    check(backlog?.detail === "Processed by automation.processDue", "platform view names the worker job");
    const tenantView = (await getModuleHealthForTenantAdmin(tenant)).find((row) => row.moduleKey === "AUTOMATIONS")!;
    check(tenantView.issues.every((issue) => !("detail" in issue)), "tenant admins do not see operator detail");

    // Failures: at least 3 and at least 20% in 24h.
    await q(`insert into "CommunicationProviderConfig" (id, "tenantId", channel, "providerType", name, "isActive", "updatedAt") values ($1, $2, 'EMAIL', 'SMTP', 'Smoke', true, now())`, [randomUUID(), tenant]);
    await outbox("FAILED", 2);
    await outbox("SENT", 2);
    h = await health();
    check(h.MARKETING.state === "HEALTHY", "2 failures stay below the minimum count");
    await outbox("FAILED", 1);
    h = await health();
    const failing = h.MARKETING.issues.find((issue) => issue.kind === "CONNECTOR_FAILING");
    check(h.MARKETING.state === "CONNECTOR_FAILING" && failing?.message === "3 of 5 campaign messages failed in the last 24 hours.", `3 of 5 failed -> connector failing (${failing?.message})`);

    // Notices: once per module and kind per day, to each admin.
    await health();
    const alerts = (await one(`select count(*)::int as n from "TenantModuleHealthAlert" where "tenantId" = $1`, [tenant])).n;
    const perAdmin = (await one(
      `select coalesce(max(n), 0)::int as n from (select count(*) as n from "Notification" where "tenantId" = $1 and data ->> 'event' = 'MODULE_HEALTH_PROBLEM' group by "userId", data ->> 'moduleKey', data ->> 'kind') x`,
      [tenant],
    )).n;
    check(alerts === 2 && perAdmin === 1, `one notice per module/kind per day (alerts ${alerts}, max per admin ${perAdmin})`);
    const setupNotices = (await one(`select count(*)::int as n from "Notification" where "tenantId" = $1 and data ->> 'event' = 'MODULE_HEALTH_PROBLEM' and data ->> 'kind' not in ('CONNECTOR_FAILING', 'WORKER_BACKLOG')`, [tenant])).n;
    check(setupNotices === 0, "setup-incomplete and stale data never notify");

    // Dependency and trial states.
    await q(`insert into "TenantModuleEntitlement" (id, "tenantId", "moduleKey", status) values ($1, $2, 'MARKETING', 'DISABLED')`, [randomUUID(), tenant]);
    h = await health();
    check(h.JOURNEY_ORCHESTRATION.state === "DISABLED_BY_DEPENDENCY" && /Needs Marketing/.test(h.JOURNEY_ORCHESTRATION.issues[0].message), "enabled module whose requirement is off -> disabled by dependency");
    await q(`insert into "TenantModuleEntitlement" (id, "tenantId", "moduleKey", status) values ($1, $2, 'TELEPHONY', 'SUSPENDED')`, [randomUUID(), tenant]);
    await q(`insert into "TenantModuleAuditLog" (id, "tenantId", "moduleKey", action) values ($1, $2, 'TELEPHONY', 'TRIAL_EXPIRED')`, [randomUUID(), tenant]);
    h = await health();
    check(h.TELEPHONY.state === "TRIAL_EXPIRED", "suspended by trial expiry -> trial expired");

    // Snapshots, cross-tenant view and the worker's due-tenant query.
    const snapshot = await one(`select state, issues from "TenantModuleHealth" where "tenantId" = $1 and "moduleKey" = 'AUTOMATIONS'`, [tenant]);
    check(snapshot?.state === "WORKER_BACKLOG" && snapshot.issues[0].count === 2, "snapshot stored");
    const overview = await listModuleHealthAcrossTenants();
    check(overview.items.some((item) => item.tenantId === tenant && item.moduleKey === "AUTOMATIONS" && item.state === "WORKER_BACKLOG"), "cross-tenant view lists the problem");
    const due = (await tenantsDueForHealthCheck(100000)).map((row) => row.id);
    check(due.includes(other) && !due.includes(tenant), "worker picks never-checked tenants and skips freshly checked ones");

    console.log(JSON.stringify({ status: "passed", checks, rls: process.env.ENFORCE_TENANT_RLS === "true" }));
  } finally {
    for (const id of [tenant, other]) {
      await q(`delete from "Notification" where "tenantId" = $1 or data ->> 'tenantId' = $1`, [id]).catch(() => undefined);
      const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
      for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId" = $1`, [id]).catch(() => undefined);
      await q(`delete from "Tenant" where id = $1`, [id]);
    }
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
