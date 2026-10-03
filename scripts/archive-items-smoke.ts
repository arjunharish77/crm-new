/**
 * Local-only real-database check for archive and restore on configuration items (decision 31,
 * extended 2026-10-03):
 *   - deleting a Smart View, report, assignment or scoring rule, commission rule or template
 *     archives it: it leaves its list and stops applying at once (an archived commission rule no
 *     longer resolves; an archived view can't be a campaign audience), and Restore brings it back;
 *   - only the owner or an admin can archive or restore an owner's item; rules are admin-only;
 *   - delete for good needs it archived first, and a commission rule a ledger points at is kept;
 *   - the purge removes items archived over 30 days ago and keeps newer and in-use ones;
 *   - a campaign audience from a view with a filter the server can't apply is refused, not widened.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/archive-items-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { deleteArchivedItemForTenant, listArchivedItemsForTenant, purgeArchivedItems, restoreItemForTenant } from "../src/lib/server/archive-items";
import { deleteSavedViewForTenant } from "../src/lib/repositories/views-postgres";
import { deleteCustomReportForTenant, listCustomReportsForTenant } from "../src/lib/repositories/reports-dashboards-postgres";
import { deleteAssignmentRuleForTenant, deleteLeadScoringRuleForTenant, listAssignmentRulesForTenant, listLeadScoringRulesForTenant } from "../src/lib/server/admin-modules";
import { deleteCommissionRuleForTenant, resolveCommissionRule } from "../src/lib/server/commission";
import { deleteExportTemplateForTenant, listExportTemplatesForTenant } from "../src/lib/server/exports";
import { previewMarketingCampaignAudienceForTenant } from "../src/lib/server/marketing-communications";

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
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Archive items smoke', now())`, [tenantId]);
    const roles: Record<string, string> = { OWN: randomUUID(), ALL: randomUUID() };
    for (const [recordAccess, id] of Object.entries(roles)) {
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, $3, $4, now())`, [id, tenantId, `Smoke ${recordAccess}`, { recordAccess }]);
    }
    const person = async (admin: boolean) => {
      const id = randomUUID();
      const recordAccess = admin ? "ALL" : "OWN";
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [id, tenantId, `archive.${id.slice(0, 8)}@smoke.invalid`, roles[recordAccess]]);
      return { id, tenantId, isTenantAdmin: admin, role: { permissions: { recordAccess } } } as any;
    };
    const admin = await person(true);
    const rep = await person(false);
    const other = await person(false);
    const archivedNames = async (user: any, kind: any) => (await listArchivedItemsForTenant(user, kind)).map((row) => row.name);

    // Smart View (owner item)
    const viewId = randomUUID();
    await q(`insert into "CustomReport" (id, "tenantId", name, module, config, "chartType", "createdBy", "updatedAt") values ($1, $2, 'Hot leads', 'LEADS', $3, 'SAVED_VIEW', $4, now())`,
      [viewId, tenantId, { tabs: [{ id: "t", name: "Leads", module: "LEADS", filters: { logic: "AND", conditions: [] } }] }, rep.id]);
    await assert.rejects(() => deleteSavedViewForTenant(other, viewId), (error: any) => error?.message === "FORBIDDEN"); checks++; // someone else can't delete it
    const archivedView: any = await deleteSavedViewForTenant(rep, viewId);
    check(archivedView?.purgeAfter, "deleting a Smart View archives it, with a purge date");
    check((await archivedNames(rep, "saved-view")).includes("Hot leads"), "it's listed under Recently deleted for its owner");
    check(!(await archivedNames(other, "saved-view")).includes("Hot leads"), "but not for someone else");
    await q(`insert into "MarketingCampaign" (id, "tenantId", name, channel, "audienceType", "audienceConfig") values ($1, $2, 'Smoke', 'EMAIL', 'SAVED_VIEW', $3)`, [randomUUID(), tenantId, { savedViewId: viewId }]);
    await rejects(() => previewMarketingCampaignAudienceForTenant(admin, { channel: "EMAIL", audienceType: "SAVED_VIEW", audienceConfig: { savedViewId: viewId } } as any), "AUDIENCE_VIEW_NOT_FOUND", "an archived view can't be an audience (it used to mean every lead)");
    await rejects(() => restoreItemForTenant(other, "saved-view", viewId), "ARCHIVE_ITEM_NOT_FOUND", "someone else can't restore it");
    await restoreItemForTenant(rep, "saved-view", viewId);
    check((await previewMarketingCampaignAudienceForTenant(admin, { channel: "EMAIL", audienceType: "SAVED_VIEW", audienceConfig: { savedViewId: viewId } } as any)) !== null, "restored, it works as an audience again");
    await q(`update "CustomReport" set config = $2 where id = $1`, [viewId, { tabs: [{ id: "t", name: "Leads", module: "LEADS", filters: { logic: "AND", conditions: [{ id: "c", field: "pendingNbaCount", operator: "greater_than", value: "0" }] } }] }]);
    await rejects(() => previewMarketingCampaignAudienceForTenant(admin, { channel: "EMAIL", audienceType: "SAVED_VIEW", audienceConfig: { savedViewId: viewId } } as any), "AUDIENCE_FILTER_UNSUPPORTED", "a view filter the server can't apply stops the send instead of widening it");

    // Custom report
    const reportId = randomUUID();
    await q(`insert into "CustomReport" (id, "tenantId", name, module, config, "chartType", "isPublic", "createdBy", "updatedAt") values ($1, $2, 'Pipeline', 'LEADS', '{}', 'TABLE', true, $3, now())`, [reportId, tenantId, rep.id]);
    await deleteCustomReportForTenant(rep, reportId);
    check(!(await listCustomReportsForTenant(admin)).some((row: any) => row.id === reportId), "an archived report leaves the list");
    await restoreItemForTenant(admin, "custom-report", reportId);
    check((await listCustomReportsForTenant(rep)).some((row: any) => row.id === reportId), "an admin can restore it");

    // Assignment and scoring rules (admin-only)
    const assignmentId = randomUUID();
    await q(`insert into "AssignmentRule" (id, "tenantId", name, "entityType", priority, "isActive", strategy, "isDefault", "updatedAt") values ($1, $2, 'Round robin', 'LEAD', 1, true, 'ROUND_ROBIN', false, now())`, [assignmentId, tenantId]);
    await deleteAssignmentRuleForTenant(admin, assignmentId);
    check(!(await listAssignmentRulesForTenant(admin)).some((row: any) => row.id === assignmentId), "an archived assignment rule leaves the list");
    await rejects(() => listArchivedItemsForTenant(rep, "assignment-rule"), "FORBIDDEN", "archived rules are admin-only");
    const scoringId = randomUUID();
    await q(`insert into "LeadScoringRule" (id, "tenantId", name, "fieldKey", operator, "scoreChange", "isActive", "order", "updatedAt") values ($1, $2, 'Has email', 'email', 'is_not_empty', 10, true, 0, now())`, [scoringId, tenantId]);
    await deleteLeadScoringRuleForTenant(admin, scoringId);
    check(!(await listLeadScoringRulesForTenant(admin)).some((row: any) => row.id === scoringId), "an archived scoring rule no longer scores (the engine reads this list)");

    // Commission rule: stops resolving; kept when a ledger points at it
    const commissionId = randomUUID();
    await q(`insert into "CommissionRule" (id, "tenantId", name, "ruleType", value, priority, "isActive") values ($1, $2, 'Flat 100', 'FLAT', 100, 1, true)`, [commissionId, tenantId]);
    const partnerId = rep.id; // the ledger's partner is a user
    check((await resolveCommissionRule(tenantId, { partnerId, record: {} }))?.id === commissionId, "a live commission rule resolves");
    await deleteCommissionRuleForTenant(admin, commissionId);
    check((await resolveCommissionRule(tenantId, { partnerId, record: {} })) === null, "an archived commission rule stops applying");
    await rejects(() => deleteArchivedItemForTenant(admin, "export-template", commissionId), "ARCHIVE_ITEM_NOT_FOUND", "kinds don't mix");
    await q(`insert into "CommissionLedger" (id, "tenantId", "partnerId", "entryType", "commissionAmount", "commissionRuleId") values ($1, $2, $3, 'EARNED', 100, $4)`, [randomUUID(), tenantId, partnerId, commissionId]).catch(async (error) => {
      throw new Error(`ledger fixture: ${error.message}`);
    });
    await rejects(() => deleteArchivedItemForTenant(admin, "commission-rule", commissionId), "ARCHIVE_ITEM_IN_USE", "a rule a ledger points at isn't deleted for good");

    // Export template (owner item): delete for good needs it archived first
    const templateId = randomUUID();
    await q(`insert into "ExportTemplate" (id, "tenantId", name, "moduleName", "createdBy") values ($1, $2, 'Weekly leads', 'LEADS', $3)`, [templateId, tenantId, rep.id]);
    await rejects(() => deleteArchivedItemForTenant(rep, "export-template", templateId), "ARCHIVE_ITEM_NOT_ARCHIVED", "delete for good needs it archived first");
    await rejects(() => deleteExportTemplateForTenant(other, templateId), "EXPORT_TEMPLATE_NOT_FOUND", "someone else can't archive another person's template");
    await deleteExportTemplateForTenant(rep, templateId);
    check(!(await listExportTemplatesForTenant(rep)).some((row: any) => row.id === templateId), "an archived export template leaves the list");

    // Purge: over 30 days archived goes, newer stays, in-use stays
    await q(`update "ExportTemplate" set "deletedAt" = now() - interval '31 days' where id = $1`, [templateId]);
    await q(`update "CommissionRule" set "deletedAt" = now() - interval '31 days' where id = $1`, [commissionId]);
    await purgeArchivedItems(500);
    check((await q(`select 1 from "ExportTemplate" where id = $1`, [templateId])).rowCount === 0, "the purge removes an item archived over 30 days ago");
    check((await q(`select 1 from "CommissionRule" where id = $1`, [commissionId])).rowCount === 1, "but keeps a rule a ledger points at");
    check((await q(`select 1 from "AssignmentRule" where id = $1`, [assignmentId])).rowCount === 1, "and keeps one archived recently");
    await deleteArchivedItemForTenant(admin, "assignment-rule", assignmentId);
    check((await q(`select 1 from "AssignmentRule" where id = $1`, [assignmentId])).rowCount === 0, "delete for good removes an archived item");

    console.log(`archive-items-smoke: ${checks} checks passed`);
  } finally {
    // The commission ledger is append-only (a trigger blocks deletes), so its test row is removed
    // over the direct connection with triggers skipped for that statement.
    const { Client } = require("pg");
    const direct = new Client({ connectionString: d.directDatabaseUrl() });
    await direct.connect();
    try {
      await direct.query("begin");
      await direct.query("set local session_replication_role = replica");
      await direct.query(`delete from "CommissionLedger" where "tenantId" = $1`, [tenantId]);
      await direct.query("commit");
    } finally {
      await direct.end();
    }
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
