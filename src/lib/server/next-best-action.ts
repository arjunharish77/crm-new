import { randomUUID } from "crypto";
import { createAuditLog, automationConditionMatches } from "@/lib/server/crm";
import { assertModuleEnabled, isModuleEnabledForTenant } from "@/lib/server/module-entitlements";
import { query, queryOne, execute, jsonbParam, queryAsSystem } from "@/lib/db/query";
import { getLeadForTenant, updateLeadForTenant } from "@/lib/repositories/leads-postgres";
import { getOpportunityForTenant, updateOpportunityForTenant } from "@/lib/repositories/opportunities-postgres";
import { createTaskForTenant } from "@/lib/repositories/tasks-postgres";
import { createActivityForTenant } from "@/lib/repositories/activities-postgres";
import { addLeadsToLeadListForTenant } from "@/lib/repositories/lead-lists-postgres";
import { createUserNotification } from "@/lib/server/notifications";
import { scoreNbaCandidatesBatchViaMlService, type MlNbaScoreResult } from "@/lib/server/ml-service-client";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isPlatformAdmin?: boolean;
  role?: { permissions?: any } | string | null;
};

export type NbaActionType =
  | "CREATE_TASK"
  | "CALL_LEAD"
  | "SEND_EMAIL"
  | "SEND_WHATSAPP"
  | "SEND_SMS"
  | "ASSIGN_OWNER"
  | "ADD_TO_LIST"
  | "UPDATE_FIELD"
  | "SCHEDULE_ACTIVITY"
  | "ESCALATE_TO_MANAGER"
  | "DO_NOTHING";

export type NbaRecordType = "LEAD" | "OPPORTUNITY";

// Mirrors the exact fixed set of keys updateLeadForTenant/updateOpportunityForTenant
// actually read off their payload (leads-postgres.ts / opportunities-postgres.ts) --
// kept here so UPDATE_FIELD can validate against it both at rule-save time and at
// execution time without silently no-opping on an unrecognized key.
// Action types that reach out to the contact directly -- distinct from CREATE_TASK/ASSIGN_OWNER/
// etc., which only change internal CRM state. Used by the channel-fatigue guardrail below.
const COMMUNICATION_ACTION_TYPES = new Set(["CALL_LEAD", "SEND_EMAIL", "SEND_WHATSAPP", "SEND_SMS"]);

const LEAD_WRITABLE_FIELDS = ["name", "email", "phone", "company", "source", "status", "ownerId"];
const OPPORTUNITY_WRITABLE_FIELDS = ["stageId", "title", "amount", "expectedCloseDate", "priority", "opportunityTypeId"];
const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export type NbaConditionGroup = { conditions: Array<{ field: string; operator: string; value?: unknown }>; conditionLogic?: "AND" | "OR" };

function normalizeConditionGroup(value: unknown): NbaConditionGroup {
  if (Array.isArray(value)) return { conditions: value, conditionLogic: "AND" };
  if (value && typeof value === "object" && Array.isArray((value as any).conditions)) {
    return { conditions: (value as any).conditions, conditionLogic: (value as any).conditionLogic === "OR" ? "OR" : "AND" };
  }
  return { conditions: [], conditionLogic: "AND" };
}

function conditionGroupMatches(record: Record<string, unknown>, group: NbaConditionGroup): boolean {
  if (!group.conditions.length) return true;
  return automationConditionMatches(record, { conditions: group.conditions, conditionLogic: group.conditionLogic ?? "AND" });
}

export type NextBestActionStrategyInput = {
  name: string;
  isActive?: boolean;
  maxVisibleRecommendationsPerUser?: number;
  cooldownHours?: number;
  dailyActionCapPerUser?: number;
  suppressionConditions?: NbaConditionGroup | unknown[];
};

export type NextBestActionRuleInput = {
  name: string;
  actionType: NbaActionType;
  eligibilityConditions?: NbaConditionGroup | unknown[];
  actionConfig?: Record<string, unknown>;
  basePriority?: number;
  businessValue?: number;
  priority?: number;
  isActive?: boolean;
  requiresApproval?: boolean;
};

const STRATEGY_COLUMNS = `id, "tenantId", name, "targetModule", "isActive", "maxVisibleRecommendationsPerUser",
  "cooldownHours", "dailyActionCapPerUser", "suppressionConditions", "createdBy", "createdAt", "updatedAt"`;

const RULE_COLUMNS = `id, "tenantId", "strategyId", name, "actionType", "eligibilityConditions", "actionConfig",
  "basePriority", "businessValue", priority, "isActive", "requiresApproval", "createdBy", "createdAt", "updatedAt"`;

const RECOMMENDATION_COLUMNS = `id, "tenantId", "strategyId", "ruleId", "recordType", "recordId", "ownerId",
  "actionType", "actionConfig", score, "scoreBreakdown", reason, status, "snoozedUntil", "respondedBy",
  "respondedAt", "expiresAt", "generatedAt", "createdAt", "updatedAt"`;

// --- Strategy CRUD ---

export async function getNextBestActionStrategyForModule(user: TenantUser, targetModule: NbaRecordType) {
  if (!user.tenantId) return null;
  return queryOne<any>(
    `select ${STRATEGY_COLUMNS} from "NextBestActionStrategy" where "tenantId" = $1 and "targetModule" = $2 limit 1`,
    [user.tenantId, targetModule],
  );
}

export async function listNextBestActionStrategiesForTenant(user: TenantUser) {
  if (!user.tenantId) return [];
  return query<any>(`select ${STRATEGY_COLUMNS} from "NextBestActionStrategy" where "tenantId" = $1 order by "targetModule" asc`, [
    user.tenantId,
  ]);
}

