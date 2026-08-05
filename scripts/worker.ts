#!/usr/bin/env tsx

import { Queue, Worker } from "bullmq";
import dotenv from "dotenv";
import { processDueAutomationJobs } from "@/lib/server/crm";
import { processDueTaskReminders, processOverdueTaskAutomations } from "@/lib/server/tasks";
import { processPendingReportRefreshJobs } from "@/lib/server/report-rollups";
import { processDueReportSchedules } from "@/lib/server/report-schedules";
import { processCommunicationOutbox } from "@/lib/server/communications";
import { processExportRequest } from "@/lib/server/exports";
import { recomputeLeadScoresForTenant } from "@/lib/server/admin-modules";
import { processDueScheduledScoringRetraining, recomputeSelfLearningScoresForTenant } from "@/lib/server/self-learning-scoring";
import { createUserNotification } from "@/lib/server/notifications";

const QUEUE_NAME = "crm-jobs";
const DEFAULT_REPEAT_MS = 60_000;

dotenv.config({ path: ".env.local", override: false });
dotenv.config({ path: ".env", override: false });
dotenv.config({ path: "../.env", override: false });

const recurringJobs = [
  { name: "automation.processDue", processor: () => processDueAutomationJobs(50) },
  { name: "tasks.processReminders", processor: () => processDueTaskReminders() },
  { name: "tasks.processOverdue", processor: () => processOverdueTaskAutomations() },
  { name: "reports.processRollups", processor: () => processPendingReportRefreshJobs(25) },
  { name: "reports.processSchedules", processor: () => processDueReportSchedules() },
  { name: "communications.processDue", processor: () => processCommunicationOutbox(50) },
  { name: "scoring.processScheduledRetraining", processor: () => processDueScheduledScoringRetraining(10) },
] as const;

type RecurringJobName = (typeof recurringJobs)[number]["name"];

function repeatMs() {
  const value = Number(process.env.WORKER_REPEAT_MS || process.env.WORKER_INTERVAL_MS || DEFAULT_REPEAT_MS);
  return Number.isFinite(value) && value >= 10_000 ? value : DEFAULT_REPEAT_MS;
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

async function registerRepeatableJobs(queue: Queue) {
  for (const jobConfig of recurringJobs) {
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

async function main() {
  const connection = redisConnection();
  const queue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
      removeOnFail: { age: 60 * 60 * 24 * 30, count: 2000 },
    },
  });
  await registerRepeatableJobs(queue);

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const recurring = recurringJobs.find((item) => item.name === (job.name as RecurringJobName));
      if (recurring) return recurring.processor();
      if (job.name === "exports.process") {
        const exportRequestId = typeof job.data?.exportRequestId === "string" ? job.data.exportRequestId : "";
        if (!exportRequestId) throw new Error("Missing exportRequestId");
        return processExportRequest(exportRequestId);
      }
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
    },
    { connection, concurrency: Number(process.env.WORKER_CONCURRENCY || 5) },
  );

  worker.on("completed", (job) => {
    console.log(`[worker] ${job.name}#${job.id}: completed`);
  });
  worker.on("failed", (job, error) => {
    console.error(`[worker] ${job?.name || "unknown"}#${job?.id || "unknown"}: failed`, error);
    if (!job) return;
    const isScoringJob = job.name === "scoring.recomputeRules" || job.name === "scoring.recomputeSelfLearning";
    const attemptsLimit = job.opts?.attempts ?? 1;
    if (isScoringJob && job.attemptsMade >= attemptsLimit) {
      const { tenantId, userId } = job.data as { tenantId: string; userId: string };
      const label = job.name === "scoring.recomputeRules" ? "Lead score recompute" : "Predictive score recompute";
      createUserNotification({
        tenantId,
        userId,
        title: `${label} failed`,
        message: `${label} failed after ${job.attemptsMade} attempt${job.attemptsMade === 1 ? "" : "s"}: ${error.message || "Unknown error"}.`,
        data: { type: job.name, error: error.message },
      }).catch(() => undefined);
    }
  });
  worker.on("error", (error) => {
    console.error("[worker] redis error", error);
  });

  console.log(`[worker] BullMQ direct processor running queue=${QUEUE_NAME} repeat=${repeatMs()}ms`);

  const shutdown = async () => {
    console.log("[worker] shutting down");
    await worker.close();
    await queue.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
