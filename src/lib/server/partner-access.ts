import { query, queryOne } from "@/lib/db/query";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isTenantAdmin?: boolean;
  isPlatformAdmin?: boolean;
};

export type PartnerVisibilityConfig = {
  mode?: "ALL_PARTNERS" | "SELECTED";
  userIds?: string[];
  teamIds?: string[];
  salesGroupIds?: string[];
  partnerOrganizationIds?: string[];
};

export type ParticipantConfig = {
  mode?: "ALL" | "SELECTED";
  userIds?: string[];
  teamIds?: string[];
  salesGroupIds?: string[];
  partnerOrganizationIds?: string[];
};

export type PartnerRollupTarget = {
  partnerId: string;
  partnerOrganizationId: string | null;
  memberUserIds: string[];
};

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => !!value))];
}

export async function getPartnerProfileByUserId(tenantId: string, userId: string) {
  return queryOne<any>(
    `select id, "tenantId", "userId", "partnerOrganizationId", "parentPartnerProfileId",
            "canAccessPayouts", "partnerLoginRole", status
     from "PartnerProfile"
     where "tenantId" = $1 and "userId" = $2
     limit 1`,
    [tenantId, userId],
  );
}

export async function resolvePartnerRollupTarget(tenantId: string, userId: string): Promise<PartnerRollupTarget> {
  const profile = await getPartnerProfileByUserId(tenantId, userId);
  if (!profile?.partnerOrganizationId) {
    return { partnerId: userId, partnerOrganizationId: null, memberUserIds: [userId] };
  }

  const orgProfiles = await query<any>(
    `select "userId", "partnerLoginRole", status
     from "PartnerProfile"
     where "tenantId" = $1 and "partnerOrganizationId" = $2`,
    [tenantId, profile.partnerOrganizationId],
  );
  const activeProfiles = orgProfiles.filter((row: any) => row.status !== "SUSPENDED");
  const primary = activeProfiles.find((row: any) => row.partnerLoginRole === "PRIMARY") ?? activeProfiles[0] ?? profile;

  return {
    partnerId: primary.userId ?? userId,
    partnerOrganizationId: profile.partnerOrganizationId,
    memberUserIds: unique(activeProfiles.map((row: any) => row.userId).concat(userId)),
  };
}

export async function resolvePartnerRollupTargets(tenantId: string, userIds: string[]) {
  const targets = new Map<string, PartnerRollupTarget>();
  for (const userId of unique(userIds)) {
    targets.set(userId, await resolvePartnerRollupTarget(tenantId, userId));
  }
  return targets;
}

async function getUserTeamId(tenantId: string, userId: string) {
  const row = await queryOne<any>('select id, "teamId" from "User" where "tenantId" = $1 and id = $2 limit 1', [tenantId, userId]);
  return row?.teamId ?? null;
}

async function getUserSalesGroupIds(tenantId: string, userId: string) {
  const rows = await query<any>('select "groupId" from "SalesGroupMember" where "tenantId" = $1 and "userId" = $2', [tenantId, userId]);
  return rows.map((row: any) => row.groupId).filter(Boolean);
}

export async function userMatchesTargetingConfig(
  tenantId: string,
  userId: string,
  config: PartnerVisibilityConfig | ParticipantConfig | null | undefined,
  allMode: string
) {
  if (!config || config.mode === allMode) return true;
  if (config.mode !== "SELECTED") return true;

  const userIds = config.userIds ?? [];
  if (userIds.includes(userId)) return true;

  const teamIds = config.teamIds ?? [];
  if (teamIds.length > 0) {
    const teamId = await getUserTeamId(tenantId, userId);
    if (teamId && teamIds.includes(teamId)) return true;
  }

  const salesGroupIds = config.salesGroupIds ?? [];
  if (salesGroupIds.length > 0) {
    const userSalesGroups = await getUserSalesGroupIds(tenantId, userId);
    if (userSalesGroups.some((id) => salesGroupIds.includes(id))) return true;
  }

  const partnerOrganizationIds = config.partnerOrganizationIds ?? [];
  if (partnerOrganizationIds.length > 0) {
    const profile = await getPartnerProfileByUserId(tenantId, userId);
    if (profile?.partnerOrganizationId && partnerOrganizationIds.includes(profile.partnerOrganizationId)) return true;
  }

  return false;
}

export async function canAccessPayoutModule(user: TenantUser, settings?: { payoutVisibilityConfig?: PartnerVisibilityConfig | null } | null) {
  if (!user.tenantId) return false;
  if (user.isTenantAdmin || user.isPlatformAdmin) return true;

  const profile = await getPartnerProfileByUserId(user.tenantId, user.id);
  if (!profile || profile.status === "SUSPENDED" || profile.canAccessPayouts === false) return false;

  return userMatchesTargetingConfig(user.tenantId, user.id, settings?.payoutVisibilityConfig, "ALL_PARTNERS");
}

export async function getPayoutVisiblePartnerUserIds(user: TenantUser, settings?: { payoutVisibilityConfig?: PartnerVisibilityConfig | null } | null) {
  if (!user.tenantId) return [];
  const profile = await getPartnerProfileByUserId(user.tenantId, user.id);
  if (!profile || profile.status === "SUSPENDED" || profile.canAccessPayouts === false) return [];
  if (!(await canAccessPayoutModule(user, settings))) return [];
  return (await resolvePartnerRollupTarget(user.tenantId, user.id)).memberUserIds;
}
