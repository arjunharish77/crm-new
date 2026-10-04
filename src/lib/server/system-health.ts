import Redis from "ioredis";
import { queryOneAsSystem } from "@/lib/db/query";

// Round-2 plan O5: one place that checks the database, Redis, the worker's heartbeats and the
// job queues. /api/health shows the summary (for Docker and the deploy script);
// /api/platform-admin/health shows the details.
export const WORKER_HEARTBEAT_KEY = "crm:worker:heartbeat";
export const WORKER_HEARTBEAT_STALE_MS = 3 * 60_000;
const QUEUE_CLASSES = ["realtime", "operational", "heavy", "ml"] as const;

let redis: Redis | null = null;
function redisClient() {
  if (!process.env.REDIS_URL) return null;
  redis ??= new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2000, enableOfflineQueue: true });
  redis.on("error", () => undefined);
  return redis;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([work, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), ms))]);
}

export async function checkDatabase() {
  try {
    const row = await withTimeout(queryOneAsSystem<{ ok: number }>("select 1 as ok"), 3000);
    return row?.ok === 1 ? "ok" : "error";
  } catch {
    return "error";
  }
}

export async function checkRedis() {
  const client = redisClient();
  if (!client) return "not configured";
  try {
    return (await withTimeout(client.ping(), 2000)) === "PONG" ? "ok" : "error";
  } catch {
    return "error";
  }
}

// When each worker queue class last reported in (ISO), and whether that's recent.
export async function workerHeartbeats() {
  const client = redisClient();
  if (!client) return { status: "unknown" as const, classes: {} as Record<string, string | null> };
  try {
    const values = await withTimeout(client.hgetall(WORKER_HEARTBEAT_KEY), 2000);
    const classes = Object.fromEntries(QUEUE_CLASSES.map((name) => [name, values?.[name] ?? null]));
    const now = Date.now();
    const fresh = QUEUE_CLASSES.every((name) => classes[name] && now - new Date(classes[name]!).getTime() < WORKER_HEARTBEAT_STALE_MS);
    const anySeen = QUEUE_CLASSES.some((name) => classes[name]);
    return { status: fresh ? ("ok" as const) : anySeen ? ("stale" as const) : ("unknown" as const), classes };
  } catch {
    return { status: "unknown" as const, classes: {} as Record<string, string | null> };
  }
}

export async function queueCounts() {
  const { getQueueByClass } = await import("@/lib/server/job-queue");
  const result: Record<string, Record<string, number> | null> = {};
  for (const name of QUEUE_CLASSES) {
    try {
      result[name] = await withTimeout(getQueueByClass(name).getJobCounts("waiting", "active", "delayed", "failed"), 2000);
    } catch {
      result[name] = null;
    }
  }
  return result;
}

export async function failedJobsLastDay() {
  try {
    const row = await queryOneAsSystem<{ count: number }>(`select count(*)::int as count from "JobDeadLetter" where "failedAt" > now() - interval '24 hours'`);
    return row?.count ?? 0;
  } catch {
    return null;
  }
}

export async function healthSummary() {
  const [database, redisStatus, worker] = await Promise.all([checkDatabase(), checkRedis(), workerHeartbeats()]);
  const ok = database === "ok" && (redisStatus === "ok" || redisStatus === "not configured");
  return {
    ok,
    status: database !== "ok" ? "down" : ok && worker.status !== "stale" ? "ok" : "degraded",
    database,
    redis: redisStatus,
    worker: worker.status,
    version: process.env.CRM_VERSION || null,
    timestamp: new Date().toISOString(),
  };
}
