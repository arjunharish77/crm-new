import { randomUUID } from "crypto";
import { execute, query, queryOne, queryAsSystem, type Queryable } from "@/lib/db/query";
import { withTransaction, type TransactionClient } from "@/lib/db/transaction";
import { DatabaseError } from "@/lib/db/errors";
import { assertModuleEnabled, isModuleEnabledForTenant } from "@/lib/server/module-entitlements";
import { runAutomationsForEvent } from "@/lib/repositories/automations-postgres";
import { createUserNotification } from "@/lib/server/notifications";
import { enqueueWebhookEvent, type WebhookEventType } from "@/lib/server/webhook-outbox";
import { enqueueAppEvent } from "@/lib/server/marketplace-events";

// Gap checklist Module 16's app event bus, "case" event domain -- previously undelivered since
// no automation-trigger-equivalent hook existed for Case at the time of that pass; confirmed
// real now (this file's own runAutomationsForEvent calls), so wired the same way
// ACTIVITY_CREATED/ACTIVITY_UPDATED already were. Reuses the exact same event name Case's own
// internal automation triggers already use at each call site below (not collapsed to a coarser
// CREATED/UPDATED pair) -- Case's internal vocabulary is already a fixed, bounded, meaningful
// set (9 names), so an external subscriber gets the same real granularity automations do.
async function emitCaseBusEvent(tenantId: string | null, eventType: WebhookEventType, payload: Record<string, unknown>) {
  await enqueueWebhookEvent(tenantId, eventType, payload).catch(() => undefined);
  await enqueueAppEvent(tenantId, eventType, payload).catch(() => undefined);
}

type TenantUser = {
  id: string;
  tenantId: string | null;
  isPlatformAdmin?: boolean;
};

function requireTenantId(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return user.tenantId;
}

async function assertServiceDeskEnabled(user: TenantUser) {
  const tenantId = requireTenantId(user);
  await assertModuleEnabled(tenantId, "SERVICE_DESK", { isPlatformAdmin: user.isPlatformAdmin });
  return tenantId;
}

function isForeignKeyViolation(error: unknown) {
  return error instanceof DatabaseError && error.code === "23503";
}

const CASE_COLUMNS = `id, "tenantId", "caseNumber", subject, description, "typeId", "statusId", "priorityId", "queueId",
  "ownerId", "requesterName", "requesterEmail", "requesterPhone", "relatedLeadId", "relatedOpportunityId",
  "relatedPartnerId", "slaPolicyId", "firstResponseDueAt", "resolutionDueAt", "firstRespondedAt", "resolvedAt",
  "closedAt", "reopenedCount", "resolutionNotes", "createdBy", "createdAt", "updatedAt"`;

// ─── Tenant bootstrap: seeds sensible starter config the first time a tenant touches the
// Service Desk module, mirroring seedDefaultOpportunityType's "new tenant needs at least
// one usable config row" convention -- but lazy (on first access) rather than only at
// tenant-creation time, since this module ships after many tenants already exist. Guarded
// on CaseType existing at all so it only ever runs once in the common case; a genuinely
// concurrent first-ever access could double-seed the un-uniqued CaseSlaPolicy row, which is
// an accepted, low-stakes race (one-time bootstrap, not a hot path) rather than something
// worth an advisory lock over.
export async function ensureCaseDefaultsForTenant(tenantId: string) {
  const existing = await queryOne<{ id: string }>('select id from "CaseType" where "tenantId" = $1 limit 1', [tenantId]);
  if (existing) return;

  const now = new Date().toISOString();

  await execute(
    `insert into "CaseType" (id, "tenantId", name, description, "order", "isActive", "createdAt", "updatedAt")
     values ($1, $2, 'General Inquiry', null, 0, true, $3, $3)
     on conflict ("tenantId", "name") do nothing`,
    [randomUUID(), tenantId, now],
  );

  const statuses: Array<[string, string, number, boolean, boolean]> = [
    ["Open", "OPEN", 0, true, false],
    ["In Progress", "PENDING", 1, false, false],
    ["Resolved", "RESOLVED", 2, false, true],
    ["Closed", "CLOSED", 3, false, true],
  ];
  for (const [name, category, order, isDefault, isClosedStatus] of statuses) {
    await execute(
      `insert into "CaseStatus" (id, "tenantId", name, category, "order", "isDefault", "isClosedStatus", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       on conflict ("tenantId", "name") do nothing`,
      [randomUUID(), tenantId, name, category, order, isDefault, isClosedStatus, now],
    );
  }

  const priorities: Array<[string, number, string, boolean]> = [
    ["Low", 1, "#94a3b8", false],
    ["Medium", 2, "#60a5fa", true],
    ["High", 3, "#f59e0b", false],
    ["Urgent", 4, "#ef4444", false],
  ];
  for (const [name, level, color, isDefault] of priorities) {
    await execute(
      `insert into "CasePriority" (id, "tenantId", name, level, color, "isDefault", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $7)
       on conflict ("tenantId", "name") do nothing`,
      [randomUUID(), tenantId, name, level, color, isDefault, now],
    );
  }

  await execute(
    `insert into "CaseQueue" (id, "tenantId", name, description, "isDefault", "roundRobinCursor", "createdAt", "updatedAt")
     values ($1, $2, 'General', 'Default catch-all queue', true, -1, $3, $3)
     on conflict ("tenantId", "name") do nothing`,
    [randomUUID(), tenantId, now],
  );

  await execute(
    `insert into "CaseSlaPolicy" (id, "tenantId", name, "caseTypeId", "casePriorityId", "firstResponseMinutes", "resolutionMinutes", "isDefault", "isActive", "createdAt", "updatedAt")
     values ($1, $2, 'Standard SLA', null, null, 60, 1440, true, true, $3, $3)`,
    [randomUUID(), tenantId, now],
  );
}

async function getDefaultCaseTypeId(tenantId: string, client?: Queryable) {
  const row = await queryOne<{ id: string }>('select id from "CaseType" where "tenantId" = $1 and "isActive" = true order by "order" asc limit 1', [tenantId], client);
  return row?.id ?? null;
}

async function getDefaultCaseStatusId(tenantId: string, client?: Queryable) {
  const preferred = await queryOne<{ id: string }>('select id from "CaseStatus" where "tenantId" = $1 and "isDefault" = true limit 1', [tenantId], client);
  if (preferred) return preferred.id;
  const fallback = await queryOne<{ id: string }>('select id from "CaseStatus" where "tenantId" = $1 order by "order" asc limit 1', [tenantId], client);
  return fallback?.id ?? null;
}

