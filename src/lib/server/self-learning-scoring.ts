import { randomUUID } from "crypto";
import { createAuditLog } from "@/lib/server/crm";
import { query as pgQuery, queryOne as pgQueryOne } from "@/lib/db/query";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
};

export type ScoringSettings = {
  id: string;
  tenantId: string;
  isEnabled: boolean;
  targetModules: Array<"LEAD" | "OPPORTUNITY">;
  objective: "CONVERSION" | "OPPORTUNITY_CREATED" | "WIN_PROBABILITY" | "STALL_RISK";
  minimumHistoricalRecords: number;
  lookbackDays: number;
  retrainCadence: "MANUAL" | "WEEKLY" | "MONTHLY";
  fallbackMode: "RULE_SCORE" | "ZERO" | "KEEP_EXISTING";
  promotedLeadModelVersionId?: string | null;
  promotedOpportunityModelVersionId?: string | null;
  lastRecomputedAt?: string | null;
  updatedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type RecordType = "LEAD" | "OPPORTUNITY";

type ScoreResult = {
  recordType: RecordType;
  recordId: string;
  fitScore: number | null;
  engagementScore: number | null;
  conversionProbability: number | null;
  winProbability: number | null;
  stallRisk: number | null;
  scoreBand: "HOT" | "WARM" | "COLD" | "RISK";
  confidence: number;
  reasons: Array<{ type: "POSITIVE" | "NEGATIVE" | "INFO"; label: string; value?: unknown }>;
  source: "PREDICTIVE_SCORING" | "RULE_FALLBACK";
};

type FeatureSnapshot = {
  recordType: RecordType;
  recordId: string;
  sourceDataUpdatedAt: string | null;
  features: Record<string, unknown>;
};

type Calibration = {
  totalLeadRecords: number;
  totalOpportunityRecords: number;
  leadOverallConversionRate: number;
  leadSourceConversionRates: Map<string, number>;
  leadStatusConversionRates: Map<string, number>;
  opportunityOverallWinRate: number;
  opportunityStageWinRates: Map<string, number>;
  opportunityPriorityWinRates: Map<string, number>;
};

function jsonb(value: unknown) {
  return JSON.stringify(value ?? null);
}

const DEFAULT_SETTINGS: Omit<ScoringSettings, "id" | "tenantId"> = {
  isEnabled: false,
  targetModules: ["LEAD", "OPPORTUNITY"],
  objective: "CONVERSION",
  minimumHistoricalRecords: 25,
  lookbackDays: 365,
  retrainCadence: "MANUAL",
  fallbackMode: "RULE_SCORE",
  promotedLeadModelVersionId: null,
  promotedOpportunityModelVersionId: null,
  lastRecomputedAt: null,
  updatedBy: null,
};

function requireTenantId(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return user.tenantId;
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function daysBetween(from?: string | null, to = new Date()) {
  if (!from) return null;
  const date = new Date(from);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.round((to.getTime() - date.getTime()) / 86400000));
}

function rateFor(map: Map<string, number>, key: unknown, fallback: number) {
  const normalized = String(key ?? "UNKNOWN").toUpperCase();
  return map.get(normalized) ?? fallback;
}

function bucketRates<T>(records: T[], keyFor: (record: T) => unknown, outcomeFor: (record: T) => boolean) {
  const buckets = new Map<string, { total: number; positive: number }>();
  for (const record of records) {
    const key = String(keyFor(record) ?? "UNKNOWN").toUpperCase();
    const bucket = buckets.get(key) ?? { total: 0, positive: 0 };
    bucket.total += 1;
    if (outcomeFor(record)) bucket.positive += 1;
    buckets.set(key, bucket);
  }
  return new Map([...buckets.entries()].map(([key, bucket]) => [key, bucket.total > 0 ? bucket.positive / bucket.total : 0]));
}

function isWonStage(stage: any) {
  const name = String(stage?.name ?? stage?.label ?? stage?.stage ?? "").toLowerCase();
  return name.includes("won") || name.includes("closed won") || name === "success";
}

function isLostStage(stage: any) {
  const name = String(stage?.name ?? stage?.label ?? stage?.stage ?? "").toLowerCase();
  return name.includes("lost") || name.includes("closed lost") || name.includes("dropped");
}

export function calculateCalibration(input: {
  leads: any[];
  opportunities: any[];
  stages: any[];
}): Calibration {
  const opportunitiesByLeadId = new Map<string, any[]>();
  for (const opportunity of input.opportunities) {
    if (!opportunity.leadId) continue;
    opportunitiesByLeadId.set(opportunity.leadId, [...(opportunitiesByLeadId.get(opportunity.leadId) ?? []), opportunity]);
  }

  const stageById = new Map(input.stages.map((stage) => [stage.id, stage]));
  const leadConverted = (lead: any) => (opportunitiesByLeadId.get(lead.id)?.length ?? 0) > 0;
  const opportunityWon = (opportunity: any) => isWonStage(stageById.get(opportunity.stageId));

  const leadPositives = input.leads.filter(leadConverted).length;
  const opportunityPositives = input.opportunities.filter(opportunityWon).length;

  return {
    totalLeadRecords: input.leads.length,
    totalOpportunityRecords: input.opportunities.length,
    leadOverallConversionRate: input.leads.length ? leadPositives / input.leads.length : 0,
    leadSourceConversionRates: bucketRates(input.leads, (lead) => lead.source, leadConverted),
    leadStatusConversionRates: bucketRates(input.leads, (lead) => lead.status, leadConverted),
    opportunityOverallWinRate: input.opportunities.length ? opportunityPositives / input.opportunities.length : 0,
    opportunityStageWinRates: bucketRates(input.opportunities, (opportunity) => opportunity.stageId, opportunityWon),
    opportunityPriorityWinRates: bucketRates(input.opportunities, (opportunity) => opportunity.priority, opportunityWon),
  };
}

function groupByNullableId(records: any[], key: string) {
  const map = new Map<string, any[]>();
  for (const record of records) {
    const id = record[key];
    if (!id) continue;
    map.set(id, [...(map.get(id) ?? []), record]);
  }
  return map;
}

function completedTasks(tasks: any[]) {
  return tasks.filter((task) => String(task.status).toUpperCase() === "COMPLETED").length;
}

function overdueTasks(tasks: any[], now = new Date()) {
  return tasks.filter((task) => {
    const status = String(task.status ?? "").toUpperCase();
    if (status === "COMPLETED" || status === "CANCELLED") return false;
    if (!task.dueAt) return false;
    const due = new Date(task.dueAt);
    return !Number.isNaN(due.getTime()) && due < now;
  }).length;
}

function latestDate(records: any[], key = "createdAt") {
  let latest: string | null = null;
  for (const record of records) {
    const value = record[key];
    if (!value) continue;
    if (!latest || new Date(value).getTime() > new Date(latest).getTime()) latest = value;
  }
  return latest;
}

function firstDate(records: any[], key = "createdAt") {
  let first: string | null = null;
  for (const record of records) {
    const value = record[key];
    if (!value) continue;
    if (!first || new Date(value).getTime() < new Date(first).getTime()) first = value;
  }
  return first;
}

export function buildLeadFeatureSnapshot(input: {
  lead: any;
  opportunities: any[];
  activities: any[];
  tasks: any[];
  now?: Date;
}): FeatureSnapshot {
  const now = input.now ?? new Date();
  const latestActivityAt = latestDate(input.activities);
  const firstActivityAt = firstDate(input.activities);
  return {
    recordType: "LEAD",
    recordId: input.lead.id,
    sourceDataUpdatedAt: latestDate([input.lead, ...input.opportunities, ...input.activities, ...input.tasks], "updatedAt") ?? input.lead.updatedAt ?? input.lead.createdAt ?? null,
    features: {
      source: input.lead.source ?? "UNKNOWN",
      status: input.lead.status ?? "UNKNOWN",
      hasEmail: !!input.lead.email,
      hasPhone: !!input.lead.phone,
      hasCompany: !!input.lead.company,
      ownerId: input.lead.ownerId ?? null,
      createdAgeDays: daysBetween(input.lead.createdAt, now),
      opportunityCount: input.opportunities.length,
      activityCount: input.activities.length,
      taskCount: input.tasks.length,
      completedTaskCount: completedTasks(input.tasks),
      overdueTaskCount: overdueTasks(input.tasks, now),
      lastActivityAgeDays: daysBetween(latestActivityAt, now),
      firstResponseMinutes: firstActivityAt && input.lead.createdAt
        ? Math.max(0, Math.round((new Date(firstActivityAt).getTime() - new Date(input.lead.createdAt).getTime()) / 60000))
        : null,
    },
  };
}

export function buildOpportunityFeatureSnapshot(input: {
  opportunity: any;
  activities: any[];
  tasks: any[];
  stage: any;
  now?: Date;
}): FeatureSnapshot {
  const now = input.now ?? new Date();
  const latestActivityAt = latestDate(input.activities);
  return {
    recordType: "OPPORTUNITY",
    recordId: input.opportunity.id,
    sourceDataUpdatedAt: latestDate([input.opportunity, ...input.activities, ...input.tasks], "updatedAt") ?? input.opportunity.updatedAt ?? input.opportunity.createdAt ?? null,
    features: {
      stageId: input.opportunity.stageId ?? null,
      stageName: input.stage?.name ?? "UNKNOWN",
      priority: input.opportunity.priority ?? "MEDIUM",
      ownerId: input.opportunity.ownerId ?? null,
      amount: Number(input.opportunity.amount ?? 0),
      valueBand: valueBand(input.opportunity.amount),
      createdAgeDays: daysBetween(input.opportunity.createdAt, now),
      stageIsWon: isWonStage(input.stage),
      stageIsLost: isLostStage(input.stage),
      activityCount: input.activities.length,
      taskCount: input.tasks.length,
      completedTaskCount: completedTasks(input.tasks),
      overdueTaskCount: overdueTasks(input.tasks, now),
      lastActivityAgeDays: daysBetween(latestActivityAt, now),
    },
  };
}

function valueBand(amount: unknown) {
  const value = Number(amount ?? 0);
  if (value >= 1000000) return "ENTERPRISE";
  if (value >= 250000) return "MID_MARKET";
  if (value > 0) return "SMB";
  return "UNKNOWN";
}

function leadScoreFromFeatures(snapshot: FeatureSnapshot, lead: any, calibration: Calibration, settings: ScoringSettings): ScoreResult {
  const features = snapshot.features;
  const sourceRate = rateFor(calibration.leadSourceConversionRates, features.source, calibration.leadOverallConversionRate);
  const statusRate = rateFor(calibration.leadStatusConversionRates, features.status, calibration.leadOverallConversionRate);
  const activityCount = Number(features.activityCount ?? 0);
  const overdueCount = Number(features.overdueTaskCount ?? 0);
  const lastActivityAge = features.lastActivityAgeDays === null ? null : Number(features.lastActivityAgeDays);
  const firstResponseMinutes = features.firstResponseMinutes === null ? null : Number(features.firstResponseMinutes);

  const fitScore = clampScore(
    35 +
    sourceRate * 25 +
    statusRate * 20 +
    (features.hasEmail ? 6 : -6) +
    (features.hasPhone ? 6 : -4) +
    (features.hasCompany ? 8 : 0)
  );

  const engagementScore = clampScore(
    25 +
    Math.min(activityCount, 8) * 7 +
    Math.min(Number(features.completedTaskCount ?? 0), 5) * 4 -
    overdueCount * 8 +
    (lastActivityAge === null ? -10 : lastActivityAge <= 7 ? 18 : lastActivityAge <= 30 ? 8 : -8) +
    (firstResponseMinutes === null ? 0 : firstResponseMinutes <= 60 ? 12 : firstResponseMinutes <= 1440 ? 5 : -5)
  );

  const historicalConfidence = Math.min(100, Math.round((calibration.totalLeadRecords / Math.max(1, settings.minimumHistoricalRecords)) * 100));
  const conversionProbability = clampScore(fitScore * 0.45 + engagementScore * 0.35 + calibration.leadOverallConversionRate * 20);
  const stallRisk = clampScore(100 - engagementScore + overdueCount * 5 + (lastActivityAge && lastActivityAge > 30 ? 15 : 0));
  const scoreBand = stallRisk >= 75 ? "RISK" : conversionProbability >= 75 ? "HOT" : conversionProbability >= 45 ? "WARM" : "COLD";
  const source = settings.isEnabled && historicalConfidence >= 40 ? "PREDICTIVE_SCORING" : "RULE_FALLBACK";

  return {
    recordType: "LEAD",
    recordId: lead.id,
    fitScore,
    engagementScore,
    conversionProbability: source === "RULE_FALLBACK" ? clampScore(Number(lead.score ?? 0)) : conversionProbability,
    winProbability: null,
    stallRisk,
    scoreBand,
    confidence: source === "RULE_FALLBACK" ? Math.min(40, historicalConfidence) : historicalConfidence,
    source,
    reasons: [
      { type: sourceRate >= calibration.leadOverallConversionRate ? "POSITIVE" : "NEGATIVE", label: "Source historic conversion rate", value: Math.round(sourceRate * 100) },
      { type: activityCount > 0 ? "POSITIVE" : "NEGATIVE", label: "Activity coverage", value: activityCount },
      { type: overdueCount > 0 ? "NEGATIVE" : "POSITIVE", label: "Overdue tasks", value: overdueCount },
      { type: firstResponseMinutes !== null && firstResponseMinutes <= 60 ? "POSITIVE" : "INFO", label: "First response minutes", value: firstResponseMinutes },
    ],
  };
}

function opportunityScoreFromFeatures(snapshot: FeatureSnapshot, opportunity: any, calibration: Calibration, settings: ScoringSettings): ScoreResult {
  const features = snapshot.features;
  const stageRate = rateFor(calibration.opportunityStageWinRates, features.stageId, calibration.opportunityOverallWinRate);
  const priorityRate = rateFor(calibration.opportunityPriorityWinRates, features.priority, calibration.opportunityOverallWinRate);
  const activityCount = Number(features.activityCount ?? 0);
  const overdueCount = Number(features.overdueTaskCount ?? 0);
  const lastActivityAge = features.lastActivityAgeDays === null ? null : Number(features.lastActivityAgeDays);

  const fitScore = clampScore(35 + stageRate * 35 + priorityRate * 15 + (Number(features.amount ?? 0) > 0 ? 10 : -5));
  const engagementScore = clampScore(
    30 +
    Math.min(activityCount, 8) * 7 +
    Math.min(Number(features.completedTaskCount ?? 0), 5) * 4 -
    overdueCount * 9 +
    (lastActivityAge === null ? -12 : lastActivityAge <= 7 ? 18 : lastActivityAge <= 30 ? 6 : -12)
  );
  const historicalConfidence = Math.min(100, Math.round((calibration.totalOpportunityRecords / Math.max(1, settings.minimumHistoricalRecords)) * 100));
  const winProbability = clampScore(fitScore * 0.5 + engagementScore * 0.3 + calibration.opportunityOverallWinRate * 20);
  const stallRisk = clampScore(100 - engagementScore + overdueCount * 8 + (lastActivityAge && lastActivityAge > 30 ? 18 : 0));
  const scoreBand = stallRisk >= 75 ? "RISK" : winProbability >= 75 ? "HOT" : winProbability >= 45 ? "WARM" : "COLD";
  const source = settings.isEnabled && historicalConfidence >= 40 ? "PREDICTIVE_SCORING" : "RULE_FALLBACK";

  return {
    recordType: "OPPORTUNITY",
    recordId: opportunity.id,
    fitScore,
    engagementScore,
    conversionProbability: null,
    winProbability,
    stallRisk,
    scoreBand,
    confidence: source === "RULE_FALLBACK" ? Math.min(40, historicalConfidence) : historicalConfidence,
    source,
    reasons: [
      { type: stageRate >= calibration.opportunityOverallWinRate ? "POSITIVE" : "NEGATIVE", label: "Stage historic win rate", value: Math.round(stageRate * 100) },
      { type: activityCount > 0 ? "POSITIVE" : "NEGATIVE", label: "Activity coverage", value: activityCount },
      { type: overdueCount > 0 ? "NEGATIVE" : "POSITIVE", label: "Overdue tasks", value: overdueCount },
      { type: lastActivityAge !== null && lastActivityAge <= 7 ? "POSITIVE" : "INFO", label: "Last activity age days", value: lastActivityAge },
    ],
  };
}

export async function getScoringSettingsForTenant(user: TenantUser): Promise<ScoringSettings> {
  const tenantId = requireTenantId(user);
  const data = await pgQueryOne<any>(
    `select id, "tenantId", "isEnabled", "targetModules", objective, "minimumHistoricalRecords",
            "lookbackDays", "retrainCadence", "fallbackMode", "promotedLeadModelVersionId",
            "promotedOpportunityModelVersionId", "lastRecomputedAt", "updatedBy", "createdAt", "updatedAt"
     from "ScoringSettings"
     where "tenantId" = $1
     limit 1`,
    [tenantId],
  );
  if (data) return normalizeSettings(data);

  const now = new Date().toISOString();
  const inserted = await pgQueryOne<any>(
    `insert into "ScoringSettings"
      (id, "tenantId", "isEnabled", "targetModules", objective, "minimumHistoricalRecords",
       "lookbackDays", "retrainCadence", "fallbackMode", "promotedLeadModelVersionId",
       "promotedOpportunityModelVersionId", "lastRecomputedAt", "updatedBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
     returning id, "tenantId", "isEnabled", "targetModules", objective, "minimumHistoricalRecords",
               "lookbackDays", "retrainCadence", "fallbackMode", "promotedLeadModelVersionId",
               "promotedOpportunityModelVersionId", "lastRecomputedAt", "updatedBy", "createdAt", "updatedAt"`,
    [
      randomUUID(),
      tenantId,
      DEFAULT_SETTINGS.isEnabled,
      DEFAULT_SETTINGS.targetModules,
      DEFAULT_SETTINGS.objective,
      DEFAULT_SETTINGS.minimumHistoricalRecords,
      DEFAULT_SETTINGS.lookbackDays,
      DEFAULT_SETTINGS.retrainCadence,
      DEFAULT_SETTINGS.fallbackMode,
      DEFAULT_SETTINGS.promotedLeadModelVersionId,
      DEFAULT_SETTINGS.promotedOpportunityModelVersionId,
      DEFAULT_SETTINGS.lastRecomputedAt,
      user.id,
      now,
    ],
  );
  if (!inserted) throw new Error("SCORING_SETTINGS_INSERT_FAILED");
  return normalizeSettings(inserted);
}

export async function updateScoringSettingsForTenant(user: TenantUser, input: Partial<ScoringSettings>) {
  const tenantId = requireTenantId(user);
  await getScoringSettingsForTenant(user);
  const payload: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
    updatedBy: user.id,
  };
  if ("isEnabled" in input) payload.isEnabled = input.isEnabled === true;
  if (Array.isArray(input.targetModules)) payload.targetModules = input.targetModules.filter((module) => module === "LEAD" || module === "OPPORTUNITY");
  if (input.objective) payload.objective = input.objective;
  if (input.minimumHistoricalRecords !== undefined) payload.minimumHistoricalRecords = Math.max(1, Number(input.minimumHistoricalRecords));
  if (input.lookbackDays !== undefined) payload.lookbackDays = Math.max(30, Number(input.lookbackDays));
  if (input.retrainCadence) payload.retrainCadence = input.retrainCadence;
  if (input.fallbackMode) payload.fallbackMode = input.fallbackMode;

  const columns = Object.keys(payload);
  const values = columns.map((column) => payload[column]);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  const data = await pgQueryOne<any>(
    `update "ScoringSettings"
     set ${assignments}
     where "tenantId" = $${columns.length + 1}
     returning id, "tenantId", "isEnabled", "targetModules", objective, "minimumHistoricalRecords",
               "lookbackDays", "retrainCadence", "fallbackMode", "promotedLeadModelVersionId",
               "promotedOpportunityModelVersionId", "lastRecomputedAt", "updatedBy", "createdAt", "updatedAt"`,
    [...values, tenantId],
  );
  if (!data) throw new Error("SCORING_SETTINGS_NOT_FOUND");
  await createAuditLog(user, "UPDATE", "SCORING_SETTINGS", tenantId, null, data, null).catch(() => undefined);
  return normalizeSettings(data);
}

