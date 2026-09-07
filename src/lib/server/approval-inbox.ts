import { query } from "@/lib/db/query";
import { isModuleEnabledForTenant } from "@/lib/server/module-entitlements";
import { approvePayout } from "@/lib/server/payouts";
import { updateMarketingCampaignStatusForTenant } from "@/lib/server/marketing-communications";
import { setTemplateApprovalStatusForTenant } from "@/lib/server/communications";
import { approveExportRequest, rejectExportRequest } from "@/lib/server/exports";
import { promoteScoringModelVersion } from "@/lib/server/self-learning-scoring";
import { approvePartnerChangeRequest, rejectPartnerChangeRequest } from "@/lib/server/partner-change-requests";

type TenantUser = {
  id: string;
  tenantId: string | null;
  name?: string | null;
  email?: string | null;
  isPlatformAdmin?: boolean;
  isTenantAdmin?: boolean;
};

export type ApprovalEntityType = "PAYOUT" | "CAMPAIGN" | "TEMPLATE" | "EXPORT_REQUEST" | "SCORING_MODEL_VERSION" | "PARTNER_CHANGE_REQUEST";

export type ApprovalInboxItem = {
  entityType: ApprovalEntityType;
  entityId: string;
  title: string;
  summary: string;
  requestedByName: string | null;
  requestedAt: string;
  canReject: boolean;
};

// Gap checklist Module 10's "approval inbox" item -- a real, unified cross-module inbox, not the
// per-record button-on-one-admin-page the checklist's own prior note found for payouts alone.
// Deliberately a thin AGGREGATOR/DISPATCHER over each domain's own already-real (or, for
// partner changes, newly built) approve/reject logic -- not a second, parallel approval engine.
// Audited every named domain before building anything: payouts, report exports, communication
// templates, and scoring model promotions ALL already had real, working, audit-logged
// approve/reject actions (just no shared inbox surfacing them together); campaigns had a status
// enum but no real transition gate (fixed alongside this, see marketing-communications.ts);
// partner changes had no approval concept at all (built from scratch, see
// partner-change-requests.ts). Automation publish approval is a genuinely separate, larger build
// (a new publish-state machine across the whole automation execution path) and is NOT attempted
// in this pass -- stated honestly, not faked.
async function listPendingPayouts(user: TenantUser): Promise<ApprovalInboxItem[]> {
  if (!(await isModuleEnabledForTenant(user.tenantId, "PAYOUTS"))) return [];
  const rows = await query<any>(
    `select po.id, po."totalCommissionAmount", po."createdAt", u.name as "partnerName", u.email as "partnerEmail"
     from "Payout" po
     left join "User" u on u.id = po."partnerId"
     where po."tenantId" = $1 and po.status = 'DRAFT' and po."isHeld" = false
     order by po."createdAt" asc`,
    [user.tenantId],
  );
  return rows.map((row: any) => ({
    entityType: "PAYOUT" as const,
    entityId: row.id,
    title: `Payout for ${row.partnerName || row.partnerEmail || "a partner"}`,
    summary: `₹${Number(row.totalCommissionAmount ?? 0).toLocaleString()} commission awaiting approval`,
    requestedByName: row.partnerName || row.partnerEmail || null,
    requestedAt: row.createdAt,
    canReject: false,
  }));
}

async function listPendingCampaigns(user: TenantUser): Promise<ApprovalInboxItem[]> {
  if (!(await isModuleEnabledForTenant(user.tenantId, "MARKETING"))) return [];
  const rows = await query<any>(
    `select c.id, c.name, c.channel, c."createdAt", u.name as "createdByName", u.email as "createdByEmail"
     from "MarketingCampaign" c
     left join "User" u on u.id = c."createdBy"
     where c."tenantId" = $1 and c.status = 'PENDING_APPROVAL'
     order by c."createdAt" asc`,
    [user.tenantId],
  );
  return rows.map((row: any) => ({
    entityType: "CAMPAIGN" as const,
    entityId: row.id,
    title: `Campaign "${row.name}"`,
    summary: `${row.channel} campaign requesting approval to launch`,
    requestedByName: row.createdByName || row.createdByEmail || null,
    requestedAt: row.createdAt,
    canReject: true,
  }));
}

async function listPendingTemplates(user: TenantUser): Promise<ApprovalInboxItem[]> {
  const rows = await query<any>(
    `select t.id, t.name, t.channel, t."createdAt", u.name as "createdByName", u.email as "createdByEmail"
     from "CommunicationTemplate" t
     left join "User" u on u.id = t."createdBy"
     where t."tenantId" = $1 and t."approvalStatus" = 'PENDING_APPROVAL'
     order by t."createdAt" asc`,
    [user.tenantId],
  );
  return rows.map((row: any) => ({
    entityType: "TEMPLATE" as const,
    entityId: row.id,
    title: `Template "${row.name}"`,
    summary: `${row.channel} message template awaiting approval`,
    requestedByName: row.createdByName || row.createdByEmail || null,
    requestedAt: row.createdAt,
    canReject: true,
  }));
}

