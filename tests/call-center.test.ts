import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn() }));
const dispositionsMocks = vi.hoisted(() => ({ listCallDispositionsForTenant: vi.fn().mockResolvedValue([]) }));
const availabilityMocks = vi.hoisted(() => ({ listAgentAvailabilityForTenant: vi.fn().mockResolvedValue([]) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/dispositions", () => dispositionsMocks);
vi.mock("@/lib/server/agent-availability", () => availabilityMocks);

import { getCallCenterWorkspaceForTenant } from "@/lib/server/call-center";

const rep = { id: "rep-1", tenantId: "tenant-a" };
const admin = { id: "admin-1", tenantId: "tenant-a", isTenantAdmin: true };

function sqlOf(call: any[]) {
  return String(call[0]);
}

describe("call center workspace", () => {
  beforeEach(() => {
    dbMocks.query.mockReset().mockResolvedValue([]);
    dispositionsMocks.listCallDispositionsForTenant.mockReset().mockResolvedValue([]);
    availabilityMocks.listAgentAvailabilityForTenant.mockReset().mockResolvedValue([]);
  });

  it("scopes every 'my' query to the calling agent and omits the team section for a non-supervisor", async () => {
    const workspace = await getCallCenterWorkspaceForTenant(rep);

    expect(workspace.isSupervisor).toBe(false);
    expect(workspace.team).toBeNull();
    expect(availabilityMocks.listAgentAvailabilityForTenant).not.toHaveBeenCalled();

    const liveCallsCall = dbMocks.query.mock.calls.find((call) => sqlOf(call).includes("not in ('completed'"));
    expect(liveCallsCall![1]).toContain("rep-1");

    const missedCallsCall = dbMocks.query.mock.calls.find((call) => sqlOf(call).includes("status in ('missed', 'no-answer')"));
    expect(missedCallsCall![1]).toContain("rep-1");

    const callbacksCall = dbMocks.query.mock.calls.find((call) => sqlOf(call).includes('from "CallDisposition" cd'));
    expect(callbacksCall![1]).toContain("rep-1");

    expect(dispositionsMocks.listCallDispositionsForTenant).toHaveBeenCalledWith(rep, { createdBy: "rep-1" });
  });

  it("adds a tenant-wide team section for a supervisor, with agent availability included", async () => {
    availabilityMocks.listAgentAvailabilityForTenant.mockResolvedValueOnce([{ userId: "rep-1", status: "ONLINE" }]);

    const workspace = await getCallCenterWorkspaceForTenant(admin);

    expect(workspace.isSupervisor).toBe(true);
    expect(workspace.team).not.toBeNull();
    expect(workspace.team!.agentAvailability).toEqual([{ userId: "rep-1", status: "ONLINE" }]);
    expect(availabilityMocks.listAgentAvailabilityForTenant).toHaveBeenCalledWith(admin);
    expect(dispositionsMocks.listCallDispositionsForTenant).toHaveBeenCalledWith(admin, {});
  });

  it("does not scope the team's live-call query to any single agent", async () => {
    await getCallCenterWorkspaceForTenant(admin);

    const teamLiveCallsCalls = dbMocks.query.mock.calls.filter((call) => sqlOf(call).includes("not in ('completed'"));
    // One for "my" (scoped: tenantId, since, agentId, limit -- 4 params) and one for "team"
    // (unscoped: tenantId, since, limit -- 3 params, no agentId).
    expect(teamLiveCallsCalls).toHaveLength(2);
    const teamCall = teamLiveCallsCalls.find((call) => call[1].length === 3);
    expect(teamCall).toBeDefined();
  });

  it("queries only missed/no-answer statuses for the missed-calls-today section", async () => {
    await getCallCenterWorkspaceForTenant(rep);
    const missedCallsCall = dbMocks.query.mock.calls.find((call) => sqlOf(call).includes("status in ('missed', 'no-answer')"));
    expect(missedCallsCall).toBeDefined();
  });

  it("caps recentDispositions at 20 even when listCallDispositionsForTenant returns more", async () => {
    dispositionsMocks.listCallDispositionsForTenant.mockResolvedValue(Array.from({ length: 50 }, (_, i) => ({ id: `disp-${i}` })));

    const workspace = await getCallCenterWorkspaceForTenant(rep);

    expect(workspace.myRecentDispositions).toHaveLength(20);
  });

  it("throws when the caller has no tenant context", async () => {
    await expect(getCallCenterWorkspaceForTenant({ id: "user-1", tenantId: null })).rejects.toThrow("TENANT_CONTEXT_REQUIRED");
  });
});