export async function upsertNextBestActionStrategy(
  user: TenantUser,
  targetModule: NbaRecordType,
  input: NextBestActionStrategyInput
) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "NEXT_BEST_ACTION", { isPlatformAdmin: user.isPlatformAdmin });
  const existing = await getNextBestActionStrategyForModule(user, targetModule);
  const now = new Date().toISOString();
  const payload = {
    name: input.name,
    isActive: input.isActive ?? true,
    maxVisibleRecommendationsPerUser: Math.max(1, input.maxVisibleRecommendationsPerUser ?? 5),
    cooldownHours: Math.max(0, input.cooldownHours ?? 24),
    dailyActionCapPerUser: Math.max(1, input.dailyActionCapPerUser ?? 20),
    suppressionConditions: normalizeConditionGroup(input.suppressionConditions),
  };

  if (existing) {
    const data = await queryOne<any>(
      `update "NextBestActionStrategy"
       set name = $1, "isActive" = $2, "maxVisibleRecommendationsPerUser" = $3, "cooldownHours" = $4,
           "dailyActionCapPerUser" = $5, "suppressionConditions" = $6, "updatedAt" = $7
       where "tenantId" = $8 and id = $9
       returning ${STRATEGY_COLUMNS}`,
      [
        payload.name, payload.isActive, payload.maxVisibleRecommendationsPerUser, payload.cooldownHours,
        payload.dailyActionCapPerUser, payload.suppressionConditions, now, user.tenantId, existing.id,
      ],
    );
    if (!data) throw new Error("NBA_STRATEGY_NOT_FOUND");
    await createAuditLog(user as any, "UPDATE", "NBA_STRATEGY", data.id, existing, data, null);
    return data;
  }

  const data = await queryOne<any>(
    `insert into "NextBestActionStrategy"
      (id, "tenantId", name, "targetModule", "isActive", "maxVisibleRecommendationsPerUser", "cooldownHours",
       "dailyActionCapPerUser", "suppressionConditions", "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     returning ${STRATEGY_COLUMNS}`,
    [
      randomUUID(), user.tenantId, payload.name, targetModule, payload.isActive, payload.maxVisibleRecommendationsPerUser,
      payload.cooldownHours, payload.dailyActionCapPerUser, payload.suppressionConditions, user.id, now,
    ],
  );
  if (!data) throw new Error("NBA_STRATEGY_INSERT_FAILED");
  await createAuditLog(user as any, "CREATE", "NBA_STRATEGY", data.id, null, data, null);
  return data;
}

// --- Rule CRUD ---

export async function listNextBestActionRulesForStrategy(user: TenantUser, strategyId: string) {
  if (!user.tenantId) return [];
  return query<any>(
    `select ${RULE_COLUMNS} from "NextBestActionRule" where "tenantId" = $1 and "strategyId" = $2 order by priority desc, "createdAt" asc`,
    [user.tenantId, strategyId],
  );
}

// Validated at rule save time so a misconfigured rule fails loudly to the admin who
// created it, rather than 500ing (or silently no-opping) the moment a rep clicks
// Accept on a recommendation it generated.
function validateRuleActionConfig(actionType: NbaActionType, actionConfig: Record<string, unknown>, targetModule?: NbaRecordType) {
  if (actionType === "SCHEDULE_ACTIVITY" && !actionConfig.activityTypeId) {
    throw new Error("NBA_RULE_SCHEDULE_ACTIVITY_MISSING_TYPE");
  }
  if (actionConfig.priority !== undefined && !TASK_PRIORITIES.includes(String(actionConfig.priority))) {
    throw new Error(`NBA_RULE_INVALID_PRIORITY:${actionConfig.priority}`);
  }
  if (actionType === "UPDATE_FIELD") {
    if (!actionConfig.fieldKey) throw new Error("NBA_RULE_UPDATE_FIELD_MISSING_KEY");
    if (targetModule) {
      const writable = targetModule === "LEAD" ? LEAD_WRITABLE_FIELDS : OPPORTUNITY_WRITABLE_FIELDS;
      if (!writable.includes(String(actionConfig.fieldKey))) {
        throw new Error(`NBA_RULE_UPDATE_FIELD_NOT_WRITABLE:${actionConfig.fieldKey}`);
      }
    }
  }
  if (actionType === "ADD_TO_LIST") {
    if (!actionConfig.listId) throw new Error("NBA_RULE_ADD_TO_LIST_MISSING_LIST");
    if (targetModule === "OPPORTUNITY") throw new Error("NBA_RULE_ADD_TO_LIST_LEAD_ONLY");
  }
  if (actionType === "ASSIGN_OWNER" && !actionConfig.targetUserId) {
    throw new Error("NBA_RULE_ASSIGN_OWNER_MISSING_TARGET");
  }
}

export async function createNextBestActionRule(user: TenantUser, strategyId: string, input: NextBestActionRuleInput) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "NEXT_BEST_ACTION", { isPlatformAdmin: user.isPlatformAdmin });
  const strategy = await queryOne<{ targetModule: NbaRecordType }>(
    `select "targetModule" from "NextBestActionStrategy" where "tenantId" = $1 and id = $2 limit 1`,
    [user.tenantId, strategyId],
  );
  validateRuleActionConfig(input.actionType, input.actionConfig ?? {}, strategy?.targetModule);
  const now = new Date().toISOString();
  const data = await queryOne<any>(
    `insert into "NextBestActionRule"
      (id, "tenantId", "strategyId", name, "actionType", "eligibilityConditions", "actionConfig", "basePriority",
       "businessValue", priority, "isActive", "requiresApproval", "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
     returning ${RULE_COLUMNS}`,
    [
      randomUUID(), user.tenantId, strategyId, input.name, input.actionType,
      normalizeConditionGroup(input.eligibilityConditions),
      input.actionConfig ?? {}, input.basePriority ?? 50, input.businessValue ?? 0, input.priority ?? 0,
      input.isActive ?? true, input.requiresApproval ?? false, user.id, now,
    ],
  );
  if (!data) throw new Error("NBA_RULE_INSERT_FAILED");
  await createAuditLog(user as any, "CREATE", "NBA_RULE", data.id, null, data, null);
  return data;
}

export async function updateNextBestActionRule(user: TenantUser, id: string, input: Partial<NextBestActionRuleInput>) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "NEXT_BEST_ACTION", { isPlatformAdmin: user.isPlatformAdmin });
  const existing = await queryOne<any>(`select ${RULE_COLUMNS} from "NextBestActionRule" where "tenantId" = $1 and id = $2 limit 1`, [
    user.tenantId,
    id,
  ]);
  if (!existing) return null;

  if (input.actionType !== undefined || input.actionConfig !== undefined) {
    const strategy = await queryOne<{ targetModule: NbaRecordType }>(
      `select "targetModule" from "NextBestActionStrategy" where "tenantId" = $1 and id = $2 limit 1`,
      [user.tenantId, existing.strategyId],
    );
    validateRuleActionConfig(input.actionType ?? existing.actionType, input.actionConfig ?? existing.actionConfig ?? {}, strategy?.targetModule);
  }

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ["name", "actionType", "eligibilityConditions", "actionConfig", "basePriority", "businessValue", "priority", "isActive", "requiresApproval"] as const) {
    if (input[key] !== undefined) patch[key] = key === "eligibilityConditions" ? normalizeConditionGroup(input[key]) : input[key];
  }
  const columns = Object.keys(patch);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  const data = await queryOne<any>(
    `update "NextBestActionRule" set ${assignments} where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2} returning ${RULE_COLUMNS}`,
    [...columns.map((column) => patch[column]), user.tenantId, id],
  );
  if (!data) return null;
  await createAuditLog(user as any, "UPDATE", "NBA_RULE", data.id, existing, data, null);
  return data;
}

