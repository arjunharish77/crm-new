/**
 * Local-only real-database check for the campaign save model (decision 29, extended 2026-10-03):
 *   - a Draft campaign saves freely;
 *   - saving an approved campaign unchanged, or only renaming it, keeps the approval;
 *   - changing what an approved (or pending, or scheduled) campaign sends puts it back in Draft and
 *     clears the approval, so it can't launch until approved again;
 *   - once a campaign has started, what it sends can't change.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/campaign-drafts-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { launchMarketingCampaignForTenant, updateMarketingCampaignStatusForTenant, upsertMarketingCampaignForTenant } from "../src/lib/server/marketing-communications";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const rejects = async (run: () => Promise<unknown>, code: string | RegExp, label: string) => {
    await assert.rejects(run, (error: any) => (typeof code === "string" ? error?.message === code : code.test(String(error?.message))), `${label} (expected ${code})`);
    checks++;
  };
  const tenantId = randomUUID();
  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Campaign drafts smoke', now())`, [tenantId]);
    const roleId = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Admin', '{"recordAccess":"ALL"}', now())`, [roleId, tenantId]);
    const userId = randomUUID();
    await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [userId, tenantId, `campaigns.${userId.slice(0, 8)}@smoke.invalid`, roleId]);
    const user = { id: userId, tenantId, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL" } } } as any;
    const base = { name: "Spring offer", channel: "EMAIL", campaignType: "BROADCAST", audienceType: "MANUAL", audienceConfig: { recipients: ["a@smoke.invalid"] }, subject: "Hello", body: "Our spring offer" } as any;
    const status = async (id: string) => (await q(`select status, "approvedBy" from "MarketingCampaign" where id = $1`, [id])).rows[0];

    const created: any = await upsertMarketingCampaignForTenant(user, base);
    const id = created.id;
    await upsertMarketingCampaignForTenant(user, { ...base, id, body: "Our spring offer, now 10% off" });
    check((await status(id)).status === "DRAFT", "a Draft campaign saves freely");

    await updateMarketingCampaignStatusForTenant(user, id, "PENDING_APPROVAL");
    await updateMarketingCampaignStatusForTenant(user, id, "APPROVED");
    const current: any = await upsertMarketingCampaignForTenant(user, { ...base, id, body: "Our spring offer, now 10% off" });
    check((await status(id)).status === "APPROVED" && !current.approvalReset, "saving an approved campaign unchanged keeps the approval");
    await upsertMarketingCampaignForTenant(user, { ...base, id, name: "Spring offer (final)", body: "Our spring offer, now 10% off" });
    check((await status(id)).status === "APPROVED", "renaming it keeps the approval");

    const changed: any = await upsertMarketingCampaignForTenant(user, { ...base, id, name: "Spring offer (final)", body: "Our spring offer, now 20% off" });
    const after = await status(id);
    check(changed.approvalReset && after.status === "DRAFT" && after.approvedBy === null, "changing what it sends puts it back in Draft and clears the approval");
    await rejects(() => launchMarketingCampaignForTenant(user, id), "CAMPAIGN_MUST_BE_APPROVED_BEFORE_LAUNCH", "so it can't launch until approved again");

    await updateMarketingCampaignStatusForTenant(user, id, "PENDING_APPROVAL");
    await upsertMarketingCampaignForTenant(user, { ...base, id, audienceConfig: { recipients: ["a@smoke.invalid", "b@smoke.invalid"] } });
    check((await status(id)).status === "DRAFT", "changing the audience of a pending campaign puts it back in Draft too");

    await updateMarketingCampaignStatusForTenant(user, id, "PENDING_APPROVAL");
    await updateMarketingCampaignStatusForTenant(user, id, "APPROVED");
    await q(`update "MarketingCampaign" set status = 'RUNNING' where id = $1`, [id]);
    await rejects(() => upsertMarketingCampaignForTenant(user, { ...base, id, body: "Something else" }), "CAMPAIGN_LOCKED", "once it has started, what it sends can't change");

    console.log(`campaign-drafts-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
