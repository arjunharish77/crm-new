import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import { createAuditLog } from "@/lib/server/crm";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
  isPlatformAdmin?: boolean;
};

type EntityType = "LEAD" | "OPPORTUNITY" | "CASE";
type RuleType = "EXACT_EMAIL" | "EXACT_PHONE" | "FUZZY_NAME" | "SAME_REQUESTER_EMAIL_OPEN";

const RULE_COLUMNS = 'id, "tenantId", "entityType", "ruleType", threshold, "isActive", "createdBy", "createdAt", "updatedAt"';
const MATCH_COLUMNS =
  'id, "tenantId", "entityType", "recordIds", "matchedRuleType", "matchScore", status, "dismissedBy", "dismissedAt", "resolvedMergeAuditId", "createdAt", "updatedAt"';
const AUDIT_COLUMNS =
  'id, "tenantId", "entityType", "survivorId", "loserId", "loserSnapshot", "survivorSnapshotBefore", "fieldChoices", "repointedRows", "mergedBy", "unmergedAt", "unmergedBy", "createdAt"';

// Only rule types that are actually meaningful for the entity type are ever auto-provisioned --
// Opportunity has no email/phone columns at all (OPPORTUNITY_COLUMNS confirmed:
// id/leadId/opportunityTypeId/stageId/title/amount/...), so EXACT_EMAIL/EXACT_PHONE could never
// produce a match for it and are never created for that entity type (see
// ensureDefaultDedupeMatchRules below). There is no separate "create rule" operation -- the
// fixed set of rule rows is provisioned once per tenant+entityType, and the only mutation
// exposed is toggling isActive/threshold on one of those rows.
const DEFAULT_FUZZY_THRESHOLD = 0.85;

async function ensureDefaultDedupeMatchRules(tenantId: string, entityType: EntityType) {
  const existing = await query<{ ruleType: RuleType }>(
    `select "ruleType" from "DedupeMatchRule" where "tenantId" = $1 and "entityType" = $2`,
    [tenantId, entityType],
  );
  const existingTypes = new Set(existing.map((r) => r.ruleType));
  const now = new Date().toISOString();
  const defaults: Array<{ ruleType: RuleType; isActive: boolean; threshold: number | null }> =
    entityType === "LEAD"
      ? [
          { ruleType: "EXACT_EMAIL", isActive: true, threshold: null },
          { ruleType: "EXACT_PHONE", isActive: true, threshold: null },
          { ruleType: "FUZZY_NAME", isActive: false, threshold: DEFAULT_FUZZY_THRESHOLD },
        ]
      : entityType === "CASE"
        ? [{ ruleType: "SAME_REQUESTER_EMAIL_OPEN", isActive: true, threshold: null }]
        : [{ ruleType: "FUZZY_NAME", isActive: false, threshold: DEFAULT_FUZZY_THRESHOLD }];

  for (const def of defaults) {
    if (existingTypes.has(def.ruleType)) continue;
    await execute(
      `insert into "DedupeMatchRule" (id, "tenantId", "entityType", "ruleType", threshold, "isActive", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $7)
       on conflict ("tenantId", "entityType", "ruleType") do nothing`,
      [randomUUID(), tenantId, entityType, def.ruleType, def.threshold, def.isActive, now],
    );
  }
}

export async function listDedupeMatchRulesForTenant(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await ensureDefaultDedupeMatchRules(user.tenantId, "LEAD");
  await ensureDefaultDedupeMatchRules(user.tenantId, "OPPORTUNITY");
  await ensureDefaultDedupeMatchRules(user.tenantId, "CASE");
  return query(`select ${RULE_COLUMNS} from "DedupeMatchRule" where "tenantId" = $1 order by "entityType", "ruleType"`, [user.tenantId]);
}

export async function updateDedupeMatchRuleForTenant(
  user: TenantUser,
  id: string,
  input: { isActive?: boolean; threshold?: number | null },
) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.threshold !== undefined) {
    if (input.threshold !== null && (!Number.isFinite(input.threshold) || input.threshold <= 0 || input.threshold > 1)) {
      throw new Error("INVALID_THRESHOLD");
    }
    patch.threshold = input.threshold;
  }
  const columns = Object.keys(patch);
  const values = columns.map((c) => patch[c]);
  const assignments = columns.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
  const row = await queryOne(
    `update "DedupeMatchRule" set ${assignments} where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2} returning ${RULE_COLUMNS}`,
    [...values, user.tenantId, id],
  );
  if (!row) throw new Error("DEDUPE_MATCH_RULE_NOT_FOUND");
  return row;
}

