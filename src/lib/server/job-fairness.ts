import Redis from "ioredis";
import { DelayedError } from "bullmq";
import { DEFAULT_TENANT_FAIRNESS_MAX_CONCURRENT, type JobQueueClass } from "@/lib/server/job-registry";

// WP10 follow-up (F18 item 4/6): tenant-fairness scheduling.
//
// The requirement (CAPACITY_REQUIREMENTS.md, quoted in 25_AUDIT_REMEDIATION_PLAN.md's WP10 entry):
// one tenant's heavy job (a large export/import/report run) must not consume so much of the
// shared worker pool that OTHER tenants' jobs on the same queue class get starved -- target is
// roughly a 20% p95 latency degradation margin for everyone else.
//
// What real BullMQ Pro has for this: native per-tenant "job groups" with their own per-group
// concurrency, so the queue itself round-robins across groups instead of FIFO-draining one
// tenant's backlog before touching another's. CONFIRMED that is a Pro-only feature: this repo's
// package.json pins plain open-source `bullmq` (`"bullmq": "^5.69.1"`), and that package's own
// README feature-comparison table lists "Group Rate Limit" and "Group Support" as present only in
// the BullMQ-Pro column, blank for OSS BullMQ. There is no way to get real per-tenant-group
// concurrency out of the installed package.
//
// What this file implements instead -- a practical, honest approximation using only open-source
// BullMQ + Redis, applied to the "heavy" queue class's genuinely single-tenant-per-job job types
// (exports.process, imports.process -- see job-registry.ts's isTenantScoped field and its
// module-level comment for why the "heavy" class's recurring multi-tenant scan ticks, e.g.
// reports.processSchedules, are NOT wrapped by this: a single invocation of one of those already
// touches many different tenants' rows in one bounded batch, so there is no one tenant to
// attribute a fairness-counter slot to at the whole-invocation level):
//
//   1. Before the job's real (expensive) work runs, atomically INCR a Redis counter keyed by
//      `job-fairness:<queueClass>:<tenantId>` (mirroring the exact atomic INCR + EXPIRE-NX pattern
//      rate-limit.ts's checkRateLimit/recordRateLimitViolation already use for the identical
//      "count something in a fixed window, self-heal a leaked TTL" shape -- a short expiry is the
//      safety net against a crashed job leaving that tenant's counter stuck above the cap forever).
//   2. If that tenant already has `maxConcurrentPerTenant` (default 2) heavy jobs running, this
//      job does NOT run yet -- it calls `job.moveToDelayed(...)` to push itself back onto the
//      queue a short interval later, then throws BullMQ's own `DelayedError` so the Worker's
//      internal handling treats this as "moved, try again later" rather than a real failure (no
//      "failed" event, no dead-letter row, no retry-attempt consumed -- confirmed by reading
//      bullmq's own worker.js: it special-cases `err instanceof DelayedError` to re-activate the
//      job instead of calling `job.moveToFailed`). This frees the worker slot immediately for
//      another tenant's job in the meantime, instead of blocking the whole worker pool on this
//      one tenant's queued-up work.
//   3. When a job is actually allowed to run, the counter is decremented once it finishes --
//      success OR thrown error -- via a `finally` wrapper around the real processor call, so a
//      failing job never permanently occupies a fairness slot.
//
// Honest limitation (see also the audit-remediation report for this pass): this is a
// processor-side self-throttle, not a scheduler-side fair-share picker. It stops one tenant from
// occupying MORE than its cap's worth of concurrent heavy-job slots, which is the actual
// starvation mechanism the audit's example describes -- but it does not reorder an already-FIFO
// BullMQ queue, so a large tenant's many small deferred re-tries can still occupy a
// disproportionate share of queue *waiting-list position* even while never exceeding its
// concurrency cap. Verified here only via targeted unit tests of the counter logic (mocked Redis)
// -- NOT via an actual multi-worker concurrent-load test (no live Redis/worker process available
// in this environment); real-world effectiveness under genuine concurrent load remains unverified
// and is called out as a follow-up.

function redisConnection() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
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

let client: Redis | null | undefined;

function getClient(): Redis | null {
  if (client !== undefined) return client;
  const connection = redisConnection();
  if (!connection) {
    client = null;
    return client;
  }
  client = new Redis({ ...connection, lazyConnect: true, maxRetriesPerRequest: 1 });
  client.on("error", () => {
    // Swallowed intentionally -- same fail-open philosophy as rate-limit.ts: a fairness-
    // accounting outage should degrade to "run immediately, no fairness applied," never to
    // "silently stop processing this tenant's jobs at all."
  });
  return client;
}

/** Test-only hook to reset the module-level Redis client between test files/cases. */
export function __resetJobFairnessClientForTests() {
  client = undefined;
}

