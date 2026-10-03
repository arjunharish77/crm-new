/**
 * Local-only real-database check for marketplace app secrets (decided 2026-10-03):
 *   - rotating the API secret returns only the new API secret, never the signing secret;
 *   - rotating the signing secret returns the new one once; for 24 hours deliveries are signed
 *     with both (x-app-signature with the new one, x-app-signature-previous with the old one),
 *     then with the new one only;
 *   - the masked credentials list shows the overlap, never a value;
 *   - another workspace can't rotate them.
 * Temporary tenants, removed afterwards.
 * Run: tsx scripts/app-signing-rotation-smoke.ts
 */
import { createRequire } from "module";
import { createHmac, randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { listAppSecretsMaskedForTenant, rotateAppSecret, rotateAppSigningSecret } from "../src/lib/repositories/marketplace-postgres";
import { APP_SIGNING_COLUMNS, appSignatureHeaders } from "../src/lib/server/app-signing";
import { encryptSecretAtRest } from "../src/lib/server/secret-encryption";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const sign = (secret: string, timestamp: string, body: string) => createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  try {
    const setUp = async (id: string) => {
      await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Signing smoke', now())`, [id]);
      const roleId = randomUUID();
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Admin', '{"recordAccess":"ALL"}', now())`, [roleId, id]);
      const userId = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [userId, id, `signing.${userId.slice(0, 8)}@smoke.invalid`, roleId]);
      return { id: userId, tenantId: id, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL" } } } as any;
    };
    const user = await setUp(tenantId);
    const outsider = await setUp(otherTenantId);
    const appId = randomUUID();
    await q(`insert into "MarketplaceApp" (id, "tenantId", name, "ownerId", "updatedAt") values ($1, $2, 'Smoke app', $3, now())`, [appId, tenantId, user.id]);
    const oldSigning = "old-signing-secret-value";
    await q(`insert into "TenantAppSecret" (id, "tenantId", "appId", secret, "signingSecret", "createdAt") values ($1, $2, $3, $4, $5, now())`,
      [randomUUID(), tenantId, appId, encryptSecretAtRest("old-api-secret"), encryptSecretAtRest(oldSigning)]);
    const signingRow = async () => (await q(`select ${APP_SIGNING_COLUMNS} from "TenantAppSecret" where "appId" = $1`, [appId])).rows[0];

    const apiRotation: any = await rotateAppSecret(user, appId);
    check(typeof apiRotation.secret === "string" && !("signingSecret" in apiRotation), "rotating the API secret returns only the new API secret");

    const signingRotation = await rotateAppSigningSecret(user, appId);
    check(signingRotation.signingSecret.length >= 32 && signingRotation.signingSecret !== oldSigning, "rotating the signing secret returns a new one");
    const timestamp = "1700000000";
    const body = '{"hello":"world"}';
    const during = appSignatureHeaders(await signingRow(), timestamp, body);
    check(during["x-app-signature"] === sign(signingRotation.signingSecret, timestamp, body), "deliveries are signed with the new secret");
    check(during["x-app-signature-previous"] === sign(oldSigning, timestamp, body), "and, for 24 hours, also with the old one");
    const after = appSignatureHeaders(await signingRow(), timestamp, body, Date.now() + 25 * 3_600_000);
    check(!("x-app-signature-previous" in after) && after["x-app-signature"] === during["x-app-signature"], "after 24 hours only the new secret signs");

    const masked: any = (await listAppSecretsMaskedForTenant(user)).find((row: any) => row.appId === appId);
    check(masked && masked.previousSigningSecretValidUntil && !("signingSecret" in masked) && !("secret" in masked), "the credentials list shows the overlap and no values");

    await assert.rejects(() => rotateAppSigningSecret(outsider, appId), (error: any) => error?.message === "APP_SECRET_NOT_FOUND");
    checks++; // another workspace can't rotate it

    console.log(`app-signing-rotation-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (const id of [tenantId, otherTenantId]) {
      for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [id]).catch(() => undefined);
      await q(`delete from "Tenant" where id = $1`, [id]);
    }
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