async function getDefaultCasePriorityId(tenantId: string, client?: Queryable) {
  const preferred = await queryOne<{ id: string }>('select id from "CasePriority" where "tenantId" = $1 and "isDefault" = true limit 1', [tenantId], client);
  if (preferred) return preferred.id;
  const fallback = await queryOne<{ id: string }>('select id from "CasePriority" where "tenantId" = $1 order by level asc limit 1', [tenantId], client);
  return fallback?.id ?? null;
}

async function isStatusClosed(tenantId: string, statusId: string | null, client?: Queryable) {
  if (!statusId) return false;
  const row = await queryOne<{ isClosedStatus: boolean }>('select "isClosedStatus" from "CaseStatus" where "tenantId" = $1 and id = $2', [tenantId, statusId], client);
  return row?.isClosedStatus ?? false;
}

// Picks the most specific active SLA policy for a type+priority combination: a policy
// scoped to both wins over one scoped to just one, which wins over a tenant-wide default
// (both fields null). A policy whose non-null field doesn't match is disqualified outright.
async function resolveSlaPolicyForCase(tenantId: string, typeId: string, priorityId: string, client?: Queryable) {
  const policies = await query<any>('select * from "CaseSlaPolicy" where "tenantId" = $1 and "isActive" = true', [tenantId], client);
  let best: any = null;
  let bestScore = -1;
  for (const policy of policies) {
    if (policy.caseTypeId && policy.caseTypeId !== typeId) continue;
    if (policy.casePriorityId && policy.casePriorityId !== priorityId) continue;
    const score = (policy.caseTypeId ? 1 : 0) + (policy.casePriorityId ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = policy;
    }
  }
  return best;
}

async function nextCaseNumber(tenantId: string, client: TransactionClient) {
  // Advisory lock scoped to this transaction serializes concurrent case creates for the
  // same tenant, same shape as the round-robin cursor race fix in distribution-engine.ts --
  // without it, two concurrent creates could both read the same max(caseNumber) and collide
  // on the unique ("tenantId", "caseNumber") constraint.
  await client.query('select pg_advisory_xact_lock(hashtext($1))', [`case-number:${tenantId}`]);
  const row = await queryOne<{ next: number }>('select coalesce(max("caseNumber"), 0) + 1 as next from "Case" where "tenantId" = $1', [tenantId], client);
  return row?.next ?? 1;
}

async function assignFromQueueRoundRobin(tenantId: string, queueId: string, client: TransactionClient) {
  await client.query('select pg_advisory_xact_lock(hashtext($1))', [`case-queue:${queueId}`]);
  const members = await query<{ userId: string }>('select "userId" from "CaseQueueMembership" where "tenantId" = $1 and "queueId" = $2', [tenantId, queueId], client);
  if (members.length === 0) return null;

  const queueRow = await queryOne<{ roundRobinCursor: number }>('select "roundRobinCursor" from "CaseQueue" where "tenantId" = $1 and id = $2', [tenantId, queueId], client);
  const cursor = queueRow?.roundRobinCursor ?? -1;
  const nextIndex = (cursor + 1) % members.length;
  await execute('update "CaseQueue" set "roundRobinCursor" = $1, "updatedAt" = $2 where "tenantId" = $3 and id = $4', [nextIndex, new Date().toISOString(), tenantId, queueId], client);
  return members[nextIndex].userId;
}

async function writeCaseAuditLog(
  client: Queryable | undefined,
  tenantId: string,
  actorId: string,
  action: string,
  caseId: string,
  before: unknown,
  after: unknown,
) {
  await execute(
    `insert into "AuditLog" (id, "tenantId", "userId", action, "entityType", "entityId", before, after, diff, metadata, "createdAt")
     values ($1, $2, $3, $4, 'CASE', $5, $6, $7, null, null, $8)`,
    [randomUUID(), tenantId, actorId, action, caseId, before, after, new Date().toISOString()],
    client,
  );
}

// ─── Case CRUD ──────────────────────────────────────────────────────────────────────────

export type CaseFilters = {
  statusId?: string | null;
  priorityId?: string | null;
  queueId?: string | null;
  ownerId?: string | null;
  typeId?: string | null;
  // Free text: matches the subject, the requester's name or email, or the case number ("#42" or "42").
  q?: string | null;
  page?: number;
  limit?: number;
};

