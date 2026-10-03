import { assertTenantModule } from "@/lib/server/module-entitlements";
import { randomUUID } from "crypto";
import { query, queryOne, execute } from "@/lib/db/query";
import { createAuditLog } from "@/lib/server/crm";
import { getLeadForTenant } from "@/lib/repositories/leads-postgres";
import { getOpportunityForTenant } from "@/lib/repositories/opportunities-postgres";
import { createTaskForTenant } from "@/lib/repositories/tasks-postgres";
import { runAutomationsForEvent } from "@/lib/repositories/automations-postgres";
import { removeCallFromQueue } from "@/lib/server/call-queues";
import { recordCallCampaignAttemptOutcome } from "@/lib/server/call-campaigns";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
};

// The fixed, known set of a disposition's own built-in capture fields that an admin can mark
// required per outcome -- deliberately not a full FieldDefinition/CustomFieldManager
// registration (the pattern OpportunityType/ActivityType use for genuinely open-ended custom
// fields), since this set is closed and specific to logging a call outcome.
const REQUIRABLE_FIELDS = new Set(["reasonLost", "interestLevel", "nextAction", "callbackAt", "notes"]);

function requireTenantId(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return user.tenantId;
}

function sanitizeRequiredFields(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item)).filter((item) => REQUIRABLE_FIELDS.has(item)))];
}

// ---- Disposition groups ----

export async function listDispositionGroupsForTenant(user: TenantUser) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const [groups, outcomes] = await Promise.all([
    query<any>(
      `select id, name, "order", "isActive", "createdAt", "updatedAt" from "DispositionGroup" where "tenantId" = $1 order by "order" asc, "createdAt" asc`,
      [tenantId],
    ),
    query<any>(
      `select id, "groupId", "parentOutcomeId", name, "order", "isActive", "requiredFields", "createdAt", "updatedAt"
       from "DispositionOutcome" where "tenantId" = $1 order by "order" asc, "createdAt" asc`,
      [tenantId],
    ),
  ]);
  const outcomesByGroup = new Map<string, any[]>();
  for (const outcome of outcomes) {
    const list = outcomesByGroup.get(outcome.groupId) ?? [];
    list.push(outcome);
    outcomesByGroup.set(outcome.groupId, list);
  }
  return groups.map((group) => ({ ...group, outcomes: outcomesByGroup.get(group.id) ?? [] }));
}

export async function createDispositionGroupForTenant(user: TenantUser, input: Record<string, unknown>) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("NAME_REQUIRED");
  const now = new Date().toISOString();
  const last = await queryOne<{ order: number }>(
    `select "order" from "DispositionGroup" where "tenantId" = $1 order by "order" desc limit 1`,
    [tenantId],
  );
  const order = typeof input.order === "number" ? Number(input.order) : Number(last?.order ?? 0) + 1;
  const row = await queryOne<any>(
    `insert into "DispositionGroup" (id, "tenantId", name, "order", "isActive", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $6)
     returning id, name, "order", "isActive", "createdAt", "updatedAt"`,
    [randomUUID(), tenantId, name, order, input.isActive !== false, now],
  );
  await createAuditLog(user, "CREATE", "DISPOSITION_GROUP", row!.id, null, row, null).catch(() => undefined);
  return row;
}

export async function updateDispositionGroupForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const sets: string[] = [];
  const values: unknown[] = [];
  let index = 1;
  if ("name" in input) {
    const name = String(input.name ?? "").trim();
    if (!name) throw new Error("NAME_REQUIRED");
    sets.push(`name = $${index++}`);
    values.push(name);
  }
  if ("order" in input) {
    sets.push(`"order" = $${index++}`);
    values.push(Number(input.order ?? 0));
  }
  if ("isActive" in input) {
    sets.push(`"isActive" = $${index++}`);
    values.push(input.isActive !== false);
  }
  sets.push(`"updatedAt" = $${index++}`);
  values.push(new Date().toISOString());
  values.push(tenantId, id);
  const row = await queryOne<any>(
    `update "DispositionGroup" set ${sets.join(", ")} where "tenantId" = $${index++} and id = $${index}
     returning id, name, "order", "isActive", "createdAt", "updatedAt"`,
    values,
  );
  if (!row) throw new Error("DISPOSITION_GROUP_NOT_FOUND");
  await createAuditLog(user, "UPDATE", "DISPOSITION_GROUP", row.id, null, row, null).catch(() => undefined);
  return row;
}

