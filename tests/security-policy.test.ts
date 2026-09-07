import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);

import { getEffectiveSecurityPolicy, getOrCreateSecurityPolicy, updateSecurityPolicy, DEFAULT_SECURITY_POLICY } from "@/lib/server/security-policy";

beforeEach(() => {
  dbMocks.query.mockReset();
  dbMocks.queryOne.mockReset();
  dbMocks.execute.mockReset();
});

describe("getEffectiveSecurityPolicy", () => {
  it("returns the hardcoded defaults when neither a tenant-specific nor a global policy row exists", async () => {
    dbMocks.query.mockResolvedValueOnce([]);
    const policy = await getEffectiveSecurityPolicy("tenant-a");
    expect(policy).toEqual(DEFAULT_SECURITY_POLICY);
  });

  it("prefers a tenant-specific row over the global row when both exist", async () => {
    dbMocks.query.mockResolvedValueOnce([
      { tenantId: "tenant-a", maxLoginAttempts: 3 },
      { tenantId: null, maxLoginAttempts: 10 },
    ]);
    const policy = await getEffectiveSecurityPolicy("tenant-a");
    expect(policy.maxLoginAttempts).toBe(3);
  });

  it("falls back to the global row when no tenant-specific row exists", async () => {
    dbMocks.query.mockResolvedValueOnce([{ tenantId: null, maxLoginAttempts: 10 }]);
    const policy = await getEffectiveSecurityPolicy("tenant-a");
    expect(policy.maxLoginAttempts).toBe(10);
  });

  it("uses only the global-row query shape when tenantId is null", async () => {
    dbMocks.query.mockResolvedValueOnce([]);
    await getEffectiveSecurityPolicy(null);
    expect(dbMocks.query.mock.calls[0][0]).toContain('"tenantId" is null');
    expect(dbMocks.query.mock.calls[0][1]).toEqual([]);
  });
});

describe("getOrCreateSecurityPolicy", () => {
  it("returns the existing row for a real tenantId without inserting", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "policy-1", tenantId: "tenant-a" });
    const policy = await getOrCreateSecurityPolicy("tenant-a");
    expect(policy).toMatchObject({ id: "policy-1" });
    expect(dbMocks.execute).not.toHaveBeenCalled();
  });

  it('treats "global" as a real sentinel for a null tenantId', async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "policy-global", tenantId: null });
    await getOrCreateSecurityPolicy("global");
    expect(dbMocks.queryOne.mock.calls[0][0]).toContain('"tenantId" is null');
  });

  it("creates a new row on first access for a tenant with no policy yet", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "policy-new", tenantId: "tenant-b" });
    const policy = await getOrCreateSecurityPolicy("tenant-b");
    expect(policy).toMatchObject({ id: "policy-new" });
  });
});

describe("updateSecurityPolicy", () => {
  it("only updates whitelisted fields present in the patch", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "policy-1", tenantId: "tenant-a" }) // getOrCreateSecurityPolicy
      .mockResolvedValueOnce({ id: "policy-1", tenantId: "tenant-a", maxLoginAttempts: 3 });

    await updateSecurityPolicy("tenant-a", { maxLoginAttempts: 3, notARealColumn: "ignored" });

    const updateCall = dbMocks.queryOne.mock.calls[1];
    expect(updateCall[0]).toContain('"maxLoginAttempts" = $1');
    expect(updateCall[0]).not.toContain("notARealColumn");
  });

  it("returns the unmodified current policy when the patch has no whitelisted fields", async () => {
    // getOrCreateSecurityPolicy is called twice on this path: once as the "ensure a row
    // exists" guard, once again to fetch-and-return since there's nothing to update.
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "policy-1", tenantId: "tenant-a" })
      .mockResolvedValueOnce({ id: "policy-1", tenantId: "tenant-a" });
    const result = await updateSecurityPolicy("tenant-a", { notARealColumn: "x" });
    expect(result).toMatchObject({ id: "policy-1" });
    expect(dbMocks.execute).not.toHaveBeenCalled();
  });
});
