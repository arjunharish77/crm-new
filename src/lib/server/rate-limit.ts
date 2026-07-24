import Redis from "ioredis";

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

/** Best-effort client IP extraction behind a reverse proxy (Caddy sets X-Forwarded-For). */
export function clientIpFromRequest(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
