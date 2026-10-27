/**
 * Local-only real-database check for the Plivo connector fixes (2026-10-26):
 *   - a signed callback is accepted through the real route; a wrong signature and a switched-off
 *     connector get the same 403; a replayed callback (same nonce) changes nothing;
 *   - an answered outbound call ends "completed" with the customer leg's talk time, not the
 *     agent leg's;
 *   - an unanswered outbound call ends "no-answer", and a later hangup doesn't turn it "completed";
 *   - two callbacks for a new inbound call arriving together make one call log and one Activity;
 *   - an inbound call that rang and was then missed goes to the missed-callback queue;
 *   - used nonces are cleared by housekeeping after 2 days.
 * A temporary tenant, removed afterwards.
 * Run: tsx scripts/plivo-smoke.ts
 */
import { createRequire } from "module";
import { createHmac, randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { encryptSecretAtRest } from "../src/lib/server/secret-encryption";
import { plivoV3SignedString, syncPlivoEvent } from "../src/lib/server/plivo";
import { recordTelephonyCallEvent } from "../src/lib/server/telephony-webhook";
import { HOUSEKEEPING_RULES } from "../src/lib/server/housekeeping";
import { POST } from "../src/app/api/integrations/telephony/plivo/[tenantId]/[action]/route";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

const PUBLIC_URL = "https://crm.smoke.invalid";
const AUTH_TOKEN = "smoke-plivo-token";

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  process.env.APP_URL = PUBLIC_URL;
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };
  const tenantId = randomUUID();
  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Plivo smoke', now())`, [tenantId]);
    await q(`insert into "TenantModuleEntitlement" (id, "tenantId", "moduleKey", status) values ($1, $2, 'TELEPHONY', 'ENABLED')`, [randomUUID(), tenantId]);
    const teamId = randomUUID();
    await q(`insert into "Team" (id, "tenantId", name) values ($1, $2, 'Smoke callbacks')`, [teamId, tenantId]);
    const roleId = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke agent', $3, now())`, [roleId, tenantId, { recordAccess: "ALL" }]);
    const agentId = randomUUID();
    await q(`insert into "User" (id, "tenantId", email, name, password, phone, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke agent', 'x', '+919000000001', $4, now())`, [agentId, tenantId, `plivo.${agentId.slice(0, 8)}@smoke.invalid`, roleId]);
    const objectId = randomUUID();
    await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, 'lead', 'Lead', now())`, [objectId, tenantId]);
    const leadId = randomUUID();
    await q(`insert into "Lead" (id, "tenantId", "objectId", name, phone, "ownerId", "updatedAt") values ($1, $2, $3, 'Smoke caller', '9000000099', $4, now())`, [leadId, tenantId, objectId, agentId]);
    const config = {
      provider: "plivo", plivoAuthId: "MASMOKE", plivoAuthTokenEncrypted: encryptSecretAtRest(AUTH_TOKEN),
      outboundCallerId: "+918000000000", inboundNumber: "+918000000000", defaultAgentNumber: "+919000000002", defaultCallQueueTeamId: teamId,
    };
    await q(`insert into "IntegrationSetting" (id, "tenantId", type, config, "isActive", "updatedAt") values ($1, $2, 'TELEPHONY', $3, true, now())`, [randomUUID(), tenantId, config]);
    const agent = { id: agentId, tenantId };
    const call = async (callId: string) => (await q(`select * from "TelephonyCallLog" where "tenantId" = $1 and provider = 'plivo' and "callId" = $2`, [tenantId, callId])).rows;
    const callActivities = async () => Number((await q(`select count(*)::int as n from "Activity" where "tenantId" = $1 and "leadId" = $2`, [tenantId, leadId])).rows[0].n);

    const send = (action: string, query: Record<string, string>, form: Record<string, string>, options: { nonce?: string; token?: string } = {}) => {
      const url = new URL(`/api/integrations/telephony/plivo/${tenantId}/${action}`, PUBLIC_URL);
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
      const body = new URLSearchParams(form);
      const nonce = options.nonce ?? randomUUID();
      const signature = createHmac("sha256", options.token ?? AUTH_TOKEN).update(plivoV3SignedString(url.toString(), body, nonce)).digest("base64");
      const request = new Request(url.toString().replace(PUBLIC_URL, "http://127.0.0.1:3000"), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "x-plivo-signature-v3": signature, "x-plivo-signature-v3-nonce": nonce },
        body: body.toString(),
      });
      return POST(request, { params: Promise.resolve({ tenantId, action }) });
    };

    // Outbound, answered: logged by click-to-call first, then Plivo's callbacks.
    const answered = randomUUID();
    await recordTelephonyCallEvent(tenantId, { provider: "plivo", callId: answered, direction: "OUTBOUND", fromNumber: "+918000000000", toNumber: "+919000000099", status: "dialing", leadId, agentId }, agent);
    equal((await send("event", { callId: answered, source: "ring" }, { CallUUID: "a-1", Direction: "outbound" })).status, 200, "a signed callback is accepted");
    const badSignature = await send("event", { callId: answered, source: "ring" }, { CallUUID: "a-1" }, { token: "wrong" });
    equal([badSignature.status, await badSignature.text()], [403, "Forbidden"], "a wrong signature is refused");
    await syncPlivoEvent(tenantId, new URLSearchParams({ CallUUID: "a-1", Direction: "outbound" }), "answer", answered);
    equal((await send("event", { callId: answered, source: "dial" }, { DialAction: "answer", DialBLegUUID: "b-1" })).status, 200, "the customer answering is accepted");
    equal((await call(answered))[0].status, "answered", "the customer answering marks the call answered");
    const hangupNonce = randomUUID();
    await send("event", { callId: answered, source: "dial" }, { DialAction: "hangup", DialBLegUUID: "b-1", DialBLegDuration: "42", DialBLegHangupCauseName: "NORMAL_CLEARING" }, { nonce: hangupNonce });
    await send("event", { callId: answered, source: "hangup" }, { CallUUID: "a-1", CallStatus: "completed", Duration: "95" });
    const [completed] = await call(answered);
    equal([completed.status, completed.duration], ["completed", 42], "an answered call is completed with the customer leg's talk time");
    check(completed.endedAt, "the end time is recorded");
    check((await q(`select 1 from "TelephonyWebhookNonce" where "tenantId" = $1 and nonce = $2`, [tenantId, hangupNonce])).rowCount === 1, "a handled callback's nonce is kept");
    const replay = await send("event", { callId: answered, source: "dial" }, { DialAction: "hangup", DialBLegDuration: "999" }, { nonce: hangupNonce });
    equal(await replay.json(), { ok: true, duplicate: true }, "a replayed callback is recognised");
    equal((await call(answered))[0].duration, 42, "a replayed callback changes nothing");
    equal(await callActivities(), 1, "the answered call has one Activity");

    // Outbound, customer never answered.
    const unanswered = randomUUID();
    await recordTelephonyCallEvent(tenantId, { provider: "plivo", callId: unanswered, direction: "OUTBOUND", toNumber: "+919000000099", status: "dialing", leadId, agentId }, agent);
    await syncPlivoEvent(tenantId, new URLSearchParams({ CallUUID: "a-2" }), "answer", unanswered);
    await syncPlivoEvent(tenantId, new URLSearchParams({ DialStatus: "no-answer" }), "dial-status", unanswered);
    await send("event", { callId: unanswered, source: "hangup" }, { CallUUID: "a-2", CallStatus: "completed", Duration: "40" });
    const [missedOut] = await call(unanswered);
    equal([missedOut.status, missedOut.duration, missedOut.metadata.outcomeReason], ["no-answer", null, "CUSTOMER_NO_ANSWER"], "an unanswered call stays no-answer with no talk time");

    // Inbound: two callbacks for a call the CRM hasn't logged yet arrive together.
    const inbound = `in-${randomUUID()}`;
    const inboundParams = { CallUUID: inbound, Direction: "inbound", From: "919000000099", To: "918000000000" };
    await Promise.all([
      syncPlivoEvent(tenantId, new URLSearchParams(inboundParams), "answer", inbound),
      syncPlivoEvent(tenantId, new URLSearchParams({ ...inboundParams, DialAction: "hangup" }), "dial", inbound),
    ]);
    const inboundRows = await call(inbound);
    equal(inboundRows.length, 1, "callbacks arriving together make one call log");
    equal([inboundRows[0].leadId, inboundRows[0].agentId, inboundRows[0].fromNumber], [leadId, agentId, "+919000000099"], "the caller is matched to the lead and its owner");
    equal(await callActivities(), 3, "and one Activity for it");
    await syncPlivoEvent(tenantId, new URLSearchParams({ ...inboundParams, DialStatus: "timeout" }), "dial-status", inbound);
    const [missedIn] = await call(inbound);
    equal([missedIn.status, missedIn.queueId, missedIn.queueType], ["no-answer", teamId, "MISSED_CALLBACK"], "a missed inbound call goes to the missed-callback queue");

    // Switched off: the same 403 as a bad signature.
    await q(`update "IntegrationSetting" set "isActive" = false where "tenantId" = $1`, [tenantId]);
    const disabled = await send("event", { callId: answered, source: "ring" }, { CallUUID: "a-1" });
    equal([disabled.status, await disabled.text()], [403, "Forbidden"], "a switched-off connector gives the same refusal");

    // Housekeeping clears nonces after 2 days.
    const rule = HOUSEKEEPING_RULES.find((entry) => entry.table === "TelephonyWebhookNonce")!;
    const oldNonce = randomUUID();
    await q(`insert into "TelephonyWebhookNonce" (id, "tenantId", provider, nonce, "createdAt") values ($1, $2, 'plivo', $3, now() - interval '3 days')`, [randomUUID(), tenantId, oldNonce]);
    await q(`delete from "TelephonyWebhookNonce" where "tenantId" = $1 and ${rule.where}`, [tenantId]);
    equal((await q(`select nonce from "TelephonyWebhookNonce" where "tenantId" = $1 and nonce = any($2)`, [tenantId, [oldNonce, hangupNonce]])).rows.map((row) => row.nonce), [hangupNonce], "old nonces are cleared, recent ones kept");

    console.log(`Plivo smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
