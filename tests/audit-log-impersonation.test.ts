import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn().mockResolvedValue(undefined) }));
const rateLimitMocks = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/rate-limit", () => rateLimitMocks);

import { createAuditLog } from "@/lib/repositories/leads-postgres";

beforeEach(() => {
  dbMocks.execute.mockClear();
  rateLimitMocks.checkRateLimit.mockReset().mockResolvedValue({ allowed: true, remaining: 19, resetSeconds: 600 });
});

describe("createAuditLog impersonation tagging", () => {
  it("tags an audit entry with impersonatedBy when the acting user is impersonating", async () => {
    const user = { id: "user-1", tenantId: "tenant-a", isImpersonating: true, impersonatedBy: "admin-1" };
    await createAuditLog(user, "UPDATE", "LEAD", "lead-1", null, { name: "New" }, null);

    const [, values] = dbMocks.execute.mock.calls[0];
    const metadata = values[9];
    expect(metadata).toEqual({ impersonatedBy: "admin-1" });
  });

  it("leaves metadata null for an ordinary, non-impersonated action", async () => {
    const user = { id: "user-1", tenantId: "tenant-a" };
    await createAuditLog(user, "UPDATE", "LEAD", "lead-1", null, { name: "New" }, null);

    const [, values] = dbMocks.execute.mock.calls[0];
    expect(values[9]).toBeNull();
  });

  it("leaves metadata null when isImpersonating is true but impersonatedBy is missing (defensive)", async () => {
    const user = { id: "user-1", tenantId: "tenant-a", isImpersonating: true, impersonatedBy: null };
    await createAuditLog(user, "UPDATE", "LEAD", "lead-1", null, { name: "New" }, null);

    const [, values] = dbMocks.execute.mock.calls[0];
    expect(values[9]).toBeNull();
  });
});

describe("createAuditLog anomaly flagging", () => {
  const user = { id: "user-1", tenantId: "tenant-a" };

  it("does not flag the entry when under the rate-based threshold", async () => {
    rateLimitMocks.checkRateLimit.mockResolvedValueOnce({ allowed: true, remaining: 5, resetSeconds: 600 });
    await createAuditLog(user, "DELETE", "LEAD", "lead-1", null, null, null);
    expect(dbMocks.execute).toHaveBeenCalledTimes(1); // only the insert, no flag update
  });

  it("flags the entry when the same user exceeds the action-velocity threshold", async () => {
    rateLimitMocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetSeconds: 600 });
    await createAuditLog(user, "DELETE", "LEAD", "lead-1", null, null, null);
    expect(dbMocks.execute).toHaveBeenCalledTimes(2);
    const [sql, values] = dbMocks.execute.mock.calls[1];
    expect(sql).toContain("flagged = true");
    expect(values[1]).toEqual(expect.any(String)); // the AuditLog row's own id
  });

  it("keys the anomaly check per user and action", async () => {
    await createAuditLog(user, "DELETE", "LEAD", "lead-1", null, null, null);
    expect(rateLimitMocks.checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: "audit-anomaly:user-1:DELETE" }),
    );
  });

  it("never lets an anomaly-check failure break the audit write itself", async () => {
    rateLimitMocks.checkRateLimit.mockRejectedValueOnce(new Error("redis down"));
    await expect(createAuditLog(user, "DELETE", "LEAD", "lead-1", null, null, null)).resolves.toBeUndefined();
  });
});
