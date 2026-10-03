/**
 * Local-only real-database check for the Payouts workspace queues (decision 32):
 *   - "To approve" lists unheld drafts; "On hold" lists held payouts that aren't paid; "To pay"
 *     lists unheld approved or invoiced payouts. Paid payouts are in none of them;
 *   - every cycle is included, oldest cycle first, with the cycle label and the partner's name;
 *   - the counts match the lists;
 *   - another workspace's payouts never appear;
 *   - approving a draft moves it from "To approve" to "To pay";
 *   - with the Payouts module off, the queues refuse.
 * Temporary tenants, removed afterwards.
 * Run: tsx scripts/payout-queues-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { approvePayout, countPayoutQueuesForTenant, listPayoutQueueForTenant } from "../src/lib/server/payouts";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };

  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  try {
    const setUpTenant = async (id: string, label: string) => {
      await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, $2, now())`, [id, label]);
      const roleId = randomUUID();
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke admin', '{"recordAccess":"ALL"}', now())`, [roleId, id]);
      const adminId = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke admin', 'x', $4, now())`, [adminId, id, `payq.${adminId.slice(0, 6)}@smoke.invalid`, roleId]);
      const partners: string[] = [];
      for (let index = 0; index < 4; index++) {
        const partnerId = randomUUID();
        await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, $4, 'x', $5, now())`, [partnerId, id, `payq.p${index}.${partnerId.slice(0, 6)}@smoke.invalid`, `Partner ${index}`, roleId]);
        partners.push(partnerId);
      }
      return { admin: { id: adminId, tenantId: id, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL" } } } as any, partners };
    };
    const cycle = async (id: string, label: string, end: string) => {
      const cycleId = randomUUID();
      await q(`insert into "PayoutCycle" (id, "tenantId", "cycleLabel", "startDate", "endDate") values ($1, $2, $3, $4::timestamptz - interval '30 days', $4)`, [cycleId, id, label, end]);
      return cycleId;
    };
    const payout = async (id: string, cycleId: string, partnerId: string, status: string, isHeld: boolean, amount: number) => {
      const payoutId = randomUUID();
      await q(`insert into "Payout" (id, "tenantId", "payoutCycleId", "partnerId", "totalCommissionAmount", status, "isHeld", "holdReason") values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [payoutId, id, cycleId, partnerId, amount, status, isHeld, isHeld ? "Finance review" : null]);
      return payoutId;
    };

    const { admin, partners } = await setUpTenant(tenantId, "Payout queues smoke");
    await q(`insert into "PartnerProfile" (id, "tenantId", "userId", "legalBusinessName", "updatedAt") values ($1, $2, $3, 'Acme Partners Pvt Ltd', now())`, [randomUUID(), tenantId, partners[0]]).catch(() => undefined);
    const older = await cycle(tenantId, "Smoke August", "2026-08-31");
    const newer = await cycle(tenantId, "Smoke September", "2026-09-30");
    const ids = {
      draftNew: await payout(tenantId, newer, partners[0], "DRAFT", false, 900),
      draftOld: await payout(tenantId, older, partners[0], "DRAFT", false, 100),
      draftHeld: await payout(tenantId, newer, partners[1], "DRAFT", true, 200),
      approved: await payout(tenantId, older, partners[1], "APPROVED", false, 300),
      invoiced: await payout(tenantId, older, partners[2], "INVOICED", false, 400),
      approvedHeld: await payout(tenantId, newer, partners[2], "APPROVED", true, 500),
      paid: await payout(tenantId, newer, partners[3], "PAID", false, 600),
      paidHeld: await payout(tenantId, older, partners[3], "PAID", true, 700),
    };
    const other = await setUpTenant(otherTenantId, "Payout queues smoke (other)");
    const otherCycle = await cycle(otherTenantId, "Other September", "2026-09-30");
    await payout(otherTenantId, otherCycle, other.partners[0], "DRAFT", false, 50);

    const list = async (queue: "to-approve" | "on-hold" | "to-pay") => (await listPayoutQueueForTenant(admin, queue)) as any[];
    const idsOf = (rows: any[]) => rows.map((row) => row.id).sort().join();
    const toApprove = await list("to-approve");
    const onHold = await list("on-hold");
    const toPay = await list("to-pay");
    check(idsOf(toApprove) === [ids.draftNew, ids.draftOld].sort().join(), "To approve lists the unheld drafts, from every cycle");
    check(idsOf(onHold) === [ids.draftHeld, ids.approvedHeld].sort().join(), "On hold lists held payouts that aren't paid");
    check(idsOf(toPay) === [ids.approved, ids.invoiced].sort().join(), "To pay lists unheld approved and invoiced payouts");
    check(![...toApprove, ...onHold, ...toPay].some((row) => row.id === ids.paid || row.id === ids.paidHeld), "paid payouts are in no queue");
    check(toApprove[0].id === ids.draftOld && toApprove[0].cycleLabel === "Smoke August", "the oldest cycle comes first, with its label");
    check(toApprove.every((row) => row.partner?.email?.endsWith("@smoke.invalid")), "each payout carries the partner's details");
    check(![...toApprove, ...onHold, ...toPay].some((row) => row.tenantId !== tenantId), "another workspace's payouts never appear");

    const counts = await countPayoutQueuesForTenant(admin);
    check(counts["to-approve"] === 2 && counts["on-hold"] === 2 && counts["to-pay"] === 2, "the counts match the lists");
    check((await countPayoutQueuesForTenant(other.admin))["to-approve"] === 1, "the other workspace counts only its own");

    await approvePayout(admin, ids.draftNew);
    check(!(await list("to-approve")).some((row) => row.id === ids.draftNew) && (await list("to-pay")).some((row) => row.id === ids.draftNew), "approving a draft moves it from To approve to To pay");

    await q(`insert into "TenantModuleEntitlement" (id, "tenantId", "moduleKey", status) values ($1, $2, 'PAYOUTS', 'DISABLED')`, [randomUUID(), tenantId]);
    await assert.rejects(() => listPayoutQueueForTenant(admin, "to-approve"), (error: any) => String(error?.message).startsWith("FEATURE_DISABLED"));
    await assert.rejects(() => countPayoutQueuesForTenant(admin), (error: any) => String(error?.message).startsWith("FEATURE_DISABLED"));
    checks++; // with the Payouts module off, the queues refuse

    console.log(`payout-queues-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (const id of [tenantId, otherTenantId]) {
      for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId" = $1`, [id]).catch(() => undefined);
      await q(`delete from "Tenant" where id = $1`, [id]);
    }
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
