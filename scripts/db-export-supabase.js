/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const dns = require("dns/promises");
const { spawnSync } = require("child_process");
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: "../.env" });

const ROOT = path.resolve(__dirname, "..");
const dumpDir = path.join(ROOT, "db-dumps");
const schemaPath = process.env.SUPABASE_SCHEMA_DUMP_PATH || path.join(dumpDir, "supabase-schema.sql");
const dataPath = process.env.SUPABASE_DATA_DUMP_PATH || path.join(dumpDir, "supabase-data.sql");
const sourceUrl = process.env.SUPABASE_DATABASE_URL || process.env.SUPABASE_DB_URL;
const pgDumpCommand = process.env.PG_DUMP_PATH || "pg_dump";

function normalizeConnectionUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.protocol.startsWith("postgres")) return rawUrl;
    const username = parsed.username ? encodeURIComponent(decodeURIComponent(parsed.username)) : "";
    const password = parsed.password ? `:${encodeURIComponent(decodeURIComponent(parsed.password))}` : "";
    const auth = username ? `${username}${password}@` : "";
    return `${parsed.protocol}//${auth}${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return rawUrl;
  }
}

function parseConnectionUrl(rawUrl) {
  try {
    const parsed = new URL(normalizeConnectionUrl(rawUrl));
    if (!parsed.protocol.startsWith("postgres")) {
      throw new Error("connection string must start with postgresql:// or postgres://");
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid connection string";
    throw new Error(`Invalid SUPABASE_DATABASE_URL: ${message}`);
  }
}

async function assertHostResolves(hostname) {
  try {
    await dns.lookup(hostname);
  } catch (error) {
    const message = error instanceof Error ? error.message : "DNS lookup failed";
    throw new Error(
      [
        `Cannot resolve Supabase database host: ${hostname}`,
        `DNS error: ${message}`,
        "Check SUPABASE_DATABASE_URL in .env.",
        "Use Supabase Dashboard -> Project Settings -> Database -> Connection string.",
        "If the direct host db.<project-ref>.supabase.co does not resolve from your network, use the session pooler connection string instead.",
      ].join("\n")
    );
  }
}

function run(command, args, label) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}

function printToolVersion(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  if (result.error) throw result.error;
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (output) console.log(`${command}: ${output}`);
}

async function main() {
  if (!sourceUrl) {
    throw new Error("Missing SUPABASE_DATABASE_URL. Use the Supabase project's direct Postgres connection string, not the REST URL.");
  }

  fs.mkdirSync(dumpDir, { recursive: true });
  const normalizedSourceUrl = normalizeConnectionUrl(sourceUrl);
  const parsedSourceUrl = parseConnectionUrl(sourceUrl);
  await assertHostResolves(parsedSourceUrl.hostname);
  printToolVersion(pgDumpCommand);

  run(pgDumpCommand, [
    normalizedSourceUrl,
    "--schema=public",
    "--schema-only",
    "--no-owner",
    "--no-privileges",
    "--file",
    schemaPath,
  ], "Supabase schema export");

  run(pgDumpCommand, [
    normalizedSourceUrl,
    "--schema=public",
    "--data-only",
    "--no-owner",
    "--no-privileges",
    "--inserts",
    "--file",
    dataPath,
  ], "Supabase data export");

  console.log(`Schema exported to ${schemaPath}`);
  console.log(`Data exported to ${dataPath}`);
  console.log("Next local step: BASE_SCHEMA_SQL_PATH=<schema dump> npm run db:migrate:local");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