// Pure Levenshtein edit distance -- no fuzzy-matching library exists anywhere in this codebase
// (confirmed by audit) and no Postgres trigram extension usage precedent either, so this is a
// small, dependency-free implementation rather than adding a new package for one function.
function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const currentRow = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const insertCost = currentRow[j] + 1;
      const deleteCost = previousRow[j + 1] + 1;
      const substituteCost = previousRow[j] + (a[i] === b[j] ? 0 : 1);
      currentRow.push(Math.min(insertCost, deleteCost, substituteCost));
    }
    previousRow = currentRow;
  }
  return previousRow[b.length];
}

function textSimilarity(a: string, b: string) {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (!left || !right) return 0;
  const maxLen = Math.max(left.length, right.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(left, right) / maxLen;
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

function normalizePhone(value: unknown) {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

function sortedIds(ids: string[]) {
  return [...new Set(ids)].sort();
}

async function upsertDedupeMatch(tenantId: string, entityType: EntityType, recordIds: string[], ruleType: RuleType, matchScore: number | null) {
  const ids = sortedIds(recordIds);
  if (ids.length < 2) return;
  const now = new Date().toISOString();
  await execute(
    `insert into "DedupeMatch" (id, "tenantId", "entityType", "recordIds", "matchedRuleType", "matchScore", status, "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $7)
     on conflict ("tenantId", "entityType", "recordIds") do nothing`,
    [randomUUID(), tenantId, entityType, ids, ruleType, matchScore, now],
  );
}

// Scans for candidate duplicates using whichever rules are active for this tenant+entityType,
// and upserts a PENDING DedupeMatch row per newly-found group (idempotent -- re-running the scan
// doesn't create duplicate queue entries for the same group of records, and never re-opens a
// group that's already been MERGED or DISMISSED, since the unique constraint on (tenantId,
// entityType, recordIds) with ON CONFLICT DO NOTHING only ever inserts once per exact id-set).
export async function runDedupeScanForTenant(user: TenantUser, entityType: EntityType, limit = 500) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const rules = await query<{ ruleType: RuleType; threshold: number | null }>(
    `select "ruleType", threshold from "DedupeMatchRule" where "tenantId" = $1 and "entityType" = $2 and "isActive" = true`,
    [user.tenantId, entityType],
  );

  let found = 0;

  for (const rule of rules) {
    if (rule.ruleType === "EXACT_EMAIL" && entityType === "LEAD") {
      const groups = await query<{ ids: string[] }>(
        `select array_agg(id order by "createdAt" asc) as ids
         from "Lead"
         where "tenantId" = $1 and "mergedIntoId" is null and email is not null and trim(email) <> ''
         group by lower(trim(email))
         having count(*) > 1
         limit $2`,
        [user.tenantId, limit],
      );
      for (const group of groups) {
        await upsertDedupeMatch(user.tenantId, entityType, group.ids, "EXACT_EMAIL", 1);
        found++;
      }
    }

    if (rule.ruleType === "EXACT_PHONE" && entityType === "LEAD") {
      const groups = await query<{ ids: string[] }>(
        `select array_agg(id order by "createdAt" asc) as ids
         from "Lead"
         where "tenantId" = $1 and "mergedIntoId" is null and phone is not null and length(regexp_replace(phone, '\\D', '', 'g')) >= 7
         group by regexp_replace(phone, '\\D', '', 'g')
         having count(*) > 1
         limit $2`,
        [user.tenantId, limit],
      );
      for (const group of groups) {
        await upsertDedupeMatch(user.tenantId, entityType, group.ids, "EXACT_PHONE", 1);
        found++;
      }
    }

    // Case-specific rule (checklist Module 11 item 18): two still-open cases from the same
    // requester email are flagged as likely duplicates -- e.g. the same customer emailing
    // twice about the same issue before anyone replied. Scoped to open cases only (a closed
    // case reopened by a genuinely new issue from a repeat customer isn't a duplicate), so this
    // never flags a customer's normal history of separate, resolved past cases.
    if (rule.ruleType === "SAME_REQUESTER_EMAIL_OPEN" && entityType === "CASE") {
      const groups = await query<{ ids: string[] }>(
        `select array_agg(c.id order by c."createdAt" asc) as ids
         from "Case" c join "CaseStatus" s on s."tenantId" = c."tenantId" and s.id = c."statusId"
         where c."tenantId" = $1 and c."mergedIntoId" is null and s."isClosedStatus" = false
           and c."requesterEmail" is not null and trim(c."requesterEmail") <> ''
         group by lower(trim(c."requesterEmail"))
         having count(*) > 1
         limit $2`,
        [user.tenantId, limit],
      );
      for (const group of groups) {
        await upsertDedupeMatch(user.tenantId, entityType, group.ids, "SAME_REQUESTER_EMAIL_OPEN", 1);
        found++;
      }
    }

    if (rule.ruleType === "FUZZY_NAME") {
      const threshold = rule.threshold ?? DEFAULT_FUZZY_THRESHOLD;
      if (entityType === "LEAD") {
        // Bounded on purpose: comparing every lead's name against every other lead's name
        // tenant-wide is an unbounded O(n^2) scan. Scoping the pairwise comparison to leads
        // that already share the same normalized company keeps it real and fast, at the
        // documented cost of never catching a same-person-different-company-spelling
        // duplicate with no company on either side at all.
        const rows = await query<{ id: string; name: string; company: string }>(
          `select id, name, company from "Lead"
           where "tenantId" = $1 and "mergedIntoId" is null and company is not null and trim(company) <> '' and name is not null
           order by lower(trim(company))`,
          [user.tenantId],
        );
        const byCompany = new Map<string, Array<{ id: string; name: string }>>();
        for (const row of rows) {
          const key = row.company.trim().toLowerCase();
          if (!byCompany.has(key)) byCompany.set(key, []);
          byCompany.get(key)!.push({ id: row.id, name: row.name });
        }
        for (const group of byCompany.values()) {
          for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
              const score = textSimilarity(group[i].name, group[j].name);
              if (score >= threshold) {
                await upsertDedupeMatch(user.tenantId, entityType, [group[i].id, group[j].id], "FUZZY_NAME", score);
                found++;
              }
            }
          }
        }
      } else {
        // For Opportunities, "duplicate" means the same Lead accidentally ended up with two
        // near-identical open Opportunities (e.g. a double form submission) -- scoped by
        // leadId, which is naturally bounded (a lead rarely has more than a handful of
        // opportunities), not a fuzzy scan across the whole tenant.
        const rows = await query<{ id: string; title: string; leadId: string }>(
          `select id, title, "leadId" from "Opportunity" where "tenantId" = $1 and "mergedIntoId" is null and title is not null`,
          [user.tenantId],
        );
        const byLead = new Map<string, Array<{ id: string; title: string }>>();
        for (const row of rows) {
          if (!byLead.has(row.leadId)) byLead.set(row.leadId, []);
          byLead.get(row.leadId)!.push({ id: row.id, title: row.title });
        }
        for (const group of byLead.values()) {
          for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
              const score = textSimilarity(group[i].title, group[j].title);
              if (score >= threshold) {
                await upsertDedupeMatch(user.tenantId, entityType, [group[i].id, group[j].id], "FUZZY_NAME", score);
                found++;
              }
            }
          }
        }
      }
    }
  }

  return { candidatesFound: found };
}

