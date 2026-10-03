/**
 * Local-only real-database check for message snippets ({{snippet:key}}):
 *   - they expand in a message someone writes (the composer / outbox API), in campaign text
 *     (checked with a campaign test send), and in templates including the locked footer;
 *   - they expand only in the author's text: a token value such as a lead's name that contains
 *     {{snippet:...}} stays literal (template sends used to expand it after filling in tokens);
 *   - system messages that don't ask for it keep the text as written.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/snippet-expansion-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { queueCommunicationForTenant, upsertCommunicationTemplateForTenant } from "../src/lib/server/communications";
import { sendMarketingCampaignTestForTenant } from "../src/lib/server/marketing-communications";

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
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Snippet smoke', now())`, [tenantId]);
    const roleId = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Admin', '{"recordAccess":"ALL"}', now())`, [roleId, tenantId]);
    const userId = randomUUID();
    await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [userId, tenantId, `snippets.${userId.slice(0, 8)}@smoke.invalid`, roleId]);
    const user = { id: userId, tenantId, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL" } } } as any;
    for (const [key, body] of [["sig", "Kind regards, the team"], ["internal", "INTERNAL-ONLY-TEXT"]]) {
      await q(`insert into "MarketingSnippet" (id, "tenantId", key, body, "createdAt", "updatedAt") values ($1, $2, $3, $4, now(), now())`, [randomUUID(), tenantId, key, body]);
    }
    const send = (input: Record<string, unknown>) => queueCommunicationForTenant(user, { channel: "EMAIL", recipient: "someone@smoke.invalid", sourceType: "MANUAL", ...input } as any);

    const manual: any = await send({ subject: "Hi {{snippet:sig}}", body: "Thanks!\n{{snippet:sig}}", expandSnippets: true });
    check(manual.body === "Thanks!\nKind regards, the team" && manual.subject === "Hi Kind regards, the team", "a written message expands snippets in subject and body");

    const system: any = await send({ body: "Customer wrote: {{snippet:internal}}" });
    check(system.body === "Customer wrote: {{snippet:internal}}", "a message that doesn't ask for it keeps the text as written");

    const template = await upsertCommunicationTemplateForTenant(user, {
      channel: "EMAIL", name: "Hello", subject: "Hello {{leadName}}", body: "Hi {{leadName}},\n{{snippet:sig}}", lockedFooter: "-- {{snippet:sig}}",
    } as any);
    const viaTemplate: any = await send({ templateId: template.id, tokens: { leadName: "{{snippet:internal}}" } });
    check(viaTemplate.body.includes("Kind regards, the team"), "a template expands its own snippets");
    check(viaTemplate.body.endsWith("-- Kind regards, the team"), "including in the locked footer");
    check(!viaTemplate.body.includes("INTERNAL-ONLY-TEXT") && !viaTemplate.subject.includes("INTERNAL-ONLY-TEXT"), "a token value can't pull in a snippet");

    const campaignId = randomUUID();
    await q(`insert into "MarketingCampaign" (id, "tenantId", name, channel, subject, body) values ($1, $2, 'Smoke', 'EMAIL', 'News {{snippet:sig}}', 'Hello {{name}}. {{snippet:sig}}')`, [campaignId, tenantId]);
    const test: any = await sendMarketingCampaignTestForTenant(user, campaignId, "tester@smoke.invalid");
    check(test.body === "Hello Test Recipient. Kind regards, the team" && test.subject === "News Kind regards, the team", "campaign text expands snippets (test send)");

    console.log(`snippet-expansion-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
