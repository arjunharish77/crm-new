// F03 fix (WP04): a real field-permission model already existed (Role.permissions.fieldPermissions
// and PermissionTemplate.permissions.fieldPermissions, configurable per module/opportunity-type
// in the Permission Templates settings page with "editable"/"readonly"/"hidden" access levels),
// but it was only ever consulted by the custom-report-builder path (reporting-query.ts) -- the
// actual Lead/Opportunity CRUD APIs returned every column regardless of what an admin configured.
// This module is the shared, single source of truth both paths now use.
type TenantUserLike = {
  role?: { permissions?: any } | string | null;
  permissionTemplates?: any[] | null;
};

export type FieldPermissionModule = "leads" | "opportunities" | "activities";
export type FieldAccess = "editable" | "readonly" | "hidden";

const MODULE_SCOPE: Record<FieldPermissionModule, string> = {
  leads: "lead",
  opportunities: "opportunity",
  activities: "activity",
};

export function fieldPermissionMap(user: TenantUserLike, module: FieldPermissionModule, typeId?: string | null): Record<string, FieldAccess> {
  const role = user.role && typeof user.role === "object" ? user.role : null;
  const legacy = role?.permissions?.fieldPermissions?.[module];
  const next: Record<string, FieldAccess> = legacy && typeof legacy === "object" ? { ...(legacy as Record<string, FieldAccess>) } : {};
  const baseScope = MODULE_SCOPE[module];
  const typeScope = typeId && module !== "leads" ? `${baseScope}:${typeId}` : null;
  const templates = Array.isArray(user.permissionTemplates) ? user.permissionTemplates : [];
  for (const template of templates) {
    const fieldPermissions = template?.permissions?.fieldPermissions;
    if (!fieldPermissions || typeof fieldPermissions !== "object") continue;
    const base = fieldPermissions[baseScope];
    const typed = typeScope ? fieldPermissions[typeScope] : null;
    if (base && typeof base === "object") Object.assign(next, base);
    if (typed && typeof typed === "object") Object.assign(next, typed);
  }
  return next;
}

// Applied to every record read from the server -- a "hidden" field's value is replaced with
// null and flagged (`${field}Hidden`) so the UI can distinguish "genuinely empty" from
// "not permitted to see," but the real value never leaves the server either way.
export function maskFieldsForUser<T extends Record<string, any>>(
  user: TenantUserLike,
  module: FieldPermissionModule,
  record: T,
  typeId?: string | null,
): T {
  const permissions = fieldPermissionMap(user, module, typeId);
  const masked: Record<string, any> = { ...record };
  for (const [field, access] of Object.entries(permissions)) {
    if (access === "hidden" && field in masked) {
      masked[field] = null;
      masked[`${field}Hidden`] = true;
    }
  }
  return masked as T;
}

// Applied to a write payload before it reaches the database -- any key the caller supplied that
// is configured "hidden" or "readonly" for this user is silently dropped rather than applied
// (matches how the real edit UI behaves: the field is disabled/absent from the form), so a
// direct API call bypassing the UI cannot patch a field the permission template forbids.
// Returns the fields actually stripped so a caller can log/report them if useful.
export function sanitizeWritePayload<T extends Record<string, unknown>>(
  user: TenantUserLike,
  module: FieldPermissionModule,
  payload: T,
  typeId?: string | null,
): { sanitized: T; rejectedFields: string[] } {
  const permissions = fieldPermissionMap(user, module, typeId);
  const sanitized: Record<string, unknown> = { ...payload };
  const rejectedFields: string[] = [];
  for (const [field, access] of Object.entries(permissions)) {
    if ((access === "hidden" || access === "readonly") && field in sanitized) {
      delete sanitized[field];
      rejectedFields.push(field);
    }
  }
  return { sanitized: sanitized as T, rejectedFields };
}
