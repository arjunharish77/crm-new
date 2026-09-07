#!/usr/bin/env node
/* eslint-disable no-console */
// Pre-deploy gate: verifies the target database already has every local migration file
// applied, with a matching checksum, before deploying app code that assumes that schema.
// Exits non-zero (and never mutates anything) so it's safe to wire into a deploy pipeline
// as a blocking check, distinct from db-migrate-local.js which actually applies migrations.
const fs = require("fs");
const path = require("path");
const {
  directDatabaseUrl,
  checksum,
  withClient,
  ensureMigrationTable,
  migrationFiles,
} = require("./db-utils");

async function main() {
  const files = migrationFiles();
  const problems = [];

  await withClient(directDatabaseUrl(), async (client) => {
    await ensureMigrationTable(client);
    const { rows } = await client.query('select "id", "checksum", "status" from "SchemaMigration"');
    const rowById = new Map(rows.map((row) => [row.id, row]));

    for (const filePath of files) {
      const id = path.basename(filePath);
      const row = rowById.get(id);
      if (!row) {
        problems.push(`PENDING: ${id} has not been applied to this database`);
        continue;
      }
      if (row.status === "FAILED") {
        problems.push(`FAILED: ${id} previously failed to apply (${row.error || "no error recorded"})`);
        continue;
      }
      const hash = checksum(fs.readFileSync(filePath, "utf8"));
      if (row.checksum !== hash) {
        problems.push(`DRIFT: ${id} was applied but its content has since changed locally`);
      }
    }
  });

  if (problems.length) {
    console.error(`Migration compatibility check failed (${problems.length} issue(s)):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error("\nRun the migration script against this database before deploying.");
    process.exit(1);
  }

  console.log(`Migration compatibility check passed. ${files.length} migration file(s) all applied and unmodified.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
