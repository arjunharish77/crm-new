import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const leadsRepoMocks = vi.hoisted(() => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/repositories/leads-postgres", () => leadsRepoMocks);

import { saveTelephonySettingsForTenant } from "@/lib/server/crm";

const user = { id: "user-1", tenantId: "tenant-a" };

describe("saveTelephonySettingsForTenant", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset();
    leadsRepoMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
  });

  it("preserves the existing webhook secret even when the client payload omits it", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "setting-1", config: { provider: "old", webhookSecret: "live-secret", previousWebhookSecret: null } })
      .mockResolvedValueOnce({ id: "setting-1", type: "TELEPHONY", config: { provider: "new" }, isActive: true });

    await saveTelephonySettingsForTenant(user, { provider: "new", isActive: true });

    const updateCall = dbMocks.queryOne.mock.calls[1];
    expect(updateCall[1][0].webhookSecret).toBe("live-secret");
    expect(updateCall[1][0].provider).toBe("new");
  });

  it("preserves the existing webhook secret even if the client sends a different, stale value for it", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "setting-1", config: { provider: "old", webhookSecret: "live-secret" } })
      .mockResolvedValueOnce({ id: "setting-1", type: "TELEPHONY", config: {}, isActive: true });

    await saveTelephonySettingsForTenant(user, { provider: "new", webhookSecret: "stale-client-side-value", isActive: true });

    const updateCall = dbMocks.queryOne.mock.calls[1];
    expect(updateCall[1][0].webhookSecret).toBe("live-secret");
  });

  it("leaves the secret null when creating telephony settings for the first time", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce(null) // getTelephonySettingsForTenant finds no existing row
      .mockResolvedValueOnce({ id: "setting-1", type: "TELEPHONY", config: { provider: "new" }, isActive: true });

    await saveTelephonySettingsForTenant(user, { provider: "new", isActive: true });

    const insertCall = dbMocks.queryOne.mock.calls[1];
    expect(insertCall[1][2].webhookSecret).toBeNull();
  });
});