export async function deleteNextBestActionRule(user: TenantUser, id: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "NEXT_BEST_ACTION", { isPlatformAdmin: user.isPlatformAdmin });
  const existing = await queryOne<any>(`select ${RULE_COLUMNS} from "NextBestActionRule" where "tenantId" = $1 and id = $2 limit 1`, [
    user.tenantId,
    id,
  ]);
  if (!existing) return null;
  await execute('delete from "NextBestActionRule" where "tenantId" = $1 and id = $2', [user.tenantId, id]);
  await createAuditLog(user as any, "DELETE", "NBA_RULE", id, existing, null, null);
  return existing;
}

// --- Deterministic scoring (the "no ml-service required" fallback path, built first
// per the checklist's own dependency ordering -- an optional ml-service ranking layer
// is a natural follow-up, not built in this pass, see checklist note). ---

function scoreBandToNumber(band: string | undefined | null): number {
  switch (band) {
    case "HOT": return 90;
    case "WARM": return 60;
    case "COLD": return 30;
    case "RISK": return 10;
    default: return 50;
  }
}

async function getOwnerOpenRecordCount(tenantId: string, ownerId: string): Promise<number> {
  const [leadRow, oppRow] = await Promise.all([
    queryOne<{ count: string }>(
      `select count(*) as count from "Lead" where "tenantId" = $1 and "ownerId" = $2 and coalesce(upper(status), '') not in ('LOST', 'CONVERTED', 'DISQUALIFIED')`,
      [tenantId, ownerId],
    ),
    queryOne<{ count: string }>(
      `select count(*) as count
       from "Opportunity" o
       join "StageDefinition" s on s.id = o."stageId"
       where o."tenantId" = $1 and o."ownerId" = $2 and s."isClosed" = false`,
      [tenantId, ownerId],
    ),
  ]);
  return Number(leadRow?.count ?? 0) + Number(oppRow?.count ?? 0);
}

// Blends rule authoring signals (basePriority, businessValue) with per-record dynamic
// signals (predictive score, stall/SLA risk, owner workload, recency) into one 0-100
// score. Every component is logged in scoreBreakdown so "why this score" is always
// answerable from data, not just from re-running the formula. Deliberately synchronous and
// ml-service-free: `openCount` is precomputed once per RECORD by the caller (not per rule --
// it can't differ between rules evaluating the same record), and the ml-service blend is
// batched across every eligible rule in one request by finalizeCandidateScore below, rather
// than each rule triggering its own separate train-and-score round trip.
function computeDeterministicCandidate(
  record: any,
  rule: any,
  openCount: number
): { partialScore: number; breakdown: Record<string, number | string>; mlFeatures: Record<string, number> } {
  const predictive = record.predictiveScore ?? null;
  const propensity = predictive?.conversionProbability ?? predictive?.winProbability ?? scoreBandToNumber(predictive?.scoreBand);
  const stallRisk = predictive?.stallRisk ?? 0;

  // Telephony-aware signal: a record with a real call history but weak call engagement
  // (low answer rate, cold disposition, missed callbacks -- see callEngagementScore in
  // self-learning-scoring.ts) behaves like a mild stall-risk signal, nudging it toward
  // needing a follow-up. Absent call history (callEngagementScore null) contributes nothing,
  // same "no data isn't a negative signal" treatment the scoring side uses.
  const callEngagementScore = predictive?.callEngagementScore ?? null;
  const callEngagementBoost = callEngagementScore === null ? 0 : Math.max(0, (50 - callEngagementScore) / 50) * 10;

  // More open records for the same owner -> slightly deprioritized (workload guardrail),
  // capped so it can never fully cancel out a high-propensity/high-risk candidate.
  const workloadPenalty = Math.min(15, openCount * 0.5);

  const lastTouchedAt = record.updatedAt ? new Date(record.updatedAt).getTime() : Date.now();
  const hoursSinceTouch = Math.max(0, (Date.now() - lastTouchedAt) / (1000 * 60 * 60));
  const recencyBoost = Math.min(15, hoursSinceTouch / 24 * 3); // untouched longer -> nudged up, capped

  const basePriority = Number(rule.basePriority ?? 50);
  const businessValueBoost = Math.min(10, Number(rule.businessValue ?? 0) / 1000);

  const partialScore = basePriority * 0.4 + propensity * 0.3 + stallRisk * 0.15 + recencyBoost + businessValueBoost + callEngagementBoost - workloadPenalty;

  // Purely numeric, matching ml-service/app/nba.py's FEATURE_KEYS exactly -- kept separate
  // from `breakdown` below, which also carries display-only string fields (callEngagementScore
  // can be "UNKNOWN", scoreBand is always a string) that don't belong in a numeric feature
  // vector sent over the wire.
  const mlFeatures = { basePriority, propensity, stallRisk, recencyBoost, businessValueBoost, callEngagementBoost, workloadPenalty };

  return {
    partialScore,
    mlFeatures,
    breakdown: {
      basePriority,
      propensity: Math.round(propensity),
      stallRisk: Math.round(stallRisk),
      ownerOpenRecordCount: openCount,
      workloadPenalty: Math.round(workloadPenalty * 100) / 100,
      recencyBoost: Math.round(recencyBoost * 100) / 100,
      businessValueBoost: Math.round(businessValueBoost * 100) / 100,
      callEngagementScore: callEngagementScore ?? "UNKNOWN",
      callEngagementBoost: Math.round(callEngagementBoost * 100) / 100,
      scoreBand: predictive?.scoreBand ?? "UNKNOWN",
    },
  };
}

// "Add NBA scoring in ml-service" -- folds in the batched ml-service result (or its absence)
// for one candidate. Fail-open: an unavailable/missing result (no historical data yet for
// this action type, or the whole batch request failed) just means mlBoost = 0, never an error
// -- the deterministic partialScore alone still produces a valid final score. Centered so a
// neutral 50% historical-acceptance-likelihood contributes nothing; only a learned
// above/below-average likelihood nudges the score.
function finalizeCandidateScore(
  partialScore: number,
  breakdown: Record<string, number | string>,
  mlResult: MlNbaScoreResult | undefined
): { score: number; breakdown: Record<string, number | string> } {
  const mlScore = mlResult?.available ? mlResult.mlScore ?? null : null;
  const mlBoost = mlScore === null ? 0 : (mlScore - 50) * 0.2;
  const score = Math.max(0, Math.min(100, partialScore + mlBoost));

  return {
    score: Math.round(score * 100) / 100,
    breakdown: { ...breakdown, mlScore: mlScore ?? "UNAVAILABLE", mlBoost: Math.round(mlBoost * 100) / 100 },
  };
}

function buildReason(rule: any, breakdown: Record<string, number | string>): string {
  const parts: string[] = [`Rule "${rule.name}"`];
  if (Number(breakdown.propensity) >= 60) parts.push(`high propensity (${breakdown.propensity})`);
  if (Number(breakdown.stallRisk) >= 50) parts.push(`elevated stall risk (${breakdown.stallRisk})`);
  if (Number(breakdown.recencyBoost) > 5) parts.push("untouched for a while");
  if (Number(breakdown.workloadPenalty) > 5) parts.push("owner has a heavier open pipeline");
  if (breakdown.callEngagementScore !== "UNKNOWN" && Number(breakdown.callEngagementScore) < 30) {
    parts.push(`weak call engagement (${breakdown.callEngagementScore})`);
  }
  return parts.join(" · ");
}

