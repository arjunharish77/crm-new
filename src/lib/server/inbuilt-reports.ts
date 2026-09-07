import {
  listActivitiesForTenant,
  listLeadsForTenant,
  listOpportunitiesForTenant,
  listOpportunityTypesForTenant,
} from "@/lib/server/crm";
import { query as pgQuery, queryOne as pgQueryOne, execute as pgExecute } from "@/lib/db/query";
import { randomUUID } from "crypto";

type TenantUser = {
  id: string;
  tenantId: string | null;
  name?: string | null;
  email?: string | null;
  role?: { permissions?: any } | string | null;
  isPlatformAdmin?: boolean;
};

// Metric permissions (gap checklist Module 17, item 17): a small number of report keys carry
// real $ figures at a sensitivity level beyond ordinary pipeline/activity metrics (marketing
// spend/ROI). Deliberately does NOT include `commission_payout_summary` -- that report already
// has its own real, correct row-level scoping for partner self-service access
// (`isPartnerScopedUser`/`partnerScoped` in `listCommissionPayoutSummaryInputs`), and gating it
// to tenant-admins-only here would break a partner's legitimate access to their own commission
// summary. Everything else in this file has no per-metric gate beyond the existing binary
// `advancedReporting` feature flag and normal tenant scoping.
const SENSITIVE_REPORT_KEYS = new Set(["campaign_roi", "lead_source_roi"]);

function assertSensitiveReportAccess(user: TenantUser, reportKey: string) {
  if (!SENSITIVE_REPORT_KEYS.has(reportKey)) return;
  if (user.isPlatformAdmin) return;
  const permissions = user.role && typeof user.role === "object" ? (user.role as any).permissions : null;
  const isTenantAdmin = permissions?.recordAccess === "ALL" || permissions?.modules?.admin === "full";
  if (!isTenantAdmin) throw new Error("SENSITIVE_REPORT_ACCESS_DENIED");
}

export type FunnelByStageRow = {
  stageId: string | null;
  stage: string;
  count: number;
  value: number;
  isWon: boolean;
  isClosed: boolean;
  conversionFromFirst: number | null;
  conversionFromPrevious: number | null;
};

export type FunnelByStageReport = {
  reportKey: "funnel_conversion_by_stage";
  generatedAt: string;
  totalOpportunities: number;
  totalValue: number;
  rows: FunnelByStageRow[];
};

export type FunnelBySourceCampaignRow = {
  source: string;
  campaign: string;
  leads: number;
  opportunities: number;
  wonOpportunities: number;
  pipelineValue: number;
  wonValue: number;
  opportunityConversionRate: number | null;
  wonConversionRate: number | null;
};

export type FunnelBySourceCampaignReport = {
  reportKey: "funnel_conversion_by_source_campaign";
  generatedAt: string;
  campaignFieldFound: boolean;
  totals: {
    leads: number;
    opportunities: number;
    wonOpportunities: number;
    pipelineValue: number;
    wonValue: number;
  };
  rows: FunnelBySourceCampaignRow[];
};

export type RepPerformanceRow = {
  repId: string;
  repName: string;
  leadsOwned: number;
  opportunitiesOwned: number;
  wonOpportunities: number;
  activitiesCreated: number;
  callsCreated: number;
  conversionRate: number | null;
  avgFirstResponseMinutes: number | null;
};

export type RepPerformanceReport = {
  reportKey: "rep_performance";
  generatedAt: string;
  rows: RepPerformanceRow[];
};

export type SlaResponseBreachRow = {
  ownerId: string;
  ownerName: string;
  totalLeads: number;
  responseBreaches: number;
  activitySlaBreaches: number;
  breachRate: number | null;
};

export type SlaResponseBreachReport = {
  reportKey: "sla_response_breaches";
  generatedAt: string;
  thresholdHours: number;
  totals: {
    totalLeads: number;
    responseBreaches: number;
    activitySlaBreaches: number;
  };
  rows: SlaResponseBreachRow[];
};

export type TaskSlaPerformanceRow = {
  ownerId: string;
  ownerName: string;
  teamId: string | null;
  teamName: string | null;
  totalTasks: number;
  openTasks: number;
  firstActionBreaches: number;
  completionBreaches: number;
  completionMet: number;
  breachRate: number | null;
};

export type TaskSlaPerformanceModuleRow = {
  module: "LEAD" | "OPPORTUNITY" | "ACTIVITY" | "STANDALONE";
  totalTasks: number;
  completionBreaches: number;
  completionMet: number;
};

export type TaskSlaPerformanceReport = {
  reportKey: "task_sla_performance";
  generatedAt: string;
  totals: {
    totalTasks: number;
    firstActionBreaches: number;
    completionBreaches: number;
    completionMet: number;
  };
  rows: TaskSlaPerformanceRow[];
  byModule: TaskSlaPerformanceModuleRow[];
};

export type AutomationPerformanceRow = {
  automationId: string;
  automationName: string;
  isActive: boolean;
  totalRuns: number;
  completed: number;
  failed: number;
  waiting: number;
  skipped: number;
  successRate: number | null;
  avgDurationMinutes: number | null;
};

export type AutomationPerformanceReport = {
  reportKey: "automation_performance";
  generatedAt: string;
  totals: {
    totalRuns: number;
    completed: number;
    failed: number;
    waiting: number;
  };
  rows: AutomationPerformanceRow[];
};

export type DistributionFairnessRow = {
  userId: string;
  userName: string;
  totalAssigned: number;
  leadAssigned: number;
  opportunityAssigned: number;
  deviationFromMean: number;
};

export type DistributionFairnessReport = {
  reportKey: "distribution_fairness";
  generatedAt: string;
  totals: {
    totalAssignments: number;
    totalUsers: number;
    meanPerUser: number;
  };
  rows: DistributionFairnessRow[];
};

export type SplitTestVariantRow = {
  automationId: string;
  automationName: string;
  nodeId: string;
  variant: string;
  executions: number;
  percentOfTotal: number;
  completed: number;
  completionRate: number | null;
};

export type SplitTestPerformanceReport = {
  reportKey: "split_test_performance";
  generatedAt: string;
  totals: {
    totalSplitNodes: number;
    totalExecutions: number;
  };
  rows: SplitTestVariantRow[];
};

export type FormDropOffRow = {
  formId: string;
  formName: string;
  tabId: string;
  tabIndex: number;
  tabLabel: string;
  sessions: number;
  dropOffFromPrevious: number | null;
  dropOffRate: number | null;
};

export type FormDropOffReport = {
  reportKey: "form_drop_off";
  generatedAt: string;
  totals: {
    totalForms: number;
    totalSessions: number;
    totalSubmissions: number;
  };
  rows: FormDropOffRow[];
};

export type LeadSourceRoiRow = {
  source: string;
  leads: number;
  opportunities: number;
  wonOpportunities: number;
  pipelineValue: number;
  wonValue: number;
  spend: number | null;
  roi: number | null;
  opportunityConversionRate: number | null;
  wonConversionRate: number | null;
};

export type LeadSourceRoiReport = {
  reportKey: "lead_source_roi";
  generatedAt: string;
  spendAvailable: boolean;
  rows: LeadSourceRoiRow[];
};

export type ReassignmentImpactRow = {
  bucket: string;
  assignmentEventCountMin: number;
  assignmentEventCountMax: number | null;
  leads: number;
  opportunities: number;
  wonOpportunities: number;
  responseBreaches: number;
  avgFirstResponseMinutes: number | null;
  opportunityConversionRate: number | null;
  wonConversionRate: number | null;
  responseBreachRate: number | null;
};

export type ReassignmentImpactReport = {
  reportKey: "reassignment_impact";
  generatedAt: string;
  thresholdHours: number;
  totals: {
    leads: number;
    opportunities: number;
    wonOpportunities: number;
    responseBreaches: number;
  };
  rows: ReassignmentImpactRow[];
};

export type ActivityCallVolumeTrendRow = {
  periodStart: string;
  periodEnd: string;
  activities: number;
  calls: number;
  completed: number;
  overdue: number;
  byType: Record<string, number>;
};

export type ActivityCallVolumeTrendReport = {
  reportKey: "activity_call_volume_trends";
  generatedAt: string;
  grain: "day" | "week" | "month";
  rows: ActivityCallVolumeTrendRow[];
};

export type CommissionPayoutPartnerRow = {
  partnerId: string;
  partnerName: string;
  ledgerEntries: number;
  earnedCommission: number;
  correctionCredits: number;
  correctionDebits: number;
  netCommission: number;
  draftPayout: number;
  approvedPayout: number;
  invoicedPayout: number;
  paidPayout: number;
  invoiceTotal: number;
};

export type CommissionPayoutSummaryReport = {
  reportKey: "commission_payout_summary";
  generatedAt: string;
  partnerScoped: boolean;
  totals: {
    ledgerEntries: number;
    earnedCommission: number;
    correctionCredits: number;
    correctionDebits: number;
    netCommission: number;
    draftPayout: number;
    approvedPayout: number;
    invoicedPayout: number;
    paidPayout: number;
    invoiceTotal: number;
  };
  payoutStatusCounts: Record<string, number>;
  recentCycles: Array<{
    id: string;
    cycleLabel: string;
    startDate: string;
    endDate: string;
    status: string;
  }>;
  rows: CommissionPayoutPartnerRow[];
};

export type CohortStageProgress = {
  stageId: string;
  stageName: string;
  order: number;
  leadsReached: number;
  reachRate: number | null;
  avgDaysFromEntry: number | null;
};

// Gap checklist Module 17, item 11 (cohort explorer): cohorts were only ever bucketed by
// created-date grain. `CohortDimension` widens that to source/campaign/score-band/owner, reusing
// the exact same stage-progression precomputation -- only the bucketing key changes.
export type CohortDimension = "CREATED_DATE" | "SOURCE" | "CAMPAIGN" | "SCORE_BAND" | "OWNER" | "SALES_GROUP" | "TEAM";

export type CohortReportRow = {
  cohortKey: string;
  cohortLabel: string;
  // Only populated for dimension === "CREATED_DATE" -- other dimensions have no natural
  // date range, so these stay null rather than showing a misleading date-shaped string.
  cohortStart: string | null;
  cohortEnd: string | null;
  leads: number;
  opportunities: number;
  stages: CohortStageProgress[];
};

export type CohortReport = {
  reportKey: "cohort_funnel_progression";
  generatedAt: string;
  dimension: CohortDimension;
  grain: "week" | "month";
  rows: CohortReportRow[];
};

export type DataQualityIssue = {
  type: string;
  label: string;
  count: number;
  sampleLeadIds: string[];
};

export type DataQualityReport = {
  reportKey: "data_quality";
  generatedAt: string;
  staleDays: number;
  totals: {
    totalLeads: number;
    duplicateEmailGroups: number;
    duplicatePhoneGroups: number;
    duplicateLeads: number;
    staleLeads: number;
    missingRequiredFieldLeads: number;
    missingOwner: number;
    missingEmail: number;
    missingPhone: number;
    invalidUtmTouches: number;
    slaBreaches: number;
    opportunitiesMissingStageRequiredFields: number;
  };
  issues: DataQualityIssue[];
};

export async function getFunnelByStageReportForTenant(user: TenantUser): Promise<FunnelByStageReport> {
  const opportunities = await listOpportunitiesForTenant(user, 1000);
  return calculateFunnelByStageReport(opportunities.data, new Date());
}

export async function getFunnelBySourceCampaignReportForTenant(user: TenantUser): Promise<FunnelBySourceCampaignReport> {
  const [leads, opportunities, campaignLookup] = await Promise.all([
    listLeadsForTenant(user, 1, 1000),
    listOpportunitiesForTenant(user, 1000),
    getLeadCampaignLookup(user),
  ]);

  return calculateFunnelBySourceCampaignReport(
    leads.data,
    opportunities.data,
    campaignLookup.valuesByLeadId,
    campaignLookup.fieldFound,
    new Date()
  );
}

// --- Funnel Explorer (gap checklist Module 17, item 12) ---
// Adds stage aging, drop-off (with a best-effort reason), re-entry detection, and segment
// comparison on top of the flat stage-conversion table `calculateFunnelByStageReport` computes.
// "Lead-to-opportunity-to-application-to-enrollment" as 4 distinct stages is NOT built -- there
// is no Application/Enrollment schema anywhere in this codebase (Module 12's Product Catalog is
// unbuilt), so this stays scoped to the Opportunity pipeline's own stages, same as every other
// funnel report in this file.
export type FunnelExplorerSegmentDimension = "SOURCE" | "OWNER" | "OPPORTUNITY_TYPE" | "PARTNER";

export type FunnelExplorerReport = {
  reportKey: "funnel_explorer";
  generatedAt: string;
  segmentDimension: FunnelExplorerSegmentDimension;
  stageAging: Array<{ stageId: string | null; stageName: string; order: number; openCount: number; avgDaysInStage: number | null; maxDaysInStage: number | null }>;
  dropOff: Array<{ stageId: string | null; stageName: string; order: number; lostCount: number; topReasons: Array<{ reason: string; count: number }> }>;
  reEntryCount: number;
  segments: Array<{ segment: string; totalOpportunities: number; wonCount: number; wonRate: number | null }>;
};

export function calculateFunnelExplorerReport(
  opportunities: any[],
  stageHistory: any[],
  reasonLostByOpportunityId: Map<string, string>,
  segmentByOpportunityId: Map<string, string>,
  segmentDimension: FunnelExplorerSegmentDimension,
  generatedAt: Date
): FunnelExplorerReport {
  const historyByOpportunity = new Map<string, any[]>();
  for (const history of stageHistory) {
    const list = historyByOpportunity.get(history.opportunityId) ?? [];
    list.push(history);
    historyByOpportunity.set(history.opportunityId, list);
  }
  for (const list of historyByOpportunity.values()) {
    list.sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
  }

  const agingByStage = new Map<string, { stageId: string | null; stageName: string; order: number; openCount: number; days: number[] }>();
  const dropOffByStage = new Map<string, { stageId: string | null; stageName: string; order: number; lostCount: number; reasons: Map<string, number> }>();
  const segmentBuckets = new Map<string, { total: number; won: number }>();
  let reEntryCount = 0;

  for (const opportunity of opportunities) {
    const stageId = opportunity.stage?.id ?? opportunity.stageId ?? null;
    const stageName = opportunity.stage?.name ?? "Unassigned";
    const order = opportunity.stage?.order ?? Number.MAX_SAFE_INTEGER;
    const isWon = Boolean(opportunity.stage?.isWon);
    const isClosed = Boolean(opportunity.stage?.isClosed);
    const key = stageId ?? stageName;
    const history = historyByOpportunity.get(opportunity.id) ?? [];

    if (!isClosed) {
      const lastEntry = [...history].reverse().find((entry) => entry.toStageId === stageId);
      const enteredAt = lastEntry ? new Date(lastEntry.changedAt) : new Date(opportunity.createdAt);
      const days = (generatedAt.getTime() - enteredAt.getTime()) / (24 * 60 * 60 * 1000);
      const bucket = agingByStage.get(key) ?? { stageId, stageName, order, openCount: 0, days: [] as number[] };
      bucket.openCount += 1;
      if (Number.isFinite(days) && days >= 0) bucket.days.push(days);
      agingByStage.set(key, bucket);
    }

    if (isClosed && !isWon) {
      const bucket = dropOffByStage.get(key) ?? { stageId, stageName, order, lostCount: 0, reasons: new Map<string, number>() };
      bucket.lostCount += 1;
      const reason = reasonLostByOpportunityId.get(opportunity.id);
      if (reason) bucket.reasons.set(reason, (bucket.reasons.get(reason) ?? 0) + 1);
      dropOffByStage.set(key, bucket);
    }

    // Re-entry: a stage reappearing in an opportunity's ordered history means it moved
    // backward (or was reset) and re-entered a stage it had already passed through.
    const seenStages = new Set<string>();
    for (const entry of history) {
      if (!entry.toStageId) continue;
      if (seenStages.has(entry.toStageId)) {
        reEntryCount += 1;
        break;
      }
      seenStages.add(entry.toStageId);
    }

    const segment = segmentByOpportunityId.get(opportunity.id) ?? "Unknown";
    const segmentBucket = segmentBuckets.get(segment) ?? { total: 0, won: 0 };
    segmentBucket.total += 1;
    if (isWon) segmentBucket.won += 1;
    segmentBuckets.set(segment, segmentBucket);
  }

  return {
    reportKey: "funnel_explorer",
    generatedAt: generatedAt.toISOString(),
    segmentDimension,
    stageAging: [...agingByStage.values()]
      .sort((a, b) => a.order - b.order)
      .map(({ days, ...rest }) => ({
        ...rest,
        avgDaysInStage: days.length ? Math.round((days.reduce((sum, value) => sum + value, 0) / days.length) * 10) / 10 : null,
        maxDaysInStage: days.length ? Math.round(Math.max(...days) * 10) / 10 : null,
      })),
    dropOff: [...dropOffByStage.values()]
      .sort((a, b) => a.order - b.order)
      .map(({ reasons, ...rest }) => ({
        ...rest,
        topReasons: [...reasons.entries()]
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
      })),
    reEntryCount,
    segments: [...segmentBuckets.entries()]
      .map(([segment, bucket]) => ({
        segment,
        totalOpportunities: bucket.total,
        wonCount: bucket.won,
        wonRate: bucket.total > 0 ? Math.round((bucket.won / bucket.total) * 10000) / 10000 : null,
      }))
      .sort((a, b) => b.totalOpportunities - a.totalOpportunities),
  };
}

export async function getFunnelExplorerForTenant(
  user: TenantUser,
  segmentDimension: FunnelExplorerSegmentDimension = "SOURCE"
): Promise<FunnelExplorerReport> {
  const [leads, opportunities, opportunityTypes, users] = await Promise.all([
    listLeadsForTenant(user, 1, 1000),
    listOpportunitiesForTenant(user, 1000),
    listOpportunityTypesForTenant(user),
    listTenantUsers(user),
  ]);
  const opportunityIds = opportunities.data.map((opportunity: any) => opportunity.id);
  const stageHistory = await listOpportunityStageHistoryForTenant(user, opportunityIds);

  const reasonLostByOpportunityId = new Map<string, string>();
  if (user.tenantId && opportunityIds.length) {
    for (let index = 0; index < opportunityIds.length; index += 100) {
      const chunk = opportunityIds.slice(index, index + 100);
      const rows = await pgQuery<{ opportunityId: string; reasonLost: string }>(
        `select distinct on ("opportunityId") "opportunityId", "reasonLost"
         from "CallDisposition"
         where "tenantId" = $1 and "opportunityId" = any($2::text[]) and "reasonLost" is not null
         order by "opportunityId", "createdAt" desc`,
        [user.tenantId, chunk],
      );
      for (const row of rows) reasonLostByOpportunityId.set(row.opportunityId, row.reasonLost);
    }
  }

  const leadSourceById = new Map(leads.data.map((lead: any) => [lead.id, lead.source || "Unknown"]));
  const userNameById = new Map(users.map((u: any) => [u.id, u.name || u.email || u.id]));
  const typeNameById = new Map(opportunityTypes.map((type: any) => [type.id, type.name]));

  // Gap checklist Module 17, item 8 ("segmentation and comparison tools" -- "partners").
  // There is no direct partnerId on Opportunity -- partner association is a derived fact from
  // `CommissionLedger` (populated when commission is earned on a won deal), which is why this
  // dimension only ever resolves a partner for opportunities that have already generated a
  // commission entry; everything else falls into "No Partner". `CommissionLedger.partnerId`
  // references `User.id` directly (confirmed via its FK constraint) -- a materially different
  // convention from `Payout.partnerId`, which references `PartnerProfile.id` instead. Getting
  // this wrong would have silently resolved every partner name to "Unknown".
  const partnerNameByOpportunityId = new Map<string, string>();
  if (segmentDimension === "PARTNER" && user.tenantId && opportunityIds.length) {
    for (let index = 0; index < opportunityIds.length; index += 100) {
      const chunk = opportunityIds.slice(index, index + 100);
      const rows = await pgQuery<{ opportunityId: string; partnerName: string }>(
        `select cl."opportunityId", coalesce(pp."legalBusinessName", u.name, u.email, cl."partnerId") as "partnerName"
         from (
           select distinct on ("opportunityId") "opportunityId", "partnerId"
           from "CommissionLedger"
           where "tenantId" = $1 and "opportunityId" = any($2::text[])
           order by "opportunityId", "createdAt" desc
         ) cl
         left join "User" u on u.id = cl."partnerId"
         left join "PartnerProfile" pp on pp."userId" = cl."partnerId"`,
        [user.tenantId, chunk],
      );
      for (const row of rows) partnerNameByOpportunityId.set(row.opportunityId, row.partnerName);
    }
  }

  const segmentByOpportunityId = new Map<string, string>();
  for (const opportunity of opportunities.data) {
    let segment = "Unknown";
    if (segmentDimension === "SOURCE") segment = (opportunity.leadId && leadSourceById.get(opportunity.leadId)) || "Unknown";
    else if (segmentDimension === "OWNER") segment = (opportunity.ownerId && userNameById.get(opportunity.ownerId)) || "Unassigned";
    else if (segmentDimension === "OPPORTUNITY_TYPE") segment = (opportunity.opportunityTypeId && typeNameById.get(opportunity.opportunityTypeId)) || "Unknown";
    else if (segmentDimension === "PARTNER") segment = partnerNameByOpportunityId.get(opportunity.id) || "No Partner";
    segmentByOpportunityId.set(opportunity.id, segment);
  }

  return calculateFunnelExplorerReport(opportunities.data, stageHistory, reasonLostByOpportunityId, segmentByOpportunityId, segmentDimension, new Date());
}

