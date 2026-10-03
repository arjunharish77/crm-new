#!/usr/bin/env tsx

import { Queue, Worker, type Job } from "bullmq";
import dotenv from "dotenv";
import { processDueAutomationJobs, processImportJob } from "@/lib/server/crm";
import { processDueTaskReminders, processOverdueTaskAutomations, processTaskReminderEscalations, processTaskSlaBreaches } from "@/lib/server/tasks";
import { processDueReportRollupRefreshes, processPendingReportRefreshJobs } from "@/lib/server/report-rollups";
import { processDueReportSchedules, retryFailedReportSchedules } from "@/lib/server/report-schedules";
import { processCommunicationOutbox } from "@/lib/server/communications";
import { processExportRequest, processExpiredExportFiles } from "@/lib/server/exports";
import { recomputeLeadScoresForTenant } from "@/lib/server/admin-modules";
import { processDueScheduledScoringRetraining, recomputeSelfLearningScoresForTenant } from "@/lib/server/self-learning-scoring";
import { createUserNotification } from "@/lib/server/notifications";
import { processDueNextBestActionRefresh } from "@/lib/server/next-best-action";
import { processDueJourneyEnrollmentRefresh, alertDegradedJourneys } from "@/lib/server/marketing-journeys";
import { processDueCampaignLaunches } from "@/lib/server/marketing-communications";
import { runScheduledDataQualityScan } from "@/lib/server/inbuilt-reports";
import { processWebhookOutbox } from "@/lib/server/webhook-outbox";
import { processAppEventDeliveries } from "@/lib/server/marketplace-events";
import { processDueAppSyncs } from "@/lib/server/marketplace-sync";
import { expireCallRecordings } from "@/lib/server/call-recordings";
import { processDueDataRetentionEnforcement } from "@/lib/server/retention";
import { processDueSuppressionExpiry } from "@/lib/server/communications";
import { processApplicationDocumentReminders } from "@/lib/repositories/applications-postgres";
import { purgeArchivedAutomations } from "@/lib/repositories/automations-postgres";
import { purgeArchivedForms } from "@/lib/repositories/forms-postgres";
import { purgeArchivedItems } from "@/lib/server/archive-items";
import { processCaseSlaEscalations, alertStaleUnassignedCases } from "@/lib/repositories/cases-postgres";
import { processModuleTrials } from "@/lib/server/module-entitlements";
import { processModuleHealth } from "@/lib/server/module-health";
import { computeDueMetricGrainSnapshots } from "@/lib/server/metrics";
import { dispatchCaseSurveys } from "@/lib/repositories/case-survey-postgres";
import { refreshCaseAnalyticsSnapshots } from "@/lib/server/inbuilt-reports";
import {
  QUEUE_NAME_BY_CLASS,
  resolveConcurrency,
  recurringJobNamesForClass,
  DEFAULT_TENANT_FAIRNESS_MAX_CONCURRENT,
  type JobQueueClass,
} from "@/lib/server/job-registry";
import { withTenantFairness } from "@/lib/server/job-fairness";
import { recordJobDeadLetter } from "@/lib/server/job-dead-letter";

const DEFAULT_REPEAT_MS = 60_000;

dotenv.config({ path: ".env.local", override: false });
dotenv.config({ path: ".env", override: false });
dotenv.config({ path: "../.env", override: false });

// WP10 follow-up (F18 item 4/6): FOUR workload classes instead of the first WP10 pass's two
// (realtime/background) -- "realtime" is unchanged; the old single "background" class (everything
// else) is now split three ways: "operational" (recurring automation/journeys/data-quality/
// marketplace-sync/telephony/retention/case/metrics housekeeping -- none of it heavy, none of it
// on the realtime dispatch path), "heavy" (export/import/report generation -- the audit's own
// named example workload for tenant-fairness scheduling), and "ml" (scoring model
// training/inference, which is CPU/memory-heavy per job and so gets its own, deliberately LOW,
// concurrency budget regardless of queue depth). job-registry.ts (src/lib/server/job-registry.ts)
// is the single source of truth for this classification -- see its module comment for the full
// per-job reasoning, and 25_AUDIT_REMEDIATION_PLAN.md's WP10 tracking record for why the first
// pass only shipped two classes.
const realtimeJobs = [
  { name: "communications.processDue", processor: () => processCommunicationOutbox(50) },
  { name: "webhooks.processOutbox", processor: () => processWebhookOutbox(25) },
  { name: "tasks.processReminders", processor: () => processDueTaskReminders() },
  { name: "tasks.processReminderEscalations", processor: () => processTaskReminderEscalations() },
  { name: "tasks.processSlaBreaches", processor: () => processTaskSlaBreaches() },
  { name: "nba.processScheduledRefresh", processor: () => processDueNextBestActionRefresh(50) },
] as const;

