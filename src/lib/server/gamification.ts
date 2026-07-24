import { randomUUID } from "crypto";
import { createAuditLog, automationConditionMatches } from "@/lib/server/crm";
import { userMatchesTargetingConfig, type ParticipantConfig } from "@/lib/server/partner-access";
import { execute, query, queryOne } from "@/lib/db/query";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
};

export type GamificationRuleInput = {
  name: string;
  triggerEventType: string;
  audienceScope?: "INTERNAL" | "PARTNER" | "ALL";
  conditions?: Record<string, unknown>;
  pointsAwarded: number;
  priority?: number;
  isActive?: boolean;
};

export type GamificationSettingsInput = {
  levels?: unknown[];
  leaderboardConfig?: Record<string, unknown>;
  redemptionCatalog?: unknown[];
  antiGamingRules?: Record<string, unknown>;
  participantConfig?: ParticipantConfig | null;
};

type RedemptionCatalogItem = {
  key?: string;
  name: string;
  pointsCost: number;
  rewardType: "MONETARY" | "THIRD_PARTY_REWARD" | "INTERNAL_PERK";
  monetaryAmount?: number | null;
  thirdPartyProvider?: string | null;
  isActive?: boolean;
};

export type GamificationRedemptionInput = {
  catalogItemKey?: string | null;
  rewardName?: string | null;
  redemptionType?: "MONETARY" | "THIRD_PARTY_REWARD" | "INTERNAL_PERK";
  pointsRedeemed?: number;
  monetaryAmount?: number | null;
  thirdPartyProvider?: string | null;
  notes?: string | null;
};

const UPDATABLE_FIELDS = [
  "name",
  "triggerEventType",
  "audienceScope",
  "conditions",
  "pointsAwarded",
  "priority",
  "isActive",
] as const;

const DEFAULT_LEVELS = [
  { name: "Rookie", minPoints: 0, color: "#64748b" },
  { name: "Builder", minPoints: 500, color: "#2563eb" },
  { name: "Closer", minPoints: 1500, color: "#16a34a" },
  { name: "Champion", minPoints: 3000, color: "#f59e0b" },
];

const DEFAULT_LEADERBOARD_CONFIG = {
  scope: "INTERNAL",
  period: "MONTHLY",
  includePartners: false,
  anonymizePartners: true,
};

const DEFAULT_ANTI_GAMING_RULES = {
  maxPointsPerUserPerDay: 500,
  duplicateEventWindowMinutes: 30,
  requireManagerReviewAbovePoints: 1000,
};

const DEFAULT_PARTICIPANT_CONFIG: ParticipantConfig = {
  mode: "ALL",
  userIds: [],
  teamIds: [],
  salesGroupIds: [],
  partnerOrganizationIds: [],
};

export async function getGamificationSettingsForTenant(user: TenantUser) {
  if (!user.tenantId) return null;
  const data = await queryOne<any>(
    `select id, "tenantId", levels, "leaderboardConfig", "redemptionCatalog", "antiGamingRules",
            "participantConfig", "createdAt", "updatedAt"
     from "GamificationSettings"
     where "tenantId" = $1
     limit 1`,
    [user.tenantId],
  );
  return data ?? {
    levels: DEFAULT_LEVELS,
    leaderboardConfig: DEFAULT_LEADERBOARD_CONFIG,
    redemptionCatalog: [],
    antiGamingRules: DEFAULT_ANTI_GAMING_RULES,
    participantConfig: DEFAULT_PARTICIPANT_CONFIG,
  };
}

