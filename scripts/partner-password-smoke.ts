/**
 * Local-only real-database check that partner logins follow the workspace password rule like
 * every other account (Section 8 #8: they skipped it, so a partner login could have a
 * 6-character password):
 *   - creating a partner, or another login under one, with a password that breaks the rule is
 *     refused (PASSWORD_POLICY, with the rule's message) and creates no user;
 *   - a password that meets the rule still works.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/partner-password-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { createPartnerForTenant, createPartnerLoginForTenant } from "../src/lib/server/partners";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const refusedForPolicy = async (run: () => Promise<unknown>, label: string) => {
    await assert.rejects(run, (error: any) => error?.message === "PASSWORD_POLICY" && typeof error.userMessage === "string" && error.userMessage.length > 0, label);
    checks++;
  };
  const tenantId = randomUUID();
  const users = async () => Number((await q(`select count(*) from "User" where "tenantId" = $1`, [tenantId])).rows[0].count);
  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Partner password smoke', now())`, [tenantId]);
    const adminRole = randomUUID();
    const partnerRole = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke admin', $3, now())`, [adminRole, tenantId, { recordAccess: "ALL" }]);
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke partner', $3, now())`, [partnerRole, tenantId, { isPartnerRole: true }]);
    const adminId = randomUUID();
    await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke admin', 'x', $4, now())`, [adminId, tenantId, `admin.${adminId.slice(0, 8)}@smoke.invalid`, adminRole]);
    const admin = { id: adminId, tenantId, name: "Smoke admin", isTenantAdmin: true, role: { permissions: { recordAccess: "ALL" } } } as any;
    const tag = randomUUID().slice(0, 8);
    const partner = (password: string, suffix: string) => ({ name: "Smoke partner", email: `partner.${tag}.${suffix}@smoke.invalid`, password, roleId: partnerRole, legalBusinessName: "Smoke Partner Pvt Ltd" });

    const before = await users();
    await refusedForPolicy(() => createPartnerForTenant(admin, partner("short1", "weak")), "a partner with a 6-character password is refused");
    check((await users()) === before, "and no login is created");

    const strong = "Smoke!Partner-2026";
    const created: any = await createPartnerForTenant(admin, partner(strong, "ok"));
    check(created?.id, "a partner whose password meets the rule is created");

    await refusedForPolicy(() => createPartnerLoginForTenant(admin, created.id, { ...partner("short1", "login-weak"), partnerLoginRole: "MEMBER" }), "another login with a 6-character password is refused");
    const login: any = await createPartnerLoginForTenant(admin, created.id, { ...partner(strong, "login-ok"), partnerLoginRole: "MEMBER" });
    check(login?.id, "another login whose password meets the rule is created");

    console.log(`partner-password-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