const operationalJobs = [
  { name: "applications.documentReminders", processor: () => processApplicationDocumentReminders(100) },
  { name: "automation.processDue", processor: () => processDueAutomationJobs(50) },
  { name: "tasks.processOverdue", processor: () => processOverdueTaskAutomations() },
  { name: "journeys.processEnrollmentRefresh", processor: () => processDueJourneyEnrollmentRefresh() },
  { name: "marketing.continueCampaignLaunches", processor: () => processDueCampaignLaunches() },
  { name: "journeys.alertDegraded", processor: () => alertDegradedJourneys(100) },
  { name: "dataQuality.processScheduledScan", processor: () => runScheduledDataQualityScan(25) },
  { name: "marketplace.processAppDeliveries", processor: () => processAppEventDeliveries(25) },
  { name: "marketplace.processAppSyncs", processor: () => processDueAppSyncs(25) },
  { name: "telephony.expireRecordings", processor: () => expireCallRecordings(100) },
  { name: "retention.enforce", processor: () => processDueDataRetentionEnforcement(25) },
  // Decision 31: archived automations, forms, views, reports, rules and templates are kept for 30
  // days, then removed.
  { name: "archive.purge", processor: async () => ({ automations: await purgeArchivedAutomations(200), forms: await purgeArchivedForms(200), ...(await purgeArchivedItems(200)) }) },
  { name: "communications.processSuppressionExpiry", processor: () => processDueSuppressionExpiry(100) },
  { name: "cases.processSlaEscalations", processor: () => processCaseSlaEscalations(200) },
  { name: "modules.processTrials", processor: () => processModuleTrials() },
  { name: "modules.processHealth", processor: () => processModuleHealth(20) },
  { name: "cases.dispatchSurveys", processor: () => dispatchCaseSurveys(100) },
  { name: "cases.refreshAnalyticsSnapshots", processor: () => refreshCaseAnalyticsSnapshots(50) },
  { name: "cases.alertStaleUnassigned", processor: () => alertStaleUnassignedCases(24, 100) },
  { name: "metrics.computeGrainSnapshots", processor: () => computeDueMetricGrainSnapshots(200) },
] as const;

// Recurring "heavy" jobs -- each of these is its own bounded, multi-tenant scan tick (see
// job-registry.ts's isTenantScoped doc), so the per-tenant fairness wrapper below does NOT apply
// to these; it only wraps the two dynamically-enqueued, genuinely-single-tenant-per-job types
// (exports.process, imports.process) handled in processHeavyJob.
const heavyRecurringJobs = [
  { name: "reports.processRollups", processor: () => processPendingReportRefreshJobs(25) },
  { name: "reports.processRollupSchedule", processor: () => processDueReportRollupRefreshes(50) },
  { name: "reports.processSchedules", processor: () => processDueReportSchedules() },
  { name: "reports.retryFailedSchedules", processor: () => retryFailedReportSchedules() },
  { name: "exports.processExpiry", processor: () => processExpiredExportFiles(50) },
] as const;

const mlRecurringJobs = [{ name: "scoring.processScheduledRetraining", processor: () => processDueScheduledScoringRetraining(10) }] as const;

type RealtimeJobName = (typeof realtimeJobs)[number]["name"];
type OperationalJobName = (typeof operationalJobs)[number]["name"];
type HeavyRecurringJobName = (typeof heavyRecurringJobs)[number]["name"];
type MlRecurringJobName = (typeof mlRecurringJobs)[number]["name"];

function repeatMs() {
  const value = Number(process.env.WORKER_REPEAT_MS || process.env.WORKER_INTERVAL_MS || DEFAULT_REPEAT_MS);
  return Number.isFinite(value) && value >= 10_000 ? value : DEFAULT_REPEAT_MS;
}

