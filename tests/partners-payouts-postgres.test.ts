import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();
const readPrivateFileMock = vi.fn();

vi.mock("@/lib/db/access-mode", () => ({
  isPostgresMode: () => true,
}));

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

vi.mock("@/lib/server/crm", () => ({
  createAuditLog: vi.fn(async () => null),
  automationConditionMatches: vi.fn(() => true),
}));

vi.mock("@/lib/storage/file-storage", () => ({
  readPrivateFile: readPrivateFileMock,
  writePrivateFile: vi.fn(async (path: string) => path),
}));

describe("direct Postgres partners, payouts, and invoices", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
    readPrivateFileMock.mockReset();
  });

  it("rolls multiple partner logins into one organization payout", async () => {
    queryOneMock
      .mockResolvedValueOnce({
        id: "settings-1",
        approvalMode: "MANUAL",
        minimumPayoutAmount: 0,
        autoApproveBelowAmount: null,
      })
      .mockResolvedValueOnce({
        id: "cycle-1",
        tenantId: "tenant-1",
        startDate: "2026-07-01T00:00:00.000Z",
        endDate: "2026-08-01T00:00:00.000Z",
      })
      .mockResolvedValueOnce({ userId: "partner-primary", partnerOrganizationId: "org-1", status: "ACTIVE" })
      .mockResolvedValueOnce({ userId: "partner-finance", partnerOrganizationId: "org-1", status: "ACTIVE" })
      .mockResolvedValueOnce({
        id: "payout-1",
        partnerId: "partner-primary",
        partnerOrganizationId: "org-1",
        totalCommissionAmount: 300,
        status: "DRAFT",
      });

    queryMock
      .mockResolvedValueOnce([
        { partnerId: "partner-primary", commissionAmount: 200, entryType: "EARNED" },
        { partnerId: "partner-finance", commissionAmount: 100, entryType: "EARNED" },
      ])
      .mockResolvedValueOnce([
        { userId: "partner-primary", partnerLoginRole: "PRIMARY", status: "ACTIVE" },
        { userId: "partner-finance", partnerLoginRole: "FINANCE", status: "ACTIVE" },
      ])
      .mockResolvedValueOnce([
        { userId: "partner-primary", partnerLoginRole: "PRIMARY", status: "ACTIVE" },
        { userId: "partner-finance", partnerLoginRole: "FINANCE", status: "ACTIVE" },
      ])
      .mockResolvedValueOnce([]);

    const { computePayoutsForCycle } = await import("@/lib/server/payouts");
    const payouts = await computePayoutsForCycle({ id: "admin-1", tenantId: "tenant-1" }, "cycle-1");

    expect(payouts).toHaveLength(1);
    expect(payouts?.[0]).toMatchObject({
      partnerId: "partner-primary",
      partnerOrganizationId: "org-1",
      totalCommissionAmount: 300,
    });
    expect(queryOneMock.mock.calls.at(-1)?.[0]).toContain('insert into "Payout"');
  });

  it("returns local invoice PDF bytes in Postgres mode", async () => {
    queryOneMock.mockResolvedValueOnce({
      id: "invoice-1",
      partnerId: "partner-primary",
      pdfStoragePath: "partner-invoices/tenant-1/partner-primary/invoice-1.pdf",
    }).mockResolvedValueOnce({
      storageKey: "partner-invoices/tenant-1/partner-primary/invoice-1.pdf",
      contentType: "application/pdf",
    });
    readPrivateFileMock.mockResolvedValueOnce(Buffer.from("%PDF-1.4"));

    const { getPartnerInvoicePdfSignedUrl } = await import("@/lib/server/partner-invoices");
    const result = await getPartnerInvoicePdfSignedUrl({ id: "partner-primary", tenantId: "tenant-1" }, "invoice-1");

    expect(result).toMatchObject({ partnerId: "partner-primary", contentType: "application/pdf" });
    expect((result as any).file.toString()).toBe("%PDF-1.4");
    expect(readPrivateFileMock).toHaveBeenCalledWith("partner-invoices/tenant-1/partner-primary/invoice-1.pdf");
  });

  it("matches payout targeting by team and sales group without Supabase", async () => {
    queryOneMock.mockResolvedValueOnce({ id: "user-1", teamId: "team-1" });

    const { userMatchesTargetingConfig } = await import("@/lib/server/partner-access");
    await expect(
      userMatchesTargetingConfig(
        "tenant-1",
        "user-1",
        { mode: "SELECTED", userIds: [], teamIds: ["team-1"], salesGroupIds: [], partnerOrganizationIds: [] },
        "ALL_PARTNERS",
      ),
    ).resolves.toBe(true);

    expect(queryOneMock.mock.calls[0][0]).toContain('from "User"');
  });
});
