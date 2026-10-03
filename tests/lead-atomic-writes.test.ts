import { beforeEach, describe, expect, it, vi } from "vitest";

// WP08 (F13): createLeadForTenant's/updateLeadForTenant's atomic core -- the record change, its
// mandatory audit row, and durable WebhookOutbox rows now commit together inside one
// withTransaction, with idempotency-key support on create and all "expensive" downstream work
// (distribution, automations, marketplace app events, NBA refresh, rollup invalidation) moved to
// run only after that transaction commits.
const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

// A fault injected anywhere inside the callback must reject the whole withTransaction call --
// this fake mirrors that (real Postgres does the same via ROLLBACK), so these tests exercise the
// real atomic-core code path/ordering without a live database.
vi.mock("@/lib/db/transaction", () => ({
  withTransaction: async (_user: unknown, fn: (client: unknown) => unknown) => fn({}),
}));

const distributionMocks = vi.hoisted(() => ({ distributeRecord: vi.fn() }));
vi.mock("@/lib/server/distribution-engine", () => distributionMocks);

const automationMocks = vi.hoisted(() => ({ runAutomationsForEvent: vi.fn() }));
vi.mock("@/lib/repositories/automations-postgres", () => automationMocks);

const nbaMocks = vi.hoisted(() => ({ refreshNextBestActionsForRecord: vi.fn() }));
vi.mock("@/lib/server/next-best-action", () => nbaMocks);

const marketplaceMocks = vi.hoisted(() => ({ enqueueAppEvent: vi.fn() }));
vi.mock("@/lib/server/marketplace-events", () => marketplaceMocks);

const rollupMocks = vi.hoisted(() => ({ invalidateReportRollupsForTenant: vi.fn() }));
vi.mock("@/lib/server/report-rollups", () => rollupMocks);

// Status resolution (tenant-configurable lead statuses, migration 0124) has its own real-database
// smoke (scripts/lead-statuses-smoke.ts); here it is stubbed so these tests stay about the
// atomic core's own query order.
vi.mock("@/lib/repositories/lead-statuses-postgres", () => ({
  resolveLeadStatusForWrite: vi.fn(async (_tenantId: string, requested?: string, current?: string) => requested ?? current ?? "NEW"),
}));

const user = { id: "user-1", tenantId: "tenant-a" };

function resetAllMocks() {
  queryMock.mockReset();
  queryOneMock.mockReset();
  executeMock.mockReset();
  distributionMocks.distributeRecord.mockReset().mockResolvedValue({ assignedUserId: null });
  automationMocks.runAutomationsForEvent.mockReset().mockResolvedValue(undefined);
  nbaMocks.refreshNextBestActionsForRecord.mockReset().mockResolvedValue(undefined);
  marketplaceMocks.enqueueAppEvent.mockReset().mockResolvedValue(undefined);
  rollupMocks.invalidateReportRollupsForTenant.mockReset().mockResolvedValue(undefined);
}

