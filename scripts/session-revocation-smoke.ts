/**
 * Local-only real-database check that access ends when it should (round-2 plan S3: deactivated
 * or removed users kept working sessions for up to 7 days):
 *   - a signed-in user's token works;
 *   - deactivating them (as the Users page and SCIM do) ends it at once, and reactivating doesn't
 *     bring the old session back;
 *   - a role change ends the user's sessions;
 *   - a removed (SCIM-deleted) user's token stops working;
 *   - changing your own password ends your other sessions and keeps the current one.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/session-revocation-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { getPool } from "../src/lib/db/pool";
import { getUserFromToken, signAuthToken } from "../src/lib/server/auth";
import { createUserSession } from "../src/lib/server/sessions";
import { updateTenantScopedUser } from "../src/lib/server/admin";
import { changeOwnPassword } from "../src/lib/server/password-policy";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const tenantId = randomUUID();
  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Session revocation smoke', now())`, [tenantId]);
    const roleA = randomUUID();
    const roleB = randomUUID();
    for (const [id, name] of [[roleA, "Smoke A"], [roleB, "Smoke B"]]) {
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, $3, '{"recordAccess":"OWN"}', now())`, [id, tenantId, name]);
    }
    const password = "Smoke-Pass-2026!";
    const hash = await bcrypt.hash(password, 10);
    const person = async () => {
      const id = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", status, "updatedAt") values ($1, $2, $3, 'Smoke', $4, $5, 'ACTIVE', now())`, [id, tenantId, `session.${id.slice(0, 8)}@smoke.invalid`, hash, roleA]);
      return id;
    };
    const signIn = async (userId: string) => {
      const session = await createUserSession({ userId, tenantId });
      const token = await signAuthToken({ sub: userId, email: "x", name: "x", tenantId, roleId: roleA, isPlatformAdmin: false, platformAdminId: null, sid: session.id } as any);
      return { token, sessionId: session.id };
    };
    const works = async (token: string) => !!(await getUserFromToken(token));

    // Deactivate, then reactivate.
    const userA = await person();
    const a = await signIn(userA);
    check(await works(a.token), "a signed-in user's token works");
    await updateTenantScopedUser(tenantId, userA, { status: "INACTIVE" });
    check(!(await works(a.token)), "deactivating the user ends their session at once");
    await updateTenantScopedUser(tenantId, userA, { status: "ACTIVE" });
    check(!(await works(a.token)), "reactivating doesn't bring the old session back (they sign in again)");

    // Role change.
    const userB = await person();
    const b = await signIn(userB);
    await updateTenantScopedUser(tenantId, userB, { roleId: roleB });
    check(!(await works(b.token)), "a role change ends the user's sessions");

    // Removed user (even with a valid, unrevoked session).
    const userC = await person();
    const c = await signIn(userC);
    await q(`update "User" set "deletedAt" = now() where id = $1`, [userC]);
    check(!(await works(c.token)), "a removed user's token stops working");

    // Own password change: other sessions end, the current one stays.
    const userD = await person();
    const current = await signIn(userD);
    const other = await signIn(userD);
    const me: any = await getUserFromToken(current.token);
    await changeOwnPassword(me, password, "Smoke-Pass-2027!");
    check(await works(current.token) && !(await works(other.token)), "changing your password ends your other sessions and keeps this one");

    console.log(`session-revocation-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    await q(`delete from "UserSession" where "userId" in (select id from "User" where "tenantId" = $1)`, [tenantId]).catch(() => undefined);
    await q(`delete from "PasswordHistory" where "userId" in (select id from "User" where "tenantId" = $1)`, [tenantId]).catch(() => undefined);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