export const DEFAULT_TENANT_FAIRNESS_REDELAY_MS = 15_000;
export const DEFAULT_TENANT_FAIRNESS_COUNTER_TTL_SECONDS = 15 * 60;

function fairnessKey(queueClass: JobQueueClass, tenantId: string) {
  return `job-fairness:${queueClass}:${tenantId}`;
}

// Same atomic INCR + EXPIRE-NX-then-TTL shape as rate-limit.ts's checkRateLimit -- a single
// MULTI/EXEC means a process crash between the two commands can never leave this counter with a
// real count but no expiry (which would pin it above the cap forever).
async function incrementFairnessCounter(redis: Redis, key: string, ttlSeconds: number): Promise<number> {
  const results = await redis.multi().incr(key).expire(key, ttlSeconds, "NX").exec();
  if (!results) throw new Error("Redis MULTI returned null (connection likely in a bad state)");
  const [[incrError, count]] = results as [[Error | null, number], ...unknown[]];
  if (incrError) throw incrError;
  return count;
}

// Mirrors the same atomic pattern for the decrement side: EXPIRE ... NX after the DECR ensures
// that even a decrement which (in some edge case) ends up creating a fresh key -- e.g. the
// increment's own TTL already expired before this job finished -- still gets a bounded TTL rather
// than living forever with no expiry. A resulting negative/zero count is harmless: it only ever
// makes a future INCR's count *lower* than it should be (fails toward "allow", never "wrongly
// block"), consistent with this codebase's existing fail-open philosophy for Redis-backed limits.
async function decrementFairnessCounter(redis: Redis, key: string, ttlSeconds: number): Promise<void> {
  await redis.multi().decr(key).expire(key, ttlSeconds, "NX").exec();
}

/** Minimal shape this wrapper needs from a BullMQ `Job` -- kept narrow so tests can pass a plain mock. */
export interface FairnessJobHandle {
  token?: string;
  moveToDelayed(timestamp: number, token?: string): Promise<unknown>;
}

export interface TenantFairnessOptions {
  queueClass: JobQueueClass;
  /** Null/undefined for a job with no tenant to attribute (fails open -- runs immediately). */
  tenantId: string | null | undefined;
  /** Max concurrent heavy jobs a single tenant may occupy at once. Default: DEFAULT_TENANT_FAIRNESS_MAX_CONCURRENT (2). */
  maxConcurrentPerTenant?: number;
  /** How far in the future to re-delay a deferred job. Default: DEFAULT_TENANT_FAIRNESS_REDELAY_MS (15s). */
  redelayMs?: number;
  /** Safety-net TTL on the Redis counter itself, so a crashed job (which never reaches the decrement) can't pin a tenant's count above the cap forever. Default: DEFAULT_TENANT_FAIRNESS_COUNTER_TTL_SECONDS (15 min). */
  counterTtlSeconds?: number;
}

/**
 * Wraps a heavy, tenant-scoped job processor with the per-tenant concurrency cap described in
 * this file's module comment. Call this from inside the BullMQ processor function, passing the
 * real `Job` (for `moveToDelayed`/`token`) and the tenant the job belongs to.
 *
 * Throws BullMQ's `DelayedError` (not a normal error) when the job is deferred -- callers must let
 * that propagate uncaught so the Worker's own DelayedError handling takes over; do not wrap a call
 * to this function in a try/catch that would swallow or rethrow it as a different error type.
 */
export async function withTenantFairness<T>(job: FairnessJobHandle, options: TenantFairnessOptions, run: () => Promise<T>): Promise<T | undefined> {
  const maxConcurrent = options.maxConcurrentPerTenant ?? DEFAULT_TENANT_FAIRNESS_MAX_CONCURRENT;
  const redelayMs = options.redelayMs ?? DEFAULT_TENANT_FAIRNESS_REDELAY_MS;
  const ttlSeconds = options.counterTtlSeconds ?? DEFAULT_TENANT_FAIRNESS_COUNTER_TTL_SECONDS;

  if (!options.tenantId) return run();
  const redis = getClient();
  if (!redis) return run();

  const key = fairnessKey(options.queueClass, options.tenantId);

  let count: number;
  try {
    count = await incrementFairnessCounter(redis, key, ttlSeconds);
  } catch {
    // Fail open -- see getClient()'s error handler comment.
    return run();
  }

  if (count > maxConcurrent) {
    // Over the cap: give back the slot this increment just reserved (we are not actually going to
    // run), then defer the job instead of blocking a worker slot on it.
    await decrementFairnessCounter(redis, key, ttlSeconds).catch(() => undefined);
    await job.moveToDelayed(Date.now() + redelayMs, job.token);
    throw new DelayedError();
  }

  try {
    return await run();
  } finally {
    await decrementFairnessCounter(redis, key, ttlSeconds).catch(() => undefined);
  }
}
