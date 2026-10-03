import { queryOne } from "@/lib/db/query";

// Pre-disable impact scan for the platform-admin module switch: counts of the tenant's live
// items a module disable/suspend would stop. Read-only. Disabling never deletes these records;
// the counts tell the admin what stops working until the module is re-enabled.
// Every query takes the tenant id as $1 and returns a single "count" column.
const IMPACT_QUERIES: Record<string, { label: string; sql: string }[]> = {
  OPPORTUNITIES: [{ label: "Opportunities (kept, but inaccessible)", sql: `select count(*)::int as count from "Opportunity" where "tenantId" = $1 and "deletedAt" is null` }],
  FORMS: [{ label: "Active forms (public submissions will be refused)", sql: `select count(*)::int as count from "Form" where "tenantId" = $1 and "isActive" and "deletedAt" is null` }],
  AUTOMATIONS: [{ label: "Active automations", sql: `select count(*)::int as count from "AutomationV2" where "tenantId" = $1 and "isActive" and "deletedAt" is null` }],
  REPORTS: [{ label: "Active report schedules", sql: `select count(*)::int as count from "ReportSchedule" where "tenantId" = $1 and "isActive"` }],
  MARKETING: [{ label: "Campaigns awaiting approval, approved, scheduled or running", sql: `select count(*)::int as count from "MarketingCampaign" where "tenantId" = $1 and status in ('PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'RUNNING')` }],
  JOURNEY_ORCHESTRATION: [{ label: "Scheduled or active journeys", sql: `select count(*)::int as count from "MarketingJourney" where "tenantId" = $1 and status in ('SCHEDULED', 'ACTIVE')` }],
  DISTRIBUTION: [{ label: "Active assignment rules", sql: `select count(*)::int as count from "AssignmentRule" where "tenantId" = $1 and "isActive" and "deletedAt" is null` }],
  NEXT_BEST_ACTION: [{ label: "Active next-best-action rules", sql: `select count(*)::int as count from "NextBestActionRule" where "tenantId" = $1 and "isActive" and "deletedAt" is null` }],
  PREDICTIVE_SCORING: [{ label: "Scoring models", sql: `select count(*)::int as count from "ScoringModel" where "tenantId" = $1` }],
  PARTNERS: [{ label: "Partner organizations", sql: `select count(*)::int as count from "PartnerOrganization" where "tenantId" = $1` }],
  PAYOUTS: [{ label: "Payouts not yet paid", sql: `select count(*)::int as count from "Payout" where "tenantId" = $1 and status not in ('PAID', 'CANCELLED')` }],
  GAMIFICATION: [{ label: "Active gamification rules", sql: `select count(*)::int as count from "GamificationRule" where "tenantId" = $1 and "isActive" and "deletedAt" is null` }],
  PRODUCT_CATALOG: [{ label: "Applications (kept, but inaccessible)", sql: `select count(*)::int as count from "Application" where "tenantId" = $1` }],
  SERVICE_DESK: [{ label: "Open cases", sql: `select count(*)::int as count from "Case" where "tenantId" = $1 and "closedAt" is null` }],
  TELEPHONY: [
    { label: "Active call campaigns", sql: `select count(*)::int as count from "CallCampaign" where "tenantId" = $1 and status = 'ACTIVE'` },
    { label: "Active call scripts", sql: `select count(*)::int as count from "CallScript" where "tenantId" = $1 and "isActive"` },
  ],
  DATA_PLATFORM: [
    { label: "Active outbound webhook subscriptions", sql: `select count(*)::int as count from "WebhookSubscription" where "tenantId" = $1 and "isActive"` },
    { label: "Webhook deliveries still pending (will be cancelled)", sql: `select count(*)::int as count from "WebhookOutbox" where "tenantId" = $1 and status in ('PENDING', 'SENDING')` },
    { label: "Active external integrations", sql: `select count(*)::int as count from "ExternalIntegration" where "tenantId" = $1 and "isActive"` },
    { label: "Active dedupe rules", sql: `select count(*)::int as count from "DedupeMatchRule" where "tenantId" = $1 and "isActive"` },
  ],
  MARKETPLACE: [{ label: "Installed apps", sql: `select count(*)::int as count from "TenantAppInstall" where "tenantId" = $1 and status = 'INSTALLED'` }],
};

export type ModuleImpactItem = { label: string; count: number | null };

export async function getModuleDisableImpact(tenantId: string, moduleKey: string): Promise<ModuleImpactItem[]> {
  const queries = IMPACT_QUERIES[moduleKey] ?? [];
  return Promise.all(
    queries.map(async ({ label, sql }) => {
      try {
        const row = await queryOne<{ count: number }>(sql, [tenantId]);
        return { label, count: row?.count ?? 0 };
      } catch (error) {
        // A missing table/column (e.g. a database not yet migrated) must not block the
        // disable flow; report the item as unknown rather than as a fabricated zero.
        console.error(`[module-impact] ${moduleKey} "${label}" failed`, error);
        return { label, count: null };
      }
    }),
  );
}
