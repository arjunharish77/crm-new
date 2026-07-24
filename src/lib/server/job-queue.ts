import { Queue } from "bullmq";

export const CRM_JOB_QUEUE_NAME = "crm-jobs";

export type CrmJobName =
  | "automation.processDue"
  | "tasks.processReminders"
  | "reports.processRollups"
  | "reports.processSchedules"
  | "communications.processDue"
  | "exports.process"
  | "scoring.recomputeRules"
  | "scoring.recomputeSelfLearning";

let queue: Queue | null = null;

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

export function getCrmQueue() {
  if (!queue) {
    queue = new Queue(CRM_JOB_QUEUE_NAME, {
      connection: redisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
        removeOnFail: { age: 60 * 60 * 24 * 30, count: 2000 },
      },
    });
  }
  return queue;
}

export async function enqueueExportJob(exportRequestId: string) {
  const queue = getCrmQueue();
  return queue.add(
    "exports.process" satisfies CrmJobName,
    { exportRequestId },
    { jobId: `export-${exportRequestId}` },
  );
}

async function enqueueDeduped(jobName: CrmJobName, jobId: string, data: Record<string, unknown>) {
  const queue = getCrmQueue();
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
