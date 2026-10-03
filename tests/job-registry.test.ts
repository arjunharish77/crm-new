import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  JOB_REGISTRY,
  jobNamesForClass,
  recurringJobNamesForClass,
  queueNameForJob,
  resolveConcurrency,
  QUEUE_NAME_BY_CLASS,
  DEFAULT_CONCURRENCY_BY_CLASS,
} from "@/lib/server/job-registry";

// WP10 follow-up (F18 item 4/6): the registry is now the single source of truth for job
// classification -- these tests pin down the exact four-class split the audit remediation plan
// calls for, so a future edit that accidentally reclassifies (or drops) a job name is caught here
// rather than silently drifting from scripts/worker.ts's own recurring-job arrays (which
// assertRegistryConsistency() cross-checks against this registry at worker startup).
describe("JOB_REGISTRY", () => {
  it("classifies the six realtime jobs unchanged from the original WP10 split", () => {
    expect(jobNamesForClass("realtime").sort()).toEqual(
      [
        "communications.processDue",
        "webhooks.processOutbox",
        "tasks.processReminders",
        "tasks.processReminderEscalations",
        "tasks.processSlaBreaches",
        "nba.processScheduledRefresh",
      ].sort(),
    );
  });

  it("classifies the twenty operational-automation jobs", () => {
    expect(jobNamesForClass("operational").sort()).toEqual(
      [
        "applications.documentReminders",
        "automation.processDue",
        "tasks.processOverdue",
        "journeys.processEnrollmentRefresh",
        "marketing.continueCampaignLaunches",
        "journeys.alertDegraded",
        "dataQuality.processScheduledScan",
        "marketplace.processAppDeliveries",
        "marketplace.processAppSyncs",
        "telephony.expireRecordings",
        "retention.enforce",
        "archive.purge",
        "communications.processSuppressionExpiry",
        "cases.processSlaEscalations",
        "modules.processTrials",
        "modules.processHealth",
        "cases.dispatchSurveys",
        "cases.refreshAnalyticsSnapshots",
        "cases.alertStaleUnassigned",
        "metrics.computeGrainSnapshots",
      ].sort(),
    );
  });

  it("classifies the seven heavy (export/import/report) jobs", () => {
    expect(jobNamesForClass("heavy").sort()).toEqual(
      [
        "reports.processRollups",
        "reports.processRollupSchedule",
        "reports.processSchedules",
        "reports.retryFailedSchedules",
        "exports.processExpiry",
        "exports.process",
        "imports.process",
      ].sort(),
    );
  });

  it("classifies the three ML jobs", () => {
    expect(jobNamesForClass("ml").sort()).toEqual(["scoring.processScheduledRetraining", "scoring.recomputeRules", "scoring.recomputeSelfLearning"].sort());
  });

  it("marks only the genuinely single-tenant-per-invocation dynamic jobs as tenant-scoped", () => {
    const tenantScoped = Object.values(JOB_REGISTRY)
      .filter((entry) => entry.isTenantScoped)
      .map((entry) => entry.name)
      .sort();
    expect(tenantScoped).toEqual(["exports.process", "imports.process", "scoring.recomputeRules", "scoring.recomputeSelfLearning"].sort());
  });

  it("marks every recurring cross-tenant scan tick as NOT tenant-scoped, including the heavy-class report jobs", () => {
    for (const name of recurringJobNamesForClass("heavy")) {
      expect(JOB_REGISTRY[name].isTenantScoped).toBe(false);
    }
  });

  it("routes every job to its class's queue name with no overlap between classes", () => {
    for (const name of Object.keys(JOB_REGISTRY) as (keyof typeof JOB_REGISTRY)[]) {
      expect(queueNameForJob(name)).toBe(QUEUE_NAME_BY_CLASS[JOB_REGISTRY[name].queueClass]);
    }
    const queueNames = new Set(Object.values(QUEUE_NAME_BY_CLASS));
    expect(queueNames.size).toBe(4);
  });

  it("totals 36 distinct job names across all four classes (32 recurring + 4 dynamic)", () => {
    expect(Object.keys(JOB_REGISTRY)).toHaveLength(36);
    const recurringCount = Object.values(JOB_REGISTRY).filter((entry) => entry.isRecurring).length;
    expect(recurringCount).toBe(32);
  });
});

describe("resolveConcurrency", () => {
  const envKeys = [
    "WORKER_CONCURRENCY",
    "WORKER_CONCURRENCY_BACKGROUND",
    "WORKER_CONCURRENCY_REALTIME",
    "WORKER_CONCURRENCY_OPERATIONAL",
    "WORKER_CONCURRENCY_HEAVY",
    "WORKER_CONCURRENCY_ML",
  ];
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it("defaults ML concurrency LOW (2) with no env vars set", () => {
    expect(resolveConcurrency("ml")).toBe(DEFAULT_CONCURRENCY_BY_CLASS.ml);
    expect(resolveConcurrency("ml")).toBe(2);
  });

  it("honors WORKER_CONCURRENCY_HEAVY when set, independent of the legacy background var", () => {
    process.env.WORKER_CONCURRENCY_BACKGROUND = "40";
    process.env.WORKER_CONCURRENCY_HEAVY = "7";
    expect(resolveConcurrency("heavy")).toBe(7);
  });

  it("operational falls back to the legacy WORKER_CONCURRENCY_BACKGROUND env var when its own is unset", () => {
    process.env.WORKER_CONCURRENCY_BACKGROUND = "12";
    expect(resolveConcurrency("operational")).toBe(12);
  });

  it("heavy/ml do NOT inherit the legacy WORKER_CONCURRENCY_BACKGROUND value (would silently triple total concurrency)", () => {
    process.env.WORKER_CONCURRENCY_BACKGROUND = "40";
    expect(resolveConcurrency("heavy")).toBe(DEFAULT_CONCURRENCY_BY_CLASS.heavy);
    expect(resolveConcurrency("ml")).toBe(DEFAULT_CONCURRENCY_BY_CLASS.ml);
  });
});
