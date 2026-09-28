import { describe, expect, it } from "vitest";
import { enterTenantContext, getTenantContext, runWithTenantContext } from "@/lib/db/tenant-context";

// WP07 (F04): AsyncLocalStorage-backed ambient tenant context, read by src/lib/db/query.ts so
// its ~90 ad hoc call sites can set a transaction-local "app.tenant_id" for RLS without every one
// of them threading a user argument through. Real cross-tenant/connection-reuse isolation is
// verified against a live Postgres role separately (see 25_AUDIT_REMEDIATION_PLAN.md WP07) --
// these tests only cover this module's own contract in isolation.
describe("tenant-context", () => {
  it("returns null when nothing has entered a context on this async chain", () => {
    expect(getTenantContext()).toBeNull();
  });

  it("runWithTenantContext scopes the context to the callback's async chain only", async () => {
    const result = await runWithTenantContext({ tenantId: "tenant-a", userId: "user-1", roleId: "role-1" }, async () => {
      return getTenantContext();
    });
    expect(result).toEqual({ tenantId: "tenant-a", userId: "user-1", roleId: "role-1" });
    expect(getTenantContext()).toBeNull();
  });

  it("isolates two concurrent runWithTenantContext calls from each other", async () => {
    const [a, b] = await Promise.all([
      runWithTenantContext({ tenantId: "tenant-a", userId: null, roleId: null }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return getTenantContext();
      }),
      runWithTenantContext({ tenantId: "tenant-b", userId: null, roleId: null }, async () => {
        return getTenantContext();
      }),
    ]);
    expect(a?.tenantId).toBe("tenant-a");
    expect(b?.tenantId).toBe("tenant-b");
  });

  it("enterTenantContext sticks for the rest of the current async chain without wrapping in a callback", async () => {
    await runWithTenantContext({ tenantId: "outer", userId: null, roleId: null }, async () => {
      enterTenantContext({ tenantId: "inner", userId: "user-2", roleId: null });
      expect(getTenantContext()).toEqual({ tenantId: "inner", userId: "user-2", roleId: null });
    });
  });

  it("a platform-admin user with no tenantId clears tenant scoping (null, not undefined/stale)", async () => {
    await runWithTenantContext({ tenantId: "tenant-a", userId: null, roleId: null }, async () => {
      enterTenantContext({ tenantId: null, userId: "platform-admin-1", roleId: null });
      expect(getTenantContext()?.tenantId).toBeNull();
    });
  });
});
