import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ requireCurrentUser: vi.fn() }));
vi.mock("@/lib/server/auth", () => authMocks);

const distributionMocks = vi.hoisted(() => ({ bulkReassignRecordOwners: vi.fn() }));
vi.mock("@/lib/server/distribution-engine", () => distributionMocks);

import { POST } from "@/app/api/assignment/reassign/bulk/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/assignment/reassign/bulk", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Gap checklist Module 10's tests bullet -- "bulk action validation."
describe("POST /api/assignment/reassign/bulk validation", () => {
  beforeEach(() => {
    authMocks.requireCurrentUser.mockReset().mockResolvedValue({ id: "user-1", tenantId: "tenant-1" });
    distributionMocks.bulkReassignRecordOwners.mockReset().mockResolvedValue({ succeeded: 1, failed: 0 });
  });

  it("rejects a request missing entityType", async () => {
    const res = await POST(makeRequest({ entityIds: ["1"], newOwnerId: "u2", reason: "rebalance" }));
    expect(res.status).toBe(400);
    expect(distributionMocks.bulkReassignRecordOwners).not.toHaveBeenCalled();
  });

  it("rejects a request with an empty entityIds array", async () => {
    const res = await POST(makeRequest({ entityType: "LEAD", entityIds: [], newOwnerId: "u2", reason: "rebalance" }));
    expect(res.status).toBe(400);
    expect(distributionMocks.bulkReassignRecordOwners).not.toHaveBeenCalled();
  });

  it("rejects a request where entityIds is not an array", async () => {
    const res = await POST(makeRequest({ entityType: "LEAD", entityIds: "not-an-array", newOwnerId: "u2", reason: "rebalance" }));
    expect(res.status).toBe(400);
  });

  it("rejects a request missing newOwnerId", async () => {
    const res = await POST(makeRequest({ entityType: "LEAD", entityIds: ["1"], reason: "rebalance" }));
    expect(res.status).toBe(400);
  });

  it("rejects a request missing reason", async () => {
    const res = await POST(makeRequest({ entityType: "LEAD", entityIds: ["1"], newOwnerId: "u2" }));
    expect(res.status).toBe(400);
  });

  it("rejects more than 500 entityIds at once", async () => {
    const ids = Array.from({ length: 501 }, (_, i) => String(i));
    const res = await POST(makeRequest({ entityType: "LEAD", entityIds: ids, newOwnerId: "u2", reason: "rebalance" }));
    expect(res.status).toBe(400);
    expect(distributionMocks.bulkReassignRecordOwners).not.toHaveBeenCalled();
  });

  it("allows exactly 500 entityIds", async () => {
    const ids = Array.from({ length: 500 }, (_, i) => String(i));
    const res = await POST(makeRequest({ entityType: "LEAD", entityIds: ids, newOwnerId: "u2", reason: "rebalance" }));
    expect(res.status).toBe(200);
    expect(distributionMocks.bulkReassignRecordOwners).toHaveBeenCalledTimes(1);
  });

  it("requires a tenant context", async () => {
    authMocks.requireCurrentUser.mockResolvedValueOnce({ id: "user-1", tenantId: null });
    const res = await POST(makeRequest({ entityType: "LEAD", entityIds: ["1"], newOwnerId: "u2", reason: "rebalance" }));
    expect(res.status).toBe(403);
    expect(distributionMocks.bulkReassignRecordOwners).not.toHaveBeenCalled();
  });

  it("returns 401 when the caller isn't authenticated", async () => {
    authMocks.requireCurrentUser.mockRejectedValueOnce(new Error("UNAUTHORIZED"));
    const res = await POST(makeRequest({ entityType: "LEAD", entityIds: ["1"], newOwnerId: "u2", reason: "rebalance" }));
    expect(res.status).toBe(401);
  });

  it("passes a valid request straight through to bulkReassignRecordOwners with coerced string ids", async () => {
    const res = await POST(makeRequest({ entityType: "LEAD", entityIds: [1, 2, 3], newOwnerId: "u2", reason: "rebalance" }));
    expect(res.status).toBe(200);
    expect(distributionMocks.bulkReassignRecordOwners).toHaveBeenCalledWith(
      { id: "user-1", tenantId: "tenant-1" },
      "LEAD",
      ["1", "2", "3"],
      { newOwnerId: "u2", reason: "rebalance" },
    );
  });
});
