import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);

import {
  updateAuditLogReview,
  setAuditLogLegalHold,
  addAuditLogComment,
  listAuditLogComments,
} from "@/lib/server/audit-review";

const user = { id: "user-1", tenantId: "tenant-a", isTenantAdmin: true };
const nonAdmin = { id: "user-2", tenantId: "tenant-a", isTenantAdmin: false };

beforeEach(() => {
  dbMocks.query.mockReset().mockResolvedValue([]);
  dbMocks.queryOne.mockReset();
  dbMocks.execute.mockReset().mockResolvedValue(undefined);
});

describe("updateAuditLogReview", () => {
  it("throws when the log doesn't exist in this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(updateAuditLogReview(user, "log-1", { reviewStatus: "IN_REVIEW" })).rejects.toThrow("AUDIT_LOG_NOT_FOUND");
  });

  it("is a no-op when the patch is empty, without a wasted update query", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "log-1" });
    const result = await updateAuditLogReview(user, "log-1", {});
    expect(result).toEqual({ id: "log-1" });
    expect(dbMocks.queryOne).toHaveBeenCalledTimes(1); // only the existence check
  });

  it("sets reviewerId without touching reviewStatus", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "log-1" }).mockResolvedValueOnce({ id: "log-1" });
    await updateAuditLogReview(user, "log-1", { reviewerId: "reviewer-1" });
    const [sql, values] = dbMocks.queryOne.mock.calls[1];
    expect(sql).toContain('"reviewerId" = $1');
    expect(sql).not.toContain('"reviewStatus"');
    expect(values).toEqual(["reviewer-1", "log-1"]);
  });

  it("stamps reviewedBy/reviewedAt only when transitioning to RESOLVED", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "log-1" }).mockResolvedValueOnce({ id: "log-1" });
    await updateAuditLogReview(user, "log-1", { reviewStatus: "RESOLVED" });
    const [sql] = dbMocks.queryOne.mock.calls[1];
    expect(sql).toContain('"reviewStatus" = $1');
    expect(sql).toContain('"reviewedBy" = $2');
    expect(sql).toContain('"reviewedAt" = $3');
  });

  it("does not stamp reviewedBy/reviewedAt for a non-RESOLVED status", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "log-1" }).mockResolvedValueOnce({ id: "log-1" });
    await updateAuditLogReview(user, "log-1", { reviewStatus: "IN_REVIEW" });
    const [sql] = dbMocks.queryOne.mock.calls[1];
    expect(sql).not.toContain('"reviewedBy"');
    expect(sql).not.toContain('"reviewedAt"');
  });

  it("allows clearing the reviewer by passing null", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "log-1" }).mockResolvedValueOnce({ id: "log-1" });
    await updateAuditLogReview(user, "log-1", { reviewerId: null });
    const [, values] = dbMocks.queryOne.mock.calls[1];
    expect(values).toEqual([null, "log-1"]);
  });
});

describe("setAuditLogLegalHold", () => {
  it("throws when the log doesn't exist in this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(setAuditLogLegalHold(user, "log-1", true)).rejects.toThrow("AUDIT_LOG_NOT_FOUND");
  });

  it("updates the legalHold flag scoped to the caller's tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "log-1" });
    await setAuditLogLegalHold(user, "log-1", true);
    expect(dbMocks.queryOne).toHaveBeenCalledWith(expect.stringContaining('"legalHold" = $1'), [true, "log-1", "tenant-a"]);
  });
});

describe("addAuditLogComment / listAuditLogComments", () => {
  it("throws when the target log doesn't exist in this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(addAuditLogComment(user, "log-1", "hello")).rejects.toThrow("AUDIT_LOG_NOT_FOUND");
  });

  it("rejects a blank/whitespace-only comment", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "log-1" });
    await expect(addAuditLogComment(user, "log-1", "   ")).rejects.toThrow("COMMENT_REQUIRED");
  });

  it("inserts a trimmed comment on success", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "log-1" });
    const { id } = await addAuditLogComment(user, "log-1", "  Looks fine  ");
    expect(id).toEqual(expect.any(String));
    expect(dbMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('insert into "AuditLogComment"'),
      [expect.any(String), "tenant-a", "log-1", "user-1", "Looks fine", expect.any(String)],
    );
  });

  it("lists comments oldest-first, scoped to the tenant", async () => {
    await listAuditLogComments(user, "log-1");
    const [sql, params] = dbMocks.query.mock.calls[0];
    expect(sql).toContain('order by c."createdAt" asc');
    expect(params).toEqual(["log-1", "tenant-a"]);
  });
});

// Reviewing the audit log is an admin task (it was open to any signed-in user).
describe("audit review needs an admin", () => {
  it("rejects a non-admin before touching the database", async () => {
    const { updateAuditLogReview, addAuditLogComment, listAuditLogComments, setAuditLogLegalHold } = await import("@/lib/server/audit-review");
    await expect(updateAuditLogReview(nonAdmin, "log-1", { reviewStatus: "RESOLVED" })).rejects.toThrow("FORBIDDEN");
    await expect(addAuditLogComment(nonAdmin, "log-1", "hi")).rejects.toThrow("FORBIDDEN");
    await expect(listAuditLogComments(nonAdmin, "log-1")).rejects.toThrow("FORBIDDEN");
    await expect(setAuditLogLegalHold(nonAdmin, "log-1", true)).rejects.toThrow("FORBIDDEN");
  });
});
