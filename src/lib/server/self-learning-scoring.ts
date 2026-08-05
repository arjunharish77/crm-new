import { randomUUID } from "crypto";
import { createAuditLog } from "@/lib/server/crm";
import { query as pgQuery, queryOne as pgQueryOne } from "@/lib/db/query";
import { trainViaMlService, scoreViaMlService } from "@/lib/server/ml-service-client";

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
  approvalMode: "MANUAL" | "AUTO_PROMOTE_IF_BETTER";
  featureCatalog: { fields?: Array<Record<string, unknown>>; derivedFeatures?: Array<Record<string, unknown>> };
  prohibitedFieldKeys: string[];
  qualityThresholds: Record<string, unknown>;
  nextRetrainAt?: string | null;
  lastDriftCheckedAt?: string | null;
  retrainLockAt?: string | null;
  retrainLockOwner?: string | null;
  featureRetentionDays: number;
  lowConfidenceFallbackRules: Record<string, unknown>;
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
  source: "PREDICTIVE_SCORING" | "RULE_FALLBACK" | "MANUAL_OVERRIDE";
  expectedResponseLikelihood?: number | null;
  duplicateRisk?: number | null;
  staleRisk?: number | null;
  expectedCloseRisk?: number | null;
  suggestedCloseDate?: string | null;
  suggestedCloseDateDeltaDays?: number | null;
  nextBestAction?: string | null;
  nextBestActivityType?: string | null;
  topDrivers?: Array<{ type: "POSITIVE" | "NEGATIVE" | "INFO"; label: string; value?: unknown }>;
  missingDataWarnings?: string[];
  similarRecordIds?: string[];
  suggestedDataImprovements?: string[];
  overrideReason?: string | null;
  overrideUntil?: string | null;
  overrideOwnerId?: string | null;
  overriddenAt?: string | null;
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

type LogisticModel = {
  weights: number[];
  bias: number;
  featureMeans: number[];
  featureStds: number[];
  featureNames: string[];
};

const MIN_LOGISTIC_TRAINING_ROWS = 20;

function sigmoid(z: number) {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

function standardizeMatrix(matrix: number[][]) {
  const rowCount = matrix.length;
  const columnCount = matrix[0]?.length ?? 0;
  const means = new Array(columnCount).fill(0);
  const stds = new Array(columnCount).fill(1);
  for (let column = 0; column < columnCount; column += 1) {
    let sum = 0;
    for (let row = 0; row < rowCount; row += 1) sum += matrix[row][column];
    means[column] = rowCount ? sum / rowCount : 0;
  }
  for (let column = 0; column < columnCount; column += 1) {
    let sumSquares = 0;
    for (let row = 0; row < rowCount; row += 1) sumSquares += (matrix[row][column] - means[column]) ** 2;
    const variance = rowCount ? sumSquares / rowCount : 0;
    stds[column] = Math.sqrt(variance) || 1;
  }
  const standardized = matrix.map((row) => row.map((value, column) => (value - means[column]) / stds[column]));
  return { standardized, means, stds };
}

// Plain-JS logistic regression fit by batch gradient descent with L2 regularization. No external
// ML library is available in this Node/Next.js stack, and the feature/record counts here (a
// handful of engineered features, up to a few thousand rows per tenant) are comfortably within
// what gradient descent converges on reliably in-process, without needing a native dependency.
function trainLogisticRegression(rawFeatures: number[][], labels: number[], featureNames: string[]): LogisticModel | null {
  const rowCount = rawFeatures.length;
  if (rowCount < MIN_LOGISTIC_TRAINING_ROWS) return null;
  const positives = labels.reduce((sum, label) => sum + label, 0);
  if (positives === 0 || positives === rowCount) return null; // no contrast to learn from

  const columnCount = rawFeatures[0].length;
  const { standardized, means, stds } = standardizeMatrix(rawFeatures);
  const weights = new Array(columnCount).fill(0);
  let bias = 0;
  const epochs = 300;
  const learningRate = 0.15;
  const l2 = 0.02;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradWeights = new Array(columnCount).fill(0);
    let gradBias = 0;
    for (let row = 0; row < rowCount; row += 1) {
      let z = bias;
      for (let column = 0; column < columnCount; column += 1) z += standardized[row][column] * weights[column];
      const error = sigmoid(z) - labels[row];
      for (let column = 0; column < columnCount; column += 1) gradWeights[column] += error * standardized[row][column];
      gradBias += error;
    }
    for (let column = 0; column < columnCount; column += 1) {
      weights[column] -= learningRate * (gradWeights[column] / rowCount + l2 * weights[column]);
    }
    bias -= learningRate * (gradBias / rowCount);
  }

  if (!Number.isFinite(bias) || weights.some((weight) => !Number.isFinite(weight))) return null;
  return { weights, bias, featureMeans: means, featureStds: stds, featureNames };
}

function predictLogisticRegression(model: LogisticModel, rawFeatures: number[]): number {
  let z = model.bias;
  for (let column = 0; column < rawFeatures.length; column += 1) {
    const standardized = (rawFeatures[column] - model.featureMeans[column]) / (model.featureStds[column] || 1);
    z += standardized * model.weights[column];
  }
  return sigmoid(z);
}

const LEAD_FEATURE_NAMES = ["sourceRate", "statusRate", "hasEmail", "hasPhone", "hasCompany", "activityCoverage", "completedTaskCoverage", "overdueTaskBurden", "recency", "responseSpeed"];
const OPPORTUNITY_FEATURE_NAMES = ["stageRate", "priorityRate", "hasAmount", "activityCoverage", "completedTaskCoverage", "overdueTaskBurden", "recency"];

function leadNumericFeatures(features: Record<string, unknown>, calibration: Calibration): number[] {
  const sourceRate = rateFor(calibration.leadSourceConversionRates, features.source, calibration.leadOverallConversionRate);
  const statusRate = rateFor(calibration.leadStatusConversionRates, features.status, calibration.leadOverallConversionRate);
  const activityCount = Number(features.activityCount ?? 0);
  const completedTaskCount = Number(features.completedTaskCount ?? 0);
  const overdueTaskCount = Number(features.overdueTaskCount ?? 0);
  const lastActivityAge = features.lastActivityAgeDays as number | null;
  const firstResponseMinutes = features.firstResponseMinutes as number | null;
  return [
    sourceRate,
    statusRate,
    features.hasEmail ? 1 : 0,
    features.hasPhone ? 1 : 0,
    features.hasCompany ? 1 : 0,
    Math.min(activityCount, 8) / 8,
    Math.min(completedTaskCount, 5) / 5,
    Math.min(overdueTaskCount, 5) / 5,
    lastActivityAge === null || lastActivityAge === undefined ? 0 : 1 / (1 + lastActivityAge / 30),
    firstResponseMinutes === null || firstResponseMinutes === undefined ? 0 : 1 / (1 + firstResponseMinutes / 60),
  ];
}

function opportunityNumericFeatures(features: Record<string, unknown>, calibration: Calibration): number[] {
  const stageRate = rateFor(calibration.opportunityStageWinRates, features.stageId, calibration.opportunityOverallWinRate);
  const priorityRate = rateFor(calibration.opportunityPriorityWinRates, features.priority, calibration.opportunityOverallWinRate);
  const activityCount = Number(features.activityCount ?? 0);
  const completedTaskCount = Number(features.completedTaskCount ?? 0);
  const overdueTaskCount = Number(features.overdueTaskCount ?? 0);
  const lastActivityAge = features.lastActivityAgeDays as number | null;
  return [
    stageRate,
    priorityRate,
    Number(features.amount ?? 0) > 0 ? 1 : 0,
    Math.min(activityCount, 8) / 8,
    Math.min(completedTaskCount, 5) / 5,
    Math.min(overdueTaskCount, 5) / 5,
    lastActivityAge === null || lastActivityAge === undefined ? 0 : 1 / (1 + lastActivityAge / 30),
  ];
}

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
  approvalMode: "MANUAL",
  featureCatalog: { fields: [], derivedFeatures: [] },
  prohibitedFieldKeys: [],
  qualityThresholds: { minimumHoldoutSampleSize: 20, maximumBrierScore: 0.35, minimumLift: 1.2 },
  nextRetrainAt: null,
  lastDriftCheckedAt: null,
  retrainLockAt: null,
  retrainLockOwner: null,
  featureRetentionDays: 365,
  lowConfidenceFallbackRules: {},
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
  if (stage && typeof stage.isWon === "boolean") return stage.isWon;
  const name = String(stage?.name ?? stage?.label ?? stage?.stage ?? "").toLowerCase();
  return name.includes("won") || name.includes("closed won") || name === "success";
}

