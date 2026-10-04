import { describe, expect, it } from "vitest";
import { impersonationBlocksRequest } from "@/lib/server/auth";

describe("impersonation is read-only for sign-in and access settings (round-2 plan S11)", () => {
  it("blocks changes to credentials, two-factor, users, roles, templates, sessions and API keys", () => {
    for (const [method, path] of [
      ["POST", "/api/auth/change-password"],
      ["POST", "/api/mfa/disable"],
      ["POST", "/api/mfa/enroll/start"],
      ["POST", "/api/admin/users/u1/mfa/reset"],
      ["POST", "/api/admin/users/u1/password-reset-token"],
      ["POST", "/api/users"],
      ["PATCH", "/api/users/u1"],
      ["DELETE", "/api/roles/r1"],
      ["PUT", "/api/permission-templates/t1"],
      ["DELETE", "/api/sessions/s1"],
      ["POST", "/api/sessions/revoke-others"],
      ["POST", "/api/settings/api-keys/k1/rotate"],
    ]) expect(impersonationBlocksRequest(method, path)).toBe(true);
  });

  it("allows reading them and working on records", () => {
    expect(impersonationBlocksRequest("GET", "/api/users")).toBe(false);
    expect(impersonationBlocksRequest("GET", "/api/sessions")).toBe(false);
    expect(impersonationBlocksRequest("POST", "/api/leads")).toBe(false);
    expect(impersonationBlocksRequest("PATCH", "/api/user-preferences")).toBe(false);
    expect(impersonationBlocksRequest("POST", "/api/auth/logout")).toBe(false);
    expect(impersonationBlocksRequest("POST", "/api/platform-admin/exit-impersonation")).toBe(false);
  });
});
