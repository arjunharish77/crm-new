import { afterEach, describe, expect, it, vi } from "vitest";

const adminMocks = vi.hoisted(() => ({ bootstrapPlatformAdmin: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/server/admin", () => adminMocks);
vi.mock("@/lib/server/security-policy", () => ({ getEffectiveSecurityPolicy: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/server/password-policy", () => ({ validatePasswordStrength: vi.fn().mockReturnValue([]) }));

import { POST } from "@/app/api/auth/bootstrap/route";

const body = (setupToken?: string) =>
  new Request("http://localhost/api/auth/bootstrap", { method: "POST", body: JSON.stringify({ name: "Admin", email: "a@example.invalid", password: "LongEnough123!", setupToken }) });

afterEach(() => {
  vi.unstubAllEnvs();
  adminMocks.bootstrapPlatformAdmin.mockClear();
});

describe("first-run setup needs the BOOTSTRAP_TOKEN (round-2 plan S10)", () => {
  it("is turned off in production when no token is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BOOTSTRAP_TOKEN", "");
    expect((await POST(body("anything"))).status).toBe(403);
    expect(adminMocks.bootstrapPlatformAdmin).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong token", async () => {
    vi.stubEnv("BOOTSTRAP_TOKEN", "right-token");
    expect((await POST(body())).status).toBe(403);
    expect((await POST(body("wrong-token"))).status).toBe(403);
    expect(adminMocks.bootstrapPlatformAdmin).not.toHaveBeenCalled();
  });

  it("creates the admin with the right token", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BOOTSTRAP_TOKEN", "right-token");
    expect((await POST(body(" right-token "))).status).toBe(200);
    expect(adminMocks.bootstrapPlatformAdmin).toHaveBeenCalledWith({ name: "Admin", email: "a@example.invalid", password: "LongEnough123!" });
  });
});
