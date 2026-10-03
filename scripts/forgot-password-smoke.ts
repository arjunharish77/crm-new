/**
 * Local-only real-database check for self-service password reset (decision 16):
 *   - an active user gets one email with a one-hour, single-use link; the email address is
 *     matched without regard to case;
 *   - a new request replaces the earlier link; a used link can't be used again;
 *   - an unknown email, a deactivated user and a suspended workspace get nothing (and the
 *     caller can't tell the difference: requestPasswordResetByEmail resolves the same way);
 *   - the reset itself applies the workspace's password rule.
 * Messages are captured by a test transport; nothing is sent. Temporary tenants, removed
 * afterwards.
 * Run: tsx scripts/forgot-password-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { setSystemEmailTransportForTests } from "../src/lib/server/system-email";
import { passwordRuleForResetToken, requestPasswordResetByEmail, resetPasswordWithToken } from "../src/lib/server/password-policy";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const rejects = async (run: () => Promise<unknown>, code: string, label: string) => {
    await assert.rejects(run, (error: any) => error?.message === code || error?.constructor?.name === code, `${label} (expected ${code})`);
    checks++;
  };

  const sent: Array<{ to: string; subject: string; text: string }> = [];
  setSystemEmailTransportForTests({ sendMail: async (message: any) => { sent.push(message); return {}; } } as any);
  const tokenFrom = (text: string) => /token=([0-9a-f]{64})/.exec(text)?.[1] ?? "";

  const tenantId = randomUUID();
  const suspendedTenantId = randomUUID();
  const stamp = randomUUID().slice(0, 8);
  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Reset smoke', now()), ($2, 'Reset smoke (suspended)', now())`, [tenantId, suspendedTenantId]);
    await q(`update "Tenant" set status = 'SUSPENDED' where id = $1`, [suspendedTenantId]);
    const roleId = randomUUID();
    const role2 = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke', '{}', now()), ($3, $4, 'Smoke', '{}', now())`, [roleId, tenantId, role2, suspendedTenantId]);
    const users = {
      active: { id: randomUUID(), email: `reset.active.${stamp}@smoke.invalid`, tenant: tenantId, role: roleId, status: "ACTIVE" },
      inactive: { id: randomUUID(), email: `reset.inactive.${stamp}@smoke.invalid`, tenant: tenantId, role: roleId, status: "INACTIVE" },
      suspended: { id: randomUUID(), email: `reset.suspended.${stamp}@smoke.invalid`, tenant: suspendedTenantId, role: role2, status: "ACTIVE" },
    };
    for (const user of Object.values(users)) {
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", status, "updatedAt") values ($1, $2, $3, 'Smoke Person', 'x', $4, $5, now())`, [user.id, user.tenant, user.email, user.role, user.status]);
    }

    await requestPasswordResetByEmail(users.active.email.toUpperCase());
    check(sent.length === 1 && sent[0].to === users.active.email, "an active user gets one email, matched without regard to case");
    const firstToken = tokenFrom(sent[0].text);
    check(firstToken.length === 64 && /within the next hour/.test(sent[0].text), "the email has a one-hour link");
    check(!!(await passwordRuleForResetToken(firstToken)), "the link works");

    await requestPasswordResetByEmail(users.active.email);
    const secondToken = tokenFrom(sent[1].text);
    check(!(await passwordRuleForResetToken(firstToken)) && !!(await passwordRuleForResetToken(secondToken)), "a new request replaces the earlier link");

    const before = sent.length;
    await requestPasswordResetByEmail(`nobody.${stamp}@smoke.invalid`);
    await requestPasswordResetByEmail(users.inactive.email);
    await requestPasswordResetByEmail(users.suspended.email);
    check(sent.length === before, "an unknown email, a deactivated user and a suspended workspace get nothing");
    check((await q(`select count(*)::int n from "PasswordResetToken" where "userId" = any($1)`, [[users.inactive.id, users.suspended.id]])).rows[0].n === 0, "and no link is created for them");

    await rejects(() => resetPasswordWithToken(secondToken, "short"), "PasswordPolicyError", "the workspace's password rule applies to the reset");
    await resetPasswordWithToken(secondToken, `Smoke-${stamp}-Aa1!`);
    check((await q(`select password from "User" where id = $1`, [users.active.id])).rows[0].password !== "x", "the password is changed");
    await rejects(() => resetPasswordWithToken(secondToken, `Other-${stamp}-Aa1!`), "INVALID_OR_EXPIRED_TOKEN", "a used link can't be used again");

    console.log(`forgot-password-smoke: ${checks} checks passed`);
  } finally {
    setSystemEmailTransportForTests(null);
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (const id of [tenantId, suspendedTenantId]) {
      for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId" = $1`, [id]).catch(() => undefined);
      await q(`delete from "Tenant" where id = $1`, [id]);
    }
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
