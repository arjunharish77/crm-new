/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  appDatabaseUrl,
  directDatabaseUrl,
  roleNameFromUrl,
  quoteIdentifier,
  checksum,
  withClient,
  ensureMigrationTable,
  migrationFiles,
} = require("./db-utils");

const psqlCommand = process.env.PSQL_PATH || "psql";

function runPsql(databaseUrl, filePath, label) {
  const result = spawnSync(psqlCommand, [databaseUrl, "--single-transaction", "--set", "ON_ERROR_STOP=1", "--file", filePath], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}

async function applyOptionalBaseSchema(client) {
  const tenantTable = await client.query("select to_regclass('public.\"Tenant\"') as table_name");
  // An existing installation must run pending migrations, never re-baseline them.
  if (tenantTable.rows[0]?.table_name) return;
  const baseSchemaPath = process.env.BASE_SCHEMA_SQL_PATH;
  if (!baseSchemaPath) throw new Error("Base CRM schema is missing. Set BASE_SCHEMA_SQL_PATH for a fresh installation.");
  const absolutePath = path.resolve(baseSchemaPath);
  const manifestPath = `${absolutePath}.manifest.json`;
  if (!fs.existsSync(manifestPath)) throw new Error(`Verified bootstrap manifest is required: ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const hash = checksum(fs.readFileSync(absolutePath, "utf8"));
  if (manifest.schemaChecksum !== hash) throw new Error("Bootstrap schema does not match its manifest");
  const files = new Map(migrationFiles().map((file) => [path.basename(file), file]));
  for (const entry of manifest.migrations) {
    if (!files.has(entry.id) || checksum(fs.readFileSync(files.get(entry.id), "utf8")) !== entry.checksum) {
      throw new Error(`Bootstrap migration does not match its manifest: ${entry.id}`);
    }
  }
  const objects = await client.query(`select tablename from pg_tables where schemaname = 'public' and tablename <> 'SchemaMigration'`);
  if (objects.rowCount) throw new Error("Refusing bootstrap into a non-empty database without Tenant; inspect and restore manually");
  await client.query("drop schema if exists public cascade");
  await client.query("create schema if not exists auth");
  await client.query(`create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$`);
  runPsql(directDatabaseUrl(), absolutePath, "Base schema restore");
  await ensureMigrationTable(client);
  await client.query('insert into "SchemaMigration" (id, checksum, status) values ($1, $2, $3)', [`base:${path.basename(absolutePath)}`, hash, "APPLIED"]);
  // This frozen manifest covers only migrations already contained in this dump.
  for (const entry of manifest.migrations) {
    await client.query('insert into "SchemaMigration" (id, checksum, status) values ($1, $2, $3)', [entry.id, entry.checksum, "APPLIED"]);
  }
  console.log(`Restored bootstrap schema with ${manifest.migrations.length} historical migrations; newer migrations will run normally.`);
}

async function grantAppRolePrivileges(client, upgradeOnly = false) {
  const appRole = roleNameFromUrl(appDatabaseUrl());
  const quotedRole = quoteIdentifier(appRole);
  if (!upgradeOnly) await client.query(`alter role ${quotedRole} with bypassrls`);
  await client.query(`grant all on schema public to ${quotedRole}`);
  if (!upgradeOnly) await client.query(`alter schema public owner to ${quotedRole}`);
  await client.query(`grant select, insert, update, delete on all tables in schema public to ${quotedRole}`);
  await client.query(`grant usage, select, update on all sequences in schema public to ${quotedRole}`);
  await client.query(`alter default privileges in schema public grant select, insert, update, delete on tables to ${quotedRole}`);
  await client.query(`alter default privileges in schema public grant usage, select, update on sequences to ${quotedRole}`);
}

async function applyMigration(client, filePath) {
  const id = path.basename(filePath);
  const sql = fs.readFileSync(filePath, "utf8");
  const hash = checksum(sql);
  const existing = await client.query('select "checksum", "status" from "SchemaMigration" where "id" = $1', [id]);

  if (existing.rowCount) {
    const row = existing.rows[0];
    if (row.status === "APPLIED") {
      if (row.checksum !== hash) throw new Error(`Migration checksum changed after apply: ${id}`);
      console.log(`Skipped ${id}`);
      return;
    }
  }

  try {
    await client.query("begin");
    await client.query(sql);
    await client.query(
      'insert into "SchemaMigration" ("id", "checksum", "status") values ($1, $2, $3) on conflict ("id") do update set "checksum" = excluded."checksum", "status" = excluded."status", "appliedAt" = current_timestamp, "error" = null',
      [id, hash, "APPLIED"],
    );
    await client.query("commit");
    console.log(`Applied ${id}`);
  } catch (error) {
    await client.query("rollback");
    await client.query(
      'insert into "SchemaMigration" ("id", "checksum", "status", "error") values ($1, $2, $3, $4) on conflict ("id") do update set "checksum" = excluded."checksum", "status" = excluded."status", "appliedAt" = current_timestamp, "error" = excluded."error"',
      [id, hash, "FAILED", error.message],
    );
    throw error;
  }
}

// The pre-2026-09 runner re-baselined every migration file as APPLIED, without running it,
// whenever BASE_SCHEMA_SQL_PATH was set -- which the VPS .env always sets. The bootstrap dump
// genuinely contains 0001-0019 (see base-schema.sql.manifest.json), but 0020-0023 were added
// after it and so exist in the production ledger as APPLIED while their tables/columns were
// never created. Each entry below names a migration and a probe for the object it creates;
// the repair only re-runs a migration when the ledger claims APPLIED, the checksum matches the
// file exactly, and the probe proves the object is absent. On any correctly-migrated or fresh
// database every probe finds its object and nothing happens.
const BASELINE_REPAIRS = [
  { id: "0020_advanced_predictive_scoring.sql", probe: `select to_regclass('public."ScoringFeatureCatalog"') is not null as present` },
  { id: "0021_marketing_communications.sql", probe: `select to_regclass('public."MarketingCampaign"') is not null as present` },
  {
    id: "0022_form_submission_opportunity_link.sql",
    probe: `select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'FormSubmission' and column_name = 'opportunityId') as present`,
  },
  { id: "0023_external_integrations.sql", probe: `select to_regclass('public."ExternalIntegration"') is not null as present` },
];

async function repairBaselinedMigrations(client) {
  const files = new Map(migrationFiles().map((file) => [path.basename(file), file]));
  for (const repair of BASELINE_REPAIRS) {
    const filePath = files.get(repair.id);
    if (!filePath) continue;
    const ledger = await client.query('select "checksum", "status" from "SchemaMigration" where "id" = $1', [repair.id]);
    if (!ledger.rowCount || ledger.rows[0].status !== "APPLIED") continue; // normal apply path handles it
    const probe = await client.query(repair.probe);
    if (probe.rows[0]?.present) continue;
    const sql = fs.readFileSync(filePath, "utf8");
    if (ledger.rows[0].checksum !== checksum(sql)) {
      throw new Error(`Cannot repair ${repair.id}: ledger checksum differs from the migration file`);
    }
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query('update "SchemaMigration" set "appliedAt" = current_timestamp, "error" = null where "id" = $1', [repair.id]);
      await client.query("commit");
      console.log(`Repaired ${repair.id} (ledger said APPLIED but its objects were missing; migration executed now)`);
    } catch (error) {
      await client.query("rollback");
      throw new Error(`Repair of ${repair.id} failed; nothing from it was committed: ${error.message}`);
    }
  }
}

// Fixed, app-specific advisory lock key -- prevents two concurrent migration runs (e.g. a
// deploy script and a developer running this locally at the same time) from racing each
// other mid-migration. Distinct from the per-rule keys distribution-engine.ts computes
// dynamically for assignment locking, so there's no collision risk between the two uses.
const MIGRATION_LOCK_KEY = 72727001;

async function main() {
  await withClient(directDatabaseUrl(), async (client) => {
    const lock = await client.query("select pg_try_advisory_lock($1) as acquired", [MIGRATION_LOCK_KEY]);
    if (!lock.rows[0]?.acquired) {
      throw new Error("Another migration run holds the lock (pg_try_advisory_lock failed) -- refusing to run concurrently.");
    }
    try {
      const upgradeOnly = process.argv.includes("--upgrade");
      if (upgradeOnly) {
        const existing = await client.query(`select to_regclass('public."Tenant"') as tenant, to_regclass('public."SchemaMigration"') as ledger`);
        if (!existing.rows[0]?.tenant || !existing.rows[0]?.ledger) throw new Error("Upgrade requires an existing CRM database and migration ledger; bootstrap will not run");
      } else {
        await client.query("create schema if not exists public");
        await ensureMigrationTable(client);
        await applyOptionalBaseSchema(client);
      }
      // Must run before any pending migration: 0024+ were written against a schema that
      // already had 0020-0023's objects.
      await repairBaselinedMigrations(client);
      const files = migrationFiles();
      for (const file of files) {
        await applyMigration(client, file);
      }
      await grantAppRolePrivileges(client, upgradeOnly);
      console.log(`Migration complete. Checked ${files.length} migration files.`);
    } finally {
      await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