export async function listDedupeMatchesForTenant(user: TenantUser, entityType: EntityType, status: "PENDING" | "MERGED" | "DISMISSED" = "PENDING") {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const matches = await query<any>(
    `select ${MATCH_COLUMNS} from "DedupeMatch" where "tenantId" = $1 and "entityType" = $2 and status = $3 order by "createdAt" desc limit 200`,
    [user.tenantId, entityType, status],
  );

  const allIds = [...new Set(matches.flatMap((m: any) => m.recordIds as string[]))];
  if (allIds.length === 0) return matches.map((m: any) => ({ ...m, records: [] }));

  const recordRows =
    entityType === "LEAD"
      ? await query<any>(`select id, name, email, phone, company, "createdAt" from "Lead" where "tenantId" = $1 and id = any($2::text[])`, [user.tenantId, allIds])
      : entityType === "OPPORTUNITY"
        ? await query<any>(`select id, title, amount, "leadId", "createdAt" from "Opportunity" where "tenantId" = $1 and id = any($2::text[])`, [user.tenantId, allIds])
        : await query<any>(`select id, "caseNumber", subject, "requesterEmail", "statusId", "createdAt" from "Case" where "tenantId" = $1 and id = any($2::text[])`, [user.tenantId, allIds]);
  const byId = new Map(recordRows.map((r: any) => [r.id, r]));

  return matches.map((m: any) => ({ ...m, records: (m.recordIds as string[]).map((id) => byId.get(id)).filter(Boolean) }));
}

