import { beforeEach, describe, expect, it, vi } from "vitest";

// F05/F06 fix (WP05): logout previously only cleared the browser's cookie -- the underlying
// UserSession row (and the JWT's own validity) stayed live until its natural 7-day expiry. A
// copied/leaked token would keep working after "logout" until it expired on its own.
const authMocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ getCurrentUser: authMocks.getCurrentUser }));

const sessionMocks = vi.hoisted(() => ({ revokeSession: vi.fn() }));
vi.mock("@/lib/server/sessions", () => ({ revokeSession: sessionMocks.revokeSession }));

beforeEach(() => {
  vi.clearAllMocks();
  sessionMocks.revokeSession.mockResolvedValue(undefined);
});

describe("POST /api/auth/logout", () => {
  it("revokes the underlying session when the caller has one", async () => {
    authMocks.getCurrentUser.mockResolvedValue({ id: "user-1", sessionId: "session-1" });

    const { POST } = await import("@/app/api/auth/logout/route");
    const response = await POST(new Request("http://localhost/api/auth/logout", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(sessionMocks.revokeSession).toHaveBeenCalledWith("user-1", "session-1", "user-1", "USER_LOGOUT");
  });

  it("clears the cookie as HttpOnly even if there is no active session to revoke", async () => {
    authMocks.getCurrentUser.mockResolvedValue(null);

    const { POST } = await import("@/app/api/auth/logout/route");
    const response = await POST(new Request("http://localhost/api/auth/logout", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(sessionMocks.revokeSession).not.toHaveBeenCalled();
    const cookie = response.cookies.get("token");
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.value).toBe("");
  });

  it("does not throw the request when getCurrentUser itself throws", async () => {
    authMocks.getCurrentUser.mockRejectedValue(new Error("boom"));

    const { POST } = await import("@/app/api/auth/logout/route");
    const response = await POST(new Request("http://localhost/api/auth/logout", { method: "POST" }));

    expect(response.status).toBe(200);
  });
});
