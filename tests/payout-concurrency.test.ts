import { beforeEach, describe, expect, it, vi } from "vitest";

// WP10 (F15): payout state transitions previously read the current row, validated in JS, then
// wrote by tenantId+id with no expected-state predicate and no lock -- a concurrent
// approve/pay/hold/invoice-cancel transition on the SAME payout could both read a stale snapshot
// and both commit (e.g. a payout ending up simultaneously held AND paid). These tests exercise
// the real payouts.ts module (only @/lib/db/query and @/lib/db/transaction are mocked) to prove
// the fix: every transition now locks the Payout row with `for update` inside one transaction.
const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);

const txMocks = vi.hoisted(() => ({
  withTransaction: vi.fn((_user: unknown, fn: (client: unknown) => unknown) => fn({})),
}));
vi.mock("@/lib/db/transaction", () => txMocks);

const auditMocks = vi.hoisted(() => ({ createAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/server/crm", () => auditMocks);

vi.mock("@/lib/server/entitlements", () => ({ assertFeatureEnabled: vi.fn(async () => undefined) }));
vi.mock("@/lib/server/sessions", () => ({ assertNotImpersonating: vi.fn(() => undefined) }));
vi.mock("@/lib/server/commission", () => ({ writeCommissionLedgerEntry: vi.fn() }));
vi.mock("@/lib/server/partner-access", () => ({
  canAccessPayoutModule: vi.fn(async () => true),
  getPayoutVisiblePartnerUserIds: vi.fn(async () => []),
  resolvePartnerRollupTargets: vi.fn(async () => new Map()),
}));

const user = { id: "admin-1", tenantId: "tenant-a", isTenantAdmin: true };

const PAYOUT_COLUMNS_SELECT = /select id, "tenantId", "payoutCycleId"/;

function mockExistingPayout(overrides: Record<string, unknown> = {}) {
  dbMocks.queryOne.mockImplementationOnce(async (sql: string) => {
    if (PAYOUT_COLUMNS_SELECT.test(sql)) {
      return {
        id: "payout-1",
        tenantId: "tenant-a",
        status: "APPROVED",
        isHeld: false,
        invoiceId: null,
        totalCommissionAmount: 500,
        ...overrides,
      };
    }
    return null;
  });
}

describe("payouts.ts concurrency-safety (F15)", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset();
    txMocks.withTransaction.mockClear();
    auditMocks.createAuditLog.mockClear();
  });

  it("approvePayout locks the Payout row with 'for update' inside a single transaction", async () => {
    const { approvePayout } = await import("@/lib/server/payouts");
    dbMocks.queryOne
      .mockResolvedValueOnce(null) // getPartnerPayoutSettingsForTenant
      .mockResolvedValueOnce({ id: "payout-1", tenantId: "tenant-a", status: "DRAFT", isHeld: false, totalCommissionAmount: 0 }) // locked read
      .mockResolvedValueOnce({ id: "payout-1", tenantId: "tenant-a", status: "APPROVED" }); // update ... returning

    await approvePayout(user, "payout-1");

    expect(txMocks.withTransaction).toHaveBeenCalledTimes(1);
    const lockSql = String(dbMocks.queryOne.mock.calls[1][0]);
    expect(lockSql).toContain("for update");
  });

  it("holdPayout and releasePayoutHold also lock the row inside a transaction", async () => {
    const { holdPayout, releasePayoutHold } = await import("@/lib/server/payouts");

    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "payout-1", tenantId: "tenant-a", status: "APPROVED", isHeld: false })
      .mockResolvedValueOnce({ id: "payout-1", tenantId: "tenant-a", isHeld: true });
    await holdPayout(user, "payout-1", "fraud review");
    expect(String(dbMocks.queryOne.mock.calls[0][0])).toContain("for update");

    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "payout-1", tenantId: "tenant-a", status: "APPROVED", isHeld: true })
      .mockResolvedValueOnce({ id: "payout-1", tenantId: "tenant-a", isHeld: false });
    await releasePayoutHold(user, "payout-1");
    expect(String(dbMocks.queryOne.mock.calls[2][0])).toContain("for update");

    expect(txMocks.withTransaction).toHaveBeenCalledTimes(2);
  });

  it("also locks the linked invoice row when checking PAID eligibility -- the audit's own invoice-cancel/pay race", async () => {
    const { markPayoutPaid } = await import("@/lib/server/payouts");
    dbMocks.queryOne
      .mockResolvedValueOnce({ requireInvoiceBeforePayment: true }) // settings
      .mockResolvedValueOnce({ id: "payout-1", tenantId: "tenant-a", status: "APPROVED", isHeld: false, invoiceId: "invoice-1" }) // locked payout read
      .mockResolvedValueOnce({ status: "ISSUED" }) // locked invoice read
      .mockResolvedValueOnce({ id: "payout-1", tenantId: "tenant-a", status: "PAID", paymentReference: "UTR1" }); // update

    await markPayoutPaid(user, "payout-1", "UTR1");

    const invoiceLockSql = String(dbMocks.queryOne.mock.calls[2][0]);
    expect(invoiceLockSql).toContain('from "PartnerInvoice"');
    expect(invoiceLockSql).toContain("for update");
  });

  it("maps a duplicate payment reference (real Postgres unique-violation) to a clear, distinct error instead of a raw 500", async () => {
    const { markPayoutPaid } = await import("@/lib/server/payouts");
    dbMocks.queryOne
      .mockResolvedValueOnce({ requireInvoiceBeforePayment: false }) // settings
      .mockResolvedValueOnce({ id: "payout-1", tenantId: "tenant-a", status: "APPROVED", isHeld: false, invoiceId: null }) // locked payout read
      .mockRejectedValueOnce(Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" })); // update fails

    await expect(markPayoutPaid(user, "payout-1", "UTR-ALREADY-USED")).rejects.toThrow("DUPLICATE_PAYMENT_REFERENCE");
  });

  it("a lost race (row already transitioned by a concurrent request) still surfaces the ordinary INVALID_PAYOUT_TRANSITION error, not a silent no-op", async () => {
    const { approvePayout } = await import("@/lib/server/payouts");
    dbMocks.queryOne
      .mockResolvedValueOnce(null) // settings
      // by the time this transaction's `for update` read runs, another transaction already
      // committed PAID -- the lock just means this read now sees the POST-commit state, not the
      // stale pre-commit one.
      .mockResolvedValueOnce({ id: "payout-1", tenantId: "tenant-a", status: "PAID", isHeld: false, totalCommissionAmount: 0 });

    await expect(approvePayout(user, "payout-1")).rejects.toThrow("INVALID_PAYOUT_TRANSITION");
  });
});
