import { beforeEach, describe, expect, it, vi } from "vitest";

// A minimal in-memory fake standing in for ioredis -- real enough to exercise
// checkRateLimit's fixed-window counter logic (incr/expire/ttl) without a live Redis.
class FakeRedis {
  store = new Map<string, { count: number; expiresAt: number; hasExplicitExpiry: boolean }>();
  async incr(key: string) {
    const now = Date.now();
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt <= now) {
      // No real TTL yet (hasExplicitExpiry: false) -- a placeholder far-future expiresAt just
      // keeps get()/ttl() sane before the real EXPIRE call runs, mirroring how a real Redis key
      // created by a bare INCR has no TTL at all until something sets one.
      this.store.set(key, { count: 1, expiresAt: now + 999_000, hasExplicitExpiry: false });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }
  async expire(key: string, seconds: number) {
    const entry = this.store.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + seconds * 1000;
      entry.hasExplicitExpiry = true;
    }
  }
  async ttl(key: string) {
    const entry = this.store.get(key);
    if (!entry) return -2;
    return Math.max(1, Math.round((entry.expiresAt - Date.now()) / 1000));
  }
  async get(key: string) {
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt <= Date.now()) return null;
    return String(entry.count);
  }
  on() {}

  // F29 fix (WP11): checkRateLimit/recordRateLimitViolation now use a single MULTI/EXEC
  // (INCR + EXPIRE ... NX [+ TTL]) instead of two separate round trips, so this fake needs a
  // `.multi()` chain that mimics ioredis's own shape closely enough to exercise that real code
  // path -- a real Redis MULTI/EXEC returns an array of [error, result] tuples, one per queued
  // command, which is what callers destructure.
  multi() {
    const ops: Array<() => Promise<unknown>> = [];
    const chain = {
      incr: (key: string) => {
        ops.push(() => this.incr(key));
        return chain;
      },
      expire: (key: string, seconds: number, flag?: string) => {
        ops.push(async () => {
          const entry = this.store.get(key);
          // NX: only set the TTL if this key doesn't already have a REAL (explicitly-set) one --
          // mirrors real Redis EXPIRE ... NX semantics, and is exactly the behavior this fix
          // relies on (a key that somehow ended up with no TTL still gets one fixed here).
          if (flag === "NX" && entry?.hasExplicitExpiry) return 0;
          await this.expire(key, seconds);
          return 1;
        });
        return chain;
      },
      ttl: (key: string) => {
        ops.push(() => this.ttl(key));
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

  // F23 fix (WP11): getActiveRateLimitViolationSnapshot scans for "ratelimit-violations:*" keys
  // and reads their current values -- a single-page fake (real ioredis SCAN is cursor-paginated;
  // this fake just returns everything in one page and a "0" cursor, which is exactly what real
  // Redis does once a scan has covered the whole keyspace).
  async scan(_cursor: string, _matchFlag: string, pattern: string) {
    const now = Date.now();
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    const keys = [...this.store.keys()].filter((key) => regex.test(key) && (this.store.get(key)?.expiresAt ?? 0) > now);
    return ["0", keys] as [string, string[]];
  }

  async mget(...keys: string[]) {
    return keys.map((key) => {
      const entry = this.store.get(key);
      return entry && entry.expiresAt > Date.now() ? String(entry.count) : null;
    });
  }
}

const fakeRedisInstance = new FakeRedis();
const alertMocks = vi.hoisted(() => ({ alertAbuseThresholdCrossed: vi.fn().mockResolvedValue(undefined) }));

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(function RedisMock() {
    return fakeRedisInstance;
  }),
}));
vi.mock("@/lib/server/abuse-alerts", () => alertMocks);

process.env.REDIS_URL = "redis://localhost:6379";

import {
  checkRateLimit,
  checkRateLimitWithAlert,
  assertGeneralRateLimit,
  peekRateLimit,
  getActiveRateLimitViolationSnapshot,
  RateLimitExceededError,
  resetRateLimitMemoryForTests,
} from "@/lib/server/rate-limit";

beforeEach(() => {
  fakeRedisInstance.store.clear();
  alertMocks.alertAbuseThresholdCrossed.mockClear();
});

