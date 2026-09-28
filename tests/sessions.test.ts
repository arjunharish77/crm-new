import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const query = vi.fn();
  const queryOne = vi.fn();
  const execute = vi.fn();
  return { query, queryOne, execute, queryAsSystem: query, queryOneAsSystem: queryOne, executeAsSystem: execute };
});
const policyMocks = vi.hoisted(() => ({ getEffectiveSecurityPolicy: vi.fn() }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/security-policy", () => policyMocks);

import {
  createUserSession,
  validateSession,
  listSessionsForUser,
  revokeSession,
  revokeAllOtherSessions,
  touchSessionIfStale,
  assertNotImpersonating,
  markImpersonationSessionReviewed,
  countAuditActionsDuringSession,
} from "@/lib/server/sessions";

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    tenantId: "tenant-a",
    userId: "user-1",
    userAgent: "test-agent",
    ipAddress: "1.2.3.4",
    isImpersonation: false,
    impersonatedBy: null,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    revokedAt: null,
    revokedBy: null,
    revokedReason: null,
    ...overrides,
  };
}

beforeEach(() => {
  dbMocks.query.mockReset();
  dbMocks.queryOne.mockReset();
  dbMocks.execute.mockReset().mockResolvedValue(undefined);
  policyMocks.getEffectiveSecurityPolicy.mockReset().mockResolvedValue({
    sessionTimeoutMinutes: 60,
    maxConcurrentSessions: 3,
    enforceSessionTimeout: true,
  });
});

describe("createUserSession", () => {
  it("creates a normal session with a 7-day absolute expiry", async () => {
    dbMocks.query.mockResolvedValueOnce([]); // enforceMaxConcurrentSessions: no other active sessions
    const result = await createUserSession({ userId: "user-1", tenantId: "tenant-a", userAgent: "ua", ipAddress: "1.1.1.1" });
    expect(result.expiresInSeconds).toBeGreaterThan(6 * 24 * 60 * 60);
    expect(result.expiresInSeconds).toBeLessThanOrEqual(7 * 24 * 60 * 60);
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining('insert into "UserSession"'), expect.any(Array));
  });

  it("creates an impersonation session with a short 4-hour absolute expiry, and skips concurrent-session enforcement", async () => {
    const result = await createUserSession({ userId: "user-1", tenantId: "tenant-a", isImpersonation: true, impersonatedBy: "admin-1" });
    expect(result.expiresInSeconds).toBeLessThanOrEqual(4 * 60 * 60);
    expect(result.expiresInSeconds).toBeGreaterThan(3 * 60 * 60);
    // No enforceMaxConcurrentSessions query for impersonation sessions.
    expect(dbMocks.query).not.toHaveBeenCalled();
  });

  it("evicts the least-recently-active sessions beyond maxConcurrentSessions, keeping the most recent", async () => {
    dbMocks.query.mockResolvedValueOnce([{ id: "s-newest" }, { id: "s-middle" }, { id: "s-oldest" }]);
    policyMocks.getEffectiveSecurityPolicy.mockResolvedValueOnce({ sessionTimeoutMinutes: 60, maxConcurrentSessions: 2, enforceSessionTimeout: true });

    await createUserSession({ userId: "user-1", tenantId: "tenant-a" });

    const revokeCall = dbMocks.execute.mock.calls.find((call) => String(call[0]).includes("MAX_CONCURRENT_SESSIONS"));
    expect(revokeCall).toBeDefined();
    expect(revokeCall![1][1]).toEqual(["s-oldest"]);
  });
});

describe("validateSession", () => {
  it("is valid for a fresh, unrevoked, unexpired session", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(sessionRow());
    const result = await validateSession("session-1");
    expect(result.valid).toBe(true);
  });

  it("reports NOT_FOUND when no row exists", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    const result = await validateSession("missing");
    expect(result).toEqual({ valid: false, reason: "NOT_FOUND" });
  });

  it("reports REVOKED for an explicitly revoked session", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(sessionRow({ revokedAt: new Date().toISOString() }));
    const result = await validateSession("session-1");
    expect(result).toEqual({ valid: false, reason: "REVOKED" });
  });

  it("reports EXPIRED once past the absolute expiresAt", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(sessionRow({ expiresAt: new Date(Date.now() - 1000).toISOString() }));
    const result = await validateSession("session-1");
    expect(result).toEqual({ valid: false, reason: "EXPIRED" });
  });

  it("reports IDLE_TIMEOUT when lastActiveAt is older than the policy's sessionTimeoutMinutes", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(sessionRow({ lastActiveAt: new Date(Date.now() - 61 * 60 * 1000).toISOString() }));
    policyMocks.getEffectiveSecurityPolicy.mockResolvedValueOnce({ sessionTimeoutMinutes: 60, maxConcurrentSessions: 3, enforceSessionTimeout: true });
    const result = await validateSession("session-1");
    expect(result).toEqual({ valid: false, reason: "IDLE_TIMEOUT" });
  });

  it("does not apply idle timeout when enforceSessionTimeout is off, even if lastActiveAt is very stale", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(sessionRow({ lastActiveAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString() }));
    policyMocks.getEffectiveSecurityPolicy.mockResolvedValueOnce({ sessionTimeoutMinutes: 60, maxConcurrentSessions: 3, enforceSessionTimeout: false });
    const result = await validateSession("session-1");
    expect(result.valid).toBe(true);
  });

  it("skips idle-timeout policy checks entirely for an impersonation session", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(sessionRow({ isImpersonation: true, lastActiveAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString() }));
    const result = await validateSession("session-1");
    expect(result.valid).toBe(true);
    expect(policyMocks.getEffectiveSecurityPolicy).not.toHaveBeenCalled();
  });
});

