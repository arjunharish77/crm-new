// Thin client for the internal Python ml-service (see ml-service/README.md). Purely
// additive: every call is wrapped so a network error, timeout, or unreachable service
// (e.g. not running in local dev, per ML_SERVICE_URL being unset) just returns null and
// recompute proceeds with the existing JS heuristic/logistic-regression candidates.

const REQUEST_TIMEOUT_MS = 120_000;

export type MlHoldoutMetrics = {
  sampleSize: number;
  brierScore: number | null;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  hotBandActualRate: number | null;
  coldBandActualRate: number | null;
  lift: number | null;
  confusionMatrix?: {
    truePositive: number;
    falsePositive: number;
    trueNegative: number;
    falseNegative: number;
  };
};

export type MlTrainResult = {
  trained: boolean;
  reason?: string;
  trainCount?: number;
  holdoutCount?: number;
  holdoutMetrics?: MlHoldoutMetrics;
  advancedMetrics?: Record<string, unknown>;
  featureImportance?: Array<{ feature: string; importance: number }>;
  blockedFeatureColumns?: string[];
  modelStorageKey?: string;
  featureNames?: string[];
  predictions?: Array<{ recordId: string; probability: number }>;
};

export type MlScoreResult = {
  predictions: Array<{ recordId: string; probability: number }>;
};

function mlServiceConfig() {
  const url = process.env.ML_SERVICE_URL;
  if (!url) return null;
  return { url: url.replace(/\/$/, ""), secret: process.env.ML_SERVICE_SECRET || null };
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  const config = mlServiceConfig();
  if (!config) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.url}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.secret ? { "X-Internal-Auth": config.secret } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function trainViaMlService(input: {
  tenantId: string;
  targetModule: "LEAD" | "OPPORTUNITY";
  lookbackDays: number;
  minimumHistoricalRecords: number;
  excludedFeatureKeys?: string[];
  prohibitedFeatureKeys?: string[];
  previousMetrics?: Record<string, unknown> | null;
}): Promise<MlTrainResult | null> {
  return postJson<MlTrainResult>("/train", input);
}

export async function scoreViaMlService(input: {
  tenantId: string;
  targetModule: "LEAD" | "OPPORTUNITY";
  modelStorageKey: string;
  lookbackDays: number;
}): Promise<MlScoreResult | null> {
  return postJson<MlScoreResult>("/score", input);
}

export type MlNbaScoreResult = {
  available: boolean;
  reason?: string;
  mlScore?: number;
  sampleSize?: number;
};

// NBA candidate scoring (gap checklist: "Add NBA scoring in ml-service") -- trains a small
// LogisticRegression on the fly from this tenant's own recommendation history per actionType
// (see ml-service/app/nba.py), scored against the exact same feature breakdown
// next-best-action.ts's computeCandidateScore already computes. `available: false` (below the
// minimum sample size, or single-class history) is handled the same as a null response --
// callers just skip that candidate's signal, same fail-open contract as
// trainViaMlService/scoreViaMlService.
//
// Batched, not one call per candidate: generateRecommendationsForRecord evaluates every active
// rule for one record in a single pass, and multiple rules commonly share an actionType --
// scoring them one at a time would mean ml-service re-training an identical model from scratch
// per rule. This sends every eligible candidate for one generation pass in a single request;
// ml-service groups them by actionType and trains each unique one exactly once.
export async function scoreNbaCandidatesBatchViaMlService(input: {
  tenantId: string;
  candidates: Array<{ key: string; actionType: string; features: Record<string, number> }>;
}): Promise<Record<string, MlNbaScoreResult> | null> {
  if (!input.candidates.length) return {};
  const result = await postJson<{ results: Record<string, MlNbaScoreResult> }>("/nba-score-batch", input);
  return result?.results ?? null;
}