export async function listCasesForTenant(user: TenantUser, filters: CaseFilters = {}) {
  const tenantId = await assertServiceDeskEnabled(user);
  const clauses = ['"tenantId" = $1'];
  const values: unknown[] = [tenantId];
  for (const [column, value] of [
    ['"statusId"', filters.statusId],
    ['"priorityId"', filters.priorityId],
    ['"queueId"', filters.queueId],
    ['"ownerId"', filters.ownerId],
    ['"typeId"', filters.typeId],
  ] as const) {
    if (value) {
      values.push(value);
      clauses.push(`${column} = $${values.length}`);
    }
  }

  const search = filters.q?.trim();
  if (search) {
    values.push(`%${search.replace(/[\\%_]/g, (match) => `\\${match}`)}%`);
    const pattern = values.length;
    const number = /^#?(\d{1,9})$/.exec(search)?.[1];
    if (number) values.push(Number(number));
    clauses.push(`(subject ilike $${pattern} or coalesce("requesterName", '') ilike $${pattern} or coalesce("requesterEmail", '') ilike $${pattern}${number ? ` or "caseNumber" = $${values.length}` : ""})`);
  }

  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(200, Math.max(1, filters.limit ?? 25));
  const offset = (page - 1) * limit;

  const [data, totalRow] = await Promise.all([
    query<any>(
      `select ${CASE_COLUMNS} from "Case" where ${clauses.join(" and ")} order by "createdAt" desc limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, limit, offset],
    ),
    queryOne<{ count: number }>(`select count(*)::int as count from "Case" where ${clauses.join(" and ")}`, values),
  ]);

  return { data, meta: { total: totalRow?.count ?? 0, page, limit } };
}

export async function getCaseForTenant(user: TenantUser, id: string) {
  const tenantId = await assertServiceDeskEnabled(user);
  const row = await queryOne<any>(`select ${CASE_COLUMNS} from "Case" where "tenantId" = $1 and id = $2 limit 1`, [tenantId, id]);
  if (!row) return null;

  const [comments, assignmentLog] = await Promise.all([
    query<any>('select id, "tenantId", "caseId", "authorId", body, "isInternal", "createdAt" from "CaseComment" where "tenantId" = $1 and "caseId" = $2 order by "createdAt" asc', [tenantId, id]),
    query<any>('select id, "tenantId", "caseId", "assignedToId", "assignedById", "queueId", reason, "assignedAt" from "CaseAssignmentLog" where "tenantId" = $1 and "caseId" = $2 order by "assignedAt" desc', [tenantId, id]),
  ]);

  return { ...row, comments, assignmentLog };
}

export type CreateCaseInput = {
  subject: string;
  description?: string | null;
  typeId?: string | null;
  priorityId?: string | null;
  statusId?: string | null;
  queueId?: string | null;
  ownerId?: string | null;
  requesterName?: string | null;
  requesterEmail?: string | null;
  requesterPhone?: string | null;
  relatedLeadId?: string | null;
  relatedOpportunityId?: string | null;
  relatedPartnerId?: string | null;
};

export async function createCaseForTenant(user: TenantUser, input: CreateCaseInput) {
  const tenantId = await assertServiceDeskEnabled(user);
  if (!input.subject?.trim()) throw new Error("CASE_SUBJECT_REQUIRED");

  await ensureCaseDefaultsForTenant(tenantId);

  const typeId = input.typeId || (await getDefaultCaseTypeId(tenantId));
  const priorityId = input.priorityId || (await getDefaultCasePriorityId(tenantId));
  const statusId = input.statusId || (await getDefaultCaseStatusId(tenantId));
  if (!typeId || !priorityId || !statusId) throw new Error("CASE_CONFIG_MISSING");

  const created = await withTransaction(user, async (client) => {
    const caseNumber = await nextCaseNumber(tenantId, client);
    const slaPolicy = await resolveSlaPolicyForCase(tenantId, typeId, priorityId, client);
    const now = new Date();
    const nowIso = now.toISOString();
    const firstResponseDueAt = slaPolicy ? new Date(now.getTime() + slaPolicy.firstResponseMinutes * 60_000).toISOString() : null;
    const resolutionDueAt = slaPolicy ? new Date(now.getTime() + slaPolicy.resolutionMinutes * 60_000).toISOString() : null;

    const explicitOwnerId = input.ownerId || null;
    const queueId = input.queueId || null;
    const ownerId = explicitOwnerId || (queueId ? await assignFromQueueRoundRobin(tenantId, queueId, client) : null);

    const id = randomUUID();
    const row = await queryOne<any>(
      `insert into "Case" (
        id, "tenantId", "caseNumber", subject, description, "typeId", "statusId", "priorityId", "queueId", "ownerId",
        "requesterName", "requesterEmail", "requesterPhone", "relatedLeadId", "relatedOpportunityId", "relatedPartnerId",
        "slaPolicyId", "firstResponseDueAt", "resolutionDueAt", "reopenedCount", "createdBy", "createdAt", "updatedAt"
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,0,$20,$21,$21)
      returning ${CASE_COLUMNS}`,
      [
        id, tenantId, caseNumber, input.subject.trim(), input.description || null, typeId, statusId, priorityId, queueId, ownerId,
        input.requesterName || null, input.requesterEmail || null, input.requesterPhone || null,
        input.relatedLeadId || null, input.relatedOpportunityId || null, input.relatedPartnerId || null,
        slaPolicy?.id ?? null, firstResponseDueAt, resolutionDueAt, user.id, nowIso,
      ],
      client,
    );
    if (!row) throw new Error("CASE_INSERT_FAILED");

    if (ownerId) {
      await execute(
        `insert into "CaseAssignmentLog" (id, "tenantId", "caseId", "assignedToId", "assignedById", "queueId", reason, "assignedAt")
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomUUID(), tenantId, id, ownerId, explicitOwnerId ? user.id : null, queueId, explicitOwnerId ? "Assigned at creation" : "Queue round robin", nowIso],
        client,
      );
    }

    await writeCaseAuditLog(client, tenantId, user.id, "CREATE", id, null, row);
    return row;
  });

  await runAutomationsForEvent(user, "CASE_CREATED", "CASE", created.id, created).catch(() => undefined);
  await emitCaseBusEvent(user.tenantId, "CASE_CREATED", created);
  if (created.ownerId) {
    await runAutomationsForEvent(user, "CASE_ASSIGNED", "CASE", created.id, created).catch(() => undefined);
    await emitCaseBusEvent(user.tenantId, "CASE_ASSIGNED", created);
  }

  return created;
}

export type UpdateCaseInput = Partial<{
  subject: string;
  description: string | null;
  typeId: string;
  priorityId: string;
  statusId: string;
  queueId: string | null;
  resolutionNotes: string | null;
}>;

export async function updateCaseForTenant(user: TenantUser, id: string, input: UpdateCaseInput) {
  const tenantId = await assertServiceDeskEnabled(user);
  const existing = await queryOne<any>(`select ${CASE_COLUMNS} from "Case" where "tenantId" = $1 and id = $2 limit 1`, [tenantId, id]);
  if (!existing) return null;

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ["subject", "description", "typeId", "priorityId", "queueId", "resolutionNotes"] as const) {
    if (input[key] !== undefined) patch[key] = input[key];
  }

  let statusEventType: string | null = null;
  if (input.statusId !== undefined && input.statusId !== existing.statusId) {
    const newStatus = await queryOne<any>('select * from "CaseStatus" where "tenantId" = $1 and id = $2', [tenantId, input.statusId]);
    if (!newStatus) throw new Error("CASE_STATUS_NOT_FOUND");
    const wasClosed = await isStatusClosed(tenantId, existing.statusId);
    patch.statusId = input.statusId;
    if (newStatus.isClosedStatus) {
      patch.resolvedAt = existing.resolvedAt || new Date().toISOString();
      patch.closedAt = new Date().toISOString();
      statusEventType = "CASE_RESOLVED";
    } else if (wasClosed) {
      patch.reopenedCount = Number(existing.reopenedCount ?? 0) + 1;
      patch.closedAt = null;
      statusEventType = "CASE_REOPENED";
    } else {
      statusEventType = "CASE_STATUS_CHANGED";
    }
  }

  const columns = Object.keys(patch);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  const updated = await queryOne<any>(
    `update "Case" set ${assignments} where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2} returning ${CASE_COLUMNS}`,
    [...columns.map((column) => patch[column]), tenantId, id],
  );
  if (!updated) return null;

  await writeCaseAuditLog(undefined, tenantId, user.id, "UPDATE", id, existing, updated);
  const busEventType = (statusEventType ?? "CASE_UPDATED") as WebhookEventType;
  await runAutomationsForEvent(user, busEventType, "CASE", id, updated).catch(() => undefined);
  await emitCaseBusEvent(user.tenantId, busEventType, updated);

  return updated;
}