export async function dismissDedupeMatchForTenant(user: TenantUser, matchId: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const now = new Date().toISOString();
  const row = await queryOne(
    `update "DedupeMatch" set status = 'DISMISSED', "dismissedBy" = $1, "dismissedAt" = $2, "updatedAt" = $2
     where "tenantId" = $3 and id = $4 and status = 'PENDING'
     returning ${MATCH_COLUMNS}`,
    [user.id, now, user.tenantId, matchId],
  );
  if (!row) throw new Error("DEDUPE_MATCH_NOT_PENDING");
  return row;
}

// The child tables repointed on merge, per entity type -- see migration 0057's header comment
// for exactly which tables were deliberately left untouched (append-only ledgers, AuditLog,
// AssignmentLog, AutomationExecution/Queue, and CustomFieldValue, whose live column names this
// codebase's own defensive code -- inbuilt-reports.ts's listCustomFieldValuesForTenant, which
// tries three different column-name variants -- shows are uncertain, not safe to blind-UPDATE).
const REPOINT_TARGETS: Record<EntityType, Array<{ table: string; column: string; entityTypeColumn?: string; entityTypeValue?: string; cast?: string }>> = {
  CASE: [
    { table: "CaseComment", column: "caseId" },
    { table: "CaseAssignmentLog", column: "caseId" },
    { table: "Task", column: "caseId" },
    { table: "CaseInboundMessage", column: "caseId" },
    { table: "CaseAttachment", column: "caseId" },
    { table: "CaseSurveyResponse", column: "caseId" },
  ],
  LEAD: [
    { table: "Opportunity", column: "leadId" },
    { table: "Activity", column: "leadId" },
    { table: "Task", column: "leadId" },
    { table: "FormSubmission", column: "leadId" },
    { table: "Note", column: "entityId", entityTypeColumn: "entityType", entityTypeValue: "LEAD" },
    { table: "FileObject", column: "entityId", entityTypeColumn: "entityType", entityTypeValue: "LEAD" },
    { table: "EmailLog", column: "entityId", entityTypeColumn: "entityType", entityTypeValue: "LEAD" },
    { table: "CommunicationOutbox", column: "entityId", entityTypeColumn: "entityType", entityTypeValue: "LEAD" },
    { table: "TelephonyCallLog", column: "leadId", cast: "uuid" },
  ],
  OPPORTUNITY: [
    { table: "Activity", column: "opportunityId" },
    { table: "Task", column: "opportunityId" },
    { table: "OpportunityStageHistory", column: "opportunityId" },
    { table: "FileObject", column: "entityId", entityTypeColumn: "entityType", entityTypeValue: "OPPORTUNITY" },
    { table: "EmailLog", column: "entityId", entityTypeColumn: "entityType", entityTypeValue: "OPPORTUNITY" },
    { table: "CommunicationOutbox", column: "entityId", entityTypeColumn: "entityType", entityTypeValue: "OPPORTUNITY" },
    { table: "TelephonyCallLog", column: "opportunityId", cast: "uuid" },
  ],
};

