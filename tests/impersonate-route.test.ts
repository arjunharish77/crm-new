import { beforeEach, describe, expect, it, vi } from "vitest";

// F06 fix (WP05): the impersonation token used to come back in the JSON body for the client to
// store (sessionStorage/js-cookie) and re-apply itself. It's now set as the same HttpOnly
// session cookie a normal login uses; the client never sees the raw value.
const authMocks = vi.hoisted(() => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ requirePlatformAdmin: authMocks.requirePlatformAdmin }));

const adminMocks = vi.hoisted(() => ({ impersonateTenantUser: vi.fn() }));
vi.mock("@/lib/server/admin", () => ({ impersonateTenantUser: adminMocks.impersonateTenantUser }));

const privilegedActionMocks = vi.hoisted(() => ({
  isPrivilegedActionApprovalRequired: vi.fn().mockResolvedValue(false),
  createPrivilegedActionRequest: vi.fn(),
}));
vi.mock("@/lib/server/privileged-actions", () => privilegedActionMocks);

beforeEach(() => {
  vi.clearAllMocks();
  privilegedActionMocks.isPrivilegedActionApprovalRequired.mockResolvedValue(false);
  authMocks.requirePlatformAdmin.mockResolvedValue({ id: "admin-1", isImpersonating: false });
  adminMocks.impersonateTenantUser.mockResolvedValue({
    token: "impersonation-token",
    user: { id: "target-user", email: "target@example.invalid" },
    expiresInSeconds: 14400,
  });
});

function request(body: object) {
  return new Request("http://localhost/api/platform-admin/impersonate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/platform-admin/impersonate", () => {
  it("sets the impersonation session as an HttpOnly cookie and never returns the token in the JSON body", async () => {
    const { POST } = await import("@/app/api/platform-admin/impersonate/route");
    const response = await POST(request({ userId: "target-user", tenantId: "tenant-1", reason: "Support ticket #42" }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user).toMatchObject({ id: "target-user" });
    expect(body.token).toBeUndefined();

    const cookie = response.cookies.get("token");
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.value).toBe("impersonation-token");
  });

  it("does not set a cookie when the action is pending approval instead of executed", async () => {
    privilegedActionMocks.isPrivilegedActionApprovalRequired.mockResolvedValueOnce(true);
    privilegedActionMocks.createPrivilegedActionRequest.mockResolvedValueOnce({ id: "request-1" });

    const { POST } = await import("@/app/api/platform-admin/impersonate/route");
    const response = await POST(request({ userId: "target-user", tenantId: "tenant-1", reason: "Needs approval" }));

    const body = await response.json();
    expect(body.pendingApproval).toBe(true);
    expect(response.cookies.get("token")).toBeUndefined();
    expect(adminMocks.impersonateTenantUser).not.toHaveBeenCalled();
  });
});