export async function addCommentToCase(user: TenantUser, caseId: string, input: { body: string; isInternal?: boolean }) {
  const tenantId = await assertServiceDeskEnabled(user);
  const body = input.body?.trim();
  if (!body) throw new Error("CASE_COMMENT_BODY_REQUIRED");

  const existing = await queryOne<any>(`select ${CASE_COLUMNS} from "Case" where "tenantId" = $1 and id = $2 limit 1`, [tenantId, caseId]);
  if (!existing) return null;

  const isInternal = input.isInternal !== false;
  const now = new Date().toISOString();
  const comment = await queryOne<any>(
    `insert into "CaseComment" (id, "tenantId", "caseId", "authorId", body, "isInternal", "createdAt")
     values ($1,$2,$3,$4,$5,$6,$7)
     returning id, "tenantId", "caseId", "authorId", body, "isInternal", "createdAt"`,
    [randomUUID(), tenantId, caseId, user.id, body, isInternal, now],
  );
  if (!comment) throw new Error("CASE_COMMENT_INSERT_FAILED");

  // A customer-facing reply (not an internal note) satisfies the first-response SLA the
  // first time it happens -- an internal note never should, or the SLA clock could be
  // satisfied without the requester ever actually hearing back.
  if (!isInternal && !existing.firstRespondedAt) {
    await execute('update "Case" set "firstRespondedAt" = $1, "updatedAt" = $1 where "tenantId" = $2 and id = $3', [now, tenantId, caseId], undefined);
  }

  await runAutomationsForEvent(user, "CASE_COMMENTED", "CASE", caseId, { ...existing, comment }).catch(() => undefined);
  await emitCaseBusEvent(user.tenantId, "CASE_COMMENTED", { ...existing, comment });
  return comment;
}

// Governed manual reassignment -- requires a reason, writes the real per-decision log
// (CaseAssignmentLog + AuditLog), and notifies the previous owner. Mirrors
// reassignRecordOwner in distribution-engine.ts (Priority Module 3).
export async function assignCaseToUser(user: TenantUser, caseId: string, input: { newOwnerId: string; reason: string }) {
  const tenantId = await assertServiceDeskEnabled(user);
  const reason = input.reason?.trim();
  if (!reason) throw new Error("CASE_ASSIGNMENT_REASON_REQUIRED");
  if (!input.newOwnerId) throw new Error("CASE_ASSIGNMENT_TARGET_REQUIRED");

  const existing = await queryOne<any>(`select ${CASE_COLUMNS} from "Case" where "tenantId" = $1 and id = $2 limit 1`, [tenantId, caseId]);
  if (!existing) return null;

  const newOwner = await queryOne<any>('select id, name, email from "User" where "tenantId" = $1 and id = $2 limit 1', [tenantId, input.newOwnerId]);
  if (!newOwner) throw new Error("CASE_ASSIGNMENT_TARGET_NOT_FOUND");

  const previousOwnerId = (existing.ownerId as string | null) ?? null;
  const now = new Date().toISOString();
  const updated = await queryOne<any>(
    `update "Case" set "ownerId" = $1, "updatedAt" = $2 where "tenantId" = $3 and id = $4 returning ${CASE_COLUMNS}`,
    [newOwner.id, now, tenantId, caseId],
  );
  if (!updated) return null;

  await execute(
    `insert into "CaseAssignmentLog" (id, "tenantId", "caseId", "assignedToId", "assignedById", "queueId", reason, "assignedAt")
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [randomUUID(), tenantId, caseId, newOwner.id, user.id, existing.queueId, reason, now],
  );

  if (previousOwnerId && previousOwnerId !== newOwner.id && previousOwnerId !== user.id) {
    await createUserNotification({
      tenantId,
      userId: previousOwnerId,
      title: "Case reassigned",
      message: `Case #${existing.caseNumber} "${existing.subject}" was reassigned to ${newOwner.name ?? newOwner.email ?? "another user"}. Reason: ${reason}`,
      data: { entityType: "CASE", entityId: caseId, caseId },
      category: "CASES",
    }).catch(() => undefined);
  }

  await runAutomationsForEvent(user, "CASE_ASSIGNED", "CASE", caseId, updated).catch(() => undefined);
  await emitCaseBusEvent(user.tenantId, "CASE_ASSIGNED", updated);
  return updated;
}

// ─── Settings: types, statuses, priorities, queues, SLA policies ─────────────────────────

export async function listCaseTypesForTenant(user: TenantUser) {
  const tenantId = await assertServiceDeskEnabled(user);
  await ensureCaseDefaultsForTenant(tenantId);
  return query<any>('select id, "tenantId", name, description, "order", "isActive", "createdAt", "updatedAt" from "CaseType" where "tenantId" = $1 order by "order" asc', [tenantId]);
}

export async function createCaseTypeForTenant(user: TenantUser, input: { name: string; description?: string | null; order?: number }) {
  const tenantId = await assertServiceDeskEnabled(user);
  if (!input.name?.trim()) throw new Error("CASE_TYPE_NAME_REQUIRED");
  const now = new Date().toISOString();
  return queryOne<any>(
    `insert into "CaseType" (id, "tenantId", name, description, "order", "isActive", "createdAt", "updatedAt")
     values ($1,$2,$3,$4,$5,true,$6,$6) returning id, "tenantId", name, description, "order", "isActive", "createdAt", "updatedAt"`,
    [randomUUID(), tenantId, input.name.trim(), input.description || null, input.order ?? 0, now],
  );
}

export async function updateCaseTypeForTenant(user: TenantUser, id: string, input: { name?: string; description?: string | null; order?: number; isActive?: boolean }) {
  const tenantId = await assertServiceDeskEnabled(user);
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.description !== undefined) patch.description = input.description;
  if (input.order !== undefined) patch.order = input.order;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  const columns = Object.keys(patch);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  return queryOne<any>(
    `update "CaseType" set ${assignments} where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2} returning id, "tenantId", name, description, "order", "isActive", "createdAt", "updatedAt"`,
    [...columns.map((column) => patch[column]), tenantId, id],
  );
}

