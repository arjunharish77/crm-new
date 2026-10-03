/**
 * Local-only real-database check for template approval (decided 2026-10-03):
 *   - with "Send only approved templates" off (the default) any template sends, as before;
 *   - status changes follow Draft/Rejected -> Waiting for approval -> Approved/Rejected;
 *   - with it on, an unapproved template version can't be sent (directly or by launching a
 *     campaign, which is refused before it starts), and the author can't approve their own;
 *   - another admin approves it and it sends; the setting change is audit-logged.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/template-approval-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import {
  getMessagingSettingsForTenant,
  queueCommunicationForTenant,
  setTemplateApprovalStatusForTenant,
  updateMessagingSettingsForTenant,
  upsertCommunicationTemplateForTenant,
} from "../src/lib/server/communications";
import { launchMarketingCampaignForTenant } from "../src/lib/server/marketing-communications";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const rejects = async (run: () => Promise<unknown>, code: string, label: string) => {
    await assert.rejects(run, (error: any) => error?.message === code, `${label} (expected ${code})`);
    checks++;
  };
  const tenantId = randomUUID();
  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Template approval smoke', now())`, [tenantId]);
    const roleId = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Admin', '{"recordAccess":"ALL"}', now())`, [roleId, tenantId]);
    const admin = async () => {
      const id = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`,
        [id, tenantId, `templates.${id.slice(0, 8)}@smoke.invalid`, roleId]);
      return { id, tenantId, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL" } } } as any;
    };
    const author = await admin();
    const reviewer = await admin();
    const send = (templateId: string) =>
      queueCommunicationForTenant(author, { channel: "EMAIL", recipient: "someone@smoke.invalid", templateId, sourceType: "MANUAL" } as any);

    const draft = await upsertCommunicationTemplateForTenant(author, { channel: "EMAIL", name: "Welcome", subject: "Hi", body: "Hello there" } as any);
    check((await getMessagingSettingsForTenant(author)).requireTemplateApproval === false, "approval isn't required by default");
    check((await send(draft.id))?.id, "with approval not required, a Draft template sends as before");

    await rejects(() => setTemplateApprovalStatusForTenant(reviewer, draft.id, "APPROVED"), "TEMPLATE_APPROVAL_INVALID_TRANSITION", "a Draft can't jump straight to Approved");
    check((await setTemplateApprovalStatusForTenant(author, draft.id, "PENDING_APPROVAL")).approvalStatus === "PENDING_APPROVAL", "requesting approval moves it to Waiting");
    await rejects(() => setTemplateApprovalStatusForTenant(author, draft.id, "PENDING_APPROVAL"), "TEMPLATE_APPROVAL_INVALID_TRANSITION", "requesting approval twice is refused");

    await updateMessagingSettingsForTenant(author, { requireTemplateApproval: true });
    const audit = await q(`select count(*)::int as n from "AuditLog" where "tenantId" = $1 and "entityType" = 'MESSAGING_SETTINGS'`, [tenantId]);
    check(audit.rows[0].n === 1, "turning approval on is audit-logged");
    await rejects(() => send(draft.id), "TEMPLATE_NOT_APPROVED", "with approval required, an unapproved template can't be sent");

    const campaignId = randomUUID();
    await q(`insert into "MarketingCampaign" (id, "tenantId", name, channel, status, "templateId") values ($1, $2, 'Smoke campaign', 'EMAIL', 'APPROVED', $3)`, [campaignId, tenantId, draft.id]);
    await rejects(() => launchMarketingCampaignForTenant(author, campaignId), "TEMPLATE_NOT_APPROVED", "a campaign using it can't launch");
    const campaign = await q(`select status from "MarketingCampaign" where id = $1`, [campaignId]);
    check(campaign.rows[0].status === "APPROVED", "and the refused campaign wasn't started");

    await rejects(() => setTemplateApprovalStatusForTenant(author, draft.id, "APPROVED"), "TEMPLATE_SELF_APPROVAL", "the author can't approve their own template");
    const approved = await setTemplateApprovalStatusForTenant(reviewer, draft.id, "APPROVED");
    check(approved.approvalStatus === "APPROVED" && approved.approvedBy === reviewer.id, "another admin approves it");
    check((await send(draft.id))?.id, "an approved template sends");
    await rejects(() => setTemplateApprovalStatusForTenant(reviewer, draft.id, "REJECTED"), "TEMPLATE_APPROVAL_INVALID_TRANSITION", "an approved version stays approved");

    const edited = await upsertCommunicationTemplateForTenant(author, { channel: "EMAIL", name: "Welcome", subject: "Hi", body: "Hello again" } as any);
    check(edited.version === 2 && edited.approvalStatus === "DRAFT", "editing creates a new Draft version");
    await rejects(() => send(edited.id), "TEMPLATE_NOT_APPROVED", "which needs approval again before it sends");

    console.log(`template-approval-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
