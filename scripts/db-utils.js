/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: "../.env" });

const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "migrations");

function env(name, fallback) {
  return process.env[name] || fallback;
}

function directDatabaseUrl() {
  const url = env("DIRECT_DATABASE_URL", env("DATABASE_URL"));
  if (!url) throw new Error("Missing DIRECT_DATABASE_URL or DATABASE_URL");
  return url;
}

function adminDatabaseUrl() {
  const localAdminRole = process.env.USER || process.env.LOGNAME || "postgres";
  return env("LOCAL_POSTGRES_ADMIN_URL", `postgresql://${encodeURIComponent(localAdminRole)}@localhost:5432/postgres`);
}

function appDatabaseUrl() {
  return env("DATABASE_URL", "postgresql://crm_app:crm_app@localhost:5432/crm_dev");
}

function databaseNameFromUrl(url) {
  return new URL(url).pathname.replace(/^\//, "") || "postgres";
}

function roleNameFromUrl(url) {
  return new URL(url).username || "crm_app";
}

function passwordFromUrl(url) {
  return new URL(url).password || "crm_app";
}

function assertSafeIdentifier(identifier, label = "identifier") {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe ${label}: ${identifier}`);
  }
  return identifier;
}

function quoteIdentifier(identifier) {
  return `"${assertSafeIdentifier(identifier).replace(/"/g, '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function checksum(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function withClient(connectionString, fn) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function ensureMigrationTable(client) {
  await client.query(`
    create table if not exists "SchemaMigration" (
      "id" text primary key,
      "checksum" text not null,
      "status" text not null check ("status" in ('APPLIED', 'FAILED')),
      "appliedAt" timestamp without time zone not null default current_timestamp,
      "error" text
    )
  `);
}

function migrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => path.join(MIGRATIONS_DIR, file));
}

module.exports = {
  ROOT,
  MIGRATIONS_DIR,
  adminDatabaseUrl,
  appDatabaseUrl,
  directDatabaseUrl,
  databaseNameFromUrl,
  roleNameFromUrl,
  passwordFromUrl,
  quoteIdentifier,
  quoteLiteral,
  checksum,
  withClient,
  ensureMigrationTable,
  migrationFiles,
};
