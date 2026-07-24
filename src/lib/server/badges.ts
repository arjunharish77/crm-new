import { randomUUID } from "crypto";
import { createAuditLog } from "@/lib/server/crm";
import { ruleMatchesAudience } from "@/lib/server/gamification";
import { execute, query, queryOne } from "@/lib/db/query";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
};

const EPOCH = "1970-01-01T00:00:00.000Z";
export type BadgeCriteria = { eventType: string; threshold: number; windowDays?: number | null };

export type BadgeInput = {
  name: string;
  description?: string | null;
  iconEmoji?: string;
  audienceScope?: "INTERNAL" | "PARTNER" | "ALL";
  criteriaRules: BadgeCriteria;
  isActive?: boolean;
};

const UPDATABLE_FIELDS = ["name", "description", "iconEmoji", "audienceScope", "criteriaRules", "isActive"] as const;

export async function listBadgesForTenant(user: TenantUser) {
  if (!user.tenantId) return [];
  return query<any>(
    `select id, "tenantId", name, description, "iconEmoji", "audienceScope", "criteriaRules",
            "isActive", "createdAt", "updatedAt"
     from "Badge"
     where "tenantId" = $1
     order by "createdAt" desc`,
    [user.tenantId],
  );
}

export async function createBadgeForTenant(user: TenantUser, input: BadgeInput) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const now = new Date().toISOString();
  const data = await queryOne<any>(
    `insert into "Badge"
      (id, "tenantId", name, description, "iconEmoji", "audienceScope", "criteriaRules",
       "isActive", "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
     returning id, "tenantId", name, description, "iconEmoji", "audienceScope", "criteriaRules",
               "isActive", "createdAt", "updatedAt"`,
    [
      randomUUID(),
      user.tenantId,
      input.name,
      input.description || null,
      input.iconEmoji || "🏆",
      input.audienceScope ?? "ALL",
      input.criteriaRules,
      input.isActive ?? true,
      user.id,
      now,
    ],
  );
  if (!data) throw new Error("BADGE_INSERT_FAILED");
  await createAuditLog(user as any, "CREATE", "BADGE", data.id, null, data, null);
  return data;
}

export async function updateBadgeForTenant(user: TenantUser, id: string, input: Partial<BadgeInput>) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const existing = await queryOne<any>(
    `select id, "tenantId", name, description, "iconEmoji", "audienceScope", "criteriaRules",
            "isActive", "createdAt", "updatedAt"
     from "Badge"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [user.tenantId, id],
  );
  if (!existing) return null;

  const updatePayload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of UPDATABLE_FIELDS) {
    if (input[key] !== undefined) updatePayload[key] = input[key];
  }

  const columns = Object.keys(updatePayload);
  const values = columns.map((column) => updatePayload[column]);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  const data = await queryOne<any>(
    `update "Badge"
     set ${assignments}
     where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2}
     returning id, "tenantId", name, description, "iconEmoji", "audienceScope", "criteriaRules",
               "isActive", "createdAt", "updatedAt"`,
    [...values, user.tenantId, id],
  );
  if (!data) return null;
  await createAuditLog(user as any, "UPDATE", "BADGE", data.id, existing, data, null);
  return data;
}

export async function deleteBadgeForTenant(user: TenantUser, id: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const existing = await queryOne<any>(
    `select id, "tenantId", name, description, "iconEmoji", "audienceScope", "criteriaRules",
            "isActive", "createdAt", "updatedAt"
     from "Badge"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [user.tenantId, id],
  );
  if (!existing) return null;

  await execute('delete from "Badge" where "tenantId" = $1 and id = $2', [user.tenantId, id]);
  await createAuditLog(user as any, "DELETE", "BADGE", id, existing, null, null);
  return existing;
}