async function fetchRecord(user: TenantUser, recordType: NbaRecordType, recordId: string) {
  return recordType === "LEAD" ? getLeadForTenant(user, recordId) : getOpportunityForTenant(user, recordId);
}

// --- Core generation pass ---

export async function generateRecommendationsForRecord(user: TenantUser, recordType: NbaRecordType, recordId: string) {
  if (!user.tenantId) return [];
  if (!user.isPlatformAdmin && !(await isModuleEnabledForTenant(user.tenantId, "NEXT_BEST_ACTION"))) return [];
  const strategy = await getNextBestActionStrategyForModule(user, recordType);
  if (!strategy || !strategy.isActive) return [];

  const record = await fetchRecord(user, recordType, recordId);
  if (!record) return [];

  const runId = randomUUID();
  const now = new Date().toISOString();

  const suppressionGroup = normalizeConditionGroup(strategy.suppressionConditions);
  // Empty suppression conditions mean "none configured" -> never suppressed, the
  // opposite default from eligibility conditions (empty -> always eligible), so this
  // can't reuse conditionGroupMatches' shared empty-group default as-is.
  const suppressed = suppressionGroup.conditions.length > 0 && conditionGroupMatches(record, suppressionGroup);

  if (suppressed) {
    await execute(
      `insert into "NextBestActionDecisionLog"
        (id, "tenantId", "runId", "recordType", "recordId", "candidateCount", "chosenRecommendationIds", suppressed, "suppressedReason", "generatedAt")
       values ($1, $2, $3, $4, $5, 0, '[]', true, $6, $7)`,
      [randomUUID(), user.tenantId, runId, recordType, recordId, "Record matched a strategy-level suppression condition", now],
    );
    return [];
  }

  const rules = await query<any>(
    `select ${RULE_COLUMNS} from "NextBestActionRule" where "tenantId" = $1 and "strategyId" = $2 and "isActive" = true`,
    [user.tenantId, strategy.id],
  );

  // Keyed by ruleId, not actionType: two different rules sharing an actionType (e.g. two
  // independent "call this lead" rules with different eligibility conditions) must not
  // block each other -- only a rule re-triggering against its own prior recommendation
  // should be suppressed. This also prevents the same rule producing two PENDING rows
  // for the same record within one generation pass.
  const cooldownCutoff = new Date(Date.now() - strategy.cooldownHours * 60 * 60 * 1000).toISOString();
  const recentRuleIds = new Set(
    (
      await query<{ ruleId: string }>(
        `select "ruleId" from "NextBestActionRecommendation"
         where "tenantId" = $1 and "recordType" = $2 and "recordId" = $3 and "generatedAt" >= $4`,
        [user.tenantId, recordType, recordId, cooldownCutoff],
      )
    ).map((row) => row.ruleId),
  );

  const existingPending = await query<any>(
    `select "ruleId" from "NextBestActionRecommendation"
     where "tenantId" = $1 and "recordType" = $2 and "recordId" = $3 and status = 'PENDING'`,
    [user.tenantId, recordType, recordId],
  );
  const alreadyPendingRuleIds = new Set(existingPending.map((row) => row.ruleId));

  // Computed once per RECORD, not per rule -- record.ownerId is fixed across every rule
  // evaluated below, so this was previously being re-fetched redundantly once per eligible
  // rule for no reason (found while batching the ml-service call below).
  const ownerId = record.ownerId ?? null;
  const openCount = ownerId ? await getOwnerOpenRecordCount(user.tenantId, ownerId) : 0;

  const eligibility: Array<{ rule: any; eligible: boolean; suppressedReason?: string }> = rules.map((rule: any) => {
    if (alreadyPendingRuleIds.has(rule.id)) {
      return { rule, eligible: false, suppressedReason: "A recommendation from this rule is already pending for this record" };
    }
    if (recentRuleIds.has(rule.id)) {
      return { rule, eligible: false, suppressedReason: `Within the ${strategy.cooldownHours}h cooldown window for this rule` };
    }
    if (!conditionGroupMatches(record, normalizeConditionGroup(rule.eligibilityConditions))) {
      return { rule, eligible: false, suppressedReason: "Eligibility conditions did not match" };
    }
    return { rule, eligible: true };
  });

  const eligibleEntries = eligibility.filter((entry) => entry.eligible);
  const deterministic = new Map<string, { partialScore: number; breakdown: Record<string, number | string>; mlFeatures: Record<string, number> }>(
    eligibleEntries.map((entry) => [entry.rule.id, computeDeterministicCandidate(record, entry.rule, openCount)]),
  );

  // One batched ml-service call covering every eligible rule in this pass, instead of one
  // train-and-score round trip per rule -- see ml-service-client.ts/ml-service/app/nba.py.
  const mlResults = await scoreNbaCandidatesBatchViaMlService({
    tenantId: user.tenantId,
    candidates: eligibleEntries.map((entry) => ({ key: entry.rule.id, actionType: entry.rule.actionType, features: deterministic.get(entry.rule.id)!.mlFeatures })),
  }).catch(() => null);

  const candidates: Array<{ rule: any; score: number; breakdown: Record<string, number | string>; eligible: boolean; suppressedReason?: string }> = eligibility.map((entry) => {
    if (!entry.eligible) return { rule: entry.rule, score: 0, breakdown: {}, eligible: false, suppressedReason: entry.suppressedReason };
    const { partialScore, breakdown } = deterministic.get(entry.rule.id)!;
    const { score, breakdown: finalBreakdown } = finalizeCandidateScore(partialScore, breakdown, mlResults?.[entry.rule.id]);
    return { rule: entry.rule, score, breakdown: finalBreakdown, eligible: true };
  });

  await Promise.all(
    candidates.map((candidate) =>
      execute(
        `insert into "NextBestActionCandidate"
          (id, "tenantId", "runId", "recordType", "recordId", "ruleId", "actionType", score, "scoreBreakdown", "isEligible", "suppressedReason", "createdAt")
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          randomUUID(), user.tenantId, runId, recordType, recordId, candidate.rule.id, candidate.rule.actionType,
          candidate.score, candidate.breakdown, candidate.eligible, candidate.suppressedReason ?? null, now,
        ],
      )
    )
  );

  const ranked = candidates.filter((candidate) => candidate.eligible).sort((a, b) => b.score - a.score);
  // Per-record cap: at most 3 new recommendations per generation pass. The per-USER
  // visible cap (maxVisibleRecommendationsPerUser) is enforced at read time instead
  // (see listRecommendationsForOwner) since generation happens per-record and can't see
  // that owner's other pending recommendations across records without an extra query
  // this function would otherwise need to repeat on every single call.
  let chosen = ranked.slice(0, 3);

  // Channel fatigue: distinct from the per-rule cooldown above (recentRuleIds/alreadyPendingRuleIds,
  // both keyed by ruleId) -- confirmed by an existing test that two DIFFERENT rules sharing the
  // SAME actionType must NOT block each other (each rule's own eligibility is independent; that's
  // deliberate, not a gap). This guardrail is narrower and orthogonal: it caps how many DISTINCT
  // communication channels get suggested for one record at once, not how many rules can suggest
  // the same one. Two different rules independently suggesting DIFFERENT channels (e.g. one says
  // "call this lead", another says "email this lead") still reads as multi-channel spam even
  // though neither rule is individually blocked -- this is the gap that's actually new here.
  // Reuses the strategy's own cooldownHours window rather than adding a new admin-configurable
  // threshold, since it's the same "how recently is too recently" judgment call it already represents.
  if (chosen.some((candidate) => COMMUNICATION_ACTION_TYPES.has(candidate.rule.actionType))) {
    const recentCommunication = await queryOne<{ actionType: string }>(
      `select "actionType" from "NextBestActionRecommendation"
       where "tenantId" = $1 and "recordType" = $2 and "recordId" = $3
         and "actionType" = any($4::text[]) and "generatedAt" >= $5
       order by "generatedAt" desc
       limit 1`,
      [user.tenantId, recordType, recordId, [...COMMUNICATION_ACTION_TYPES], cooldownCutoff],
    );
    // The one communication actionType allowed through this pass: whichever channel was already
    // used recently (staying on the same channel doesn't introduce new fatigue -- and any rule
    // sharing that exact actionType is still free to fire, per the existing per-rule semantics
    // above), or otherwise the highest-scored communication candidate's actionType (`chosen` is
    // already sorted by score).
    const allowedActionType = recentCommunication?.actionType
      ?? chosen.find((candidate) => COMMUNICATION_ACTION_TYPES.has(candidate.rule.actionType))?.rule.actionType;
    const beforeChannelFilter = chosen;
    chosen = chosen.filter((candidate) =>
      !COMMUNICATION_ACTION_TYPES.has(candidate.rule.actionType) || candidate.rule.actionType === allowedActionType
    );
    // "Action fatigue" (gap checklist: "NBA analytics") -- this filter previously cut
    // candidates with zero trace: the NextBestActionCandidate row it already has (inserted
    // above as eligible, since fatigue is a THROUGHPUT filter applied after eligibility) kept
    // whatever suppressedReason eligibility left it with (usually null), making a
    // fatigue-suppressed candidate indistinguishable after the fact from one that simply
    // scored too low for the top-3 cut. Updated in place so the analytics report can now
    // actually count this.
    const channelFatigueRemoved = beforeChannelFilter.filter((candidate) => !chosen.includes(candidate));
    if (channelFatigueRemoved.length) {
      await execute(
        `update "NextBestActionCandidate" set "suppressedReason" = $1 where "runId" = $2 and "ruleId" = any($3::text[])`,
        [
          "Channel fatigue: another communication channel was already suggested for this record recently",
          runId,
          channelFatigueRemoved.map((candidate) => candidate.rule.id),
        ],
      );
    }
  }

  // dailyActionCapPerUser was persisted and admin-configurable but never actually read
  // anywhere -- confirmed by grep before this fix. Distinct from maxVisibleRecommendationsPerUser
  // (caps how many stay visible at once, enforced at read time above): this is a THROUGHPUT
  // guardrail on how many NEW recommendations get generated for one owner within a rolling 24h
  // window, across every record, so a burst of record activity can't flood a rep with dozens of
  // fresh suggestions in one day. Unlike the visible cap, this genuinely can't be deferred to
  // read time (it's about limiting creation, not display), so it costs one real extra query --
  // only paid when there's actually something to potentially cap.
  if (chosen.length > 0 && record.ownerId && strategy.dailyActionCapPerUser) {
    const dailyCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const generatedToday = await queryOne<{ count: string | number }>(
      `select count(*)::int as count from "NextBestActionRecommendation"
       where "tenantId" = $1 and "ownerId" = $2 and "generatedAt" >= $3`,
      [user.tenantId, record.ownerId, dailyCutoff],
    );
    const remaining = Math.max(0, strategy.dailyActionCapPerUser - Number(generatedToday?.count ?? 0));
    const beforeDailyCap = chosen;
    chosen = chosen.slice(0, remaining);
    const dailyCapRemoved = beforeDailyCap.filter((candidate) => !chosen.includes(candidate));
    if (dailyCapRemoved.length) {
      await execute(
        `update "NextBestActionCandidate" set "suppressedReason" = $1 where "runId" = $2 and "ruleId" = any($3::text[])`,
        [
          "Daily action cap reached for this owner",
          runId,
          dailyCapRemoved.map((candidate) => candidate.rule.id),
        ],
      );
    }
  }

  const created: any[] = [];
  for (const candidate of chosen) {
    const reasonText = buildReason(candidate.rule, candidate.breakdown);
    // A rule marked requiresApproval starts life as PENDING_APPROVAL instead of PENDING --
    // invisible to the owner's normal accept/dismiss flow (listRecommendationsForRecord/
    // listRecommendationsForOwner only ever select PENDING/due-SNOOZED) until the owner's
    // manager approves it via approveRecommendation, at which point it becomes a real PENDING
    // row exactly as if it had been generated that way originally.
    const initialStatus = candidate.rule.requiresApproval ? "PENDING_APPROVAL" : "PENDING";
    const data = await queryOne<any>(
      `insert into "NextBestActionRecommendation"
        (id, "tenantId", "strategyId", "ruleId", "recordType", "recordId", "ownerId", "actionType", "actionConfig",
         score, "scoreBreakdown", reason, status, "generatedAt", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14, $14)
       returning ${RECOMMENDATION_COLUMNS}`,
      [
        randomUUID(), user.tenantId, strategy.id, candidate.rule.id, recordType, recordId, record.ownerId ?? null,
        candidate.rule.actionType, candidate.rule.actionConfig ?? {}, candidate.score, candidate.breakdown, reasonText, initialStatus, now,
      ],
    );
    if (data) created.push(data);
  }

  await execute(
    `insert into "NextBestActionDecisionLog"
      (id, "tenantId", "runId", "recordType", "recordId", "candidateCount", "chosenRecommendationIds", suppressed, "suppressedReason", "generatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, false, null, $8)`,
    [randomUUID(), user.tenantId, runId, recordType, recordId, candidates.length, jsonbParam(created.map((rec) => rec.id)), now],
  );

  return created;
}

// Fire-and-forget wrapper for mutation call sites (mirrors runAutomationsForEvent's
// inline + swallowed-error shape) -- a broken NBA generation pass must never fail the
// Lead/Opportunity mutation that triggered it.
export async function refreshNextBestActionsForRecord(user: TenantUser, recordType: NbaRecordType, recordId: string) {
  return generateRecommendationsForRecord(user, recordType, recordId).catch(() => []);
}

// --- Reads ---

export async function listRecommendationsForRecord(user: TenantUser, recordType: NbaRecordType, recordId: string) {
  if (!user.tenantId) return [];
  return query<any>(
    `select ${RECOMMENDATION_COLUMNS} from "NextBestActionRecommendation"
     where "tenantId" = $1 and "recordType" = $2 and "recordId" = $3
       and (status = 'PENDING' or (status = 'SNOOZED' and ("snoozedUntil" is null or "snoozedUntil" <= now())))
     order by score desc, "generatedAt" desc`,
    [user.tenantId, recordType, recordId],
  );
}

// Per-user visible cap enforced here (read time), not at generation time -- see the
// comment in generateRecommendationsForRecord for why.
export async function listRecommendationsForOwner(user: TenantUser, ownerId: string) {
  if (!user.tenantId) return [];
  const strategies = await listNextBestActionStrategiesForTenant(user);
  const cap = strategies.length ? Math.min(...strategies.map((s) => s.maxVisibleRecommendationsPerUser)) : 5;
  return query<any>(
    `select ${RECOMMENDATION_COLUMNS} from "NextBestActionRecommendation"
     where "tenantId" = $1 and "ownerId" = $2
       and (status = 'PENDING' or (status = 'SNOOZED' and ("snoozedUntil" is null or "snoozedUntil" <= now())))
     order by score desc, "generatedAt" desc
     limit $3`,
    [user.tenantId, ownerId, cap],
  );
}

export async function getRecommendationById(user: TenantUser, id: string) {
  if (!user.tenantId) return null;
  return queryOne<any>(`select ${RECOMMENDATION_COLUMNS} from "NextBestActionRecommendation" where "tenantId" = $1 and id = $2 limit 1`, [
    user.tenantId,
    id,
  ]);
}

export async function getDecisionLogForRecord(user: TenantUser, recordType: NbaRecordType, recordId: string) {
  if (!user.tenantId) return [];
  return query<any>(
    `select id, "runId", "recordType", "recordId", "candidateCount", "chosenRecommendationIds", suppressed, "suppressedReason", "generatedAt"
     from "NextBestActionDecisionLog"
     where "tenantId" = $1 and "recordType" = $2 and "recordId" = $3
     order by "generatedAt" desc
     limit 5`,
    [user.tenantId, recordType, recordId],
  );
}

// --- Action execution / response flow ---

async function resolveManagerUserId(tenantId: string, ownerId: string | null): Promise<string | null> {
  if (!ownerId) return null;
  const owner = await queryOne<{ managerId: string | null }>('select "managerId" from "User" where "tenantId" = $1 and id = $2 limit 1', [
    tenantId,
    ownerId,
  ]);
  return owner?.managerId ?? null;
}

// Executes the recommended action for real, using the same repository functions a user
// would otherwise call by hand -- so an accepted recommendation gets full normal
// audit/automation treatment via those functions, not a shortcut. Channel-send action
// types (CALL_LEAD/SEND_EMAIL/SEND_WHATSAPP/SEND_SMS) deliberately create a task for the
// owner to actually do it rather than auto-sending a real customer communication as a
// side effect of a recommendation click -- see checklist note for why.
async function executeRecommendation(user: TenantUser, recommendation: any, record: any) {
  const config = recommendation.actionConfig ?? {};
  const recordLabel = record.name || record.title || recommendation.recordId;
  const linkFields = recommendation.recordType === "LEAD" ? { leadId: recommendation.recordId } : { opportunityId: recommendation.recordId, leadId: record.leadId ?? null };

  switch (recommendation.actionType as NbaActionType) {
    case "CREATE_TASK":
    case "CALL_LEAD":
    case "SEND_EMAIL":
    case "SEND_WHATSAPP":
    case "SEND_SMS": {
      const titles: Record<string, string> = {
        CREATE_TASK: config.taskTitle || `Follow up: ${recordLabel}`,
        CALL_LEAD: `Call ${recordLabel}`,
        SEND_EMAIL: `Email ${recordLabel}`,
        SEND_WHATSAPP: `WhatsApp ${recordLabel}`,
        SEND_SMS: `SMS ${recordLabel}`,
      };
      return createTaskForTenant(user, {
        title: titles[recommendation.actionType],
        description: recommendation.reason || undefined,
        priority: config.priority || "MEDIUM",
        ownerId: recommendation.ownerId || user.id,
        // "Completion rate" (gap checklist: "NBA analytics") -- the back-link this task needs
        // so tasks-postgres.ts's completion path can flip this recommendation to COMPLETED
        // when the task it spawned is actually finished, not just accepted. Stored in the
        // existing metadata jsonb rather than a new Task column/migration, matching this
        // engine's own established convention (actionConfig/scoreBreakdown) for auxiliary
        // linkage data that doesn't need to be queried/indexed on its own.
        metadata: { recommendationId: recommendation.id },
        ...linkFields,
      } as any);
    }
    case "SCHEDULE_ACTIVITY": {
      const dueAt = config.dueAt || new Date(Date.now() + (Number(config.offsetHours ?? 24)) * 60 * 60 * 1000).toISOString();
      return createActivityForTenant(user, {
        typeId: config.activityTypeId,
        notes: config.notes || recommendation.reason,
        dueAt,
        ...linkFields,
      });
    }
    case "ASSIGN_OWNER": {
      if (!config.targetUserId) throw new Error("NBA_ASSIGN_OWNER_MISSING_TARGET");
      const updateFn = recommendation.recordType === "LEAD" ? updateLeadForTenant : updateOpportunityForTenant;
      return updateFn(user, recommendation.recordId, { ownerId: config.targetUserId });
    }
    case "ADD_TO_LIST": {
      if (recommendation.recordType !== "LEAD") throw new Error("NBA_ADD_TO_LIST_LEAD_ONLY");
      if (!config.listId) throw new Error("NBA_ADD_TO_LIST_MISSING_LIST");
      return addLeadsToLeadListForTenant(user, config.listId, [recommendation.recordId]);
    }
    case "UPDATE_FIELD": {
      if (!config.fieldKey) throw new Error("NBA_UPDATE_FIELD_MISSING_KEY");
      // updateLeadForTenant/updateOpportunityForTenant only read a fixed, hardcoded set
      // of payload keys -- anything outside it is silently ignored by those functions,
      // which would otherwise make this action "succeed" (ACCEPTED, audited, feedback
      // recorded) while genuinely doing nothing to the record.
      const writableFields = recommendation.recordType === "LEAD" ? LEAD_WRITABLE_FIELDS : OPPORTUNITY_WRITABLE_FIELDS;
      if (!writableFields.includes(String(config.fieldKey))) {
        throw new Error(`NBA_UPDATE_FIELD_NOT_WRITABLE:${config.fieldKey}`);
      }
      const updateFn = recommendation.recordType === "LEAD" ? updateLeadForTenant : updateOpportunityForTenant;
      return updateFn(user, recommendation.recordId, { [String(config.fieldKey)]: config.fieldValue });
    }
    case "ESCALATE_TO_MANAGER": {
      const managerId = await resolveManagerUserId(user.tenantId!, recommendation.ownerId);
      if (!managerId) throw new Error("NBA_ESCALATE_NO_MANAGER");
      if (managerId === recommendation.ownerId) throw new Error("NBA_ESCALATE_SELF_MANAGER");
      return createTaskForTenant(user, {
        title: `Escalation: ${recordLabel}`,
        description: recommendation.reason || undefined,
        priority: "HIGH",
        ownerId: managerId,
        metadata: { recommendationId: recommendation.id },
        ...linkFields,
      } as any);
    }
    case "DO_NOTHING":
    default:
      return null;
  }
}

export async function respondToRecommendation(
  user: TenantUser,
  recommendationId: string,
  input: { status: "ACCEPTED" | "SNOOZED" | "DISMISSED" | "COMPLETED" | "NOT_USEFUL"; snoozedUntil?: string | null }
) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "NEXT_BEST_ACTION", { isPlatformAdmin: user.isPlatformAdmin });
  const existing = await queryOne<any>(
    `select ${RECOMMENDATION_COLUMNS} from "NextBestActionRecommendation" where "tenantId" = $1 and id = $2 limit 1`,
    [user.tenantId, recommendationId],
  );
  if (!existing) return null;
  if (existing.status !== "PENDING" && existing.status !== "SNOOZED") throw new Error("NBA_RECOMMENDATION_ALREADY_RESOLVED");

  // Atomically claim the row before executing anything -- the WHERE guard on the
  // current status means only one of two concurrent respond calls can ever match a row
  // here, closing the check-then-act race that would otherwise let both callers pass
  // the earlier SELECT-based guard and execute the action twice.
  const now = new Date().toISOString();
  const nextStatus = input.status === "SNOOZED" ? "SNOOZED" : input.status;
  const claimed = await queryOne<any>(
    `update "NextBestActionRecommendation"
     set status = $1, "snoozedUntil" = $2, "respondedBy" = $3, "respondedAt" = $4, "updatedAt" = $4
     where "tenantId" = $5 and id = $6 and status in ('PENDING', 'SNOOZED')
     returning ${RECOMMENDATION_COLUMNS}`,
    [nextStatus, input.status === "SNOOZED" ? input.snoozedUntil ?? null : null, user.id, now, user.tenantId, recommendationId],
  );
  if (!claimed) throw new Error("NBA_RECOMMENDATION_ALREADY_RESOLVED");

  const data = claimed;
  if (input.status === "ACCEPTED") {
    try {
      const record = await fetchRecord(user, existing.recordType, existing.recordId);
      if (!record) throw new Error("NBA_RECORD_NOT_FOUND");
      await executeRecommendation(user, existing, record);
    } catch (error) {
      // Execution failed after the claim -- revert to PENDING rather than leaving the
      // recommendation marked ACCEPTED when the action never actually ran.
      await execute(
        `update "NextBestActionRecommendation"
         set status = 'PENDING', "snoozedUntil" = null, "respondedBy" = null, "respondedAt" = null, "updatedAt" = $1
         where "tenantId" = $2 and id = $3`,
        [new Date().toISOString(), user.tenantId, recommendationId],
      );
      throw error;
    }
  }

  await execute(
    `insert into "NextBestActionFeedback" (id, "tenantId", "recommendationId", outcome, "recordedBy", "createdAt")
     values ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), user.tenantId, recommendationId, input.status, user.id, now],
  );
  await createAuditLog(user as any, "UPDATE", "NBA_RECOMMENDATION", recommendationId, existing, data, {
    response: { status: input.status },
  });

  return data;
}

// "Completion rate" (gap checklist: "NBA analytics") -- called from tasks-postgres.ts's
// updateTaskForTenant (via a dynamic import, to avoid a circular import: this file already
// imports createTaskForTenant from tasks-postgres.ts) when a task carrying a
// metadata.recommendationId back-link (set in executeRecommendation above) transitions to
// COMPLETED. ACCEPTED stays permanent for a recommendation whose task never gets finished --
// this only fires the real completion signal, it doesn't retroactively change what ACCEPTED
// alone means.
export async function completeLinkedRecommendation(user: TenantUser, recommendationId: string) {
  if (!user.tenantId) return null;
  const now = new Date().toISOString();
  const updated = await queryOne<any>(
    `update "NextBestActionRecommendation" set status = 'COMPLETED', "updatedAt" = $1
     where "tenantId" = $2 and id = $3 and status = 'ACCEPTED'
     returning ${RECOMMENDATION_COLUMNS}`,
    [now, user.tenantId, recommendationId],
  );
  if (!updated) return null;
  await execute(
    `insert into "NextBestActionFeedback" (id, "tenantId", "recommendationId", outcome, "recordedBy", "createdAt")
     values ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), user.tenantId, recommendationId, "COMPLETED", user.id, now],
  );
  return updated;
}