export async function deleteDispositionGroupForTenant(user: TenantUser, id: string) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  await execute(`delete from "DispositionGroup" where "tenantId" = $1 and id = $2`, [tenantId, id]);
  await createAuditLog(user, "DELETE", "DISPOSITION_GROUP", id, null, null, null).catch(() => undefined);
}

export async function reorderDispositionGroupsForTenant(user: TenantUser, ids: string[]) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const now = new Date().toISOString();
  await Promise.all(
    ids.map((id, index) =>
      execute(`update "DispositionGroup" set "order" = $1, "updatedAt" = $2 where "tenantId" = $3 and id = $4`, [
        index + 1,
        now,
        tenantId,
        id,
      ]),
    ),
  );
}

// ---- Disposition outcomes ----

export async function createDispositionOutcomeForTenant(user: TenantUser, groupId: string, input: Record<string, unknown>) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("NAME_REQUIRED");
  const group = await queryOne<any>(`select id from "DispositionGroup" where "tenantId" = $1 and id = $2`, [tenantId, groupId]);
  if (!group) throw new Error("DISPOSITION_GROUP_NOT_FOUND");
  const parentOutcomeId = input.parentOutcomeId ? String(input.parentOutcomeId) : null;
  if (parentOutcomeId) {
    const parent = await queryOne<any>(
      `select id from "DispositionOutcome" where "tenantId" = $1 and id = $2 and "groupId" = $3`,
      [tenantId, parentOutcomeId, groupId],
    );
    if (!parent) throw new Error("PARENT_OUTCOME_NOT_FOUND");
  }
  const now = new Date().toISOString();
  const last = await queryOne<{ order: number }>(
    `select "order" from "DispositionOutcome" where "tenantId" = $1 and "groupId" = $2 order by "order" desc limit 1`,
    [tenantId, groupId],
  );
  const order = typeof input.order === "number" ? Number(input.order) : Number(last?.order ?? 0) + 1;
  const row = await queryOne<any>(
    `insert into "DispositionOutcome" (id, "tenantId", "groupId", "parentOutcomeId", name, "order", "isActive", "requiredFields", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
     returning id, "groupId", "parentOutcomeId", name, "order", "isActive", "requiredFields", "createdAt", "updatedAt"`,
    [
      randomUUID(),
      tenantId,
      groupId,
      parentOutcomeId,
      name,
      order,
      input.isActive !== false,
      JSON.stringify(sanitizeRequiredFields(input.requiredFields)),
      now,
    ],
  );
  await createAuditLog(user, "CREATE", "DISPOSITION_OUTCOME", row!.id, null, row, null).catch(() => undefined);
  return row;
}

export async function updateDispositionOutcomeForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const sets: string[] = [];
  const values: unknown[] = [];
  let index = 1;
  if ("name" in input) {
    const name = String(input.name ?? "").trim();
    if (!name) throw new Error("NAME_REQUIRED");
    sets.push(`name = $${index++}`);
    values.push(name);
  }
  if ("order" in input) {
    sets.push(`"order" = $${index++}`);
    values.push(Number(input.order ?? 0));
  }
  if ("isActive" in input) {
    sets.push(`"isActive" = $${index++}`);
    values.push(input.isActive !== false);
  }
  if ("requiredFields" in input) {
    sets.push(`"requiredFields" = $${index++}`);
    values.push(JSON.stringify(sanitizeRequiredFields(input.requiredFields)));
  }
  sets.push(`"updatedAt" = $${index++}`);
  values.push(new Date().toISOString());
  values.push(tenantId, id);
  const row = await queryOne<any>(
    `update "DispositionOutcome" set ${sets.join(", ")} where "tenantId" = $${index++} and id = $${index}
     returning id, "groupId", "parentOutcomeId", name, "order", "isActive", "requiredFields", "createdAt", "updatedAt"`,
    values,
  );
  if (!row) throw new Error("DISPOSITION_OUTCOME_NOT_FOUND");
  await createAuditLog(user, "UPDATE", "DISPOSITION_OUTCOME", row.id, null, row, null).catch(() => undefined);
  return row;
}