export async function upsertGamificationSettingsForTenant(user: TenantUser, input: GamificationSettingsInput) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const existing = await getGamificationSettingsForTenant(user);
  const now = new Date().toISOString();
  const payload = {
    levels: Array.isArray(input.levels) ? input.levels : DEFAULT_LEVELS,
    leaderboardConfig: input.leaderboardConfig ?? DEFAULT_LEADERBOARD_CONFIG,
    redemptionCatalog: Array.isArray(input.redemptionCatalog) ? input.redemptionCatalog : [],
    antiGamingRules: input.antiGamingRules ?? DEFAULT_ANTI_GAMING_RULES,
    participantConfig: normalizeParticipantConfig(input.participantConfig),
    updatedBy: user.id,
    updatedAt: now,
  };

  const existingId = (existing as any)?.id;
  if (existingId) {
    const data = await queryOne<any>(
      `update "GamificationSettings"
       set levels = $1, "leaderboardConfig" = $2, "redemptionCatalog" = $3, "antiGamingRules" = $4,
           "participantConfig" = $5, "updatedBy" = $6, "updatedAt" = $7
       where "tenantId" = $8
       returning id, "tenantId", levels, "leaderboardConfig", "redemptionCatalog", "antiGamingRules",
                 "participantConfig", "createdAt", "updatedAt"`,
      [
        payload.levels,
        payload.leaderboardConfig,
        payload.redemptionCatalog,
        payload.antiGamingRules,
        payload.participantConfig,
        payload.updatedBy,
        payload.updatedAt,
        user.tenantId,
      ],
    );
    if (!data) throw new Error("GAMIFICATION_SETTINGS_NOT_FOUND");
    await createAuditLog(user as any, "UPDATE", "GAMIFICATION_SETTINGS", data.id, existing, data, null);
    return data;
  }

  const data = await queryOne<any>(
    `insert into "GamificationSettings"
      (id, "tenantId", levels, "leaderboardConfig", "redemptionCatalog", "antiGamingRules",
       "participantConfig", "updatedBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
     returning id, "tenantId", levels, "leaderboardConfig", "redemptionCatalog", "antiGamingRules",
               "participantConfig", "createdAt", "updatedAt"`,
    [
      randomUUID(),
      user.tenantId,
      payload.levels,
      payload.leaderboardConfig,
      payload.redemptionCatalog,
      payload.antiGamingRules,
      payload.participantConfig,
      payload.updatedBy,
      now,
    ],
  );
  if (!data) throw new Error("GAMIFICATION_SETTINGS_INSERT_FAILED");
  await createAuditLog(user as any, "CREATE", "GAMIFICATION_SETTINGS", data.id, null, data, null);
  return data;
}

function normalizeParticipantConfig(config?: ParticipantConfig | null): ParticipantConfig {
  const mode = config?.mode === "SELECTED" ? "SELECTED" : "ALL";
  return {
    mode,
    userIds: Array.isArray(config?.userIds) ? config.userIds.filter(Boolean) : [],
    teamIds: Array.isArray(config?.teamIds) ? config.teamIds.filter(Boolean) : [],
    salesGroupIds: Array.isArray(config?.salesGroupIds) ? config.salesGroupIds.filter(Boolean) : [],
    partnerOrganizationIds: Array.isArray(config?.partnerOrganizationIds) ? config.partnerOrganizationIds.filter(Boolean) : [],
  };
}

export async function isUserIncludedInGamification(user: TenantUser, targetUserId: string) {
  if (!user.tenantId) return false;
  const settings = await getGamificationSettingsForTenant(user);
  return userMatchesTargetingConfig(user.tenantId, targetUserId, settings?.participantConfig, "ALL");
}

export async function listGamificationRulesForTenant(user: TenantUser) {
  if (!user.tenantId) return [];
  return query<any>(
    `select id, "tenantId", name, "triggerEventType", "audienceScope", conditions, "pointsAwarded",
            priority, "isActive", "createdAt", "updatedAt"
     from "GamificationRule"
     where "tenantId" = $1
     order by priority desc, "createdAt" desc`,
    [user.tenantId],
  );
}