function normalizeSettings(data: any): ScoringSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...data,
    targetModules: Array.isArray(data.targetModules) && data.targetModules.length ? data.targetModules : DEFAULT_SETTINGS.targetModules,
    minimumHistoricalRecords: Number(data.minimumHistoricalRecords ?? DEFAULT_SETTINGS.minimumHistoricalRecords),
    lookbackDays: Number(data.lookbackDays ?? DEFAULT_SETTINGS.lookbackDays),
  };
}

export async function listScoresForTenant(user: TenantUser, input: { recordType?: RecordType | null; recordId?: string | null } = {}) {
  const tenantId = requireTenantId(user);
  const filters = ['"tenantId" = $1'];
  const values: unknown[] = [tenantId];
  if (input.recordType) {
    values.push(input.recordType);
    filters.push(`"recordType" = $${values.length}`);
  }
  if (input.recordId) {
    values.push(input.recordId);
    filters.push(`"recordId" = $${values.length}`);
  }
  return pgQuery<any>(
    `select id, "recordType", "recordId", "fitScore", "engagementScore", "conversionProbability",
            "winProbability", "stallRisk", "scoreBand", confidence, reasons, source, "calculatedAt", "updatedAt"
     from "RecordScore"
     where ${filters.join(" and ")}
     order by "calculatedAt" desc
     limit 500`,
    values,
  );
}

