import type { PoolClient, QueryResultRow } from "pg";
import { DatabaseError } from "@/lib/db/errors";
import { getPool, getRuntimePool } from "@/lib/db/pool";
import { getTenantContext } from "@/lib/db/tenant-context";

export type Queryable = Pick<PoolClient, "query">;

// node-postgres serializes a plain JS OBJECT parameter into a jsonb/json column correctly
// (auto JSON.stringify), but a plain JS ARRAY parameter is instead converted to a Postgres ARRAY
// literal ("{...,...}") -- valid syntax for a native array column, but NOT valid JSON, so a
// jsonb column either rejects it outright ("invalid input syntax for type json", if any element
// itself contains a comma/colon that breaks the array-literal-as-JSON parse) or -- worse --
// silently stores the WRONG value for an empty array: `[]` becomes the Postgres empty-array
// literal `{}`, which IS valid JSON (an empty object), so it stores `{}` instead of `[]` with no
// error at all. Wrap any array/list value destined for a jsonb column in this before passing it
// as a query parameter. Safe (and unnecessary but harmless) to use for object values too.
export function jsonbParam(value: unknown) {
  return JSON.stringify(value ?? null);
}

// WP07 (F04): opt-in switch (default off -- see 25_AUDIT_REMEDIATION_PLAN.md WP07 for the staged
// rollout plan). Off, this file's behavior is byte-identical to before this change: every call
// goes straight to getPool() with no wrapping. On, a call with no explicit `client` (meaning it's
// not already inside an explicit withTransaction) is wrapped in its own single-statement
// transaction on the restricted pool that sets transaction-local "app.tenant_id"/"app.user_id"/
// "app.role_id" from the current request's ambient tenant context (tenant-context.ts), so RLS
// policies actually see a tenant to compare against. This does NOT change withTransaction's own
// behavior or callers -- those already set this identically for the whole transaction.
function tenantRlsEnforced() {
  return process.env.ENFORCE_TENANT_RLS === "true";
}

async function setScopedConfig(client: PoolClient, key: string, value: string | null | undefined) {
  if (value === undefined || value === null || value === "") return;
  await client.query("select set_config($1, $2, true)", [key, value]);
}

async function runScoped<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const context = getTenantContext();
  const client = await getRuntimePool().connect();
  try {
    await client.query("begin");
    await setScopedConfig(client, "app.tenant_id", context?.tenantId);
    await setScopedConfig(client, "app.user_id", context?.userId);
    await setScopedConfig(client, "app.role_id", context?.roleId);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

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
  console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "SLOW_QUERY", durationMs: Math.round(durationMs), rowCount, query: truncated }));
  // Round-2 plan O5: very slow queries (5x the threshold) also go to Sentry, one issue per query.
  if (durationMs >= slowQueryThresholdMs() * 5) {
    void import("@/lib/server/error-reporting")
      .then(({ reportWarning }) => reportWarning(`Slow query (${Math.round(durationMs)} ms): ${truncated.slice(0, 120)}`, `slow-query:${truncated.slice(0, 200)}`, { durationMs: Math.round(durationMs) }))
      .catch(() => undefined);
  }
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
  client?: Queryable,
): Promise<T[]> {
  const startedAt = Date.now();
  try {
    if (!client && tenantRlsEnforced()) {
      const result = await runScoped((scoped) => scoped.query<T>(text, [...values]));
      logSlowQuery(text, startedAt, result.rows.length);
      return result.rows;
    }
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
    if (!client && tenantRlsEnforced()) {
      const result = await runScoped((scoped) => scoped.query(text, [...values]));
      logSlowQuery(text, startedAt, result.rowCount ?? 0);
      return result.rowCount ?? 0;
    }
    const result = await (client ?? getPool()).query(text, [...values]);
    logSlowQuery(text, startedAt, result.rowCount ?? 0);
    return result.rowCount ?? 0;
  } catch (error) {
    throw wrapDbError(error, text);
  }
}

// WP07 (F04) follow-up -- see 25_AUDIT_REMEDIATION_PLAN.md "## WP07 pre-auth/system path
// inventory" for the full classification this exists to support.
//
// query()/queryOne()/execute() above are ambient-context-aware: once ENFORCE_TENANT_RLS=true,
// any call with no explicit `client` is silently scoped to whatever tenant/user/role is
// currently on the AsyncLocalStorage tenant-context stack (tenant-context.ts), and if nothing is
// on that stack (no context entered yet, or a platform admin whose own tenantId is null) it
// still runs -- inside a transaction, on the restricted role -- with no app.tenant_id set at
// all, which RLS then treats as "matches nothing" (fail-closed). That is exactly correct for
// ordinary tenant-scoped application code, and exactly wrong for a call site that is NOT
// ordinary tenant-scoped application code: a pre-auth lookup that has to search before any
// tenant is known (login-by-email, a password-reset token, an API-key/app-secret lookup), a
// platform-admin operation that is deliberately reading or writing across many tenants at once
// (or a single OTHER tenant while the caller's own ambient context is admin-null), or a
// background-worker job with no incoming request and therefore no ambient context to read in
// the first place.
//
// queryAsSystem()/queryOneAsSystem()/executeAsSystem() are the explicit, grep-able escape hatch
// for exactly those call sites: identical signature to query()/queryOne()/execute(), but they
// ALWAYS run on getPool() (the original, unrestricted pool) regardless of ENFORCE_TENANT_RLS or
// whatever tenant context happens to be ambient -- they never touch runScoped()/getRuntimePool()
// at all. Today (flag off, as it is everywhere outside a developer's own machine) this makes no
// observable difference whatsoever from query()/queryOne()/execute() -- both go straight to
// getPool(). The entire point is for the *source code* at a call site to say, explicitly and
// permanently, "this one is not supposed to be tenant-scoped" -- so that the day ENFORCE_TENANT_RLS
// is finally flipped on somewhere real, this call site's behavior doesn't silently depend on the
// flag still being off. Use query()/queryOne()/execute() for anything that runs after a normal
// tenant/user/role context exists (nearly everything). Use *AsSystem for a call site your own
// code comment can justify as pre-auth, genuinely cross-tenant, or genuinely context-free --
// never as a quick way to make an RLS-related test failure go away.
export async function queryAsSystem<T extends QueryResultRow = QueryResultRow>(
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

export async function queryOneAsSystem<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
  client?: Queryable,
): Promise<T | null> {
  const rows = await queryAsSystem<T>(text, values, client);
  return rows[0] ?? null;
}

export async function executeAsSystem(text: string, values: readonly unknown[] = [], client?: Queryable): Promise<number> {
  const startedAt = Date.now();
  try {
    const result = await (client ?? getPool()).query(text, [...values]);
    logSlowQuery(text, startedAt, result.rowCount ?? 0);
    return result.rowCount ?? 0;
  } catch (error) {
    throw wrapDbError(error, text);
  }
}
