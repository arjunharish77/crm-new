import { query } from "@/lib/db/query";

// "@me" / "@myteam" tokens (gap checklist Module 10's universal advanced filter drawer,
// "current user/team tokens" sub-item). "@myteam" needs a DB lookup (every user sharing this
// user's teamId), so it must be resolved BEFORE filters reach the synchronous buildWhere-style
// functions every module already has -- substituteUserTokens is the async pre-pass call sites
// run once per request, not a change to buildWhere's own signature (avoiding an async ripple
// through its many no-filter call sites). Server-only (imports the Postgres driver via db/query)
// -- deliberately kept separate from query-filters.ts, which the client-side
// AdvancedFilterDrawer also imports for its pure constants/types and must stay bundler-safe.
export async function resolveTeamUserIds(tenantId: string | null, userId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `select u.id from "User" u
     where u."teamId" = (select "teamId" from "User" where id = $1)
       and ${tenantId ? `u."tenantId" = $2` : `u."tenantId" is null`}`,
    tenantId ? [userId, tenantId] : [userId],
  );
  return rows.map((row) => row.id);
}

function substituteTokenValue(value: unknown, userId: string, teamUserIds: string[]): unknown {
  if (value === "@me") return userId;
  if (value === "@myteam") return teamUserIds;
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (item === "@me") return [userId];
      if (item === "@myteam") return teamUserIds;
      return [item];
    });
  }
  return value;
}

// Walks any of this codebase's filter-group shapes (a flat conditions[] or nested {logic,
// conditions}[] groups -- every module's own filter type is structurally compatible) replacing
// "@me"/"@myteam" condition values in place. Only resolves the team lookup when at least one
// condition actually uses "@myteam", so the common case (no team token) costs nothing extra.
export async function substituteUserTokens<T extends { field?: string; value?: unknown }>(
  filters: Array<T | { logic?: "AND" | "OR"; conditions?: T[] }> | null,
  user: { id: string; tenantId: string | null },
): Promise<typeof filters> {
  if (!Array.isArray(filters)) return filters;
  const hasTeamToken = JSON.stringify(filters).includes("@myteam");
  const teamUserIds = hasTeamToken ? await resolveTeamUserIds(user.tenantId, user.id) : [];
  const substituteCondition = (condition: T): T => ({ ...condition, value: substituteTokenValue((condition as any).value, user.id, teamUserIds) });
  return filters.map((group) =>
    "conditions" in group && Array.isArray((group as any).conditions)
      ? { ...group, conditions: (group as any).conditions.map(substituteCondition) }
      : substituteCondition(group as T),
  );
}