// --- Segment Comparison (gap checklist Module 17, item 8's own core remaining gap: "a user
// picking any two arbitrary segments and diffing them side by side" -- the cohort/funnel
// explorers above already bucket by these same dimensions, but always as one full breakdown,
// never as a direct two-segment diff). Deliberately allows comparing across mismatched
// dimensions/levels (e.g. a LEAD SOURCE segment vs. an OPPORTUNITY PARTNER segment), per
// explicit user direction -- the common metric set below (recordCount/wonCount/wonRate/
// avgDealValue) is what stays meaningful regardless of which level or dimension a segment
// came from, unlike the segment's own internal fields which differ by level. ---
export type ComparisonLevel = "LEAD" | "OPPORTUNITY";
export const LEAD_COMPARISON_DIMENSIONS = ["SOURCE", "CAMPAIGN", "SCORE_BAND", "OWNER"] as const;
export const OPPORTUNITY_COMPARISON_DIMENSIONS = ["SOURCE", "OWNER", "OPPORTUNITY_TYPE", "PARTNER", "STAGE"] as const;

export type ComparisonSegmentInput = {
  level: ComparisonLevel;
  dimension: string;
  value: string;
};

export type ComparisonSegmentResult = ComparisonSegmentInput & {
  recordCount: number;
  wonCount: number;
  wonRate: number | null;
  avgDealValue: number | null;
};

export type SegmentComparisonReport = {
  reportKey: "segment_comparison";
  generatedAt: string;
  segments: [ComparisonSegmentResult, ComparisonSegmentResult];
};

async function resolveLeadDimensionMap(user: TenantUser, dimension: string, leads: any[], users: any[]): Promise<Map<string, string>> {
  if (dimension === "SOURCE") return new Map(leads.map((lead: any) => [lead.id, lead.source || "Unknown"]));
  if (dimension === "CAMPAIGN") {
    const campaignLookup = await getLeadCampaignLookup(user);
    return new Map(leads.map((lead: any) => [lead.id, campaignLookup.valuesByLeadId.get(lead.id) || "Unknown"]));
  }
  if (dimension === "SCORE_BAND") {
    const scoreRows = user.tenantId
      ? await pgQuery<{ recordId: string; scoreBand: string }>(
          `select distinct on ("recordId") "recordId", "scoreBand"
           from "RecordScore"
           where "tenantId" = $1 and "recordType" = 'LEAD'
           order by "recordId", "calculatedAt" desc`,
          [user.tenantId],
        )
      : [];
    const scoreBandByLeadId = new Map(scoreRows.map((row) => [row.recordId, row.scoreBand]));
    return new Map(leads.map((lead: any) => [lead.id, scoreBandByLeadId.get(lead.id) || "Unscored"]));
  }
  if (dimension === "OWNER") {
    const nameById = new Map(users.map((u: any) => [u.id, u.name || u.email || u.id]));
    return new Map(leads.map((lead: any) => [lead.id, lead.ownerId ? nameById.get(lead.ownerId) ?? lead.ownerId : "Unassigned"]));
  }
  throw new Error(`Unsupported lead comparison dimension: ${dimension}`);
}

async function resolveOpportunityDimensionMap(
  user: TenantUser,
  dimension: string,
  opportunities: any[],
  opportunityTypes: any[],
  users: any[],
  leads: any[],
): Promise<Map<string, string>> {
  if (dimension === "STAGE") return new Map(opportunities.map((o: any) => [o.id, o.stage?.name || "Unassigned"]));
  if (dimension === "OWNER") {
    const nameById = new Map(users.map((u: any) => [u.id, u.name || u.email || u.id]));
    return new Map(opportunities.map((o: any) => [o.id, o.ownerId ? nameById.get(o.ownerId) ?? "Unassigned" : "Unassigned"]));
  }
  if (dimension === "OPPORTUNITY_TYPE") {
    const typeNameById = new Map(opportunityTypes.map((t: any) => [t.id, t.name]));
    return new Map(opportunities.map((o: any) => [o.id, o.opportunityTypeId ? typeNameById.get(o.opportunityTypeId) ?? "Unknown" : "Unknown"]));
  }
  if (dimension === "SOURCE") {
    const leadSourceById = new Map(leads.map((l: any) => [l.id, l.source || "Unknown"]));
    return new Map(opportunities.map((o: any) => [o.id, o.leadId ? leadSourceById.get(o.leadId) ?? "Unknown" : "Unknown"]));
  }
  if (dimension === "PARTNER") {
    // Same CommissionLedger resolution as the funnel explorer's own PARTNER dimension -- see
    // that function's comment for the schema facts behind this join.
    const opportunityIds = opportunities.map((o: any) => o.id);
    const partnerNameByOpportunityId = new Map<string, string>();
    if (user.tenantId && opportunityIds.length) {
      for (let index = 0; index < opportunityIds.length; index += 100) {
        const chunk = opportunityIds.slice(index, index + 100);
        const rows = await pgQuery<{ opportunityId: string; partnerName: string }>(
          `select cl."opportunityId", coalesce(pp."legalBusinessName", u.name, u.email, cl."partnerId") as "partnerName"
           from (
             select distinct on ("opportunityId") "opportunityId", "partnerId"
             from "CommissionLedger"
             where "tenantId" = $1 and "opportunityId" = any($2::text[])
             order by "opportunityId", "createdAt" desc
           ) cl
           left join "User" u on u.id = cl."partnerId"
           left join "PartnerProfile" pp on pp."userId" = cl."partnerId"`,
          [user.tenantId, chunk],
        );
        for (const row of rows) partnerNameByOpportunityId.set(row.opportunityId, row.partnerName);
      }
    }
    return new Map(opportunities.map((o: any) => [o.id, partnerNameByOpportunityId.get(o.id) || "No Partner"]));
  }
  throw new Error(`Unsupported opportunity comparison dimension: ${dimension}`);
}

async function resolveComparisonSegment(
  user: TenantUser,
  segment: ComparisonSegmentInput,
  leads: any[],
  opportunities: any[],
  opportunityTypes: any[],
  users: any[],
  opportunitiesByLeadId: Map<string, any[]>,
): Promise<ComparisonSegmentResult> {
  if (segment.level === "LEAD") {
    if (!(LEAD_COMPARISON_DIMENSIONS as readonly string[]).includes(segment.dimension)) {
      throw new Error(`Unsupported lead comparison dimension: ${segment.dimension}`);
    }
    const dimensionValueByLeadId = await resolveLeadDimensionMap(user, segment.dimension, leads, users);
    const matchingLeads = leads.filter((lead: any) => (dimensionValueByLeadId.get(lead.id) ?? "Unknown") === segment.value);
    // A lead "won" if it has produced at least one won Opportunity -- Lead itself has no won
    // concept of its own, that only exists at the Opportunity/stage level.
    const wonOpportunities = matchingLeads.flatMap((lead: any) => opportunitiesByLeadId.get(lead.id) ?? []).filter((o: any) => o.stage?.isWon);
    const wonCount = new Set(wonOpportunities.map((o: any) => o.leadId)).size;
    const recordCount = matchingLeads.length;
    return {
      ...segment,
      recordCount,
      wonCount,
      wonRate: recordCount ? Math.round((wonCount / recordCount) * 10000) / 10000 : null,
      avgDealValue: wonOpportunities.length
        ? Math.round((wonOpportunities.reduce((sum: number, o: any) => sum + Number(o.amount ?? 0), 0) / wonOpportunities.length) * 100) / 100
        : null,
    };
  }

  if (!(OPPORTUNITY_COMPARISON_DIMENSIONS as readonly string[]).includes(segment.dimension)) {
    throw new Error(`Unsupported opportunity comparison dimension: ${segment.dimension}`);
  }
  const dimensionValueByOpportunityId = await resolveOpportunityDimensionMap(user, segment.dimension, opportunities, opportunityTypes, users, leads);
  const matching = opportunities.filter((o: any) => (dimensionValueByOpportunityId.get(o.id) ?? "Unknown") === segment.value);
  const won = matching.filter((o: any) => o.stage?.isWon);
  return {
    ...segment,
    recordCount: matching.length,
    wonCount: won.length,
    wonRate: matching.length ? Math.round((won.length / matching.length) * 10000) / 10000 : null,
    avgDealValue: won.length ? Math.round((won.reduce((sum: number, o: any) => sum + Number(o.amount ?? 0), 0) / won.length) * 100) / 100 : null,
  };
}

export async function getSegmentComparisonReportForTenant(
  user: TenantUser,
  segmentA: ComparisonSegmentInput,
  segmentB: ComparisonSegmentInput,
): Promise<SegmentComparisonReport> {
  const [leads, opportunities, opportunityTypes, users] = await Promise.all([
    listLeadsForTenant(user, 1, 1000),
    listOpportunitiesForTenant(user, 1000),
    listOpportunityTypesForTenant(user),
    listTenantUsers(user),
  ]);

  const opportunitiesByLeadId = new Map<string, any[]>();
  for (const opportunity of opportunities.data as any[]) {
    if (!opportunity.leadId) continue;
    const list = opportunitiesByLeadId.get(opportunity.leadId) ?? [];
    list.push(opportunity);
    opportunitiesByLeadId.set(opportunity.leadId, list);
  }

  const [resultA, resultB] = await Promise.all([
    resolveComparisonSegment(user, segmentA, leads.data, opportunities.data, opportunityTypes, users, opportunitiesByLeadId),
    resolveComparisonSegment(user, segmentB, leads.data, opportunities.data, opportunityTypes, users, opportunitiesByLeadId),
  ]);

  return { reportKey: "segment_comparison", generatedAt: new Date().toISOString(), segments: [resultA, resultB] };
}

// --- Anomaly Detection (gap checklist Module 17, item 9). Per explicit user direction: all 7
// named domains at once, sharing one rolling-average ± standard-deviation baseline/threshold
// method rather than a bespoke heuristic per domain. Each domain is reduced to one daily count
// (or daily average, for scoring drift) over a trailing window; the baseline is the mean/stddev
// of every day in the window EXCEPT the most recent one, and the most recent day is flagged
// anomalous when it falls `ANOMALY_STD_DEV_THRESHOLD` standard deviations outside that baseline
// in either direction. ---
export type AnomalyDomain =
  | "LEAD_VOLUME"
  | "CONVERSIONS"
  | "SLA_BREACHES"
  | "PAYOUT_AMOUNT"
  | "CAMPAIGN_PERFORMANCE"
  | "SCORING_DRIFT"
  | "SERVICE_BACKLOG";

export type AnomalySeriesPoint = { date: string; value: number };

export type AnomalyDomainResult = {
  domain: AnomalyDomain;
  series: AnomalySeriesPoint[];
  baselineMean: number;
  baselineStdDev: number;
  latestValue: number;
  latestDate: string | null;
  isAnomaly: boolean;
  direction: "SPIKE" | "DROP" | null;
  deviationInStdDevs: number;
};

export type AnomalyDetectionReport = {
  reportKey: "anomaly_detection";
  generatedAt: string;
  windowDays: number;
  domains: AnomalyDomainResult[];
};

const ANOMALY_WINDOW_DAYS = 15; // 14 baseline days + the 1 evaluated ("today") day
const ANOMALY_STD_DEV_THRESHOLD = 2;

// Pure -- unit-testable without a DB. `series` must already be dense (one point per calendar
// day, gaps 0-filled) and end with the day being evaluated.
export function detectAnomalyFromDailySeries(domain: AnomalyDomain, series: AnomalySeriesPoint[]): AnomalyDomainResult {
  const latest = series[series.length - 1];
  if (series.length < 3) {
    // Not enough history to establish a meaningful baseline -- report the series, not a verdict.
    return {
      domain, series, baselineMean: 0, baselineStdDev: 0,
      latestValue: latest?.value ?? 0, latestDate: latest?.date ?? null,
      isAnomaly: false, direction: null, deviationInStdDevs: 0,
    };
  }
  const baselinePoints = series.slice(0, -1);
  const mean = baselinePoints.reduce((sum, point) => sum + point.value, 0) / baselinePoints.length;
  const variance = baselinePoints.reduce((sum, point) => sum + (point.value - mean) ** 2, 0) / baselinePoints.length;
  const stdDev = Math.sqrt(variance);
  // A zero-variance baseline (every prior day identical) can't express "how many standard
  // deviations away" -- but that doesn't mean nothing changed: any departure from a perfectly
  // flat baseline is still a real anomaly (e.g. 14 days flat at 10, then a sudden 100), just one
  // this metric can't quantify in stddev terms. deviationInStdDevs stays 0 in that case (there's
  // no meaningful number to report), while isAnomaly/direction still reflect the real change.
  const deviation = stdDev > 0 ? (latest.value - mean) / stdDev : 0;
  const isAnomaly = stdDev > 0 ? Math.abs(deviation) >= ANOMALY_STD_DEV_THRESHOLD : latest.value !== mean;
  return {
    domain,
    series,
    baselineMean: Math.round(mean * 100) / 100,
    baselineStdDev: Math.round(stdDev * 100) / 100,
    latestValue: latest.value,
    latestDate: latest.date,
    isAnomaly,
    direction: isAnomaly ? (latest.value > mean ? "SPIKE" : "DROP") : null,
    deviationInStdDevs: Math.round(deviation * 100) / 100,
  };
}

// Dense-fills a sparse day->value row list into exactly `windowDays` consecutive calendar days
// ending "today" (UTC calendar days). Deliberately UTC, not server-local time: a real bug
// caught while writing this function's own test -- this dev/test environment's local timezone
// is Asia/Calcutta (UTC+5:30), and using local-time `setHours`/`setDate` while reading the
// result back via `toISOString()` (always UTC) shifted every bucketed day by up to 24 hours,
// exactly the kind of "correct on a UTC server, silently wrong on a non-UTC machine" bug this
// whole method needs to not depend on. Postgres's own `date_trunc('day', ...)` below runs in
// the DB session's timezone (UTC in this setup), so UTC on both sides keeps them consistent --
// not tenant-timezone-aware, same documented limitation every other date-bucketed report in
// this file already carries.
export function fillDailySeries(rows: Array<{ day: string; value: number | string }>, windowDays: number, now: Date): AnomalySeriesPoint[] {
  const byDay = new Map(rows.map((row) => [String(row.day).slice(0, 10), Number(row.value)]));
  const series: AnomalySeriesPoint[] = [];
  for (let offset = windowDays - 1; offset >= 0; offset--) {
    const day = new Date(now);
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - offset);
    const key = day.toISOString().slice(0, 10);
    series.push({ date: key, value: byDay.get(key) ?? 0 });
  }
  return series;
}

export async function getAnomalyDetectionReportForTenant(user: TenantUser): Promise<AnomalyDetectionReport> {
  const now = new Date();
  const empty: AnomalyDetectionReport = { reportKey: "anomaly_detection", generatedAt: now.toISOString(), windowDays: ANOMALY_WINDOW_DAYS, domains: [] };
  if (!user.tenantId) return empty;

  const windowStart = new Date(now);
  windowStart.setUTCHours(0, 0, 0, 0);
  windowStart.setUTCDate(windowStart.getUTCDate() - (ANOMALY_WINDOW_DAYS - 1));

  const [leadRows, wonRows, slaRows, payoutRows, campaignRows, scoreRows, caseCreatedRows, caseResolvedRows] = await Promise.all([
    pgQuery<{ day: string; value: string }>(
      `select date_trunc('day', "createdAt")::date::text as day, count(*)::int as value
       from "Lead" where "tenantId" = $1 and "createdAt" >= $2 group by day`,
      [user.tenantId, windowStart.toISOString()],
    ),
    pgQuery<{ day: string; value: string }>(
      `select date_trunc('day', h."changedAt")::date::text as day, count(*)::int as value
       from "OpportunityStageHistory" h
       join "StageDefinition" s on s.id = h."toStageId"
       where h."tenantId" = $1 and s."isWon" = true and h."changedAt" >= $2 group by day`,
      [user.tenantId, windowStart.toISOString()],
    ),
    pgQuery<{ day: string; value: string }>(
      `select date_trunc('day', "dueAt")::date::text as day, count(*)::int as value
       from "Activity" where "tenantId" = $1 and "slaStatus" = 'BREACHED' and "dueAt" >= $2 group by day`,
      [user.tenantId, windowStart.toISOString()],
    ),
    pgQuery<{ day: string; value: string }>(
      `select date_trunc('day', "createdAt")::date::text as day, coalesce(sum("commissionAmount"), 0)::float as value
       from "CommissionLedger" where "tenantId" = $1 and "entryType" = 'EARNED' and "createdAt" >= $2 group by day`,
      [user.tenantId, windowStart.toISOString()],
    ),
    pgQuery<{ day: string; value: string }>(
      `select date_trunc('day', "occurredAt")::date::text as day, count(*)::int as value
       from "MarketingAttributionTouch" where "tenantId" = $1 and "touchType" = 'CONVERSION' and "occurredAt" >= $2 group by day`,
      [user.tenantId, windowStart.toISOString()],
    ),
    pgQuery<{ day: string; value: string }>(
      `select date_trunc('day', "calculatedAt")::date::text as day, coalesce(avg("conversionProbability"), 0)::float as value
       from "RecordScore" where "tenantId" = $1 and "calculatedAt" >= $2 group by day`,
      [user.tenantId, windowStart.toISOString()],
    ),
    pgQuery<{ day: string; value: string }>(
      `select date_trunc('day', "createdAt")::date::text as day, count(*)::int as value
       from "Case" where "tenantId" = $1 and "createdAt" >= $2 group by day`,
      [user.tenantId, windowStart.toISOString()],
    ),
    pgQuery<{ day: string; value: string }>(
      `select date_trunc('day', "resolvedAt")::date::text as day, count(*)::int as value
       from "Case" where "tenantId" = $1 and "resolvedAt" is not null and "resolvedAt" >= $2 group by day`,
      [user.tenantId, windowStart.toISOString()],
    ),
  ]);

  // Service backlog growth = cases created minus cases resolved, per day -- a real proxy for
  // "is the backlog growing or shrinking," not a snapshot open-case count (reconstructing a
  // true point-in-time open count would need full status-transition history, which doesn't
  // exist as its own table here). Telephony call volume is deliberately NOT folded into this
  // domain: TelephonyCallLog logs completed calls, not a pending queue, so it has no real
  // "backlog" concept of its own to combine with case backlog -- the checklist's combined
  // "telephony/case backlog" naming is honored by scope (this is the one domain covering both
  // service-desk surfaces named there), not by literally blending two incompatible signals.
  const createdByDay = new Map(caseCreatedRows.map((row) => [row.day.slice(0, 10), Number(row.value)]));
  const resolvedByDay = new Map(caseResolvedRows.map((row) => [row.day.slice(0, 10), Number(row.value)]));
  const backlogRows = [...new Set([...createdByDay.keys(), ...resolvedByDay.keys()])].map((day) => ({
    day,
    value: (createdByDay.get(day) ?? 0) - (resolvedByDay.get(day) ?? 0),
  }));

  const domains: AnomalyDomainResult[] = [
    detectAnomalyFromDailySeries("LEAD_VOLUME", fillDailySeries(leadRows, ANOMALY_WINDOW_DAYS, now)),
    detectAnomalyFromDailySeries("CONVERSIONS", fillDailySeries(wonRows, ANOMALY_WINDOW_DAYS, now)),
    detectAnomalyFromDailySeries("SLA_BREACHES", fillDailySeries(slaRows, ANOMALY_WINDOW_DAYS, now)),
    detectAnomalyFromDailySeries("PAYOUT_AMOUNT", fillDailySeries(payoutRows, ANOMALY_WINDOW_DAYS, now)),
    detectAnomalyFromDailySeries("CAMPAIGN_PERFORMANCE", fillDailySeries(campaignRows, ANOMALY_WINDOW_DAYS, now)),
    detectAnomalyFromDailySeries("SCORING_DRIFT", fillDailySeries(scoreRows, ANOMALY_WINDOW_DAYS, now)),
    detectAnomalyFromDailySeries("SERVICE_BACKLOG", fillDailySeries(backlogRows, ANOMALY_WINDOW_DAYS, now)),
  ];

  return { reportKey: "anomaly_detection", generatedAt: now.toISOString(), windowDays: ANOMALY_WINDOW_DAYS, domains };
}

// --- Forecasting-lite (gap checklist Module 17, item 10). Per explicit user direction: all 4
// buildable domains at once (expected applications/enrollments/projected fee collection stay
// unbuilt -- no Application/Product Catalog schema exists anywhere, Module 12), using a linear
// regression trend projection (not a simple moving average, also per user direction). Reuses
// `fillDailySeries` from the anomaly-detection work above -- same dense-daily-series shape,
// just a longer history window and a trend fit instead of a baseline-deviation check. ---
export type ForecastDomain = "CAMPAIGN_VOLUME" | "TASK_BACKLOG" | "SLA_BREACH_RISK" | "PARTNER_PAYOUT_PROJECTION";

export type ForecastPoint = { date: string; value: number };

export type ForecastDomainResult = {
  domain: ForecastDomain;
  history: ForecastPoint[];
  forecast: ForecastPoint[];
  slope: number;
  intercept: number;
};

export type ForecastReport = {
  reportKey: "forecast";
  generatedAt: string;
  historyDays: number;
  horizonDays: number;
  domains: ForecastDomainResult[];
};

const FORECAST_HISTORY_DAYS = 30;
const FORECAST_HORIZON_DAYS = 7;

// Pure ordinary-least-squares fit over evenly-spaced points (x = 0..n-1), then projects
// `horizonDays` points beyond the series. Projected values are clamped to >= 0 -- none of these
// 4 domains (volume/backlog/risk/payout counts) can be meaningfully negative, and an
// unclamped downward trend would otherwise happily project a negative count.
export function projectLinearTrend(history: ForecastPoint[], horizonDays: number): { forecast: ForecastPoint[]; slope: number; intercept: number } {
  const n = history.length;
  if (n < 2 || horizonDays <= 0) return { forecast: [], slope: 0, intercept: history[0]?.value ?? 0 };

  const meanX = (n - 1) / 2;
  const meanY = history.reduce((sum, point) => sum + point.value, 0) / n;
  let numerator = 0;
  let denominator = 0;
  history.forEach((point, x) => {
    numerator += (x - meanX) * (point.value - meanY);
    denominator += (x - meanX) ** 2;
  });
  const slope = denominator !== 0 ? numerator / denominator : 0;
  const intercept = meanY - slope * meanX;

  const lastDate = new Date(`${history[n - 1].date}T00:00:00.000Z`);
  const forecast: ForecastPoint[] = [];
  for (let step = 1; step <= horizonDays; step++) {
    const x = n - 1 + step;
    const projected = Math.max(0, Math.round((intercept + slope * x) * 100) / 100);
    const date = new Date(lastDate);
    date.setUTCDate(date.getUTCDate() + step);
    forecast.push({ date: date.toISOString().slice(0, 10), value: projected });
  }
  return { forecast, slope: Math.round(slope * 10000) / 10000, intercept: Math.round(intercept * 100) / 100 };
}