export async function createGamificationRuleForTenant(user: TenantUser, input: GamificationRuleInput) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const now = new Date().toISOString();
  const data = await queryOne<any>(
    `insert into "GamificationRule"
      (id, "tenantId", name, "triggerEventType", "audienceScope", conditions, "pointsAwarded",
       priority, "isActive", "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     returning id, "tenantId", name, "triggerEventType", "audienceScope", conditions, "pointsAwarded",
               priority, "isActive", "createdAt", "updatedAt"`,
    [
      randomUUID(),
      user.tenantId,
      input.name,
      input.triggerEventType,
      input.audienceScope ?? "ALL",
      input.conditions ?? {},
      input.pointsAwarded,
      input.priority ?? 0,
      input.isActive ?? true,
      user.id,
      now,
    ],
  );
  if (!data) throw new Error("GAMIFICATION_RULE_INSERT_FAILED");
  await createAuditLog(user as any, "CREATE", "GAMIFICATION_RULE", data.id, null, data, null);
  return data;
}

export async function updateGamificationRuleForTenant(
  user: TenantUser,
  id: string,
  input: Partial<GamificationRuleInput>
) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const existing = await queryOne<any>(
    `select id, "tenantId", name, "triggerEventType", "audienceScope", conditions, "pointsAwarded",
            priority, "isActive", "createdAt", "updatedAt"
     from "GamificationRule"
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
    `update "GamificationRule"
     set ${assignments}
     where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2}
     returning id, "tenantId", name, "triggerEventType", "audienceScope", conditions, "pointsAwarded",
               priority, "isActive", "createdAt", "updatedAt"`,
    [...values, user.tenantId, id],
  );
  if (!data) return null;
  await createAuditLog(user as any, "UPDATE", "GAMIFICATION_RULE", data.id, existing, data, null);
  return data;
}

export async function deleteGamificationRuleForTenant(user: TenantUser, id: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const existing = await queryOne<any>(
    `select id, "tenantId", name, "triggerEventType", "audienceScope", conditions, "pointsAwarded",
            priority, "isActive", "createdAt", "updatedAt"
     from "GamificationRule"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [user.tenantId, id],
  );
  if (!existing) return null;

  await execute('delete from "GamificationRule" where "tenantId" = $1 and id = $2', [user.tenantId, id]);
  await createAuditLog(user as any, "DELETE", "GAMIFICATION_RULE", id, existing, null, null);
  return existing;
}

// Deliberately different resolution semantics from commission's first-match-wins:
// gamification points are additive, not a zero-sum payout, so EVERY active matching
// rule fires and contributes its points — a "base points" rule and a "bonus" rule
// can both award on the same event. Exported for direct testing.
export function ruleMatchesAudience(rule: { audienceScope: string }, isPartnerUser: boolean): boolean {
  if (rule.audienceScope === "ALL") return true;
  if (rule.audienceScope === "PARTNER") return isPartnerUser;
  if (rule.audienceScope === "INTERNAL") return !isPartnerUser;
  return false;
}

export async function resolveMatchingGamificationRules(
  tenantId: string,
  params: { triggerEventType: string; isPartnerUser: boolean; record: Record<string, unknown> }
) {
  const rules = await query<any>(
    `select id, "tenantId", name, "triggerEventType", "audienceScope", conditions, "pointsAwarded",
            priority, "isActive", "createdAt", "updatedAt"
     from "GamificationRule"
     where "tenantId" = $1 and "triggerEventType" = $2 and "isActive" = true`,
    [tenantId, params.triggerEventType],
  );
  return rules.filter(
    (rule: any) =>
      ruleMatchesAudience(rule, params.isPartnerUser) &&
      automationConditionMatches(params.record, (rule.conditions ?? {}) as Record<string, unknown>)
  );
}

