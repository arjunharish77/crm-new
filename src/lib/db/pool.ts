import { Pool, type PoolClient, type QueryResultRow } from "pg";

type GlobalWithPgPool = typeof globalThis & {
  __crmPgPool?: Pool;
  __crmRealtimePgPool?: Pool;
  __crmTenantPgPool?: Pool;
};

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing env var: DATABASE_URL");
  return url;
}

// WP07 (F04): the restricted, non-owner, non-bypassrls runtime role's connection string. Falls
// back to DATABASE_URL (today's "crm_app", which owns the schema and has bypassrls) when unset,
// so an environment that hasn't provisioned the new role (see scripts/db-setup-tenant-role-local.js)
// gets byte-identical behavior to before this change -- this is what keeps the whole mechanism
// opt-in/staging-only with no production credential change bundled in.
function getTenantDatabaseUrl() {
  return process.env.TENANT_DATABASE_URL || getDatabaseUrl();
}

function shouldUseSsl() {
  return process.env.DATABASE_SSL === "true";
}

function createPool() {
  return new Pool({
    connectionString: getDatabaseUrl(),
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
    statement_timeout: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS || 30000),
    ssl: shouldUseSsl() ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
  });
}

function createTenantPool() {
  return new Pool({
    connectionString: getTenantDatabaseUrl(),
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
    statement_timeout: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS || 30000),
    ssl: shouldUseSsl() ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
  });
}

function createRealtimePool() {
  return new Pool({
    connectionString: getDatabaseUrl(),
    max: Number(process.env.DATABASE_REALTIME_POOL_MAX || 3),
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
    statement_timeout: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS || 30000),
    ssl: shouldUseSsl() ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
  });
}

export function getPool() {
  const globalForPool = globalThis as GlobalWithPgPool;
  if (process.env.NODE_ENV === "production") return globalForPool.__crmPgPool ?? (globalForPool.__crmPgPool = createPool());
  if (!globalForPool.__crmPgPool) globalForPool.__crmPgPool = createPool();
  return globalForPool.__crmPgPool;
}

export function getRealtimePool() {
  const globalForPool = globalThis as GlobalWithPgPool;
  if (!globalForPool.__crmRealtimePgPool) globalForPool.__crmRealtimePgPool = createRealtimePool();
  return globalForPool.__crmRealtimePgPool;
}

// WP07 (F04): the pool query()/queryOne()/execute() use when ENFORCE_TENANT_RLS is on. Separate
// pool object (even though it may share the same connection string as getPool() today) so its
// lifecycle/sizing can be tuned independently once a genuinely separate role is provisioned.
export function getRuntimePool() {
  const globalForPool = globalThis as GlobalWithPgPool;
  if (process.env.NODE_ENV === "production") {
    return globalForPool.__crmTenantPgPool ?? (globalForPool.__crmTenantPgPool = createTenantPool());
  }
  if (!globalForPool.__crmTenantPgPool) globalForPool.__crmTenantPgPool = createTenantPool();
  return globalForPool.__crmTenantPgPool;
}

export type DbClient = Pick<PoolClient, "query" | "release">;

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function closePool() {
  const globalForPool = globalThis as GlobalWithPgPool;
  if (globalForPool.__crmPgPool) {
    await globalForPool.__crmPgPool.end();
    globalForPool.__crmPgPool = undefined;
  }
  if (globalForPool.__crmRealtimePgPool) {
    await globalForPool.__crmRealtimePgPool.end();
    globalForPool.__crmRealtimePgPool = undefined;
  }
  if (globalForPool.__crmTenantPgPool) {
    await globalForPool.__crmTenantPgPool.end();
    globalForPool.__crmTenantPgPool = undefined;
  }
}

export type { QueryResultRow };