export async function listScoreHistoryForTenant(user: TenantUser, input: { recordType: RecordType; recordId: string }) {
  const tenantId = requireTenantId(user);
  return pgQuery<any>(
    `select id, "recordType", "recordId", "previousScore", "nextScore", "changeReason", "createdAt"
     from "RecordScoreHistory"
     where "tenantId" = $1 and "recordType" = $2 and "recordId" = $3
     order by "createdAt" desc
     limit 100`,
    [tenantId, input.recordType, input.recordId],
  );
}

async function listStageDefinitionsForScoring(tenantId: string) {
  const columns = await pgQuery<{ column_name: string }>(
    `select column_name
     from information_schema.columns
     where table_schema = 'public' and table_name = 'StageDefinition' and column_name in ('name', 'label', 'stage')`,
    [],
  );
  const available = new Set(columns.map((column) => column.column_name));
  const nameExpression = available.has("name")
    ? "name"
    : available.has("label")
      ? "label"
      : available.has("stage")
        ? "stage"
        : "id::text";

  return pgQuery<any>(
    `select id, ${nameExpression} as name, "order"
     from "StageDefinition"
     where "tenantId" = $1
     limit 1000`,
    [tenantId],
  );
}

export async function recomputeSelfLearningScoresForTenant(user: TenantUser, input: { targetModules?: RecordType[]; force?: boolean } = {}) {
  const tenantId = requireTenantId(user);
  const settings = await getScoringSettingsForTenant(user);
  const targetModules = (input.targetModules?.length ? input.targetModules : settings.targetModules).filter((module): module is RecordType => module === "LEAD" || module === "OPPORTUNITY");
  const now = new Date().toISOString();
  const runId = randomUUID();
  await pgQuery(
    `insert into "ScoringTrainingRun"
      (id, "tenantId", "targetModule", status, "startedAt", "createdBy", "createdAt")
     values ($1, $2, $3, 'RUNNING', $4, $5, $4)`,
    [runId, tenantId, targetModules.length === 2 ? "BOTH" : targetModules[0] ?? "LEAD", now, user.id],
  );

  try {
    const since = new Date();
    since.setDate(since.getDate() - settings.lookbackDays);
    const [leads, opportunities, stages, activities, tasks] = await Promise.all([
      pgQuery<any>(
        `select id, name, email, phone, company, status, source, score, "ownerId", "createdAt", "updatedAt"
         from "Lead"
         where "tenantId" = $1 and "createdAt" >= $2
         order by "createdAt" desc
         limit 2000`,
        [tenantId, since.toISOString()],
      ),
      pgQuery<any>(
        `select id, "leadId", "stageId", title, amount, priority, "ownerId", "createdAt", "updatedAt"
         from "Opportunity"
         where "tenantId" = $1 and "createdAt" >= $2
         order by "createdAt" desc
         limit 2000`,
        [tenantId, since.toISOString()],
      ),
      listStageDefinitionsForScoring(tenantId),
      pgQuery<any>(
        `select id, "leadId", "opportunityId", "createdAt", "updatedAt", "completedAt", "slaStatus"
         from "Activity"
         where "tenantId" = $1 and "createdAt" >= $2
         order by "createdAt" desc
         limit 5000`,
        [tenantId, since.toISOString()],
      ),
      pgQuery<any>(
        `select id, "leadId", "opportunityId", status, "dueAt", "createdAt", "updatedAt", "completedAt"
         from "Task"
         where "tenantId" = $1 and "createdAt" >= $2
         order by "createdAt" desc
         limit 5000`,
        [tenantId, since.toISOString()],
      ),
    ]);

    const calibration = calculateCalibration({ leads, opportunities, stages });
    const opportunitiesByLeadId = groupByNullableId(opportunities, "leadId");
    const activitiesByLeadId = groupByNullableId(activities, "leadId");
    const tasksByLeadId = groupByNullableId(tasks, "leadId");
    const activitiesByOpportunityId = groupByNullableId(activities, "opportunityId");
    const tasksByOpportunityId = groupByNullableId(tasks, "opportunityId");
    const stageById = new Map(stages.map((stage) => [stage.id, stage]));

    let processed = 0;
    let skipped = 0;

    if (targetModules.includes("LEAD")) {
      for (const lead of leads) {
        const snapshot = buildLeadFeatureSnapshot({
          lead,
          opportunities: opportunitiesByLeadId.get(lead.id) ?? [],
          activities: activitiesByLeadId.get(lead.id) ?? [],
          tasks: tasksByLeadId.get(lead.id) ?? [],
        });
        const score = leadScoreFromFeatures(snapshot, lead, calibration, settings);
        await persistScore(user, snapshot, score);
        if (settings.isEnabled || input.force) {
          await pgQuery('update "Lead" set score = $1, "updatedAt" = $2 where "tenantId" = $3 and id = $4', [
            score.conversionProbability ?? 0,
            new Date().toISOString(),
            tenantId,
            lead.id,
          ]);
        }
        processed += 1;
      }
    } else {
      skipped += leads.length;
    }

    if (targetModules.includes("OPPORTUNITY")) {
      for (const opportunity of opportunities) {
        const snapshot = buildOpportunityFeatureSnapshot({
          opportunity,
          stage: stageById.get(opportunity.stageId),
          activities: activitiesByOpportunityId.get(opportunity.id) ?? [],
          tasks: tasksByOpportunityId.get(opportunity.id) ?? [],
        });
        const score = opportunityScoreFromFeatures(snapshot, opportunity, calibration, settings);
        await persistScore(user, snapshot, score);
        processed += 1;
      }
    } else {
      skipped += opportunities.length;
    }

    const completedAt = new Date().toISOString();
    const metrics = {
      leadRecords: leads.length,
      opportunityRecords: opportunities.length,
      leadOverallConversionRate: calibration.leadOverallConversionRate,
      opportunityOverallWinRate: calibration.opportunityOverallWinRate,
      targetModules,
    };
    await pgQuery(
      `update "ScoringTrainingRun"
       set status = 'COMPLETED', "completedAt" = $1, "recordsProcessed" = $2,
           "recordsSkipped" = $3, metrics = $4
       where "tenantId" = $5 and id = $6`,
      [completedAt, processed, skipped, jsonb(metrics), tenantId, runId],
    );
    await pgQuery('update "ScoringSettings" set "lastRecomputedAt" = $1, "updatedAt" = $1 where "tenantId" = $2', [
      completedAt,
      tenantId,
    ]);
    await createAuditLog(user, "RECOMPUTE", "SCORING", runId, null, { processed, skipped, metrics }, null).catch(() => undefined);
    return { runId, processed, skipped, metrics };
  } catch (error: any) {
    await pgQuery(
      `update "ScoringTrainingRun"
       set status = 'FAILED', "completedAt" = $1, error = $2
       where "tenantId" = $3 and id = $4`,
      [new Date().toISOString(), error?.message ?? "Unknown scoring recompute error", tenantId, runId],
    );
    throw error;
  }
}