function buildForecastDomain(domain: ForecastDomain, history: ForecastPoint[]): ForecastDomainResult {
  const { forecast, slope, intercept } = projectLinearTrend(history, FORECAST_HORIZON_DAYS);
  return { domain, history, forecast, slope, intercept };
}

export async function getForecastReportForTenant(user: TenantUser): Promise<ForecastReport> {
  const now = new Date();
  const empty: ForecastReport = { reportKey: "forecast", generatedAt: now.toISOString(), historyDays: FORECAST_HISTORY_DAYS, horizonDays: FORECAST_HORIZON_DAYS, domains: [] };
  if (!user.tenantId) return empty;

  const windowStart = new Date(now);
  windowStart.setUTCHours(0, 0, 0, 0);
  windowStart.setUTCDate(windowStart.getUTCDate() - (FORECAST_HISTORY_DAYS - 1));

  const [campaignRows, taskCreatedRows, taskCompletedRows, slaRows, payoutRows] = await Promise.all([
    pgQuery<{ day: string; value: string }>(
      `select date_trunc('day', "occurredAt")::date::text as day, count(*)::int as value
       from "MarketingAttributionTouch" where "tenantId" = $1 and "touchType" = 'TOUCH' and "occurredAt" >= $2 group by day`,
      [user.tenantId, windowStart.toISOString()],
    ),
    pgQuery<{ day: string; value: string }>(
      `select date_trunc('day', "createdAt")::date::text as day, count(*)::int as value
       from "Task" where "tenantId" = $1 and "createdAt" >= $2 group by day`,
      [user.tenantId, windowStart.toISOString()],
    ),
    pgQuery<{ day: string; value: string }>(
      `select date_trunc('day', "completedAt")::date::text as day, count(*)::int as value
       from "Task" where "tenantId" = $1 and "completedAt" is not null and "completedAt" >= $2 group by day`,
      [user.tenantId, windowStart.toISOString()],
    ),
    pgQuery<{ day: string; value: string }>(
      `select date_trunc('day', "dueAt")::date::text as day, count(*)::int as value
       from "Activity" where "tenantId" = $1 and "slaStatus" = 'BREACHED' and "dueAt" >= $2 group by day`,
      [user.tenantId, windowStart.toISOString()],
    ),
    pgQuery<{ day: string; value: string }>(
      `select date_trunc('day', "createdAt")::date::text as day, coalesce(sum("commissionAmount"), 0)::float as value
       from "CommissionLedger" where "tenantId" = $1 and "entryType" = 'EARNED' and "createdAt" >= $2 group by day`,
      [user.tenantId, windowStart.toISOString()],
    ),
  ]);

  // Task backlog growth = created minus completed, per day -- same "growth, not snapshot" proxy
  // anomaly detection's SERVICE_BACKLOG domain already uses for Case, for the same reason
  // (no full status-transition history table exists to reconstruct a true point-in-time count).
  const createdByDay = new Map(taskCreatedRows.map((row) => [row.day.slice(0, 10), Number(row.value)]));
  const completedByDay = new Map(taskCompletedRows.map((row) => [row.day.slice(0, 10), Number(row.value)]));
  const taskBacklogRows = [...new Set([...createdByDay.keys(), ...completedByDay.keys()])].map((day) => ({
    day,
    value: (createdByDay.get(day) ?? 0) - (completedByDay.get(day) ?? 0),
  }));

  const domains: ForecastDomainResult[] = [
    buildForecastDomain("CAMPAIGN_VOLUME", fillDailySeries(campaignRows, FORECAST_HISTORY_DAYS, now)),
    buildForecastDomain("TASK_BACKLOG", fillDailySeries(taskBacklogRows, FORECAST_HISTORY_DAYS, now)),
    buildForecastDomain("SLA_BREACH_RISK", fillDailySeries(slaRows, FORECAST_HISTORY_DAYS, now)),
    buildForecastDomain("PARTNER_PAYOUT_PROJECTION", fillDailySeries(payoutRows, FORECAST_HISTORY_DAYS, now)),
  ];

  return { reportKey: "forecast", generatedAt: now.toISOString(), historyDays: FORECAST_HISTORY_DAYS, horizonDays: FORECAST_HORIZON_DAYS, domains };
}

// --- Executive Scorecard (gap checklist Module 17, item 12). Per explicit user direction: one
// single combined scorecard (not per-persona surfaces), aggregating the 8 buildable areas into
// one glanceable page rather than a from-scratch analytics engine -- the underlying data for
// all 8 already exists as separate, real inbuilt reports (built across this and earlier
// passes); this just pulls a handful of key metrics out of each into one shape. "Admissions
// summary" (the 9th named area) stays excluded -- no Application schema exists to summarize
// admissions from (Module 12). Sensitive by nature (marketing spend, payout exposure, partner
// commission) -- gated the same way `campaign_roi` already is, via the same
// `assertSensitiveReportAccess` check, rather than inventing a second sensitivity gate.
export type ExecutiveScorecardMetric = { label: string; value: unknown };
export type ExecutiveScorecardSection = { key: string; label: string; metrics: ExecutiveScorecardMetric[] };
export type ExecutiveScorecardReport = {
  reportKey: "executive_scorecard";
  generatedAt: string;
  sections: ExecutiveScorecardSection[];
};

export async function getExecutiveScorecardReportForTenant(user: TenantUser): Promise<ExecutiveScorecardReport> {
  assertSensitiveReportAccess(user, "campaign_roi");
  const now = new Date().toISOString();
  if (!user.tenantId) return { reportKey: "executive_scorecard", generatedAt: now, sections: [] };

  const [campaignRoi, repPerformance, payoutSummary, telephony, caseAnalytics, dataQuality] = await Promise.all([
    getCampaignRoiReportForTenant(user),
    getRepPerformanceReportForTenant(user),
    getCommissionPayoutSummaryReportForTenant(user),
    getTelephonyCallPerformanceReportForTenant(user),
    getCaseAnalyticsReportForTenant(user),
    getDataQualityReportForTenant(user),
  ]);
  // Dynamic import, matching this function's own getScopeCostSummary/marketing-cost.ts pattern
  // right above -- avoids a static dependency on self-learning-scoring.ts just for this one call.
  const { listScoringModelVersionsForTenant } = await import("@/lib/server/self-learning-scoring");
  const scoringModels = await listScoringModelVersionsForTenant(user).catch(() => [] as any[]);

  const totalActual = campaignRoi.journeys.reduce((sum: number, journey: any) => sum + Number(journey.actualSpend ?? 0), 0);
  const totalRevenue = campaignRoi.journeys.reduce((sum: number, journey: any) => sum + Number(journey.attributedRevenue ?? 0), 0);
  const promotedVersions = scoringModels.flatMap((model: any) => (model.versions ?? []).filter((v: any) => v.status === "PROMOTED"));

  const sections: ExecutiveScorecardSection[] = [
    {
      key: "marketing_roi",
      label: "Marketing ROI",
      metrics: [
        { label: "Journeys tracked", value: campaignRoi.journeys.length },
        { label: "Total spend", value: Math.round(totalActual * 100) / 100 },
        { label: "Total attributed revenue", value: Math.round(totalRevenue * 100) / 100 },
      ],
    },
    {
      key: "counselor_productivity",
      label: "Counselor / Rep Productivity",
      metrics: [
        { label: "Reps tracked", value: repPerformance.rows.length },
        { label: "Won opportunities (all reps)", value: repPerformance.rows.reduce((sum, row) => sum + row.wonOpportunities, 0) },
        { label: "Activities created (all reps)", value: repPerformance.rows.reduce((sum, row) => sum + row.activitiesCreated, 0) },
      ],
    },
    {
      key: "partner_performance",
      label: "Partner Performance",
      metrics: [
        { label: "Net commission", value: payoutSummary.totals.netCommission },
        { label: "Ledger entries", value: payoutSummary.totals.ledgerEntries },
      ],
    },
    {
      key: "payout_exposure",
      label: "Payout Exposure",
      metrics: [
        { label: "Draft payout", value: payoutSummary.totals.draftPayout },
        { label: "Approved payout", value: payoutSummary.totals.approvedPayout },
        { label: "Invoiced payout", value: payoutSummary.totals.invoicedPayout },
        { label: "Paid payout", value: payoutSummary.totals.paidPayout },
      ],
    },
    {
      key: "scoring_quality",
      label: "Scoring Quality",
      metrics: [
        { label: "Scoring models", value: scoringModels.length },
        { label: "Promoted model versions", value: promotedVersions.length },
      ],
    },
    {
      key: "service_case_sla",
      label: "Service / Case SLA",
      metrics: [
        { label: "Open cases", value: caseAnalytics.totals.openCases },
        { label: "First response breached", value: caseAnalytics.totals.firstResponseBreached },
        { label: "Resolution breached", value: caseAnalytics.totals.resolutionBreached },
        { label: "Reopen rate", value: caseAnalytics.totals.reopenRate },
      ],
    },
    {
      key: "telephony_performance",
      label: "Telephony Performance",
      metrics: [
        { label: "Total calls", value: telephony.totals.totalCalls },
        { label: "Answer rate", value: telephony.totals.answerRate },
        { label: "Avg duration (seconds)", value: telephony.totals.avgDurationSeconds },
      ],
    },
    {
      key: "data_quality",
      label: "Data Quality",
      metrics: [
        { label: "Duplicate leads", value: dataQuality.totals.duplicateLeads },
        { label: "Stale leads", value: dataQuality.totals.staleLeads },
        { label: "Missing owner", value: dataQuality.totals.missingOwner },
        { label: "SLA breaches", value: dataQuality.totals.slaBreaches },
      ],
    },
  ];

  return { reportKey: "executive_scorecard", generatedAt: now, sections };
}

// --- Period Comparison (gap checklist Module 17, item 8's "segmentation and comparison
// tools" -- specifically the "time periods" comparison, the one named sub-item with no
// equivalent anywhere else in this file: the cohort/funnel explorers above compare by
// source/campaign/score-band/owner/opportunity-type, never by two arbitrary date ranges). ---
export type PeriodComparisonPreset = "THIS_MONTH_VS_LAST" | "THIS_WEEK_VS_LAST" | "THIS_QUARTER_VS_LAST";

export type PeriodComparisonBucket = {
  start: string;
  end: string;
  leadsCreated: number;
  opportunitiesCreated: number;
  opportunitiesWon: number;
  wonValue: number;
  winRate: number | null;
};

export type PeriodComparisonReport = {
  reportKey: "period_comparison";
  generatedAt: string;
  current: PeriodComparisonBucket;
  previous: PeriodComparisonBucket;
  // Percent change, current vs. previous (e.g. 25 means +25%). Null when the previous period's
  // value was 0 (no baseline to compute a percentage against, including a 0 -> 0 change) or an
  // underlying rate itself couldn't be computed (see winRate on each bucket).
  percentChange: {
    leadsCreated: number | null;
    opportunitiesCreated: number | null;
    opportunitiesWon: number | null;
    wonValue: number | null;
    winRate: number | null;
  };
};

function periodRangeForPreset(preset: PeriodComparisonPreset, now: Date): { current: { start: Date; end: Date }; previous: { start: Date; end: Date } } {
  if (preset === "THIS_WEEK_VS_LAST") {
    const dayOfWeek = now.getDay();
    const currentStart = new Date(now);
    currentStart.setHours(0, 0, 0, 0);
    currentStart.setDate(currentStart.getDate() - dayOfWeek);
    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - 7);
    return { current: { start: currentStart, end: now }, previous: { start: previousStart, end: currentStart } };
  }
  if (preset === "THIS_QUARTER_VS_LAST") {
    const quarter = Math.floor(now.getMonth() / 3);
    const currentStart = new Date(now.getFullYear(), quarter * 3, 1);
    const previousStart = new Date(now.getFullYear(), quarter * 3 - 3, 1);
    return { current: { start: currentStart, end: now }, previous: { start: previousStart, end: currentStart } };
  }
  // THIS_MONTH_VS_LAST (default)
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { current: { start: currentStart, end: now }, previous: { start: previousStart, end: currentStart } };
}

// Null when there's no baseline to compute a percentage against (previous === 0) -- rather
// than fabricating an infinite or arbitrary growth rate for a "0 -> N" change.
function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

export function calculatePeriodComparisonReport(
  leads: any[],
  opportunities: any[],
  currentRange: { start: Date; end: Date },
  previousRange: { start: Date; end: Date },
  generatedAt: Date
): PeriodComparisonReport {
  function summarize(range: { start: Date; end: Date }): PeriodComparisonBucket {
    const startMs = range.start.getTime();
    const endMs = range.end.getTime();
    const inRange = (createdAt: unknown) => {
      const time = new Date(createdAt as string).getTime();
      return Number.isFinite(time) && time >= startMs && time < endMs;
    };
    const leadsCreated = leads.filter((lead) => inRange(lead.createdAt)).length;
    const periodOpportunities = opportunities.filter((opportunity) => inRange(opportunity.createdAt));
    const won = periodOpportunities.filter((opportunity) => Boolean(opportunity.stage?.isWon));
    const wonValue = won.reduce((sum, opportunity) => sum + Number(opportunity.amount ?? 0), 0);
    return {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      leadsCreated,
      opportunitiesCreated: periodOpportunities.length,
      opportunitiesWon: won.length,
      wonValue,
      winRate: periodOpportunities.length > 0 ? Math.round((won.length / periodOpportunities.length) * 10000) / 10000 : null,
    };
  }

  const current = summarize(currentRange);
  const previous = summarize(previousRange);

  return {
    reportKey: "period_comparison",
    generatedAt: generatedAt.toISOString(),
    current,
    previous,
    percentChange: {
      leadsCreated: percentChange(current.leadsCreated, previous.leadsCreated),
      opportunitiesCreated: percentChange(current.opportunitiesCreated, previous.opportunitiesCreated),
      opportunitiesWon: percentChange(current.opportunitiesWon, previous.opportunitiesWon),
      wonValue: percentChange(current.wonValue, previous.wonValue),
      winRate: current.winRate !== null && previous.winRate !== null ? percentChange(current.winRate, previous.winRate) : null,
    },
  };
}

// Same 1000-row cap every other report in this file uses -- if a tenant has more than 1000
// leads/opportunities total, a comparison against an older period than the most recent 1000
// rows can silently under-count. A real, pre-existing architectural characteristic of this
// whole file, not something new to this report.
export async function getPeriodComparisonReportForTenant(
  user: TenantUser,
  preset: PeriodComparisonPreset = "THIS_MONTH_VS_LAST"
): Promise<PeriodComparisonReport> {
  const [leads, opportunities] = await Promise.all([listLeadsForTenant(user, 1, 1000), listOpportunitiesForTenant(user, 1000)]);
  const { current, previous } = periodRangeForPreset(preset, new Date());
  return calculatePeriodComparisonReport(leads.data, opportunities.data, current, previous, new Date());
}

export async function getRepPerformanceReportForTenant(user: TenantUser): Promise<RepPerformanceReport> {
  const [leads, opportunities, activities, users] = await Promise.all([
    listLeadsForTenant(user, 1, 1000),
    listOpportunitiesForTenant(user, 1000),
    listActivitiesForTenant(user, 1000, null),
    listTenantUsers(user),
  ]);

  return calculateRepPerformanceReport(leads.data, opportunities.data, activities.data, users, new Date());
}

// Gap checklist Module 17's "embedded analytics surfaces" sub-item ("partner/counselor/team
// mini dashboards") -- reuses getRepPerformanceReportForTenant/calculateRepPerformanceReport
// entirely unchanged (no second aggregation pipeline), simply filtering its tenant-wide
// per-rep rows down to one team's own member set.
export async function getTeamPerformanceForTenant(user: TenantUser, memberUserIds: string[]) {
  const report = await getRepPerformanceReportForTenant(user);
  const memberIdSet = new Set(memberUserIds);
  const rows = report.rows.filter((row) => memberIdSet.has(row.repId));
  const totals = rows.reduce(
    (acc, row) => ({
      leadsOwned: acc.leadsOwned + row.leadsOwned,
      opportunitiesOwned: acc.opportunitiesOwned + row.opportunitiesOwned,
      wonOpportunities: acc.wonOpportunities + row.wonOpportunities,
      activitiesCreated: acc.activitiesCreated + row.activitiesCreated,
      callsCreated: acc.callsCreated + row.callsCreated,
    }),
    { leadsOwned: 0, opportunitiesOwned: 0, wonOpportunities: 0, activitiesCreated: 0, callsCreated: 0 },
  );
  return { rows, totals };
}

export async function getSlaResponseBreachReportForTenant(
  user: TenantUser,
  thresholdHours = 24
): Promise<SlaResponseBreachReport> {
  const [leads, activities, users] = await Promise.all([
    listLeadsForTenant(user, 1, 1000),
    listActivitiesForTenant(user, 1000, null),
    listTenantUsers(user),
  ]);

  return calculateSlaResponseBreachReport(leads.data, activities.data, users, thresholdHours, new Date());
}

export async function getTaskSlaPerformanceReportForTenant(user: TenantUser): Promise<TaskSlaPerformanceReport> {
  if (!user.tenantId) {
    return { reportKey: "task_sla_performance", generatedAt: new Date().toISOString(), totals: { totalTasks: 0, firstActionBreaches: 0, completionBreaches: 0, completionMet: 0 }, rows: [], byModule: [] };
  }

  // Flat fetch + JS-side bucketing (this codebase's reporting convention -- see
  // calculateSlaResponseBreachReport above) rather than SQL group by/join.
  const [tasks, users] = await Promise.all([
    pgQuery<any>(
      `select "id", "ownerId", "priority", "status", "leadId", "opportunityId", "activityId",
              "slaTarget", "firstActionSlaTarget", "firstActionAt", "slaStatus", "completedAt", "createdAt"
       from "Task" where "tenantId" = $1 order by "createdAt" desc limit 1000`,
      [user.tenantId],
    ),
    listTenantUsers(user),
  ]);

  const teamIds = [...new Set(users.map((row: any) => row.teamId).filter(Boolean))];
  const teamNameById = new Map<string, string>();
  if (teamIds.length > 0) {
    const teams = await pgQuery<any>('select id, name from "Team" where "tenantId" = $1 and id = any($2::text[])', [user.tenantId, teamIds]);
    teams.forEach((team: any) => teamNameById.set(team.id, team.name));
  }

  return calculateTaskSlaPerformanceReport(tasks, users, teamNameById, new Date());
}

export async function getAutomationPerformanceReportForTenant(user: TenantUser): Promise<AutomationPerformanceReport> {
  if (!user.tenantId) {
    return { reportKey: "automation_performance", generatedAt: new Date().toISOString(), totals: { totalRuns: 0, completed: 0, failed: 0, waiting: 0 }, rows: [] };
  }

  // Flat fetch + JS-side bucketing (this codebase's reporting convention) rather than SQL
  // group by/join -- mirrors getTaskSlaPerformanceReportForTenant above.
  const [automations, executions] = await Promise.all([
    pgQuery<any>('select id, name, "isActive" from "AutomationV2" where "tenantId" = $1 and "deletedAt" is null', [user.tenantId]),
    pgQuery<any>(
      'select id, "automationId", status, "startedAt", "completedAt" from "AutomationExecution" where "tenantId" = $1 order by "startedAt" desc limit 1000',
      [user.tenantId],
    ),
  ]);

  return calculateAutomationPerformanceReport(automations, executions, new Date());
}

// Executions already record which split-test branch a run took (executionLog.steps[].result,
// stamped by automationBranchLabelForNode at run time) -- this is a pure new report over
// existing data, no new instrumentation needed.
export async function getSplitTestPerformanceReportForTenant(user: TenantUser): Promise<SplitTestPerformanceReport> {
  if (!user.tenantId) {
    return { reportKey: "split_test_performance", generatedAt: new Date().toISOString(), totals: { totalSplitNodes: 0, totalExecutions: 0 }, rows: [] };
  }

  const [automations, executions] = await Promise.all([
    pgQuery<any>('select id, name from "AutomationV2" where "tenantId" = $1 and "deletedAt" is null', [user.tenantId]),
    pgQuery<any>(
      'select id, "automationId", status, "executionLog" from "AutomationExecution" where "tenantId" = $1 order by "startedAt" desc limit 1000',
      [user.tenantId],
    ),
  ]);

  return calculateSplitTestPerformanceReport(automations, executions, new Date());
}

// Tenant-wide (not per-form) by design: the Reports page's generic inbuilt-report runner has
// no per-report parameter UI (every other inbuilt report takes zero or one fixed default
// param), so this returns one row per (form, tab) instead of requiring a form picker --
// still genuinely useful, and rows naturally group by formId/tabIndex when sorted.
export async function getFormDropOffReportForTenant(user: TenantUser): Promise<FormDropOffReport> {
  if (!user.tenantId) {
    return { reportKey: "form_drop_off", generatedAt: new Date().toISOString(), totals: { totalForms: 0, totalSessions: 0, totalSubmissions: 0 }, rows: [] };
  }

  const [forms, events, submissionCounts] = await Promise.all([
    pgQuery<any>('select id, name, config from "Form" where "tenantId" = $1 and "deletedAt" is null', [user.tenantId]),
    pgQuery<any>(
      'select "formId", "sessionId", "tabId", "tabIndex" from "FormProgressEvent" where "tenantId" = $1 order by "createdAt" desc limit 5000',
      [user.tenantId],
    ),
    pgQuery<any>('select "formId", count(*)::int as count from "FormSubmission" where "tenantId" = $1 group by "formId"', [user.tenantId]),
  ]);

  return calculateFormDropOffReport(forms, events, submissionCounts, new Date());
}

export async function getLeadSourceRoiReportForTenant(user: TenantUser): Promise<LeadSourceRoiReport> {
  assertSensitiveReportAccess(user, "lead_source_roi");
  const [leads, opportunities] = await Promise.all([
    listLeadsForTenant(user, 1, 1000),
    listOpportunitiesForTenant(user, 1000),
  ]);

  return calculateLeadSourceRoiReport(leads.data, opportunities.data, new Date());
}

