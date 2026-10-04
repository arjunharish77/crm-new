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
import { runHousekeeping } from "@/lib/server/housekeeping";
import { enforceSettingsAtStartup } from "@/lib/server/settings-check";
import * as Sentry from "@sentry/node";
import { writeFileSync } from "fs";
import Redis from "ioredis";
import { reportError, sentryOptions } from "@/lib/server/error-reporting";
import { WORKER_HEARTBEAT_KEY } from "@/lib/server/system-health";
import { queryOneAsSystem } from "@/lib/db/query";
import {
  QUEUE_NAME_BY_CLASS,
  resolveConcurrency,
  recurringJobNamesForClass,
  jobRegistryEntry,
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
// Round-2 plan B16: one table of processors for every recurring job, keyed by its registry name.
// Which queue a job runs on, and how often, come from job-registry.ts only; startup fails if a
// recurring job in the registry has no processor here or this table names one the registry
// doesn't have.
const RECURRING_PROCESSORS: Record<string, () => Promise<unknown>> = {
  // realtime
  "communications.processDue": () => processCommunicationOutbox(50),
  "webhooks.processOutbox": () => processWebhookOutbox(25),
  "tasks.processReminders": () => processDueTaskReminders(),
  "tasks.processReminderEscalations": () => processTaskReminderEscalations(),
  "tasks.processSlaBreaches": () => processTaskSlaBreaches(),
  "nba.processScheduledRefresh": () => processDueNextBestActionRefresh(50),
  // operational
  "applications.documentReminders": () => processApplicationDocumentReminders(100),
  "automation.processDue": () => processDueAutomationJobs(50),
  "tasks.processOverdue": () => processOverdueTaskAutomations(),
  "journeys.processEnrollmentRefresh": () => processDueJourneyEnrollmentRefresh(),
  "marketing.continueCampaignLaunches": () => processDueCampaignLaunches(),
  "journeys.alertDegraded": () => alertDegradedJourneys(100),
  "dataQuality.processScheduledScan": () => runScheduledDataQualityScan(25),
  "marketplace.processAppDeliveries": () => processAppEventDeliveries(25),
  "marketplace.processAppSyncs": () => processDueAppSyncs(25),
  "telephony.expireRecordings": () => expireCallRecordings(100),
  "retention.enforce": () => processDueDataRetentionEnforcement(25),
  // Decision 31: archived automations, forms, views, reports, rules and templates are kept for 30
  // days, then removed.
  "archive.purge": async () => ({ automations: await purgeArchivedAutomations(200), forms: await purgeArchivedForms(200), ...(await purgeArchivedItems(200)) }),
  "housekeeping.run": () => runHousekeeping(5000),
  "communications.processSuppressionExpiry": () => processDueSuppressionExpiry(100),
  "cases.processSlaEscalations": () => processCaseSlaEscalations(200),
  "modules.processTrials": () => processModuleTrials(),
  "modules.processHealth": () => processModuleHealth(20),
  "cases.dispatchSurveys": () => dispatchCaseSurveys(100),
  "cases.refreshAnalyticsSnapshots": () => refreshCaseAnalyticsSnapshots(50),
  "cases.alertStaleUnassigned": () => alertStaleUnassignedCases(24, 100),
  "metrics.computeGrainSnapshots": () => computeDueMetricGrainSnapshots(200),
  // heavy: each is its own bounded scan across tenants, so the per-tenant fairness wrapper only
  // applies to the dynamically enqueued exports.process and imports.process (processHeavyJob).
  "reports.processRollups": () => processPendingReportRefreshJobs(25),
  "reports.processRollupSchedule": () => processDueReportRollupRefreshes(50),
  "reports.processSchedules": () => processDueReportSchedules(),
  "reports.retryFailedSchedules": () => retryFailedReportSchedules(),
  "exports.processExpiry": () => processExpiredExportFiles(50),
  // ml
  "scoring.processScheduledRetraining": () => processDueScheduledScoringRetraining(10),
};

// A recurring tick that runs longer than this is reported as failed (the next tick still runs).
const RECURRING_TICK_TIMEOUT_MS = 10 * 60_000;

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`JOB_TIMEOUT: ${label} ran longer than ${Math.round(ms / 60_000)} minutes`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

function runRecurring(name: string) {
  const processor = RECURRING_PROCESSORS[name];
  if (!processor) return null;
  return withTimeout(processor(), RECURRING_TICK_TIMEOUT_MS, name);
}

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

// Recurring ticks don't retry (B16): the next tick is the retry, and three attempts of a failing
// tick only tripled the noise.
async function registerRepeatableJobs(queue: Queue, queueClass: JobQueueClass) {
  for (const name of recurringJobNamesForClass(queueClass)) {
    await queue.add(
      name,
      {},
      {
        jobId: name,
        repeat: { every: jobRegistryEntry(name).repeatMs ?? repeatMs() },
        attempts: 1,
      },
    );
  }
}

function tenantIdFromJobData(data: unknown): string | null {
  const tenantId = (data as { tenantId?: unknown } | null | undefined)?.tenantId;
  return typeof tenantId === "string" && tenantId ? tenantId : null;
}

async function processRecurringJob(job: Job) {
  const run = runRecurring(job.name);
  if (run) return run;
  throw new Error(`Unknown job: ${job.name}`);
}

async function processHeavyJob(job: Job) {
  const recurring = runRecurring(job.name);
  if (recurring) return recurring;

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
  const recurring = runRecurring(job.name);
  if (recurring) return recurring;

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
  realtime: processRecurringJob,
  operational: processRecurringJob,
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

    // B16: a failed export or import used to tell nobody; the person who asked is notified.
    if (isFinalAttempt && (job.name === "exports.process" || job.name === "imports.process")) {
      notifyFailedTransfer(job, error).catch((notifyError) => console.error(`[worker:${label}] failed to notify about ${job.name}#${job.id}`, notifyError));
    }

    // Round-2 plan O5: a job that has used up its attempts (or a recurring tick, which has one)
    // is reported to Sentry, which emails on each new kind of failure.
    if (isFinalAttempt) {
      console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "job.failed", queue: worker.name, job: job.name, jobId: job.id, tenantId: tenantIdFromJobData(job.data), attempts: job.attemptsMade, error: error?.message }));
      reportError(error, { job: job.name, queue: worker.name, tenantId: tenantIdFromJobData(job.data) ?? "none" });
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
// Round-2 plan O5: every 30 seconds each running class records itself in Redis (read by
// /api/health and Platform › Failed jobs) and in a local file (read by the worker container's
// health check, deploy/vps/docker-compose.yml). The log line stays once a minute.
const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE || "/tmp/crm-worker-heartbeat";
let heartbeatRedis: Redis | null = null;
function heartbeatClient() {
  if (!process.env.REDIS_URL) return null;
  heartbeatRedis ??= new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
  heartbeatRedis.on("error", () => undefined);
  return heartbeatRedis;
}