export async function writeGamificationPointsLedgerEntry(
  user: TenantUser,
  input: {
    userId: string;
    gamificationRuleId?: string | null;
    points: number;
    entryType: "EARNED" | "MANUAL_ADJUSTMENT" | "REDEEMED";
    sourceEntityType?: string | null;
    sourceEntityId?: string | null;
    triggerEvent?: string | null;
    redemptionId?: string | null;
  }
) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const data = await queryOne<any>(
    `insert into "GamificationPointsLedger"
      (id, "tenantId", "userId", "gamificationRuleId", points, "entryType", "sourceEntityType",
       "sourceEntityId", "triggerEvent", "redemptionId", "createdBy", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     returning id, "tenantId", "userId", "gamificationRuleId", points, "entryType", "sourceEntityType",
               "sourceEntityId", "triggerEvent", "redemptionId", "createdAt", "createdBy"`,
    [
      randomUUID(),
      user.tenantId,
      input.userId,
      input.gamificationRuleId || null,
      input.points,
      input.entryType,
      input.sourceEntityType || null,
      input.sourceEntityId || null,
      input.triggerEvent || null,
      input.redemptionId || null,
      user.id,
      new Date().toISOString(),
    ],
  );
  if (!data) throw new Error("GAMIFICATION_LEDGER_INSERT_FAILED");
  await createAuditLog(user as any, "CREATE", "GAMIFICATION_POINTS_LEDGER", data.id, null, data, null);
  return data;
}

export function resolveTargetUserId(entityType: string, record: Record<string, any>): string | null {
  if (entityType === "ACTIVITY") return record.createdBy ?? null;
  return record.ownerId ?? null; // LEAD, OPPORTUNITY
}

// Trigger-time flow called from the "award_points" automation action node. Resolves
// the record's owner (or, for activities, whoever logged it), determines whether
// they're a partner, evaluates every matching GamificationRule, and writes one
// ledger entry per match. No-op if there's no resolvable target user.
export async function awardPointsForEvent(
  user: TenantUser,
  entityType: string,
  record: Record<string, any>,
  triggerEventType: string
) {
  if (!user.tenantId) return [];
  const targetUserId = resolveTargetUserId(entityType, record);
  if (!targetUserId) return [];
  if (!(await isUserIncludedInGamification(user, targetUserId))) {
    await createAuditLog(user as any, "SKIP", "GAMIFICATION_POINTS_LEDGER", targetUserId, null, null, {
      reason: "USER_NOT_IN_GAMIFICATION_PARTICIPANTS",
      targetUserId,
    });
    return [];
  }

  let isPartnerUser = false;
  const partnerProfile = await queryOne<any>(
    'select id from "PartnerProfile" where "tenantId" = $1 and "userId" = $2 limit 1',
    [user.tenantId, targetUserId],
  );
  isPartnerUser = !!partnerProfile;

  const matchingRules = await resolveMatchingGamificationRules(user.tenantId, {
    triggerEventType,
    isPartnerUser,
    record,
  });

  const settings = await getGamificationSettingsForTenant(user);
  const antiGamingRules = (settings?.antiGamingRules ?? {}) as {
    maxPointsPerUserPerDay?: number;
    duplicateEventWindowMinutes?: number;
    requireManagerReviewAbovePoints?: number;
  };
  const dailyCap = Number(antiGamingRules.maxPointsPerUserPerDay ?? 0);
  let remainingDailyPoints = dailyCap > 0 ? Math.max(dailyCap - await getPositivePointsEarnedToday(user, targetUserId), 0) : Number.POSITIVE_INFINITY;
  const duplicateWindowMinutes = Number(antiGamingRules.duplicateEventWindowMinutes ?? 0);
  const reviewThreshold = Number(antiGamingRules.requireManagerReviewAbovePoints ?? 0);

  const entries = [];
  for (const rule of matchingRules) {
    if (reviewThreshold > 0 && Number(rule.pointsAwarded ?? 0) > reviewThreshold) {
      await createAuditLog(user as any, "SKIP", "GAMIFICATION_POINTS_LEDGER", rule.id, null, null, {
        reason: "REQUIRES_MANAGER_REVIEW",
        pointsAwarded: rule.pointsAwarded,
        threshold: reviewThreshold,
        targetUserId,
      });
      continue;
    }
    if (duplicateWindowMinutes > 0 && await hasRecentDuplicateAward(user, {
      userId: targetUserId,
      gamificationRuleId: rule.id,
      sourceEntityType: entityType,
      sourceEntityId: record.id ?? null,
      triggerEvent: triggerEventType,
      duplicateWindowMinutes,
    })) {
      await createAuditLog(user as any, "SKIP", "GAMIFICATION_POINTS_LEDGER", rule.id, null, null, {
        reason: "DUPLICATE_EVENT_WINDOW",
        duplicateWindowMinutes,
        targetUserId,
      });
      continue;
    }
    const pointsToAward = Math.min(Number(rule.pointsAwarded ?? 0), remainingDailyPoints);
    if (pointsToAward <= 0) {
      await createAuditLog(user as any, "SKIP", "GAMIFICATION_POINTS_LEDGER", rule.id, null, null, {
        reason: "DAILY_CAP_REACHED",
        dailyCap,
        targetUserId,
      });
      continue;
    }
    entries.push(
      await writeGamificationPointsLedgerEntry(user, {
        userId: targetUserId,
        gamificationRuleId: rule.id,
        points: pointsToAward,
        entryType: "EARNED",
        sourceEntityType: entityType,
        sourceEntityId: record.id ?? null,
        triggerEvent: triggerEventType,
      })
    );
    remainingDailyPoints -= pointsToAward;
  }
  return entries;
}

