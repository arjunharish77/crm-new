import type { PoolClient } from "pg";
import type { AppUserContext } from "@/lib/db/context";
import { getPool } from "@/lib/db/pool";

export type TransactionClient = Pick<PoolClient, "query">;

async function setOptionalConfig(client: PoolClient, key: string, value: string | null | undefined) {
  if (value === undefined || value === null || value === "") return;
  await client.query("select set_config($1, $2, true)", [key, value]);
}

export async function withTransaction<T>(
  userContext: AppUserContext | null,
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await setOptionalConfig(client, "app.user_id", userContext?.id);
    await setOptionalConfig(client, "app.tenant_id", userContext?.tenantId);
    await setOptionalConfig(client, "app.role_id", userContext?.roleId);
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

export async function withAdvisoryLock<T>(
  tx: TransactionClient,
  lockKey: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const [{ locked }] = (await tx.query<{ locked: boolean }>("select pg_try_advisory_xact_lock(hashtext($1)) as locked", [
    lockKey,
  ])).rows;
  if (!locked) return null;
  return fn();
}