function isLostStage(stage: any) {
  if (stage && typeof stage.isWon === "boolean" && typeof stage.isClosed === "boolean") {
    return stage.isClosed && !stage.isWon;
  }
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

function serializeCalibration(calibration: Calibration): Record<string, unknown> {
  return {
    totalLeadRecords: calibration.totalLeadRecords,
    totalOpportunityRecords: calibration.totalOpportunityRecords,
    leadOverallConversionRate: calibration.leadOverallConversionRate,
    leadSourceConversionRates: Object.fromEntries(calibration.leadSourceConversionRates),
    leadStatusConversionRates: Object.fromEntries(calibration.leadStatusConversionRates),
    opportunityOverallWinRate: calibration.opportunityOverallWinRate,
    opportunityStageWinRates: Object.fromEntries(calibration.opportunityStageWinRates),
    opportunityPriorityWinRates: Object.fromEntries(calibration.opportunityPriorityWinRates),
  };
}

function deserializeCalibration(data: any): Calibration {
  return {
    totalLeadRecords: Number(data?.totalLeadRecords ?? 0),
    totalOpportunityRecords: Number(data?.totalOpportunityRecords ?? 0),
    leadOverallConversionRate: Number(data?.leadOverallConversionRate ?? 0),
    leadSourceConversionRates: new Map(Object.entries(data?.leadSourceConversionRates ?? {})) as Map<string, number>,
    leadStatusConversionRates: new Map(Object.entries(data?.leadStatusConversionRates ?? {})) as Map<string, number>,
    opportunityOverallWinRate: Number(data?.opportunityOverallWinRate ?? 0),
    opportunityStageWinRates: new Map(Object.entries(data?.opportunityStageWinRates ?? {})) as Map<string, number>,
    opportunityPriorityWinRates: new Map(Object.entries(data?.opportunityPriorityWinRates ?? {})) as Map<string, number>,
  };
}

function hashUnitInterval(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return hash / 4294967296;
}

function splitTrainHoldout<T extends Record<string, any>>(records: T[], idKey: string, holdoutRatio = 0.2) {
  const train: T[] = [];
  const holdout: T[] = [];
  for (const record of records) {
    const bucket = hashUnitInterval(String(record[idKey]));
    if (bucket < holdoutRatio) holdout.push(record);
    else train.push(record);
  }
  return { train, holdout };
}

function binaryClassificationMetrics(samples: Array<{ predicted: number; actual: boolean }>) {
  if (!samples.length) {
    return { sampleSize: 0, brierScore: null, accuracy: null, precision: null, recall: null, hotBandActualRate: null, coldBandActualRate: null, lift: null };
  }
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;
  let squaredError = 0;
  for (const sample of samples) {
    const probability = sample.predicted / 100;
    squaredError += (probability - (sample.actual ? 1 : 0)) ** 2;
    const predictedPositive = sample.predicted >= 50;
    if (predictedPositive && sample.actual) truePositive += 1;
    else if (predictedPositive && !sample.actual) falsePositive += 1;
    else if (!predictedPositive && sample.actual) falseNegative += 1;
    else trueNegative += 1;
  }
  const accuracy = (truePositive + trueNegative) / samples.length;
  const precision = truePositive + falsePositive > 0 ? truePositive / (truePositive + falsePositive) : null;
  const recall = truePositive + falseNegative > 0 ? truePositive / (truePositive + falseNegative) : null;
  const brierScore = squaredError / samples.length;

  const hotSamples = samples.filter((sample) => sample.predicted >= 75);
  const coldSamples = samples.filter((sample) => sample.predicted < 45);
  const hotBandActualRate = hotSamples.length ? hotSamples.filter((sample) => sample.actual).length / hotSamples.length : null;
  const coldBandActualRate = coldSamples.length ? coldSamples.filter((sample) => sample.actual).length / coldSamples.length : null;
  const lift = hotBandActualRate !== null && coldBandActualRate !== null && coldBandActualRate > 0 ? hotBandActualRate / coldBandActualRate : null;

  return {
    sampleSize: samples.length,
    brierScore: Math.round(brierScore * 1000) / 1000,
    accuracy: Math.round(accuracy * 1000) / 1000,
    precision: precision === null ? null : Math.round(precision * 1000) / 1000,
    recall: recall === null ? null : Math.round(recall * 1000) / 1000,
    hotBandActualRate: hotBandActualRate === null ? null : Math.round(hotBandActualRate * 1000) / 1000,
    coldBandActualRate: coldBandActualRate === null ? null : Math.round(coldBandActualRate * 1000) / 1000,
    lift: lift === null ? null : Math.round(lift * 1000) / 1000,
  };
}

async function getOrCreateScoringModel(input: { tenantId: string; targetModule: RecordType; objective: ScoringSettings["objective"]; createdBy: string }) {
  const existing = await pgQueryOne<any>(
    `select id from "ScoringModel" where "tenantId" = $1 and "targetModule" = $2 and objective = $3 and status != 'ARCHIVED' order by "createdAt" desc limit 1`,
    [input.tenantId, input.targetModule, input.objective],
  );
  if (existing?.id) return existing.id as string;

  const id = randomUUID();
  const now = new Date().toISOString();
  const name = `${input.targetModule === "LEAD" ? "Lead" : "Opportunity"} ${input.objective.replace(/_/g, " ").toLowerCase()} model`;
  await pgQuery(
    `insert into "ScoringModel" (id, "tenantId", name, "targetModule", objective, status, "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7, $7)`,
    [id, input.tenantId, name, input.targetModule, input.objective, input.createdBy, now],
  );
  return id;
}

async function loadPromotedScorer(
  tenantId: string,
  promotedVersionId: string | null | undefined,
  targetModule: RecordType,
  lookbackDays: number,
): Promise<{ calibration: Calibration; logisticModel: LogisticModel | null; mlPredictions: Map<string, number> | null } | null> {
  if (!promotedVersionId) return null;
  const version = await pgQueryOne<any>(
    `select algorithm, "featureConfig" from "ScoringModelVersion" where "tenantId" = $1 and id = $2 and status = 'PROMOTED' limit 1`,
    [tenantId, promotedVersionId],
  );
  if (!version?.featureConfig?.calibration) return null;

  let mlPredictions: Map<string, number> | null = null;
  if (version.algorithm === "GRADIENT_BOOSTED_TREES_V1" && version.featureConfig?.modelStorageKey) {
    // Reload and re-score with the promoted, already-trained Python model -- never retrains
    // it here, mirroring how a promoted JS calibration/logistic model is reused as-is.
    const result = await scoreViaMlService({
      tenantId,
      targetModule,
      modelStorageKey: version.featureConfig.modelStorageKey,
      lookbackDays,
    });
    if (result?.predictions) {
      mlPredictions = new Map(result.predictions.map((p) => [p.recordId, p.probability]));
    }
  }

  return {
    calibration: deserializeCalibration(version.featureConfig.calibration),
    logisticModel: version.featureConfig.logisticModel ?? null,
    mlPredictions,
  };
}

async function createScoringModelVersion(input: {
  tenantId: string;
  modelId: string;
  algorithm: string;
  featureConfig: Record<string, unknown>;
  metrics: Record<string, unknown>;
}) {
  const latest = await pgQueryOne<{ versionNumber: number }>(
    `select "versionNumber" from "ScoringModelVersion" where "tenantId" = $1 and "modelId" = $2 order by "versionNumber" desc limit 1`,
    [input.tenantId, input.modelId],
  );
  const versionNumber = (latest?.versionNumber ?? 0) + 1;
  const id = randomUUID();
  const now = new Date().toISOString();
  await pgQuery(
    `insert into "ScoringModelVersion"
      (id, "tenantId", "modelId", "versionNumber", algorithm, status, "featureConfig", metrics, "createdAt")
     values ($1, $2, $3, $4, $5, 'DRAFT', $6, $7, $8)`,
    [id, input.tenantId, input.modelId, versionNumber, input.algorithm, jsonb(input.featureConfig), jsonb(input.metrics), now],
  );
  return { id, versionNumber };
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

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function scoreDrivers(reasons: ScoreResult["reasons"]) {
  return reasons.slice(0, 6);
}

function leadMissingWarnings(features: Record<string, unknown>) {
  const warnings: string[] = [];
  if (!features.hasEmail) warnings.push("Email is missing");
  if (!features.hasPhone) warnings.push("Phone is missing");
  if (!features.hasCompany) warnings.push("Company is missing");
  if (Number(features.activityCount ?? 0) === 0) warnings.push("No activity has been logged");
  return warnings;
}

function leadAction(input: { engagementScore: number; staleRisk: number; duplicateRisk: number; expectedResponseLikelihood: number; features: Record<string, unknown> }) {
  if (input.duplicateRisk >= 70) return { action: "Review possible duplicate before outreach", activityType: "Admin Review" };
  if (input.staleRisk >= 70) return { action: "Revive with a priority follow-up", activityType: "Call" };
  if (input.expectedResponseLikelihood >= 70) return { action: "Call within the next working window", activityType: "Call" };
  if (Number(input.features.activityCount ?? 0) === 0) return { action: "Start first-touch nurture sequence", activityType: "Email" };
  return { action: "Continue nurture and monitor engagement", activityType: "Task" };
}

function opportunityAction(input: { stallRisk: number; winProbability: number; features: Record<string, unknown> }) {
  if (input.stallRisk >= 70) return { action: "Schedule decision-maker follow-up", activityType: "Call" };
  if (input.winProbability >= 75) return { action: "Push closing checklist and fee/payment step", activityType: "Meeting" };
  if (Number(input.features.activityCount ?? 0) === 0) return { action: "Log discovery activity", activityType: "Call" };
  return { action: "Progress to the next stage action", activityType: "Task" };
}

function scoreQualityStatus(metrics: any, thresholds: Record<string, unknown>) {
  const holdout = metrics?.holdout ?? metrics;
  const sampleSize = Number(holdout?.sampleSize ?? 0);
  const minimumHoldoutSampleSize = Number(thresholds.minimumHoldoutSampleSize ?? 20);
  const brier = holdout?.brierScore == null ? null : Number(holdout.brierScore);
  const maximumBrierScore = Number(thresholds.maximumBrierScore ?? 0.35);
  const lift = holdout?.lift == null ? null : Number(holdout.lift);
  const minimumLift = Number(thresholds.minimumLift ?? 1.2);
  if (sampleSize < minimumHoldoutSampleSize || (brier !== null && brier > maximumBrierScore)) return "FAIL";
  if (lift !== null && lift < minimumLift) return "WARN";
  return "PASS";
}

function featureControls(settings: ScoringSettings) {
  const fields = Array.isArray(settings.featureCatalog?.fields) ? settings.featureCatalog.fields : [];
  const excludedFeatureKeys = fields
    .filter((field) => field?.fieldKey && field.isIncluded === false)
    .map((field) => String(field.fieldKey));
  const prohibitedFeatureKeys = [
    ...settings.prohibitedFieldKeys,
    ...fields.filter((field) => field?.fieldKey && field.isProhibited === true).map((field) => String(field.fieldKey)),
  ];
  return { excludedFeatureKeys: [...new Set(excludedFeatureKeys)], prohibitedFeatureKeys: [...new Set(prohibitedFeatureKeys)] };
}

function leadScoreFromFeatures(snapshot: FeatureSnapshot, lead: any, calibration: Calibration, settings: ScoringSettings, logisticModel?: LogisticModel | null, mlPrediction?: number | null): ScoreResult {
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
  const heuristicProbability = clampScore(fitScore * 0.45 + engagementScore * 0.35 + calibration.leadOverallConversionRate * 20);
  const conversionProbability = mlPrediction != null
    ? clampScore(mlPrediction)
    : logisticModel
      ? clampScore(predictLogisticRegression(logisticModel, leadNumericFeatures(features, calibration)) * 100)
      : heuristicProbability;
  const stallRisk = clampScore(100 - engagementScore + overdueCount * 5 + (lastActivityAge && lastActivityAge > 30 ? 15 : 0));
  const scoreBand = stallRisk >= 75 ? "RISK" : conversionProbability >= 75 ? "HOT" : conversionProbability >= 45 ? "WARM" : "COLD";
  const source = settings.isEnabled && historicalConfidence >= 40 ? "PREDICTIVE_SCORING" : "RULE_FALLBACK";
  const duplicateRisk = clampScore((features.hasEmail ? 0 : 25) + (features.hasPhone ? 0 : 25) + (String(features.status ?? "").toUpperCase() === "LOST" ? 10 : 0));
  const staleRisk = clampScore((lastActivityAge === null ? 70 : lastActivityAge > 45 ? 80 : lastActivityAge > 21 ? 55 : 20) + overdueCount * 6);
  const expectedResponseLikelihood = clampScore(engagementScore * 0.6 + fitScore * 0.25 + (firstResponseMinutes !== null && firstResponseMinutes <= 1440 ? 15 : 0));
  const missingDataWarnings = leadMissingWarnings(features);
  const action = leadAction({ engagementScore, staleRisk, duplicateRisk, expectedResponseLikelihood, features });

  const result: ScoreResult = {
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
    expectedResponseLikelihood,
    duplicateRisk,
    staleRisk,
    expectedCloseRisk: null,
    suggestedCloseDate: null,
    suggestedCloseDateDeltaDays: null,
    nextBestAction: action.action,
    nextBestActivityType: action.activityType,
    missingDataWarnings,
    similarRecordIds: [],
    suggestedDataImprovements: missingDataWarnings.map((warning) => `Improve scoring confidence: ${warning.toLowerCase()}.`),
  };
  result.topDrivers = scoreDrivers(result.reasons);
  return result;
}

function opportunityScoreFromFeatures(snapshot: FeatureSnapshot, opportunity: any, calibration: Calibration, settings: ScoringSettings, logisticModel?: LogisticModel | null, mlPrediction?: number | null): ScoreResult {
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
  const heuristicProbability = clampScore(fitScore * 0.5 + engagementScore * 0.3 + calibration.opportunityOverallWinRate * 20);
  const winProbability = mlPrediction != null
    ? clampScore(mlPrediction)
    : logisticModel
      ? clampScore(predictLogisticRegression(logisticModel, opportunityNumericFeatures(features, calibration)) * 100)
      : heuristicProbability;
  const stallRisk = clampScore(100 - engagementScore + overdueCount * 8 + (lastActivityAge && lastActivityAge > 30 ? 18 : 0));
  const scoreBand = stallRisk >= 75 ? "RISK" : winProbability >= 75 ? "HOT" : winProbability >= 45 ? "WARM" : "COLD";
  const source = settings.isEnabled && historicalConfidence >= 40 ? "PREDICTIVE_SCORING" : "RULE_FALLBACK";
  const expectedCloseRisk = clampScore(stallRisk * 0.75 + (winProbability < 35 ? 20 : 0));
  const closeDeltaDays = expectedCloseRisk >= 75 ? 30 : expectedCloseRisk >= 50 ? 14 : winProbability >= 75 ? -7 : 0;
  const suggestedCloseDate = addDays(new Date(), Math.max(1, 21 + closeDeltaDays)).toISOString();
  const action = opportunityAction({ stallRisk, winProbability, features });
  const missingDataWarnings = [
    Number(features.amount ?? 0) > 0 ? null : "Opportunity amount is missing",
    activityCount > 0 ? null : "No opportunity activity has been logged",
    lastActivityAge === null ? "No recent activity date is available" : null,
  ].filter((warning): warning is string => !!warning);

  const result: ScoreResult = {
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
    expectedResponseLikelihood: null,
    duplicateRisk: null,
    staleRisk: null,
    expectedCloseRisk,
    suggestedCloseDate,
    suggestedCloseDateDeltaDays: closeDeltaDays,
    nextBestAction: action.action,
    nextBestActivityType: action.activityType,
    missingDataWarnings,
    similarRecordIds: [],
    suggestedDataImprovements: missingDataWarnings.map((warning) => `Improve forecast quality: ${warning.toLowerCase()}.`),
  };
  result.topDrivers = scoreDrivers(result.reasons);
  return result;
}

export async function getScoringSettingsForTenant(user: TenantUser): Promise<ScoringSettings> {
  const tenantId = requireTenantId(user);
  const data = await pgQueryOne<any>(
    `select id, "tenantId", "isEnabled", "targetModules", objective, "minimumHistoricalRecords",
            "lookbackDays", "retrainCadence", "fallbackMode", "approvalMode", "featureCatalog",
            "prohibitedFieldKeys", "qualityThresholds", "nextRetrainAt", "lastDriftCheckedAt",
            "retrainLockAt", "retrainLockOwner", "featureRetentionDays", "lowConfidenceFallbackRules",
            "promotedLeadModelVersionId", "promotedOpportunityModelVersionId", "lastRecomputedAt",
            "updatedBy", "createdAt", "updatedAt"
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
       "lookbackDays", "retrainCadence", "fallbackMode", "approvalMode", "featureCatalog",
       "prohibitedFieldKeys", "qualityThresholds", "featureRetentionDays", "lowConfidenceFallbackRules", "promotedLeadModelVersionId",
       "promotedOpportunityModelVersionId", "lastRecomputedAt", "updatedBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $20)
     returning id, "tenantId", "isEnabled", "targetModules", objective, "minimumHistoricalRecords",
               "lookbackDays", "retrainCadence", "fallbackMode", "approvalMode", "featureCatalog",
               "prohibitedFieldKeys", "qualityThresholds", "nextRetrainAt", "lastDriftCheckedAt",
               "retrainLockAt", "retrainLockOwner", "featureRetentionDays", "lowConfidenceFallbackRules",
               "promotedLeadModelVersionId", "promotedOpportunityModelVersionId", "lastRecomputedAt",
               "updatedBy", "createdAt", "updatedAt"`,
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
      DEFAULT_SETTINGS.approvalMode,
      jsonb(DEFAULT_SETTINGS.featureCatalog),
      DEFAULT_SETTINGS.prohibitedFieldKeys,
      jsonb(DEFAULT_SETTINGS.qualityThresholds),
      DEFAULT_SETTINGS.featureRetentionDays,
      jsonb(DEFAULT_SETTINGS.lowConfidenceFallbackRules),
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
  if (input.approvalMode) payload.approvalMode = input.approvalMode;
  if (input.featureCatalog) payload.featureCatalog = input.featureCatalog;
  if (Array.isArray(input.prohibitedFieldKeys)) payload.prohibitedFieldKeys = input.prohibitedFieldKeys;
  if (input.qualityThresholds) payload.qualityThresholds = input.qualityThresholds;
  if (input.nextRetrainAt !== undefined) payload.nextRetrainAt = input.nextRetrainAt;
  if (input.featureRetentionDays !== undefined) payload.featureRetentionDays = Math.max(30, Number(input.featureRetentionDays));
  if (input.lowConfidenceFallbackRules) payload.lowConfidenceFallbackRules = input.lowConfidenceFallbackRules;

  const columns = Object.keys(payload);
  const values = columns.map((column) => payload[column]);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  const data = await pgQueryOne<any>(
    `update "ScoringSettings"
     set ${assignments}
     where "tenantId" = $${columns.length + 1}
     returning id, "tenantId", "isEnabled", "targetModules", objective, "minimumHistoricalRecords",
               "lookbackDays", "retrainCadence", "fallbackMode", "approvalMode", "featureCatalog",
               "prohibitedFieldKeys", "qualityThresholds", "nextRetrainAt", "lastDriftCheckedAt",
               "retrainLockAt", "retrainLockOwner", "featureRetentionDays", "lowConfidenceFallbackRules",
               "promotedLeadModelVersionId", "promotedOpportunityModelVersionId", "lastRecomputedAt",
               "updatedBy", "createdAt", "updatedAt"`,
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
    featureCatalog: data.featureCatalog && typeof data.featureCatalog === "object" ? data.featureCatalog : DEFAULT_SETTINGS.featureCatalog,
    prohibitedFieldKeys: Array.isArray(data.prohibitedFieldKeys) ? data.prohibitedFieldKeys : DEFAULT_SETTINGS.prohibitedFieldKeys,
    qualityThresholds: data.qualityThresholds && typeof data.qualityThresholds === "object" ? data.qualityThresholds : DEFAULT_SETTINGS.qualityThresholds,
    lowConfidenceFallbackRules: data.lowConfidenceFallbackRules && typeof data.lowConfidenceFallbackRules === "object" ? data.lowConfidenceFallbackRules : DEFAULT_SETTINGS.lowConfidenceFallbackRules,
    minimumHistoricalRecords: Number(data.minimumHistoricalRecords ?? DEFAULT_SETTINGS.minimumHistoricalRecords),
    lookbackDays: Number(data.lookbackDays ?? DEFAULT_SETTINGS.lookbackDays),
    featureRetentionDays: Number(data.featureRetentionDays ?? DEFAULT_SETTINGS.featureRetentionDays),
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
            "winProbability", "stallRisk", "scoreBand", confidence, reasons, source,
            "expectedResponseLikelihood", "duplicateRisk", "staleRisk", "expectedCloseRisk",
            "suggestedCloseDate", "suggestedCloseDateDeltaDays", "nextBestAction", "nextBestActivityType",
            "topDrivers", "missingDataWarnings", "similarRecordIds", "suggestedDataImprovements",
            "overrideReason", "overrideUntil", "overrideOwnerId", "overriddenAt",
            "calculatedAt", "updatedAt"
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

export async function listFeatureCatalogForTenant(user: TenantUser, targetModule?: RecordType | null) {
  const tenantId = requireTenantId(user);
  const values: unknown[] = [tenantId];
  const clauses = ['"tenantId" = $1'];
  if (targetModule) {
    values.push(targetModule);
    clauses.push(`"targetModule" = $${values.length}`);
  }
  return pgQuery<any>(
    `select id, "targetModule", "fieldKey", label, source, "dataType", "isIncluded", "isSensitive",
            "isProhibited", "coveragePercent", "nonNullCount", "distinctCount", "lastProfiledAt", "updatedAt"
     from "ScoringFeatureCatalog"
     where ${clauses.join(" and ")}
     order by "targetModule", source, label`,
    values,
  );
}

export async function updateFeatureCatalogForTenant(user: TenantUser, items: Array<Record<string, unknown>>) {
  const tenantId = requireTenantId(user);
  const now = new Date().toISOString();
  for (const item of items) {
    const targetModule = item.targetModule === "OPPORTUNITY" ? "OPPORTUNITY" : "LEAD";
    const fieldKey = String(item.fieldKey ?? "").trim();
    if (!fieldKey) continue;
    await pgQuery(
      `insert into "ScoringFeatureCatalog"
        (id, "tenantId", "targetModule", "fieldKey", label, source, "dataType", "isIncluded", "isSensitive", "isProhibited", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
       on conflict ("tenantId", "targetModule", "fieldKey") do update
       set label = excluded.label,
           source = excluded.source,
           "dataType" = excluded."dataType",
           "isIncluded" = excluded."isIncluded",
           "isSensitive" = excluded."isSensitive",
           "isProhibited" = excluded."isProhibited",
           "updatedAt" = excluded."updatedAt"`,
      [
        randomUUID(),
        tenantId,
        targetModule,
        fieldKey,
        String(item.label ?? fieldKey),
        String(item.source ?? "SYSTEM"),
        String(item.dataType ?? "UNKNOWN"),
        item.isIncluded !== false,
        item.isSensitive === true,
        item.isProhibited === true,
        now,
      ],
    );
  }
  await syncSettingsFeatureCatalog(user);
  return listFeatureCatalogForTenant(user, null);
}

export async function profileFeatureCatalogForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  const latest = await pgQuery<any>(
    `select distinct on ("recordType", "recordId") "recordType", features
     from "ScoringFeatureSnapshot"
     where "tenantId" = $1
     order by "recordType", "recordId", "createdAt" desc
     limit 5000`,
    [tenantId],
  );
  const byModule = new Map<RecordType, any[]>();
  for (const row of latest) {
    const targetModule = row.recordType as RecordType;
    byModule.set(targetModule, [...(byModule.get(targetModule) ?? []), row.features ?? {}]);
  }
  const now = new Date().toISOString();
  for (const [module, rows] of byModule.entries()) {
    const keys = [...new Set(rows.flatMap((features) => Object.keys(features)))];
    for (const key of keys) {
      const values = rows.map((features) => features[key]).filter((value) => value !== null && value !== undefined && value !== "");
      const sample = values.find((value) => value !== null && value !== undefined);
      const source = key.startsWith("custom_") ? "CUSTOM_FIELD" : key.startsWith("emb_") ? "EMBEDDING" : "SYSTEM";
      await pgQuery(
        `insert into "ScoringFeatureCatalog"
          (id, "tenantId", "targetModule", "fieldKey", label, source, "dataType", "coveragePercent", "nonNullCount", "distinctCount", "lastProfiledAt", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $11)
         on conflict ("tenantId", "targetModule", "fieldKey") do update
         set "coveragePercent" = excluded."coveragePercent",
             "nonNullCount" = excluded."nonNullCount",
             "distinctCount" = excluded."distinctCount",
             "lastProfiledAt" = excluded."lastProfiledAt",
             "updatedAt" = excluded."updatedAt"`,
        [
          randomUUID(),
          tenantId,
          module,
          key,
          key.replace(/^custom_/, "").replace(/_/g, " "),
          source,
          typeof sample === "number" ? "NUMBER" : typeof sample === "boolean" ? "BOOLEAN" : "TEXT",
          rows.length ? Math.round((values.length / rows.length) * 10000) / 100 : 0,
          values.length,
          new Set(values.map((value) => String(value))).size,
          now,
        ],
      );
    }
  }
  await syncSettingsFeatureCatalog(user);
  return listFeatureCatalogForTenant(user, null);
}

async function syncSettingsFeatureCatalog(user: TenantUser) {
  const tenantId = requireTenantId(user);
  const rows = await listFeatureCatalogForTenant(user, null);
  await pgQuery(
    `update "ScoringSettings"
     set "featureCatalog" = $1, "prohibitedFieldKeys" = $2, "updatedAt" = $3
     where "tenantId" = $4`,
    [
      jsonb({ fields: rows, derivedFeatures: [] }),
      rows.filter((row: any) => row.isProhibited).map((row: any) => row.fieldKey),
      new Date().toISOString(),
      tenantId,
    ],
  );
}

export async function listScoringModelVersionsForTenant(user: TenantUser, targetModule?: RecordType) {
  const tenantId = requireTenantId(user);
  const models = await pgQuery<any>(
    `select id, name, "targetModule", objective, status, "createdAt"
     from "ScoringModel"
     where "tenantId" = $1 ${targetModule ? `and "targetModule" = $2` : ""}
     order by "createdAt" desc`,
    targetModule ? [tenantId, targetModule] : [tenantId],
  );
  if (!models.length) return [];

  const modelIds = models.map((model) => model.id);
  const versions = await pgQuery<any>(
    `select id, "modelId", "versionNumber", algorithm, status, "featureConfig", metrics,
            "promotedBy", "promotedAt", "reviewedBy", "reviewedAt", "reviewNotes",
            "rollbackReason", "retiredBy", "retiredAt", "driftMetrics", "createdAt"
     from "ScoringModelVersion"
     where "tenantId" = $1 and "modelId" = any($2::text[])
     order by "versionNumber" desc`,
    [tenantId, modelIds],
  );

  const versionsByModel = new Map<string, any[]>();
  for (const version of versions) {
    // Calibration rates and fitted model weights are only needed internally for scoring -- don't
    // ship them to the client, just note whether this version has them.
    const { calibration, logisticModel, ...featureConfig } = (version.featureConfig ?? {}) as Record<string, unknown>;
    const list = versionsByModel.get(version.modelId) ?? [];
    list.push({ ...version, featureConfig, hasCalibration: !!calibration, hasLogisticModel: !!logisticModel });
    versionsByModel.set(version.modelId, list);
  }

  return models.map((model) => ({ ...model, versions: versionsByModel.get(model.id) ?? [] }));
}

export async function promoteScoringModelVersion(user: TenantUser, modelVersionId: string, options: { reviewNotes?: string | null; rollbackReason?: string | null } = {}) {
  const tenantId = requireTenantId(user);
  const version = await pgQueryOne<any>(
    `select id, "modelId", status from "ScoringModelVersion" where "tenantId" = $1 and id = $2 limit 1`,
    [tenantId, modelVersionId],
  );
  if (!version) throw new Error("SCORING_MODEL_VERSION_NOT_FOUND");
  const model = await pgQueryOne<any>(
    `select id, "targetModule" from "ScoringModel" where "tenantId" = $1 and id = $2 limit 1`,
    [tenantId, version.modelId],
  );
  if (!model) throw new Error("SCORING_MODEL_NOT_FOUND");

  const now = new Date().toISOString();

  // Retire whatever was previously promoted for this model (rollback works by promoting an older
  // version again, which naturally retires whatever had been active).
  await pgQuery(
    `update "ScoringModelVersion"
     set status = 'RETIRED', "retiredBy" = $1, "retiredAt" = $2
     where "tenantId" = $3 and "modelId" = $4 and status = 'PROMOTED' and id != $5`,
    [user.id, now, tenantId, version.modelId, modelVersionId],
  );
  await pgQuery(
    `update "ScoringModelVersion"
     set status = 'PROMOTED', "promotedBy" = $1, "promotedAt" = $2,
         "reviewedBy" = $1, "reviewedAt" = $2, "reviewNotes" = $3, "rollbackReason" = $4
     where "tenantId" = $5 and id = $6`,
    [user.id, now, options.reviewNotes ?? null, options.rollbackReason ?? null, tenantId, modelVersionId],
  );

  const settingsColumn = model.targetModule === "LEAD" ? "promotedLeadModelVersionId" : "promotedOpportunityModelVersionId";
  await pgQuery(
    `update "ScoringSettings" set "${settingsColumn}" = $1, "updatedAt" = $2 where "tenantId" = $3`,
    [modelVersionId, now, tenantId],
  );

  await createAuditLog(
    user,
    "PROMOTE",
    "SCORING_MODEL_VERSION",
    modelVersionId,
    { previousStatus: version.status },
    { status: "PROMOTED", targetModule: model.targetModule, reviewNotes: options.reviewNotes, rollbackReason: options.rollbackReason },
    null,
  ).catch(() => undefined);

  return { modelId: version.modelId, modelVersionId, targetModule: model.targetModule as RecordType };
}

export async function applyManualScoreOverride(user: TenantUser, input: {
  recordType: RecordType;
  recordId: string;
  scoreBand?: "HOT" | "WARM" | "COLD" | "RISK";
  conversionProbability?: number | null;
  winProbability?: number | null;
  stallRisk?: number | null;
  reason: string;
  expiresAt?: string | null;
}) {
  const tenantId = requireTenantId(user);
  const now = new Date().toISOString();
  const existing = await pgQueryOne<any>(
    `select id, "fitScore", "engagementScore", "conversionProbability", "winProbability", "stallRisk",
            "scoreBand", confidence, reasons, source
     from "RecordScore"
     where "tenantId" = $1 and "recordType" = $2 and "recordId" = $3
     limit 1`,
    [tenantId, input.recordType, input.recordId],
  );
  const primary = input.recordType === "OPPORTUNITY" ? input.winProbability : input.conversionProbability;
  const scoreBand = input.scoreBand ?? (Number(input.stallRisk ?? existing?.stallRisk ?? 0) >= 75 ? "RISK" : Number(primary ?? 0) >= 75 ? "HOT" : Number(primary ?? 0) >= 45 ? "WARM" : "COLD");
  const overrideId = randomUUID();
  await pgQuery(
    `insert into "ScoringManualOverride"
      (id, "tenantId", "recordType", "recordId", "scoreBand", "conversionProbability", "winProbability", "stallRisk",
       reason, "expiresAt", "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
    [
      overrideId,
      tenantId,
      input.recordType,
      input.recordId,
      scoreBand,
      input.recordType === "LEAD" ? clampScore(Number(input.conversionProbability ?? existing?.conversionProbability ?? 0)) : null,
      input.recordType === "OPPORTUNITY" ? clampScore(Number(input.winProbability ?? existing?.winProbability ?? 0)) : null,
      input.stallRisk == null ? existing?.stallRisk ?? null : clampScore(Number(input.stallRisk)),
      input.reason,
      input.expiresAt ?? null,
      user.id,
      now,
    ],
  );

  const nextPayload = {
    fitScore: existing?.fitScore ?? null,
    engagementScore: existing?.engagementScore ?? null,
    conversionProbability: input.recordType === "LEAD" ? clampScore(Number(input.conversionProbability ?? existing?.conversionProbability ?? 0)) : null,
    winProbability: input.recordType === "OPPORTUNITY" ? clampScore(Number(input.winProbability ?? existing?.winProbability ?? 0)) : null,
    stallRisk: input.stallRisk == null ? existing?.stallRisk ?? null : clampScore(Number(input.stallRisk)),
    scoreBand,
    confidence: 100,
    reasons: [{ type: "INFO", label: "Manual override", value: input.reason }],
    source: "MANUAL_OVERRIDE",
    overrideReason: input.reason,
    overrideUntil: input.expiresAt ?? null,
    overrideOwnerId: user.id,
    overriddenAt: now,
  };

  if (existing) {
    await pgQuery(
      `update "RecordScore"
       set "conversionProbability" = $1, "winProbability" = $2, "stallRisk" = $3, "scoreBand" = $4,
           confidence = 100, reasons = $5, source = 'MANUAL_OVERRIDE',
           "overrideReason" = $6, "overrideUntil" = $7, "overrideOwnerId" = $8, "overriddenAt" = $9,
           "calculatedAt" = $9, "updatedAt" = $9
       where "tenantId" = $10 and id = $11`,
      [
        nextPayload.conversionProbability,
        nextPayload.winProbability,
        nextPayload.stallRisk,
        nextPayload.scoreBand,
        jsonb(nextPayload.reasons),
        input.reason,
        input.expiresAt ?? null,
        user.id,
        now,
        tenantId,
        existing.id,
      ],
    );
  } else {
    await pgQuery(
      `insert into "RecordScore"
        (id, "tenantId", "recordType", "recordId", "conversionProbability", "winProbability", "stallRisk",
         "scoreBand", confidence, reasons, source, "overrideReason", "overrideUntil", "overrideOwnerId",
         "overriddenAt", "calculatedAt", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, 100, $9, 'MANUAL_OVERRIDE', $10, $11, $12, $13, $13, $13, $13)`,
      [
        randomUUID(),
        tenantId,
        input.recordType,
        input.recordId,
        nextPayload.conversionProbability,
        nextPayload.winProbability,
        nextPayload.stallRisk,
        nextPayload.scoreBand,
        jsonb(nextPayload.reasons),
        input.reason,
        input.expiresAt ?? null,
        user.id,
        now,
      ],
    );
  }

  const scoreRow = await pgQueryOne<any>(
    `select id from "RecordScore" where "tenantId" = $1 and "recordType" = $2 and "recordId" = $3 limit 1`,
    [tenantId, input.recordType, input.recordId],
  );
  await pgQuery(
    `insert into "RecordScoreHistory"
      (id, "tenantId", "recordScoreId", "recordType", "recordId", "previousScore", "nextScore", "changeReason", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, 'MANUAL_OVERRIDE', $8)`,
    [randomUUID(), tenantId, scoreRow?.id ?? null, input.recordType, input.recordId, existing ? jsonb(existing) : null, jsonb(nextPayload), now],
  );
  await createAuditLog(user, "OVERRIDE", "RECORD_SCORE", input.recordId, existing, nextPayload, null).catch(() => undefined);
  return nextPayload;
}

export async function clearManualScoreOverride(user: TenantUser, input: { recordType: RecordType; recordId: string; reason?: string }) {
  const tenantId = requireTenantId(user);
  const now = new Date().toISOString();
  await pgQuery(
    `update "ScoringManualOverride"
     set "clearedBy" = $1, "clearedAt" = $2, "clearReason" = $3, "updatedAt" = $2
     where "tenantId" = $4 and "recordType" = $5 and "recordId" = $6 and "clearedAt" is null`,
    [user.id, now, input.reason ?? "Cleared by admin", tenantId, input.recordType, input.recordId],
  );
  await pgQuery(
    `update "RecordScore"
     set source = 'PREDICTIVE_SCORING', "overrideReason" = null, "overrideUntil" = null,
         "overrideOwnerId" = null, "overriddenAt" = null, "updatedAt" = $1
     where "tenantId" = $2 and "recordType" = $3 and "recordId" = $4 and source = 'MANUAL_OVERRIDE'`,
    [now, tenantId, input.recordType, input.recordId],
  );
  await createAuditLog(user, "CLEAR_OVERRIDE", "RECORD_SCORE", input.recordId, null, input, null).catch(() => undefined);
  return { cleared: true };
}

function nextRetrainDate(cadence: ScoringSettings["retrainCadence"], from = new Date()) {
  if (cadence === "WEEKLY") return addDays(from, 7).toISOString();
  if (cadence === "MONTHLY") return addDays(from, 30).toISOString();
  return null;
}

export async function processDueScheduledScoringRetraining(limit = 10) {
  const due = await pgQuery<any>(
    `select id, "tenantId", "targetModules", "retrainCadence", "nextRetrainAt", "updatedBy"
     from "ScoringSettings"
     where "isEnabled" = true
       and "retrainCadence" != 'MANUAL'
       and ("nextRetrainAt" is null or "nextRetrainAt" <= current_timestamp)
       and ("retrainLockAt" is null or "retrainLockAt" < current_timestamp - interval '2 hours')
     order by "nextRetrainAt" asc nulls first
     limit $1`,
    [limit],
  );
  const results: Array<Record<string, unknown>> = [];
  for (const setting of due) {
    const lockOwner = randomUUID();
    const locked = await pgQueryOne<{ id: string }>(
      `update "ScoringSettings"
       set "retrainLockAt" = current_timestamp, "retrainLockOwner" = $1
       where id = $2 and ("retrainLockAt" is null or "retrainLockAt" < current_timestamp - interval '2 hours')
       returning id`,
      [lockOwner, setting.id],
    );
    if (!locked) continue;
    const user = { id: setting.updatedBy ?? "system", tenantId: setting.tenantId };
    try {
      const result = await recomputeSelfLearningScoresForTenant(user, {
        targetModules: Array.isArray(setting.targetModules) ? setting.targetModules : undefined,
        triggeredBy: "SCHEDULED",
      });
      await pgQuery(
        `update "ScoringSettings"
         set "nextRetrainAt" = $1, "retrainLockAt" = null, "retrainLockOwner" = null, "updatedAt" = current_timestamp
         where id = $2 and "retrainLockOwner" = $3`,
        [nextRetrainDate(setting.retrainCadence), setting.id, lockOwner],
      );
      results.push({ tenantId: setting.tenantId, status: "COMPLETED", ...result });
    } catch (error: any) {
      await pgQuery(
        `update "ScoringSettings"
         set "nextRetrainAt" = $1, "retrainLockAt" = null, "retrainLockOwner" = null, "updatedAt" = current_timestamp
         where id = $2 and "retrainLockOwner" = $3`,
        [addDays(new Date(), 1).toISOString(), setting.id, lockOwner],
      );
      results.push({ tenantId: setting.tenantId, status: "FAILED", error: error?.message ?? "Unknown error" });
    }
  }
  return { processed: results.length, results };
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
    `select id, ${nameExpression} as name, "order", "isWon", "isClosed"
     from "StageDefinition"
     where "tenantId" = $1
     limit 1000`,
    [tenantId],
  );
}

async function getModelVersionMetrics(tenantId: string, modelVersionId: string) {
  const row = await pgQueryOne<{ metrics: Record<string, unknown> }>(
    `select metrics from "ScoringModelVersion" where "tenantId" = $1 and id = $2 limit 1`,
    [tenantId, modelVersionId],
  );
  return row?.metrics ?? null;
}

export async function recomputeSelfLearningScoresForTenant(user: TenantUser, input: { targetModules?: RecordType[]; force?: boolean; triggeredBy?: "MANUAL" | "SCHEDULED" | "QUALITY_DRIFT" | "API" } = {}) {
  const tenantId = requireTenantId(user);
  const settings = await getScoringSettingsForTenant(user);
  const targetModules = (input.targetModules?.length ? input.targetModules : settings.targetModules).filter((module): module is RecordType => module === "LEAD" || module === "OPPORTUNITY");
  const controls = featureControls(settings);

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

  const opportunitiesByLeadId = groupByNullableId(opportunities, "leadId");
  const activitiesByLeadId = groupByNullableId(activities, "leadId");
  const tasksByLeadId = groupByNullableId(tasks, "leadId");
  const activitiesByOpportunityId = groupByNullableId(activities, "opportunityId");
  const tasksByOpportunityId = groupByNullableId(tasks, "opportunityId");
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const opportunityWon = (opportunity: any) => isWonStage(stageById.get(opportunity.stageId));

  const runs: Array<Record<string, unknown>> = [];
  let processed = 0;
  let skipped = 0;

  if (targetModules.includes("LEAD")) {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    await pgQuery(
      `insert into "ScoringTrainingRun" (id, "tenantId", "targetModule", status, "startedAt", "createdBy", "createdAt", "triggeredBy", "inputConfig")
       values ($1, $2, 'LEAD', 'RUNNING', $3, $4, $3, $5, $6)`,
      [runId, tenantId, startedAt, user.id, input.triggeredBy ?? "MANUAL", jsonb({ targetModules, force: input.force === true, controls })],
    );
    try {
      const { train, holdout } = splitTrainHoldout(leads, "id");
      const leadConverted = (lead: any) => (opportunitiesByLeadId.get(lead.id)?.length ?? 0) > 0;
      const convertedLeadCandidates = leads.filter(leadConverted);
      const similarConvertedLeadIdsFor = (lead: any) => convertedLeadCandidates
        .filter((candidate) => candidate.id !== lead.id)
        .filter((candidate) =>
          (candidate.source && candidate.source === lead.source)
          || (candidate.status && candidate.status === lead.status)
          || (candidate.ownerId && candidate.ownerId === lead.ownerId),
        )
        .slice(0, 3)
        .map((candidate) => candidate.id);
      const trainCalibration = calculateCalibration({ leads: train.length ? train : leads, opportunities, stages });

      const buildLeadFeatureRow = (lead: any) => buildLeadFeatureSnapshot({
        lead,
        opportunities: opportunitiesByLeadId.get(lead.id) ?? [],
        activities: activitiesByLeadId.get(lead.id) ?? [],
        tasks: tasksByLeadId.get(lead.id) ?? [],
      });

      const holdoutSamples = holdout.map((lead) => {
        const snapshot = buildLeadFeatureRow(lead);
        const score = leadScoreFromFeatures(snapshot, lead, trainCalibration, { ...settings, isEnabled: true });
        return { predicted: score.conversionProbability ?? 0, actual: leadConverted(lead) };
      });
      const heuristicHoldoutMetrics = binaryClassificationMetrics(holdoutSamples);

      // Also fit a real logistic regression on the same train split and evaluate it on the same
      // holdout, so retraining always keeps whichever algorithm is actually more accurate/precise --
      // never a fixed set of magic-number coefficients by default.
      const trainRows = train.map((lead) => leadNumericFeatures(buildLeadFeatureRow(lead).features, trainCalibration));
      const trainLabels = train.map((lead) => (leadConverted(lead) ? 1 : 0));
      const candidateLogisticModel = trainLogisticRegression(trainRows, trainLabels, LEAD_FEATURE_NAMES);
      let logisticHoldoutMetrics: ReturnType<typeof binaryClassificationMetrics> | null = null;
      if (candidateLogisticModel) {
        const logisticSamples = holdout.map((lead) => {
          const features = leadNumericFeatures(buildLeadFeatureRow(lead).features, trainCalibration);
          return { predicted: clampScore(predictLogisticRegression(candidateLogisticModel, features) * 100), actual: leadConverted(lead) };
        });
        logisticHoldoutMetrics = binaryClassificationMetrics(logisticSamples);
      }

      // Third candidate: the Python ml-service (gradient-boosted trees over the full data
      // audit, including text embeddings). Purely additive -- unreachable/not-running just
      // yields null and this candidate is skipped, same as "logistic regression returned null".
      const mlResult = await trainViaMlService({
        tenantId,
        targetModule: "LEAD",
        lookbackDays: settings.lookbackDays,
        minimumHistoricalRecords: settings.minimumHistoricalRecords,
        ...controls,
        previousMetrics: settings.promotedLeadModelVersionId
          ? await getModelVersionMetrics(tenantId, settings.promotedLeadModelVersionId)
          : null,
      });
      const mlHoldoutMetrics = mlResult?.trained ? mlResult.holdoutMetrics ?? null : null;

      // Brier score is a proper scoring rule (unlike raw accuracy) so it doesn't reward a model that
      // just always predicts the majority class under class imbalance -- lower is strictly better.
      const candidates: Array<{ name: string; brierScore: number | null | undefined }> = [
        { name: "PREDICTIVE_WEIGHTED_BUCKET_CALIBRATION", brierScore: heuristicHoldoutMetrics.brierScore },
        { name: "LOGISTIC_REGRESSION_V1", brierScore: candidateLogisticModel ? logisticHoldoutMetrics?.brierScore : undefined },
        { name: "GRADIENT_BOOSTED_TREES_V1", brierScore: mlHoldoutMetrics?.brierScore },
      ].filter((candidate) => candidate.brierScore != null);
      const winner = candidates.reduce((best, candidate) =>
        (candidate.brierScore! < best.brierScore! ? candidate : best), candidates[0] ?? { name: "PREDICTIVE_WEIGHTED_BUCKET_CALIBRATION", brierScore: null });
      const algorithm = winner.name;
      const selectedLogisticModel = algorithm === "LOGISTIC_REGRESSION_V1" ? candidateLogisticModel : null;
      const mlPredictionsByRecord = algorithm === "GRADIENT_BOOSTED_TREES_V1" && mlResult?.predictions
        ? new Map(mlResult.predictions.map((p) => [p.recordId, p.probability]))
        : null;

      const modelId = await getOrCreateScoringModel({ tenantId, targetModule: "LEAD", objective: settings.objective, createdBy: user.id });
      const { id: modelVersionId, versionNumber } = await createScoringModelVersion({
        tenantId,
        modelId,
        algorithm,
        featureConfig: {
          lookbackDays: settings.lookbackDays,
          minimumHistoricalRecords: settings.minimumHistoricalRecords,
          objective: settings.objective,
          calibration: serializeCalibration(trainCalibration),
          logisticModel: selectedLogisticModel,
          modelStorageKey: algorithm === "GRADIENT_BOOSTED_TREES_V1" ? mlResult?.modelStorageKey : null,
          featureNames: algorithm === "GRADIENT_BOOSTED_TREES_V1" ? mlResult?.featureNames : null,
          excludedFeatureKeys: controls.excludedFeatureKeys,
          prohibitedFeatureKeys: controls.prohibitedFeatureKeys,
        },
        metrics: {
          trainCount: train.length,
          holdoutCount: holdout.length,
          holdout: winner.brierScore != null
            ? (algorithm === "GRADIENT_BOOSTED_TREES_V1" ? mlHoldoutMetrics : algorithm === "LOGISTIC_REGRESSION_V1" ? logisticHoldoutMetrics : heuristicHoldoutMetrics)
            : heuristicHoldoutMetrics,
          advanced: algorithm === "GRADIENT_BOOSTED_TREES_V1" ? mlResult?.advancedMetrics ?? null : null,
          featureImportance: algorithm === "GRADIENT_BOOSTED_TREES_V1" ? mlResult?.featureImportance ?? [] : [],
          blockedFeatureColumns: algorithm === "GRADIENT_BOOSTED_TREES_V1" ? mlResult?.blockedFeatureColumns ?? [] : [],
          candidates: { heuristic: heuristicHoldoutMetrics, logisticRegression: logisticHoldoutMetrics, gradientBoostedTrees: mlHoldoutMetrics },
          selectedAlgorithm: algorithm,
          leadOverallConversionRate: trainCalibration.leadOverallConversionRate,
        },
      });

      // Live scores use whichever version is explicitly PROMOTED, if any -- so retraining doesn't
      // silently move live scores until an admin reviews and promotes the new candidate. Falls back
      // to this run's own fresh candidate (whichever algorithm just won above) when nothing has been
      // promoted yet, so first-time setup still works end to end with zero extra steps.
      const promoted = await loadPromotedScorer(tenantId, settings.promotedLeadModelVersionId, "LEAD", settings.lookbackDays);
      const scoringCalibration = promoted?.calibration ?? trainCalibration;
      const scoringLogisticModel = promoted ? promoted.logisticModel : selectedLogisticModel;
      const scoringMlPredictions = promoted ? promoted.mlPredictions : mlPredictionsByRecord;

      let leadProcessed = 0;
      for (const lead of leads) {
        const snapshot = buildLeadFeatureRow(lead);
        const mlPrediction = scoringMlPredictions?.get(lead.id) ?? null;
        const score = leadScoreFromFeatures(snapshot, lead, scoringCalibration, settings, scoringLogisticModel, mlPrediction);
        score.similarRecordIds = similarConvertedLeadIdsFor(lead);
        const persisted = await persistScore(user, snapshot, score, modelVersionId);
        if (persisted && (settings.isEnabled || input.force)) {
          await pgQuery('update "Lead" set score = $1, "updatedAt" = $2 where "tenantId" = $3 and id = $4', [
            score.conversionProbability ?? 0,
            new Date().toISOString(),
            tenantId,
            lead.id,
          ]);
        }
        leadProcessed += 1;
      }
      processed += leadProcessed;

      const completedAt = new Date().toISOString();
      const runMetrics = {
        trainCount: train.length,
        holdoutCount: holdout.length,
        holdout: algorithm === "GRADIENT_BOOSTED_TREES_V1" ? mlHoldoutMetrics : algorithm === "LOGISTIC_REGRESSION_V1" ? logisticHoldoutMetrics : heuristicHoldoutMetrics,
        selectedAlgorithm: algorithm,
        qualityStatus: scoreQualityStatus(
          { holdout: algorithm === "GRADIENT_BOOSTED_TREES_V1" ? mlHoldoutMetrics : algorithm === "LOGISTIC_REGRESSION_V1" ? logisticHoldoutMetrics : heuristicHoldoutMetrics },
          settings.qualityThresholds,
        ),
        versionNumber,
        modelVersionId,
      };
      await pgQuery(
        `update "ScoringTrainingRun"
         set status = 'COMPLETED', "completedAt" = $1, "recordsProcessed" = $2, "recordsSkipped" = 0,
             metrics = $3, "qualityStatus" = $4, "modelId" = $5, "modelVersionId" = $6
         where "tenantId" = $7 and id = $8`,
        [completedAt, leadProcessed, jsonb(runMetrics), runMetrics.qualityStatus, modelId, modelVersionId, tenantId, runId],
      );
      runs.push({ runId, targetModule: "LEAD", modelId, modelVersionId, versionNumber, metrics: runMetrics });
    } catch (error: any) {
      await pgQuery(
        `update "ScoringTrainingRun" set status = 'FAILED', "completedAt" = $1, error = $2 where "tenantId" = $3 and id = $4`,
        [new Date().toISOString(), error?.message ?? "Unknown scoring recompute error", tenantId, runId],
      );
      throw error;
    }
  } else {
    skipped += leads.length;
  }

  if (targetModules.includes("OPPORTUNITY")) {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    await pgQuery(
      `insert into "ScoringTrainingRun" (id, "tenantId", "targetModule", status, "startedAt", "createdBy", "createdAt", "triggeredBy", "inputConfig")
       values ($1, $2, 'OPPORTUNITY', 'RUNNING', $3, $4, $3, $5, $6)`,
      [runId, tenantId, startedAt, user.id, input.triggeredBy ?? "MANUAL", jsonb({ targetModules, force: input.force === true, controls })],
    );
    try {
      const { train, holdout } = splitTrainHoldout(opportunities, "id");
      const trainCalibration = calculateCalibration({ leads, opportunities: train.length ? train : opportunities, stages });
      const wonOpportunityCandidates = opportunities.filter(opportunityWon);
      const similarWonOpportunityIdsFor = (opportunity: any) => wonOpportunityCandidates
        .filter((candidate) => candidate.id !== opportunity.id)
        .filter((candidate) =>
          (candidate.stageId && candidate.stageId === opportunity.stageId)
          || (candidate.priority && candidate.priority === opportunity.priority)
          || (candidate.ownerId && candidate.ownerId === opportunity.ownerId),
        )
        .slice(0, 3)
        .map((candidate) => candidate.id);

      const buildOpportunityFeatureRow = (opportunity: any) => buildOpportunityFeatureSnapshot({
        opportunity,
        stage: stageById.get(opportunity.stageId),
        activities: activitiesByOpportunityId.get(opportunity.id) ?? [],
        tasks: tasksByOpportunityId.get(opportunity.id) ?? [],
      });

      const holdoutSamples = holdout.map((opportunity) => {
        const snapshot = buildOpportunityFeatureRow(opportunity);
        const score = opportunityScoreFromFeatures(snapshot, opportunity, trainCalibration, { ...settings, isEnabled: true });
        return { predicted: score.winProbability ?? 0, actual: opportunityWon(opportunity) };
      });
      const heuristicHoldoutMetrics = binaryClassificationMetrics(holdoutSamples);

      const trainRows = train.map((opportunity) => opportunityNumericFeatures(buildOpportunityFeatureRow(opportunity).features, trainCalibration));
      const trainLabels = train.map((opportunity) => (opportunityWon(opportunity) ? 1 : 0));
      const candidateLogisticModel = trainLogisticRegression(trainRows, trainLabels, OPPORTUNITY_FEATURE_NAMES);
      let logisticHoldoutMetrics: ReturnType<typeof binaryClassificationMetrics> | null = null;
      if (candidateLogisticModel) {
        const logisticSamples = holdout.map((opportunity) => {
          const features = opportunityNumericFeatures(buildOpportunityFeatureRow(opportunity).features, trainCalibration);
          return { predicted: clampScore(predictLogisticRegression(candidateLogisticModel, features) * 100), actual: opportunityWon(opportunity) };
        });
        logisticHoldoutMetrics = binaryClassificationMetrics(logisticSamples);
      }

      // Third candidate: the Python ml-service, same as the LEAD block above.
      const mlResult = await trainViaMlService({
        tenantId,
        targetModule: "OPPORTUNITY",
        lookbackDays: settings.lookbackDays,
        minimumHistoricalRecords: settings.minimumHistoricalRecords,
        ...controls,
        previousMetrics: settings.promotedOpportunityModelVersionId
          ? await getModelVersionMetrics(tenantId, settings.promotedOpportunityModelVersionId)
          : null,
      });
      const mlHoldoutMetrics = mlResult?.trained ? mlResult.holdoutMetrics ?? null : null;

      const candidates: Array<{ name: string; brierScore: number | null | undefined }> = [
        { name: "PREDICTIVE_WEIGHTED_BUCKET_CALIBRATION", brierScore: heuristicHoldoutMetrics.brierScore },
        { name: "LOGISTIC_REGRESSION_V1", brierScore: candidateLogisticModel ? logisticHoldoutMetrics?.brierScore : undefined },
        { name: "GRADIENT_BOOSTED_TREES_V1", brierScore: mlHoldoutMetrics?.brierScore },
      ].filter((candidate) => candidate.brierScore != null);
      const winner = candidates.reduce((best, candidate) =>
        (candidate.brierScore! < best.brierScore! ? candidate : best), candidates[0] ?? { name: "PREDICTIVE_WEIGHTED_BUCKET_CALIBRATION", brierScore: null });
      const algorithm = winner.name;
      const selectedLogisticModel = algorithm === "LOGISTIC_REGRESSION_V1" ? candidateLogisticModel : null;
      const mlPredictionsByRecord = algorithm === "GRADIENT_BOOSTED_TREES_V1" && mlResult?.predictions
        ? new Map(mlResult.predictions.map((p) => [p.recordId, p.probability]))
        : null;

      const modelId = await getOrCreateScoringModel({ tenantId, targetModule: "OPPORTUNITY", objective: settings.objective, createdBy: user.id });
      const { id: modelVersionId, versionNumber } = await createScoringModelVersion({
        tenantId,
        modelId,
        algorithm,
        featureConfig: {
          lookbackDays: settings.lookbackDays,
          minimumHistoricalRecords: settings.minimumHistoricalRecords,
          objective: settings.objective,
          calibration: serializeCalibration(trainCalibration),
          logisticModel: selectedLogisticModel,
          modelStorageKey: algorithm === "GRADIENT_BOOSTED_TREES_V1" ? mlResult?.modelStorageKey : null,
          featureNames: algorithm === "GRADIENT_BOOSTED_TREES_V1" ? mlResult?.featureNames : null,
          excludedFeatureKeys: controls.excludedFeatureKeys,
          prohibitedFeatureKeys: controls.prohibitedFeatureKeys,
        },
        metrics: {
          trainCount: train.length,
          holdoutCount: holdout.length,
          holdout: algorithm === "GRADIENT_BOOSTED_TREES_V1" ? mlHoldoutMetrics : algorithm === "LOGISTIC_REGRESSION_V1" ? logisticHoldoutMetrics : heuristicHoldoutMetrics,
          advanced: algorithm === "GRADIENT_BOOSTED_TREES_V1" ? mlResult?.advancedMetrics ?? null : null,
          featureImportance: algorithm === "GRADIENT_BOOSTED_TREES_V1" ? mlResult?.featureImportance ?? [] : [],
          blockedFeatureColumns: algorithm === "GRADIENT_BOOSTED_TREES_V1" ? mlResult?.blockedFeatureColumns ?? [] : [],
          candidates: { heuristic: heuristicHoldoutMetrics, logisticRegression: logisticHoldoutMetrics, gradientBoostedTrees: mlHoldoutMetrics },
          selectedAlgorithm: algorithm,
          opportunityOverallWinRate: trainCalibration.opportunityOverallWinRate,
        },
      });

      const promoted = await loadPromotedScorer(tenantId, settings.promotedOpportunityModelVersionId, "OPPORTUNITY", settings.lookbackDays);
      const scoringCalibration = promoted?.calibration ?? trainCalibration;
      const scoringLogisticModel = promoted ? promoted.logisticModel : selectedLogisticModel;
      const scoringMlPredictions = promoted ? promoted.mlPredictions : mlPredictionsByRecord;

      let oppProcessed = 0;
      for (const opportunity of opportunities) {
        const snapshot = buildOpportunityFeatureRow(opportunity);
        const mlPrediction = scoringMlPredictions?.get(opportunity.id) ?? null;
        const score = opportunityScoreFromFeatures(snapshot, opportunity, scoringCalibration, settings, scoringLogisticModel, mlPrediction);
        score.similarRecordIds = similarWonOpportunityIdsFor(opportunity);
        await persistScore(user, snapshot, score, modelVersionId);
        oppProcessed += 1;
      }
      processed += oppProcessed;

      const completedAt = new Date().toISOString();
      const runMetrics = {
        trainCount: train.length,
        holdoutCount: holdout.length,
        holdout: algorithm === "GRADIENT_BOOSTED_TREES_V1" ? mlHoldoutMetrics : algorithm === "LOGISTIC_REGRESSION_V1" ? logisticHoldoutMetrics : heuristicHoldoutMetrics,
        selectedAlgorithm: algorithm,
        qualityStatus: scoreQualityStatus(
          { holdout: algorithm === "GRADIENT_BOOSTED_TREES_V1" ? mlHoldoutMetrics : algorithm === "LOGISTIC_REGRESSION_V1" ? logisticHoldoutMetrics : heuristicHoldoutMetrics },
          settings.qualityThresholds,
        ),
        versionNumber,
        modelVersionId,
      };
      await pgQuery(
        `update "ScoringTrainingRun"
         set status = 'COMPLETED', "completedAt" = $1, "recordsProcessed" = $2, "recordsSkipped" = 0,
             metrics = $3, "qualityStatus" = $4, "modelId" = $5, "modelVersionId" = $6
         where "tenantId" = $7 and id = $8`,
        [completedAt, oppProcessed, jsonb(runMetrics), runMetrics.qualityStatus, modelId, modelVersionId, tenantId, runId],
      );
      runs.push({ runId, targetModule: "OPPORTUNITY", modelId, modelVersionId, versionNumber, metrics: runMetrics });
    } catch (error: any) {
      await pgQuery(
        `update "ScoringTrainingRun" set status = 'FAILED', "completedAt" = $1, error = $2 where "tenantId" = $3 and id = $4`,
        [new Date().toISOString(), error?.message ?? "Unknown scoring recompute error", tenantId, runId],
      );
      throw error;
    }
  } else {
    skipped += opportunities.length;
  }

  const completedAt = new Date().toISOString();
  await pgQuery('update "ScoringSettings" set "lastRecomputedAt" = $1, "updatedAt" = $1 where "tenantId" = $2', [
    completedAt,
    tenantId,
  ]);
  await cleanupOldFeatureSnapshots(tenantId, settings.featureRetentionDays);
  await createAuditLog(user, "RECOMPUTE", "SCORING", tenantId, null, { processed, skipped, runs }, null).catch(() => undefined);
  return { runs, processed, skipped };
}

async function cleanupOldFeatureSnapshots(tenantId: string, retentionDays: number) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.max(30, retentionDays));
  await pgQuery(
    `delete from "ScoringFeatureSnapshot"
     where "tenantId" = $1 and "createdAt" < $2
       and id not in (
         select "featureSnapshotId" from "RecordScore"
         where "tenantId" = $1 and "featureSnapshotId" is not null
       )`,
    [tenantId, cutoff.toISOString()],
  ).catch(() => undefined);
}

async function persistScore(user: TenantUser, snapshot: FeatureSnapshot, score: ScoreResult, modelVersionId: string | null = null) {
  const tenantId = requireTenantId(user);
  const now = new Date().toISOString();
  const featureSnapshot = await pgQueryOne<any>(
    `insert into "ScoringFeatureSnapshot"
      (id, "tenantId", "modelVersionId", "recordType", "recordId", features, "sourceDataUpdatedAt", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id`,
    [randomUUID(), tenantId, modelVersionId, snapshot.recordType, snapshot.recordId, jsonb(snapshot.features), snapshot.sourceDataUpdatedAt, now],
  );
  if (!featureSnapshot) throw new Error("SCORING_FEATURE_SNAPSHOT_INSERT_FAILED");

  const existing = await pgQueryOne<any>(
    `select id, "fitScore", "engagementScore", "conversionProbability", "winProbability", "stallRisk",
            "scoreBand", confidence, reasons, source, "overrideReason", "overrideUntil", "overrideOwnerId", "overriddenAt",
            "calculatedAt"
     from "RecordScore"
     where "tenantId" = $1 and "recordType" = $2 and "recordId" = $3
     limit 1`,
    [tenantId, score.recordType, score.recordId],
  );

  if (existing?.source === "MANUAL_OVERRIDE") {
    const overrideUntil = existing.overrideUntil ? new Date(existing.overrideUntil) : null;
    if (!overrideUntil || overrideUntil.getTime() > Date.now()) {
      await pgQuery(
        `insert into "RecordScoreHistory"
          (id, "tenantId", "recordScoreId", "recordType", "recordId", "previousScore", "nextScore",
           "changeReason", "createdAt")
         values ($1, $2, $3, $4, $5, $6, $7, 'RECOMPUTE_SKIPPED_ACTIVE_OVERRIDE', $8)`,
        [randomUUID(), tenantId, existing.id, score.recordType, score.recordId, jsonb(existing), jsonb(score), now],
      );
      return false;
    }
  }

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
    expectedResponseLikelihood: score.expectedResponseLikelihood ?? null,
    duplicateRisk: score.duplicateRisk ?? null,
    staleRisk: score.staleRisk ?? null,
    expectedCloseRisk: score.expectedCloseRisk ?? null,
    suggestedCloseDate: score.suggestedCloseDate ?? null,
    suggestedCloseDateDeltaDays: score.suggestedCloseDateDeltaDays ?? null,
    nextBestAction: score.nextBestAction ?? null,
    nextBestActivityType: score.nextBestActivityType ?? null,
    topDrivers: score.topDrivers ?? score.reasons,
    missingDataWarnings: score.missingDataWarnings ?? [],
    similarRecordIds: score.similarRecordIds ?? [],
    suggestedDataImprovements: score.suggestedDataImprovements ?? [],
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
           "expectedResponseLikelihood" = $10, "duplicateRisk" = $11, "staleRisk" = $12, "expectedCloseRisk" = $13,
           "suggestedCloseDate" = $14, "suggestedCloseDateDeltaDays" = $15, "nextBestAction" = $16,
           "nextBestActivityType" = $17, "topDrivers" = $18, "missingDataWarnings" = $19,
           "similarRecordIds" = $20, "suggestedDataImprovements" = $21,
           "overrideReason" = null, "overrideUntil" = null, "overrideOwnerId" = null, "overriddenAt" = null,
           "featureSnapshotId" = $22, "modelVersionId" = $23, "calculatedAt" = $24, "updatedAt" = $25
       where "tenantId" = $26 and id = $27`,
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
        payload.expectedResponseLikelihood,
        payload.duplicateRisk,
        payload.staleRisk,
        payload.expectedCloseRisk,
        payload.suggestedCloseDate,
        payload.suggestedCloseDateDeltaDays,
        payload.nextBestAction,
        payload.nextBestActivityType,
        jsonb(payload.topDrivers),
        jsonb(payload.missingDataWarnings),
        jsonb(payload.similarRecordIds),
        jsonb(payload.suggestedDataImprovements),
        payload.featureSnapshotId,
        modelVersionId,
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
        (id, "tenantId", "modelVersionId", "recordType", "recordId", "fitScore", "engagementScore", "conversionProbability",
         "winProbability", "stallRisk", "scoreBand", confidence, reasons, source, "expectedResponseLikelihood",
         "duplicateRisk", "staleRisk", "expectedCloseRisk", "suggestedCloseDate", "suggestedCloseDateDeltaDays",
         "nextBestAction", "nextBestActivityType", "topDrivers", "missingDataWarnings", "similarRecordIds",
         "suggestedDataImprovements", "featureSnapshotId",
         "calculatedAt", "updatedAt", "createdAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
               $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $28, $28)`,
      [
        scoreId,
        tenantId,
        modelVersionId,
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
        payload.expectedResponseLikelihood,
        payload.duplicateRisk,
        payload.staleRisk,
        payload.expectedCloseRisk,
        payload.suggestedCloseDate,
        payload.suggestedCloseDateDeltaDays,
        payload.nextBestAction,
        payload.nextBestActivityType,
        jsonb(payload.topDrivers),
        jsonb(payload.missingDataWarnings),
        jsonb(payload.similarRecordIds),
        jsonb(payload.suggestedDataImprovements),
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
  return true;
}
