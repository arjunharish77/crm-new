import type { PoolClient, QueryResultRow } from "pg";
import { DatabaseError } from "@/lib/db/errors";
import { getPool } from "@/lib/db/pool";

export type Queryable = Pick<PoolClient, "query">;

function wrapDbError(error: unknown, sql: string) {
  const pgError = error as { code?: string; message?: string };
  return new DatabaseError(pgError.message || "Database query failed", {
    code: pgError.code,
    cause: { error, sql },
  });
}

// Slow-query observability (gap checklist Module 17, item 24 -- "analytics performance
// layer"). This is the single choke point every query in the app goes through (reports
// included, which have no other shared entry point across their 19 separate route files), so
// instrumenting here gives real, general slow-query visibility rather than something scoped
// only to reports. No structured logger exists anywhere in this codebase (confirmed by grep --
// every other file that logs a server-side failure uses a plain `console.error`/`console.warn`,
// e.g. `invoice-pdf.tsx`/`report-pdf.tsx`), so this follows that same convention rather than
// introducing a new logging framework. Purely additive -- never changes a query's return value
// or error behavior, only measures and conditionally warns.
// Read per-call, not cached at module-load time, so the threshold can be tuned (or tested)
// without needing a fresh process/module instance.
function slowQueryThresholdMs() {
  const configured = Number(process.env.SLOW_QUERY_THRESHOLD_MS);
  return configured > 0 ? configured : 1000;
}

function logSlowQuery(text: string, startedAt: number, rowCount: number) {
  const durationMs = Date.now() - startedAt;
  if (durationMs < slowQueryThresholdMs()) return;
  const truncated = text.replace(/\s+/g, " ").trim().slice(0, 300);
  console.warn(`SLOW_QUERY (${Math.round(durationMs)}ms, ${rowCount} rows): ${truncated}`);
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
  client?: Queryable,
): Promise<T[]> {
  const startedAt = Date.now();
  try {
    const result = await (client ?? getPool()).query<T>(text, [...values]);
    logSlowQuery(text, startedAt, result.rows.length);
    return result.rows;
  } catch (error) {
    throw wrapDbError(error, text);
  }
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
  client?: Queryable,
): Promise<T | null> {
  const rows = await query<T>(text, values, client);
  return rows[0] ?? null;
}

export async function execute(text: string, values: readonly unknown[] = [], client?: Queryable): Promise<number> {
  const startedAt = Date.now();
  try {
    const result = await (client ?? getPool()).query(text, [...values]);
    logSlowQuery(text, startedAt, result.rowCount ?? 0);
    return result.rowCount ?? 0;
  } catch (error) {
    throw wrapDbError(error, text);
  }
}
