import { describe, expect, it } from "vitest";
import { serverError } from "@/lib/server/http";
import { RateLimitExceededError } from "@/lib/server/rate-limit";

// WP11 (F29): serverError's second (error) parameter is the single choke point that maps
// RateLimitExceededError -> a real 429+Retry-After and "IMPERSONATION_BLOCKED:*" -> a real 403,
// across every one of this app's ~340 route handlers, without each needing its own
// `error.message === "..."` branch. A catch block that calls `serverError(message)` without
// forwarding the caught error silently defeats BOTH mappings (and the diagnostic console.error
// logging) -- confirmed as a real, repeated bug at 57 call sites across 40+ files, all fixed in
// this pass. These tests cover the shared choke point itself, not each of the 57 call sites
// individually (the fix at each site is the same one-line pattern).
describe("serverError", () => {
  it("maps a RateLimitExceededError to 429 with Retry-After, only when the error is actually forwarded", async () => {
    const err = new RateLimitExceededError(42);
    const response = serverError("Failed to do the thing", err);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
  });

  it("silently defeats the RateLimitExceededError mapping when the error isn't forwarded (the exact bug this fix closes)", async () => {
    const err = new RateLimitExceededError(42);
    const response = serverError("Failed to do the thing"); // error omitted, as the buggy call sites did
    expect(response.status).toBe(500); // NOT 429 -- proves why forwarding the error matters
    void err;
  });

  it("maps an IMPERSONATION_BLOCKED error to 403 with a readable action name", async () => {
    const err = new Error("IMPERSONATION_BLOCKED:payout_approved");
    const response = serverError("Failed", err);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.message).toContain("payout approved");
  });

  it("falls back to a generic 500 for an ordinary error", async () => {
    const response = serverError("Failed to fetch leads", new Error("ECONNREFUSED"));
    expect(response.status).toBe(500);
  });

  it("still returns 500 with no error at all (e.g. a bare catch {})", async () => {
    const response = serverError("Failed to fetch leads");
    expect(response.status).toBe(500);
  });
});
