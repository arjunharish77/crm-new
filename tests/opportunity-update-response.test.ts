import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ requireCurrentUser: vi.fn(async () => ({ id: "actor", tenantId: "tenant" })) }));
vi.mock("@/lib/server/crm", () => ({ getOpportunityForTenant: vi.fn(), deleteOpportunityForTenant: vi.fn(), updateOpportunityForTenant: mocks.update }));
import { PATCH } from "@/app/api/opportunities/[id]/route";
describe("Opportunity update response", () => {
  beforeEach(() => vi.clearAllMocks());
  it("does not report success for a missing or out-of-scope record", async () => {
    mocks.update.mockResolvedValue(null);
    const response = await PATCH(new Request("http://localhost/api/opportunities/missing", { method: "PATCH", body: JSON.stringify({ title: "Changed" }) }), { params: Promise.resolve({ id: "missing" }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toBeNull();
  });
  it("returns the saved record when an allowed update succeeds", async () => {
    mocks.update.mockResolvedValue({ id: "allowed", title: "Changed" });
    const response = await PATCH(new Request("http://localhost/api/opportunities/allowed", { method: "PATCH", body: JSON.stringify({ title: "Changed" }) }), { params: Promise.resolve({ id: "allowed" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "allowed", title: "Changed" });
  });
});
