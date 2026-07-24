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
  const baseSchemaPath = process.env.BASE_SCHEMA_SQL_PATH;
  const files = migrationFiles();
  if (!baseSchemaPath) {
    const tenantTable = await client.query("select to_regclass('public.\"Tenant\"') as table_name");
    if (!tenantTable.rows[0]?.table_name) {
      throw new Error(
        "Base CRM schema is missing. Set BASE_SCHEMA_SQL_PATH to an executable Supabase schema dump before running migrations.",
      );
    }
    return;
  }
  const absolutePath = path.resolve(baseSchemaPath);
  if (!fs.existsSync(absolutePath)) throw new Error(`BASE_SCHEMA_SQL_PATH not found: ${absolutePath}`);
  const id = `base:${path.basename(absolutePath)}`;
  const hash = checksum(fs.readFileSync(absolutePath, "utf8"));
  const existing = await client.query('select "checksum", "status" from "SchemaMigration" where "id" = $1', [id]);
  if (existing.rowCount) {
    const row = existing.rows[0];
    if (row.checksum !== hash) throw new Error(`Base schema checksum changed: ${absolutePath}`);
    if (row.status === "APPLIED") {
      await baselineMigrations(client, files);
      return;
    }
  }

  const tenantTable = await client.query("select to_regclass('public.\"Tenant\"') as table_name");
  if (!tenantTable.rows[0]?.table_name) {
    await client.query("drop schema if exists public cascade");
  }
  await client.query("create schema if not exists auth");
  await client.query(`
    create or replace function auth.jwt()
    returns jsonb
    language sql
    stable
    as $$ select '{}'::jsonb $$
  `);

  runPsql(directDatabaseUrl(), absolutePath, "Base schema restore");
  await ensureMigrationTable(client);
  await client.query(
    'insert into "SchemaMigration" ("id", "checksum", "status") values ($1, $2, $3) on conflict ("id") do update set "checksum" = excluded."checksum", "status" = excluded."status", "appliedAt" = current_timestamp, "error" = null',
    [id, hash, "APPLIED"],
  );
  await baselineMigrations(client, files);
  console.log(`Applied base schema: ${absolutePath}`);
}

async function baselineMigrations(client, files) {
  for (const file of files) {
    const id = path.basename(file);
    const hash = checksum(fs.readFileSync(file, "utf8"));
    await client.query(
      'insert into "SchemaMigration" ("id", "checksum", "status") values ($1, $2, $3) on conflict ("id") do update set "checksum" = excluded."checksum", "status" = excluded."status", "appliedAt" = current_timestamp, "error" = null',
      [id, hash, "APPLIED"],
    );
  }
  if (files.length) console.log(`Baselined ${files.length} migration files from base schema.`);
}

async function grantAppRolePrivileges(client) {
  const appRole = roleNameFromUrl(appDatabaseUrl());
  const quotedRole = quoteIdentifier(appRole);
  await client.query(`alter role ${quotedRole} with bypassrls`);
  await client.query(`grant all on schema public to ${quotedRole}`);
  await client.query(`alter schema public owner to ${quotedRole}`);
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

async function main() {
  await withClient(directDatabaseUrl(), async (client) => {
    await client.query("create schema if not exists public");
    await ensureMigrationTable(client);
    await applyOptionalBaseSchema(client);
    const files = migrationFiles();
    for (const file of files) {
      await applyMigration(client, file);
    }
    await grantAppRolePrivileges(client);
    console.log(`Migration complete. Checked ${files.length} migration files.`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