export async function deleteCaseTypeForTenant(user: TenantUser, id: string) {
  const tenantId = await assertServiceDeskEnabled(user);
  try {
    await execute('delete from "CaseType" where "tenantId" = $1 and id = $2', [tenantId, id]);
  } catch (error) {
    if (isForeignKeyViolation(error)) throw new Error("CASE_TYPE_IN_USE");
    throw error;
  }
}

export async function listCaseStatusesForTenant(user: TenantUser) {
  const tenantId = await assertServiceDeskEnabled(user);
  await ensureCaseDefaultsForTenant(tenantId);
  return query<any>('select id, "tenantId", name, category, "order", "isDefault", "isClosedStatus", "createdAt", "updatedAt" from "CaseStatus" where "tenantId" = $1 order by "order" asc', [tenantId]);
}

async function clearOtherDefaultCaseStatuses(tenantId: string, exceptId?: string) {
  const clauses = ['"tenantId" = $1', '"isDefault" = true'];
  const values: unknown[] = [tenantId];
  if (exceptId) {
    values.push(exceptId);
    clauses.push(`id <> $${values.length}`);
  }
  await execute(`update "CaseStatus" set "isDefault" = false where ${clauses.join(" and ")}`, values);
}

export async function createCaseStatusForTenant(user: TenantUser, input: { name: string; category: string; order?: number; isDefault?: boolean; isClosedStatus?: boolean }) {
  const tenantId = await assertServiceDeskEnabled(user);
  if (!input.name?.trim()) throw new Error("CASE_STATUS_NAME_REQUIRED");
  const isDefault = input.isDefault === true;
  if (isDefault) await clearOtherDefaultCaseStatuses(tenantId);
  const now = new Date().toISOString();
  return queryOne<any>(
    `insert into "CaseStatus" (id, "tenantId", name, category, "order", "isDefault", "isClosedStatus", "createdAt", "updatedAt")
     values ($1,$2,$3,$4,$5,$6,$7,$8,$8) returning id, "tenantId", name, category, "order", "isDefault", "isClosedStatus", "createdAt", "updatedAt"`,
    [randomUUID(), tenantId, input.name.trim(), input.category, input.order ?? 0, isDefault, input.isClosedStatus === true, now],
  );
}

export async function updateCaseStatusForTenant(user: TenantUser, id: string, input: { name?: string; category?: string; order?: number; isDefault?: boolean; isClosedStatus?: boolean }) {
  const tenantId = await assertServiceDeskEnabled(user);
  if (input.isDefault === true) await clearOtherDefaultCaseStatuses(tenantId, id);
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ["name", "category", "order", "isDefault", "isClosedStatus"] as const) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  const columns = Object.keys(patch);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  return queryOne<any>(
    `update "CaseStatus" set ${assignments} where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2} returning id, "tenantId", name, category, "order", "isDefault", "isClosedStatus", "createdAt", "updatedAt"`,
    [...columns.map((column) => patch[column]), tenantId, id],
  );
}

export async function deleteCaseStatusForTenant(user: TenantUser, id: string) {
  const tenantId = await assertServiceDeskEnabled(user);
  try {
    await execute('delete from "CaseStatus" where "tenantId" = $1 and id = $2', [tenantId, id]);
  } catch (error) {
    if (isForeignKeyViolation(error)) throw new Error("CASE_STATUS_IN_USE");
    throw error;
  }
}

export async function listCasePrioritiesForTenant(user: TenantUser) {
  const tenantId = await assertServiceDeskEnabled(user);
  await ensureCaseDefaultsForTenant(tenantId);
  return query<any>('select id, "tenantId", name, level, color, "isDefault", "createdAt", "updatedAt" from "CasePriority" where "tenantId" = $1 order by level asc', [tenantId]);
}

async function clearOtherDefaultCasePriorities(tenantId: string, exceptId?: string) {
  const clauses = ['"tenantId" = $1', '"isDefault" = true'];
  const values: unknown[] = [tenantId];
  if (exceptId) {
    values.push(exceptId);
    clauses.push(`id <> $${values.length}`);
  }
  await execute(`update "CasePriority" set "isDefault" = false where ${clauses.join(" and ")}`, values);
}

export async function createCasePriorityForTenant(user: TenantUser, input: { name: string; level?: number; color?: string | null; isDefault?: boolean }) {
  const tenantId = await assertServiceDeskEnabled(user);
  if (!input.name?.trim()) throw new Error("CASE_PRIORITY_NAME_REQUIRED");
  const isDefault = input.isDefault === true;
  if (isDefault) await clearOtherDefaultCasePriorities(tenantId);
  const now = new Date().toISOString();
  return queryOne<any>(
    `insert into "CasePriority" (id, "tenantId", name, level, color, "isDefault", "createdAt", "updatedAt")
     values ($1,$2,$3,$4,$5,$6,$7,$7) returning id, "tenantId", name, level, color, "isDefault", "createdAt", "updatedAt"`,
    [randomUUID(), tenantId, input.name.trim(), input.level ?? 1, input.color || null, isDefault, now],
  );
}

export async function updateCasePriorityForTenant(user: TenantUser, id: string, input: { name?: string; level?: number; color?: string | null; isDefault?: boolean }) {
  const tenantId = await assertServiceDeskEnabled(user);
  if (input.isDefault === true) await clearOtherDefaultCasePriorities(tenantId, id);
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ["name", "level", "color", "isDefault"] as const) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  const columns = Object.keys(patch);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  return queryOne<any>(
    `update "CasePriority" set ${assignments} where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2} returning id, "tenantId", name, level, color, "isDefault", "createdAt", "updatedAt"`,
    [...columns.map((column) => patch[column]), tenantId, id],
  );
}

export async function deleteCasePriorityForTenant(user: TenantUser, id: string) {
  const tenantId = await assertServiceDeskEnabled(user);
  try {
    await execute('delete from "CasePriority" where "tenantId" = $1 and id = $2', [tenantId, id]);
  } catch (error) {
    if (isForeignKeyViolation(error)) throw new Error("CASE_PRIORITY_IN_USE");
    throw error;
  }
}

export async function listCaseQueuesForTenant(user: TenantUser) {
  const tenantId = await assertServiceDeskEnabled(user);
  await ensureCaseDefaultsForTenant(tenantId);
  const queues = await query<any>('select id, "tenantId", name, description, "isDefault", "createdAt", "updatedAt" from "CaseQueue" where "tenantId" = $1 order by name asc', [tenantId]);
  const memberships = await query<{ queueId: string; userId: string }>('select "queueId", "userId" from "CaseQueueMembership" where "tenantId" = $1', [tenantId]);
  const membersByQueue = new Map<string, string[]>();
  for (const row of memberships) {
    membersByQueue.set(row.queueId, [...(membersByQueue.get(row.queueId) ?? []), row.userId]);
  }
  return queues.map((queue) => ({ ...queue, memberUserIds: membersByQueue.get(queue.id) ?? [] }));
}

