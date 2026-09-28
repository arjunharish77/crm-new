import { beforeEach, describe, expect, it, vi } from "vitest";

// F06 fix (WP05): replaces the old client-side "stash the admin's raw token in sessionStorage
// and reapply it" mechanism -- this route issues the admin a genuinely NEW session server-side
// and revokes the impersonation session, using its own `impersonatedBy` reference to know who
// to return to.
const authMocks = vi.hoisted(() => ({ requireCurrentUser: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ requireCurrentUser: authMocks.requireCurrentUser }));

const repoMocks = vi.hoisted(() => ({ getCurrentUserById: vi.fn() }));
vi.mock("@/lib/repositories/auth-admin-postgres", () => ({ getCurrentUserById: repoMocks.getCurrentUserById }));

const loginFlowMocks = vi.hoisted(() => ({ issueSessionForUser: vi.fn() }));
vi.mock("@/lib/server/login-flow", () => ({ issueSessionForUser: loginFlowMocks.issueSessionForUser }));

const sessionMocks = vi.hoisted(() => ({ revokeSession: vi.fn() }));
vi.mock("@/lib/server/sessions", () => ({ revokeSession: sessionMocks.revokeSession }));

beforeEach(() => {
  vi.clearAllMocks();
  loginFlowMocks.issueSessionForUser.mockResolvedValue({ accessToken: "new-admin-token", expiresInSeconds: 604800 });
  sessionMocks.revokeSession.mockResolvedValue(undefined);
});

function request() {
  return new Request("http://localhost/api/platform-admin/exit-impersonation", { method: "POST" });
}

describe("POST /api/platform-admin/exit-impersonation", () => {
  it("rejects when the caller is not currently impersonating", async () => {
    authMocks.requireCurrentUser.mockResolvedValue({ id: "user-1", isImpersonating: false });

    const { POST } = await import("@/app/api/platform-admin/exit-impersonation/route");
    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(loginFlowMocks.issueSessionForUser).not.toHaveBeenCalled();
  });

  it("issues the admin a new session, sets it as an HttpOnly cookie, and revokes the impersonation session", async () => {
    authMocks.requireCurrentUser.mockResolvedValue({
      id: "target-user", isImpersonating: true, impersonatedBy: "admin-1", sessionId: "impersonation-session-1",
    });
    repoMocks.getCurrentUserById.mockResolvedValue({
      id: "admin-1", email: "admin@example.invalid", name: "Admin", tenantId: null, roleId: null,
      isPlatformAdmin: true, platformAdminId: "platform-admin-1",
    });

    const { POST } = await import("@/app/api/platform-admin/exit-impersonation/route");
    const response = await POST(request());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user).toMatchObject({ id: "admin-1", isPlatformAdmin: true });
    // The new session token must never appear in the JSON body -- only as the cookie.
    expect(body.token).toBeUndefined();
    expect(body.accessToken).toBeUndefined();

    const cookie = response.cookies.get("token");
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.value).toBe("new-admin-token");

    expect(loginFlowMocks.issueSessionForUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: "admin-1" }),
      expect.objectContaining({ isPlatformAdmin: true, platformAdminId: "platform-admin-1" }),
    );
    expect(sessionMocks.revokeSession).toHaveBeenCalledWith("target-user", "impersonation-session-1", "admin-1", "IMPERSONATION_EXIT");
  });

  it("returns 403 if the original admin account no longer exists", async () => {
    authMocks.requireCurrentUser.mockResolvedValue({
      id: "target-user", isImpersonating: true, impersonatedBy: "deleted-admin", sessionId: "session-1",
    });
    repoMocks.getCurrentUserById.mockResolvedValue(null);

    const { POST } = await import("@/app/api/platform-admin/exit-impersonation/route");
    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(loginFlowMocks.issueSessionForUser).not.toHaveBeenCalled();
  });
});