async function listPendingExportRequests(user: TenantUser): Promise<ApprovalInboxItem[]> {
  const rows = await query<any>(
    `select e.id, e."moduleName", e."exportType", e."queuedAt", u.name as "requestedByName", u.email as "requestedByEmail"
     from "ExportRequest" e
     left join "User" u on u.id = e."userId"
     where e."tenantId" = $1 and e.status = 'PENDING_APPROVAL'
     order by e."queuedAt" asc`,
    [user.tenantId],
  );
  return rows.map((row: any) => ({
    entityType: "EXPORT_REQUEST" as const,
    entityId: row.id,
    title: `${row.moduleName} export (${row.exportType})`,
    summary: "Contains sensitive columns -- requires approval before it can run",
    requestedByName: row.requestedByName || row.requestedByEmail || null,
    requestedAt: row.queuedAt,
    canReject: true,
  }));
}

async function listPendingScoringModelVersions(user: TenantUser): Promise<ApprovalInboxItem[]> {
  if (!(await isModuleEnabledForTenant(user.tenantId, "PREDICTIVE_SCORING"))) return [];
  const rows = await query<any>(
    `select v.id, v."versionNumber", v."createdAt", m.name as "modelName", m."targetModule"
     from "ScoringModelVersion" v
     join "ScoringModel" m on m.id = v."modelId"
     where v."tenantId" = $1 and v.status = 'DRAFT'
     order by v."createdAt" asc`,
    [user.tenantId],
  );
  return rows.map((row: any) => ({
    entityType: "SCORING_MODEL_VERSION" as const,
    entityId: row.id,
    title: `${row.modelName} v${row.versionNumber}`,
    summary: `Newly trained ${row.targetModule.toLowerCase()} scoring model, not yet promoted live`,
    requestedByName: null,
    requestedAt: row.createdAt,
    canReject: false,
  }));
}

async function listPendingPartnerChanges(user: TenantUser): Promise<ApprovalInboxItem[]> {
  if (!(await isModuleEnabledForTenant(user.tenantId, "PARTNERS"))) return [];
  const rows = await query<any>(
    `select cr.id, cr."proposedChanges", cr."createdAt", p."legalBusinessName", u.name as "requestedByName", u.email as "requestedByEmail"
     from "PartnerChangeRequest" cr
     join "PartnerProfile" p on p.id = cr."partnerProfileId"
     join "User" u on u.id = cr."requestedBy"
     where cr."tenantId" = $1 and cr.status = 'PENDING'
     order by cr."createdAt" asc`,
    [user.tenantId],
  );
  return rows.map((row: any) => ({
    entityType: "PARTNER_CHANGE_REQUEST" as const,
    entityId: row.id,
    title: `Profile change for ${row.legalBusinessName}`,
    summary: `Requests: ${Object.keys(row.proposedChanges ?? {}).join(", ")}`,
    requestedByName: row.requestedByName || row.requestedByEmail || null,
    requestedAt: row.createdAt,
    canReject: true,
  }));
}

export async function listPendingApprovalsForTenant(user: TenantUser): Promise<ApprovalInboxItem[]> {
  if (!user.tenantId) return [];
  const results = await Promise.all([
    listPendingPayouts(user).catch(() => []),
    listPendingCampaigns(user).catch(() => []),
    listPendingTemplates(user).catch(() => []),
    listPendingExportRequests(user).catch(() => []),
    listPendingScoringModelVersions(user).catch(() => []),
    listPendingPartnerChanges(user).catch(() => []),
  ]);
  return results.flat().sort((a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime());
}

// The dispatcher -- routes an inbox decision to whichever domain's own real approve/reject
// action actually applies. Every one of these already requires a tenant admin at its own route
// today (payouts/templates/exports) or is gated here directly (campaigns/scoring/partner
// changes); the caller (the /api/approvals/decide route) already authenticates via
// requireTenantAdmin before this runs, so this check is defense-in-depth against a future caller
// forgetting to, not a second real auth pass.
export async function decideApprovalItem(
  user: TenantUser,
  entityType: ApprovalEntityType,
  entityId: string,
  decision: "APPROVE" | "REJECT",
  comment?: string | null,
) {
  if (!user.isTenantAdmin && !user.isPlatformAdmin) throw new Error("FORBIDDEN");

  if (entityType === "PAYOUT") {
    if (decision === "REJECT") throw new Error("PAYOUT_REJECTION_NOT_SUPPORTED");
    return approvePayout(user, entityId);
  }
  if (entityType === "CAMPAIGN") {
    return updateMarketingCampaignStatusForTenant(user, entityId, decision === "APPROVE" ? "APPROVED" : "CANCELLED");
  }
  if (entityType === "TEMPLATE") {
    return setTemplateApprovalStatusForTenant(user, entityId, decision === "APPROVE" ? "APPROVED" : "REJECTED");
  }
  if (entityType === "EXPORT_REQUEST") {
    return decision === "APPROVE" ? approveExportRequest(user, entityId) : rejectExportRequest(user, entityId);
  }
  if (entityType === "SCORING_MODEL_VERSION") {
    if (decision === "REJECT") throw new Error("SCORING_MODEL_VERSION_REJECTION_NOT_SUPPORTED");
    return promoteScoringModelVersion(user, entityId, { reviewNotes: comment ?? null });
  }
  if (entityType === "PARTNER_CHANGE_REQUEST") {
    return decision === "APPROVE"
      ? approvePartnerChangeRequest(user, entityId, comment ?? null)
      : rejectPartnerChangeRequest(user, entityId, comment ?? null);
  }
  throw new Error("UNKNOWN_APPROVAL_ENTITY_TYPE");
}
