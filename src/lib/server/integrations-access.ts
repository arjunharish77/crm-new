// Who may manage integrations (outbound webhooks, inbound lead and case capture, external push):
// workspace admins, platform admins, or a role with Integrations set to full. These hold secrets
// and can send workspace data out, so a plain sign-in isn't enough (round-2 plan S2).
type AccessUser = { isTenantAdmin?: boolean; isPlatformAdmin?: boolean; role?: { permissions?: any } | string | null };

export function hasIntegrationsAccess(user: AccessUser) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.integrations === "full");
}

export const INTEGRATIONS_FORBIDDEN_MESSAGE = "You don't have permission to manage integrations";
