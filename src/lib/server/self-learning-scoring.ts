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
  let weights = new Array(columnCount).fill(0);
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
): Promise<{ calibration: Calibration; logisticModel: LogisticModel | null } | null> {
  if (!promotedVersionId) return null;
  const version = await pgQueryOne<any>(
    `select "featureConfig" from "ScoringModelVersion" where "tenantId" = $1 and id = $2 and status = 'PROMOTED' limit 1`,
    [tenantId, promotedVersionId],
  );
  if (!version?.featureConfig?.calibration) return null;
  return {
    calibration: deserializeCalibration(version.featureConfig.calibration),
    logisticModel: version.featureConfig.logisticModel ?? null,
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

function leadScoreFromFeatures(snapshot: FeatureSnapshot, lead: any, calibration: Calibration, settings: ScoringSettings, logisticModel?: LogisticModel | null): ScoreResult {
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
  const conversionProbability = logisticModel
    ? clampScore(predictLogisticRegression(logisticModel, leadNumericFeatures(features, calibration)) * 100)
    : heuristicProbability;
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

function opportunityScoreFromFeatures(snapshot: FeatureSnapshot, opportunity: any, calibration: Calibration, settings: ScoringSettings, logisticModel?: LogisticModel | null): ScoreResult {
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
  const winProbability = logisticModel
    ? clampScore(predictLogisticRegression(logisticModel, opportunityNumericFeatures(features, calibration)) * 100)
    : heuristicProbability;
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
    `select id, "modelId", "versionNumber", algorithm, status, "featureConfig", metrics, "promotedBy", "promotedAt", "createdAt"
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

export async function promoteScoringModelVersion(user: TenantUser, modelVersionId: string) {
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
    `update "ScoringModelVersion" set status = 'RETIRED' where "tenantId" = $1 and "modelId" = $2 and status = 'PROMOTED' and id != $3`,
    [tenantId, version.modelId, modelVersionId],
  );
  await pgQuery(
    `update "ScoringModelVersion" set status = 'PROMOTED', "promotedBy" = $1, "promotedAt" = $2 where "tenantId" = $3 and id = $4`,
    [user.id, now, tenantId, modelVersionId],
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
    { status: "PROMOTED", targetModule: model.targetModule },
    null,
  ).catch(() => undefined);

  return { modelId: version.modelId, modelVersionId, targetModule: model.targetModule as RecordType };
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

export async function recomputeSelfLearningScoresForTenant(user: TenantUser, input: { targetModules?: RecordType[]; force?: boolean } = {}) {
  const tenantId = requireTenantId(user);
  const settings = await getScoringSettingsForTenant(user);
  const targetModules = (input.targetModules?.length ? input.targetModules : settings.targetModules).filter((module): module is RecordType => module === "LEAD" || module === "OPPORTUNITY");

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
      `insert into "ScoringTrainingRun" (id, "tenantId", "targetModule", status, "startedAt", "createdBy", "createdAt")
       values ($1, $2, 'LEAD', 'RUNNING', $3, $4, $3)`,
      [runId, tenantId, startedAt, user.id],
    );
    try {
      const { train, holdout } = splitTrainHoldout(leads, "id");
      const leadConverted = (lead: any) => (opportunitiesByLeadId.get(lead.id)?.length ?? 0) > 0;
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

      // Brier score is a proper scoring rule (unlike raw accuracy) so it doesn't reward a model that
      // just always predicts the majority class under class imbalance -- lower is strictly better.
      const logisticIsBetter = !!candidateLogisticModel && logisticHoldoutMetrics?.brierScore != null
        && (heuristicHoldoutMetrics.brierScore == null || logisticHoldoutMetrics.brierScore <= heuristicHoldoutMetrics.brierScore);
      const algorithm = logisticIsBetter ? "LOGISTIC_REGRESSION_V1" : "MVP_WEIGHTED_BUCKET_CALIBRATION";
      const selectedLogisticModel = logisticIsBetter ? candidateLogisticModel : null;

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
        },
        metrics: {
          trainCount: train.length,
          holdoutCount: holdout.length,
          holdout: logisticIsBetter ? logisticHoldoutMetrics : heuristicHoldoutMetrics,
          candidates: { heuristic: heuristicHoldoutMetrics, logisticRegression: logisticHoldoutMetrics },
          selectedAlgorithm: algorithm,
          leadOverallConversionRate: trainCalibration.leadOverallConversionRate,
        },
      });

      // Live scores use whichever version is explicitly PROMOTED, if any -- so retraining doesn't
      // silently move live scores until an admin reviews and promotes the new candidate. Falls back
      // to this run's own fresh candidate (whichever algorithm just won above) when nothing has been
      // promoted yet, so first-time setup still works end to end with zero extra steps.
      const promoted = await loadPromotedScorer(tenantId, settings.promotedLeadModelVersionId);
      const scoringCalibration = promoted?.calibration ?? trainCalibration;
      const scoringLogisticModel = promoted ? promoted.logisticModel : selectedLogisticModel;

      let leadProcessed = 0;
      for (const lead of leads) {
        const snapshot = buildLeadFeatureRow(lead);
        const score = leadScoreFromFeatures(snapshot, lead, scoringCalibration, settings, scoringLogisticModel);
        await persistScore(user, snapshot, score, modelVersionId);
        if (settings.isEnabled || input.force) {
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
        holdout: logisticIsBetter ? logisticHoldoutMetrics : heuristicHoldoutMetrics,
        selectedAlgorithm: algorithm,
        versionNumber,
        modelVersionId,
      };
      await pgQuery(
        `update "ScoringTrainingRun"
         set status = 'COMPLETED', "completedAt" = $1, "recordsProcessed" = $2, "recordsSkipped" = 0,
             metrics = $3, "modelId" = $4, "modelVersionId" = $5
         where "tenantId" = $6 and id = $7`,
        [completedAt, leadProcessed, jsonb(runMetrics), modelId, modelVersionId, tenantId, runId],
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
      `insert into "ScoringTrainingRun" (id, "tenantId", "targetModule", status, "startedAt", "createdBy", "createdAt")
       values ($1, $2, 'OPPORTUNITY', 'RUNNING', $3, $4, $3)`,
      [runId, tenantId, startedAt, user.id],
    );
    try {
      const { train, holdout } = splitTrainHoldout(opportunities, "id");
      const trainCalibration = calculateCalibration({ leads, opportunities: train.length ? train : opportunities, stages });

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

      const logisticIsBetter = !!candidateLogisticModel && logisticHoldoutMetrics?.brierScore != null
        && (heuristicHoldoutMetrics.brierScore == null || logisticHoldoutMetrics.brierScore <= heuristicHoldoutMetrics.brierScore);
      const algorithm = logisticIsBetter ? "LOGISTIC_REGRESSION_V1" : "MVP_WEIGHTED_BUCKET_CALIBRATION";
      const selectedLogisticModel = logisticIsBetter ? candidateLogisticModel : null;

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
        },
        metrics: {
          trainCount: train.length,
          holdoutCount: holdout.length,
          holdout: logisticIsBetter ? logisticHoldoutMetrics : heuristicHoldoutMetrics,
          candidates: { heuristic: heuristicHoldoutMetrics, logisticRegression: logisticHoldoutMetrics },
          selectedAlgorithm: algorithm,
          opportunityOverallWinRate: trainCalibration.opportunityOverallWinRate,
        },
      });

      const promoted = await loadPromotedScorer(tenantId, settings.promotedOpportunityModelVersionId);
      const scoringCalibration = promoted?.calibration ?? trainCalibration;
      const scoringLogisticModel = promoted ? promoted.logisticModel : selectedLogisticModel;

      let oppProcessed = 0;
      for (const opportunity of opportunities) {
        const snapshot = buildOpportunityFeatureRow(opportunity);
        const score = opportunityScoreFromFeatures(snapshot, opportunity, scoringCalibration, settings, scoringLogisticModel);
        await persistScore(user, snapshot, score, modelVersionId);
        oppProcessed += 1;
      }
      processed += oppProcessed;

      const completedAt = new Date().toISOString();
      const runMetrics = {
        trainCount: train.length,
        holdoutCount: holdout.length,
        holdout: logisticIsBetter ? logisticHoldoutMetrics : heuristicHoldoutMetrics,
        selectedAlgorithm: algorithm,
        versionNumber,
        modelVersionId,
      };
      await pgQuery(
        `update "ScoringTrainingRun"
         set status = 'COMPLETED', "completedAt" = $1, "recordsProcessed" = $2, "recordsSkipped" = 0,
             metrics = $3, "modelId" = $4, "modelVersionId" = $5
         where "tenantId" = $6 and id = $7`,
        [completedAt, oppProcessed, jsonb(runMetrics), modelId, modelVersionId, tenantId, runId],
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
  await createAuditLog(user, "RECOMPUTE", "SCORING", tenantId, null, { processed, skipped, runs }, null).catch(() => undefined);
  return { runs, processed, skipped };
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
           "featureSnapshotId" = $10, "modelVersionId" = $11, "calculatedAt" = $12, "updatedAt" = $13
       where "tenantId" = $14 and id = $15`,
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
         "winProbability", "stallRisk", "scoreBand", confidence, reasons, source, "featureSnapshotId",
         "calculatedAt", "updatedAt", "createdAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16, $16)`,
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