describe("touchSessionIfStale", () => {
  it("updates lastActiveAt when the recorded value is stale enough", async () => {
    await touchSessionIfStale("session-1", new Date(Date.now() - 10 * 60 * 1000).toISOString());
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining("lastActiveAt"), expect.any(Array));
  });

  it("does not write when the recorded value is still fresh (debounced)", async () => {
    await touchSessionIfStale("session-1", new Date(Date.now() - 30 * 1000).toISOString());
    expect(dbMocks.execute).not.toHaveBeenCalled();
  });
});

describe("listSessionsForUser / revokeSession / revokeAllOtherSessions", () => {
  it("lists only unrevoked, unexpired sessions", async () => {
    dbMocks.query.mockResolvedValueOnce([sessionRow()]);
    const result = await listSessionsForUser("user-1");
    expect(result).toHaveLength(1);
    expect(dbMocks.query.mock.calls[0][0]).toContain('"revokedAt" is null');
  });

  it("revokeSession throws SESSION_NOT_FOUND when the row doesn't belong to this user or is already revoked", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(revokeSession("user-1", "session-1", "user-1")).rejects.toThrow("SESSION_NOT_FOUND");
  });

  it("revokeSession succeeds for an owned, active session", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "session-1" });
    await expect(revokeSession("user-1", "session-1", "user-1")).resolves.toBeUndefined();
  });

  it("revokeAllOtherSessions excludes the current session id from the revoke", async () => {
    await revokeAllOtherSessions("user-1", "session-current", "user-1");
    const call = dbMocks.execute.mock.calls[0];
    expect(call[0]).toContain("id <> $4");
    expect(call[1]).toEqual(expect.arrayContaining(["user-1", "session-current"]));
  });
});

describe("assertNotImpersonating", () => {
  it("throws a prefixed IMPERSONATION_BLOCKED error naming the action when impersonating", () => {
    expect(() => assertNotImpersonating({ isImpersonating: true }, "rotate_api_key")).toThrow("IMPERSONATION_BLOCKED:rotate_api_key");
  });

  it("does not throw for a normal (non-impersonating) user", () => {
    expect(() => assertNotImpersonating({ isImpersonating: false }, "rotate_api_key")).not.toThrow();
  });

  it("does not throw when isImpersonating is undefined (a normal session token)", () => {
    expect(() => assertNotImpersonating({}, "rotate_api_key")).not.toThrow();
  });
});

describe("markImpersonationSessionReviewed", () => {
  it("throws SESSION_NOT_FOUND when the row doesn't exist or isn't an impersonation session", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(markImpersonationSessionReviewed("session-1", "admin-1", "Looks fine")).rejects.toThrow("SESSION_NOT_FOUND");
  });

  it("succeeds and records the reviewing admin and note", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "session-1" });
    await expect(markImpersonationSessionReviewed("session-1", "admin-1", "Looks fine")).resolves.toBeUndefined();
    const call = dbMocks.queryOne.mock.calls[0];
    expect(call[1]).toEqual(expect.arrayContaining(["admin-1", "Looks fine", "session-1"]));
  });
});

describe("countAuditActionsDuringSession", () => {
  it("scopes the count to the session's own userId, time window, and impersonatedBy tag", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ count: "3" });
    const count = await countAuditActionsDuringSession({
      userId: "user-1",
      impersonatedBy: "admin-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      revokedAt: null,
      expiresAt: "2026-01-01T04:00:00.000Z",
    });
    expect(count).toBe(3);
    const call = dbMocks.queryOne.mock.calls[0];
    expect(call[1]).toEqual(["user-1", "2026-01-01T00:00:00.000Z", "2026-01-01T04:00:00.000Z", "admin-1"]);
  });

  it("uses revokedAt as the window end when the session was revoked before its natural expiry", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ count: "1" });
    await countAuditActionsDuringSession({
      userId: "user-1",
      impersonatedBy: "admin-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      revokedAt: "2026-01-01T01:00:00.000Z",
      expiresAt: "2026-01-01T04:00:00.000Z",
    });
    const call = dbMocks.queryOne.mock.calls[0];
    expect(call[1][2]).toBe("2026-01-01T01:00:00.000Z");
  });

  it("returns 0 when no audit rows match", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    const count = await countAuditActionsDuringSession({
      userId: "user-1",
      impersonatedBy: "admin-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      revokedAt: null,
      expiresAt: "2026-01-01T04:00:00.000Z",
    });
    expect(count).toBe(0);
  });
});
