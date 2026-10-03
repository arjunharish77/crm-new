/**
 * Local-only real-database check for form saves (UI/UX plan B5): the builder and the CRM placement
 * tab each save only their own part of the form config.
 *   - a save replaces only the config keys it sends; every other stored key is kept;
 *   - a save without any config (for example only isActive) leaves the stored config untouched;
 *   - a save carrying an out-of-date `expectedUpdatedAt` is refused and changes nothing;
 *   - two editors saving one after the other, each with the version it last saw, both land.
 * Temporary tenant, removed afterwards. Platform-admin actor so the Forms module check passes.
 * Run: tsx scripts/form-save-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { createFormForTenant, getFormForTenant, updateFormForTenant } from "../src/lib/repositories/forms-postgres";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };

  const tenantId = randomUUID();
  const user = { id: randomUUID(), tenantId, isPlatformAdmin: true };
  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Form save smoke', now())`, [tenantId]);
    const created: any = await createFormForTenant(user as any, { name: "Smoke form" });
    const opened: any = await updateFormForTenant(user as any, created.id, {
      config: {
        fields: [{ id: "f1", type: "TEXT", label: "Name" }],
        customCss: ".a{}",
        layoutColumns: 1,
        placements: ["LEAD_DETAIL"],
        placementRules: [{ placement: "LEAD_DETAIL", enabled: true }],
      },
    });

    // Builder and placement tab both opened this version.
    const builderVersion = opened.updatedAt;
    const placementVersion = opened.updatedAt;

    const afterBuilder: any = await updateFormForTenant(user as any, created.id, {
      config: { fields: [{ id: "f1", type: "TEXT", label: "Full name" }], layoutColumns: 2 },
      expectedUpdatedAt: builderVersion,
    });
    check(afterBuilder.config.fields[0].label === "Full name" && afterBuilder.config.layoutColumns === 2, "builder save applied");
    check(afterBuilder.config.customCss === ".a{}" && afterBuilder.config.placements[0] === "LEAD_DETAIL", "keys the builder didn't send are kept");

    await assert.rejects(
      () => updateFormForTenant(user as any, created.id, { config: { placements: [] }, expectedUpdatedAt: placementVersion }),
      (error: any) => error?.message === "FORM_VERSION_CONFLICT",
    );
    checks++;
    const unchanged: any = await getFormForTenant(user as any, created.id);
    check(unchanged.config.placements[0] === "LEAD_DETAIL" && unchanged.config.fields[0].label === "Full name", "a refused save changes nothing");

    // The placement tab takes in the builder's version and saves only its own keys.
    const afterPlacement: any = await updateFormForTenant(user as any, created.id, {
      config: { placements: ["LEAD_DETAIL", "OPPORTUNITY_DETAIL"] },
      expectedUpdatedAt: afterBuilder.updatedAt,
    });
    check(afterPlacement.config.placements.length === 2, "placement save applied");
    check(afterPlacement.config.fields[0].label === "Full name" && afterPlacement.config.layoutColumns === 2, "the builder's earlier save survives the placement save");

    const toggled: any = await updateFormForTenant(user as any, created.id, { isActive: false });
    check(toggled.isActive === false, "status-only save applied");
    check(toggled.config.placements.length === 2 && toggled.config.customCss === ".a{}" && toggled.config.layoutColumns === 2, "a save without config leaves the stored config untouched");

    await assert.rejects(
      () => updateFormForTenant(user as any, randomUUID(), { name: "x" }),
      (error: any) => error?.message === "FORM_NOT_FOUND",
    );
    checks++;

    console.log(`form-save-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 4; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId" = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
