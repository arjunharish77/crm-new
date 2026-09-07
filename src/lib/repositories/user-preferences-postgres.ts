import { queryOne } from "@/lib/db/query";

type TenantUser = { id: string; tenantId: string | null };

// Gap checklist Module 10's "user workspace personalization" item -- a single flexible JSONB
// column on User (migration 0096), mirroring the same "one flexible settings bag" pattern
// already established elsewhere in this schema (e.g. Role.permissions) rather than a new table
// per preference.
export type UserPreferences = {
  pinnedModules?: string[];
  defaultLandingPage?: string | null;
  density?: "compact" | "comfortable" | null;
  notifications?: { mutedCategories?: string[] };
  timezoneOverride?: string | null;
  currencyOverride?: string | null;
  tables?: Record<string, { density?: "compact" | "comfortable"; columnVisibility?: Record<string, boolean> }>;
  // Gap checklist Module 10's "saved workspace layouts" item -- per-module default view mode
  // (e.g. Tasks' "list"/"calendar", Opportunities' "LIST"/"KANBAN"/"ANALYTICS") and per-module
  // split-vs-full layout (currently just Marketing's list+detail campaign layout). Keyed by
  // module name, same convention as `tables` above, so unrelated modules never clobber each
  // other on merge-patch.
  viewModes?: Record<string, string> | null;
  layoutModes?: Record<string, "split" | "full"> | null;
};

const EMPTY_PREFERENCES: UserPreferences = {};

export async function getUserPreferencesForTenant(user: TenantUser): Promise<UserPreferences> {
  const row = await queryOne<{ preferences: UserPreferences | null }>(
    `select preferences from "User" where id = $1 and ${user.tenantId ? `"tenantId" = $2` : `"tenantId" is null`} limit 1`,
    user.tenantId ? [user.id, user.tenantId] : [user.id],
  );
  return row?.preferences ?? EMPTY_PREFERENCES;
}

function deepMerge<T extends Record<string, any>>(base: T, patch: Partial<T>): T {
  const result: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value) && typeof result[key] === "object" && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key] ?? {}, value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

// A merge-patch, not a full replace -- updating just `density` (say) must never clobber an
// already-saved `pinnedModules`/`notifications` etc, matching this app's other JSONB-settings
// update convention (e.g. TenantConfig.featureFlags patching).
export async function updateUserPreferencesForTenant(user: TenantUser, patch: Partial<UserPreferences>): Promise<UserPreferences> {
  const current = await getUserPreferencesForTenant(user);
  const next = deepMerge(current, patch);
  const updated = await queryOne<{ preferences: UserPreferences }>(
    `update "User" set preferences = $1 where id = $2 and ${user.tenantId ? `"tenantId" = $3` : `"tenantId" is null`} returning preferences`,
    user.tenantId ? [next, user.id, user.tenantId] : [next, user.id],
  );
  if (!updated) throw new Error("USER_NOT_FOUND");
  return updated.preferences;
}
