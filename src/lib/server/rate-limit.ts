import Redis from "ioredis";
import { alertAbuseThresholdCrossed } from "@/lib/server/abuse-alerts";

let client: Redis | null | undefined;

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

function getClient(): Redis | null {
  if (client !== undefined) return client;
  const connection = redisConnection();
  if (!connection) {
    client = null;
    return client;
  }
  client = new Redis({ ...connection, lazyConnect: true, maxRetriesPerRequest: 1 });
  client.on("error", () => {
    // Swallowed intentionally: when Redis is unavailable the limiter falls back to an
    // in-process counter (see memoryFallback below) instead of failing the request.
  });
  return client;
}

export interface RateLimitOptions {
  /** Unique key for the thing being limited, e.g. `login:<ip>` or `form-submit:<formId>:<ip>`. */
  key: string;
  /** Max allowed requests within the window. */
  limit: number;
  /** Window size in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets, for a Retry-After header. */
  resetSeconds: number;
}

// Round-2 plan S9: when Redis is configured but unreachable, limits used to be skipped
// entirely, so sign-in, two-factor and reset attempts became unlimited during an outage. They now
// fall back to a per-process fixed-window counter: looser than the shared one (each server process
// counts on its own) but never "unlimited" and never "locked out".
const memoryWindows = new Map<string, { count: number; resetAt: number }>();

function memoryFallback(key: string, limit: number, windowSeconds: number, increment: boolean): RateLimitResult {
  const now = Date.now();
  if (memoryWindows.size > 10_000) {
    for (const [entryKey, entry] of memoryWindows) if (entry.resetAt <= now) memoryWindows.delete(entryKey);
  }
  let entry = memoryWindows.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowSeconds * 1000 };
    if (increment) memoryWindows.set(key, entry);
  }
  if (increment) entry.count += 1;
  const resetSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  const allowed = increment ? entry.count <= limit : entry.count < limit;
  return { allowed, remaining: Math.max(0, limit - entry.count), resetSeconds };
}

/** Test hook: clears the in-process fallback counters. */
export function resetRateLimitMemoryForTests() {
  memoryWindows.clear();
}

/**
 * Fixed-window counter backed by Redis (already required for BullMQ, so no new
 * infra dependency). With REDIS_URL unset (local development) nothing is limited; if Redis is
 * set but unreachable, an in-process counter takes over (S9).
 */
export async function checkRateLimit({ key, limit, windowSeconds }: RateLimitOptions): Promise<RateLimitResult> {
  const redis = getClient();
  if (!redis) {
    return { allowed: true, remaining: limit, resetSeconds: windowSeconds };
  }

  const redisKey = `ratelimit:${key}`;
  try {
    // F29 fix (WP11): INCR and EXPIRE were previously two separate round trips -- if the
    // process crashed (or Redis failed over) between them, a key created by that INCR would be
    // left with NO expiry at all, permanently pinning that counter above its limit (or, if the
    // count happened to reset via some other path, silently losing the window semantics
    // entirely). A single MULTI/EXEC makes both changes atomic from Redis's perspective, and
    // `EXPIRE ... NX` (only set the TTL if the key doesn't already have one) means this is safe
    // to run on every call, not just when `count === 1` -- so even a key that somehow ended up
    // without a TTL from a prior failure gets one fixed on the very next increment.
    const results = await redis.multi().incr(redisKey).expire(redisKey, windowSeconds, "NX").ttl(redisKey).exec();
    if (!results) throw new Error("Redis MULTI returned null (connection likely in a bad state)");
    const [[incrError, count], , [ttlError, ttl]] = results as [
      [Error | null, number],
      [Error | null, number],
      [Error | null, number],
    ];
    if (incrError) throw incrError;
    if (ttlError) throw ttlError;
    const resetSeconds = ttl > 0 ? ttl : windowSeconds;
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetSeconds,
    };
  } catch {
    return memoryFallback(redisKey, limit, windowSeconds, true);
  }
}