export async function createCaseQueueForTenant(user: TenantUser, input: { name: string; description?: string | null }) {
  const tenantId = await assertServiceDeskEnabled(user);
  if (!input.name?.trim()) throw new Error("CASE_QUEUE_NAME_REQUIRED");
  const now = new Date().toISOString();
  return queryOne<any>(
    `insert into "CaseQueue" (id, "tenantId", name, description, "isDefault", "roundRobinCursor", "createdAt", "updatedAt")
     values ($1,$2,$3,$4,false,-1,$5,$5) returning id, "tenantId", name, description, "isDefault", "createdAt", "updatedAt"`,
    [randomUUID(), tenantId, input.name.trim(), input.description || null, now],
  );
}

export async function updateCaseQueueForTenant(user: TenantUser, id: string, input: { name?: string; description?: string | null }) {
  const tenantId = await assertServiceDeskEnabled(user);
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.description !== undefined) patch.description = input.description;
  const columns = Object.keys(patch);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  return queryOne<any>(
    `update "CaseQueue" set ${assignments} where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2} returning id, "tenantId", name, description, "isDefault", "createdAt", "updatedAt"`,
    [...columns.map((column) => patch[column]), tenantId, id],
  );
}

export async function deleteCaseQueueForTenant(user: TenantUser, id: string) {
  const tenantId = await assertServiceDeskEnabled(user);
  try {
    await execute('delete from "CaseQueue" where "tenantId" = $1 and id = $2', [tenantId, id]);
  } catch (error) {
    if (isForeignKeyViolation(error)) throw new Error("CASE_QUEUE_IN_USE");
    throw error;
  }
}

export async function setCaseQueueMembers(user: TenantUser, queueId: string, userIds: string[]) {
  const tenantId = await assertServiceDeskEnabled(user);
  await withTransaction(user, async (client) => {
    await execute('delete from "CaseQueueMembership" where "tenantId" = $1 and "queueId" = $2', [tenantId, queueId], client);
    for (const userId of userIds) {
      await execute(
        'insert into "CaseQueueMembership" (id, "tenantId", "queueId", "userId", "createdAt") values ($1,$2,$3,$4,$5) on conflict ("tenantId", "queueId", "userId") do nothing',
        [randomUUID(), tenantId, queueId, userId, new Date().toISOString()],
        client,
      );
    }
  });
  return listCaseQueuesForTenant(user);
}

export async function listCaseSlaPoliciesForTenant(user: TenantUser) {
  const tenantId = await assertServiceDeskEnabled(user);
  await ensureCaseDefaultsForTenant(tenantId);
  return query<any>(
    'select id, "tenantId", name, "caseTypeId", "casePriorityId", "firstResponseMinutes", "resolutionMinutes", "isDefault", "isActive", "createdAt", "updatedAt" from "CaseSlaPolicy" where "tenantId" = $1 order by "createdAt" asc',
    [tenantId],
  );
}

export async function createCaseSlaPolicyForTenant(user: TenantUser, input: { name: string; caseTypeId?: string | null; casePriorityId?: string | null; firstResponseMinutes: number; resolutionMinutes: number; isActive?: boolean }) {
  const tenantId = await assertServiceDeskEnabled(user);
  if (!input.name?.trim()) throw new Error("CASE_SLA_POLICY_NAME_REQUIRED");
  const now = new Date().toISOString();
  return queryOne<any>(
    `insert into "CaseSlaPolicy" (id, "tenantId", name, "caseTypeId", "casePriorityId", "firstResponseMinutes", "resolutionMinutes", "isDefault", "isActive", "createdAt", "updatedAt")
     values ($1,$2,$3,$4,$5,$6,$7,false,$8,$9,$9)
     returning id, "tenantId", name, "caseTypeId", "casePriorityId", "firstResponseMinutes", "resolutionMinutes", "isDefault", "isActive", "createdAt", "updatedAt"`,
    [randomUUID(), tenantId, input.name.trim(), input.caseTypeId || null, input.casePriorityId || null, input.firstResponseMinutes, input.resolutionMinutes, input.isActive !== false, now],
  );
}

export async function updateCaseSlaPolicyForTenant(user: TenantUser, id: string, input: Partial<{ name: string; caseTypeId: string | null; casePriorityId: string | null; firstResponseMinutes: number; resolutionMinutes: number; isActive: boolean }>) {
  const tenantId = await assertServiceDeskEnabled(user);
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ["name", "caseTypeId", "casePriorityId", "firstResponseMinutes", "resolutionMinutes", "isActive"] as const) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  const columns = Object.keys(patch);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  return queryOne<any>(
    `update "CaseSlaPolicy" set ${assignments} where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2} returning id, "tenantId", name, "caseTypeId", "casePriorityId", "firstResponseMinutes", "resolutionMinutes", "isDefault", "isActive", "createdAt", "updatedAt"`,
    [...columns.map((column) => patch[column]), tenantId, id],
  );
}

export async function deleteCaseSlaPolicyForTenant(user: TenantUser, id: string) {
  const tenantId = await assertServiceDeskEnabled(user);
  await execute('delete from "CaseSlaPolicy" where "tenantId" = $1 and id = $2', [tenantId, id]);
}

// ─── SLA pause/resume (checklist item 7) ──────────────────────────────────────────────────

export async function pauseCaseSla(user: TenantUser, caseId: string) {
  const tenantId = await assertServiceDeskEnabled(user);
  const existing = await queryOne<any>(`select ${CASE_COLUMNS} from "Case" where "tenantId" = $1 and id = $2 limit 1`, [tenantId, caseId]);
  if (!existing) return null;
  if (existing.slaPausedAt) return existing; // already paused -- no-op, not an error

  const now = new Date().toISOString();
  const updated = await queryOne<any>(
    `update "Case" set "slaPausedAt" = $1, "updatedAt" = $1 where "tenantId" = $2 and id = $3 returning ${CASE_COLUMNS}`,
    [now, tenantId, caseId],
  );
  await writeCaseAuditLog(undefined, tenantId, user.id, "SLA_PAUSE", caseId, existing, updated);
  await runAutomationsForEvent(user, "CASE_UPDATED", "CASE", caseId, updated).catch(() => undefined);
  await emitCaseBusEvent(user.tenantId, "CASE_UPDATED", updated);
  return updated;
}

