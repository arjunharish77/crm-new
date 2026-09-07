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
    // Swallowed intentionally — rate limiting fails open (see checkRateLimit below)
    // rather than taking down request handling if Redis is briefly unavailable.
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

/**
 * Fixed-window counter backed by Redis (already required for BullMQ, so no new
 * infra dependency). Fails OPEN if Redis is unreachable or REDIS_URL is unset —
 * a rate-limit outage should degrade to "unlimited," never to "locked out."
 */
export async function checkRateLimit({ key, limit, windowSeconds }: RateLimitOptions): Promise<RateLimitResult> {
  const redis = getClient();
  if (!redis) {
    return { allowed: true, remaining: limit, resetSeconds: windowSeconds };
  }

  const redisKey = `ratelimit:${key}`;
  try {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }
    const ttl = await redis.ttl(redisKey);
    const resetSeconds = ttl > 0 ? ttl : windowSeconds;
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetSeconds,
    };
  } catch {
    return { allowed: true, remaining: limit, resetSeconds: windowSeconds };
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
    return { allowed: true, remaining: limit, resetSeconds: windowSeconds };
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
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 600);
    if (count === 5) await alertAbuseThresholdCrossed(tenantId, category, detail);
  } catch {
    // Best-effort, same fail-open philosophy as checkRateLimit itself.
  }
}

export async function checkRateLimitWithAlert(opts: RateLimitOptions & { tenantId: string | null; category: string; detail: string }) {
  const result = await checkRateLimit(opts);
  if (!result.allowed) await recordRateLimitViolation(opts.tenantId, opts.category, opts.detail);
  return result;
}

// "General per-user/per-tenant limit independent of a specific credential" -- the gap the
// existing per-API-key/per-app/login-throttling limits didn't cover: an ordinary logged-in
// session hammering the app. Deliberately generous (300/min per user, 1000/min per tenant --
// ~5-16/sec sustained) so no realistic UI usage trips it; this is an abuse ceiling, not a
// normal-usage budget. Wired into requireCurrentUser (auth.ts), the single choke point nearly
// every session-authenticated route already calls.
const GENERAL_USER_LIMIT = 300;
const GENERAL_TENANT_LIMIT = 1000;

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
