/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: "../.env" });

const dataPath = path.resolve(process.env.SUPABASE_DATA_DUMP_PATH || path.join(__dirname, "..", "db-dumps", "supabase-data.sql"));
const databaseUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
const psqlCommand = process.env.PSQL_PATH || "psql";

if (!databaseUrl) throw new Error("Missing DIRECT_DATABASE_URL or DATABASE_URL");
if (!fs.existsSync(dataPath)) throw new Error(`Data dump not found: ${dataPath}`);

const version = spawnSync(psqlCommand, ["--version"], { encoding: "utf8" });
if (version.error) throw version.error;
const versionOutput = `${version.stdout || ""}${version.stderr || ""}`.trim();
if (versionOutput) console.log(`${psqlCommand}: ${versionOutput}`);

const result = spawnSync(
  psqlCommand,
  [
    databaseUrl,
    "--single-transaction",
    "--set",
    "ON_ERROR_STOP=1",
    "--command",
    "set session_replication_role = replica",
    "--file",
    dataPath,
    "--command",
    "set session_replication_role = origin",
  ],
  { stdio: "inherit" },
);

if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Local data import failed with exit code ${result.status}`);

console.log(`Imported local data from ${dataPath}`);
