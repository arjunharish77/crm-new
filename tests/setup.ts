import { vi } from "vitest";

// Vitest already sets NODE_ENV to "test" by default; no need to assign it here
// (its type is declared read-only, and reassigning it isn't necessary).
process.env.JWT_SECRET = "test-jwt-secret-do-not-use-in-prod";
process.env.DATA_ACCESS_MODE = "postgres";

// F21 fix (WP11): this whole suite is fully mocked and hermetic by design (no test opens a real
// DB/Redis connection) -- rate-limit.ts's own fail-open-when-Redis-is-unreachable behavior is
// exactly what makes that true today. But that only holds if REDIS_URL is actually unset; if a
// developer's shell (or a future CI job) happens to export a real, reachable REDIS_URL, the rate
// limiter silently starts enforcing for real, and since tests don't reset Redis between cases, a
// counter tripped by an earlier test can fail a later, unrelated one with a genuine 429 --
// reproduced directly while building WP11's CI workflow. Unsetting it here makes hermeticity an
// invariant of this suite, not an accident of whatever environment happens to run it.
delete process.env.REDIS_URL;

// getCurrentUser() falls back to next/headers's cookies() when no bearer token is
// present; that API is only valid inside a real Next.js request scope. Stub it so any
// test that accidentally exercises the cookie-fallback branch degrades to "no session"
// instead of crashing the whole file.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}));