// Pure — computes the window a badge's criteria should count within, exported for
// direct testing. windowDays null/undefined means all-time, using the epoch sentinel
// so the UserBadge unique constraint can't be defeated by NULL != NULL.
export function computeBadgeWindow(windowDays: number | null | undefined, asOfDate: Date): { start: string; end: string } {
  if (!windowDays) {
    return { start: EPOCH, end: asOfDate.toISOString() };
  }
  const start = new Date(asOfDate);
  start.setUTCDate(start.getUTCDate() - windowDays);
  return { start: start.toISOString(), end: asOfDate.toISOString() };
}

export async function listUserBadges(user: TenantUser, targetUserId: string) {
  if (!user.tenantId) return [];
  return query<any>(
    `select ub.id, ub."tenantId", ub."userId", ub."badgeId", ub."earnedAt", ub."sourcePeriodStart",
            ub."sourcePeriodEnd",
            jsonb_build_object('name', b.name, 'description', b.description, 'iconEmoji', b."iconEmoji") as "Badge"
     from "UserBadge" ub
     left join "Badge" b on b.id = ub."badgeId" and b."tenantId" = ub."tenantId"
     where ub."tenantId" = $1 and ub."userId" = $2
     order by ub."earnedAt" desc`,
    [user.tenantId, targetUserId],
  );
}

// Trigger-time flow, called from the "evaluate_badges" automation action node — a
// separate, composable step from "award_points" (same event, different node), not
// folded into it, since badges are a distinct admin-configurable concern.
export async function evaluateBadgesForEvent(
  user: TenantUser,
  targetUserId: string,
  isPartnerUser: boolean,
  triggerEventType: string,
  asOfDate: Date = new Date()
) {
  if (!user.tenantId) return [];
  const badges = await query<any>(
    `select id, "tenantId", name, description, "iconEmoji", "audienceScope", "criteriaRules",
            "isActive", "createdAt", "updatedAt"
     from "Badge"
     where "tenantId" = $1 and "isActive" = true`,
    [user.tenantId],
  );

  const candidates = badges.filter(
    (badge: any) => badge.criteriaRules?.eventType === triggerEventType && ruleMatchesAudience(badge, isPartnerUser)
  );

  const newlyEarned = [];
  for (const badge of candidates) {
    const criteria = badge.criteriaRules as BadgeCriteria;
    const { start, end } = computeBadgeWindow(criteria.windowDays, asOfDate);

    const existingAward = await queryOne<any>(
      `select id
       from "UserBadge"
       where "tenantId" = $1 and "userId" = $2 and "badgeId" = $3 and "sourcePeriodStart" = $4
       limit 1`,
      [user.tenantId, targetUserId, badge.id, start],
    );
    if (existingAward) continue; // already earned this window — never double-award

    const countRow = await queryOne<any>(
      `select count(*)::int as count
       from "GamificationPointsLedger"
       where "tenantId" = $1 and "userId" = $2 and "triggerEvent" = $3 and "entryType" = 'EARNED'
         and "createdAt" >= $4 and "createdAt" <= $5`,
      [user.tenantId, targetUserId, triggerEventType, start, end],
    );

    if (Number(countRow?.count ?? 0) >= criteria.threshold) {
      const award = await queryOne<any>(
        `insert into "UserBadge"
          (id, "tenantId", "userId", "badgeId", "earnedAt", "sourcePeriodStart", "sourcePeriodEnd")
         values ($1, $2, $3, $4, $5, $6, $7)
         returning id, "tenantId", "userId", "badgeId", "earnedAt", "sourcePeriodStart", "sourcePeriodEnd"`,
        [
          randomUUID(),
          user.tenantId,
          targetUserId,
          badge.id,
          asOfDate.toISOString(),
          start,
          criteria.windowDays ? end : null,
        ],
      );
      if (!award) throw new Error("USER_BADGE_INSERT_FAILED");
      await createAuditLog(user as any, "CREATE", "USER_BADGE", award.id, null, award, null);
      newlyEarned.push({ ...award, badge });
    }
  }

  return newlyEarned;
}
