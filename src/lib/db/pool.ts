import { Pool, type PoolClient, type QueryResultRow } from "pg";

type GlobalWithPgPool = typeof globalThis & {
  __crmPgPool?: Pool;
  __crmRealtimePgPool?: Pool;
};

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing env var: DATABASE_URL");
  return url;
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
}

export type { QueryResultRow };
