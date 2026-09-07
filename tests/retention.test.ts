import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);

import {
  getOrCreateDataRetentionPolicyForTenantId,
  updateDataRetentionPolicyForTenantId,
  enforceDataRetentionForTenant,
  processDueDataRetentionEnforcement,
} from "@/lib/repositories/retention-postgres";

function policyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "policy-1",
    tenantId: "tenant-a",
    leadRetentionDays: 365,
    opportunityRetentionDays: 730,
    activityRetentionDays: 180,
    auditLogRetentionDays: 90,
    deletedRecordsRetentionDays: 30,
    marketplaceAppLogRetentionDays: 90,
    lastEnforcedAt: null,
    ...overrides,
  };
}

describe("data retention policy CRUD", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
  });

  describe("getOrCreateDataRetentionPolicyForTenantId", () => {
    it("returns the existing policy without inserting", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(policyRow());
      const policy = await getOrCreateDataRetentionPolicyForTenantId("tenant-a");
      expect(policy).toEqual(policyRow());
      expect(dbMocks.queryOne).toHaveBeenCalledTimes(1);
    });

    it("creates a policy row with column defaults when none exists", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null).mockResolvedValueOnce(policyRow());
      const policy = await getOrCreateDataRetentionPolicyForTenantId("tenant-a");
      expect(policy).toBeTruthy();
      expect(String(dbMocks.queryOne.mock.calls[1][0])).toContain('insert into "DataRetentionPolicy"');
    });
  });

  describe("updateDataRetentionPolicyForTenantId", () => {
    it("rejects a non-positive retention value", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(policyRow()); // ensure-exists call
      await expect(updateDataRetentionPolicyForTenantId("tenant-a", { leadRetentionDays: 0 })).rejects.toThrow("INVALID_LEADRETENTIONDAYS");
    });

    it("updates only the provided fields", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce(policyRow()) // ensure-exists call
        .mockResolvedValueOnce(policyRow({ leadRetentionDays: 180 }));
      const updated = await updateDataRetentionPolicyForTenantId("tenant-a", { leadRetentionDays: 180 });
      expect((updated as any).leadRetentionDays).toBe(180);
    });
  });
});

describe("enforceDataRetentionForTenant", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
  });

  it("returns all-zero counts when the tenant has no policy configured", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    const result = await enforceDataRetentionForTenant("tenant-a");
    expect(result).toEqual({ leadsAnonymized: 0, opportunitiesAnonymized: 0, activitiesAnonymized: 0, auditLogsDeleted: 0, fieldDefinitionsPurged: 0, marketplaceAppLogsPurged: 0 });
    expect(dbMocks.execute).not.toHaveBeenCalled();
  });

  it("anonymizes Leads/Opportunities/Activities past their cutoff and hard-deletes aged AuditLog/FieldDefinition/marketplace-app-log rows", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(policyRow());
    dbMocks.execute
      .mockResolvedValueOnce(3) // leads
      .mockResolvedValueOnce(2) // opportunities
      .mockResolvedValueOnce(5) // activities
      .mockResolvedValueOnce(10) // audit logs
      .mockResolvedValueOnce(1) // field definitions
      .mockResolvedValueOnce(4) // marketplace app delivery logs
      .mockResolvedValueOnce(0); // lastEnforcedAt stamp

    const result = await enforceDataRetentionForTenant("tenant-a");

    expect(result).toEqual({
      leadsAnonymized: 3,
      opportunitiesAnonymized: 2,
      activitiesAnonymized: 5,
      auditLogsDeleted: 10,
      fieldDefinitionsPurged: 1,
      marketplaceAppLogsPurged: 4,
    });

    const leadCall = dbMocks.execute.mock.calls[0];
    expect(String(leadCall[0])).toContain("[Retained data purged]");
    expect(String(leadCall[0])).toContain('"mergedIntoId" is null');

    const auditCall = dbMocks.execute.mock.calls[3];
    expect(String(auditCall[0])).toContain('delete from "AuditLog"');
    expect(String(auditCall[0])).toContain('"legalHold" = false'); // retention exceptions: a held row survives the purge

    const marketplaceLogCall = dbMocks.execute.mock.calls[5];
    expect(String(marketplaceLogCall[0])).toContain('delete from "TenantAppDelivery"');
    expect(String(marketplaceLogCall[0])).toContain("status = 'UNINSTALLED'");

    const stampCall = dbMocks.execute.mock.calls[6];
    expect(String(stampCall[0])).toContain('"lastEnforcedAt"');
  });
});

describe("processDueDataRetentionEnforcement", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
  });

  it("enforces retention once per tenant that has a policy row", async () => {
    dbMocks.query.mockResolvedValueOnce([{ tenantId: "tenant-a" }, { tenantId: "tenant-b" }]);
    dbMocks.queryOne.mockResolvedValueOnce(policyRow({ tenantId: "tenant-a" })).mockResolvedValueOnce(policyRow({ tenantId: "tenant-b" }));

    const result = await processDueDataRetentionEnforcement(25);

    expect(result.processed).toHaveLength(2);
    expect(result.processed[0].tenantId).toBe("tenant-a");
    expect(result.processed[1].tenantId).toBe("tenant-b");
  });
});