// WP10 follow-up (F18 item 4/6): tenant-fairness scheduling for the "heavy" queue class -- see
// job-fairness.ts's module comment for the full mechanism and its honest limitations (a
// processor-side per-tenant concurrency cap approximating what BullMQ Pro's native job groups
// would give natively, since this repo runs plain open-source `bullmq`, confirmed via its own
// package.json pin and README feature table -- no per-tenant-group concurrency is available here).
function heavyFairnessMaxConcurrentPerTenant() {
  const value = Number(process.env.JOB_FAIRNESS_HEAVY_MAX_CONCURRENT_PER_TENANT || DEFAULT_TENANT_FAIRNESS_MAX_CONCURRENT);
  return Number.isFinite(value) && value >= 1 ? value : DEFAULT_TENANT_FAIRNESS_MAX_CONCURRENT;
}

function redisConnection() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("Missing env var: REDIS_URL");
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: parsed.pathname && parsed.pathname !== "/" ? Number(parsed.pathname.slice(1)) : undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

async function registerRepeatableJobs(queue: Queue, jobs: ReadonlyArray<{ name: string }>) {
  for (const jobConfig of jobs) {
    await queue.add(
      jobConfig.name,
      {},
      {
        jobId: jobConfig.name,
        repeat: { every: repeatMs() },
      },
    );
  }
}

function tenantIdFromJobData(data: unknown): string | null {
  const tenantId = (data as { tenantId?: unknown } | null | undefined)?.tenantId;
  return typeof tenantId === "string" && tenantId ? tenantId : null;
}

async function processRealtimeJob(job: Job) {
  const recurring = realtimeJobs.find((item) => item.name === (job.name as RealtimeJobName));
  if (recurring) return recurring.processor();
  throw new Error(`Unknown job: ${job.name}`);
}

async function processOperationalJob(job: Job) {
  const recurring = operationalJobs.find((item) => item.name === (job.name as OperationalJobName));
  if (recurring) return recurring.processor();
  throw new Error(`Unknown job: ${job.name}`);
}

async function processHeavyJob(job: Job) {
  const recurring = heavyRecurringJobs.find((item) => item.name === (job.name as HeavyRecurringJobName));
  if (recurring) return recurring.processor();

  if (job.name === "exports.process") {
    const exportRequestId = typeof job.data?.exportRequestId === "string" ? job.data.exportRequestId : "";
    if (!exportRequestId) throw new Error("Missing exportRequestId");
    return withTenantFairness(
      job,
      { queueClass: "heavy", tenantId: tenantIdFromJobData(job.data), maxConcurrentPerTenant: heavyFairnessMaxConcurrentPerTenant() },
      () => processExportRequest(exportRequestId),
    );
  }
  if (job.name === "imports.process") {
    const importJobId = typeof job.data?.importJobId === "string" ? job.data.importJobId : "";
    if (!importJobId) throw new Error("Missing importJobId");
    return withTenantFairness(
      job,
      { queueClass: "heavy", tenantId: tenantIdFromJobData(job.data), maxConcurrentPerTenant: heavyFairnessMaxConcurrentPerTenant() },
      () => processImportJob(importJobId),
    );
  }
  throw new Error(`Unknown job: ${job.name}`);
}

async function processMlJob(job: Job) {
  const recurring = mlRecurringJobs.find((item) => item.name === (job.name as MlRecurringJobName));
  if (recurring) return recurring.processor();

  if (job.name === "scoring.recomputeRules") {
    const { tenantId, userId } = job.data as { tenantId: string; userId: string };
    const user = { id: userId, tenantId };
    const result = await recomputeLeadScoresForTenant(user);
    await createUserNotification({
      tenantId,
      userId,
      title: "Lead score recompute complete",
      message: `Rule-based scores recomputed for ${result.count} lead${result.count === 1 ? "" : "s"}.`,
      data: { type: "scoring.recomputeRules", ...result },
    }).catch(() => undefined);
    return result;
  }
  if (job.name === "scoring.recomputeSelfLearning") {
    const { tenantId, userId, targetModules, force } = job.data as {
      tenantId: string;
      userId: string;
      targetModules?: string[];
      force?: boolean;
    };
    const user = { id: userId, tenantId };
    const result = await recomputeSelfLearningScoresForTenant(user, { targetModules: targetModules as any, force });
    await createUserNotification({
      tenantId,
      userId,
      title: "Predictive score recompute complete",
      message: `Predictive scores recomputed for ${result.processed} record${result.processed === 1 ? "" : "s"}${result.skipped ? ` (${result.skipped} skipped)` : ""}.`,
      data: { type: "scoring.recomputeSelfLearning", processed: result.processed, skipped: result.skipped },
    }).catch(() => undefined);
    return result;
  }
  throw new Error(`Unknown job: ${job.name}`);
}

