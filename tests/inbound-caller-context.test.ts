import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);

import { getInboundCallerContextForTenant } from "@/lib/server/inbound-caller-context";

// Telephony business logic under test; the TELEPHONY module gate itself is covered by
// tests/telephony-module-gate.test.ts.
vi.mock("@/lib/server/module-entitlements", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/module-entitlements")>()),
  assertTenantModule: vi.fn(async () => undefined),
  assertModuleEnabled: vi.fn(async () => undefined),
}));


const user = { id: "user-1", tenantId: "tenant-a" };

function sqlOf(call: any[]) {
  return String(call[0]);
}

describe("getInboundCallerContextForTenant", () => {
  beforeEach(() => {
    dbMocks.query.mockReset().mockResolvedValue([]);
  });

  it("throws when the caller has no tenant context", async () => {
    await expect(getInboundCallerContextForTenant({ id: "user-1", tenantId: null }, "9999999999")).rejects.toThrow(
      "TENANT_CONTEXT_REQUIRED",
    );
  });

  it("returns an all-empty result and skips every query when the phone number doesn't normalize to enough digits", async () => {
    const result = await getInboundCallerContextForTenant(user, "12");
    expect(result).toEqual({ phoneNumber: "12", leadMatches: [], opportunityMatches: [], partnerMatches: [], recentActivities: [], recentCalls: [] });
    expect(dbMocks.query).not.toHaveBeenCalled();
  });

  it("normalizes a caller ID with a country-code prefix to the last 10 digits for the Lead lookup", async () => {
    await getInboundCallerContextForTenant(user, "+91 99999 99999");
    const leadCall = dbMocks.query.mock.calls.find((call) => sqlOf(call).includes('from "Lead"'));
    expect(leadCall![1]).toEqual(["tenant-a", "9999999999"]);
  });

  it("returns every matching Lead, not just the first, for duplicate match resolution", async () => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (String(sql).includes('from "Lead"')) return [{ id: "lead-1", name: "Jane" }, { id: "lead-2", name: "Also Jane" }];
      return [];
    });

    const result = await getInboundCallerContextForTenant(user, "9999999999");

    expect(result.leadMatches).toHaveLength(2);
  });

  it("queries Opportunity by the matched lead ids when leads are found", async () => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (String(sql).includes('from "Lead"')) return [{ id: "lead-1", name: "Jane" }];
      if (String(sql).includes('from "Opportunity"')) return [{ id: "opp-1", leadId: "lead-1" }];
      return [];
    });

    const result = await getInboundCallerContextForTenant(user, "9999999999");

    const opportunityCall = dbMocks.query.mock.calls.find((call) => sqlOf(call).includes('from "Opportunity"'));
    expect(opportunityCall![1][1]).toEqual(["lead-1"]);
    expect(result.opportunityMatches).toEqual([{ id: "opp-1", leadId: "lead-1" }]);
  });

  it("skips the Opportunity and Activity queries when no lead matches", async () => {
    await getInboundCallerContextForTenant(user, "9999999999");

    expect(dbMocks.query.mock.calls.some((call) => sqlOf(call).includes('from "Opportunity"'))).toBe(false);
    expect(dbMocks.query.mock.calls.some((call) => sqlOf(call).includes('from "Activity"'))).toBe(false);
  });

  it("always queries PartnerProfile joined to User, regardless of lead match", async () => {
    await getInboundCallerContextForTenant(user, "9999999999");
    const partnerCall = dbMocks.query.mock.calls.find((call) => sqlOf(call).includes('from "PartnerProfile"'));
    expect(partnerCall).toBeDefined();
    expect(partnerCall![1]).toEqual(["tenant-a", "9999999999"]);
  });

  it("matches recent calls against either fromNumber or toNumber", async () => {
    await getInboundCallerContextForTenant(user, "9999999999");
    const callLogQuery = dbMocks.query.mock.calls.find((call) => sqlOf(call).includes('from "TelephonyCallLog"'));
    expect(callLogQuery![0]).toContain('"fromNumber"');
    expect(callLogQuery![0]).toContain('"toNumber"');
  });
});