export async function deleteDispositionOutcomeForTenant(user: TenantUser, id: string) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  await execute(`delete from "DispositionOutcome" where "tenantId" = $1 and id = $2`, [tenantId, id]);
  await createAuditLog(user, "DELETE", "DISPOSITION_OUTCOME", id, null, null, null).catch(() => undefined);
}

export async function reorderDispositionOutcomesForTenant(user: TenantUser, groupId: string, ids: string[]) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const now = new Date().toISOString();
  await Promise.all(
    ids.map((id, index) =>
      execute(
        `update "DispositionOutcome" set "order" = $1, "updatedAt" = $2 where "tenantId" = $3 and "groupId" = $4 and id = $5`,
        [index + 1, now, tenantId, groupId, id],
      ),
    ),
  );
}

// ---- Logging a call disposition ----

export type LogCallDispositionInput = {
  callLogId?: string | null;
  leadId?: string | null;
  opportunityId?: string | null;
  activityId?: string | null;
  dispositionOutcomeId: string;
  reasonLost?: string | null;
  interestLevel?: "HOT" | "WARM" | "COLD" | null;
  nextAction?: string | null;
  callbackAt?: string | null;
  notes?: string | null;
  campaignMemberId?: string | null;
};

export async function listCallDispositionsForTenant(
  user: TenantUser,
  filter: { leadId?: string | null; opportunityId?: string | null; callLogId?: string | null; createdBy?: string | null } = {},
) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const conditions = [`cd."tenantId" = $1`];
  const values: unknown[] = [tenantId];
  if (filter.leadId) {
    conditions.push(`cd."leadId" = $${values.length + 1}`);
    values.push(filter.leadId);
  }
  if (filter.opportunityId) {
    conditions.push(`cd."opportunityId" = $${values.length + 1}`);
    values.push(filter.opportunityId);
  }
  if (filter.callLogId) {
    conditions.push(`cd."callLogId" = $${values.length + 1}`);
    values.push(filter.callLogId);
  }
  if (filter.createdBy) {
    conditions.push(`cd."createdBy" = $${values.length + 1}`);
    values.push(filter.createdBy);
  }
  return query<any>(
    `select cd.*, o.name as "outcomeName", g.name as "groupName"
     from "CallDisposition" cd
     left join "DispositionOutcome" o on o.id = cd."dispositionOutcomeId"
     left join "DispositionGroup" g on g.id = o."groupId"
     where ${conditions.join(" and ")}
     order by cd."createdAt" desc
     limit 100`,
    values,
  );
}

