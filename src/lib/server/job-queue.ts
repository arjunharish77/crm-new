import { Queue } from "bullmq";

export const CRM_JOB_QUEUE_NAME = "crm-jobs";

export type CrmJobName =
  | "automation.processDue"
  | "tasks.processReminders"
  | "reports.processRollups"
  | "reports.processSchedules"
  | "communications.processDue"
  | "exports.process";

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
