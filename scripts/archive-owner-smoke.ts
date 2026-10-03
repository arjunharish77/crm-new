/**
 * Local-only real-database check that only a form's or automation's creator, or an admin, can
 * archive, restore or delete it for good (decided 2026-10-03):
 *   - new forms and automations record who created them;
 *   - the creator can archive and restore; someone else (not an admin) can't do either;
 *   - an admin can, including delete for good;
 *   - an item with no recorded creator (made before this was tracked) is admin-only.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/archive-owner-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { archiveFormForTenant, createFormForTenant, restoreFormForTenant } from "../src/lib/repositories/forms-postgres";
import { archiveAutomationForTenant, createAutomationForTenant, deleteAutomationForTenant, restoreAutomationForTenant } from "../src/lib/repositories/automations-postgres";

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
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Archive owner smoke', now())`, [tenantId]);
    const roles: Record<string, string> = { OWN: randomUUID(), ALL: randomUUID() };
    for (const [recordAccess, id] of Object.entries(roles)) {
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, $3, $4, now())`, [id, tenantId, `Smoke ${recordAccess}`, { recordAccess }]);
    }
    const person = async (admin: boolean) => {
      const id = randomUUID();
      const recordAccess = admin ? "ALL" : "OWN";
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [id, tenantId, `owner.${id.slice(0, 8)}@smoke.invalid`, roles[recordAccess]]);
      return { id, tenantId, isTenantAdmin: admin, role: { permissions: { recordAccess } } } as any;
    };
    const creator = await person(false);
    const colleague = await person(false);
    const admin = await person(true);

    const form: any = await createFormForTenant(creator, { name: "Creator's form" });
    check(form.createdBy === creator.id, "a new form records its creator");
    await rejects(() => archiveFormForTenant(colleague, form.id), "ITEM_OWNER_OR_ADMIN", "someone else can't archive the form");
    await archiveFormForTenant(creator, form.id);
    await rejects(() => restoreFormForTenant(colleague, form.id), "ITEM_OWNER_OR_ADMIN", "or restore it");
    await restoreFormForTenant(creator, form.id);
    check((await q(`select "deletedAt" from "Form" where id = $1`, [form.id])).rows[0].deletedAt === null, "the creator can archive and restore it");

    const automation: any = await createAutomationForTenant(creator, { name: "Creator's automation", trigger: { type: "MANUAL" } });
    check(automation.createdBy === creator.id, "a new automation records its creator");
    await rejects(() => archiveAutomationForTenant(colleague, automation.id), "ITEM_OWNER_OR_ADMIN", "someone else can't archive the automation");
    await archiveAutomationForTenant(admin, automation.id);
    await rejects(() => deleteAutomationForTenant(colleague, automation.id), "ITEM_OWNER_OR_ADMIN", "or delete it for good");
    await deleteAutomationForTenant(admin, automation.id);
    check((await q(`select 1 from "AutomationV2" where id = $1`, [automation.id])).rowCount === 0, "an admin can archive and delete it for good");

    const legacy: any = await createAutomationForTenant(creator, { name: "Older automation", trigger: { type: "MANUAL" } });
    await q(`update "AutomationV2" set "createdBy" = null where id = $1`, [legacy.id]);
    await rejects(() => archiveAutomationForTenant(creator, legacy.id), "ITEM_OWNER_OR_ADMIN", "an item with no recorded creator is admin-only");
    await archiveAutomationForTenant(admin, legacy.id);
    await restoreAutomationForTenant(admin, legacy.id);
    checks++; // the admin can

    console.log(`archive-owner-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