const PROCESSOR_BY_CLASS: Record<JobQueueClass, (job: Job) => Promise<unknown>> = {
  realtime: processRealtimeJob,
  operational: processOperationalJob,
  heavy: processHeavyJob,
  ml: processMlJob,
};

function wireWorkerLifecycle(label: string, worker: Worker) {
  worker.on("completed", (job) => {
    console.log(`[worker:${label}] ${job.name}#${job.id}: completed`);
  });
  worker.on("failed", (job, error) => {
    console.error(`[worker:${label}] ${job?.name || "unknown"}#${job?.id || "unknown"}: failed`, error);
    if (!job) return;

    const attemptsLimit = job.opts?.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade >= attemptsLimit;

    const isScoringJob = job.name === "scoring.recomputeRules" || job.name === "scoring.recomputeSelfLearning";
    if (isScoringJob && isFinalAttempt) {
      const { tenantId, userId } = job.data as { tenantId: string; userId: string };
      const errorLabel = job.name === "scoring.recomputeRules" ? "Lead score recompute" : "Predictive score recompute";
      createUserNotification({
        tenantId,
        userId,
        title: `${errorLabel} failed`,
        message: `${errorLabel} failed after ${job.attemptsMade} attempt${job.attemptsMade === 1 ? "" : "s"}: ${error.message || "Unknown error"}.`,
        data: { type: job.name, error: error.message },
      }).catch(() => undefined);
    }

    // WP10 follow-up (F18 item 4/6): dead-letter tooling -- a durable, queryable row for the
    // job's FINAL attempt (not every intermediate retry), so an operator can see/replay
    // permanently-failed jobs after BullMQ's own `removeOnFail` retention window passes. See
    // migrations/0108_job_dead_letter.sql and job-dead-letter.ts.
    if (isFinalAttempt) {
      recordJobDeadLetter({
        queueName: worker.name,
        jobName: job.name,
        jobId: job.id ?? "unknown",
        tenantId: tenantIdFromJobData(job.data),
        payload: job.data,
        errorMessage: error?.message || "Unknown error",
        attemptsMade: job.attemptsMade,
      }).catch((dlqError) => {
        console.error(`[worker:${label}] failed to record dead-letter row for ${job.name}#${job.id}`, dlqError);
      });
    }
  });
  worker.on("error", (error) => {
    console.error(`[worker:${label}] redis error`, error);
  });
}

// WP10 (F18): a periodic, per-worker liveness log ("worker heartbeats") -- cheap, visible in
// plain container logs without needing a separate monitoring stack wired up, and enough to
// answer "is this specific workload class's worker still alive and how backed up is it" during
// an incident. `worker.isRunning()` reflects BullMQ's own internal processing-loop state.
function startHeartbeat(label: string, worker: Worker, queue: Queue) {
  return setInterval(async () => {
    const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed").catch(() => null);
    console.log(`[worker:${label}] heartbeat running=${worker.isRunning()} counts=${counts ? JSON.stringify(counts) : "unavailable"}`);
  }, 60_000);
}

const JOB_QUEUE_CLASSES: JobQueueClass[] = ["realtime", "operational", "heavy", "ml"];

// WP10 follow-up (F18 item 4/6): job-registry.ts is meant to be the single source of truth for
// which job belongs to which class -- this fails the worker process fast at startup (rather than
// silently drifting) if this file's own recurring-job arrays and the registry ever disagree, e.g.
// a job added to one but not the other.
function assertRegistryConsistency() {
  const declaredHere: Record<JobQueueClass, string[]> = {
    realtime: realtimeJobs.map((job) => job.name),
    operational: operationalJobs.map((job) => job.name),
    heavy: heavyRecurringJobs.map((job) => job.name),
    ml: mlRecurringJobs.map((job) => job.name),
  };
  for (const queueClass of JOB_QUEUE_CLASSES) {
    const expected = [...recurringJobNamesForClass(queueClass)].sort();
    const actual = [...declaredHere[queueClass]].sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      throw new Error(
        `job-registry.ts/scripts/worker.ts recurring-job mismatch for class "${queueClass}": registry=${JSON.stringify(expected)} worker=${JSON.stringify(actual)}`,
      );
    }
  }
}

