import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireCurrentUser: vi.fn() }));
const db = vi.hoisted(() => ({ queryOne: vi.fn() }));
const audit = vi.hoisted(() => ({ createAuditLog: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ requireCurrentUser: auth.requireCurrentUser }));
vi.mock("@/lib/db/query", () => ({ queryOne: db.queryOne }));
vi.mock("@/lib/server/crm", () => ({ createAuditLog: audit.createAuditLog }));

import { PATCH } from "@/app/api/auth/me/route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/auth/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("My Account phone for connector calls", () => {
  beforeEach(() => {
    auth.requireCurrentUser.mockReset().mockResolvedValue({ id: "user-1", tenantId: "tenant-1" });
    db.queryOne.mockReset();
    audit.createAuditLog.mockReset().mockResolvedValue(undefined);
  });

  it("saves the user's phone alongside their display name", async () => {
    db.queryOne.mockResolvedValueOnce({ name: "Agent", phone: null }).mockResolvedValueOnce({ id: "user-1", name: "Agent", phone: "+91 98765 43210" });
    const response = await PATCH(request({ name: "Agent", phone: "+91 98765 43210" }));
    expect(response.status).toBe(200);
    expect((await response.json()).phone).toBe("+91 98765 43210");
    expect(db.queryOne.mock.calls[1][1]).toEqual(["Agent", "+91 98765 43210", "user-1"]);
  });

  it("does not clear an existing phone when an older client submits only the name", async () => {
    db.queryOne.mockResolvedValueOnce({ name: "Agent", phone: "+91 98765 43210" }).mockResolvedValueOnce({ id: "user-1", name: "Agent Two", phone: "+91 98765 43210" });
    const response = await PATCH(request({ name: "Agent Two" }));
    expect(response.status).toBe(200);
    expect(db.queryOne.mock.calls[1][1][1]).toBe("+91 98765 43210");
  });

  it("returns a user error for an undialable number before updating", async () => {
    db.queryOne.mockResolvedValueOnce({ name: "Agent", phone: null });
    const response = await PATCH(request({ name: "Agent", phone: "call me later" }));
    expect(response.status).toBe(400);
    expect(db.queryOne).toHaveBeenCalledTimes(1);
  });
});
