import { beforeEach, describe, expect, it, vi } from "vitest";
import { DelayedError } from "bullmq";

// A minimal in-memory fake standing in for ioredis -- same shape/philosophy as
// tests/rate-limit.test.ts's FakeRedis (this file's INCR+EXPIRE-NX counter logic is the same
// atomic pattern, just applied to a per-tenant concurrency count instead of a rate-limit window),
// extended with DECR since job-fairness.ts's counter goes both up (on admission) and down (on
// completion/failure).
class FakeRedis {
  store = new Map<string, { count: number; expiresAt: number; hasExplicitExpiry: boolean }>();

  async incr(key: string) {
    const now = Date.now();
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt <= now) {
      this.store.set(key, { count: 1, expiresAt: now + 999_000, hasExplicitExpiry: false });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }

  async decr(key: string) {
    const now = Date.now();
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt <= now) {
      this.store.set(key, { count: -1, expiresAt: now + 999_000, hasExplicitExpiry: false });
      return -1;
    }
    entry.count -= 1;
    return entry.count;
  }

  async expire(key: string, seconds: number) {
    const entry = this.store.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + seconds * 1000;
      entry.hasExplicitExpiry = true;
    }
  }

  on() {}

  // Mirrors ioredis's real MULTI/EXEC shape (array of [error, result] tuples) closely enough to
  // exercise job-fairness.ts's actual `redis.multi().incr(...).expire(..., "NX").exec()` /
  // `redis.multi().decr(...).expire(..., "NX").exec()` code paths.
  multi() {
    const ops: Array<() => Promise<unknown>> = [];
    const chain = {
      incr: (key: string) => {
        ops.push(() => this.incr(key));
        return chain;
      },
      decr: (key: string) => {
        ops.push(() => this.decr(key));
        return chain;
      },
      expire: (key: string, seconds: number, flag?: string) => {
        ops.push(async () => {
          const entry = this.store.get(key);
          if (flag === "NX" && entry?.hasExplicitExpiry) return 0;
          await this.expire(key, seconds);
          return 1;
        });
        return chain;
      },
      exec: async () => {
        const results: Array<[null, unknown]> = [];
        for (const op of ops) results.push([null, await op()]);
        return results;
      },
    };
    return chain;
  }

  count(key: string): number {
    const entry = this.store.get(key);
    return entry ? entry.count : 0;
  }
}

const fakeRedisInstance = new FakeRedis();

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(function RedisMock() {
    return fakeRedisInstance;
  }),
}));

process.env.REDIS_URL = "redis://localhost:6379";

import { withTenantFairness, __resetJobFairnessClientForTests, type FairnessJobHandle } from "@/lib/server/job-fairness";

function makeJob(): FairnessJobHandle & { moveToDelayed: ReturnType<typeof vi.fn> } {
  return {
    token: "test-token",
    moveToDelayed: vi.fn().mockResolvedValue(true),
  };
}

beforeEach(() => {
  fakeRedisInstance.store.clear();
  __resetJobFairnessClientForTests();
});