export async function getReassignmentImpactReportForTenant(
  user: TenantUser,
  thresholdHours = 24
): Promise<ReassignmentImpactReport> {
  const [leads, opportunities, activities, assignmentEvents] = await Promise.all([
    listLeadsForTenant(user, 1, 1000),
    listOpportunitiesForTenant(user, 1000),
    listActivitiesForTenant(user, 1000, null),
    listAssignmentEventsForTenant(user),
  ]);

  return calculateReassignmentImpactReport(
    leads.data,
    opportunities.data,
    activities.data,
    assignmentEvents,
    thresholdHours,
    new Date()
  );
}

// AuditLog action='ASSIGN' rows (written by distribution-engine.ts's writeAssignmentLog on
// every real distribution pick) already carry everything needed here -- no new
// instrumentation required, same flat-fetch + JS bucketing convention as every other report.
export async function getDistributionFairnessReportForTenant(user: TenantUser): Promise<DistributionFairnessReport> {
  if (!user.tenantId) {
    return { reportKey: "distribution_fairness", generatedAt: new Date().toISOString(), totals: { totalAssignments: 0, totalUsers: 0, meanPerUser: 0 }, rows: [] };
  }
  const [events, users] = await Promise.all([
    listAssignmentEventsForTenant(user),
    listTenantUsers(user),
  ]);
  return calculateDistributionFairnessReport(events, users, new Date());
}

export async function getActivityCallVolumeTrendReportForTenant(
  user: TenantUser,
  grain: "day" | "week" | "month" = "day",
  startDate?: string | null,
  endDate?: string | null
): Promise<ActivityCallVolumeTrendReport> {
  const activities = await listActivitiesForTenant(user, 1000, null);
  return calculateActivityCallVolumeTrendReport(activities.data, grain, startDate, endDate, new Date());
}

export async function getCommissionPayoutSummaryReportForTenant(
  user: TenantUser
): Promise<CommissionPayoutSummaryReport> {
  const data = await listCommissionPayoutSummaryInputs(user);
  return calculateCommissionPayoutSummaryReport(
    data.ledgerEntries,
    data.payouts,
    data.invoices,
    data.cycles,
    data.partners,
    data.partnerScoped,
    new Date()
  );
}

export async function getCohortReportForTenant(
  user: TenantUser,
  grain: "week" | "month" = "month",
  dimension: CohortDimension = "CREATED_DATE"
): Promise<CohortReport> {
  const [leads, opportunities, opportunityTypes] = await Promise.all([
    listLeadsForTenant(user, 1, 1000),
    listOpportunitiesForTenant(user, 1000),
    listOpportunityTypesForTenant(user),
  ]);
  const stageHistory = await listOpportunityStageHistoryForTenant(user, opportunities.data.map((opportunity: any) => opportunity.id));

  let dimensionValueByLeadId: Map<string, string> | undefined;
  if (dimension === "SOURCE") {
    dimensionValueByLeadId = new Map(leads.data.map((lead: any) => [lead.id, lead.source || "Unknown"]));
  } else if (dimension === "CAMPAIGN") {
    const campaignLookup = await getLeadCampaignLookup(user);
    dimensionValueByLeadId = new Map(leads.data.map((lead: any) => [lead.id, campaignLookup.valuesByLeadId.get(lead.id) || "Unknown"]));
  } else if (dimension === "SCORE_BAND") {
    const scoreRows = user.tenantId
      ? await pgQuery<{ recordId: string; scoreBand: string }>(
          `select distinct on ("recordId") "recordId", "scoreBand"
           from "RecordScore"
           where "tenantId" = $1 and "recordType" = 'LEAD'
           order by "recordId", "calculatedAt" desc`,
          [user.tenantId],
        )
      : [];
    const scoreBandByLeadId = new Map(scoreRows.map((row) => [row.recordId, row.scoreBand]));
    dimensionValueByLeadId = new Map(leads.data.map((lead: any) => [lead.id, scoreBandByLeadId.get(lead.id) || "Unscored"]));
  } else if (dimension === "OWNER") {
    const users = await listTenantUsers(user);
    const nameById = new Map(users.map((u: any) => [u.id, u.name || u.email || u.id]));
    dimensionValueByLeadId = new Map(leads.data.map((lead: any) => [lead.id, lead.ownerId ? nameById.get(lead.ownerId) ?? lead.ownerId : "Unassigned"]));
  } else if (dimension === "SALES_GROUP") {
    // Gap checklist Module 17, item 8 ("segmentation and comparison tools" -- "sales groups").
    // A user can belong to more than one SalesGroup (unique constraint is groupId+userId, not
    // userId alone) -- this picks the first membership row found per user, a documented
    // simplification rather than fabricating a "primary group" concept that doesn't exist
    // anywhere else in this codebase.
    const memberships = user.tenantId
      ? await pgQuery<{ userId: string; groupId: string }>(`select "userId", "groupId" from "SalesGroupMember" where "tenantId" = $1`, [
          user.tenantId,
        ])
      : [];
    const groupIdByUserId = new Map<string, string>();
    for (const membership of memberships) {
      if (!groupIdByUserId.has(membership.userId)) groupIdByUserId.set(membership.userId, membership.groupId);
    }
    const groupIds = [...new Set(groupIdByUserId.values())];
    const groups = groupIds.length ? await pgQuery<{ id: string; name: string }>(`select id, name from "SalesGroup" where id = any($1::text[])`, [groupIds]) : [];
    const groupNameById = new Map(groups.map((group) => [group.id, group.name]));
    dimensionValueByLeadId = new Map(
      leads.data.map((lead: any) => {
        const groupId = lead.ownerId ? groupIdByUserId.get(lead.ownerId) : undefined;
        return [lead.id, groupId ? groupNameById.get(groupId) ?? "Unknown" : "No Sales Group"];
      })
    );
  } else if (dimension === "TEAM") {
    // Gap checklist Module 17, item 8 ("segmentation and comparison tools" -- "teams"), the same
    // shape as SALES_GROUP/OWNER above but bucketing by the lead owner's Team, not their
    // individual identity or sales group.
    const users = await listTenantUsers(user);
    const teamNameByUserId = new Map(users.map((u: any) => [u.id, u.team?.name]));
    dimensionValueByLeadId = new Map(
      leads.data.map((lead: any) => [lead.id, (lead.ownerId ? teamNameByUserId.get(lead.ownerId) : undefined) || "No Team"])
    );
  }

  return calculateCohortReport(leads.data, opportunities.data, stageHistory, opportunityTypes, grain, new Date(), dimension, dimensionValueByLeadId);
}

export async function getDataQualityReportForTenant(
  user: TenantUser,
  staleDays = 30
): Promise<DataQualityReport> {
  const [leads, activities, requiredFields, customFieldValues, attributionTouches, slaBreachCount, opportunities, opportunityTypes] =
    await Promise.all([
      listLeadsForTenant(user, 1, 1000),
      listActivitiesForTenant(user, 1000, null),
      listRequiredLeadFieldsForTenant(user),
      listLeadCustomFieldValuesForTenant(user),
      listAttributionTouchesForTenant(user),
      countBreachedTasksForTenant(user),
      listOpportunitiesForTenant(user, 1000),
      listOpportunityTypesForTenant(user),
    ]);

  return calculateDataQualityReport(leads.data, activities.data, requiredFields, customFieldValues, staleDays, new Date(), {
    attributionTouches,
    slaBreachCount,
    opportunities: opportunities.data,
    opportunityTypes,
  });
}

async function listAttributionTouchesForTenant(user: TenantUser) {
  if (!user.tenantId) return [];
  return pgQuery<any>(
    `select id, source, medium, campaign from "MarketingAttributionTouch" where "tenantId" = $1 order by "occurredAt" desc limit 2000`,
    [user.tenantId],
  );
}

async function countBreachedTasksForTenant(user: TenantUser) {
  if (!user.tenantId) return 0;
  const row = await pgQueryOne<{ count: number }>(
    `select count(*)::int as count from "Task" where "tenantId" = $1 and "slaStatus" = 'BREACHED' and status not in ('COMPLETED', 'CANCELLED')`,
    [user.tenantId],
  );
  return row?.count ?? 0;
}

export async function listDataQualityScorecardHistoryForTenant(user: TenantUser, limit = 90) {
  if (!user.tenantId) return [];
  return pgQuery<{ id: string; generatedAt: string; staleDays: number; totals: Record<string, number>; issues: DataQualityIssue[] }>(
    `select id, "generatedAt", "staleDays", totals, issues
     from "DataQualityScorecard"
     where "tenantId" = $1
     order by "generatedAt" desc
     limit $2`,
    [user.tenantId, limit],
  );
}

// Scheduled sweep: reuses getDataQualityReportForTenant per tenant rather than re-deriving
// duplicate/required-field/UTM logic as a second, cross-tenant SQL implementation -- one
// source of truth for what "a data quality issue" means, at the cost of one query set per
// tenant per run (acceptable for a low-frequency scan; would need a real cross-tenant SQL
// rewrite if this ever needs to run more than a few times a day across many tenants).
export async function runScheduledDataQualityScan(limit = 100) {
  const tenants = await pgQuery<{ id: string }>(`select id from "Tenant" where status = 'ACTIVE' order by "createdAt" asc limit $1`, [limit]);
  const results = [];
  for (const tenant of tenants) {
    const report = await getDataQualityReportForTenant({ id: "system", tenantId: tenant.id }, 30);
    await pgExecute(
      `insert into "DataQualityScorecard" (id, "tenantId", "generatedAt", "staleDays", totals, issues, "createdAt")
       values ($1, $2, $3, $4, $5, $6, $3)`,
      [randomUUID(), tenant.id, report.generatedAt, report.staleDays, report.totals, report.issues],
    );
    results.push({ tenantId: tenant.id, totalIssues: report.issues.reduce((sum, item) => sum + item.count, 0) });
  }
  return results;
}

export function calculateFunnelByStageReport(opportunities: any[], generatedAt: Date): FunnelByStageReport {
  const summary = new Map<string, {
    stageId: string | null;
    stage: string;
    count: number;
    value: number;
    order: number;
    isWon: boolean;
    isClosed: boolean;
  }>();

  for (const opportunity of opportunities) {
    const stageId = opportunity.stage?.id ?? opportunity.stageId ?? null;
    const stageName = opportunity.stage?.name ?? "Unassigned";
    const key = stageId ?? stageName;
    const current = summary.get(key) ?? {
      stageId,
      stage: stageName,
      count: 0,
      value: 0,
      order: opportunity.stage?.order ?? Number.MAX_SAFE_INTEGER,
      isWon: Boolean(opportunity.stage?.isWon),
      isClosed: Boolean(opportunity.stage?.isClosed),
    };

    current.count += 1;
    current.value += Number(opportunity.amount ?? 0);
    current.order = Math.min(current.order, opportunity.stage?.order ?? Number.MAX_SAFE_INTEGER);
    current.isWon = current.isWon || Boolean(opportunity.stage?.isWon);
    current.isClosed = current.isClosed || Boolean(opportunity.stage?.isClosed);
    summary.set(key, current);
  }

  const sorted = [...summary.values()].sort((a, b) => a.order - b.order || a.stage.localeCompare(b.stage));
  const firstCount = sorted[0]?.count ?? 0;
  let previousCount: number | null = null;

  const rows = sorted.map(({ order, ...item }) => {
    const row: FunnelByStageRow = {
      ...item,
      conversionFromFirst: firstCount > 0 ? item.count / firstCount : null,
      conversionFromPrevious: previousCount && previousCount > 0 ? item.count / previousCount : null,
    };
    previousCount = item.count;
    return row;
  });

  return {
    reportKey: "funnel_conversion_by_stage",
    generatedAt: generatedAt.toISOString(),
    totalOpportunities: opportunities.length,
    totalValue: rows.reduce((sum, row) => sum + row.value, 0),
    rows,
  };
}

export function calculateFunnelBySourceCampaignReport(
  leads: any[],
  opportunities: any[],
  campaignByLeadId: Map<string, string>,
  campaignFieldFound: boolean,
  generatedAt: Date
): FunnelBySourceCampaignReport {
  const rowsByKey = new Map<string, FunnelBySourceCampaignRow>();
  const leadIdToGroupKey = new Map<string, string>();

  for (const lead of leads) {
    const source = normalizeDimension(lead.source);
    const campaign = normalizeDimension(campaignByLeadId.get(lead.id));
    const key = `${source}\u0000${campaign}`;
    const row = rowsByKey.get(key) ?? {
      source,
      campaign,
      leads: 0,
      opportunities: 0,
      wonOpportunities: 0,
      pipelineValue: 0,
      wonValue: 0,
      opportunityConversionRate: null,
      wonConversionRate: null,
    };
    row.leads += 1;
    rowsByKey.set(key, row);
    leadIdToGroupKey.set(lead.id, key);
  }

  for (const opportunity of opportunities) {
    const key = leadIdToGroupKey.get(opportunity.leadId);
    if (!key) continue;
    const row = rowsByKey.get(key);
    if (!row) continue;
    const amount = Number(opportunity.amount ?? 0);
    row.opportunities += 1;
    row.pipelineValue += amount;
    if (opportunity.stage?.isWon) {
      row.wonOpportunities += 1;
      row.wonValue += amount;
    }
  }

  const rows = [...rowsByKey.values()]
    .map((row) => ({
      ...row,
      opportunityConversionRate: row.leads > 0 ? row.opportunities / row.leads : null,
      wonConversionRate: row.leads > 0 ? row.wonOpportunities / row.leads : null,
    }))
    .sort((a, b) => b.leads - a.leads || a.source.localeCompare(b.source) || a.campaign.localeCompare(b.campaign));

  return {
    reportKey: "funnel_conversion_by_source_campaign",
    generatedAt: generatedAt.toISOString(),
    campaignFieldFound,
    totals: rows.reduce(
      (totals, row) => ({
        leads: totals.leads + row.leads,
        opportunities: totals.opportunities + row.opportunities,
        wonOpportunities: totals.wonOpportunities + row.wonOpportunities,
        pipelineValue: totals.pipelineValue + row.pipelineValue,
        wonValue: totals.wonValue + row.wonValue,
      }),
      { leads: 0, opportunities: 0, wonOpportunities: 0, pipelineValue: 0, wonValue: 0 }
    ),
    rows,
  };
}

function normalizeDimension(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : "Unknown";
}

async function getLeadCampaignLookup(user: TenantUser) {
  if (!user.tenantId) {
    return { fieldFound: false, valuesByLeadId: new Map<string, string>() };
  }

  const field = await pgQueryOne<{ id: string; key: string }>(
    `select id, key
     from "FieldDefinition"
     where "tenantId" = $1 and key = any($2::text[])
     limit 1`,
    [user.tenantId, ["campaign", "utm_campaign", "lead_campaign"]],
  );
  if (!field) return { fieldFound: false, valuesByLeadId: new Map<string, string>() };
  const valuesByLeadId = await fetchCustomFieldValuesByEntityId(user.tenantId, field.id);
  return { fieldFound: true, valuesByLeadId };
}

async function fetchCustomFieldValuesByEntityId(tenantId: string, fieldDefinitionId: string) {
  const valuesByLeadId = new Map<string, string>();
  const rows = await listCustomFieldValuesForTenant(tenantId, fieldDefinitionId);

  for (const row of rows) {
    const leadId = row.entityId ?? row.recordId;
    if (leadId) valuesByLeadId.set(leadId, String(row.value ?? ""));
  }

  return valuesByLeadId;
}

export function calculateRepPerformanceReport(
  leads: any[],
  opportunities: any[],
  activities: any[],
  users: any[],
  generatedAt: Date
): RepPerformanceReport {
  const userById = new Map(users.map((user) => [user.id, user]));
  const rowsByRep = new Map<string, RepPerformanceRow>();

  const ensureRow = (repId: string | null | undefined) => {
    const id = repId || "unassigned";
    const user = userById.get(id);
    const row = rowsByRep.get(id) ?? {
      repId: id,
      repName: user?.name || user?.email || (id === "unassigned" ? "Unassigned" : "Unknown User"),
      leadsOwned: 0,
      opportunitiesOwned: 0,
      wonOpportunities: 0,
      activitiesCreated: 0,
      callsCreated: 0,
      conversionRate: null,
      avgFirstResponseMinutes: null,
    };
    rowsByRep.set(id, row);
    return row;
  };

  const activitiesByLeadId = new Map<string, any[]>();
  for (const activity of activities) {
    if (activity.leadId) {
      const existing = activitiesByLeadId.get(activity.leadId) ?? [];
      existing.push(activity);
      activitiesByLeadId.set(activity.leadId, existing);
    }

    const row = ensureRow(activity.createdBy);
    row.activitiesCreated += 1;
    const typeName = String(activity.type?.name ?? activity.activityType?.name ?? "").toLowerCase();
    if (typeName.includes("call") || typeName.includes("phone")) {
      row.callsCreated += 1;
    }
  }

  const firstResponseMinutesByRep = new Map<string, number[]>();
  for (const lead of leads) {
    ensureRow(lead.ownerId).leadsOwned += 1;
    const linkedActivities = (activitiesByLeadId.get(lead.id) ?? [])
      .filter((activity) => activity.createdAt && new Date(activity.createdAt) >= new Date(lead.createdAt))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const firstActivity = linkedActivities[0];
    if (firstActivity && lead.ownerId) {
      const minutes = (new Date(firstActivity.createdAt).getTime() - new Date(lead.createdAt).getTime()) / 60000;
      if (Number.isFinite(minutes) && minutes >= 0) {
        const existing = firstResponseMinutesByRep.get(lead.ownerId) ?? [];
        existing.push(minutes);
        firstResponseMinutesByRep.set(lead.ownerId, existing);
      }
    }
  }

  for (const opportunity of opportunities) {
    const row = ensureRow(opportunity.ownerId);
    row.opportunitiesOwned += 1;
    if (opportunity.stage?.isWon) {
      row.wonOpportunities += 1;
    }
  }

  const rows = [...rowsByRep.values()].map((row) => {
    const responseMinutes = firstResponseMinutesByRep.get(row.repId) ?? [];
    return {
      ...row,
      conversionRate: row.leadsOwned > 0 ? row.wonOpportunities / row.leadsOwned : null,
      avgFirstResponseMinutes: responseMinutes.length > 0
        ? responseMinutes.reduce((sum, value) => sum + value, 0) / responseMinutes.length
        : null,
    };
  }).sort((a, b) => b.wonOpportunities - a.wonOpportunities || b.activitiesCreated - a.activitiesCreated || a.repName.localeCompare(b.repName));

  return {
    reportKey: "rep_performance",
    generatedAt: generatedAt.toISOString(),
    rows,
  };
}

export function calculateSlaResponseBreachReport(
  leads: any[],
  activities: any[],
  users: any[],
  thresholdHours: number,
  generatedAt: Date
): SlaResponseBreachReport {
  const userById = new Map(users.map((user) => [user.id, user]));
  const rowsByOwner = new Map<string, SlaResponseBreachRow>();
  const activitiesByLeadId = new Map<string, any[]>();
  const normalizedThresholdHours = Number.isFinite(thresholdHours) && thresholdHours > 0 ? thresholdHours : 24;
  const thresholdMs = normalizedThresholdHours * 60 * 60 * 1000;

  const ensureRow = (ownerId: string | null | undefined) => {
    const id = ownerId || "unassigned";
    const user = userById.get(id);
    const row = rowsByOwner.get(id) ?? {
      ownerId: id,
      ownerName: user?.name || user?.email || (id === "unassigned" ? "Unassigned" : "Unknown User"),
      totalLeads: 0,
      responseBreaches: 0,
      activitySlaBreaches: 0,
      breachRate: null,
    };
    rowsByOwner.set(id, row);
    return row;
  };

  for (const activity of activities) {
    if (activity.leadId) {
      const existing = activitiesByLeadId.get(activity.leadId) ?? [];
      existing.push(activity);
      activitiesByLeadId.set(activity.leadId, existing);
    }

    const isActivityBreach = String(activity.slaStatus ?? "").toUpperCase() === "BREACHED" ||
      (!!activity.slaTarget && !activity.completedAt && new Date(activity.slaTarget).getTime() < generatedAt.getTime());
    if (isActivityBreach) {
      ensureRow(activity.createdBy).activitySlaBreaches += 1;
    }
  }

  for (const lead of leads) {
    const row = ensureRow(lead.ownerId);
    row.totalLeads += 1;
    const leadCreatedAt = new Date(lead.createdAt).getTime();
    const firstActivity = (activitiesByLeadId.get(lead.id) ?? [])
      .filter((activity) => activity.createdAt && new Date(activity.createdAt).getTime() >= leadCreatedAt)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];

    const firstResponseAt = firstActivity ? new Date(firstActivity.createdAt).getTime() : null;
    const breached = firstResponseAt === null
      ? generatedAt.getTime() - leadCreatedAt > thresholdMs
      : firstResponseAt - leadCreatedAt > thresholdMs;

    if (breached) {
      row.responseBreaches += 1;
    }
  }

  const rows = [...rowsByOwner.values()]
    .map((row) => ({
      ...row,
      breachRate: row.totalLeads > 0 ? row.responseBreaches / row.totalLeads : null,
    }))
    .sort((a, b) => b.responseBreaches - a.responseBreaches || b.activitySlaBreaches - a.activitySlaBreaches || a.ownerName.localeCompare(b.ownerName));

  return {
    reportKey: "sla_response_breaches",
    generatedAt: generatedAt.toISOString(),
    thresholdHours: normalizedThresholdHours,
    totals: rows.reduce(
      (totals, row) => ({
        totalLeads: totals.totalLeads + row.totalLeads,
        responseBreaches: totals.responseBreaches + row.responseBreaches,
        activitySlaBreaches: totals.activitySlaBreaches + row.activitySlaBreaches,
      }),
      { totalLeads: 0, responseBreaches: 0, activitySlaBreaches: 0 }
    ),
    rows,
  };
}