async function getPositivePointsEarnedToday(user: TenantUser, targetUserId: string) {
  if (!user.tenantId) return 0;
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const rows = await query<any>(
    `select points
     from "GamificationPointsLedger"
     where "tenantId" = $1 and "userId" = $2 and "createdAt" >= $3`,
    [user.tenantId, targetUserId, start.toISOString()],
  );
  return rows.reduce((sum: number, entry: any) => {
    const points = Number(entry.points ?? 0);
    return points > 0 ? sum + points : sum;
  }, 0);
}

async function hasRecentDuplicateAward(
  user: TenantUser,
  input: {
    userId: string;
    gamificationRuleId: string;
    sourceEntityType: string;
    sourceEntityId: string | null;
    triggerEvent: string;
    duplicateWindowMinutes: number;
  }
) {
  if (!user.tenantId || !input.sourceEntityId) return false;
  const since = new Date(Date.now() - input.duplicateWindowMinutes * 60 * 1000).toISOString();
  const row = await queryOne<any>(
    `select id
     from "GamificationPointsLedger"
     where "tenantId" = $1 and "userId" = $2 and "gamificationRuleId" = $3
       and "sourceEntityType" = $4 and "sourceEntityId" = $5 and "triggerEvent" = $6
       and "entryType" = 'EARNED' and "createdAt" >= $7
     limit 1`,
    [
      user.tenantId,
      input.userId,
      input.gamificationRuleId,
      input.sourceEntityType,
      input.sourceEntityId,
      input.triggerEvent,
      since,
    ],
  );
  return !!row;
}

export async function listGamificationPointsLedgerForUser(user: TenantUser, targetUserId: string) {
  if (!user.tenantId) return [];
  return query<any>(
    `select id, "tenantId", "userId", "gamificationRuleId", points, "entryType", "sourceEntityType",
            "sourceEntityId", "triggerEvent", "redemptionId", "createdAt", "createdBy"
     from "GamificationPointsLedger"
     where "tenantId" = $1 and "userId" = $2
     order by "createdAt" desc`,
    [user.tenantId, targetUserId],
  );
}

export async function getPointsBalanceForUser(user: TenantUser, targetUserId: string) {
  const entries = await listGamificationPointsLedgerForUser(user, targetUserId);
  return entries.reduce((sum: number, entry: any) => sum + entry.points, 0);
}