/**
 * Read-only counterpart to checkRateLimit -- reports the current count without incrementing.
 * Needed for account-lockout semantics specifically: a login attempt should be REJECTED before
 * ever touching the password (so a locked-out attacker can't keep probing), then the counter
 * only INCREMENTS on an actual failed password check (a successful login shouldn't count
 * against the lockout budget). checkRateLimit's own INCR-on-every-call semantics can't express
 * "check without counting," so this is a distinct function, not a flag on the existing one.
 */
export async function peekRateLimit({ key, limit, windowSeconds }: RateLimitOptions): Promise<RateLimitResult> {
  const redis = getClient();
  if (!redis) {
    return { allowed: true, remaining: limit, resetSeconds: windowSeconds };
  }
  const redisKey = `ratelimit:${key}`;
  try {
    const [countRaw, ttl] = await Promise.all([redis.get(redisKey), redis.ttl(redisKey)]);
    const count = Number(countRaw ?? 0);
    const resetSeconds = ttl > 0 ? ttl : windowSeconds;
    return { allowed: count < limit, remaining: Math.max(0, limit - count), resetSeconds };
  } catch {
    return memoryFallback(redisKey, limit, windowSeconds, false);
  }
}

/** Best-effort client IP extraction behind a reverse proxy (Caddy sets X-Forwarded-For). */
export function clientIpFromRequest(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

// Thrown by the various *RateLimit* helpers below so a single choke point (serverError, see
// http.ts) can map it to a real 429 + Retry-After across the whole app, without every one of
// this codebase's ~340 route handlers needing an individual `error.message === "RATE_LIMITED"`
// check added to its own catch block.
export class RateLimitExceededError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("RATE_LIMITED");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// "Abuse alerting": a rate limit merely blocking the offending request is silent by design
// (checkRateLimit itself has no side effects beyond the counter) -- this is the separate,
// explicit opt-in a caller makes when a REPEATED pattern of hits, not a single one, should
// actually notify someone. Tracked as its own Redis counter (independent of the rate-limit
// counter itself, which resets every window) so "5 violations in the last 10 minutes" survives
// across several separate rate-limit windows. Fires at most once per 10-minute window (the
// violation counter's own TTL) -- an ongoing hammering doesn't re-notify on every single hit.
async function recordRateLimitViolation(tenantId: string | null, category: string, detail: string) {
  if (!tenantId) return;
  const redis = getClient();
  if (!redis) return;
  const key = `ratelimit-violations:${tenantId}:${category}`;
  try {
    // F29 fix (WP11): same atomic INCR+EXPIRE-NX fix as checkRateLimit above -- see its comment
    // for why the previous separate-round-trips version could leave this counter without a TTL.
    const results = await redis.multi().incr(key).expire(key, 600, "NX").exec();
    if (!results) throw new Error("Redis MULTI returned null (connection likely in a bad state)");
    const [[incrError, count]] = results as [[Error | null, number]];
    if (incrError) throw incrError;
    if (count === 5) await alertAbuseThresholdCrossed(tenantId, category, detail);
  } catch {
    // Best-effort, same fail-open philosophy as checkRateLimit itself.
  }
}

// F23 fix (WP11): /dashboard/admin/rate-limits previously called an API route that didn't exist
// at all, silently showing 0 for everything. There is no PERSISTENT rate-limit violation log in
// this codebase (recordRateLimitViolation's own counters above are intentionally ephemeral,
// 10-minute fixed windows, by design -- see its own comment), so a genuine "last 24h" history
// cannot be built without adding one. Rather than fabricate a number this system doesn't track,
// this returns a real, honestly-scoped snapshot of CURRENTLY ACTIVE violation counters (i.e.
// "who's being rate-limited right now, in roughly the last 10 minutes") -- true, live data, just
// with a narrower time window than "last 24h" implies. The caller must present this as a live
// snapshot, not a 24h history (see the API route's own response shape/the frontend's label).
export async function getActiveRateLimitViolationSnapshot(): Promise<{
  scanned: boolean;
  totalActive: number;
  byTenant: Array<{ tenantId: string; violationCount: number }>;
  byCategory: Array<{ category: string; violationCount: number }>;
}> {
  const redis = getClient();
  if (!redis) return { scanned: false, totalActive: 0, byTenant: [], byCategory: [] };

  const tenantCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "ratelimit-violations:*", "COUNT", 200);
      cursor = nextCursor;
      if (keys.length) {
        const values = await redis.mget(...keys);
        keys.forEach((key, index) => {
          const count = Number(values[index] ?? 0);
          if (!count) return;
          const [, tenantId, ...categoryParts] = key.split(":");
          const category = categoryParts.join(":");
          if (tenantId) tenantCounts.set(tenantId, (tenantCounts.get(tenantId) ?? 0) + count);
          if (category) categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + count);
        });
      }
    } while (cursor !== "0");
  } catch {
    return { scanned: false, totalActive: 0, byTenant: [], byCategory: [] };
  }

  const byTenant = [...tenantCounts.entries()]
    .map(([tenantId, violationCount]) => ({ tenantId, violationCount }))
    .sort((a, b) => b.violationCount - a.violationCount);
  const byCategory = [...categoryCounts.entries()]
    .map(([category, violationCount]) => ({ category, violationCount }))
    .sort((a, b) => b.violationCount - a.violationCount);

  return {
    scanned: true,
    totalActive: byTenant.reduce((sum, row) => sum + row.violationCount, 0),
    byTenant,
    byCategory,
  };
}