// Shifts both due dates forward by however long the clock was actually paused, so a paused
// case doesn't accrue a false breach for time nobody was working it. Only shifts a due date
// that hasn't already been satisfied (firstRespondedAt/resolvedAt) -- nothing to protect once
// that clock has already stopped for real.
export async function resumeCaseSla(user: TenantUser, caseId: string) {
  const tenantId = await assertServiceDeskEnabled(user);
  const existing = await queryOne<any>(`select ${CASE_COLUMNS} from "Case" where "tenantId" = $1 and id = $2 limit 1`, [tenantId, caseId]);
  if (!existing) return null;
  if (!existing.slaPausedAt) return existing; // not paused -- no-op, not an error

  const now = new Date();
  const pausedMs = now.getTime() - new Date(existing.slaPausedAt).getTime();
  const elapsedMinutes = Math.max(0, Math.ceil(pausedMs / 60_000));

  const nextFirstResponseDueAt =
    existing.firstResponseDueAt && !existing.firstRespondedAt
      ? new Date(new Date(existing.firstResponseDueAt).getTime() + elapsedMinutes * 60_000).toISOString()
      : existing.firstResponseDueAt;
  const nextResolutionDueAt =
    existing.resolutionDueAt && !existing.resolvedAt
      ? new Date(new Date(existing.resolutionDueAt).getTime() + elapsedMinutes * 60_000).toISOString()
      : existing.resolutionDueAt;

  const nowIso = now.toISOString();
  const updated = await queryOne<any>(
    `update "Case" set "slaPausedAt" = null, "slaPausedTotalMinutes" = "slaPausedTotalMinutes" + $1,
       "firstResponseDueAt" = $2, "resolutionDueAt" = $3, "updatedAt" = $4
     where "tenantId" = $5 and id = $6 returning ${CASE_COLUMNS}`,
    [elapsedMinutes, nextFirstResponseDueAt, nextResolutionDueAt, nowIso, tenantId, caseId],
  );
  await writeCaseAuditLog(undefined, tenantId, user.id, "SLA_RESUME", caseId, existing, updated);
  await runAutomationsForEvent(user, "CASE_UPDATED", "CASE", caseId, updated).catch(() => undefined);
  await emitCaseBusEvent(user.tenantId, "CASE_UPDATED", updated);
  return updated;
}

// ─── Escalation management (checklist item 8) ─────────────────────────────────────────────

// Worker job (checklist item 20) -- no user/tenant scoping upfront, scans across every
// tenant. Two passes: (1) cases approaching their due date get a one-time CASE_SLA_WARNING
// automation trigger; (2) cases whose due date has actually passed get a one-time
// CASE_SLA_BREACHED trigger, and if the case's priority is high enough (level >= 3, i.e. the
// default seed's "High"/"Urgent"), a real escalation: the owner's manager (User.managerId)
// gets a Task and a notification -- this IS the "approval path for high-priority/sensitive
// cases": a manager now has a real, visible action item they must act on, rather than a
// separate formal approval-gate mechanism layered underneath it (escalation itself doesn't
// mutate anything that needs undoing the way a reassignment or an external send does, so it
// doesn't reuse the PrivilegedActionRequest mechanism the way those two do).
// Paused cases are skipped entirely from both passes -- the whole point of pausing is that the
// clock, and therefore any breach/escalation consequence of it, is stopped.
// WP07 (F04): BACKGROUND_JOB, disposition B -- worker-invoked recurring job; both discovery
// queries below (warning/breach candidates) run across every tenant at once.
export async function processCaseSlaEscalations(limit = 200, now = new Date()) {
  const nowIso = now.toISOString();
  const warningThresholdIso = new Date(now.getTime() + 60 * 60_000).toISOString(); // due within the next hour

  const warningCandidates = await queryAsSystem<any>(
    `select c.* from "Case" c
     join "CaseStatus" s on s."tenantId" = c."tenantId" and s.id = c."statusId"
     where s."isClosedStatus" = false and c."slaPausedAt" is null and c."slaWarningFiredAt" is null
       and (
         (c."firstResponseDueAt" is not null and c."firstRespondedAt" is null and c."firstResponseDueAt" <= $1 and c."firstResponseDueAt" > $2)
         or (c."resolutionDueAt" is not null and c."resolvedAt" is null and c."resolutionDueAt" <= $1 and c."resolutionDueAt" > $2)
       )
     limit $3`,
    [warningThresholdIso, nowIso, limit],
  );
  for (const caseRow of warningCandidates) {
    if (!(await isModuleEnabledForTenant(caseRow.tenantId, "SERVICE_DESK"))) continue;
    await execute('update "Case" set "slaWarningFiredAt" = $1 where "tenantId" = $2 and id = $3', [nowIso, caseRow.tenantId, caseRow.id]);
    await runAutomationsForEvent({ id: "system", tenantId: caseRow.tenantId }, "CASE_SLA_WARNING", "CASE", caseRow.id, caseRow).catch(() => undefined);
    await emitCaseBusEvent(caseRow.tenantId, "CASE_SLA_WARNING", caseRow);
  }

  const breachCandidates = await queryAsSystem<any>(
    `select c.* from "Case" c
     join "CaseStatus" s on s."tenantId" = c."tenantId" and s.id = c."statusId"
     where s."isClosedStatus" = false and c."slaPausedAt" is null and c."slaBreachedFiredAt" is null
       and (
         (c."firstResponseDueAt" is not null and c."firstRespondedAt" is null and c."firstResponseDueAt" <= $1)
         or (c."resolutionDueAt" is not null and c."resolvedAt" is null and c."resolutionDueAt" <= $1)
       )
     limit $2`,
    [nowIso, limit],
  );

  let escalated = 0;
  for (const caseRow of breachCandidates) {
    if (!(await isModuleEnabledForTenant(caseRow.tenantId, "SERVICE_DESK"))) continue;
    await execute('update "Case" set "slaBreachedFiredAt" = $1 where "tenantId" = $2 and id = $3', [nowIso, caseRow.tenantId, caseRow.id]);
    const systemUser = { id: "system", tenantId: caseRow.tenantId };
    await runAutomationsForEvent(systemUser, "CASE_SLA_BREACHED", "CASE", caseRow.id, caseRow).catch(() => undefined);
    await emitCaseBusEvent(caseRow.tenantId, "CASE_SLA_BREACHED", caseRow);

    const priority = await queryOne<{ level: number }>('select level from "CasePriority" where "tenantId" = $1 and id = $2', [caseRow.tenantId, caseRow.priorityId]);
    if (priority && priority.level >= 3 && caseRow.ownerId) {
      const owner = await queryOne<{ managerId: string | null }>('select "managerId" from "User" where id = $1', [caseRow.ownerId]);
      if (owner?.managerId) {
        await execute('update "Case" set "escalatedAt" = $1, "escalatedToId" = $2 where "tenantId" = $3 and id = $4', [nowIso, owner.managerId, caseRow.tenantId, caseRow.id]);
        await execute(
          `insert into "Task" (id, "tenantId", title, description, status, priority, "ownerId", "createdBy", "caseId", "dueAt", metadata, "createdAt", "updatedAt")
           values ($1,$2,$3,$4,'OPEN','HIGH',$5,$5,$6,$7,$8,$7,$7)`,
          [
            randomUUID(), caseRow.tenantId, `SLA breach: Case #${caseRow.caseNumber}`,
            `"${caseRow.subject}" has breached its SLA and needs manager attention.`,
            owner.managerId, caseRow.id, nowIso, { source: "SLA_ESCALATION" },
          ],
        );
        await createUserNotification({
          tenantId: caseRow.tenantId,
          userId: owner.managerId,
          title: "Case SLA breached",
          message: `Case #${caseRow.caseNumber} "${caseRow.subject}" has breached its SLA and was escalated to you.`,
          data: { entityType: "CASE", entityId: caseRow.id, caseId: caseRow.id },
        }).catch(() => undefined);
        escalated += 1;
      }
    }
  }

  return { warned: warningCandidates.length, breached: breachCandidates.length, escalated };
}