export function calculateTaskSlaPerformanceReport(
  tasks: any[],
  users: any[],
  teamNameById: Map<string, string>,
  generatedAt: Date
): TaskSlaPerformanceReport {
  const userById = new Map(users.map((user) => [user.id, user]));
  const rowsByOwner = new Map<string, TaskSlaPerformanceRow>();
  const moduleTotals = new Map<TaskSlaPerformanceModuleRow["module"], TaskSlaPerformanceModuleRow>();

  const ensureRow = (ownerId: string | null | undefined) => {
    const id = ownerId || "unassigned";
    const user = userById.get(id);
    const teamId = user?.teamId ?? null;
    const row = rowsByOwner.get(id) ?? {
      ownerId: id,
      ownerName: user?.name || user?.email || (id === "unassigned" ? "Unassigned" : "Unknown User"),
      teamId,
      teamName: teamId ? teamNameById.get(teamId) ?? teamId : null,
      totalTasks: 0,
      openTasks: 0,
      firstActionBreaches: 0,
      completionBreaches: 0,
      completionMet: 0,
      breachRate: null,
    };
    rowsByOwner.set(id, row);
    return row;
  };

  const ensureModule = (taskModule: TaskSlaPerformanceModuleRow["module"]) => {
    const row = moduleTotals.get(taskModule) ?? { module: taskModule, totalTasks: 0, completionBreaches: 0, completionMet: 0 };
    moduleTotals.set(taskModule, row);
    return row;
  };

  for (const task of tasks) {
    const row = ensureRow(task.ownerId);
    row.totalTasks += 1;
    const isOpen = task.status !== "COMPLETED" && task.status !== "CANCELLED";
    if (isOpen) row.openTasks += 1;

    const taskModule: TaskSlaPerformanceModuleRow["module"] = task.opportunityId
      ? "OPPORTUNITY"
      : task.leadId
        ? "LEAD"
        : task.activityId
          ? "ACTIVITY"
          : "STANDALONE";
    const moduleRow = ensureModule(taskModule);
    moduleRow.totalTasks += 1;

    // firstActionSlaTarget missed with no action taken yet -- covers both a task the worker
    // scan has already flagged and one that's still ticking down but visibly past due right now.
    const firstActionBreached = !task.firstActionAt && task.firstActionSlaTarget && new Date(task.firstActionSlaTarget).getTime() < generatedAt.getTime();
    if (firstActionBreached) row.firstActionBreaches += 1;

    if (task.slaStatus === "BREACHED" || (isOpen && task.slaTarget && new Date(task.slaTarget).getTime() < generatedAt.getTime())) {
      row.completionBreaches += 1;
      moduleRow.completionBreaches += 1;
    } else if (task.slaStatus === "MET") {
      row.completionMet += 1;
      moduleRow.completionMet += 1;
    }
  }

  const rows = [...rowsByOwner.values()]
    .map((row) => ({
      ...row,
      breachRate: row.completionBreaches + row.completionMet > 0 ? row.completionBreaches / (row.completionBreaches + row.completionMet) : null,
    }))
    .sort((a, b) => b.completionBreaches - a.completionBreaches || a.ownerName.localeCompare(b.ownerName));

  return {
    reportKey: "task_sla_performance",
    generatedAt: generatedAt.toISOString(),
    totals: rows.reduce(
      (totals, row) => ({
        totalTasks: totals.totalTasks + row.totalTasks,
        firstActionBreaches: totals.firstActionBreaches + row.firstActionBreaches,
        completionBreaches: totals.completionBreaches + row.completionBreaches,
        completionMet: totals.completionMet + row.completionMet,
      }),
      { totalTasks: 0, firstActionBreaches: 0, completionBreaches: 0, completionMet: 0 }
    ),
    rows,
    byModule: [...moduleTotals.values()].sort((a, b) => b.totalTasks - a.totalTasks),
  };
}

export function calculateAutomationPerformanceReport(
  automations: any[],
  executions: any[],
  generatedAt: Date
): AutomationPerformanceReport {
  const automationById = new Map(automations.map((automation) => [automation.id, automation]));
  const rowsByAutomation = new Map<string, AutomationPerformanceRow>();
  const durationsByAutomation = new Map<string, number[]>();

  const ensureRow = (automationId: string) => {
    const automation = automationById.get(automationId);
    const row = rowsByAutomation.get(automationId) ?? {
      automationId,
      automationName: automation?.name ?? "Deleted automation",
      isActive: automation?.isActive ?? false,
      totalRuns: 0,
      completed: 0,
      failed: 0,
      waiting: 0,
      skipped: 0,
      successRate: null,
      avgDurationMinutes: null,
    };
    rowsByAutomation.set(automationId, row);
    return row;
  };

  // Seed a row for every configured automation up front, not just ones with executions --
  // an automation that has never fired is itself a useful signal (misconfigured trigger,
  // dead workflow), not something that should silently disappear from the report.
  for (const automation of automations) ensureRow(automation.id);

  for (const execution of executions) {
    const row = ensureRow(execution.automationId);
    row.totalRuns += 1;
    const status = String(execution.status ?? "").toUpperCase();
    if (status === "COMPLETED") row.completed += 1;
    else if (status === "FAILED") row.failed += 1;
    else if (status === "WAITING") row.waiting += 1;
    else if (status === "SKIPPED") row.skipped += 1;

    if (execution.completedAt) {
      const minutes = (new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()) / 60000;
      if (Number.isFinite(minutes) && minutes >= 0) {
        const durations = durationsByAutomation.get(execution.automationId) ?? [];
        durations.push(minutes);
        durationsByAutomation.set(execution.automationId, durations);
      }
    }
  }

  const rows = [...rowsByAutomation.values()]
    .map((row) => {
      const durations = durationsByAutomation.get(row.automationId) ?? [];
      return {
        ...row,
        successRate: row.completed + row.failed > 0 ? row.completed / (row.completed + row.failed) : null,
        avgDurationMinutes: durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
      };
    })
    .sort((a, b) => b.totalRuns - a.totalRuns || a.automationName.localeCompare(b.automationName));

  return {
    reportKey: "automation_performance",
    generatedAt: generatedAt.toISOString(),
    totals: rows.reduce(
      (totals, row) => ({
        totalRuns: totals.totalRuns + row.totalRuns,
        completed: totals.completed + row.completed,
        failed: totals.failed + row.failed,
        waiting: totals.waiting + row.waiting,
      }),
      { totalRuns: 0, completed: 0, failed: 0, waiting: 0 }
    ),
    rows,
  };
}

export function calculateSplitTestPerformanceReport(
  automations: any[],
  executions: any[],
  generatedAt: Date
): SplitTestPerformanceReport {
  const automationById = new Map(automations.map((automation) => [automation.id, automation]));
  const rowsByKey = new Map<string, SplitTestVariantRow>();
  const nodeIds = new Set<string>();

  for (const execution of executions) {
    const steps = Array.isArray(execution.executionLog?.steps) ? execution.executionLog.steps : [];
    const completed = String(execution.status ?? "").toUpperCase() === "COMPLETED";
    for (const step of steps) {
      if (step?.type !== "split_test" || !step.result) continue;
      const nodeId = String(step.node ?? "unknown");
      nodeIds.add(`${execution.automationId}::${nodeId}`);
      const key = `${execution.automationId}::${nodeId}::${step.result}`;
      const row = rowsByKey.get(key) ?? {
        automationId: execution.automationId,
        automationName: automationById.get(execution.automationId)?.name ?? "Deleted automation",
        nodeId,
        variant: String(step.result),
        executions: 0,
        percentOfTotal: 0,
        completed: 0,
        completionRate: null,
      };
      row.executions += 1;
      if (completed) row.completed += 1;
      rowsByKey.set(key, row);
    }
  }

  // Percent of total is scoped per (automation, node) -- each split node's own variant
  // distribution should sum to 100%, not compete against unrelated split nodes elsewhere.
  const totalsByNode = new Map<string, number>();
  for (const row of rowsByKey.values()) {
    const nodeKey = `${row.automationId}::${row.nodeId}`;
    totalsByNode.set(nodeKey, (totalsByNode.get(nodeKey) ?? 0) + row.executions);
  }

  const rows = [...rowsByKey.values()]
    .map((row) => {
      const nodeTotal = totalsByNode.get(`${row.automationId}::${row.nodeId}`) ?? 0;
      return {
        ...row,
        percentOfTotal: nodeTotal > 0 ? row.executions / nodeTotal : 0,
        completionRate: row.executions > 0 ? row.completed / row.executions : null,
      };
    })
    .sort((a, b) => a.automationName.localeCompare(b.automationName) || a.nodeId.localeCompare(b.nodeId) || b.executions - a.executions);

  return {
    reportKey: "split_test_performance",
    generatedAt: generatedAt.toISOString(),
    totals: {
      totalSplitNodes: nodeIds.size,
      totalExecutions: rows.reduce((sum, row) => sum + row.executions, 0),
    },
    rows,
  };
}

export function calculateFormDropOffReport(
  forms: any[],
  events: any[],
  submissionCounts: any[],
  generatedAt: Date
): FormDropOffReport {
  const submissionCountByForm = new Map(submissionCounts.map((row) => [row.formId, Number(row.count) || 0]));
  const sessionIdsByFormTab = new Map<string, Set<string>>();
  const sessionIdsByForm = new Map<string, Set<string>>();
  for (const event of events) {
    const tabKey = `${event.formId}::${event.tabId}`;
    const tabSet = sessionIdsByFormTab.get(tabKey) ?? new Set<string>();
    tabSet.add(event.sessionId);
    sessionIdsByFormTab.set(tabKey, tabSet);

    const formSet = sessionIdsByForm.get(event.formId) ?? new Set<string>();
    formSet.add(event.sessionId);
    sessionIdsByForm.set(event.formId, formSet);
  }

  const rows: FormDropOffRow[] = [];
  let formsWithData = 0;

  for (const form of forms) {
    if (!sessionIdsByForm.has(form.id)) continue; // no visits at all -- nothing to report yet
    formsWithData += 1;
    const tabs: Array<{ id: string; label?: string }> = Array.isArray(form.config?.tabs) && form.config.tabs.length
      ? form.config.tabs
      : [{ id: "tab_1", label: "Tab 1" }];

    let previousSessions: number | null = null;
    tabs.forEach((tab, index) => {
      const sessions = sessionIdsByFormTab.get(`${form.id}::${tab.id}`)?.size ?? 0;
      const dropOffFromPrevious = previousSessions === null ? null : Math.max(0, previousSessions - sessions);
      rows.push({
        formId: form.id,
        formName: form.name,
        tabId: tab.id,
        tabIndex: index,
        tabLabel: tab.label || `Tab ${index + 1}`,
        sessions,
        dropOffFromPrevious,
        dropOffRate: previousSessions ? (dropOffFromPrevious ?? 0) / previousSessions : null,
      });
      previousSessions = sessions;
    });
  }

  return {
    reportKey: "form_drop_off",
    generatedAt: generatedAt.toISOString(),
    totals: {
      totalForms: formsWithData,
      totalSessions: new Set(events.map((event) => `${event.formId}::${event.sessionId}`)).size,
      totalSubmissions: [...submissionCountByForm.values()].reduce((sum, count) => sum + count, 0),
    },
    rows,
  };
}

export function calculateLeadSourceRoiReport(
  leads: any[],
  opportunities: any[],
  generatedAt: Date
): LeadSourceRoiReport {
  const rowsBySource = new Map<string, LeadSourceRoiRow>();
  const leadSourceById = new Map<string, string>();

  for (const lead of leads) {
    const source = normalizeDimension(lead.source);
    const row = rowsBySource.get(source) ?? {
      source,
      leads: 0,
      opportunities: 0,
      wonOpportunities: 0,
      pipelineValue: 0,
      wonValue: 0,
      spend: null,
      roi: null,
      opportunityConversionRate: null,
      wonConversionRate: null,
    };
    row.leads += 1;
    rowsBySource.set(source, row);
    leadSourceById.set(lead.id, source);
  }

  for (const opportunity of opportunities) {
    const source = leadSourceById.get(opportunity.leadId);
    if (!source) continue;
    const row = rowsBySource.get(source);
    if (!row) continue;
    const amount = Number(opportunity.amount ?? 0);
    row.opportunities += 1;
    row.pipelineValue += amount;
    if (opportunity.stage?.isWon) {
      row.wonOpportunities += 1;
      row.wonValue += amount;
    }
  }

  const rows = [...rowsBySource.values()]
    .map((row) => ({
      ...row,
      opportunityConversionRate: row.leads > 0 ? row.opportunities / row.leads : null,
      wonConversionRate: row.leads > 0 ? row.wonOpportunities / row.leads : null,
    }))
    .sort((a, b) => b.leads - a.leads || b.wonValue - a.wonValue || a.source.localeCompare(b.source));

  return {
    reportKey: "lead_source_roi",
    generatedAt: generatedAt.toISOString(),
    spendAvailable: false,
    rows,
  };
}

export function calculateDistributionFairnessReport(events: any[], users: any[], generatedAt: Date): DistributionFairnessReport {
  const userById = new Map(users.map((user) => [user.id, user]));
  const rowsByUser = new Map<string, DistributionFairnessRow>();

  for (const event of events) {
    if (!event.assignedToId) continue;
    const assignedUser = userById.get(event.assignedToId);
    const row = rowsByUser.get(event.assignedToId) ?? {
      userId: event.assignedToId,
      userName: assignedUser?.name || assignedUser?.email || "Unknown user",
      totalAssigned: 0,
      leadAssigned: 0,
      opportunityAssigned: 0,
      deviationFromMean: 0,
    };
    row.totalAssigned += 1;
    if (String(event.entityType ?? "").toUpperCase() === "OPPORTUNITY") row.opportunityAssigned += 1;
    else row.leadAssigned += 1;
    rowsByUser.set(event.assignedToId, row);
  }

  const rows = [...rowsByUser.values()];
  const totalAssignments = rows.reduce((sum, row) => sum + row.totalAssigned, 0);
  const meanPerUser = rows.length > 0 ? totalAssignments / rows.length : 0;

  return {
    reportKey: "distribution_fairness",
    generatedAt: generatedAt.toISOString(),
    totals: {
      totalAssignments,
      totalUsers: rows.length,
      meanPerUser: Math.round(meanPerUser * 10) / 10,
    },
    rows: rows
      .map((row) => ({ ...row, deviationFromMean: Math.round((row.totalAssigned - meanPerUser) * 10) / 10 }))
      .sort((a, b) => b.totalAssigned - a.totalAssigned),
  };
}

export function calculateReassignmentImpactReport(
  leads: any[],
  opportunities: any[],
  activities: any[],
  assignmentEvents: any[],
  thresholdHours: number,
  generatedAt: Date
): ReassignmentImpactReport {
  const normalizedThresholdHours = Number.isFinite(thresholdHours) && thresholdHours > 0 ? thresholdHours : 24;
  const thresholdMs = normalizedThresholdHours * 60 * 60 * 1000;
  const leadEventsById = new Map<string, any[]>();

  for (const event of assignmentEvents) {
    const entityType = String(event.entityType ?? "").toUpperCase();
    if (entityType !== "LEAD") continue;
    const leadId = event.entityId;
    if (!leadId) continue;
    const existing = leadEventsById.get(leadId) ?? [];
    existing.push(event);
    leadEventsById.set(leadId, existing);
  }

  const activitiesByLeadId = new Map<string, any[]>();
  for (const activity of activities) {
    if (!activity.leadId) continue;
    const existing = activitiesByLeadId.get(activity.leadId) ?? [];
    existing.push(activity);
    activitiesByLeadId.set(activity.leadId, existing);
  }

  const leadBucketById = new Map<string, string>();
  const rowsByBucket = new Map<string, ReassignmentImpactRow>();
  const ensureRow = (eventCount: number) => {
    const bucket = reassignmentBucket(eventCount);
    const row = rowsByBucket.get(bucket.key) ?? {
      bucket: bucket.label,
      assignmentEventCountMin: bucket.min,
      assignmentEventCountMax: bucket.max,
      leads: 0,
      opportunities: 0,
      wonOpportunities: 0,
      responseBreaches: 0,
      avgFirstResponseMinutes: null,
      opportunityConversionRate: null,
      wonConversionRate: null,
      responseBreachRate: null,
    };
    rowsByBucket.set(bucket.key, row);
    return row;
  };

  const firstResponseMinutesByBucket = new Map<string, number[]>();

  for (const lead of leads) {
    const eventCount = leadEventsById.get(lead.id)?.length ?? 0;
    const bucket = reassignmentBucket(eventCount);
    const row = ensureRow(eventCount);
    row.leads += 1;
    leadBucketById.set(lead.id, bucket.key);

    const leadCreatedAt = new Date(lead.createdAt).getTime();
    const firstActivity = (activitiesByLeadId.get(lead.id) ?? [])
      .filter((activity) => activity.createdAt && new Date(activity.createdAt).getTime() >= leadCreatedAt)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];

    const firstResponseAt = firstActivity ? new Date(firstActivity.createdAt).getTime() : null;
    if (firstResponseAt === null) {
      if (generatedAt.getTime() - leadCreatedAt > thresholdMs) row.responseBreaches += 1;
    } else {
      const responseMs = firstResponseAt - leadCreatedAt;
      if (responseMs > thresholdMs) row.responseBreaches += 1;
      if (responseMs >= 0) {
        const values = firstResponseMinutesByBucket.get(bucket.key) ?? [];
        values.push(responseMs / 60000);
        firstResponseMinutesByBucket.set(bucket.key, values);
      }
    }
  }

  for (const opportunity of opportunities) {
    const bucketKey = leadBucketById.get(opportunity.leadId);
    if (!bucketKey) continue;
    const row = rowsByBucket.get(bucketKey);
    if (!row) continue;
    row.opportunities += 1;
    if (opportunity.stage?.isWon) row.wonOpportunities += 1;
  }

  const bucketOrder = new Map([
    ["never_or_initial_assignment", 0],
    ["reassigned_once", 1],
    ["reassigned_multiple", 2],
  ]);
  const rows = [...rowsByBucket.entries()]
    .map(([key, row]) => {
      const firstResponseMinutes = firstResponseMinutesByBucket.get(key) ?? [];
      return {
        ...row,
        avgFirstResponseMinutes: firstResponseMinutes.length > 0
          ? firstResponseMinutes.reduce((sum, value) => sum + value, 0) / firstResponseMinutes.length
          : null,
        opportunityConversionRate: row.leads > 0 ? row.opportunities / row.leads : null,
        wonConversionRate: row.leads > 0 ? row.wonOpportunities / row.leads : null,
        responseBreachRate: row.leads > 0 ? row.responseBreaches / row.leads : null,
      };
    })
    .sort((a, b) => {
      const aKey = reassignmentBucket(a.assignmentEventCountMin).key;
      const bKey = reassignmentBucket(b.assignmentEventCountMin).key;
      return (bucketOrder.get(aKey) ?? 99) - (bucketOrder.get(bKey) ?? 99);
    });

  return {
    reportKey: "reassignment_impact",
    generatedAt: generatedAt.toISOString(),
    thresholdHours: normalizedThresholdHours,
    totals: rows.reduce(
      (totals, row) => ({
        leads: totals.leads + row.leads,
        opportunities: totals.opportunities + row.opportunities,
        wonOpportunities: totals.wonOpportunities + row.wonOpportunities,
        responseBreaches: totals.responseBreaches + row.responseBreaches,
      }),
      { leads: 0, opportunities: 0, wonOpportunities: 0, responseBreaches: 0 }
    ),
    rows,
  };
}