export async function checkRateLimitWithAlert(opts: RateLimitOptions & { tenantId: string | null; category: string; detail: string }) {
  const result = await checkRateLimit(opts);
  if (!result.allowed) await recordRateLimitViolation(opts.tenantId, opts.category, opts.detail);
  return result;
}

// "General per-user/per-tenant limit independent of a specific credential" -- the gap the
// existing per-API-key/per-app/login-throttling limits didn't cover: an ordinary logged-in
// session hammering the app. This is an abuse ceiling, not a normal-usage budget. Wired into
// requireCurrentUser (auth.ts), the single choke point nearly every session-authenticated route
// already calls.
const GENERAL_USER_LIMIT = 300;

// F29 fix (WP11): the previous flat 1,000/min tenant ceiling didn't scale to the capacity
// revision's own largest-tenant target (25_AUDIT_REMEDIATION_PLAN.md: 250 active users at peak)
// -- 1,000/min across 250 concurrent users is only 4 requests/user/minute, which a single active
// user's normal navigation could approach on its own. No real production traffic has been
// measured yet (pre-launch), so this is a reasoned ceiling, not a measured one: 250 users at a
// generous 20 requests/user/minute of genuine UI activity (list loads, dashboard widgets,
// autosave, polling) is 5,000/min -- comfortably above ordinary navigation for the whole tenant
// at once, while still being a real, bounded abuse ceiling rather than "effectively unlimited."
// Revisit with real measured request-rate data once this is running in production (the audit's
// own F29/F21 acceptance criteria both call for exactly that measurement).
const CAPACITY_LARGEST_TENANT_ACTIVE_USERS = 250;
const CAPACITY_REASONABLE_REQUESTS_PER_USER_PER_MINUTE = 20;
const GENERAL_TENANT_LIMIT = CAPACITY_LARGEST_TENANT_ACTIVE_USERS * CAPACITY_REASONABLE_REQUESTS_PER_USER_PER_MINUTE;

export async function assertGeneralRateLimit(user: { id: string; tenantId: string | null }) {
  const userResult = await checkRateLimitWithAlert({
    key: `general:user:${user.id}`,
    limit: GENERAL_USER_LIMIT,
    windowSeconds: 60,
    tenantId: user.tenantId,
    category: "GENERAL_USER",
    detail: `user ${user.id}`,
  });
  if (!userResult.allowed) throw new RateLimitExceededError(userResult.resetSeconds);

  if (user.tenantId) {
    const tenantResult = await checkRateLimitWithAlert({
      key: `general:tenant:${user.tenantId}`,
      limit: GENERAL_TENANT_LIMIT,
      windowSeconds: 60,
      tenantId: user.tenantId,
      category: "GENERAL_TENANT",
      detail: `tenant ${user.tenantId}`,
    });
    if (!tenantResult.allowed) throw new RateLimitExceededError(tenantResult.resetSeconds);
  }
}