describe("withTenantFairness", () => {
  it("runs a tenant's job immediately when it is under the concurrency cap", async () => {
    const job = makeJob();
    const run = vi.fn().mockResolvedValue("done");

    const result = await withTenantFairness(job, { queueClass: "heavy", tenantId: "tenant-a", maxConcurrentPerTenant: 2 }, run);

    expect(result).toBe("done");
    expect(run).toHaveBeenCalledTimes(1);
    expect(job.moveToDelayed).not.toHaveBeenCalled();
  });

  it("defers the job (via moveToDelayed + DelayedError) once the tenant is at the concurrency cap, without running it", async () => {
    // Simulate two of this tenant's heavy jobs already in flight (never decremented, as if still running).
    fakeRedisInstance.store.set("job-fairness:heavy:tenant-a", { count: 2, expiresAt: Date.now() + 999_000, hasExplicitExpiry: true });

    const job = makeJob();
    const run = vi.fn().mockResolvedValue("should not run");

    await expect(withTenantFairness(job, { queueClass: "heavy", tenantId: "tenant-a", maxConcurrentPerTenant: 2, redelayMs: 5_000 }, run)).rejects.toBeInstanceOf(
      DelayedError,
    );

    expect(run).not.toHaveBeenCalled();
    expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
    const [timestamp, token] = job.moveToDelayed.mock.calls[0];
    expect(timestamp).toBeGreaterThanOrEqual(Date.now());
    expect(timestamp).toBeLessThanOrEqual(Date.now() + 6_000);
    expect(token).toBe("test-token");

    // The reservation this call made was given back -- the counter is restored to the
    // already-in-flight count, not left inflated by the rejected admission attempt.
    expect(fakeRedisInstance.count("job-fairness:heavy:tenant-a")).toBe(2);
  });

  it("admits exactly maxConcurrentPerTenant concurrent jobs for one tenant and defers the next", async () => {
    const admitted: Array<Promise<unknown>> = [];
    const jobs = [makeJob(), makeJob(), makeJob()];
    const runs = [vi.fn().mockResolvedValue("a"), vi.fn().mockResolvedValue("b"), vi.fn().mockResolvedValue("c")];

    // Three "arrivals" for the same tenant, cap=2 -- do NOT await between them, so all three
    // increment before any decrements happen (mirrors three genuinely concurrent job starts).
    const p0 = withTenantFairness(jobs[0], { queueClass: "heavy", tenantId: "tenant-b", maxConcurrentPerTenant: 2 }, () => new Promise((resolve) => setTimeout(() => resolve(runs[0]()), 5)));
    const p1 = withTenantFairness(jobs[1], { queueClass: "heavy", tenantId: "tenant-b", maxConcurrentPerTenant: 2 }, () => new Promise((resolve) => setTimeout(() => resolve(runs[1]()), 5)));
    const p2 = withTenantFairness(jobs[2], { queueClass: "heavy", tenantId: "tenant-b", maxConcurrentPerTenant: 2 }, runs[2]);
    admitted.push(p0, p1);

    await expect(p2).rejects.toBeInstanceOf(DelayedError);
    expect(runs[2]).not.toHaveBeenCalled();
    expect(jobs[2].moveToDelayed).toHaveBeenCalledTimes(1);

    await Promise.all(admitted);
    expect(runs[0]).toHaveBeenCalledTimes(1);
    expect(runs[1]).toHaveBeenCalledTimes(1);
  });

  it("decrements the counter after the wrapped function completes successfully", async () => {
    const job = makeJob();
    await withTenantFairness(job, { queueClass: "heavy", tenantId: "tenant-c", maxConcurrentPerTenant: 2 }, async () => "ok");
    expect(fakeRedisInstance.count("job-fairness:heavy:tenant-c")).toBe(0);
  });

  it("decrements the counter after the wrapped function throws -- not just on success", async () => {
    const job = makeJob();
    const boom = new Error("export processor blew up");

    await expect(withTenantFairness(job, { queueClass: "heavy", tenantId: "tenant-d", maxConcurrentPerTenant: 2 }, async () => { throw boom; })).rejects.toBe(boom);

    expect(fakeRedisInstance.count("job-fairness:heavy:tenant-d")).toBe(0);
  });

  it("allows a second job to run once the first one's counter has been decremented (success path)", async () => {
    const jobA = makeJob();
    const jobB = makeJob();
    await withTenantFairness(jobA, { queueClass: "heavy", tenantId: "tenant-e", maxConcurrentPerTenant: 1 }, async () => "done-a");

    const runB = vi.fn().mockResolvedValue("done-b");
    const resultB = await withTenantFairness(jobB, { queueClass: "heavy", tenantId: "tenant-e", maxConcurrentPerTenant: 1 }, runB);

    expect(resultB).toBe("done-b");
    expect(runB).toHaveBeenCalledTimes(1);
    expect(jobB.moveToDelayed).not.toHaveBeenCalled();
  });

  it("allows a second job to run once the first one's counter has been decremented (error path)", async () => {
    const jobA = makeJob();
    const jobB = makeJob();
    await expect(
      withTenantFairness(jobA, { queueClass: "heavy", tenantId: "tenant-f", maxConcurrentPerTenant: 1 }, async () => {
        throw new Error("first job failed");
      }),
    ).rejects.toThrow("first job failed");

    const runB = vi.fn().mockResolvedValue("done-b");
    const resultB = await withTenantFairness(jobB, { queueClass: "heavy", tenantId: "tenant-f", maxConcurrentPerTenant: 1 }, runB);

    expect(resultB).toBe("done-b");
    expect(jobB.moveToDelayed).not.toHaveBeenCalled();
  });

  it("fails open (runs immediately, no Redis touched) when there is no tenantId to attribute", async () => {
    const job = makeJob();
    const run = vi.fn().mockResolvedValue("ran anyway");

    const result = await withTenantFairness(job, { queueClass: "heavy", tenantId: null }, run);

    expect(result).toBe("ran anyway");
    expect(run).toHaveBeenCalledTimes(1);
    expect(job.moveToDelayed).not.toHaveBeenCalled();
    expect(fakeRedisInstance.store.size).toBe(0);
  });

  it("scopes the concurrency cap independently per tenant -- one tenant at its cap does not affect another", async () => {
    fakeRedisInstance.store.set("job-fairness:heavy:tenant-busy", { count: 2, expiresAt: Date.now() + 999_000, hasExplicitExpiry: true });

    const job = makeJob();
    const run = vi.fn().mockResolvedValue("quiet tenant runs fine");

    const result = await withTenantFairness(job, { queueClass: "heavy", tenantId: "tenant-quiet", maxConcurrentPerTenant: 2 }, run);

    expect(result).toBe("quiet tenant runs fine");
    expect(job.moveToDelayed).not.toHaveBeenCalled();
  });
});