async function persistScore(user: TenantUser, snapshot: FeatureSnapshot, score: ScoreResult) {
  const tenantId = requireTenantId(user);
  const now = new Date().toISOString();
  const featureSnapshot = await pgQueryOne<any>(
    `insert into "ScoringFeatureSnapshot"
      (id, "tenantId", "recordType", "recordId", features, "sourceDataUpdatedAt", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [randomUUID(), tenantId, snapshot.recordType, snapshot.recordId, jsonb(snapshot.features), snapshot.sourceDataUpdatedAt, now],
  );
  if (!featureSnapshot) throw new Error("SCORING_FEATURE_SNAPSHOT_INSERT_FAILED");

  const existing = await pgQueryOne<any>(
    `select id, "fitScore", "engagementScore", "conversionProbability", "winProbability", "stallRisk",
            "scoreBand", confidence, reasons, source, "calculatedAt"
     from "RecordScore"
     where "tenantId" = $1 and "recordType" = $2 and "recordId" = $3
     limit 1`,
    [tenantId, score.recordType, score.recordId],
  );

  const payload = {
    fitScore: score.fitScore,
    engagementScore: score.engagementScore,
    conversionProbability: score.conversionProbability,
    winProbability: score.winProbability,
    stallRisk: score.stallRisk,
    scoreBand: score.scoreBand,
    confidence: score.confidence,
    reasons: score.reasons,
    source: score.source,
    featureSnapshotId: featureSnapshot.id,
    calculatedAt: now,
    updatedAt: now,
  };

  let scoreId = existing?.id;
  if (existing) {
    await pgQuery(
      `update "RecordScore"
       set "fitScore" = $1, "engagementScore" = $2, "conversionProbability" = $3, "winProbability" = $4,
           "stallRisk" = $5, "scoreBand" = $6, confidence = $7, reasons = $8, source = $9,
           "featureSnapshotId" = $10, "calculatedAt" = $11, "updatedAt" = $12
       where "tenantId" = $13 and id = $14`,
      [
        payload.fitScore,
        payload.engagementScore,
        payload.conversionProbability,
        payload.winProbability,
        payload.stallRisk,
        payload.scoreBand,
        payload.confidence,
        jsonb(payload.reasons),
        payload.source,
        payload.featureSnapshotId,
        payload.calculatedAt,
        payload.updatedAt,
        tenantId,
        existing.id,
      ],
    );
  } else {
    scoreId = randomUUID();
    await pgQuery(
      `insert into "RecordScore"
        (id, "tenantId", "recordType", "recordId", "fitScore", "engagementScore", "conversionProbability",
         "winProbability", "stallRisk", "scoreBand", confidence, reasons, source, "featureSnapshotId",
         "calculatedAt", "updatedAt", "createdAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15, $15)`,
      [
        scoreId,
        tenantId,
        score.recordType,
        score.recordId,
        payload.fitScore,
        payload.engagementScore,
        payload.conversionProbability,
        payload.winProbability,
        payload.stallRisk,
        payload.scoreBand,
        payload.confidence,
        jsonb(payload.reasons),
        payload.source,
        payload.featureSnapshotId,
        now,
      ],
    );
  }

  await pgQuery(
    `insert into "RecordScoreHistory"
      (id, "tenantId", "recordScoreId", "recordType", "recordId", "previousScore", "nextScore",
       "changeReason", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, 'RECOMPUTE', $8)`,
    [randomUUID(), tenantId, scoreId, score.recordType, score.recordId, existing ? jsonb(existing) : null, jsonb(payload), now],
  );
}
