// The signed-in user's workspace id, or TENANT_CONTEXT_REQUIRED when there isn't one (a platform
// admin outside a workspace). Shared by the server modules that each used to define their own
// copy (round-2 plan B21).
export function requireTenantId(user: { tenantId?: string | null }): string {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return user.tenantId;
}
