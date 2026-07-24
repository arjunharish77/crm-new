/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const {
  ROOT,
  adminDatabaseUrl,
  appDatabaseUrl,
  directDatabaseUrl,
  databaseNameFromUrl,
  roleNameFromUrl,
  passwordFromUrl,
  quoteIdentifier,
  quoteLiteral,
  withClient,
  ensureMigrationTable,
} = require("./db-utils");

async function main() {
  const appUrl = appDatabaseUrl();
  const directUrl = directDatabaseUrl();
  const databaseName = databaseNameFromUrl(appUrl);
  const appRole = roleNameFromUrl(appUrl);
  const appPassword = passwordFromUrl(appUrl);
  const storageRoot = process.env.FILE_STORAGE_ROOT || path.join(ROOT, "storage");

  await withClient(adminDatabaseUrl(), async (client) => {
    const db = await client.query("select 1 from pg_database where datname = $1", [databaseName]);
    if (!db.rowCount) {
      await client.query(`create database ${quoteIdentifier(databaseName)}`);
      console.log(`Created database ${databaseName}`);
    } else {
      console.log(`Database ${databaseName} already exists`);
    }

    const role = await client.query("select 1 from pg_roles where rolname = $1", [appRole]);
    if (!role.rowCount) {
      await client.query(`create role ${quoteIdentifier(appRole)} login password ${quoteLiteral(appPassword)}`);
      console.log(`Created role ${appRole}`);
    } else {
      console.log(`Role ${appRole} already exists`);
    }
    await client.query(`alter role ${quoteIdentifier(appRole)} with login password ${quoteLiteral(appPassword)} bypassrls`);
    console.log(`Role ${appRole} password/login/RLS bypass settings synchronized`);
  });

  await withClient(directUrl, async (client) => {
    await client.query(`grant all on schema public to ${quoteIdentifier(appRole)}`);
    await client.query(`alter schema public owner to ${quoteIdentifier(appRole)}`);
    await ensureMigrationTable(client);
    await client.query(`grant select, insert, update, delete on all tables in schema public to ${quoteIdentifier(appRole)}`);
    await client.query(`alter default privileges in schema public grant select, insert, update, delete on tables to ${quoteIdentifier(appRole)}`);
  });

  fs.mkdirSync(storageRoot, { recursive: true });
  console.log(`Storage root ready: ${storageRoot}`);
  console.log("Local Postgres setup complete. Next: npm run db:migrate:local");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
