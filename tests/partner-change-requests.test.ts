import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const moduleMocks = vi.hoisted(() => ({ assertModuleEnabled: vi.fn().mockResolvedValue(undefined) }));
const crmMocks = vi.hoisted(() => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
const partnersMocks = vi.hoisted(() => ({
  getPartnerProfileForUser: vi.fn(),
  updatePartnerProfileForTenant: vi.fn().mockResolvedValue({ id: "profile-1" }),
}));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/module-entitlements", () => moduleMocks);
vi.mock("@/lib/server/crm", () => crmMocks);
vi.mock("@/lib/server/partners", () => partnersMocks);

import {
  approvePartnerChangeRequest,
  listMyPartnerChangeRequests,
  listPendingPartnerChangeRequestsForTenant,
  rejectPartnerChangeRequest,
  submitPartnerChangeRequest,
} from "@/lib/server/partner-change-requests";

const partnerUser = { id: "partner-user-1", tenantId: "tenant-1", isPartner: true };
const adminUser = { id: "admin-1", tenantId: "tenant-1", isTenantAdmin: true };

// Gap checklist Module 10's "approval inbox" item, "partner changes" sub-item -- the one named
// domain confirmed to have no approval concept at all before this pass.
describe("submitPartnerChangeRequest", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    partnersMocks.getPartnerProfileForUser.mockReset();
    crmMocks.createAuditLog.mockClear();
  });

  it("throws PARTNER_PROFILE_NOT_FOUND when the caller has no partner profile", async () => {
    partnersMocks.getPartnerProfileForUser.mockResolvedValueOnce(null);
    await expect(submitPartnerChangeRequest(partnerUser, { legalBusinessName: "New Name" })).rejects.toThrow("PARTNER_PROFILE_NOT_FOUND");
  });

  it("throws NO_PROPOSED_CHANGES when nothing proposable is included", async () => {
    partnersMocks.getPartnerProfileForUser.mockResolvedValueOnce({ id: "profile-1" });
    await expect(submitPartnerChangeRequest(partnerUser, { canAccessPayouts: true })).rejects.toThrow("NO_PROPOSED_CHANGES");
  });

  it("only carries proposable fields through, dropping anything else silently", async () => {
    partnersMocks.getPartnerProfileForUser.mockResolvedValueOnce({ id: "profile-1" });
    dbMocks.queryOne.mockResolvedValueOnce({ id: "request-1", proposedChanges: { legalBusinessName: "New Name" }, status: "PENDING" });

    await submitPartnerChangeRequest(partnerUser, { legalBusinessName: "New Name", canAccessPayouts: true, partnerLoginRole: "MANAGER" });

    const insertCall = dbMocks.queryOne.mock.calls[0];
    expect(insertCall[1][4]).toEqual({ legalBusinessName: "New Name" });
  });
});

describe("approvePartnerChangeRequest / rejectPartnerChangeRequest", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    partnersMocks.updatePartnerProfileForTenant.mockClear().mockResolvedValue({ id: "profile-1" });
    crmMocks.createAuditLog.mockClear();
  });

  it("throws PARTNER_CHANGE_REQUEST_NOT_PENDING on a double-decision (atomic claim)", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null); // update matched 0 rows -- already decided
    await expect(approvePartnerChangeRequest(adminUser, "request-1")).rejects.toThrow("PARTNER_CHANGE_REQUEST_NOT_PENDING");
    expect(partnersMocks.updatePartnerProfileForTenant).not.toHaveBeenCalled();
  });

  it("approving applies the proposed changes via the existing admin-edit path, not a second write path", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({
      id: "request-1", partnerProfileId: "profile-1", proposedChanges: { legalBusinessName: "New Name" }, status: "APPROVED",
    });

    await approvePartnerChangeRequest(adminUser, "request-1", "looks good");

    expect(partnersMocks.updatePartnerProfileForTenant).toHaveBeenCalledWith(adminUser, "profile-1", { legalBusinessName: "New Name" });
  });

  it("rejecting never touches the partner profile", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "request-1", partnerProfileId: "profile-1", status: "REJECTED" });
    await rejectPartnerChangeRequest(adminUser, "request-1", "not needed");
    expect(partnersMocks.updatePartnerProfileForTenant).not.toHaveBeenCalled();
  });
});

describe("listPendingPartnerChangeRequestsForTenant / listMyPartnerChangeRequests", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    partnersMocks.getPartnerProfileForUser.mockReset();
  });

  it("lists every tenant's own pending requests for the admin inbox", async () => {
    dbMocks.query.mockResolvedValueOnce([{ id: "request-1", status: "PENDING" }]);
    const result = await listPendingPartnerChangeRequestsForTenant(adminUser);
    expect(result).toHaveLength(1);
    expect(dbMocks.query.mock.calls[0][0]).toContain("status = 'PENDING'");
  });

  it("returns an empty list for a partner with no profile yet, without a wasted query", async () => {
    partnersMocks.getPartnerProfileForUser.mockResolvedValueOnce(null);
    expect(await listMyPartnerChangeRequests(partnerUser)).toEqual([]);
    expect(dbMocks.query).not.toHaveBeenCalled();
  });
});
