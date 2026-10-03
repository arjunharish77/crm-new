/**
 * Local-only real-database check for the public unsubscribe link:
 *   - opting out of one channel records the opt-out and adds a consent-history row (with the
 *     unsubscribe link as the source and no user), even when consent was recorded before;
 *   - opting out of everything does so for every channel;
 *   - the record's active journeys stop, and their scheduled steps are cancelled.
 * Calls the route handler directly. Temporary tenant, removed afterwards.
 * Run: tsx scripts/unsubscribe-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { POST } from "../src/app/api/public/unsubscribe/[outboxId]/route";

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
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Unsubscribe smoke', now())`, [tenantId]);
    const leadId = randomUUID();
    const outbox = async (channel: string) => {
      const id = randomUUID();
      await q(`insert into "CommunicationOutbox" (id, "tenantId", channel, recipient, body, "entityType", "entityId") values ($1, $2, $3, 'someone@smoke.invalid', 'Hello', 'LEAD', $4)`, [id, tenantId, channel, leadId]);
      return id;
    };
    const unsubscribe = (outboxId: string, scope?: string) => POST(new Request(`http://local/api/public/unsubscribe/${outboxId}`, { method: "POST", body: JSON.stringify(scope ? { scope } : {}) }), { params: Promise.resolve({ outboxId }) });
    const consent = async (channel: string) => (await q(`select status, source from "CommunicationConsent" where "tenantId" = $1 and "entityId" = $2 and channel = $3`, [tenantId, leadId, channel])).rows[0];
    const history = async (channel: string) => (await q(`select status, source, "changedBy" from "CommunicationConsentHistory" where "tenantId" = $1 and "entityId" = $2 and channel = $3 order by "createdAt" desc`, [tenantId, leadId, channel])).rows;

    await q(`insert into "CommunicationConsent" (id, "tenantId", "entityType", "entityId", channel, status, source, "capturedAt", "updatedAt") values ($1, $2, 'LEAD', $3, 'EMAIL', 'OPTED_IN', 'FORM', now(), now())`, [randomUUID(), tenantId, leadId]);
    const automationId = randomUUID();
    await q(`insert into "AutomationV2" (id, "tenantId", name, trigger, "publishedVersion", "updatedAt") values ($1, $2, '[Journey] Smoke', '{"type":"MANUAL"}', 1, now())`, [automationId, tenantId]);
    const journeyId = randomUUID();
    await q(`insert into "MarketingJourney" (id, "tenantId", "automationId", name, "targetModule", status, "updatedAt") values ($1, $2, $3, 'Smoke journey', 'LEAD', 'ACTIVE', now())`, [journeyId, tenantId, automationId]);
    await q(`insert into "MarketingJourneyEnrollment" (id, "tenantId", "journeyId", "recordType", "recordId") values ($1, $2, $3, 'LEAD', $4)`, [randomUUID(), tenantId, journeyId, leadId]);
    const stepId = randomUUID();
    await q(`insert into "AutomationQueue" (id, "tenantId", "automationId", "entityType", "entityId", status, "runAt") values ($1, $2, $3, 'LEAD', $4, 'PENDING', now() + interval '1 day')`, [stepId, tenantId, automationId, leadId]);

    const response = await unsubscribe(await outbox("EMAIL"));
    check(response.status === 200, "the unsubscribe link answers");
    const email = await consent("EMAIL");
    check(email.status === "OPTED_OUT" && email.source === "UNSUBSCRIBE_LINK", "an earlier opt-in is replaced, with the link as the source");
    const emailHistory = await history("EMAIL");
    check(emailHistory.length === 1 && emailHistory[0].status === "OPTED_OUT" && emailHistory[0].source === "UNSUBSCRIBE_LINK" && emailHistory[0].changedBy === null, "the opt-out is in the consent history, made by the recipient (no user)");
    check((await history("SMS")).length === 0, "other channels are untouched by a one-channel opt-out");

    await unsubscribe(await outbox("SMS"), "ALL");
    check((await Promise.all(["EMAIL", "WHATSAPP", "SMS"].map(consent))).every((row) => row?.status === "OPTED_OUT"), "opting out of everything covers every channel");
    check((await history("WHATSAPP")).length === 1, "and each channel gets a history row");

    const enrolment = (await q(`select status from "MarketingJourneyEnrollment" where "tenantId" = $1 and "recordId" = $2`, [tenantId, leadId])).rows[0];
    const step = (await q(`select status from "AutomationQueue" where id = $1`, [stepId])).rows[0];
    check(enrolment.status === "UNSUBSCRIBED" && step.status === "CANCELLED", "the record leaves its journeys and their scheduled steps are cancelled");

    console.log(`unsubscribe-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
