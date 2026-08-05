import { Pool, QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var unnatiVidyaPool: Pool | undefined;
}

const connectionString =
  process.env.UNNATIVIDYA_DATABASE_URL ||
  "postgresql://unnatividya_app:unnatividya_app@localhost:5432/unnatividya";

export const pool =
  globalThis.unnatiVidyaPool ||
  new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.unnatiVidyaPool = pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}
