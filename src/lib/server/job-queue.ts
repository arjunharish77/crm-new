import { Queue } from "bullmq";
import { JOB_REGISTRY, QUEUE_NAME_BY_CLASS, type CrmJobName, type JobQueueClass } from "@/lib/server/job-registry";

// WP10 (F18): FOUR workload classes, each its own named BullMQ queue -- realtime/communication,
// operational-automation, export/import/report ("heavy"), and ML, per the audit's own original
// ask (job-contract-design section, WP10 item 4). This supersedes the first WP10 pass's two-class
// split (a single "background" queue holding operational+heavy+ml jobs together) -- see
// 25_AUDIT_REMEDIATION_PLAN.md's WP10 tracking record for why that was an explicitly-documented
// partial fix, not the full four-class design. job-registry.ts (src/lib/server/job-registry.ts)
// is now the single source of truth for which job name belongs to which class and which queue
// name that maps to -- this file just gets/creates the four `Queue` instances and routes each
// dynamically-enqueued job to the correct one via that registry, instead of hardcoding a queue
// name per enqueue function.
export { QUEUE_NAME_BY_CLASS };
export const CRM_JOB_QUEUE_NAME = QUEUE_NAME_BY_CLASS.operational;
export const REALTIME_JOB_QUEUE_NAME = QUEUE_NAME_BY_CLASS.realtime;
export const HEAVY_JOB_QUEUE_NAME = QUEUE_NAME_BY_CLASS.heavy;
export const ML_JOB_QUEUE_NAME = QUEUE_NAME_BY_CLASS.ml;

export type { CrmJobName };

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
  };
}

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 10_000 },
  removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
  removeOnFail: { age: 60 * 60 * 24 * 30, count: 2000 },
};

const queuesByClass = new Map<JobQueueClass, Queue>();

function getQueueForClass(queueClass: JobQueueClass): Queue {
  let queue = queuesByClass.get(queueClass);
  if (!queue) {
    queue = new Queue(QUEUE_NAME_BY_CLASS[queueClass], { connection: redisConnection(), defaultJobOptions });
    queuesByClass.set(queueClass, queue);
  }
  return queue;
}

function getQueueForJob(name: CrmJobName): Queue {
  return getQueueForClass(JOB_REGISTRY[name].queueClass);
}

/** @deprecated kept for existing callers (connector-health.ts) -- prefer getQueueForOperational/getHeavyCrmQueue/etc. below for new code. */
export function getCrmQueue() {
  return getQueueForClass("operational");
}

export function getRealtimeCrmQueue() {
  return getQueueForClass("realtime");
}

export function getHeavyCrmQueue() {
  return getQueueForClass("heavy");
}

export function getMlCrmQueue() {
  return getQueueForClass("ml");
}

export function getOperationalCrmQueue() {
  return getQueueForClass("operational");
}

export function getQueueByClass(queueClass: JobQueueClass): Queue {
  return getQueueForClass(queueClass);
}

export async function enqueueExportJob(exportRequestId: string, tenantId?: string | null) {
  const queue = getQueueForJob("exports.process");
  return queue.add(
    "exports.process" satisfies CrmJobName,
    { exportRequestId, tenantId: tenantId ?? null },
    { jobId: `export-${exportRequestId}` },
  );
}

export async function enqueueImportJob(importJobId: string, tenantId?: string | null) {
  const queue = getQueueForJob("imports.process");
  return queue.add(
    "imports.process" satisfies CrmJobName,
    { importJobId, tenantId: tenantId ?? null },
    { jobId: `import-${importJobId}` },
  );
}

async function enqueueDeduped(jobName: CrmJobName, jobId: string, data: Record<string, unknown>) {
  const queue = getQueueForJob(jobName);
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "active" || state === "waiting" || state === "delayed" || state === "waiting-children") {
      return { alreadyQueued: true as const, jobId };
    }
    await existing.remove().catch(() => undefined);
  }
  await queue.add(jobName, data, { jobId });
  return { alreadyQueued: false as const, jobId };
}

export async function enqueueRuleScoringRecompute(input: { tenantId: string; userId: string }) {
  return enqueueDeduped("scoring.recomputeRules", `scoring-rules-${input.tenantId}`, {
    tenantId: input.tenantId,
    userId: input.userId,
  });
}

export async function enqueueSelfLearningScoringRecompute(input: {
  tenantId: string;
  userId: string;
  targetModules?: string[];
  force?: boolean;
}) {
  return enqueueDeduped("scoring.recomputeSelfLearning", `scoring-self-learning-${input.tenantId}`, {
    tenantId: input.tenantId,
    userId: input.userId,
    targetModules: input.targetModules,
    force: input.force,
  });
}