// ─── Customer communication history in case context (checklist item 11) ──────────────────

// A Case's requester is free-text (requesterName/Email/Phone), only sometimes backed by a real
// Lead -- when relatedLeadId is set, the full real communication-event history for that Lead is
// used (the same data source the Lead detail page itself would show); otherwise this falls back
// to matching CommunicationOutbox rows directly by recipient address, a real if less structured
// history rather than nothing. Previous cases from the same requester are found the same way.
export async function getCaseCommunicationHistoryForTenant(user: TenantUser, caseId: string) {
  const tenantId = await assertServiceDeskEnabled(user);
  const existing = await queryOne<any>(`select ${CASE_COLUMNS} from "Case" where "tenantId" = $1 and id = $2 limit 1`, [tenantId, caseId]);
  if (!existing) return null;

  let events: any[] = [];
  if (existing.relatedLeadId) {
    const { listCommunicationEventsForTenant } = await import("@/lib/server/communications");
    events = await listCommunicationEventsForTenant(user, { entityType: "LEAD", entityId: existing.relatedLeadId, limit: 50 });
  }

  const recipients = [existing.requesterEmail, existing.requesterPhone].filter(Boolean) as string[];
  const outbox = recipients.length
    ? await query<any>(
        `select id, channel, recipient, subject, status, "sentAt", "createdAt" from "CommunicationOutbox"
         where "tenantId" = $1 and recipient = any($2::text[]) order by "createdAt" desc limit 50`,
        [tenantId, recipients],
      )
    : [];

  const suppressions = recipients.length
    ? await query<any>(`select channel, address, reason from "CommunicationSuppression" where "tenantId" = $1 and address = any($2::text[])`, [tenantId, recipients])
    : [];
  const consent = existing.relatedLeadId
    ? await query<any>(`select channel, status from "CommunicationConsent" where "tenantId" = $1 and "entityType" = 'LEAD' and "entityId" = $2`, [tenantId, existing.relatedLeadId])
    : [];

  const previousCases = await query<any>(
    `select id, "caseNumber", subject, "statusId", "createdAt" from "Case"
     where "tenantId" = $1 and id <> $2
       and (($3::text is not null and "requesterEmail" = $3) or ($4::text is not null and "requesterPhone" = $4))
     order by "createdAt" desc limit 10`,
    [tenantId, caseId, existing.requesterEmail || null, existing.requesterPhone || null],
  );

  return { events, outbox, suppressions, consent, previousCases };
}

// Worker job (checklist item 20's "stale/unassigned queue alerts"): notifies every member of a
// queue holding cases that have sat unassigned (no owner) for longer than a threshold, once per
// case per day (tracked via a lightweight in-memory-per-run dedupe isn't durable across worker
// restarts, so instead this simply re-notifies on every run for cases still unassigned --
// acceptable for a low-volume daily-ish alert, and simpler than adding another timestamp column
// purely to suppress a repeat notification).
// WP07 (F04): BACKGROUND_JOB, disposition B -- worker-invoked recurring job, discovers stale
// unassigned cases across every tenant at once.
export async function alertStaleUnassignedCases(staleHours = 24, limit = 100) {
  const thresholdIso = new Date(Date.now() - staleHours * 60 * 60_000).toISOString();
  const staleCases = await queryAsSystem<any>(
    `select c.*, q.name as "queueName" from "Case" c
     join "CaseStatus" s on s."tenantId" = c."tenantId" and s.id = c."statusId"
     left join "CaseQueue" q on q."tenantId" = c."tenantId" and q.id = c."queueId"
     where s."isClosedStatus" = false and c."ownerId" is null and c."createdAt" <= $1
     order by c."createdAt" asc limit $2`,
    [thresholdIso, limit],
  );

  let alerted = 0;
  for (const caseRow of staleCases) {
    if (!(await isModuleEnabledForTenant(caseRow.tenantId, "SERVICE_DESK"))) continue;
    const members = caseRow.queueId
      ? await query<{ userId: string }>('select "userId" from "CaseQueueMembership" where "tenantId" = $1 and "queueId" = $2', [caseRow.tenantId, caseRow.queueId])
      : [];
    for (const member of members) {
      await createUserNotification({
        tenantId: caseRow.tenantId,
        userId: member.userId,
        title: "Unassigned case needs attention",
        message: `Case #${caseRow.caseNumber} "${caseRow.subject}" in ${caseRow.queueName ?? "the queue"} has been unassigned for over ${staleHours}h.`,
        data: { entityType: "CASE", entityId: caseRow.id, caseId: caseRow.id },
      }).catch(() => undefined);
    }
    if (members.length > 0) alerted += 1;
  }
  return { staleFound: staleCases.length, alerted };
}