// --- Manager approval ---
// A rule marked requiresApproval routes its recommendations through here before the owner
// ever sees them, instead of straight into the normal respondToRecommendation flow.

export async function listPendingApprovalsForManager(user: TenantUser) {
  if (!user.tenantId) return [];
  // Avoids a join against "User" (whose own id/tenantId/createdAt/updatedAt columns would
  // otherwise collide with RECOMMENDATION_COLUMNS' unqualified names) by resolving direct
  // reports as a subquery instead.
  const rows = await query<any>(
    `select ${RECOMMENDATION_COLUMNS} from "NextBestActionRecommendation"
     where "tenantId" = $1 and status = 'PENDING_APPROVAL'
       and "ownerId" in (select id from "User" where "tenantId" = $1 and "managerId" = $2)
     order by "generatedAt" desc`,
    [user.tenantId, user.id],
  );
  if (rows.length === 0) return rows;

  // Enrich with human-readable names -- the table only stores recordType/recordId/ownerId, no
  // denormalized names, and a manager reviewing an approval queue needs to know who/what it's
  // for without following a link first. A per-row lookup is fine here: this list is inherently
  // small (only the subset of a manager's direct reports' recommendations that hit an
  // approval-required rule), same reasoning as the dashboard-widget NBA list.
  const ownerIds = [...new Set(rows.map((row) => row.ownerId).filter(Boolean))];
  const owners = ownerIds.length
    ? await query<{ id: string; name: string | null; email: string | null }>(
        `select id, name, email from "User" where "tenantId" = $1 and id = any($2::text[])`,
        [user.tenantId, ownerIds],
      )
    : [];
  const ownerById = new Map(owners.map((owner) => [owner.id, owner]));

  return Promise.all(
    rows.map(async (row) => {
      const record = row.recordType === "OPPORTUNITY"
        ? await getOpportunityForTenant(user, row.recordId).catch(() => null)
        : await getLeadForTenant(user, row.recordId).catch(() => null);
      const owner = row.ownerId ? ownerById.get(row.ownerId) : null;
      return {
        ...row,
        recordName: (record as any)?.name ?? (record as any)?.title ?? "Unknown record",
        ownerName: owner?.name ?? owner?.email ?? "Unknown owner",
      };
    }),
  );
}

