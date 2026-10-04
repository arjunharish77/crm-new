// CI database seed (round-2 plan T1): a fresh, migrated database gets a platform admin, one
// demo workspace created through the real provisioning code (default statuses, modules and
// opportunity type) and the demo data from seed-demo-test-data.js, so the smoke tests and the API
// regression have something to work against. Prints the ids; the passwords are CI-only.
//
//   npx tsx scripts/ci-seed.ts
import { createRequire } from "module";
import { spawnSync } from "child_process";
import { getPool } from "@/lib/db/pool";
import { bootstrapPlatformAdmin, createTenantWithAdmin } from "@/lib/repositories/auth-admin-postgres";

createRequire(import.meta.url)("./db-utils.js");

const PASSWORD = "CiOnly-Passw0rd!";

async function main() {
  const pool = getPool();
  const existing = await pool.query(`select id from "Tenant" where name = 'CI Demo University' limit 1`);
  let tenantId: string;
  let userId: string;
  if (existing.rows[0]) {
    tenantId = existing.rows[0].id;
    userId = (await pool.query(`select id from "User" where "tenantId" = $1 order by "createdAt" limit 1`, [tenantId])).rows[0].id;
  } else {
    const platform = await pool.query(`select 1 from "PlatformAdmin" where "isActive" = true limit 1`);
    if (!platform.rowCount) await bootstrapPlatformAdmin({ name: "CI Platform Admin", email: "ci-platform@example.invalid", password: PASSWORD });
    ({ tenantId, userId } = await createTenantWithAdmin({ name: "CI Demo University", plan: "ENTERPRISE", adminName: "CI Admin", adminEmail: "admintest@test.com", adminPassword: PASSWORD }));
  }
  const seed = spawnSync("node", ["scripts/db-seed-local.js"], {
    env: { ...process.env, DEMO_TENANT_ID: tenantId, DEMO_ADMIN_USER_ID: userId, DEMO_LEAD_COUNT: process.env.DEMO_LEAD_COUNT || "200" },
    stdio: "inherit",
  });
  if (seed.status !== 0) throw new Error(`Demo seed failed (exit ${seed.status})`);
  console.log(JSON.stringify({ tenantId, adminUserId: userId }));
  // In GitHub Actions, later steps (the API regression) read these.
  if (process.env.GITHUB_ENV) {
    const { appendFileSync } = await import("fs");
    appendFileSync(process.env.GITHUB_ENV, `API_SMOKE_TENANT_ID=${tenantId}\nAPI_SMOKE_USER_ID=${userId}\n`);
  }
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