// Reuses Task.dueAt as this app's existing "do X at time Y" mechanism for the disposition's
// "callback date/time" field, rather than inventing a parallel scheduling concept -- matches
// the checklist audit's own recommendation and gives callback tasks the SLA/reminder/
// notification machinery Task already has for free.
export async function logCallDispositionForTenant(user: TenantUser, input: LogCallDispositionInput) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  if (!input.dispositionOutcomeId) throw new Error("DISPOSITION_OUTCOME_REQUIRED");

  const outcome = await queryOne<any>(
    `select id, "groupId", name, "requiredFields" from "DispositionOutcome" where "tenantId" = $1 and id = $2`,
    [tenantId, input.dispositionOutcomeId],
  );
  if (!outcome) throw new Error("DISPOSITION_OUTCOME_NOT_FOUND");

  const requiredFields: string[] = Array.isArray(outcome.requiredFields) ? outcome.requiredFields : [];
  for (const field of requiredFields) {
    const value = (input as Record<string, unknown>)[field];
    if (value === null || value === undefined || value === "") {
      throw new Error(`DISPOSITION_FIELD_REQUIRED:${field}`);
    }
  }

  // Record-access-scoped lookups (not raw tenant-only queries) so a disposition can't be
  // logged against a Lead/Opportunity the calling user isn't allowed to see -- same fix this
  // session already applied to click-to-call's own lookup.
  let lead: any = null;
  let opportunity: any = null;
  if (input.leadId) {
    lead = await getLeadForTenant(user, input.leadId);
    if (!lead) throw new Error("LEAD_NOT_FOUND");
  }
  if (input.opportunityId) {
    opportunity = await getOpportunityForTenant(user, input.opportunityId);
    if (!opportunity) throw new Error("OPPORTUNITY_NOT_FOUND");
  }

  let taskId: string | null = null;
  if (input.callbackAt) {
    const task = await createTaskForTenant(user, {
      title: input.nextAction ? `Callback: ${input.nextAction}` : `Callback -- ${outcome.name}`,
      description: input.notes || null,
      priority: "MEDIUM",
      leadId: input.leadId || null,
      opportunityId: input.opportunityId || null,
      activityId: input.activityId || null,
      dueAt: input.callbackAt,
      reminderAt: input.callbackAt,
    }).catch(() => null);
    taskId = task?.id ?? null;
  }

  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "CallDisposition" (
       id, "tenantId", "callLogId", "leadId", "opportunityId", "activityId", "dispositionOutcomeId",
       "reasonLost", "interestLevel", "nextAction", "callbackAt", notes, "taskId", "createdBy", "createdAt"
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     returning *`,
    [
      randomUUID(),
      tenantId,
      input.callLogId || null,
      input.leadId || null,
      input.opportunityId || null,
      input.activityId || null,
      input.dispositionOutcomeId,
      input.reasonLost || null,
      input.interestLevel || null,
      input.nextAction || null,
      input.callbackAt || null,
      input.notes || null,
      taskId,
      user.id,
      now,
    ],
  );

  await createAuditLog(user, "CREATE", "CALL_DISPOSITION", row!.id, null, row, null).catch(() => undefined);

  // A disposed call is resolved -- drop it out of the call-queue backlog rather than leaving
  // it sitting there indefinitely after the agent already handled it.
  if (input.callLogId) {
    await removeCallFromQueue(tenantId, input.callLogId).catch(() => undefined);
  }

  // Logging a disposition against a campaign call finalizes that member's attempt -- COMPLETED,
  // or CALLBACK_SCHEDULED (paused until the requested time) when a callback was set. This is
  // the one action that both logs the outcome AND advances the campaign, rather than requiring
  // the agent to do two separate things for the same call.
  if (input.campaignMemberId) {
    await recordCallCampaignAttemptOutcome(user, input.campaignMemberId, { callbackAt: input.callbackAt ?? null, disposed: true }).catch(() => undefined);
  }

  // Reuses the exact same automation dispatcher every other entity-scoped trigger in this
  // engine already fires through (LEAD_CREATED/OPPORTUNITY_CREATED/CALL_COMPLETED/etc.) --
  // this closes the "disposition-selected" trigger that the telephony-automations checklist
  // bullet's own prior pass explicitly flagged as blocked on this framework not existing yet.
  if (input.leadId) {
    await runAutomationsForEvent(user, "DISPOSITION_SELECTED", "LEAD", input.leadId, { ...lead, dispositionOutcomeName: outcome.name }).catch(() => undefined);
  } else if (input.opportunityId) {
    await runAutomationsForEvent(user, "DISPOSITION_SELECTED", "OPPORTUNITY", input.opportunityId, { ...opportunity, dispositionOutcomeName: outcome.name }).catch(() => undefined);
  }

  return row;
}