async function main() {
  assertRegistryConsistency();
  const connection = redisConnection();
  const defaultJobOptions = {
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 10_000 },
    removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
    removeOnFail: { age: 60 * 60 * 24 * 30, count: 2000 },
  };

  const queues: Record<JobQueueClass, Queue> = {
    realtime: new Queue(QUEUE_NAME_BY_CLASS.realtime, { connection, defaultJobOptions }),
    operational: new Queue(QUEUE_NAME_BY_CLASS.operational, { connection, defaultJobOptions }),
    heavy: new Queue(QUEUE_NAME_BY_CLASS.heavy, { connection, defaultJobOptions }),
    ml: new Queue(QUEUE_NAME_BY_CLASS.ml, { connection, defaultJobOptions }),
  };

  await registerRepeatableJobs(queues.realtime, realtimeJobs);
  await registerRepeatableJobs(queues.operational, operationalJobs);
  await registerRepeatableJobs(queues.heavy, heavyRecurringJobs);
  await registerRepeatableJobs(queues.ml, mlRecurringJobs);

  // WP10 follow-up (F18 item 4/6): FOUR independent concurrency budgets (one per class), each
  // configurable via its own env var -- see job-registry.ts's resolveConcurrency for the exact
  // fallback rules (operational inherits the legacy WORKER_CONCURRENCY_BACKGROUND/
  // WORKER_CONCURRENCY env vars; heavy/ml do not, since they're newly split out of that same old
  // budget). ML defaults LOW (2) since model training/scoring is CPU/memory-heavy per job.
  const concurrency: Record<JobQueueClass, number> = {
    realtime: resolveConcurrency("realtime"),
    operational: resolveConcurrency("operational"),
    heavy: resolveConcurrency("heavy"),
    ml: resolveConcurrency("ml"),
  };

  const workers: Record<JobQueueClass, Worker> = {
    realtime: new Worker(QUEUE_NAME_BY_CLASS.realtime, PROCESSOR_BY_CLASS.realtime, { connection, concurrency: concurrency.realtime }),
    operational: new Worker(QUEUE_NAME_BY_CLASS.operational, PROCESSOR_BY_CLASS.operational, { connection, concurrency: concurrency.operational }),
    heavy: new Worker(QUEUE_NAME_BY_CLASS.heavy, PROCESSOR_BY_CLASS.heavy, { connection, concurrency: concurrency.heavy }),
    ml: new Worker(QUEUE_NAME_BY_CLASS.ml, PROCESSOR_BY_CLASS.ml, { connection, concurrency: concurrency.ml }),
  };

  for (const queueClass of JOB_QUEUE_CLASSES) wireWorkerLifecycle(queueClass, workers[queueClass]);
  const heartbeats = JOB_QUEUE_CLASSES.map((queueClass) => startHeartbeat(queueClass, workers[queueClass], queues[queueClass]));

  console.log(
    `[worker] BullMQ processors running ${JOB_QUEUE_CLASSES.map((queueClass) => `queue=${QUEUE_NAME_BY_CLASS[queueClass]}(concurrency=${concurrency[queueClass]})`).join(" ")} repeat=${repeatMs()}ms`,
  );

  // WP10 (F18): bounded graceful shutdown -- Worker#close() waits for in-flight jobs to finish
  // (up to BullMQ's own default grace period) rather than killing them mid-run, which matters
  // most for exactly the long-running heavy jobs this split was built around.
  const shutdown = async () => {
    console.log("[worker] shutting down");
    heartbeats.forEach(clearInterval);
    await Promise.all(JOB_QUEUE_CLASSES.map((queueClass) => workers[queueClass].close()));
    await Promise.all(JOB_QUEUE_CLASSES.map((queueClass) => queues[queueClass].close()));
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