describe("checkRateLimit", () => {
  it("allows requests within the limit and reports remaining correctly", async () => {
    const first = await checkRateLimit({ key: "test:a", limit: 3, windowSeconds: 60 });
    expect(first).toMatchObject({ allowed: true, remaining: 2 });
    const second = await checkRateLimit({ key: "test:a", limit: 3, windowSeconds: 60 });
    expect(second).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("blocks once the limit is exceeded", async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit({ key: "test:b", limit: 3, windowSeconds: 60 });
    const blocked = await checkRateLimit({ key: "test:b", limit: 3, windowSeconds: 60 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("scopes independently by key -- one key's usage never affects another's", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit({ key: "test:c1", limit: 3, windowSeconds: 60 });
    const other = await checkRateLimit({ key: "test:c2", limit: 3, windowSeconds: 60 });
    expect(other.allowed).toBe(true);
  });

  // F29 fix (WP11): previously INCR and EXPIRE were two separate round trips -- a crash (or a
  // Redis failover) between them could leave a counter key with a real count but NO expiry at
  // all, pinning it above its limit forever with no way for the window to ever reset. Simulates
  // exactly that stuck state, then confirms the new atomic MULTI (INCR + EXPIRE ... NX) self-
  // heals it on the very next call, since EXPIRE ... NX still fires when there's no real TTL yet.
  it("self-heals a counter that was somehow left without a TTL (the crash-between-incr-and-expire scenario)", async () => {
    fakeRedisInstance.store.set("ratelimit:test:stuck", { count: 3, expiresAt: Date.now() + 999_000, hasExplicitExpiry: false });
    const result = await checkRateLimit({ key: "test:stuck", limit: 3, windowSeconds: 60 });
    expect(result.resetSeconds).toBeLessThanOrEqual(60);
    expect(fakeRedisInstance.store.get("ratelimit:test:stuck")?.hasExplicitExpiry).toBe(true);
  });
});

describe("peekRateLimit", () => {
  it("reports the current count without incrementing it -- calling it repeatedly never trips the limit by itself", async () => {
    await checkRateLimit({ key: "test:peek", limit: 3, windowSeconds: 60 }); // count = 1
    for (let i = 0; i < 5; i++) {
      const peek = await peekRateLimit({ key: "test:peek", limit: 3, windowSeconds: 60 });
      expect(peek).toMatchObject({ allowed: true, remaining: 2 });
    }
  });

  it("reflects allowed=false once a real (incrementing) check has pushed the count to the limit", async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit({ key: "test:peek2", limit: 3, windowSeconds: 60 });
    const peek = await peekRateLimit({ key: "test:peek2", limit: 3, windowSeconds: 60 });
    expect(peek.allowed).toBe(false);
  });

  it("reports allowed=true with the full limit remaining for a key that's never been touched", async () => {
    const peek = await peekRateLimit({ key: "test:peek-fresh", limit: 5, windowSeconds: 60 });
    expect(peek).toMatchObject({ allowed: true, remaining: 5 });
  });
});

describe("checkRateLimitWithAlert", () => {
  it("fires an abuse alert exactly once, on the 5th violation within the window", async () => {
    for (let i = 0; i < 4; i++) {
      await checkRateLimitWithAlert({ key: "test:d", limit: 0, windowSeconds: 60, tenantId: "tenant-a", category: "TEST", detail: "d" });
    }
    expect(alertMocks.alertAbuseThresholdCrossed).not.toHaveBeenCalled();

    await checkRateLimitWithAlert({ key: "test:d", limit: 0, windowSeconds: 60, tenantId: "tenant-a", category: "TEST", detail: "d" });
    expect(alertMocks.alertAbuseThresholdCrossed).toHaveBeenCalledTimes(1);
    expect(alertMocks.alertAbuseThresholdCrossed).toHaveBeenCalledWith("tenant-a", "TEST", "d");

    // A 6th violation in the same window must not re-fire the alert.
    await checkRateLimitWithAlert({ key: "test:d", limit: 0, windowSeconds: 60, tenantId: "tenant-a", category: "TEST", detail: "d" });
    expect(alertMocks.alertAbuseThresholdCrossed).toHaveBeenCalledTimes(1);
  });

  it("never fires an alert when the underlying limit isn't actually exceeded", async () => {
    for (let i = 0; i < 10; i++) {
      await checkRateLimitWithAlert({ key: "test:e", limit: 100, windowSeconds: 60, tenantId: "tenant-a", category: "TEST", detail: "e" });
    }
    expect(alertMocks.alertAbuseThresholdCrossed).not.toHaveBeenCalled();
  });

  it("does not track violations without a tenantId (no tenant to attribute an alert to)", async () => {
    for (let i = 0; i < 6; i++) {
      await checkRateLimitWithAlert({ key: "test:f", limit: 0, windowSeconds: 60, tenantId: null, category: "TEST", detail: "f" });
    }
    expect(alertMocks.alertAbuseThresholdCrossed).not.toHaveBeenCalled();
  });
});

describe("assertGeneralRateLimit", () => {
  it("does not throw when well under both the per-user and per-tenant limits", async () => {
    await expect(assertGeneralRateLimit({ id: "user-1", tenantId: "tenant-a" })).resolves.toBeUndefined();
  });

  it("throws RateLimitExceededError once the per-user limit is exceeded", async () => {
    for (let i = 0; i < 300; i++) {
      await checkRateLimit({ key: "general:user:user-2", limit: 300, windowSeconds: 60 });
    }
    await expect(assertGeneralRateLimit({ id: "user-2", tenantId: "tenant-a" })).rejects.toBeInstanceOf(RateLimitExceededError);
  });

  it("skips the per-tenant check entirely when the user has no tenant", async () => {
    await expect(assertGeneralRateLimit({ id: "user-3", tenantId: null })).resolves.toBeUndefined();
  });

  // F29 fix (WP11): the old flat 1,000/min tenant ceiling was only 4 requests/user/minute for
  // the capacity revision's own 250-user largest-tenant target -- a single active user's normal
  // navigation could approach that on its own. The new ceiling (250 users * 20 requests/user/min
  // = 5,000/min) must comfortably survive many DIFFERENT users in the same tenant each making
  // ordinary requests, while still being a real, finite ceiling (not effectively unlimited).
  it("the per-tenant ceiling comfortably covers many distinct users in a 250-user tenant making ordinary requests", async () => {
    // 250 distinct users, 15 requests each (below the per-user limit of 300, and below the
    // "20 requests/user/minute" planning assumption) = 3,750 total -- must all succeed.
    for (let u = 0; u < 250; u += 1) {
      for (let i = 0; i < 15; i += 1) {
        await expect(assertGeneralRateLimit({ id: `capacity-user-${u}`, tenantId: "capacity-tenant" })).resolves.toBeUndefined();
      }
    }
  });

  it("the per-tenant ceiling is still finite -- enough distinct users eventually trip it", async () => {
    // 5,000 total requests (the new ceiling) spread across many users should trip the NEXT one.
    for (let u = 0; u < 250; u += 1) {
      for (let i = 0; i < 20; i += 1) {
        await checkRateLimit({ key: `general:user:finite-user-${u}`, limit: 300, windowSeconds: 60 });
        await checkRateLimit({ key: "general:tenant:finite-tenant", limit: 5000, windowSeconds: 60 });
      }
    }
    await expect(assertGeneralRateLimit({ id: "finite-user-250", tenantId: "finite-tenant" })).rejects.toBeInstanceOf(RateLimitExceededError);
  });
});

// F23 fix (WP11): /dashboard/admin/rate-limits previously called an API route that didn't exist,
// silently showing 0. There is no persistent violation log in this app, so this reads a real,
// live snapshot of currently-active violation counters instead of fabricating a history.
describe("getActiveRateLimitViolationSnapshot", () => {
  it("reports zero and scanned=true when there are no active violations", async () => {
    const snapshot = await getActiveRateLimitViolationSnapshot();
    expect(snapshot).toEqual({ scanned: true, totalActive: 0, byTenant: [], byCategory: [] });
  });

  it("aggregates active violation counters by tenant and by category", async () => {
    await checkRateLimitWithAlert({ key: "snap:a", limit: 0, windowSeconds: 60, tenantId: "tenant-x", category: "LOGIN", detail: "a" });
    await checkRateLimitWithAlert({ key: "snap:b", limit: 0, windowSeconds: 60, tenantId: "tenant-x", category: "LOGIN", detail: "b" });
    await checkRateLimitWithAlert({ key: "snap:c", limit: 0, windowSeconds: 60, tenantId: "tenant-y", category: "GENERAL_TENANT", detail: "c" });

    const snapshot = await getActiveRateLimitViolationSnapshot();
    expect(snapshot.scanned).toBe(true);
    expect(snapshot.totalActive).toBe(3);
    expect(snapshot.byTenant).toEqual(
      expect.arrayContaining([
        { tenantId: "tenant-x", violationCount: 2 },
        { tenantId: "tenant-y", violationCount: 1 },
      ]),
    );
    expect(snapshot.byCategory).toEqual(
      expect.arrayContaining([
        { category: "LOGIN", violationCount: 2 },
        { category: "GENERAL_TENANT", violationCount: 1 },
      ]),
    );
  });

  it("does not count an expired violation counter", async () => {
    fakeRedisInstance.store.set("ratelimit-violations:tenant-expired:LOGIN", {
      count: 9,
      expiresAt: Date.now() - 1000,
      hasExplicitExpiry: true,
    });
    const snapshot = await getActiveRateLimitViolationSnapshot();
    expect(snapshot.byTenant.find((row) => row.tenantId === "tenant-expired")).toBeUndefined();
  });
});

describe("when Redis is unreachable (round-2 plan S9)", () => {
  it("keeps limiting with an in-process counter instead of allowing everything", async () => {
    resetRateLimitMemoryForTests();
    const multi = vi.spyOn(fakeRedisInstance as any, "multi").mockImplementation(() => {
      throw new Error("connect ECONNREFUSED");
    });
    const get = vi.spyOn(fakeRedisInstance as any, "get").mockRejectedValue(new Error("connect ECONNREFUSED"));
    try {
      for (let i = 0; i < 3; i++) expect((await checkRateLimit({ key: "login:down", limit: 3, windowSeconds: 60 })).allowed).toBe(true);
      expect((await checkRateLimit({ key: "login:down", limit: 3, windowSeconds: 60 })).allowed).toBe(false);
      expect((await peekRateLimit({ key: "login:down", limit: 3, windowSeconds: 60 })).allowed).toBe(false);
      expect((await peekRateLimit({ key: "login:other", limit: 3, windowSeconds: 60 })).allowed).toBe(true);
    } finally {
      multi.mockRestore();
      get.mockRestore();
    }
  });
});