export function calculateActivityCallVolumeTrendReport(
  activities: any[],
  grain: "day" | "week" | "month",
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  generatedAt: Date
): ActivityCallVolumeTrendReport {
  const normalizedGrain = ["day", "week", "month"].includes(grain) ? grain : "day";
  const start = startDate ? startOfDay(new Date(startDate)) : null;
  const end = endDate ? endOfDay(new Date(endDate)) : null;
  const rowsByPeriod = new Map<string, ActivityCallVolumeTrendRow>();

  for (const activity of activities) {
    if (!activity.createdAt) continue;
    const createdAt = new Date(activity.createdAt);
    if (Number.isNaN(createdAt.getTime())) continue;
    if (start && createdAt < start) continue;
    if (end && createdAt > end) continue;

    const period = getPeriodRange(createdAt, normalizedGrain);
    const key = period.start.toISOString();
    const row = rowsByPeriod.get(key) ?? {
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      activities: 0,
      calls: 0,
      completed: 0,
      overdue: 0,
      byType: {},
    };

    const typeName = normalizeDimension(activity.type?.name ?? activity.activityType?.name);
    row.activities += 1;
    row.byType[typeName] = (row.byType[typeName] ?? 0) + 1;
    if (isCallActivity(activity)) row.calls += 1;
    if (activity.completedAt) row.completed += 1;
    if (!activity.completedAt && activity.dueAt && new Date(activity.dueAt).getTime() < generatedAt.getTime()) {
      row.overdue += 1;
    }

    rowsByPeriod.set(key, row);
  }

  const rows = [...rowsByPeriod.values()].sort(
    (a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime()
  );

  return {
    reportKey: "activity_call_volume_trends",
    generatedAt: generatedAt.toISOString(),
    grain: normalizedGrain,
    rows,
  };
}

export function calculateCommissionPayoutSummaryReport(
  ledgerEntries: any[],
  payouts: any[],
  invoices: any[],
  cycles: any[],
  partners: any[],
  partnerScoped: boolean,
  generatedAt: Date
): CommissionPayoutSummaryReport {
  const partnerById = new Map(partners.map((partner) => [partner.userId ?? partner.partnerId ?? partner.id, partner]));
  const rowsByPartner = new Map<string, CommissionPayoutPartnerRow>();

  const ensureRow = (partnerId: string) => {
    const partner = partnerById.get(partnerId);
    const user = partner?.user;
    const row = rowsByPartner.get(partnerId) ?? {
      partnerId,
      partnerName: partner?.legalBusinessName || user?.name || user?.email || partnerId,
      ledgerEntries: 0,
      earnedCommission: 0,
      correctionCredits: 0,
      correctionDebits: 0,
      netCommission: 0,
      draftPayout: 0,
      approvedPayout: 0,
      invoicedPayout: 0,
      paidPayout: 0,
      invoiceTotal: 0,
    };
    rowsByPartner.set(partnerId, row);
    return row;
  };

  for (const entry of ledgerEntries) {
    const row = ensureRow(entry.partnerId);
    const amount = Number(entry.commissionAmount ?? 0);
    row.ledgerEntries += 1;
    if (entry.entryType === "CORRECTION_DEBIT") {
      row.correctionDebits += amount;
      row.netCommission -= amount;
    } else if (entry.entryType === "CORRECTION_CREDIT") {
      row.correctionCredits += amount;
      row.netCommission += amount;
    } else {
      row.earnedCommission += amount;
      row.netCommission += amount;
    }
  }

  const payoutStatusCounts: Record<string, number> = {};
  for (const payout of payouts) {
    const row = ensureRow(payout.partnerId);
    const amount = Number(payout.totalCommissionAmount ?? 0);
    const status = String(payout.status ?? "UNKNOWN").toUpperCase();
    payoutStatusCounts[status] = (payoutStatusCounts[status] ?? 0) + 1;
    if (status === "DRAFT") row.draftPayout += amount;
    else if (status === "APPROVED") row.approvedPayout += amount;
    else if (status === "INVOICED") row.invoicedPayout += amount;
    else if (status === "PAID") row.paidPayout += amount;
  }

  for (const invoice of invoices) {
    ensureRow(invoice.partnerId).invoiceTotal += Number(invoice.totalAmount ?? 0);
  }

  const rows = [...rowsByPartner.values()].sort(
    (a, b) => b.netCommission - a.netCommission || b.paidPayout - a.paidPayout || a.partnerName.localeCompare(b.partnerName)
  );

  return {
    reportKey: "commission_payout_summary",
    generatedAt: generatedAt.toISOString(),
    partnerScoped,
    totals: rows.reduce(
      (totals, row) => ({
        ledgerEntries: totals.ledgerEntries + row.ledgerEntries,
        earnedCommission: totals.earnedCommission + row.earnedCommission,
        correctionCredits: totals.correctionCredits + row.correctionCredits,
        correctionDebits: totals.correctionDebits + row.correctionDebits,
        netCommission: totals.netCommission + row.netCommission,
        draftPayout: totals.draftPayout + row.draftPayout,
        approvedPayout: totals.approvedPayout + row.approvedPayout,
        invoicedPayout: totals.invoicedPayout + row.invoicedPayout,
        paidPayout: totals.paidPayout + row.paidPayout,
        invoiceTotal: totals.invoiceTotal + row.invoiceTotal,
      }),
      {
        ledgerEntries: 0,
        earnedCommission: 0,
        correctionCredits: 0,
        correctionDebits: 0,
        netCommission: 0,
        draftPayout: 0,
        approvedPayout: 0,
        invoicedPayout: 0,
        paidPayout: 0,
        invoiceTotal: 0,
      }
    ),
    payoutStatusCounts,
    recentCycles: cycles
      .slice()
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
      .slice(0, 5)
      .map((cycle) => ({
        id: cycle.id,
        cycleLabel: cycle.cycleLabel,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        status: cycle.status,
      })),
    rows,
  };
}

export function calculateCohortReport(
  leads: any[],
  opportunities: any[],
  stageHistory: any[],
  opportunityTypes: any[],
  grain: "week" | "month",
  generatedAt: Date,
  dimension: CohortDimension = "CREATED_DATE",
  dimensionValueByLeadId?: Map<string, string>
): CohortReport {
  const normalizedGrain = grain === "week" ? "week" : "month";
  const stageDefinitions = opportunityTypes
    .flatMap((type: any) => (type.stages ?? []).map((stage: any) => ({
      id: stage.id,
      name: stage.name,
      order: Number(stage.order ?? 0),
    })))
    .sort((a: any, b: any) => a.order - b.order || a.name.localeCompare(b.name));
  const stageById = new Map(stageDefinitions.map((stage: any) => [stage.id, stage]));
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const opportunitiesByLeadId = new Map<string, any[]>();
  const opportunityById = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity]));

  for (const opportunity of opportunities) {
    if (!opportunity.leadId) continue;
    const existing = opportunitiesByLeadId.get(opportunity.leadId) ?? [];
    existing.push(opportunity);
    opportunitiesByLeadId.set(opportunity.leadId, existing);
  }

  const firstStageReachByLead = new Map<string, Map<string, Date>>();
  const recordStageReach = (leadId: string, stageId: string | null | undefined, reachedAt: string | null | undefined) => {
    if (!stageId || !stageById.has(stageId) || !reachedAt) return;
    const reachedDate = new Date(reachedAt);
    if (Number.isNaN(reachedDate.getTime())) return;
    const stageMap = firstStageReachByLead.get(leadId) ?? new Map<string, Date>();
    const existing = stageMap.get(stageId);
    if (!existing || reachedDate < existing) stageMap.set(stageId, reachedDate);
    firstStageReachByLead.set(leadId, stageMap);
  };

  for (const history of stageHistory) {
    const opportunity = opportunityById.get(history.opportunityId);
    if (!opportunity?.leadId) continue;
    recordStageReach(opportunity.leadId, history.toStageId, history.changedAt ?? opportunity.createdAt);
  }

  for (const opportunity of opportunities) {
    if (!opportunity.leadId) continue;
    recordStageReach(opportunity.leadId, opportunity.stageId, opportunity.updatedAt ?? opportunity.createdAt);
  }

  const cohorts = new Map<string, {
    start: Date | null;
    end: Date | null;
    label: string;
    leads: number;
    opportunities: number;
    stageLeadIds: Map<string, Set<string>>;
    daysToStage: Map<string, number[]>;
  }>();

  for (const lead of leads) {
    if (!lead.createdAt) continue;
    const createdAt = new Date(lead.createdAt);
    if (Number.isNaN(createdAt.getTime())) continue;

    let key: string;
    let label: string;
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    if (dimension === "CREATED_DATE") {
      const period = getPeriodRange(createdAt, normalizedGrain);
      key = period.start.toISOString();
      label = key;
      periodStart = period.start;
      periodEnd = period.end;
    } else {
      key = dimensionValueByLeadId?.get(lead.id) ?? "Unknown";
      label = key;
    }

    const cohort = cohorts.get(key) ?? {
      start: periodStart,
      end: periodEnd,
      label,
      leads: 0,
      opportunities: 0,
      stageLeadIds: new Map(),
      daysToStage: new Map(),
    };
    cohort.leads += 1;
    cohort.opportunities += opportunitiesByLeadId.get(lead.id)?.length ?? 0;

    const reachedStages = firstStageReachByLead.get(lead.id) ?? new Map();
    for (const [stageId, reachedAt] of reachedStages.entries()) {
      const leadIds = cohort.stageLeadIds.get(stageId) ?? new Set<string>();
      leadIds.add(lead.id);
      cohort.stageLeadIds.set(stageId, leadIds);

      const days = (reachedAt.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000);
      if (Number.isFinite(days) && days >= 0) {
        const values = cohort.daysToStage.get(stageId) ?? [];
        values.push(days);
        cohort.daysToStage.set(stageId, values);
      }
    }

    cohorts.set(key, cohort);
  }

  // Date cohorts sort chronologically (unchanged prior behavior); dimension cohorts (source/
  // campaign/score-band/owner) have no natural order, so they sort by lead count descending --
  // the most useful ordering for comparing segments.
  const sortedCohorts =
    dimension === "CREATED_DATE"
      ? [...cohorts.values()].sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0))
      : [...cohorts.values()].sort((a, b) => b.leads - a.leads);

  const rows = sortedCohorts.map((cohort) => ({
    cohortKey: cohort.start ? cohort.start.toISOString() : cohort.label,
    cohortLabel: cohort.label,
    cohortStart: cohort.start ? cohort.start.toISOString() : null,
    cohortEnd: cohort.end ? cohort.end.toISOString() : null,
    leads: cohort.leads,
    opportunities: cohort.opportunities,
    stages: stageDefinitions.map((stage: any) => {
      const leadsReached = cohort.stageLeadIds.get(stage.id)?.size ?? 0;
      const days = cohort.daysToStage.get(stage.id) ?? [];
      return {
        stageId: stage.id,
        stageName: stage.name,
        order: stage.order,
        leadsReached,
        reachRate: cohort.leads > 0 ? leadsReached / cohort.leads : null,
        avgDaysFromEntry: days.length > 0 ? days.reduce((sum, value) => sum + value, 0) / days.length : null,
      };
    }),
  }));

  return {
    reportKey: "cohort_funnel_progression",
    generatedAt: generatedAt.toISOString(),
    dimension,
    grain: normalizedGrain,
    rows,
  };
}

export function calculateDataQualityReport(
  leads: any[],
  activities: any[],
  requiredFields: any[],
  customFieldValues: any[],
  staleDays: number,
  generatedAt: Date,
  context: {
    attributionTouches?: any[];
    slaBreachCount?: number;
    opportunities?: any[];
    opportunityTypes?: any[];
  } = {}
): DataQualityReport {
  const attributionTouches = context.attributionTouches ?? [];
  const slaBreachCount = context.slaBreachCount ?? 0;
  const opportunities = context.opportunities ?? [];
  const opportunityTypes = context.opportunityTypes ?? [];
  const normalizedStaleDays = Number.isFinite(staleDays) && staleDays > 0 ? staleDays : 30;
  const staleCutoff = generatedAt.getTime() - normalizedStaleDays * 24 * 60 * 60 * 1000;
  const activitiesByLeadId = new Map<string, any[]>();

  for (const activity of activities) {
    if (!activity.leadId) continue;
    const existing = activitiesByLeadId.get(activity.leadId) ?? [];
    existing.push(activity);
    activitiesByLeadId.set(activity.leadId, existing);
  }

  const valuesByLeadAndField = new Map<string, Map<string, unknown>>();
  for (const value of customFieldValues) {
    const leadId = value.entityId ?? value.recordId;
    if (!leadId || !value.fieldDefinitionId) continue;
    const fieldMap = valuesByLeadAndField.get(leadId) ?? new Map<string, unknown>();
    fieldMap.set(value.fieldDefinitionId, value.value);
    valuesByLeadAndField.set(leadId, fieldMap);
  }

  const emailGroups = groupLeadsByNormalizedValue(leads, (lead) => normalizeEmail(lead.email));
  const phoneGroups = groupLeadsByNormalizedValue(leads, (lead) => normalizePhone(lead.phone));
  const duplicateEmailGroups = [...emailGroups.values()].filter((group) => group.length > 1);
  const duplicatePhoneGroups = [...phoneGroups.values()].filter((group) => group.length > 1);
  const duplicateLeadIds = new Set<string>();
  for (const group of [...duplicateEmailGroups, ...duplicatePhoneGroups]) {
    for (const lead of group) duplicateLeadIds.add(lead.id);
  }

  const staleLeadIds: string[] = [];
  const missingRequiredLeadIds = new Set<string>();
  const missingOwnerLeadIds: string[] = [];
  const missingEmailLeadIds: string[] = [];
  const missingPhoneLeadIds: string[] = [];

  for (const lead of leads) {
    const latestActivityAt = (activitiesByLeadId.get(lead.id) ?? [])
      .map((activity) => new Date(activity.createdAt).getTime())
      .filter((time) => Number.isFinite(time))
      .sort((a, b) => b - a)[0] ?? null;
    const updatedAt = lead.updatedAt ? new Date(lead.updatedAt).getTime() : null;
    const staleByActivity = latestActivityAt === null || latestActivityAt < staleCutoff;
    const staleByUpdate = updatedAt === null || updatedAt < staleCutoff;
    if (staleByActivity && staleByUpdate) staleLeadIds.push(lead.id);

    if (isBlank(lead.name)) missingRequiredLeadIds.add(lead.id);
    const leadValues = valuesByLeadAndField.get(lead.id) ?? new Map();
    for (const field of requiredFields) {
      if (isBlank(leadValues.get(field.id))) missingRequiredLeadIds.add(lead.id);
    }

    if (isBlank(lead.ownerId)) missingOwnerLeadIds.push(lead.id);
    if (isBlank(lead.email)) missingEmailLeadIds.push(lead.id);
    if (isBlank(lead.phone)) missingPhoneLeadIds.push(lead.id);
  }

  // A touch with medium/campaign set but no source is a broken-tracking-link symptom --
  // UTM semantics only make sense once a source is known (medium/campaign qualify *which*
  // source, they don't stand alone).
  const invalidUtmTouchIds = attributionTouches
    .filter((touch) => isBlank(touch.source) && (!isBlank(touch.medium) || !isBlank(touch.campaign)))
    .map((touch) => touch.id)
    .filter(Boolean);

  // Deliberately fixed, not tenant-configurable in this pass (see checklist changelog):
  // an Opportunity past its type's first stage should have moved past "no amount estimated
  // yet" -- a reasonable default expectation for any pipeline, independent of the specific
  // stage names a tenant configured.
  const stageOrderById = new Map(opportunityTypes.flatMap((type: any) => (type.stages ?? []).map((stage: any) => [stage.id, stage.order])));
  const opportunitiesMissingStageRequiredFieldIds = opportunities
    .filter((opportunity) => {
      const stageOrder = stageOrderById.get(opportunity.stageId);
      return typeof stageOrder === "number" && stageOrder > 0 && isBlank(opportunity.amount);
    })
    .map((opportunity) => opportunity.id);

  const issues: DataQualityIssue[] = [
    issue("duplicate_email", "Duplicate email groups", duplicateEmailGroups.length, duplicateEmailGroups.flat().map((lead) => lead.id)),
    issue("duplicate_phone", "Duplicate phone groups", duplicatePhoneGroups.length, duplicatePhoneGroups.flat().map((lead) => lead.id)),
    issue("stale_leads", `Stale leads (${normalizedStaleDays}+ days)`, staleLeadIds.length, staleLeadIds),
    issue("missing_required_fields", "Leads missing required fields", missingRequiredLeadIds.size, [...missingRequiredLeadIds]),
    issue("missing_owner", "Leads missing owner", missingOwnerLeadIds.length, missingOwnerLeadIds),
    issue("missing_email", "Leads missing email", missingEmailLeadIds.length, missingEmailLeadIds),
    issue("missing_phone", "Leads missing phone", missingPhoneLeadIds.length, missingPhoneLeadIds),
    issue("invalid_utm_combination", "Attribution touches with medium/campaign but no source", invalidUtmTouchIds.length, invalidUtmTouchIds),
    issue("sla_breaches", "Open tasks in SLA breach", slaBreachCount, []),
    issue(
      "stage_required_fields",
      "Opportunities past first stage missing amount",
      opportunitiesMissingStageRequiredFieldIds.length,
      opportunitiesMissingStageRequiredFieldIds,
    ),
  ];

  return {
    reportKey: "data_quality",
    generatedAt: generatedAt.toISOString(),
    staleDays: normalizedStaleDays,
    totals: {
      totalLeads: leads.length,
      duplicateEmailGroups: duplicateEmailGroups.length,
      duplicatePhoneGroups: duplicatePhoneGroups.length,
      duplicateLeads: duplicateLeadIds.size,
      staleLeads: staleLeadIds.length,
      missingRequiredFieldLeads: missingRequiredLeadIds.size,
      missingOwner: missingOwnerLeadIds.length,
      missingEmail: missingEmailLeadIds.length,
      missingPhone: missingPhoneLeadIds.length,
      invalidUtmTouches: invalidUtmTouchIds.length,
      slaBreaches: slaBreachCount,
      opportunitiesMissingStageRequiredFields: opportunitiesMissingStageRequiredFieldIds.length,
    },
    issues,
  };
}

function reassignmentBucket(eventCount: number) {
  if (eventCount <= 1) {
    return {
      key: "never_or_initial_assignment",
      label: "Never or initial assignment",
      min: 0,
      max: 1,
    };
  }
  if (eventCount === 2) {
    return {
      key: "reassigned_once",
      label: "Reassigned once",
      min: 2,
      max: 2,
    };
  }
  return {
    key: "reassigned_multiple",
    label: "Reassigned multiple times",
    min: 3,
    max: null,
  };
}

function isCallActivity(activity: any) {
  const typeName = String(activity.type?.name ?? activity.activityType?.name ?? "").toLowerCase();
  return typeName.includes("call") || typeName.includes("phone");
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function getPeriodRange(date: Date, grain: "day" | "week" | "month") {
  if (grain === "month") {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  if (grain === "week") {
    const start = startOfDay(date);
    const day = start.getDay();
    start.setDate(start.getDate() - day);
    const end = endOfDay(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }

  return { start: startOfDay(date), end: endOfDay(date) };
}

function issue(type: string, label: string, count: number, leadIds: string[]): DataQualityIssue {
  return { type, label, count, sampleLeadIds: leadIds.slice(0, 10) };
}

function groupLeadsByNormalizedValue(leads: any[], getValue: (lead: any) => string | null) {
  const groups = new Map<string, any[]>();
  for (const lead of leads) {
    const value = getValue(lead);
    if (!value) continue;
    const existing = groups.get(value) ?? [];
    existing.push(lead);
    groups.set(value, existing);
  }
  return groups;
}

function normalizeEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return email.length > 0 ? email : null;
}

function normalizePhone(value: unknown) {
  const phone = typeof value === "string" ? value.replace(/\D/g, "") : "";
  return phone.length >= 7 ? phone : null;
}

function isBlank(value: unknown) {
  return value === null || value === undefined || (typeof value === "string" && value.trim().length === 0);
}

async function listTenantUsers(user: TenantUser) {
  if (!user.tenantId) return [];
  return pgQuery('select id, name, email, "managerId", "teamId" from "User" where "tenantId" = $1', [user.tenantId]);
}

async function listAssignmentEventsForTenant(user: TenantUser) {
  if (!user.tenantId) return [];

  const [assignmentLogs, auditLogs] = await Promise.all([
    pgQuery<any>(
      `select id, "entityType", "entityId", "assignedToId", "assignedById", reason, "assignedAt"
       from "AssignmentLog"
       where "tenantId" = $1`,
      [user.tenantId],
    ),
    pgQuery<any>(
      `select id, "entityType", "entityId", "userId", diff, "createdAt"
       from "AuditLog"
       where "tenantId" = $1 and action = 'ASSIGN'`,
      [user.tenantId],
    ),
  ]);

  return [
    ...assignmentLogs.map((row: any) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      assignedToId: row.assignedToId,
      assignedById: row.assignedById,
      reason: row.reason,
      assignedAt: row.assignedAt,
      source: "AssignmentLog",
    })),
    ...auditLogs.map((row: any) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      assignedToId: row.userId,
      assignedById: null,
      reason: row.diff?.reason ?? null,
      assignedAt: row.createdAt,
      source: "AuditLog",
    })),
  ].sort((a, b) => new Date(a.assignedAt).getTime() - new Date(b.assignedAt).getTime());
}

async function listCommissionPayoutSummaryInputs(user: TenantUser) {
  if (!user.tenantId) {
    return { ledgerEntries: [], payouts: [], invoices: [], cycles: [], partners: [], partnerScoped: false };
  }

  const partnerScoped = isPartnerScopedUser(user);
  const partnerId = partnerScoped ? user.id : null;

  const partnerClause = partnerId ? ' and "partnerId" = $2' : "";
  const partnerValues = partnerId ? [user.tenantId, partnerId] : [user.tenantId];
  const profileClause = partnerId ? ' and "userId" = $2' : "";
  const [ledgerEntries, payouts, invoices, cycles, partners] = await Promise.all([
    pgQuery<any>(
      `select id, "partnerId", "entryType", "commissionAmount", "createdAt"
       from "CommissionLedger"
       where "tenantId" = $1${partnerClause}`,
      partnerValues,
    ),
    pgQuery<any>(
      `select id, "partnerId", "totalCommissionAmount", status, "payoutCycleId", "invoiceId", "createdAt"
       from "Payout"
       where "tenantId" = $1${partnerClause}`,
      partnerValues,
    ),
    pgQuery<any>(
      `select id, "partnerId", "payoutId", "totalAmount", "invoiceDate", "invoiceNumber"
       from "PartnerInvoice"
       where "tenantId" = $1${partnerClause}`,
      partnerValues,
    ),
    pgQuery<any>(
      `select id, "cycleLabel", "startDate", "endDate", status
       from "PayoutCycle"
       where "tenantId" = $1
       order by "startDate" desc
       limit 5`,
      [user.tenantId],
    ),
    pgQuery<any>(
      `select id, "userId", "legalBusinessName", status
       from "PartnerProfile"
       where "tenantId" = $1${profileClause}`,
      partnerId ? [user.tenantId, partnerId] : [user.tenantId],
    ),
  ]);
  const userIds = partners.map((partner: any) => partner.userId).filter(Boolean);
  const users = userIds.length > 0
    ? await pgQuery<any>('select id, name, email from "User" where id = any($1::text[])', [userIds])
    : [];
  const userById = new Map(users.map((tenantUser: any) => [tenantUser.id, tenantUser]));

  return {
    ledgerEntries,
    payouts,
    invoices,
    cycles,
    partners: partners.map((partner: any) => ({ ...partner, user: userById.get(partner.userId) ?? null })),
    partnerScoped,
  };
}

function isPartnerScopedUser(user: TenantUser) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean((user as any).isPartner || rolePermissions?.isPartnerRole);
}

async function listOpportunityStageHistoryForTenant(user: TenantUser, opportunityIds: string[]) {
  if (!user.tenantId || opportunityIds.length === 0) return [];

  const rows: any[] = [];
  for (let index = 0; index < opportunityIds.length; index += 100) {
    const chunk = opportunityIds.slice(index, index + 100);
    rows.push(...await pgQuery<any>(
      `select id, "opportunityId", "fromStageId", "toStageId", "changedAt"
       from "OpportunityStageHistory"
       where "tenantId" = $1 and "opportunityId" = any($2::text[])`,
      [user.tenantId, chunk],
    ));
  }
  return rows;
}

