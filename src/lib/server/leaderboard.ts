import { getGamificationSettingsForTenant } from "@/lib/server/gamification";
import { userMatchesTargetingConfig } from "@/lib/server/partner-access";
import { query as pgQuery } from "@/lib/db/query";

type TenantUser = { id: string; tenantId: string | null };

// Computed-on-read rather than a materialized view: leaderboards need to be
// date-range filterable (a materialized view would need one per possible range, or
// refresh-then-filter which defeats the purpose), and this app's per-tenant volumes
// are moderate CRM data, not high-frequency event streams. If a tenant's ledger ever
// gets large enough for this to matter, add a (tenantId, userId, createdAt) index
// before reaching for a materialized view — GamificationPointsLedger already has one.
//
// Internal-only by design: partners must not see other partners (a hard constraint
// from the partner-portal requirements), and a ranked leaderboard with names is
// exactly that. Callers must gate this with requireInternalUser.
export async function getLeaderboard(
  user: TenantUser,
  params: { from?: string | null; to?: string | null; scope?: "INDIVIDUAL" | "TEAM" } = {}
) {
  if (!user.tenantId) return [];
  const filters = ['"tenantId" = $1'];
  const values: unknown[] = [user.tenantId];
  if (params.from) {
    values.push(params.from);
    filters.push(`"createdAt" >= $${values.length}`);
  }
  if (params.to) {
    values.push(params.to);
    filters.push(`"createdAt" <= $${values.length}`);
  }

  const entries = await pgQuery<any>(
    `select "userId", points
     from "GamificationPointsLedger"
     where ${filters.join(" and ")}`,
    values,
  );

  const pointsByUser = new Map<string, number>();
  const settings = await getGamificationSettingsForTenant(user);
  for (const entry of entries) {
    if (!(await userMatchesTargetingConfig(user.tenantId, entry.userId, settings?.participantConfig, "ALL"))) continue;
    pointsByUser.set(entry.userId, (pointsByUser.get(entry.userId) ?? 0) + Number(entry.points ?? 0));
  }
  if (pointsByUser.size === 0) return [];

  const userIds = [...pointsByUser.keys()];
  const users = await pgQuery<any>('select id, name, email, "teamId" from "User" where "tenantId" = $1 and id = any($2::text[])', [
    user.tenantId,
    userIds,
  ]);
  const userMap = new Map(users.map((row) => [row.id, row]));

  if (params.scope === "TEAM") {
    const pointsByTeam = new Map<string, number>();
    const teamNames = new Map<string, string>();
    for (const [userId, points] of pointsByUser.entries()) {
      const teamId = userMap.get(userId)?.teamId ?? "unassigned";
      pointsByTeam.set(teamId, (pointsByTeam.get(teamId) ?? 0) + points);
    }
    const teamIds = [...pointsByTeam.keys()].filter((id) => id !== "unassigned");
    if (teamIds.length > 0) {
      const teams = await pgQuery<any>('select id, name from "Team" where "tenantId" = $1 and id = any($2::text[])', [user.tenantId, teamIds]);
      teams.forEach((team) => teamNames.set(team.id, team.name));
    }
    return [...pointsByTeam.entries()]
      .map(([teamId, points]) => ({ teamId, teamName: teamId === "unassigned" ? "Unassigned" : teamNames.get(teamId) ?? teamId, points }))
      .sort((a, b) => b.points - a.points);
  }

  return [...pointsByUser.entries()]
    .map(([userId, points]) => ({
      userId,
      name: userMap.get(userId)?.name ?? userId,
      email: userMap.get(userId)?.email ?? null,
      points,
    }))
    .sort((a, b) => b.points - a.points);
}
