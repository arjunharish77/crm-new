/**
 * Local-only real-database check for per-tenant usage limits (Module 21): seats (create,
 * reactivate, internal<->partner role change, concurrent creates), storage, monthly messages
 * (atomic under concurrency, uncounted sources, end-to-end outbox suppression), 80%/100% notices,
 * and "unlimited until set". One temporary tenant, removed afterwards.
 * Run: tsx scripts/usage-limits-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { createTenantScopedUser, updateTenantScopedUser } from "../src/lib/repositories/auth-admin-postgres";
import { assertStorageAvailable, getTenantUsage, reserveMonthlyMessage, setTenantUsageLimits, UsageLimitError } from "../src/lib/server/usage-limits";
import { queueCommunicationForTenant } from "../src/lib/server/communications";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  const one = async (sql: string, args: unknown[] = []) => (await q(sql, args)).rows[0];
  const tenant = randomUUID();
  const [adminRole, partnerRole] = [randomUUID(), randomUUID()];
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const refused = async (promise: Promise<unknown>, metric: string, label: string) => {
    await assert.rejects(promise, (error: unknown) => error instanceof UsageLimitError && error.metric === metric, label);
    checks++;
  };
  const actor = { id: (await one(`select id from "User" order by "createdAt" limit 1`)).id as string };
  const newUser = (roleId: string) => createTenantScopedUser(tenant, { name: "Smoke user", email: `u-${randomUUID()}@example.invalid`, password: "Sm0ke-Passw0rd!", roleId } as never) as Promise<{ id: string }>;
  const notices = async (event: string, metric: string) => (await one(`select count(*)::int as n from "Notification" where "tenantId" = $1 and data ->> 'event' = $2 and data ->> 'metric' = $3`, [tenant, event, metric])).n;

  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Usage limits smoke', now())`, [tenant]);
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $3, 'Smoke admin', '{"modules":{"admin":"full"}}', now()), ($2, $3, 'Smoke partner', '{"isPartnerRole":true}', now())`, [adminRole, partnerRole, tenant]);

    // Unlimited until set: no row, anything goes, messages still counted for display.
    const first = await newUser(adminRole);
    check(await reserveMonthlyMessage(tenant, "USER"), "unlimited tenant can send");
    check((await getTenantUsage(tenant)).used.MONTHLY_MESSAGES === 1, "usage counted even when unlimited");

    // --- Seats.
    await setTenantUsageLimits(actor, tenant, { maxActiveUsers: 3, maxPartnerLogins: 1, maxStorageMb: 1, maxMonthlyMessages: 4 });
    const second = await newUser(adminRole);
    await newUser(adminRole);
    await refused(newUser(adminRole), "ACTIVE_USERS", "4th active user refused at a limit of 3");
    check((await notices("USAGE_LIMIT_WARNING", "ACTIVE_USERS")) >= 1 && (await notices("USAGE_LIMIT_REACHED", "ACTIVE_USERS")) >= 1, "80% and 100% seat notices sent to the tenant admin");
    await updateTenantScopedUser(tenant, second.id, { status: "INACTIVE" } as never);
    const replacement = await newUser(adminRole);
    await refused(updateTenantScopedUser(tenant, second.id, { status: "ACTIVE" } as never), "ACTIVE_USERS", "reactivation refused while at the limit");
    await updateTenantScopedUser(tenant, first.id, { name: "Renamed" } as never);
    checks++; // unrelated edits of existing users still work at the limit
    const partner = await newUser(partnerRole);
    await refused(newUser(partnerRole), "PARTNER_LOGINS", "2nd partner login refused at a limit of 1");
    await refused(updateTenantScopedUser(tenant, replacement.id, { roleId: partnerRole } as never), "PARTNER_LOGINS", "moving an internal user onto a partner role needs a partner seat");
    await updateTenantScopedUser(tenant, partner.id, { roleId: partnerRole } as never);
    checks++; // same kind of role: no new seat consumed

    // Concurrency: 6 simultaneous creates with exactly one seat left -> exactly one succeeds.
    await updateTenantScopedUser(tenant, replacement.id, { status: "INACTIVE" } as never);
    const race = await Promise.allSettled(Array.from({ length: 6 }, () => newUser(adminRole)));
    check(race.filter((r) => r.status === "fulfilled").length === 1, "concurrent creates cannot exceed the seat limit");
    check((await getTenantUsage(tenant)).used.ACTIVE_USERS === 3, "active users exactly at the limit");

    // --- Storage (1 MB).
    await q(`insert into "FileObject" (id, "tenantId", "storageDriver", bucket, "storageKey", "originalFilename", "byteSize", "createdAt", "updatedAt") values ($1, $2, 'local', 'smoke', $3, 'a.bin', $4, now(), now())`, [randomUUID(), tenant, `smoke/${randomUUID()}`, 900 * 1024]);
    await assertStorageAvailable(tenant, 50 * 1024);
    checks++;
    await refused(assertStorageAvailable(tenant, 200 * 1024), "STORAGE", "upload past 1 MB refused");
    check((await notices("USAGE_LIMIT_WARNING", "STORAGE")) >= 1, "80% storage notice sent");

    // --- Monthly messages (limit 4; 1 already used this month).
    const results: boolean[] = [];
    for (let i = 0; i < 3; i++) results.push(await reserveMonthlyMessage(tenant, "MARKETING_CAMPAIGN"));
    check(results.every(Boolean), "up to the limit is allowed");
    check(!(await reserveMonthlyMessage(tenant, "AUTOMATION")), "over the limit is refused");
    check(await reserveMonthlyMessage(tenant, "REPORT_SCHEDULE"), "uncounted (system) sources are never refused");
    // Once per period: one alert row, and no admin notified twice (each tenant admin gets one).
    const alertRows = (await one(`select count(*)::int as n from "TenantUsageAlert" where "tenantId" = $1 and metric = 'MONTHLY_MESSAGES' and level = 100`, [tenant])).n;
    const perAdmin = (await one(`select coalesce(max(n), 0)::int as n from (select count(*) as n from "Notification" where "tenantId" = $1 and data ->> 'event' = 'USAGE_LIMIT_REACHED' and data ->> 'metric' = 'MONTHLY_MESSAGES' group by "userId") x`, [tenant])).n;
    check(alertRows === 1 && perAdmin === 1, `100% message notice sent once per admin (alerts ${alertRows}, max per admin ${perAdmin})`);
    const outbox = await queueCommunicationForTenant({ id: first.id, tenantId: tenant } as never, { channel: "EMAIL", recipient: "someone@example.invalid", subject: "Hi", body: "Hello", sourceType: "USER" } as never);
    check((outbox as { status: string }).status === "SUPPRESSED", "a send over the limit is recorded as SUPPRESSED");
    const event = await one(`select "eventType", "providerPayload" from "CommunicationDeliveryEvent" where "outboxId" = $1 order by "createdAt" desc limit 1`, [(outbox as { id: string }).id]);
    check(event?.eventType === "SUPPRESSED" && event?.providerPayload?.reason === "MONTHLY_MESSAGE_LIMIT_REACHED", `recorded with the limit as the reason (got ${JSON.stringify(event)})`);

    // Concurrency: raise to 20 and fire 30 reservations at once -> exactly 16 more succeed.
    await setTenantUsageLimits(actor, tenant, { maxActiveUsers: 3, maxPartnerLogins: 1, maxStorageMb: 1, maxMonthlyMessages: 20 });
    const burst = await Promise.all(Array.from({ length: 30 }, () => reserveMonthlyMessage(tenant, "MARKETING_CAMPAIGN")));
    check(burst.filter(Boolean).length === 16 && (await getTenantUsage(tenant)).used.MONTHLY_MESSAGES === 20, "concurrent sends stop exactly at the limit");

    // Removing a limit (back to unlimited) lets usage continue immediately.
    await setTenantUsageLimits(actor, tenant, { maxActiveUsers: null, maxPartnerLogins: null, maxStorageMb: null, maxMonthlyMessages: null });
    await newUser(adminRole);
    check(await reserveMonthlyMessage(tenant, "USER"), "unlimited again after clearing limits");

    console.log(JSON.stringify({ status: "passed", checks }));
  } finally {
    await q(`delete from "Notification" where "tenantId" = $1 or data ->> 'tenantId' = $1`, [tenant]).catch(() => undefined);
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId" = $1`, [tenant]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenant]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