describe("createLeadForTenant atomic core + idempotency", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("no idempotency key: inserts, audits, and enqueues the webhook outbox row, then runs distribution/automations/NBA/rollups only after commit", async () => {
    queryOneMock
      .mockResolvedValueOnce({ id: "obj-1" }) // getObjectId
      .mockResolvedValueOnce({ id: "lead-1", ownerId: null, name: "Acme" }); // the INSERT ... RETURNING
    queryMock.mockResolvedValueOnce([{ id: "sub-1" }]); // enqueueWebhookEvent's subscription lookup
    executeMock.mockResolvedValue(1); // AuditLog insert

    const { createLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    await createLeadForTenant(user, { name: "Acme" });

    // Atomic-core order: audit insert (execute) before the webhook-subscription lookup (query).
    expect(executeMock.mock.calls[0][0]).toContain('insert into "AuditLog"');
    expect(queryMock.mock.calls[0][0]).toContain('from "WebhookSubscription"');
    // After-commit work only happens once the atomic core has already returned.
    expect(distributionMocks.distributeRecord).toHaveBeenCalledTimes(1);
    expect(automationMocks.runAutomationsForEvent).toHaveBeenCalledTimes(1);
    expect(nbaMocks.refreshNextBestActionsForRecord).toHaveBeenCalledTimes(1);
    expect(rollupMocks.invalidateReportRollupsForTenant).toHaveBeenCalledTimes(1);
  });

  it("fault after insert, before audit: the whole operation rejects and no after-commit work ever runs (no duplicate/orphaned side effects)", async () => {
    queryOneMock
      .mockResolvedValueOnce({ id: "obj-1" })
      .mockResolvedValueOnce({ id: "lead-1", ownerId: null, name: "Acme" });
    executeMock.mockRejectedValueOnce(new Error("audit insert failed"));

    const { createLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    await expect(createLeadForTenant(user, { name: "Acme" })).rejects.toThrow("audit insert failed");

    expect(distributionMocks.distributeRecord).not.toHaveBeenCalled();
    expect(automationMocks.runAutomationsForEvent).not.toHaveBeenCalled();
  });

  it("fault after audit, before the webhook outbox write: the whole operation rejects (no ambiguous 'lead exists but nothing else does' state)", async () => {
    queryOneMock
      .mockResolvedValueOnce({ id: "obj-1" })
      .mockResolvedValueOnce({ id: "lead-1", ownerId: null, name: "Acme" });
    executeMock.mockResolvedValue(1); // AuditLog insert succeeds
    queryMock.mockRejectedValueOnce(new Error("webhook subscription lookup failed"));

    const { createLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    await expect(createLeadForTenant(user, { name: "Acme" })).rejects.toThrow("webhook subscription lookup failed");

    expect(distributionMocks.distributeRecord).not.toHaveBeenCalled();
  });

  it("distribution failing after commit does not fail the request -- the lead is already committed", async () => {
    queryOneMock
      .mockResolvedValueOnce({ id: "obj-1" })
      .mockResolvedValueOnce({ id: "lead-1", ownerId: null, name: "Acme" });
    queryMock.mockResolvedValueOnce([]); // no active subscriptions
    executeMock.mockResolvedValue(1);
    distributionMocks.distributeRecord.mockRejectedValueOnce(new Error("distribution engine down"));

    const { createLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    const result = await createLeadForTenant(user, { name: "Acme" });

    expect(result.id).toBe("lead-1");
    expect(automationMocks.runAutomationsForEvent).toHaveBeenCalledTimes(1); // still ran despite distribution failing
  });

  it("idempotency key: a retried request with the identical body returns the original response without inserting a second lead", async () => {
    // Recompute the real hash so the lookup's mocked row matches what the code will compute.
    const { createHash } = await import("crypto");
    const requestHash = createHash("sha256").update(JSON.stringify({ name: "Acme" })).digest("hex");
    queryOneMock.mockResolvedValueOnce({ requestHash, responseSnapshot: { id: "lead-1", name: "Acme" } });

    const { createLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    const result = await createLeadForTenant(user, { name: "Acme" }, "retry-key-1");

    expect(result).toEqual({ id: "lead-1", name: "Acme" });
    expect(executeMock).not.toHaveBeenCalled(); // no new AuditLog/lead insert attempted
    expect(queryOneMock).toHaveBeenCalledTimes(1); // only the idempotency-key lookup
  });

  it("idempotency key reused with a DIFFERENT request body is rejected as a conflict, not silently applied", async () => {
    const { createHash } = await import("crypto");
    const originalHash = createHash("sha256").update(JSON.stringify({ name: "Acme" })).digest("hex");
    queryOneMock.mockResolvedValueOnce({ requestHash: originalHash, responseSnapshot: { id: "lead-1", name: "Acme" } });

    const { createLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    await expect(createLeadForTenant(user, { name: "Different Co" }, "retry-key-1")).rejects.toThrow(
      "IDEMPOTENCY_KEY_CONFLICT",
    );
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("idempotency key: two concurrent identical requests racing the unique index -- the loser replays the winner's result instead of a spurious 500", async () => {
    queryOneMock
      .mockResolvedValueOnce(null) // first lookup: no existing key yet
      .mockResolvedValueOnce({ id: "obj-1" }) // getObjectId (only reached after the idempotency lookup misses)
      .mockResolvedValueOnce({ id: "lead-1", ownerId: null, name: "Acme" }); // INSERT ... RETURNING
    queryMock.mockResolvedValueOnce([]); // no webhook subscriptions
    // The AuditLog insert succeeds, but the RequestIdempotencyKey insert loses the race.
    executeMock
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" }));
    const { createHash } = await import("crypto");
    const requestHash = createHash("sha256").update(JSON.stringify({ name: "Acme" })).digest("hex");
    queryOneMock.mockResolvedValueOnce({ requestHash, responseSnapshot: { id: "lead-1", name: "Acme", raced: true } });

    const { createLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    const result = await createLeadForTenant(user, { name: "Acme" }, "race-key");

    expect(result).toEqual({ id: "lead-1", name: "Acme", raced: true });
  });
});

describe("updateLeadForTenant atomic core", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("fault after the update, before the audit row: the whole operation rejects", async () => {
    queryOneMock
      .mockResolvedValueOnce({ id: "lead-1", name: "Old", ownerId: null, status: "NEW" }) // fetchRawLead
      .mockResolvedValueOnce({ id: "lead-1", name: "New", ownerId: null, status: "NEW" }); // UPDATE ... RETURNING
    queryMock.mockResolvedValueOnce([]); // getPredictiveScoreMap inside fetchRawLead
    executeMock.mockRejectedValueOnce(new Error("audit insert failed"));

    const { updateLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    await expect(updateLeadForTenant(user, "lead-1", { name: "New" })).rejects.toThrow("audit insert failed");
    expect(automationMocks.runAutomationsForEvent).not.toHaveBeenCalled();
  });
});