async function listRequiredLeadFieldsForTenant(user: TenantUser) {
  if (!user.tenantId) return [];

  const leadObject = await pgQueryOne<{ id: string }>(
    `select id from "ObjectDefinition" where "tenantId" = $1 and lower(name) = 'lead' limit 1`,
    [user.tenantId],
  );
  if (!leadObject) return [];

  return pgQuery(
    `select id, key, label
     from "FieldDefinition"
     where "tenantId" = $1
       and "objectId" = $2
       and "isRequired" = true
       and "isActive" = true
       and "isCustom" = true
       and "deletedAt" is null`,
    [user.tenantId, leadObject.id],
  );
}

async function listLeadCustomFieldValuesForTenant(user: TenantUser) {
  if (!user.tenantId) return [];

  return listCustomFieldValuesForTenant(user.tenantId);
}

async function listCustomFieldValuesForTenant(tenantId: string, fieldDefinitionId?: string) {
  const attempts = [
    '"entityId", "fieldDefinitionId", value',
    '"recordId", "fieldDefinitionId", value',
    '"recordId", "fieldDefinitionId", "valueString", "valueJson", "valueNumber", "valueDate", "valueBoolean"',
  ];
  let lastError: any = null;

  for (const select of attempts) {
    const values: unknown[] = [tenantId];
    let filter = "";
    if (fieldDefinitionId) {
      values.push(fieldDefinitionId);
      filter = ` and "fieldDefinitionId" = $${values.length}`;
    }

    try {
      const rows = await pgQuery<any>(
        `select ${select} from "CustomFieldValue" where "tenantId" = $1${filter}`,
        values,
      );
      return rows.map((row: any) => ({
        ...row,
        entityId: row.entityId ?? null,
        recordId: row.recordId ?? null,
        value: normalizedCustomFieldValue(row),
      }));
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "";
      if (!/column|does not exist/i.test(message)) throw error;
    }
  }

  throw lastError;
}

// --- Next-Best-Action Performance ---

export type NextBestActionPerformanceReport = {
  reportKey: "next_best_action_performance";
  generatedAt: string;
  totals: {
    totalRecommendations: number;
    totalResponded: number;
    acceptedCount: number;
    dismissedCount: number;
    notUsefulCount: number;
    snoozedCount: number;
    acceptedRate: number;
    // "Completion rate" -- of the ACCEPTED recommendations, how many had their spawned task
    // actually finished (status flips ACCEPTED -> COMPLETED via tasks-postgres.ts's completion
    // hook), as opposed to accepted-then-never-followed-through.
    completedCount: number;
    completionRate: number;
  };
  byActionType: Array<{ actionType: string; total: number; accepted: number; acceptedRate: number }>;
  byModule: Array<{ recordType: string; total: number; accepted: number; acceptedRate: number }>;
  byOwner: Array<{ ownerId: string; ownerName: string; total: number; accepted: number; acceptedRate: number }>;
  // "Model/rule performance" -- bucketed by the actual authored rule (ruleId), a finer
  // dimension than byActionType (multiple independent rules can share one actionType). There is
  // only one ranking MODEL today (the deterministic formula, optionally ml-service-adjusted --
  // see computeCandidateScore) so a model-vs-model comparison has nothing to compare against;
  // this is the real, buildable half of that sub-item.
  byRule: Array<{ ruleId: string; ruleName: string; total: number; accepted: number; acceptedRate: number }>;
  // Lead-only (Lead.source has no Opportunity equivalent) and Opportunity-only (stage is an
  // Opportunity concept) respectively -- unlike byActionType/byModule/byOwner, these two are
  // naturally partial breakdowns, not every recommendation has an applicable bucket.
  bySource: Array<{ source: string; total: number; accepted: number; acceptedRate: number }>;
  byStage: Array<{ stageName: string; total: number; accepted: number; acceptedRate: number }>;
  byTeam: Array<{ teamId: string; teamName: string; total: number; accepted: number; acceptedRate: number }>;
  // "Action fatigue" -- counts of candidates that scored eligible but were cut before ever
  // becoming a recommendation, broken down by why (channel fatigue / daily cap / cooldown /
  // already-pending / eligibility mismatch). Sourced from NextBestActionCandidate, a different
  // table than the rest of this report (every rule evaluation, not just what became a
  // recommendation) -- previously ungrouped and effectively invisible, since the channel-
  // fatigue/daily-cap filters didn't write a distinguishing reason until this pass.
  suppressionBreakdown: Array<{ reason: string; count: number }>;
  // "Conversion impact" / "response impact" -- a real, if simple, outcome correlation using
  // only data that already exists (no new schema): does the record carrying this
  // recommendation currently show a converted Lead / won Opportunity, split by whether the
  // recommendation was actually accepted (conversionImpact) vs whether the owner responded to
  // it at all, accept or not (responseImpact, PENDING/SNOOZED counted as "no response"). This is
  // a correlation at report-generation time, not a controlled before/after causal measurement --
  // stated as such in the report's own field names rather than implying more than it shows.
  conversionImpact: { accepted: { total: number; convertedOrWon: number; rate: number }; notAccepted: { total: number; convertedOrWon: number; rate: number } };
  responseImpact: { responded: { total: number; convertedOrWon: number; rate: number }; noResponse: { total: number; convertedOrWon: number; rate: number } };
};

export async function getNextBestActionPerformanceReportForTenant(user: TenantUser): Promise<NextBestActionPerformanceReport> {
  const empty: NextBestActionPerformanceReport = {
    reportKey: "next_best_action_performance",
    generatedAt: new Date().toISOString(),
    totals: { totalRecommendations: 0, totalResponded: 0, acceptedCount: 0, dismissedCount: 0, notUsefulCount: 0, snoozedCount: 0, acceptedRate: 0, completedCount: 0, completionRate: 0 },
    byActionType: [],
    byModule: [],
    byOwner: [],
    byRule: [],
    bySource: [],
    byStage: [],
    byTeam: [],
    suppressionBreakdown: [],
    conversionImpact: { accepted: { total: 0, convertedOrWon: 0, rate: 0 }, notAccepted: { total: 0, convertedOrWon: 0, rate: 0 } },
    responseImpact: { responded: { total: 0, convertedOrWon: 0, rate: 0 }, noResponse: { total: 0, convertedOrWon: 0, rate: 0 } },
  };
  if (!user.tenantId) return empty;

  const recommendations = await pgQuery<any>(
    `select "actionType", "recordType", "recordId", "ownerId", "ruleId", status from "NextBestActionRecommendation" where "tenantId" = $1`,
    [user.tenantId],
  );

  const suppressionRows = await pgQuery<{ suppressedReason: string; count: number }>(
    `select "suppressedReason", count(*)::int as count from "NextBestActionCandidate"
     where "tenantId" = $1 and "suppressedReason" is not null
     group by "suppressedReason"
     order by count desc`,
    [user.tenantId],
  );
  const suppressionBreakdown = suppressionRows.map((row) => ({ reason: row.suppressedReason, count: row.count }));

  if (!recommendations.length) return { ...empty, suppressionBreakdown };

  const ownerIds = [...new Set(recommendations.map((row) => row.ownerId).filter(Boolean))];
  const owners = ownerIds.length
    ? await pgQuery<any>('select id, name, email, "teamId" from "User" where "tenantId" = $1 and id = any($2::text[])', [user.tenantId, ownerIds])
    : [];
  const teamIds = [...new Set(owners.map((owner) => owner.teamId).filter(Boolean))];
  const teams = teamIds.length
    ? await pgQuery<any>('select id, name from "Team" where "tenantId" = $1 and id = any($2::text[])', [user.tenantId, teamIds])
    : [];

  const ruleIds = [...new Set(recommendations.map((row) => row.ruleId).filter(Boolean))];
  const rules = ruleIds.length
    ? await pgQuery<any>('select id, name from "NextBestActionRule" where "tenantId" = $1 and id = any($2::text[])', [user.tenantId, ruleIds])
    : [];

  const leadIds = [...new Set(recommendations.filter((row) => row.recordType === "LEAD").map((row) => row.recordId))];
  const leadSources = leadIds.length
    ? await pgQuery<any>('select id, source from "Lead" where "tenantId" = $1 and id = any($2::text[])', [user.tenantId, leadIds])
    : [];
  const leadStatuses = leadIds.length
    ? await pgQuery<any>('select id, status from "Lead" where "tenantId" = $1 and id = any($2::text[])', [user.tenantId, leadIds])
    : [];

  const opportunityIds = [...new Set(recommendations.filter((row) => row.recordType === "OPPORTUNITY").map((row) => row.recordId))];
  const opportunityStages = opportunityIds.length
    ? await pgQuery<any>(
        `select o.id, sd.name as "stageName" from "Opportunity" o
         left join "StageDefinition" sd on sd.id = o."stageId"
         where o."tenantId" = $1 and o.id = any($2::text[])`,
        [user.tenantId, opportunityIds],
      )
    : [];
  const opportunityWonFlags = opportunityIds.length
    ? await pgQuery<any>(
        `select o.id, sd."isWon" as "isWon" from "Opportunity" o
         left join "StageDefinition" sd on sd.id = o."stageId"
         where o."tenantId" = $1 and o.id = any($2::text[])`,
        [user.tenantId, opportunityIds],
      )
    : [];

  return calculateNextBestActionPerformanceReport(recommendations, owners, new Date(), {
    teams,
    rules,
    leadSources,
    leadStatuses,
    opportunityStages,
    opportunityWonFlags,
    suppressionBreakdown,
  });
}

export function calculateNextBestActionPerformanceReport(
  recommendations: Array<{ actionType: string; recordType: string; recordId?: string; ownerId: string | null; ruleId?: string | null; status: string }>,
  owners: Array<{ id: string; name?: string | null; email?: string | null; teamId?: string | null }>,
  generatedAt: Date,
  context: {
    teams?: Array<{ id: string; name: string }>;
    rules?: Array<{ id: string; name: string }>;
    leadSources?: Array<{ id: string; source: string | null }>;
    leadStatuses?: Array<{ id: string; status: string | null }>;
    opportunityStages?: Array<{ id: string; stageName: string | null }>;
    opportunityWonFlags?: Array<{ id: string; isWon: boolean | null }>;
    suppressionBreakdown?: Array<{ reason: string; count: number }>;
  } = {}
): NextBestActionPerformanceReport {
  const ownerById = new Map(owners.map((owner) => [owner.id, owner]));
  const teamNameById = new Map((context.teams ?? []).map((team) => [team.id, team.name]));
  const ruleNameById = new Map((context.rules ?? []).map((rule) => [rule.id, rule.name]));
  const leadSourceById = new Map((context.leadSources ?? []).map((lead) => [lead.id, lead.source]));
  const leadStatusById = new Map((context.leadStatuses ?? []).map((lead) => [lead.id, lead.status]));
  const opportunityStageById = new Map((context.opportunityStages ?? []).map((opportunity) => [opportunity.id, opportunity.stageName]));
  const opportunityWonById = new Map((context.opportunityWonFlags ?? []).map((opportunity) => [opportunity.id, !!opportunity.isWon]));

  const totals = { totalRecommendations: 0, totalResponded: 0, acceptedCount: 0, dismissedCount: 0, notUsefulCount: 0, snoozedCount: 0, acceptedRate: 0, completedCount: 0, completionRate: 0 };
  const actionTypeMap = new Map<string, { total: number; accepted: number }>();
  const moduleMap = new Map<string, { total: number; accepted: number }>();
  const ownerMap = new Map<string, { total: number; accepted: number }>();
  const ruleMap = new Map<string, { total: number; accepted: number }>();
  const sourceMap = new Map<string, { total: number; accepted: number }>();
  const stageMap = new Map<string, { total: number; accepted: number }>();
  const teamMap = new Map<string, { total: number; accepted: number }>();

  const bump = (map: Map<string, { total: number; accepted: number }>, key: string, accepted: boolean) => {
    const bucket = map.get(key) ?? { total: 0, accepted: 0 };
    bucket.total += 1;
    if (accepted) bucket.accepted += 1;
    map.set(key, bucket);
  };

  // "Conversion impact" / "response impact" -- a correlation at report-generation time between
  // this recommendation's disposition and the record's CURRENT outcome, not a controlled
  // before/after measurement (no snapshot of the record's state at recommendation-time exists).
  const conversionImpact = { accepted: { total: 0, convertedOrWon: 0 }, notAccepted: { total: 0, convertedOrWon: 0 } };
  const responseImpact = { responded: { total: 0, convertedOrWon: 0 }, noResponse: { total: 0, convertedOrWon: 0 } };
  const isConvertedOrWon = (rec: { recordType: string; recordId?: string }) => {
    if (rec.recordType === "LEAD" && rec.recordId) return leadStatusById.get(rec.recordId) === "CONVERTED";
    if (rec.recordType === "OPPORTUNITY" && rec.recordId) return !!opportunityWonById.get(rec.recordId);
    return false;
  };

  for (const rec of recommendations) {
    const accepted = rec.status === "ACCEPTED" || rec.status === "COMPLETED";
    totals.totalRecommendations += 1;
    if (rec.status !== "PENDING") totals.totalResponded += 1;
    if (rec.status === "ACCEPTED" || rec.status === "COMPLETED") totals.acceptedCount += 1;
    if (rec.status === "DISMISSED") totals.dismissedCount += 1;
    if (rec.status === "NOT_USEFUL") totals.notUsefulCount += 1;
    if (rec.status === "SNOOZED") totals.snoozedCount += 1;
    if (rec.status === "COMPLETED") totals.completedCount += 1;

    bump(actionTypeMap, rec.actionType, accepted);
    bump(moduleMap, rec.recordType, accepted);
    if (rec.ownerId) bump(ownerMap, rec.ownerId, accepted);
    if (rec.ruleId) bump(ruleMap, rec.ruleId, accepted);

    if (rec.recordType === "LEAD" && rec.recordId) {
      const source = leadSourceById.get(rec.recordId);
      if (source) bump(sourceMap, source, accepted);
    }
    if (rec.recordType === "OPPORTUNITY" && rec.recordId) {
      const stageName = opportunityStageById.get(rec.recordId);
      if (stageName) bump(stageMap, stageName, accepted);
    }
    const teamId = rec.ownerId ? ownerById.get(rec.ownerId)?.teamId : null;
    if (teamId) bump(teamMap, teamId, accepted);

    const converted = isConvertedOrWon(rec);
    const bucket = accepted ? conversionImpact.accepted : conversionImpact.notAccepted;
    bucket.total += 1;
    if (converted) bucket.convertedOrWon += 1;

    const hasResponded = rec.status !== "PENDING" && rec.status !== "SNOOZED";
    const responseBucket = hasResponded ? responseImpact.responded : responseImpact.noResponse;
    responseBucket.total += 1;
    if (converted) responseBucket.convertedOrWon += 1;
  }

  totals.acceptedRate = totals.totalResponded > 0 ? Math.round((totals.acceptedCount / totals.totalResponded) * 1000) / 10 : 0;
  totals.completionRate = totals.acceptedCount > 0 ? Math.round((totals.completedCount / totals.acceptedCount) * 1000) / 10 : 0;

  const rate = (bucket: { total: number; accepted: number }) => (bucket.total > 0 ? Math.round((bucket.accepted / bucket.total) * 1000) / 10 : 0);
  const outcomeRate = (bucket: { total: number; convertedOrWon: number }) => (bucket.total > 0 ? Math.round((bucket.convertedOrWon / bucket.total) * 1000) / 10 : 0);

  return {
    reportKey: "next_best_action_performance",
    generatedAt: generatedAt.toISOString(),
    totals,
    byActionType: [...actionTypeMap.entries()]
      .map(([actionType, bucket]) => ({ actionType, total: bucket.total, accepted: bucket.accepted, acceptedRate: rate(bucket) }))
      .sort((a, b) => b.total - a.total),
    byModule: [...moduleMap.entries()]
      .map(([recordType, bucket]) => ({ recordType, total: bucket.total, accepted: bucket.accepted, acceptedRate: rate(bucket) }))
      .sort((a, b) => b.total - a.total),
    byOwner: [...ownerMap.entries()]
      .map(([ownerId, bucket]) => ({
        ownerId,
        ownerName: ownerById.get(ownerId)?.name || ownerById.get(ownerId)?.email || ownerId,
        total: bucket.total,
        accepted: bucket.accepted,
        acceptedRate: rate(bucket),
      }))
      .sort((a, b) => b.total - a.total),
    byRule: [...ruleMap.entries()]
      .map(([ruleId, bucket]) => ({
        ruleId,
        ruleName: ruleNameById.get(ruleId) || ruleId,
        total: bucket.total,
        accepted: bucket.accepted,
        acceptedRate: rate(bucket),
      }))
      .sort((a, b) => b.total - a.total),
    bySource: [...sourceMap.entries()]
      .map(([source, bucket]) => ({ source, total: bucket.total, accepted: bucket.accepted, acceptedRate: rate(bucket) }))
      .sort((a, b) => b.total - a.total),
    byStage: [...stageMap.entries()]
      .map(([stageName, bucket]) => ({ stageName, total: bucket.total, accepted: bucket.accepted, acceptedRate: rate(bucket) }))
      .sort((a, b) => b.total - a.total),
    byTeam: [...teamMap.entries()]
      .map(([teamId, bucket]) => ({
        teamId,
        teamName: teamNameById.get(teamId) || teamId,
        total: bucket.total,
        accepted: bucket.accepted,
        acceptedRate: rate(bucket),
      }))
      .sort((a, b) => b.total - a.total),
    suppressionBreakdown: context.suppressionBreakdown ?? [],
    conversionImpact: {
      accepted: { total: conversionImpact.accepted.total, convertedOrWon: conversionImpact.accepted.convertedOrWon, rate: outcomeRate(conversionImpact.accepted) },
      notAccepted: { total: conversionImpact.notAccepted.total, convertedOrWon: conversionImpact.notAccepted.convertedOrWon, rate: outcomeRate(conversionImpact.notAccepted) },
    },
    responseImpact: {
      responded: { total: responseImpact.responded.total, convertedOrWon: responseImpact.responded.convertedOrWon, rate: outcomeRate(responseImpact.responded) },
      noResponse: { total: responseImpact.noResponse.total, convertedOrWon: responseImpact.noResponse.convertedOrWon, rate: outcomeRate(responseImpact.noResponse) },
    },
  };
}

// --- Marketing Journey Performance ---

export async function getJourneyPerformanceReportForTenant(user: TenantUser) {
  const empty = { reportKey: "journey_performance" as const, generatedAt: new Date().toISOString(), journeys: [] as any[] };
  if (!user.tenantId) return empty;

  const journeys = await pgQuery<any>(`select id, name, status from "MarketingJourney" where "tenantId" = $1`, [user.tenantId]);
  if (!journeys.length) return empty;

  const enrollments = await pgQuery<any>(
    `select "journeyId", status from "MarketingJourneyEnrollment" where "tenantId" = $1`,
    [user.tenantId],
  );
  const byJourney = new Map<string, { active: number; exited: number; converted: number; unsubscribed: number; failed: number; total: number }>();
  for (const row of enrollments) {
    const bucket = byJourney.get(row.journeyId) ?? { active: 0, exited: 0, converted: 0, unsubscribed: 0, failed: 0, total: 0 };
    bucket.total += 1;
    if (row.status === "ACTIVE") bucket.active += 1;
    if (row.status === "EXITED") bucket.exited += 1;
    if (row.status === "CONVERTED") bucket.converted += 1;
    if (row.status === "UNSUBSCRIBED") bucket.unsubscribed += 1;
    if (row.status === "FAILED") bucket.failed += 1;
    byJourney.set(row.journeyId, bucket);
  }

  return {
    reportKey: "journey_performance" as const,
    generatedAt: new Date().toISOString(),
    journeys: journeys.map((journey) => {
      const bucket = byJourney.get(journey.id) ?? { active: 0, exited: 0, converted: 0, unsubscribed: 0, failed: 0, total: 0 };
      return {
        journeyId: journey.id,
        journeyName: journey.name,
        status: journey.status,
        enrolled: bucket.total,
        active: bucket.active,
        exited: bucket.exited,
        converted: bucket.converted,
        unsubscribed: bucket.unsubscribed,
        conversionRate: bucket.total > 0 ? Math.round((bucket.converted / bucket.total) * 1000) / 10 : 0,
      };
    }),
  };
}

// --- Marketing Attribution Summary ---

// Gap checklist Module 8, item 13: 6 additional attribution models (LINEAR/U_SHAPED/W_SHAPED/
// TIME_DECAY/CAMPAIGN_SOURCE_OVERRIDE/CUSTOM_WEIGHTED) on top of the original FIRST_TOUCH/
// LAST_TOUCH pair -- see computeAttributionWeights in marketing-journeys.ts for the per-model
// weighting logic.
export async function getMarketingAttributionSummaryReportForTenant(
  user: TenantUser,
  model:
    | "FIRST_TOUCH"
    | "LAST_TOUCH"
    | "LINEAR"
    | "U_SHAPED"
    | "W_SHAPED"
    | "TIME_DECAY"
    | "CAMPAIGN_SOURCE_OVERRIDE"
    | "CUSTOM_WEIGHTED" = "FIRST_TOUCH",
  customWeights?: Record<string, number>
) {
  const { getAttributionSummaryForTenant } = await import("@/lib/server/marketing-journeys");
  const summary = await getAttributionSummaryForTenant(user, model, customWeights);
  return { reportKey: "marketing_attribution_summary" as const, generatedAt: new Date().toISOString(), ...summary };
}

// --- Attribution Explorer (gap checklist Module 17, item 13) ---
// Adds ROI (channel-level cost join), assisted-conversion detection, ordered touch-paths, and
// revenue influence on top of the plain per-source credit table above.
export async function getAttributionExplorerReportForTenant(
  user: TenantUser,
  model:
    | "FIRST_TOUCH"
    | "LAST_TOUCH"
    | "LINEAR"
    | "U_SHAPED"
    | "W_SHAPED"
    | "TIME_DECAY"
    | "CAMPAIGN_SOURCE_OVERRIDE"
    | "CUSTOM_WEIGHTED" = "LINEAR",
  customWeights?: Record<string, number>
) {
  const { getAttributionExplorerForTenant } = await import("@/lib/server/marketing-journeys");
  const explorer = await getAttributionExplorerForTenant(user, model, customWeights);
  return { reportKey: "attribution_explorer" as const, ...explorer };
}

