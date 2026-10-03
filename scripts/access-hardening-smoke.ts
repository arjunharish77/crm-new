/**
 * Local-only real-database check for the access fixes made with My account (UI/UX plan Phase 3):
 *   - the workspace audit log: admins see every entry, anyone else only their own;
 *   - reviewing the audit log (status, comments, legal hold) is admin-only;
 *   - a record's history and notes are only for people who can open the record, and fields
 *     hidden from the user stay hidden in the history;
 *   - pinning a note needs access to its record;
 *   - only the owner or an admin can change or delete a custom report, or delete an export
 *     template.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/access-hardening-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import {
  createCustomReportForTenant,
  createNoteForTenant,
  deleteCustomReportForTenant,
  getGovernanceHistoryForTenant,
  listAuditLogsForTenant,
  listNotesForTenant,
  toggleNotePinForTenant,
  updateCustomReportForTenant,
} from "../src/lib/server/crm";
import { addAuditLogComment, listAuditLogComments, setAuditLogLegalHold, updateAuditLogReview } from "../src/lib/server/audit-review";
import { createExportTemplateForTenant, deleteExportTemplateForTenant } from "../src/lib/server/exports";
import { createLeadForTenant } from "../src/lib/repositories/leads-postgres";

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
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Access hardening smoke', now())`, [tenantId]);
    const adminRole = randomUUID();
    const repRole = randomUUID();
    const repPermissions = { recordAccess: "OWN", fieldPermissions: { leads: { email: "hidden" } } };
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke admin', '{"recordAccess":"ALL"}', now()), ($3, $2, 'Smoke rep', $4, now())`, [adminRole, tenantId, repRole, JSON.stringify(repPermissions)]);
    const ids = { admin: randomUUID(), rep: randomUUID(), other: randomUUID() };
    for (const [label, id] of Object.entries(ids)) {
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, $4, 'x', $5, now())`, [id, tenantId, `access.${label}.${id.slice(0, 6)}@smoke.invalid`, `Smoke ${label}`, label === "admin" ? adminRole : repRole]);
    }
    const admin = { id: ids.admin, tenantId, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL" } } } as any;
    const rep = { id: ids.rep, tenantId, isTenantAdmin: false, role: { permissions: repPermissions } } as any;
    const other = { id: ids.other, tenantId, isTenantAdmin: false, role: { permissions: repPermissions } } as any;

    // Records owned by each rep (created as the admin, then given to them).
    const repLead = await createLeadForTenant(admin, { name: "Rep lead", email: "rep.lead@smoke.invalid" });
    const otherLead = await createLeadForTenant(admin, { name: "Other lead", email: "other.lead@smoke.invalid" });
    await q(`update "Lead" set "ownerId" = $1 where id = $2`, [ids.rep, repLead.id]);
    await q(`update "Lead" set "ownerId" = $1 where id = $2`, [ids.other, otherLead.id]);
    for (const [user, label] of [[rep, "rep"], [other, "other"]] as const) {
      await q(`insert into "AuditLog" (id, "tenantId", "userId", action, "entityType", "entityId", "createdAt") values ($1, $2, $3, 'EXECUTE', 'COMMAND', $4, now())`, [randomUUID(), tenantId, user.id, `smoke-${label}`]);
    }

    // Audit log.
    const repLogs = await listAuditLogsForTenant(rep, {});
    check(repLogs.length > 0 && repLogs.every((entry: any) => entry.user?.id === ids.rep), "a non-admin sees only their own audit entries");
    const repAsksForOther = await listAuditLogsForTenant(rep, { userId: ids.other });
    check(repAsksForOther.every((entry: any) => entry.user?.id === ids.rep), "asking for someone else's entries still returns only your own");
    const adminLogs = await listAuditLogsForTenant(admin, {});
    check(adminLogs.some((entry: any) => entry.user?.id === ids.other) && adminLogs.some((entry: any) => entry.user?.id === ids.rep), "an admin sees everyone's entries");
    const someEntry = adminLogs[0].id;
    await rejects(() => updateAuditLogReview(rep, someEntry, { reviewStatus: "RESOLVED" }), "FORBIDDEN", "a non-admin can't review an audit entry");
    await rejects(() => addAuditLogComment(rep, someEntry, "hi"), "FORBIDDEN", "a non-admin can't comment on an audit entry");
    await rejects(() => listAuditLogComments(rep, someEntry), "FORBIDDEN", "a non-admin can't read audit comments");
    await rejects(() => setAuditLogLegalHold(rep, someEntry, true), "FORBIDDEN", "a non-admin can't set legal hold");
    await updateAuditLogReview(admin, someEntry, { reviewStatus: "IN_REVIEW" });
    check((await q(`select "reviewStatus" from "AuditLog" where id = $1`, [someEntry])).rows[0].reviewStatus === "IN_REVIEW", "an admin can review an audit entry");

    // Record history.
    await rejects(() => getGovernanceHistoryForTenant(rep, "LEAD", otherLead.id), "HISTORY_NOT_FOUND", "a rep can't read the history of someone else's lead");
    const history = await getGovernanceHistoryForTenant(rep, "LEAD", repLead.id);
    check(history.length > 0, "a rep can read the history of their own lead");
    check(history.every((item: any) => !item.changes.after || !("email" in item.changes.after)), "a field hidden from the rep stays hidden in the history");
    const adminHistory = await getGovernanceHistoryForTenant(admin, "LEAD", repLead.id);
    check(adminHistory.some((item: any) => item.changes.after?.email === "rep.lead@smoke.invalid"), "an admin still sees the field");
    await rejects(() => getGovernanceHistoryForTenant(rep, "ROLE", repRole), "HISTORY_NOT_FOUND", "settings history is admin-only");

    // Notes.
    await rejects(() => listNotesForTenant(rep, "lead", otherLead.id), "RECORD_NOT_FOUND", "a rep can't read notes on someone else's lead");
    await rejects(() => createNoteForTenant(rep, "lead", otherLead.id, "Sneaky"), "RECORD_NOT_FOUND", "a rep can't add a note to someone else's lead");
    check((await q(`select count(*)::int n from "Note" where "entityId" = $1`, [otherLead.id])).rows[0].n === 0, "no note was written");
    const otherNote = await createNoteForTenant(other, "lead", otherLead.id, "Mine");
    const ownNote = await createNoteForTenant(rep, "lead", repLead.id, "Mine too");
    check((await listNotesForTenant(rep, "lead", repLead.id)).some((note: any) => note.id === ownNote.id), "a rep can read and add notes on their own lead");
    await rejects(() => toggleNotePinForTenant(rep, otherNote.id), "NOTE_NOT_FOUND", "a rep can't pin a note on someone else's lead");
    check((await q(`select "isPinned" from "Note" where id = $1`, [otherNote.id])).rows[0].isPinned === false, "the note isn't pinned");

    // Custom reports.
    const report = await createCustomReportForTenant(other, { name: "Other's report", module: "LEADS", config: {}, chartType: "TABLE" } as any);
    await rejects(() => updateCustomReportForTenant(rep, report.id, { name: "Hijacked", module: "LEADS", config: {} } as any), "FORBIDDEN", "only the owner or an admin can change a report");
    await rejects(() => deleteCustomReportForTenant(rep, report.id), "FORBIDDEN", "only the owner or an admin can delete a report");
    check((await q(`select name from "CustomReport" where id = $1`, [report.id])).rows[0]?.name === "Other's report", "the report is unchanged");
    check((await updateCustomReportForTenant(other, report.id, { name: "Renamed", module: "LEADS", config: {} } as any))?.name === "Renamed", "the owner can change their report");
    await deleteCustomReportForTenant(admin, report.id);
    // Delete archives a report (decision 31): it's kept, marked archived, for 30 days.
    check((await q(`select "deletedAt" is not null as archived from "CustomReport" where id = $1`, [report.id])).rows[0]?.archived === true, "an admin can delete (archive) it");

    // Export templates.
    const template = await createExportTemplateForTenant(other, { name: "Other's template", moduleName: "LEADS", columns: ["name"] });
    await rejects(() => deleteExportTemplateForTenant(rep, template.id), "EXPORT_TEMPLATE_NOT_FOUND", "only the creator or an admin can delete an export template");
    check((await q(`select count(*)::int n from "ExportTemplate" where id = $1`, [template.id])).rows[0].n === 1, "the template still exists");
    await deleteExportTemplateForTenant(other, template.id);
    check((await q(`select "deletedAt" is not null as archived from "ExportTemplate" where id = $1`, [template.id])).rows[0]?.archived === true, "the creator can delete (archive) it");

    console.log(`access-hardening-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId" = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
