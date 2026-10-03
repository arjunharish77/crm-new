/**
 * Local-only real-database check that campaign, journey and call-campaign audiences reach
 * everyone (§8 #24: they were cut off at 500, 1,000 or 5,000 leads without saying so):
 *   - a campaign launched to a 650-lead smart list queues every lead that has an email address,
 *     and only then shows Completed;
 *   - a launch the worker continues a batch at a time reaches the same people, with nobody queued
 *     twice;
 *   - a journey enrols all 650 from a static list and runs the automation for every one of them
 *     (it ran only the first 500); a run that stops early is marked pending and the next run
 *     finishes it;
 *   - a call campaign adds all 650 as members, and adding again adds nobody.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/audience-batches-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { launchMarketingCampaignForTenant, processDueCampaignLaunches } from "../src/lib/server/marketing-communications";
import { createJourneyForTenant, enrollAudienceIntoJourney, transitionJourneyStatus } from "../src/lib/server/marketing-journeys";
import { addAudienceToCallCampaign } from "../src/lib/server/call-campaigns";
import { getCurrentUserById } from "../src/lib/repositories/auth-admin-postgres";

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
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Audience batches smoke', now())`, [tenantId]);
    const roleId = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke admin', '{"recordAccess":"ALL","modules":{"admin":"full"}}', now())`, [roleId, tenantId]);
    const adminId = randomUUID();
    await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", status, "updatedAt") values ($1, $2, $3, 'Smoke admin', 'x', $4, 'ACTIVE', now())`, [adminId, tenantId, `audience.${adminId.slice(0, 8)}@smoke.invalid`, roleId]);
    const admin: any = await getCurrentUserById(adminId);
    assert.ok(admin?.isTenantAdmin, "the smoke admin is a tenant admin");
    const objectId = randomUUID();
    await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, 'lead', 'Lead', now())`, [objectId, tenantId]);

    // 650 leads from one source; every 13th has no email (50 of them), so 600 can get an email.
    const ids: string[] = Array.from({ length: 650 }, () => randomUUID());
    await q(
      `insert into "Lead" (id, "tenantId", "objectId", name, email, source, "ownerId", "createdBy", "updatedAt", tags)
       select id, $2, $3, 'Audience lead ' || n, case when n % 13 = 0 then null else 'audience.' || n || '@smoke.invalid' end, 'Smoke audience', $4, $4, now(), '{}'
       from unnest($1::text[]) with ordinality as t(id, n)`,
      [ids, tenantId, objectId, adminId],
    );
    const smartList = randomUUID();
    await q(`insert into "LeadList" (id, "tenantId", name, type, filters, "isActive", "createdBy", "updatedAt") values ($1, $2, 'Smart audience', 'SMART', $3, true, $4, now())`, [smartList, tenantId, JSON.stringify([{ logic: "AND", conditions: [{ field: "source", operator: "equals", value: "Smoke audience" }] }]), adminId]);
    const staticList = randomUUID();
    await q(`insert into "LeadList" (id, "tenantId", name, type, "isActive", "createdBy", "updatedAt") values ($1, $2, 'Static audience', 'STATIC', true, $3, now())`, [staticList, tenantId, adminId]);
    await q(`insert into "LeadListMember" (id, "tenantId", "listId", "leadId", "addedBy", "createdAt") select gen_random_uuid(), $1, $2::uuid, id, $3, now() from unnest($4::text[]) as id`, [tenantId, staticList, adminId, ids]);

    const campaign = async (name: string) => {
      const id = randomUUID();
      await q(
        `insert into "MarketingCampaign" (id, "tenantId", name, channel, status, "audienceType", "audienceConfig", body, "createdBy", "approvedBy", "approvedAt")
         values ($1, $2, $3, 'EMAIL', 'APPROVED', 'LEAD_LIST', $4, 'Hello {{name}}', $5, $5, now())`,
        [id, tenantId, name, { leadListId: smartList }, adminId],
      );
      return id;
    };
    const recipients = async (campaignId: string) => (await q(`select count(*)::int n, count(distinct "entityId")::int people from "MarketingCampaignRecipient" where "campaignId" = $1`, [campaignId])).rows[0];
    const status = async (campaignId: string) => (await q(`select status, "launchState" from "MarketingCampaign" where id = $1`, [campaignId])).rows[0];

    // 1. A launch in one request.
    const direct = await campaign("Direct launch");
    const launched = await launchMarketingCampaignForTenant(admin, direct);
    const directCounts = await recipients(direct);
    check(launched.totalAudience === 650 && !launched.inProgress && directCounts.people === 600 && directCounts.n === 600, `the launch queues all 600 leads with an email (not the first 500): ${JSON.stringify(directCounts)}`);
    check((await status(direct)).status === "COMPLETED", "and then shows Completed");

    // 2. A launch the worker continues a batch at a time (1 ms budget: one batch per run).
    const continued = await campaign("Continued launch");
    await q(`update "MarketingCampaign" set status = 'RUNNING', "launchState" = $2 where id = $1`, [continued, { startedBy: adminId, startedAt: new Date().toISOString(), total: 650, queued: 0, afterId: null, done: false, leaseUntil: null }]);
    let runs = 0;
    while ((await status(continued)).status === "RUNNING" && runs < 20) { await processDueCampaignLaunches(50, 1); runs++; }
    const continuedCounts = await recipients(continued);
    check(runs >= 4 && (await status(continued)).status === "COMPLETED", `the worker carries the launch on to Completed (${runs} runs)`);
    check(continuedCounts.people === 600 && continuedCounts.n === 600, `everyone with an email, nobody twice: ${JSON.stringify(continuedCounts)}`);
    // A held lease keeps a second run out.
    const leased = await campaign("Leased launch");
    await q(`update "MarketingCampaign" set status = 'RUNNING', "launchState" = $2 where id = $1`, [leased, { startedBy: adminId, total: 650, queued: 0, afterId: null, done: false, leaseUntil: new Date(Date.now() + 60_000).toISOString() }]);
    await processDueCampaignLaunches(50, 1);
    check((await recipients(leased)).n === 0, "a launch another run holds isn't touched");

    // 3. A journey on the static list.
    await q(`insert into "TenantFeature" ("tenantId", "automationEnabled") values ($1, true) on conflict ("tenantId") do update set "automationEnabled" = true`, [tenantId]).catch(() => undefined);
    const journey: any = await createJourneyForTenant(admin, { name: "Audience journey", targetModule: "LEAD", audienceType: "LEAD_LIST", audienceConfig: { leadListId: staticList } });
    await transitionJourneyStatus(admin, journey.id, "APPROVED");
    await transitionJourneyStatus(admin, journey.id, "ACTIVE");
    const partial = await enrollAudienceIntoJourney(admin, journey.id, { timeBudgetMs: 1 });
    const pending = (await q(`select "enrollmentPending" from "MarketingJourney" where id = $1`, [journey.id])).rows[0].enrollmentPending;
    check(partial.complete === false && partial.enrolled === 200 && pending?.by === adminId, "a run that runs out of time stops after its batch and is marked pending for the worker");
    const rest = await enrollAudienceIntoJourney(admin, journey.id);
    const enrolledRows = (await q(`select count(*)::int n from "MarketingJourneyEnrollment" where "journeyId" = $1`, [journey.id])).rows[0].n;
    const automationRuns = (await q(`select coalesce(sum("totalRecords"), 0)::int n from "AutomationEnrollmentJob" where "automationId" = $1`, [journey.automationId])).rows[0].n;
    check(rest.complete && rest.enrolled === 450 && rest.skipped === 200 && enrolledRows === 650, `the next run finishes: all 650 enrolled (${enrolledRows})`);
    check(automationRuns === 650, `and the automation ran for all 650, not the first 500 (${automationRuns})`);
    check((await q(`select "enrollmentPending" from "MarketingJourney" where id = $1`, [journey.id])).rows[0].enrollmentPending === null, "nothing is left pending");

    // 4. A call campaign on the smart list.
    const callCampaign = randomUUID();
    await q(`insert into "CallCampaign" (id, "tenantId", name, module, "audienceType", "audienceConfig") values ($1, $2, 'Audience calls', 'LEAD', 'LEAD_LIST', $3)`, [callCampaign, tenantId, { leadListId: smartList }]);
    const firstTopUp = await addAudienceToCallCampaign(admin, callCampaign);
    const secondTopUp = await addAudienceToCallCampaign(admin, callCampaign);
    check(firstTopUp.requested === 650 && firstTopUp.added === 650 && secondTopUp.added === 0, `a call campaign adds all 650, then nobody twice (${JSON.stringify([firstTopUp, secondTopUp])})`);

    console.log(`audience-batches-smoke: ${checks} checks passed`);
  } finally {
    await q(`delete from "CommunicationOutbox" where "tenantId" = $1`, [tenantId]).catch(() => undefined);
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 8; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