// --- Sender Reputation (gap checklist Module 8, item 19) ---
// CommunicationDeliveryEvent's `eventType` is free-text, provider-supplied (see the webhook
// route at /api/communications/webhooks/[channel]) with no fixed vocabulary in this codebase --
// bounce/complaint/unsubscribe signals are detected via pattern matching on that text rather
// than an exact-match enum, since different providers name these events differently.
export async function getSenderReputationReportForTenant(user: TenantUser, days = 30) {
  const empty = {
    reportKey: "sender_reputation" as const,
    generatedAt: new Date().toISOString(),
    windowDays: days,
    byChannel: [] as any[],
    topFailureReasons: [] as any[],
  };
  if (!user.tenantId) return empty;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const outboxStats = await pgQuery<any>(
    `select channel,
       count(*)::int as total,
       count(*) filter (where status = 'SENT')::int as sent,
       count(*) filter (where status = 'FAILED')::int as failed,
       count(*) filter (where status = 'SUPPRESSED')::int as suppressed,
       avg(extract(epoch from ("sentAt" - "createdAt"))) filter (where status = 'SENT' and "sentAt" is not null) as "avgLatencySeconds"
     from "CommunicationOutbox"
     where "tenantId" = $1 and "createdAt" >= $2
     group by channel`,
    [user.tenantId, since],
  );

  const eventStats = await pgQuery<any>(
    `select o.channel,
       count(*) filter (where e."eventType" ilike '%bounce%')::int as bounced,
       count(*) filter (where e."eventType" ilike '%complain%' or e."eventType" ilike '%spam%')::int as complained,
       count(*) filter (where e."eventType" ilike '%unsub%' or e."eventType" ilike '%opt%out%')::int as unsubscribed
     from "CommunicationDeliveryEvent" e
     join "CommunicationOutbox" o on o.id = e."outboxId"
     where e."tenantId" = $1 and e."occurredAt" >= $2
     group by o.channel`,
    [user.tenantId, since],
  );
  const eventsByChannel = new Map(eventStats.map((row: any) => [row.channel, row]));

  const topFailureReasons = await pgQuery<any>(
    `select channel, error, count(*)::int as count
     from "CommunicationOutbox"
     where "tenantId" = $1 and "createdAt" >= $2 and status = 'FAILED' and error is not null
     group by channel, error
     order by count desc
     limit 15`,
    [user.tenantId, since],
  );

  return {
    reportKey: "sender_reputation" as const,
    generatedAt: new Date().toISOString(),
    windowDays: days,
    byChannel: outboxStats.map((row: any) => {
      const events = eventsByChannel.get(row.channel) ?? { bounced: 0, complained: 0, unsubscribed: 0 };
      const sent = Number(row.sent ?? 0);
      return {
        channel: row.channel,
        total: Number(row.total ?? 0),
        sent,
        failed: Number(row.failed ?? 0),
        suppressed: Number(row.suppressed ?? 0),
        avgDeliveryLatencySeconds: row.avgLatencySeconds ? Math.round(Number(row.avgLatencySeconds)) : null,
        bounced: Number(events.bounced ?? 0),
        complained: Number(events.complained ?? 0),
        unsubscribed: Number(events.unsubscribed ?? 0),
        bounceRate: sent > 0 ? Math.round((Number(events.bounced ?? 0) / sent) * 10000) / 100 : 0,
        complaintRate: sent > 0 ? Math.round((Number(events.complained ?? 0) / sent) * 10000) / 100 : 0,
      };
    }),
    topFailureReasons: topFailureReasons.map((row: any) => ({ channel: row.channel, reason: row.error, count: row.count })),
  };
}

// --- Campaign ROI (gap checklist Module 8, item 15) ---
// Cost-per-send/click/reply and ROI, sourced from MarketingCostEntry + attribution touches.
// Deliberately NOT payout/commission-integrated -- revenue is Opportunity.amount for won deals
// attributed to a journey, not a downstream commission calculation (see marketing-cost.ts).
export async function getCampaignRoiReportForTenant(user: TenantUser) {
  assertSensitiveReportAccess(user, "campaign_roi");
  const empty = { reportKey: "campaign_roi" as const, generatedAt: new Date().toISOString(), journeys: [] as any[] };
  if (!user.tenantId) return empty;
  const { getScopeCostSummary } = await import("@/lib/server/marketing-cost");

  const journeys = await pgQuery<any>(`select id, name, status from "MarketingJourney" where "tenantId" = $1 order by "createdAt" desc`, [
    user.tenantId,
  ]);
  const rows = [];
  for (const journey of journeys) {
    const cost = await getScopeCostSummary(user, "JOURNEY", journey.id);
    rows.push({ journeyId: journey.id, journeyName: journey.name, status: journey.status, ...cost });
  }
  return { reportKey: "campaign_roi" as const, generatedAt: new Date().toISOString(), journeys: rows };
}

// --- Telephony Call Performance ---
// Module 15's audit found that despite TelephonyCallLog capturing real duration/status/
// provider/direction/agent data on every call, no report anywhere used any of it -- the one
// existing call-related report (calculateActivityCallVolumeTrendReport, above) classifies
// "is this a call" via a substring match on the Activity type name, a time-series/volume
// view, not a quality/performance one. This is a new, complementary report specifically for
// answer rate, talk time, and per-agent call performance -- the metrics genuinely require
// TelephonyCallLog's own columns and can't be derived from the Activity heuristic at all.

const ANSWERED_CALL_STATUSES = new Set(["completed"]);
const MISSED_CALL_STATUSES = new Set(["missed", "no-answer"]);
const FAILED_CALL_STATUSES = new Set(["failed", "busy"]);
const VOICEMAIL_CALL_STATUSES = new Set(["voicemail"]);
const TERMINAL_CALL_STATUSES = new Set([...ANSWERED_CALL_STATUSES, ...MISSED_CALL_STATUSES, ...FAILED_CALL_STATUSES, ...VOICEMAIL_CALL_STATUSES]);

export type TelephonyCallPerformanceReport = {
  reportKey: "telephony_call_performance";
  generatedAt: string;
  totals: {
    totalCalls: number;
    inbound: number;
    outbound: number;
    answered: number;
    missed: number;
    failed: number;
    voicemail: number;
    inProgressOrUnknown: number;
    answerRate: number;
    avgDurationSeconds: number;
    totalTalkTimeSeconds: number;
  };
  byAgent: Array<{ agentId: string | null; agentName: string; totalCalls: number; answered: number; answerRate: number; avgDurationSeconds: number }>;
  byStatus: Array<{ status: string; count: number }>;
  byProvider: Array<{ provider: string; count: number }>;
};

export function calculateTelephonyCallPerformanceReport(
  callLogs: any[],
  users: any[],
  generatedAt: Date
): TelephonyCallPerformanceReport {
  const userNameById = new Map(users.map((user) => [user.id, user.name || user.email || "Unknown"]));

  let inbound = 0;
  let outbound = 0;
  let answered = 0;
  let missed = 0;
  let failed = 0;
  let voicemail = 0;
  let inProgressOrUnknown = 0;
  let totalTalkTimeSeconds = 0;
  let answeredWithDurationCount = 0;

  const statusCounts = new Map<string, number>();
  const providerCounts = new Map<string, number>();
  const agentStats = new Map<string, { agentId: string | null; totalCalls: number; answered: number; talkTimeSeconds: number; answeredWithDuration: number }>();

  for (const log of callLogs) {
    const status = String(log.status ?? "unknown");
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    const provider = String(log.provider ?? "unknown");
    providerCounts.set(provider, (providerCounts.get(provider) ?? 0) + 1);

    if (String(log.direction ?? "").toUpperCase() === "INBOUND") inbound += 1;
    else outbound += 1;

    const duration = typeof log.duration === "number" ? log.duration : Number(log.duration);
    const hasDuration = Number.isFinite(duration) && duration > 0;

    if (ANSWERED_CALL_STATUSES.has(status)) {
      answered += 1;
      if (hasDuration) {
        totalTalkTimeSeconds += duration;
        answeredWithDurationCount += 1;
      }
    } else if (MISSED_CALL_STATUSES.has(status)) missed += 1;
    else if (FAILED_CALL_STATUSES.has(status)) failed += 1;
    else if (VOICEMAIL_CALL_STATUSES.has(status)) voicemail += 1;
    else inProgressOrUnknown += 1;

    const agentKey = log.agentId ? String(log.agentId) : "__unassigned";
    const agentStat = agentStats.get(agentKey) ?? { agentId: log.agentId ?? null, totalCalls: 0, answered: 0, talkTimeSeconds: 0, answeredWithDuration: 0 };
    agentStat.totalCalls += 1;
    if (ANSWERED_CALL_STATUSES.has(status)) {
      agentStat.answered += 1;
      if (hasDuration) {
        agentStat.talkTimeSeconds += duration;
        agentStat.answeredWithDuration += 1;
      }
    }
    agentStats.set(agentKey, agentStat);
  }

  const terminalCalls = answered + missed + failed + voicemail;

  return {
    reportKey: "telephony_call_performance",
    generatedAt: generatedAt.toISOString(),
    totals: {
      totalCalls: callLogs.length,
      inbound,
      outbound,
      answered,
      missed,
      failed,
      voicemail,
      inProgressOrUnknown,
      answerRate: terminalCalls > 0 ? Math.round((answered / terminalCalls) * 1000) / 10 : 0,
      avgDurationSeconds: answeredWithDurationCount > 0 ? Math.round(totalTalkTimeSeconds / answeredWithDurationCount) : 0,
      totalTalkTimeSeconds,
    },
    byAgent: [...agentStats.entries()]
      .map(([agentKey, stat]) => ({
        agentId: stat.agentId,
        agentName: stat.agentId ? (userNameById.get(stat.agentId) ?? "Unknown") : "Unassigned",
        totalCalls: stat.totalCalls,
        answered: stat.answered,
        answerRate: stat.totalCalls > 0 ? Math.round((stat.answered / stat.totalCalls) * 1000) / 10 : 0,
        avgDurationSeconds: stat.answeredWithDuration > 0 ? Math.round(stat.talkTimeSeconds / stat.answeredWithDuration) : 0,
      }))
      .sort((a, b) => b.totalCalls - a.totalCalls),
    byStatus: [...statusCounts.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    byProvider: [...providerCounts.entries()].map(([provider, count]) => ({ provider, count })).sort((a, b) => b.count - a.count),
  };
}

export async function getTelephonyCallPerformanceReportForTenant(user: TenantUser): Promise<TelephonyCallPerformanceReport> {
  if (!user.tenantId) return calculateTelephonyCallPerformanceReport([], [], new Date());
  const [callLogs, users] = await Promise.all([
    pgQuery<any>(
      `select id, provider, "callId", direction, status, duration, "agentId", "leadId", "opportunityId", "startedAt"
       from "TelephonyCallLog"
       where "tenantId" = $1
       order by "startedAt" desc
       limit 5000`,
      [user.tenantId],
    ),
    pgQuery<{ id: string; name: string | null; email: string | null }>(
      `select id, name, email from "User" where "tenantId" = $1`,
      [user.tenantId],
    ),
  ]);
  return calculateTelephonyCallPerformanceReport(callLogs, users, new Date());
}

function normalizedCustomFieldValue(row: any) {
  if (row.value !== undefined) return row.value;
  if (row.valueString !== undefined && row.valueString !== null) return row.valueString;
  if (row.valueNumber !== undefined && row.valueNumber !== null) return row.valueNumber;
  if (row.valueDate !== undefined && row.valueDate !== null) return row.valueDate;
  if (row.valueBoolean !== undefined && row.valueBoolean !== null) return row.valueBoolean;
  if (row.valueJson !== undefined && row.valueJson !== null) {
    return typeof row.valueJson === "object" && "value" in row.valueJson ? row.valueJson.value : row.valueJson;
  }
  return null;
}

// ─── Case analytics (gap checklist Module 11, item 16) ────────────────────────────────────
// Flat fetch + JS-side bucketing, matching this file's own established convention (see
// calculateSlaResponseBreachReport/calculateTaskSlaPerformanceReport above) rather than a SQL
// group-by/join report.

export type CaseAnalyticsReport = {
  reportKey: "case_analytics";
  generatedAt: string;
  totals: {
    totalCases: number;
    openCases: number;
    firstResponseMet: number;
    firstResponseBreached: number;
    resolutionMet: number;
    resolutionBreached: number;
    reopenRate: number;
    escalationRate: number;
    avgCsatScore: number | null;
    csatResponseCount: number;
  };
  byChannel: Array<{ channel: string; count: number }>;
  byType: Array<{ typeId: string | null; count: number }>;
  byPriority: Array<{ priorityId: string | null; count: number }>;
  byStatus: Array<{ statusId: string | null; count: number }>;
  backlogAging: Array<{ bucket: "0-1d" | "1-3d" | "3-7d" | "7d+"; count: number }>;
  byQueue: Array<{ queueId: string | null; open: number; avgAgeDays: number | null }>;
  byOwner: Array<{ ownerId: string; ownerName: string | null; resolved: number; open: number }>;
  trendByWeek: Array<{ weekStart: string; created: number; resolved: number }>;
};

export function calculateCaseAnalyticsReport(
  cases: any[],
  inboundChannelByCaseId: Map<string, string>,
  surveyResponses: any[],
  users: Array<{ id: string; name: string | null }>,
  generatedAt: Date,
): CaseAnalyticsReport {
  const userNameById = new Map(users.map((user) => [user.id, user.name]));
  const totals = {
    totalCases: cases.length,
    openCases: 0,
    firstResponseMet: 0,
    firstResponseBreached: 0,
    resolutionMet: 0,
    resolutionBreached: 0,
    reopenRate: 0,
    escalationRate: 0,
    avgCsatScore: null as number | null,
    csatResponseCount: 0,
  };

  const byChannel = new Map<string, number>();
  const byType = new Map<string | null, number>();
  const byPriority = new Map<string | null, number>();
  const byStatus = new Map<string | null, number>();
  const backlogBuckets = { "0-1d": 0, "1-3d": 0, "3-7d": 0, "7d+": 0 };
  const queueStats = new Map<string | null, { open: number; ageDaysSum: number }>();
  const ownerStats = new Map<string, { resolved: number; open: number }>();
  const weekStats = new Map<string, { created: number; resolved: number }>();

  let reopened = 0;
  let escalated = 0;

  for (const caseRow of cases) {
    const isClosed = !!caseRow.closedAt;
    if (!isClosed) totals.openCases += 1;

    byChannel.set(inboundChannelByCaseId.get(caseRow.id) ?? "MANUAL", (byChannel.get(inboundChannelByCaseId.get(caseRow.id) ?? "MANUAL") ?? 0) + 1);
    byType.set(caseRow.typeId ?? null, (byType.get(caseRow.typeId ?? null) ?? 0) + 1);
    byPriority.set(caseRow.priorityId ?? null, (byPriority.get(caseRow.priorityId ?? null) ?? 0) + 1);
    byStatus.set(caseRow.statusId ?? null, (byStatus.get(caseRow.statusId ?? null) ?? 0) + 1);

    if (caseRow.firstResponseDueAt) {
      const met = caseRow.firstRespondedAt ? new Date(caseRow.firstRespondedAt) <= new Date(caseRow.firstResponseDueAt) : new Date(caseRow.firstResponseDueAt) > generatedAt;
      if (met) totals.firstResponseMet += 1;
      else totals.firstResponseBreached += 1;
    }
    if (caseRow.resolutionDueAt) {
      const met = caseRow.resolvedAt ? new Date(caseRow.resolvedAt) <= new Date(caseRow.resolutionDueAt) : new Date(caseRow.resolutionDueAt) > generatedAt;
      if (met) totals.resolutionMet += 1;
      else totals.resolutionBreached += 1;
    }

    if (Number(caseRow.reopenedCount) > 0) reopened += 1;
    if (caseRow.escalatedAt) escalated += 1;

    if (!isClosed) {
      const ageDays = (generatedAt.getTime() - new Date(caseRow.createdAt).getTime()) / 86_400_000;
      if (ageDays <= 1) backlogBuckets["0-1d"] += 1;
      else if (ageDays <= 3) backlogBuckets["1-3d"] += 1;
      else if (ageDays <= 7) backlogBuckets["3-7d"] += 1;
      else backlogBuckets["7d+"] += 1;

      const queueEntry = queueStats.get(caseRow.queueId ?? null) ?? { open: 0, ageDaysSum: 0 };
      queueEntry.open += 1;
      queueEntry.ageDaysSum += ageDays;
      queueStats.set(caseRow.queueId ?? null, queueEntry);
    }

    if (caseRow.ownerId) {
      const ownerEntry = ownerStats.get(caseRow.ownerId) ?? { resolved: 0, open: 0 };
      if (isClosed) ownerEntry.resolved += 1;
      else ownerEntry.open += 1;
      ownerStats.set(caseRow.ownerId, ownerEntry);
    }

    const createdWeek = weekStartIso(new Date(caseRow.createdAt));
    const createdEntry = weekStats.get(createdWeek) ?? { created: 0, resolved: 0 };
    createdEntry.created += 1;
    weekStats.set(createdWeek, createdEntry);
    if (caseRow.resolvedAt) {
      const resolvedWeek = weekStartIso(new Date(caseRow.resolvedAt));
      const resolvedEntry = weekStats.get(resolvedWeek) ?? { created: 0, resolved: 0 };
      resolvedEntry.resolved += 1;
      weekStats.set(resolvedWeek, resolvedEntry);
    }
  }

  totals.reopenRate = cases.length > 0 ? reopened / cases.length : 0;
  totals.escalationRate = cases.length > 0 ? escalated / cases.length : 0;

  const respondedSurveys = surveyResponses.filter((row) => row.respondedAt && typeof row.score === "number");
  totals.csatResponseCount = respondedSurveys.length;
  totals.avgCsatScore = respondedSurveys.length > 0 ? respondedSurveys.reduce((sum, row) => sum + Number(row.score), 0) / respondedSurveys.length : null;

  return {
    reportKey: "case_analytics",
    generatedAt: generatedAt.toISOString(),
    totals,
    byChannel: [...byChannel.entries()].map(([channel, count]) => ({ channel, count })),
    byType: [...byType.entries()].map(([typeId, count]) => ({ typeId, count })),
    byPriority: [...byPriority.entries()].map(([priorityId, count]) => ({ priorityId, count })),
    byStatus: [...byStatus.entries()].map(([statusId, count]) => ({ statusId, count })),
    backlogAging: (Object.entries(backlogBuckets) as Array<[keyof typeof backlogBuckets, number]>).map(([bucket, count]) => ({ bucket, count })),
    byQueue: [...queueStats.entries()].map(([queueId, stats]) => ({ queueId, open: stats.open, avgAgeDays: stats.open > 0 ? stats.ageDaysSum / stats.open : null })),
    byOwner: [...ownerStats.entries()].map(([ownerId, stats]) => ({ ownerId, ownerName: userNameById.get(ownerId) ?? null, resolved: stats.resolved, open: stats.open })),
    trendByWeek: [...weekStats.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([weekStart, stats]) => ({ weekStart, ...stats })),
  };
}

function weekStartIso(date: Date) {
  const clone = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = clone.getUTCDay();
  clone.setUTCDate(clone.getUTCDate() - day);
  return clone.toISOString().slice(0, 10);
}

export async function getCaseAnalyticsReportForTenant(user: TenantUser): Promise<CaseAnalyticsReport> {
  if (!user.tenantId) {
    return calculateCaseAnalyticsReport([], new Map(), [], [], new Date());
  }

  const [cases, inboundMessages, surveyResponses, users] = await Promise.all([
    pgQuery<any>(
      `select id, "typeId", "priorityId", "statusId", "queueId", "ownerId", "firstResponseDueAt", "firstRespondedAt",
              "resolutionDueAt", "resolvedAt", "closedAt", "reopenedCount", "escalatedAt", "createdAt"
       from "Case" where "tenantId" = $1 order by "createdAt" desc limit 5000`,
      [user.tenantId],
    ),
    pgQuery<{ caseId: string; channel: string }>(
      `select distinct on ("caseId") "caseId", channel from "CaseInboundMessage" where "tenantId" = $1 and "caseId" is not null order by "caseId", "createdAt" asc`,
      [user.tenantId],
    ),
    pgQuery<any>(`select score, "respondedAt" from "CaseSurveyResponse" where "tenantId" = $1`, [user.tenantId]),
    pgQuery<{ id: string; name: string | null }>(`select id, name from "User" where "tenantId" = $1`, [user.tenantId]),
  ]);

  const inboundChannelByCaseId = new Map(inboundMessages.map((row) => [row.caseId, row.channel]));
  return calculateCaseAnalyticsReport(cases, inboundChannelByCaseId, surveyResponses, users, new Date());
}

// Worker job (checklist item 20's "case analytics rollups") -- refreshes the single-row-per-
// tenant CaseAnalyticsSnapshot cache every run; getCaseAnalyticsReportForTenant itself always
// computes live (matching this file's existing on-demand convention), the snapshot exists
// purely as a cheap, pre-computed fallback for a dashboard that wants to avoid a live
// recomputation on every page load.
export async function refreshCaseAnalyticsSnapshots(limit = 50) {
  const tenants = await pgQuery<{ id: string }>(
    `select distinct t.id from "Tenant" t join "Case" c on c."tenantId" = t.id limit $1`,
    [limit],
  );
  let refreshed = 0;
  for (const tenant of tenants) {
    const report = await getCaseAnalyticsReportForTenant({ id: "system", tenantId: tenant.id } as TenantUser);
    await pgExecute(
      `insert into "CaseAnalyticsSnapshot" ("tenantId", "generatedAt", payload) values ($1,$2,$3)
       on conflict ("tenantId") do update set "generatedAt" = excluded."generatedAt", payload = excluded.payload`,
      [tenant.id, report.generatedAt, report],
    );
    refreshed += 1;
  }
  return { refreshed };
}

export async function getCaseAnalyticsSnapshotForTenant(user: TenantUser) {
  if (!user.tenantId) return null;
  return pgQueryOne<{ tenantId: string; generatedAt: string; payload: CaseAnalyticsReport }>(
    `select "tenantId", "generatedAt", payload from "CaseAnalyticsSnapshot" where "tenantId" = $1`,
    [user.tenantId],
  );
}