function normalizeCatalogItem(item: any, index: number): RedemptionCatalogItem | null {
  if (!item?.name || !item?.rewardType || !Number.isFinite(Number(item?.pointsCost))) return null;
  return {
    key: item.key || `${item.rewardType}:${item.name}:${index}`,
    name: String(item.name),
    pointsCost: Number(item.pointsCost),
    rewardType: item.rewardType,
    monetaryAmount: item.monetaryAmount == null ? null : Number(item.monetaryAmount),
    thirdPartyProvider: item.thirdPartyProvider || null,
    isActive: item.isActive !== false,
  };
}

async function resolveRedemptionCatalogItem(user: TenantUser, input: GamificationRedemptionInput) {
  const settings = await getGamificationSettingsForTenant(user);
  const catalog = Array.isArray(settings?.redemptionCatalog)
    ? settings.redemptionCatalog.map(normalizeCatalogItem).filter(Boolean) as RedemptionCatalogItem[]
    : [];

  const item = catalog.find((candidate) => {
    if (!candidate.isActive) return false;
    if (input.catalogItemKey && candidate.key === input.catalogItemKey) return true;
    return candidate.name === input.rewardName && candidate.rewardType === input.redemptionType;
  });

  if (!item) throw new Error("REDEMPTION_REWARD_NOT_FOUND");
  if (item.pointsCost <= 0) throw new Error("INVALID_REDEMPTION_POINTS");
  return item;
}

export async function listGamificationRedemptionsForUser(user: TenantUser, targetUserId: string) {
  if (!user.tenantId) return [];
  return query<any>(
    `select id, "tenantId", "userId", "redemptionType", "pointsRedeemed", "monetaryAmount",
            "thirdPartyProvider", "thirdPartyReference", status, "catalogItemKey", "rewardName",
            notes, "failureReason", "reviewedBy", "reviewedAt", "createdAt", "updatedAt"
     from "GamificationRedemption"
     where "tenantId" = $1 and "userId" = $2
     order by "createdAt" desc`,
    [user.tenantId, targetUserId],
  );
}

export async function listGamificationRedemptionsForTenant(user: TenantUser) {
  if (!user.tenantId) return [];
  const redemptions = await query<any>(
    `select id, "tenantId", "userId", "redemptionType", "pointsRedeemed", "monetaryAmount",
            "thirdPartyProvider", "thirdPartyReference", status, "catalogItemKey", "rewardName",
            notes, "failureReason", "reviewedBy", "reviewedAt", "createdAt", "updatedAt"
     from "GamificationRedemption"
     where "tenantId" = $1
     order by "createdAt" desc`,
    [user.tenantId],
  );
  if (!redemptions.length) return [];
  const users = await query<any>('select id, name, email from "User" where "tenantId" = $1 and id = any($2::text[])', [
    user.tenantId,
    [...new Set(redemptions.map((redemption: any) => redemption.userId))],
  ]);
  const userMap = new Map(users.map((row) => [row.id, row]));
  return redemptions.map((redemption: any) => ({ ...redemption, user: userMap.get(redemption.userId) ?? null }));
}

