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

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
  client?: Queryable,
): Promise<T[]> {
  try {
    const result = await (client ?? getPool()).query<T>(text, [...values]);
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
  try {
    const result = await (client ?? getPool()).query(text, [...values]);
    return result.rowCount ?? 0;
  } catch (error) {
    throw wrapDbError(error, text);
  }
}