function startHeartbeat(label: JobQueueClass, worker: Worker, queue: Queue) {
  let ticks = 0;
  const beat = async () => {
    ticks += 1;
    if (worker.isRunning()) {
      const now = new Date().toISOString();
      await heartbeatClient()?.multi().hset(WORKER_HEARTBEAT_KEY, label, now).expire(WORKER_HEARTBEAT_KEY, 600).exec().catch(() => undefined);
      try { writeFileSync(HEARTBEAT_FILE, now); } catch { /* read-only filesystem: only Redis */ }
    }
    if (ticks % 2 === 0) {
      const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed").catch(() => null);
      console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "worker.heartbeat", queueClass: label, running: worker.isRunning(), counts }));
    }
  };
  void beat();
  return setInterval(() => void beat(), 30_000);
}

const JOB_QUEUE_CLASSES: JobQueueClass[] = ["realtime", "operational", "heavy", "ml"];

// WP10 follow-up (F18 item 4/6): job-registry.ts is meant to be the single source of truth for
// which job belongs to which class -- this fails the worker process fast at startup (rather than
// silently drifting) if this file's own recurring-job arrays and the registry ever disagree, e.g.
// a job added to one but not the other.
function assertRegistryConsistency() {
  const registered = JOB_QUEUE_CLASSES.flatMap((queueClass) => recurringJobNamesForClass(queueClass) as string[]);
  const missing = registered.filter((name) => !RECURRING_PROCESSORS[name]);
  const unknown = Object.keys(RECURRING_PROCESSORS).filter((name) => !registered.includes(name));
  if (missing.length || unknown.length) {
    throw new Error(`job-registry.ts/scripts/worker.ts recurring-job mismatch: no processor for ${JSON.stringify(missing)}; not in the registry: ${JSON.stringify(unknown)}`);
  }
}

async function notifyFailedTransfer(job: Job, error: Error) {
  const isExport = job.name === "exports.process";
  const id = String((isExport ? job.data?.exportRequestId : job.data?.importJobId) ?? "");
  if (!id) return;
  const message = (error?.message || "Unknown error").slice(0, 300);
  const row = isExport
    ? await queryOneAsSystem<{ tenantId: string; userId: string; label: string }>(
        `update "ExportRequest" set status = case when status in ('QUEUED', 'RUNNING') then 'FAILED' else status end,
                error = coalesce(error, $2), "updatedAt" = now()
         where id = $1 returning "tenantId", "userId", "moduleName" as label`,
        [id, message],
      )
    : await queryOneAsSystem<{ tenantId: string; userId: string; label: string }>(
        `update "ImportJob" set status = case when status in ('QUEUED', 'PROCESSING') then 'FAILED' else status end, "updatedAt" = now()
         where id = $1 returning "tenantId", "userId", module as label`,
        [id],
      );
  if (!row?.userId) return;
  const what = `${String(row.label || "").toLowerCase()} ${isExport ? "export" : "import"}`.trim();
  await createUserNotification({
    tenantId: row.tenantId,
    userId: row.userId,
    title: isExport ? "Export failed" : "Import failed",
    message: `Your ${what} didn't finish: ${message}. Try again, or ask an admin if it keeps happening.`,
    data: { type: isExport ? "EXPORT_FAILED" : "IMPORT_FAILED", id },
  });
}

async function main() {
  enforceSettingsAtStartup("worker");
  // Round-2 plan O5: background-job errors go to Sentry when SENTRY_DSN_WORKER is set.
  if (process.env.SENTRY_DSN_WORKER) Sentry.init(sentryOptions(process.env.SENTRY_DSN_WORKER, "worker"));
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

  for (const queueClass of JOB_QUEUE_CLASSES) await registerRepeatableJobs(queues[queueClass], queueClass);

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
    await Sentry.close(2000).catch(() => undefined);
    heartbeatRedis?.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
