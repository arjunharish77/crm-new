// F26/F27 fix (WP16): none of this app's public-facing POST routes (lead capture, OTP send,
// admin login) had any rate limiting at all -- a scripted client could flood-insert fake leads,
// force real OTP emails (a per-send cost via ZeptoMail) at will, or brute-force an admin
// password with no throttling whatsoever.
//
// This is an in-memory, single-process fixed-window counter -- it resets on restart and is NOT
// shared across multiple instances of this app. That's an accepted limitation for this app's
// current single-instance deployment (see deploy/vps/docker-compose.yml); if it's ever run with
// more than one instance behind a load balancer, this needs to move to a shared store (e.g.
// Postgres or Redis), the same way the main CRM app's own rate limiter already does.
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(category: string, key: string, limit: number, windowMs: number) {
  const bucketKey = `${category}:${key}`;
  const now = Date.now();
  const existing = buckets.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  existing.count += 1;
  return { allowed: existing.count <= limit, remaining: Math.max(0, limit - existing.count), resetAt: existing.resetAt };
}

// Bounds the map's size across a long-running process instead of growing forever.
function cleanupExpiredBuckets() {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

const cleanupTimer = setInterval(cleanupExpiredBuckets, 5 * 60 * 1000);
cleanupTimer.unref?.();

// Same-origin app sits behind the VPS's reverse proxy (see deploy/vps/), which sets this header;
// falls back to a constant so an unproxied dev/test request still buckets consistently instead
// of throwing.
export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