export async function requestGamificationRedemption(user: TenantUser, input: GamificationRedemptionInput) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  if (!(await isUserIncludedInGamification(user, user.id))) throw new Error("USER_NOT_IN_GAMIFICATION_PARTICIPANTS");

  const catalogItem = await resolveRedemptionCatalogItem(user, input);
  const balance = await getPointsBalanceForUser(user, user.id);
  if (balance < catalogItem.pointsCost) throw new Error("INSUFFICIENT_POINTS");

  const now = new Date().toISOString();
  const redemption = await queryOne<any>(
    `insert into "GamificationRedemption"
      (id, "tenantId", "userId", "redemptionType", "pointsRedeemed", "monetaryAmount",
       "thirdPartyProvider", "thirdPartyReference", status, "catalogItemKey", "rewardName",
       notes, "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, null, 'REQUESTED', $8, $9, $10, $11, $11)
     returning id, "tenantId", "userId", "redemptionType", "pointsRedeemed", "monetaryAmount",
               "thirdPartyProvider", "thirdPartyReference", status, "catalogItemKey", "rewardName",
               notes, "failureReason", "reviewedBy", "reviewedAt", "createdAt", "updatedAt"`,
    [
      randomUUID(),
      user.tenantId,
      user.id,
      catalogItem.rewardType,
      catalogItem.pointsCost,
      catalogItem.monetaryAmount ?? input.monetaryAmount ?? null,
      catalogItem.thirdPartyProvider ?? input.thirdPartyProvider ?? null,
      catalogItem.key ?? null,
      catalogItem.name,
      input.notes || null,
      now,
    ],
  );
  if (!redemption) throw new Error("GAMIFICATION_REDEMPTION_INSERT_FAILED");

  await writeGamificationPointsLedgerEntry(user, {
    userId: user.id,
    points: -catalogItem.pointsCost,
    entryType: "REDEEMED",
    sourceEntityType: "GAMIFICATION_REDEMPTION",
    sourceEntityId: redemption.id,
    redemptionId: redemption.id,
  });

  await createAuditLog(user as any, "CREATE", "GAMIFICATION_REDEMPTION", redemption.id, null, redemption, null);
  return redemption;
}

export async function updateGamificationRedemptionStatus(
  user: TenantUser,
  id: string,
  input: { status: "FULFILLED" | "FAILED"; thirdPartyReference?: string | null; failureReason?: string | null }
) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const existing = await queryOne<any>(
    `select id, "tenantId", "userId", "redemptionType", "pointsRedeemed", "monetaryAmount",
            "thirdPartyProvider", "thirdPartyReference", status, "catalogItemKey", "rewardName",
            notes, "failureReason", "reviewedBy", "reviewedAt", "createdAt", "updatedAt"
     from "GamificationRedemption"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [user.tenantId, id],
  );
  if (!existing) return null;
  if (existing.status !== "REQUESTED") throw new Error("REDEMPTION_ALREADY_REVIEWED");

  const now = new Date().toISOString();
  const data = await queryOne<any>(
    `update "GamificationRedemption"
     set status = $1, "thirdPartyReference" = $2, "failureReason" = $3,
         "reviewedBy" = $4, "reviewedAt" = $5, "updatedAt" = $5
     where "tenantId" = $6 and id = $7
     returning id, "tenantId", "userId", "redemptionType", "pointsRedeemed", "monetaryAmount",
               "thirdPartyProvider", "thirdPartyReference", status, "catalogItemKey", "rewardName",
               notes, "failureReason", "reviewedBy", "reviewedAt", "createdAt", "updatedAt"`,
    [
      input.status,
      input.thirdPartyReference || existing.thirdPartyReference || null,
      input.status === "FAILED" ? input.failureReason || "Rejected by admin" : null,
      user.id,
      now,
      user.tenantId,
      id,
    ],
  );
  if (!data) return null;

  if (input.status === "FAILED") {
    await writeGamificationPointsLedgerEntry(user, {
      userId: existing.userId,
      points: Number(existing.pointsRedeemed ?? 0),
      entryType: "MANUAL_ADJUSTMENT",
      sourceEntityType: "GAMIFICATION_REDEMPTION_REFUND",
      sourceEntityId: existing.id,
      triggerEvent: "REDEMPTION_FAILED_REFUND",
      redemptionId: existing.id,
    });
  }

  await createAuditLog(user as any, "UPDATE", "GAMIFICATION_REDEMPTION", data.id, existing, data, {
    status: { before: existing.status, after: input.status },
  });
  return data;
}
