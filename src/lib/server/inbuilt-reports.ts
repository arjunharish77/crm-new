import {
  listActivitiesForTenant,
  listLeadsForTenant,
  listOpportunitiesForTenant,
  listOpportunityTypesForTenant,
} from "@/lib/server/crm";
import { query as pgQuery, queryOne as pgQueryOne } from "@/lib/db/query";

type TenantUser = {
  id: string;
  tenantId: string | null;
  name?: string | null;
  email?: string | null;
  role?: { permissions?: any } | string | null;
};

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

export type CohortReportRow = {
  cohortStart: string;
  cohortEnd: string;
  leads: number;
  opportunities: number;
  stages: CohortStageProgress[];
};

export type CohortReport = {
  reportKey: "cohort_funnel_progression";
  generatedAt: string;
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

export async function getRepPerformanceReportForTenant(user: TenantUser): Promise<RepPerformanceReport> {
  const [leads, opportunities, activities, users] = await Promise.all([
    listLeadsForTenant(user, 1, 1000),
    listOpportunitiesForTenant(user, 1000),
    listActivitiesForTenant(user, 1000, null),
    listTenantUsers(user),
  ]);

  return calculateRepPerformanceReport(leads.data, opportunities.data, activities.data, users, new Date());
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

export async function getLeadSourceRoiReportForTenant(user: TenantUser): Promise<LeadSourceRoiReport> {
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
  grain: "week" | "month" = "month"
): Promise<CohortReport> {
  const [leads, opportunities, opportunityTypes] = await Promise.all([
    listLeadsForTenant(user, 1, 1000),
    listOpportunitiesForTenant(user, 1000),
    listOpportunityTypesForTenant(user),
  ]);
  const stageHistory = await listOpportunityStageHistoryForTenant(user, opportunities.data.map((opportunity: any) => opportunity.id));
  return calculateCohortReport(leads.data, opportunities.data, stageHistory, opportunityTypes, grain, new Date());
}

export async function getDataQualityReportForTenant(
  user: TenantUser,
  staleDays = 30
): Promise<DataQualityReport> {
  const [leads, activities, requiredFields, customFieldValues] = await Promise.all([
    listLeadsForTenant(user, 1, 1000),
    listActivitiesForTenant(user, 1000, null),
    listRequiredLeadFieldsForTenant(user),
    listLeadCustomFieldValuesForTenant(user),
  ]);

  return calculateDataQualityReport(leads.data, activities.data, requiredFields, customFieldValues, staleDays, new Date());
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
  generatedAt: Date
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
    start: Date;
    end: Date;
    leads: number;
    opportunities: number;
    stageLeadIds: Map<string, Set<string>>;
    daysToStage: Map<string, number[]>;
  }>();

  for (const lead of leads) {
    if (!lead.createdAt) continue;
    const createdAt = new Date(lead.createdAt);
    if (Number.isNaN(createdAt.getTime())) continue;
    const period = getPeriodRange(createdAt, normalizedGrain);
    const key = period.start.toISOString();
    const cohort = cohorts.get(key) ?? {
      start: period.start,
      end: period.end,
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

  const rows = [...cohorts.values()]
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((cohort) => ({
      cohortStart: cohort.start.toISOString(),
      cohortEnd: cohort.end.toISOString(),
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
  generatedAt: Date
): DataQualityReport {
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

  const issues: DataQualityIssue[] = [
    issue("duplicate_email", "Duplicate email groups", duplicateEmailGroups.length, duplicateEmailGroups.flat().map((lead) => lead.id)),
    issue("duplicate_phone", "Duplicate phone groups", duplicatePhoneGroups.length, duplicatePhoneGroups.flat().map((lead) => lead.id)),
    issue("stale_leads", `Stale leads (${normalizedStaleDays}+ days)`, staleLeadIds.length, staleLeadIds),
    issue("missing_required_fields", "Leads missing required fields", missingRequiredLeadIds.size, [...missingRequiredLeadIds]),
    issue("missing_owner", "Leads missing owner", missingOwnerLeadIds.length, missingOwnerLeadIds),
    issue("missing_email", "Leads missing email", missingEmailLeadIds.length, missingEmailLeadIds),
    issue("missing_phone", "Leads missing phone", missingPhoneLeadIds.length, missingPhoneLeadIds),
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
