import { beforeEach, describe, expect, it, vi } from "vitest";

// A minimal in-memory fake standing in for ioredis -- real enough to exercise
// checkRateLimit's fixed-window counter logic (incr/expire/ttl) without a live Redis.
class FakeRedis {
  store = new Map<string, { count: number; expiresAt: number }>();
  async incr(key: string) {
    const now = Date.now();
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt <= now) {
      this.store.set(key, { count: 1, expiresAt: now + 999_000 });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }
  async expire(key: string, seconds: number) {
    const entry = this.store.get(key);
    if (entry) entry.expiresAt = Date.now() + seconds * 1000;
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

import { checkRateLimit, checkRateLimitWithAlert, assertGeneralRateLimit, peekRateLimit, RateLimitExceededError } from "@/lib/server/rate-limit";

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
});