async function repointChildRows(tenantId: string, entityType: EntityType, survivorId: string, loserId: string) {
  const repointed: Array<{ table: string; column: string; ids: string[] }> = [];

  for (const target of REPOINT_TARGETS[entityType]) {
    const castedSurvivor = target.cast ? `$1::${target.cast}` : "$1";
    const castedLoser = target.cast ? `$2::${target.cast}` : "$2";
    const params = [survivorId, loserId, tenantId];
    let entityFilter = "";
    if (target.entityTypeColumn) {
      params.push(target.entityTypeValue!);
      entityFilter = ` and "${target.entityTypeColumn}" = $${params.length}`;
    }
    const rows = await query<{ id: string }>(
      `update "${target.table}" set "${target.column}" = ${castedSurvivor}
       where "tenantId" = $3 and "${target.column}" = ${castedLoser}${entityFilter}
       returning id`,
      params,
    );
    if (rows.length > 0) repointed.push({ table: target.table, column: target.column, ids: rows.map((r) => r.id) });
  }

  // LeadListMember/RecordScore both carry a real uniqueness constraint the survivor may
  // already satisfy -- a blind repoint UPDATE would throw a duplicate-key violation, so these
  // two are conflict-aware: keep the survivor's existing row where one exists, drop the
  // loser's, otherwise repoint. Deleted (not moved) rows are recorded distinctly so unmerge
  // can be honest about what's NOT recoverable, rather than silently under-reporting them
  // as "repointed".
  const deleted: Array<{ table: string; column: string; ids: string[] }> = [];

  if (entityType === "LEAD") {
    const movable = await query<{ id: string }>(
      `update "LeadListMember" m set "leadId" = $1
       where m."tenantId" = $3 and m."leadId" = $2
         and not exists (select 1 from "LeadListMember" x where x."tenantId" = $3 and x."listId" = m."listId" and x."leadId" = $1)
       returning id`,
      [survivorId, loserId, tenantId],
    );
    if (movable.length > 0) repointed.push({ table: "LeadListMember", column: "leadId", ids: movable.map((r) => r.id) });
    const droppedDupes = await query<{ id: string }>(
      `delete from "LeadListMember" where "tenantId" = $2 and "leadId" = $1 returning id`,
      [loserId, tenantId],
    );
    if (droppedDupes.length > 0) deleted.push({ table: "LeadListMember", column: "leadId", ids: droppedDupes.map((r) => r.id) });
  }

  const scoreMovable = await query<{ id: string }>(
    `update "RecordScore" set "recordId" = $1
     where "tenantId" = $3 and "recordType" = $4 and "recordId" = $2
       and not exists (select 1 from "RecordScore" x where x."tenantId" = $3 and x."recordType" = $4 and x."recordId" = $1)
     returning id`,
    [survivorId, loserId, tenantId, entityType],
  );
  if (scoreMovable.length > 0) repointed.push({ table: "RecordScore", column: "recordId", ids: scoreMovable.map((r) => r.id) });
  const scoreDropped = await query<{ id: string }>(
    `delete from "RecordScore" where "tenantId" = $2 and "recordType" = $3 and "recordId" = $1 returning id`,
    [loserId, tenantId, entityType],
  );
  if (scoreDropped.length > 0) deleted.push({ table: "RecordScore", column: "recordId", ids: scoreDropped.map((r) => r.id) });

  // RecordScoreHistory has no such uniqueness constraint -- every row just moves.
  const historyMoved = await query<{ id: string }>(
    `update "RecordScoreHistory" set "recordId" = $1 where "tenantId" = $3 and "recordType" = $4 and "recordId" = $2 returning id`,
    [survivorId, loserId, tenantId, entityType],
  );
  if (historyMoved.length > 0) repointed.push({ table: "RecordScoreHistory", column: "recordId", ids: historyMoved.map((r) => r.id) });

  return { repointed, deleted };
}

// Survivorship default: each non-null field on the more-recently-updated record wins,
// falling back to the other record's value where the winner's is null. The caller (a human,
// via the review UI) can override any individual field via fieldChoices before confirming.
function computeDefaultFieldChoices(survivor: Record<string, any>, loser: Record<string, any>, fields: string[]) {
  const survivorIsNewer = new Date(survivor.updatedAt).getTime() >= new Date(loser.updatedAt).getTime();
  const primary = survivorIsNewer ? survivor : loser;
  const secondary = survivorIsNewer ? loser : survivor;
  const choices: Record<string, unknown> = {};
  for (const field of fields) {
    choices[field] = primary[field] !== null && primary[field] !== undefined ? primary[field] : secondary[field];
  }
  return choices;
}