async function resolveAndAuthorizeApproval(user: TenantUser, recommendationId: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "NEXT_BEST_ACTION", { isPlatformAdmin: user.isPlatformAdmin });
  const existing = await queryOne<any>(
    `select ${RECOMMENDATION_COLUMNS} from "NextBestActionRecommendation" where "tenantId" = $1 and id = $2 limit 1`,
    [user.tenantId, recommendationId],
  );
  if (!existing) return null;
  if (existing.status !== "PENDING_APPROVAL") throw new Error("NBA_RECOMMENDATION_NOT_PENDING_APPROVAL");

  // Only the resolved manager for this recommendation's owner may approve/reject it -- not
  // just any authenticated user, and deliberately not bypassed for platform admins the way
  // assertModuleEnabled's entitlement check is above: approving someone else's high-impact
  // action is a real accountability step tied to an actual reporting relationship, not routine
  // tenant configuration.
  const managerId = await resolveManagerUserId(user.tenantId, existing.ownerId);
  if (!managerId || managerId !== user.id) throw new Error("NBA_APPROVAL_NOT_AUTHORIZED");

  return existing;
}

export async function approveRecommendation(user: TenantUser, recommendationId: string) {
  const existing = await resolveAndAuthorizeApproval(user, recommendationId);
  if (!existing) return null;

  const now = new Date().toISOString();
  // Same atomic-claim shape as respondToRecommendation's WHERE guard above -- only one of two
  // concurrent approve/reject calls on the same row can ever match.
  const claimed = await queryOne<any>(
    `update "NextBestActionRecommendation"
     set status = 'PENDING', "updatedAt" = $1
     where "tenantId" = $2 and id = $3 and status = 'PENDING_APPROVAL'
     returning ${RECOMMENDATION_COLUMNS}`,
    [now, user.tenantId, recommendationId],
  );
  if (!claimed) throw new Error("NBA_RECOMMENDATION_ALREADY_RESOLVED");

  await createAuditLog(user as any, "UPDATE", "NBA_RECOMMENDATION", recommendationId, existing, claimed, { approval: "APPROVED" });

  if (existing.ownerId && existing.ownerId !== user.id) {
    await createUserNotification({
      tenantId: user.tenantId,
      userId: existing.ownerId,
      title: "Recommendation approved",
      message: `Your manager approved a recommended action: ${existing.reason || existing.actionType}.`,
      data: { recommendationId, recordType: existing.recordType, recordId: existing.recordId },
      category: "NBA",
    }).catch(() => undefined);
  }

  return claimed;
}

