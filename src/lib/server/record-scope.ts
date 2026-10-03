// F03 fix (WP04): Role.permissions.recordAccess has offered "OWN"/"TEAM"/"ALL" in the Roles
// settings UI (src/app/dashboard/admin/roles/role-dialog.tsx) for some time, but the repository
// layer only ever checked for "OWN" -- anything else, including an admin explicitly choosing
// "TEAM Records" ("Can see team members' data"), silently behaved exactly like "ALL" (full
// tenant-wide visibility). This is the shared, single implementation of all three levels, used
// by both leads-postgres.ts and opportunities-postgres.ts so the same bug can't recur per-module.
export type RecordAccessLevel = "OWN" | "TEAM" | "ALL";

type ScopedUser = {
  id: string;
  tenantId: string | null;
  teamId?: string | null;
  role?: { permissions?: any } | string | null;
  // WP04 fix: a marketplace app's `id` is a MarketplaceApp id (used for attribution -- audit
  // logs, createdBy) that never matches a real Lead/Opportunity ownerId. When a tenant admin
  // configures OWN/TEAM scope for an app install, the record-scope check needs to run against
  // the internal user the admin designated as that install's "acts as owner" instead -- set
  // here so `id` itself (and everything keyed off it elsewhere) is untouched. Real internal
  // users never set this, so `?? id` below is a no-op for every existing caller.
  recordScopeActorId?: string | null;
};

export function recordAccessLevel(user: ScopedUser): RecordAccessLevel {
  const permissions = user.role && typeof user.role === "object" ? (user.role as any).permissions : null;
  if (permissions?.isPartnerRole) return "OWN";
  if (permissions?.recordAccess === "OWN") return "OWN";
  if (permissions?.recordAccess === "TEAM") return "TEAM";
  // Deliberately unchanged: a role/template that doesn't set recordAccess at all (or sets an
  // unrecognized value) keeps its existing tenant-wide default rather than a new restrictive
  // default -- changing that silently would alter access for every currently-working tenant
  // that never explicitly configured this field, which is a separate decision from adding the
  // previously-unenforced TEAM level.
  return "ALL";
}

// Appends a scope clause (and its bound values) to an existing WHERE-clause builder. Call after
// the tenant clause has already been added, passing that clause's own $-index (or null when
// there is no tenant column, matching the existing OWN-scope callers' convention) so the
// RecordShare/team-membership subqueries can reference it. `alias` qualifies the record table's
// own columns (e.g. "l" for a query aliasing Lead as `l`) for callers that join multiple tables
// sharing a column name (id/tenantId) where an unqualified reference would be ambiguous;
// omit it when the record table isn't aliased.
export function applyRecordScopeClause(
  clauses: string[],
  values: unknown[],
  user: ScopedUser,
  recordType: "LEAD" | "OPPORTUNITY",
  tenantIdParam: number | null,
  alias?: string,
) {
  const level = recordAccessLevel(user);
  if (level === "ALL") return;

  const col = (name: string) => (alias ? `${alias}."${name}"` : `"${name}"`);

  const scopeActorId = user.recordScopeActorId ?? user.id;
  values.push(scopeActorId);
  const userIdParam = values.length;
  const shareClause = tenantIdParam
    ? ` or ${col("id")} = any(select rs."recordId" from "RecordShare" rs where rs."tenantId" = $${tenantIdParam} and rs."recordType" = '${recordType}' and ($${userIdParam} = any(rs."sharedUserIds") or exists (select 1 from "User" u where u.id = $${userIdParam} and u."teamId"::text = any(rs."sharedTeamIds"))))`
    : "";

  // TEAM scope with no team assigned has nobody to share visibility with -- falls back to the
  // same "just my own records" behavior as OWN, rather than either erroring or (worse) matching
  // every other teamless user tenant-wide.
  if (level === "OWN" || !user.teamId) {
    clauses.push(`(${col("ownerId")} = $${userIdParam}${shareClause})`);
    return;
  }

  values.push(user.teamId);
  const teamIdParam = values.length;
  const teamMembershipClause = tenantIdParam
    ? `${col("ownerId")} in (select id from "User" where "tenantId" = $${tenantIdParam} and "teamId"::text = $${teamIdParam})`
    : `${col("ownerId")} in (select id from "User" where "teamId"::text = $${teamIdParam})`;
  clauses.push(`(${teamMembershipClause}${shareClause})`);
}

// Task visibility, by the same three levels (decision 2026-10-02): OWN sees the user's own
// tasks; TEAM sees their own plus tasks owned by members of their team (their own only when
// they have no team, as above); ALL sees every task in the tenant. Tasks have no RecordShare,
// so there is no share clause. Task lists used to narrow only for OWN, so a TEAM user could list
// every task in the tenant. Queue browsing (tasks-postgres rawQueueTask) is a separate,
// membership-based path and is unaffected.
export function applyTaskScopeClause(
  clauses: string[],
  values: unknown[],
  user: ScopedUser,
  tenantIdParam: number | null,
  alias?: string,
) {
  const level = recordAccessLevel(user);
  if (level === "ALL") return;
  const owner = alias ? `${alias}."ownerId"` : `"ownerId"`;
  values.push(user.recordScopeActorId ?? user.id);
  const userIdParam = values.length;
  if (level === "OWN" || !user.teamId) {
    clauses.push(`${owner} = $${userIdParam}`);
    return;
  }
  values.push(user.teamId);
  const teamIdParam = values.length;
  const tenantFilter = tenantIdParam ? `"tenantId" = $${tenantIdParam} and ` : "";
  clauses.push(`(${owner} = $${userIdParam} or ${owner} in (select id from "User" where ${tenantFilter}"teamId"::text = $${teamIdParam}))`);
}