const LEAD_MERGE_FIELDS = ["name", "email", "phone", "company", "source", "status", "ownerId", "tags"];
const OPPORTUNITY_MERGE_FIELDS = ["title", "amount", "expectedCloseDate", "priority", "ownerId", "stageId", "tags"];
const CASE_MERGE_FIELDS = [
  "subject", "description", "typeId", "statusId", "priorityId", "queueId", "ownerId",
  "requesterName", "requesterEmail", "requesterPhone", "relatedLeadId", "relatedOpportunityId", "relatedPartnerId",
];

function mergeTableForEntityType(entityType: EntityType) {
  return entityType === "LEAD" ? "Lead" : entityType === "OPPORTUNITY" ? "Opportunity" : "Case";
}

function mergeFieldsForEntityType(entityType: EntityType) {
  return entityType === "LEAD" ? LEAD_MERGE_FIELDS : entityType === "OPPORTUNITY" ? OPPORTUNITY_MERGE_FIELDS : CASE_MERGE_FIELDS;
}

export async function mergeRecordsForTenant(
  user: TenantUser,
  input: { matchId: string; survivorId: string; fieldChoices?: Record<string, unknown> },
) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const match = await queryOne<any>(
    `update "DedupeMatch" set status = 'MERGED', "updatedAt" = $1
     where "tenantId" = $2 and id = $3 and status = 'PENDING'
     returning ${MATCH_COLUMNS}`,
    [new Date().toISOString(), user.tenantId, input.matchId],
  );
  if (!match) throw new Error("DEDUPE_MATCH_NOT_PENDING");

  const recordIds: string[] = match.recordIds;
  if (!recordIds.includes(input.survivorId)) {
    await execute(`update "DedupeMatch" set status = 'PENDING', "updatedAt" = $1 where id = $2`, [new Date().toISOString(), match.id]);
    throw new Error("SURVIVOR_NOT_IN_MATCH");
  }
  // v1 merges exactly one loser per confirmation -- a group of 3+ candidates is resolved by
  // merging pairs one at a time (each merge collapses the group by one), keeping the merge
  // logic itself (and its audit/unmerge story) simple and uniform regardless of group size.
  const loserId = recordIds.find((id) => id !== input.survivorId);
  if (!loserId) {
    await execute(`update "DedupeMatch" set status = 'PENDING', "updatedAt" = $1 where id = $2`, [new Date().toISOString(), match.id]);
    throw new Error("NO_LOSER_IN_MATCH");
  }

  const entityType: EntityType = match.entityType;
  const table = mergeTableForEntityType(entityType);
  const columns = mergeFieldsForEntityType(entityType);

  const survivor = await queryOne<any>(`select * from "${table}" where "tenantId" = $1 and id = $2 and "mergedIntoId" is null limit 1`, [user.tenantId, input.survivorId]);
  const loser = await queryOne<any>(`select * from "${table}" where "tenantId" = $1 and id = $2 and "mergedIntoId" is null limit 1`, [user.tenantId, loserId]);
  if (!survivor || !loser) {
    await execute(`update "DedupeMatch" set status = 'PENDING', "updatedAt" = $1 where id = $2`, [new Date().toISOString(), match.id]);
    throw new Error("RECORD_NOT_FOUND");
  }

  const finalChoices = { ...computeDefaultFieldChoices(survivor, loser, columns), ...(input.fieldChoices ?? {}) };
  const now = new Date().toISOString();

  const assignments = columns.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
  const updatedSurvivor = await queryOne<any>(
    `update "${table}" set ${assignments}, "updatedAt" = $${columns.length + 1}
     where "tenantId" = $${columns.length + 2} and id = $${columns.length + 3}
     returning *`,
    [...columns.map((c) => finalChoices[c]), now, user.tenantId, input.survivorId],
  );

  const { repointed, deleted } = await repointChildRows(user.tenantId, entityType, input.survivorId, loserId);

  await execute(`update "${table}" set "mergedIntoId" = $1, "mergedAt" = $2, "updatedAt" = $2 where "tenantId" = $3 and id = $4`, [
    input.survivorId,
    now,
    user.tenantId,
    loserId,
  ]);

  const mergeAuditId = randomUUID();
  await execute(
    `insert into "MergeAudit"
      (id, "tenantId", "entityType", "survivorId", "loserId", "loserSnapshot", "survivorSnapshotBefore", "fieldChoices", "repointedRows", "mergedBy", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [mergeAuditId, user.tenantId, entityType, input.survivorId, loserId, loser, survivor, finalChoices, { repointed, deleted }, user.id, now],
  );

  await execute(`update "DedupeMatch" set "resolvedMergeAuditId" = $1 where id = $2`, [mergeAuditId, match.id]);

  await createAuditLog(user, "MERGE", entityType, input.survivorId, survivor, updatedSurvivor, { loserId, mergeAuditId });

  if (entityType === "CASE") {
    const { runAutomationsForEvent } = await import("@/lib/repositories/automations-postgres");
    await runAutomationsForEvent(user, "CASE_MERGED", "CASE", input.survivorId, updatedSurvivor).catch(() => undefined);
  }

  return { mergeAuditId, survivor: updatedSurvivor, repointed, deleted };
}

// "Unmerge where feasible": the loser row was never deleted (soft merge), so restoring it to
// independent, visible, editable status is always possible -- clearing mergedIntoId and
// restoring the survivor's pre-merge field values. What's NOT always reversible: any
// LeadListMember/RecordScore row that was DROPPED (not moved) during the merge because the
// survivor already had one -- those are genuinely gone, and this function says so explicitly
// in its return value rather than silently pretending a full reversal happened. Every other
// repointed child row (Activities, Tasks, Notes, FileObjects, EmailLogs, CommunicationOutbox
// entries, Opportunity.leadId, TelephonyCallLog) DOES get moved back, using the exact row ids
// recorded in repointedRows at merge time -- a real, mechanical reversal, not a best-effort guess.
export async function unmergeForTenant(user: TenantUser, mergeAuditId: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const audit = await queryOne<any>(`select ${AUDIT_COLUMNS}, "loserSnapshot", "survivorSnapshotBefore" from "MergeAudit" where "tenantId" = $1 and id = $2 limit 1`, [
    user.tenantId,
    mergeAuditId,
  ]);
  if (!audit) throw new Error("MERGE_AUDIT_NOT_FOUND");
  if (audit.unmergedAt) throw new Error("ALREADY_UNMERGED");

  const table = mergeTableForEntityType(audit.entityType);
  const now = new Date().toISOString();

  // Restore the loser row to independent status.
  await execute(`update "${table}" set "mergedIntoId" = null, "mergedAt" = null, "updatedAt" = $1 where "tenantId" = $2 and id = $3`, [
    now,
    user.tenantId,
    audit.loserId,
  ]);

  // Restore the survivor's pre-merge field values.
  const columns = mergeFieldsForEntityType(audit.entityType);
  const survivorBefore = audit.survivorSnapshotBefore;
  const assignments = columns.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
  await execute(`update "${table}" set ${assignments}, "updatedAt" = $${columns.length + 1} where "tenantId" = $${columns.length + 2} and id = $${columns.length + 3}`, [
    ...columns.map((c) => survivorBefore[c]),
    now,
    user.tenantId,
    audit.survivorId,
  ]);

  // Reverse every mechanically-repointed child row.
  const repointed: Array<{ table: string; column: string; ids: string[] }> = audit.repointedRows?.repointed ?? [];
  const notRecoverable: Array<{ table: string; column: string; ids: string[] }> = audit.repointedRows?.deleted ?? [];
  for (const entry of repointed) {
    if (entry.ids.length === 0) continue;
    await execute(`update "${entry.table}" set "${entry.column}" = $1 where "tenantId" = $2 and id = any($3::text[])`, [audit.loserId, user.tenantId, entry.ids]);
  }

  await execute(`update "MergeAudit" set "unmergedAt" = $1, "unmergedBy" = $2 where id = $3`, [now, user.id, audit.id]);
  await createAuditLog(user, "UNMERGE", audit.entityType, audit.survivorId, null, null, { loserId: audit.loserId, mergeAuditId });

  return { loserId: audit.loserId, survivorId: audit.survivorId, reversed: repointed, notRecoverable };
}

export async function listMergeAuditsForTenant(user: TenantUser, entityType: EntityType) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return query(`select ${AUDIT_COLUMNS} from "MergeAudit" where "tenantId" = $1 and "entityType" = $2 order by "createdAt" desc limit 100`, [user.tenantId, entityType]);
}