export async function rejectRecommendation(user: TenantUser, recommendationId: string, reason?: string) {
  const existing = await resolveAndAuthorizeApproval(user, recommendationId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const claimed = await queryOne<any>(
    `update "NextBestActionRecommendation"
     set status = 'REJECTED', "respondedBy" = $1, "respondedAt" = $2, "updatedAt" = $2
     where "tenantId" = $3 and id = $4 and status = 'PENDING_APPROVAL'
     returning ${RECOMMENDATION_COLUMNS}`,
    [user.id, now, user.tenantId, recommendationId],
  );
  if (!claimed) throw new Error("NBA_RECOMMENDATION_ALREADY_RESOLVED");

  await createAuditLog(user as any, "UPDATE", "NBA_RECOMMENDATION", recommendationId, existing, claimed, { approval: "REJECTED", reason: reason ?? null });

  if (existing.ownerId && existing.ownerId !== user.id) {
    await createUserNotification({
      tenantId: user.tenantId,
      userId: existing.ownerId,
      title: "Recommendation rejected",
      message: reason ? `Your manager rejected a recommended action: ${reason}` : "Your manager rejected a recommended action.",
      data: { recommendationId, recordType: existing.recordType, recordId: existing.recordId },
      category: "NBA",
    }).catch(() => undefined);
  }

  return claimed;
}

// --- Scheduled worker refresh ---

// Simplification, disclosed: there's no per-record "next NBA refresh due" timestamp
// column (that would need a column on Lead/Opportunity themselves, out of scope for a
// first pass), so the scheduled batch refresh instead targets open records whose most
// recent recommendation (if any) is older than the strategy's own cooldown window --
// a reasonable "keep the pool warm" heuristic, not a precise per-record schedule.
// WP07 (F04): BACKGROUND_JOB, disposition B -- worker-invoked recurring job with no ambient
// tenant context; the outer strategies query is genuinely cross-tenant, and the per-strategy
// candidate-record query below is tenant-parameterized in SQL but still ambient-context-
// dependent (there's no request/session to have entered context from).
export async function processDueNextBestActionRefresh(limit = 50) {
  const strategies = await queryAsSystem<any>(`select ${STRATEGY_COLUMNS} from "NextBestActionStrategy" where "isActive" = true`, []);
  let processed = 0;

  for (const strategy of strategies) {
    const staleCutoff = new Date(Date.now() - strategy.cooldownHours * 60 * 60 * 1000).toISOString();
    const table = strategy.targetModule === "LEAD" ? "Lead" : "Opportunity";
    const closedFilter =
      strategy.targetModule === "LEAD"
        ? `coalesce(upper(r.status), '') not in ('LOST', 'CONVERTED', 'DISQUALIFIED')`
        : `not exists (select 1 from "StageDefinition" s where s.id = r."stageId" and s."isClosed" = true)`;

    const candidateRecords = await queryAsSystem<{ id: string }>(
      `select r.id
       from "${table}" r
       where r."tenantId" = $1 and ${closedFilter}
         and not exists (
           select 1 from "NextBestActionRecommendation" rec
           where rec."tenantId" = r."tenantId" and rec."recordType" = $2 and rec."recordId" = r.id
             and rec."generatedAt" >= $3
         )
       order by r."updatedAt" asc
       limit $4`,
      [strategy.tenantId, strategy.targetModule, staleCutoff, limit],
    );

    for (const record of candidateRecords) {
      await generateRecommendationsForRecord({ id: "nba-worker", tenantId: strategy.tenantId }, strategy.targetModule, record.id).catch(
        () => undefined
      );
      processed += 1;
    }
  }

  return { processed };
}
