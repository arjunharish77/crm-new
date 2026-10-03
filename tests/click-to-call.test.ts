import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const leadsRepoMocks = vi.hoisted(() => ({ getLeadForTenant: vi.fn(), createAuditLog: vi.fn().mockResolvedValue(undefined) }));
const opportunitiesRepoMocks = vi.hoisted(() => ({ getOpportunityForTenant: vi.fn() }));
const telephonyWebhookMocks = vi.hoisted(() => ({ recordTelephonyCallEvent: vi.fn(), checkTelephonyComplianceForCall: vi.fn() }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/repositories/leads-postgres", () => leadsRepoMocks);
vi.mock("@/lib/repositories/opportunities-postgres", () => opportunitiesRepoMocks);
vi.mock("@/lib/server/telephony-webhook", () => telephonyWebhookMocks);

import { buildClickToCallPayloadForTenant } from "@/lib/server/crm";

// Telephony business logic under test; the TELEPHONY module gate itself is covered by
// tests/telephony-module-gate.test.ts.
vi.mock("@/lib/server/module-entitlements", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/module-entitlements")>()),
  assertTenantModule: vi.fn(async () => undefined),
  assertModuleEnabled: vi.fn(async () => undefined),
}));


const user = { id: "user-1", tenantId: "tenant-a" };

describe("buildClickToCallPayloadForTenant", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset();
    leadsRepoMocks.getLeadForTenant.mockReset();
    leadsRepoMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    opportunitiesRepoMocks.getOpportunityForTenant.mockReset();
    telephonyWebhookMocks.recordTelephonyCallEvent.mockReset().mockResolvedValue({ id: "log-1" });
    telephonyWebhookMocks.checkTelephonyComplianceForCall.mockReset().mockResolvedValue({ allowed: true });
  });

  it("throws when no phone number is supplied", async () => {
    await expect(buildClickToCallPayloadForTenant(user, {})).rejects.toThrow("PHONE_NUMBER_REQUIRED");
  });

  it("looks up the lead via the record-access-scoped getLeadForTenant, not a raw tenant-only query", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null); // getTelephonySettingsForTenant: no row -> default config
    leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", name: "Jane", phone: "555-1111" });

    await buildClickToCallPayloadForTenant(user, { phoneNumber: "555-1111", leadId: "lead-1" });

    expect(leadsRepoMocks.getLeadForTenant).toHaveBeenCalledWith(user, "lead-1");
  });

  it("falls back to the opportunity's linked lead when only opportunityId is supplied", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    opportunitiesRepoMocks.getOpportunityForTenant.mockResolvedValueOnce({
      id: "opp-1",
      lead: { id: "lead-1", name: "Jane", phone: "555-1111" },
    });

    await buildClickToCallPayloadForTenant(user, { phoneNumber: "555-1111", opportunityId: "opp-1" });

    expect(opportunitiesRepoMocks.getOpportunityForTenant).toHaveBeenCalledWith(user, "opp-1");
    expect(leadsRepoMocks.getLeadForTenant).not.toHaveBeenCalled();
  });

  it("records a call-attempt audit log attributed directly to the calling user, not the agent-mapping heuristic", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", name: "Jane", phone: "555-1111" });

    const result = await buildClickToCallPayloadForTenant(user, { phoneNumber: "555-1111", leadId: "lead-1" });

    expect(telephonyWebhookMocks.recordTelephonyCallEvent).toHaveBeenCalledTimes(1);
    const [tenantId, input, actorOverride] = telephonyWebhookMocks.recordTelephonyCallEvent.mock.calls[0];
    expect(tenantId).toBe("tenant-a");
    expect(input.leadId).toBe("lead-1");
    expect(input.callId).toMatch(/^manual-/);
    expect(actorOverride).toBe(user);
    expect(result.callLogId).toBe("log-1");
  });

  it("still returns a payload even when the call-attempt log write itself fails", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", name: "Jane", phone: "555-1111" });
    telephonyWebhookMocks.recordTelephonyCallEvent.mockRejectedValueOnce(new Error("db down"));

    const result = await buildClickToCallPayloadForTenant(user, { phoneNumber: "555-1111", leadId: "lead-1" });

    expect(result.callLogId).toBeNull();
    expect(result.payload.phoneNumber).toBe("555-1111");
  });

  it("logs status=not-attempted when no clickToCallUrl is configured (never reached the provider)", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", name: "Jane", phone: "555-1111" });

    await buildClickToCallPayloadForTenant(user, { phoneNumber: "555-1111", leadId: "lead-1" });

    const [, input] = telephonyWebhookMocks.recordTelephonyCallEvent.mock.calls[0];
    expect(input.status).toBe("not-attempted");
  });

  describe("compliance gate", () => {
    it("blocks the call and never reaches the provider when the number is suppressed", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ config: { clickToCallUrl: "https://provider.example/dial" } });
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", name: "Jane", phone: "555-1111" });
      telephonyWebhookMocks.checkTelephonyComplianceForCall.mockResolvedValueOnce({ allowed: false, reason: "SUPPRESSED" });
      const fetchSpy = vi.spyOn(global, "fetch");

      const result = await buildClickToCallPayloadForTenant(user, { phoneNumber: "555-1111", leadId: "lead-1" });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe("SUPPRESSED");
      expect(result.executed).toBe(false);
      fetchSpy.mockRestore();
    });

    it("logs status=blocked on the call-attempt row when compliance disallows the call", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ config: {} });
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", name: "Jane", phone: "555-1111" });
      telephonyWebhookMocks.checkTelephonyComplianceForCall.mockResolvedValueOnce({ allowed: false, reason: "QUIET_HOURS" });

      await buildClickToCallPayloadForTenant(user, { phoneNumber: "555-1111", leadId: "lead-1" });

      const [, input] = telephonyWebhookMocks.recordTelephonyCallEvent.mock.calls[0];
      expect(input.status).toBe("blocked");
    });

    it("passes the lead as the compliance-check entity context", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ config: {} });
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", name: "Jane", phone: "555-1111" });

      await buildClickToCallPayloadForTenant(user, { phoneNumber: "555-1111", leadId: "lead-1" });

      expect(telephonyWebhookMocks.checkTelephonyComplianceForCall).toHaveBeenCalledWith(
        "tenant-a",
        "555-1111",
        { entityType: "LEAD", entityId: "lead-1" },
      );
    });

    it("proceeds to the provider when compliance allows the call", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ config: { clickToCallUrl: "https://provider.example/dial" } });
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", name: "Jane", phone: "555-1111" });
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response("success", { status: 200 }));

      const result = await buildClickToCallPayloadForTenant(user, { phoneNumber: "555-1111", leadId: "lead-1" });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result.blocked).toBe(false);
      fetchSpy.mockRestore();
    });
  });
});
