/**
 * Local-only real-database check for data retention (decisions confirmed 2026-10-01):
 *   - a new policy anonymizes nothing (lead/opportunity/activity periods are off until set);
 *     empty / 0 switches a period off;
 *   - with periods set, only closed/inactive records are anonymized: open leads/opportunities
 *     and activities on them are never touched, however old;
 *   - the preview counts exactly what enforcement then changes;
 *   - audit-log clean-up keeps its default and respects legal hold;
 *   - the worker enforces never/least-recently enforced policies first, once a day.
 * Two temporary tenants, removed afterwards.
 * Run: tsx scripts/retention-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { enforceDataRetentionForTenant, getOrCreateDataRetentionPolicyForTenantId, previewDataRetentionForTenant, processDueDataRetentionEnforcement, updateDataRetentionPolicyForTenantId } from "../src/lib/repositories/retention-postgres";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  const one = async (sql: string, args: unknown[] = []) => (await q(sql, args)).rows[0];
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const tenants: string[] = [];
  const old = "now() - interval '3 years'";

  try {
    const tenant = randomUUID();
    const other = randomUUID();
    tenants.push(tenant, other);
    for (const id of tenants) await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Retention smoke', now())`, [id]);
    const [object, role, user, type, openStage, closedStage, activityType] = Array.from({ length: 7 }, () => randomUUID());
    await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, 'lead', 'Lead', now())`, [object, tenant]);
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'R', '{}', now())`, [role, tenant]);
    await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'U', 'x', $4, now())`, [user, tenant, `r-${randomUUID()}@example.invalid`, role]);
    await q(`insert into "OpportunityType" (id, "tenantId", "objectId", name, "updatedAt") values ($1, $2, $3, 'T', now())`, [type, tenant, object]);
    await q(`insert into "StageDefinition" (id, "tenantId", "opportunityTypeId", name, "order", "isClosed", "updatedAt") values ($1, $3, $4, 'Open', 1, false, now()), ($2, $3, $4, 'Won', 2, true, now())`, [openStage, closedStage, tenant, type]);
    await q(`insert into "ActivityType" (id, "tenantId", "objectId", name, "updatedAt") values ($1, $2, $3, 'Call', now())`, [activityType, tenant, object]);

    const lead = async (status: string, when: string, deleted = false) => {
      const id = randomUUID();
      await q(`insert into "Lead" (id, "tenantId", "objectId", name, email, phone, status, "updatedAt", "deletedAt") values ($1, $2, $3, 'Real Person', 'p@example.invalid', '+910000000000', $4, ${when}, ${deleted ? "now() - interval '3 years'" : "null"})`, [id, tenant, object, status]);
      return id;
    };
    const opportunity = async (leadId: string, stage: string) => {
      const id = randomUUID();
      await q(`insert into "Opportunity" (id, "tenantId", "objectId", "leadId", "opportunityTypeId", "stageId", title, "updatedAt") values ($1, $2, $3, $4, $5, $6, 'Real deal', ${old})`, [id, tenant, object, leadId, type, stage]);
      return id;
    };
    const activity = async (leadId: string | null, opportunityId: string | null, when: string) => {
      const id = randomUUID();
      await q(`insert into "Activity" (id, "tenantId", "objectId", "typeId", "leadId", "opportunityId", notes, "createdBy", "updatedAt") values ($1, $2, $3, $4, $5, $6, 'Private notes', $7, ${when})`, [id, tenant, object, activityType, leadId, opportunityId, user]);
      return id;
    };
    const openOld = await lead("NEW", old);
    const qualifiedOld = await lead("Qualified", old);
    const lostOld = await lead("LOST", old);
    const convertedOld = await lead("converted", old);
    const deletedOpenOld = await lead("NEW", old, true);
    const lostRecent = await lead("LOST", "now()");
    const openOpp = await opportunity(openOld, openStage);
    const closedOpp = await opportunity(lostOld, closedStage);
    const actOnLost = await activity(lostOld, null, old);
    const actOnOpen = await activity(openOld, null, old);
    const actUnlinked = await activity(null, null, old);
    const actRecentOnLost = await activity(lostOld, null, "now()");
    const actOnClosedOppOpenLead = await activity(openOld, closedOpp, old);
    const actOnClosedOpp = await activity(lostOld, closedOpp, old);
    for (const [hold, when] of [[false, old], [true, old], [false, "now()"]] as const) {
      await q(`insert into "AuditLog" (id, "tenantId", "userId", action, "entityType", "entityId", "legalHold", "createdAt") values ($1, $2, $3, 'X', 'Lead', 'x', $4, ${when})`, [randomUUID(), tenant, user, hold]);
    }
    const leadName = async (id: string) => (await one(`select name from "Lead" where id = $1`, [id])).name;
    const notes = async (id: string) => (await one(`select notes from "Activity" where id = $1`, [id])).notes;

    // A new policy (e.g. created by saving one setting) anonymizes nothing.
    const created = await updateDataRetentionPolicyForTenantId(tenant, { auditLogRetentionDays: 400 }) as Record<string, unknown>;
    check(created.leadRetentionDays === null && created.opportunityRetentionDays === null && created.activityRetentionDays === null && created.deletedRecordsRetentionDays === 30, "a new policy has lead/opportunity/activity anonymization off");
    const first = await enforceDataRetentionForTenant(tenant);
    check(first.leadsAnonymized === 0 && first.opportunitiesAnonymized === 0 && first.activitiesAnonymized === 0 && (await leadName(lostOld)) === "Real Person", "enforcing a new policy anonymizes nothing");
    check(first.auditLogsDeleted === 1 && (await one(`select count(*)::int as n from "AuditLog" where "tenantId" = $1`, [tenant])).n === 2, "audit clean-up deletes old entries but keeps legal holds and recent ones");

    // Periods set: preview matches enforcement exactly; only closed/inactive records change.
    await updateDataRetentionPolicyForTenantId(tenant, { leadRetentionDays: 365, opportunityRetentionDays: 730, activityRetentionDays: 180 });
    const preview = await previewDataRetentionForTenant(tenant);
    check(preview.leadsAnonymized === 3 && preview.opportunitiesAnonymized === 1 && preview.activitiesAnonymized === 2, `preview counts closed records only (${JSON.stringify(preview)})`);
    const enforced = await enforceDataRetentionForTenant(tenant);
    check(JSON.stringify(enforced) === JSON.stringify({ ...preview, auditLogsDeleted: 0 }), "enforcement changes exactly what the preview counted");
    check((await leadName(lostOld)) === "[Retained data purged]" && (await leadName(convertedOld)) === "[Retained data purged]" && (await leadName(deletedOpenOld)) === "[Retained data purged]", "lost, converted (any case) and deleted leads anonymized");
    check((await one(`select email, phone from "Lead" where id = $1`, [lostOld])).email === null, "contact details removed");
    check((await leadName(openOld)) === "Real Person" && (await leadName(qualifiedOld)) === "Real Person" && (await leadName(lostRecent)) === "Real Person", "open leads (however old) and recently updated closed leads untouched");
    check((await one(`select title from "Opportunity" where id = $1`, [openOpp])).title === "Real deal" && (await one(`select title from "Opportunity" where id = $1`, [closedOpp])).title === "[Retained data purged]", "only the opportunity in a closed stage anonymized");
    check((await notes(actOnLost)) === null && (await notes(actOnClosedOpp)) === null, "notes on activities of closed records removed");
    check((await notes(actOnOpen)) === "Private notes" && (await notes(actUnlinked)) === "Private notes" && (await notes(actRecentOnLost)) === "Private notes" && (await notes(actOnClosedOppOpenLead)) === "Private notes",
      "notes kept on open records, unlinked activities, recent activities, and activities that also link an open lead");
    const again = await previewDataRetentionForTenant(tenant);
    check(again.leadsAnonymized === 0 && again.opportunitiesAnonymized === 0 && again.activitiesAnonymized === 0, "a second run has nothing left to do");

    // Empty / 0 switch a period off; negative or fractional values are refused.
    const off = await updateDataRetentionPolicyForTenantId(tenant, { leadRetentionDays: 0, opportunityRetentionDays: "" as never, auditLogRetentionDays: null }) as Record<string, unknown>;
    check(off.leadRetentionDays === null && off.opportunityRetentionDays === null && off.auditLogRetentionDays === null, "0, empty and null switch a period off");
    await assert.rejects(updateDataRetentionPolicyForTenantId(tenant, { leadRetentionDays: -5 }), /INVALID_LEADRETENTIONDAYS/);
    await assert.rejects(updateDataRetentionPolicyForTenantId(tenant, { leadRetentionDays: 1.5 }), /INVALID_LEADRETENTIONDAYS/);
    checks++;

    // Worker: never-enforced first, recently enforced skipped.
    await getOrCreateDataRetentionPolicyForTenantId(other);
    const due = await processDueDataRetentionEnforcement(1);
    check(due.processed[0]?.tenantId === other || (await one(`select "lastEnforcedAt" from "DataRetentionPolicy" where "tenantId" = $1`, [other])).lastEnforcedAt, "a never-enforced policy is picked before ones enforced today");
    const later = await processDueDataRetentionEnforcement(100000);
    check(!later.processed.some((row) => tenants.includes(row.tenantId)), "policies enforced within the last day are not run again");

    console.log(JSON.stringify({ status: "passed", checks }));
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (const id of tenants) {
      for (let pass = 0; pass < 8; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId" = $1`, [id]).catch(() => undefined);
      await q(`delete from "Tenant" where id = $1`, [id]);
    }
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
