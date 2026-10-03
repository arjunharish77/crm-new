import { query, queryAsSystem, queryOne } from "@/lib/db/query";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { requiredModules } from "@/lib/module-dependencies";
import { getEffectiveModuleStates } from "@/lib/server/module-entitlements";
import { getTenantTimeZone, zonedWallClockParts } from "@/lib/server/date-format";

// Module health badges (Module 21; decisions confirmed 2026-09-29). Each module gets a derived
// state beyond its entitlement status. Platform admins see every tenant; tenant admins see their
// own with a plain next step. A failing connector or backed-up work notifies tenant and platform
// admins once per module per day; setup-incomplete and stale data only show the badge.
//
// Every check is tenant-scoped ($1 = tenant id) and mirrors the due/claim condition of the worker
// job that clears it, so "backed up" means the worker really should have picked the work up.

export type ModuleHealthState =
  | "HEALTHY" | "SETUP_INCOMPLETE" | "CONNECTOR_FAILING" | "WORKER_BACKLOG" | "STALE_DATA"
  | "DISABLED_BY_DEPENDENCY" | "SUSPENDED" | "TRIAL_EXPIRED" | "DISABLED" | "NOT_AVAILABLE";

export type ModuleHealthIssueKind = "SETUP_INCOMPLETE" | "CONNECTOR_FAILING" | "WORKER_BACKLOG" | "STALE_DATA" | "DISABLED_BY_DEPENDENCY" | "OFF";

export type ModuleHealthIssue = {
  kind: ModuleHealthIssueKind;
  message: string;
  count?: number;
  /** Where a tenant admin fixes it (tenant-facing pages only). */
  action?: { label: string; href: string };
  /** Operator detail (worker job name); stripped from the tenant view. */
  detail?: string;
};

export type ModuleHealth = {
  moduleKey: string;
  state: ModuleHealthState;
  issues: ModuleHealthIssue[];
  /** False when no health checks apply (core modules): nothing to show beyond the status. */
  checked: boolean;
  /** Checks that could not run (e.g. a table missing on an unmigrated database); never counted as healthy. */
  checksFailed: number;
  checkedAt: string;
};

/** Due work must be this far past its due time before it counts as backed up (workers tick every minute). */
export const BACKLOG_GRACE_MINUTES = 15;
const GRACE = `interval '${BACKLOG_GRACE_MINUTES} minutes'`;
/** Delivery failures: at least this many, and at least this share, in the last 24 hours. */
export const FAILURE_MIN_COUNT = 3;
export const FAILURE_MIN_RATE = 0.2;
const FAILURE_WINDOW = `interval '24 hours'`;

// Catalog entries with no workspace behind them yet.
const NOT_BUILT = new Set(["QUALITY_MANAGEMENT", "COUNSELING", "DEVOPS_OPS"]);

type Action = { label: string; href: string };
type Check =
  | { kind: "SETUP_INCOMPLETE"; sql: string; message: string; action: Action }
  | { kind: "WORKER_BACKLOG"; sql: string; noun: [string, string]; job: string }
  | { kind: "FAILURE_RATE"; sql: string; noun: string; action?: Action }
  | { kind: "FAILING_COUNT"; sql: string; message: (count: number) => string; action?: Action }
  | { kind: "STALE_DATA"; sql: string; message: (count: number) => string; action?: Action };

const exists = (sql: string) => `select exists (${sql}) as ok`;

// Communication outbox rows are shared by several modules; attribute them by sourceType.
const outboxBacklog = (source: string): string =>
  `select count(*)::int as count from "CommunicationOutbox"
   where "tenantId" = $1 and ${source}
     and ((status = 'QUEUED' and "nextAttemptAt" <= now() - ${GRACE})
       or (status = 'SENDING' and "leaseExpiresAt" is not null and "leaseExpiresAt" <= now() - ${GRACE}))`;
const outboxFailures = (source: string): string =>
  `select count(*) filter (where status = 'FAILED')::int as failed, count(*) filter (where status = 'SENT')::int as succeeded
   from "CommunicationOutbox"
   where "tenantId" = $1 and ${source} and status in ('FAILED', 'SENT') and "updatedAt" > now() - ${FAILURE_WINDOW}`;

const PROVIDERS: Action = { label: "Check messaging providers", href: "/dashboard/settings/integrations" };

export const MODULE_HEALTH_CHECKS: Record<string, Check[]> = {
  OPPORTUNITIES: [
    { kind: "SETUP_INCOMPLETE", message: "No active opportunity type with stages yet.", action: { label: "Set up opportunity types", href: "/dashboard/settings/data/opportunity-types" },
      sql: exists(`select 1 from "OpportunityType" t where t."tenantId" = $1 and t."isActive" and exists (select 1 from "StageDefinition" s where s."tenantId" = $1 and s."opportunityTypeId" = t.id)`) },
  ],
  FORMS: [
    { kind: "SETUP_INCOMPLETE", message: "No active form yet.", action: { label: "Create a form", href: "/dashboard/forms" },
      sql: exists(`select 1 from "Form" where "tenantId" = $1 and "isActive" and "deletedAt" is null`) },
  ],
  AUTOMATIONS: [
    { kind: "SETUP_INCOMPLETE", message: "No active automation yet.", action: { label: "Create an automation", href: "/dashboard/automations-v2" },
      sql: exists(`select 1 from "AutomationV2" where "tenantId" = $1 and "isActive" and "deletedAt" is null`) },
    { kind: "WORKER_BACKLOG", noun: ["scheduled automation step", "scheduled automation steps"], job: "automation.processDue",
      sql: `select count(*)::int as count from "AutomationQueue" where "tenantId" = $1 and status = 'PENDING' and "runAt" <= now() - ${GRACE}` },
    { kind: "WORKER_BACKLOG", noun: ["automation message", "automation messages"], job: "communications.processDue", sql: outboxBacklog(`"sourceType" = 'AUTOMATION'`) },
    { kind: "FAILURE_RATE", noun: "automation messages", action: PROVIDERS, sql: outboxFailures(`"sourceType" = 'AUTOMATION'`) },
  ],
  REPORTS: [
    { kind: "WORKER_BACKLOG", noun: ["scheduled report", "scheduled reports"], job: "reports.processSchedules",
      sql: `select count(*)::int as count from "ReportSchedule" where "tenantId" = $1 and "isActive" and "nextRunAt" <= now() - ${GRACE}` },
    { kind: "WORKER_BACKLOG", noun: ["report retry", "report retries"], job: "reports.retryFailedSchedules",
      sql: `select count(*)::int as count from "ReportSchedule" where "tenantId" = $1 and "isActive" and "retryCount" > 0 and "nextRetryAt" <= now() - ${GRACE}` },
    { kind: "FAILURE_RATE", noun: "report emails",
      sql: `select count(*) filter (where status = 'FAILED')::int as failed, count(*) filter (where status = 'SENT')::int as succeeded
            from "ReportEmailDelivery" where "tenantId" = $1 and status in ('FAILED', 'SENT') and "createdAt" > now() - ${FAILURE_WINDOW}` },
    // Mirrors reports.processRollupSchedule: a state is due after its interval; stale once it has
    // missed three intervals (or last refresh ended in an error).
    { kind: "STALE_DATA", message: (n) => `${n} report ${n === 1 ? "dataset has" : "datasets have"} not refreshed on schedule.`,
      sql: `select count(*)::int as count from "ReportRefreshState" where "tenantId" = $1
            and (status = 'ERROR' or (status <> 'REFRESHING' and "lastSuccessfulAt" <= now() - (greatest("refreshIntervalMinutes", 1) * 3 || ' minutes')::interval))` },
  ],
  MARKETING: [
    { kind: "SETUP_INCOMPLETE", message: "No active email, SMS or WhatsApp provider, so campaigns cannot send.", action: { label: "Connect a provider", href: "/dashboard/settings/integrations" },
      sql: exists(`select 1 from "CommunicationProviderConfig" where "tenantId" = $1 and "isActive"`) },
    { kind: "WORKER_BACKLOG", noun: ["campaign message", "campaign messages"], job: "communications.processDue", sql: outboxBacklog(`"sourceType" like 'MARKETING\\_CAMPAIGN%'`) },
    { kind: "FAILURE_RATE", noun: "campaign messages", action: PROVIDERS, sql: outboxFailures(`"sourceType" like 'MARKETING\\_CAMPAIGN%'`) },
  ],
  JOURNEY_ORCHESTRATION: [
    { kind: "SETUP_INCOMPLETE", message: "No active journey yet.", action: { label: "Create a journey", href: "/dashboard/marketing" },
      sql: exists(`select 1 from "MarketingJourney" where "tenantId" = $1 and status = 'ACTIVE'`) },
  ],
  PREDICTIVE_SCORING: [
    { kind: "SETUP_INCOMPLETE", message: "Predictive scoring is off or has no promoted model.", action: { label: "Set up scoring", href: "/dashboard/settings/automation/lead-scoring" },
      sql: exists(`select 1 from "ScoringSettings" where "tenantId" = $1 and "isEnabled" and ("promotedLeadModelVersionId" is not null or "promotedOpportunityModelVersionId" is not null)`) },
    // Mirrors scoring.processScheduledRetraining's due condition (a lock older than 2h is retaken).
    { kind: "WORKER_BACKLOG", noun: ["scheduled model retraining", "scheduled model retrainings"], job: "scoring.processScheduledRetraining",
      sql: `select count(*)::int as count from "ScoringSettings" where "tenantId" = $1 and "isEnabled" and "retrainCadence" <> 'MANUAL'
            and "nextRetrainAt" <= now() - ${GRACE} and ("retrainLockAt" is null or "retrainLockAt" < now() - interval '2 hours')` },
    { kind: "FAILING_COUNT", message: () => "The most recent model training failed.", action: { label: "Review scoring", href: "/dashboard/settings/automation/lead-scoring" },
      sql: `select (status = 'FAILED')::int as count from "ScoringTrainingRun" where "tenantId" = $1 and "createdAt" > now() - interval '7 days' order by "createdAt" desc limit 1` },
    // Twice the retraining cadence (weekly 7d, monthly 30d) without a recompute.
    { kind: "STALE_DATA", message: () => "Scores have not been recomputed on schedule.",
      sql: `select count(*)::int as count from "ScoringSettings" where "tenantId" = $1 and "isEnabled" and "retrainCadence" in ('WEEKLY', 'MONTHLY')
            and "lastRecomputedAt" is not null and "lastRecomputedAt" < now() - (case "retrainCadence" when 'WEEKLY' then interval '14 days' else interval '60 days' end)` },
  ],
  NEXT_BEST_ACTION: [
    { kind: "SETUP_INCOMPLETE", message: "No active strategy with an active rule yet.", action: { label: "Set up next-best actions", href: "/dashboard/settings/automation/recommended-actions" },
      sql: exists(`select 1 from "NextBestActionStrategy" s where s."tenantId" = $1 and s."isActive" and exists (select 1 from "NextBestActionRule" r where r."tenantId" = $1 and r."strategyId" = s.id and r."isActive" and r."deletedAt" is null)`) },
  ],
  AI_COPILOT: [
    // Same condition the AI assistant refuses to run without.
    { kind: "SETUP_INCOMPLETE", message: "No AI provider is enabled.", action: { label: "Set up the AI assistant", href: "/dashboard/settings/messaging/ai-assistant" },
      sql: exists(`select 1 from "AiProviderSettings" where "tenantId" = $1 and enabled and "providerMode" <> 'DISABLED' and "endpointUrl" is not null`) },
    { kind: "FAILURE_RATE", noun: "AI requests", action: { label: "Check the AI provider", href: "/dashboard/settings/messaging/ai-assistant" },
      sql: `select count(*) filter (where status = 'FAILED')::int as failed, count(*) filter (where status = 'SUCCESS')::int as succeeded
            from "AiUsageLog" where "tenantId" = $1 and status in ('FAILED', 'SUCCESS') and "createdAt" > now() - ${FAILURE_WINDOW}` },
  ],
  DISTRIBUTION: [
    { kind: "SETUP_INCOMPLETE", message: "No active assignment rule yet.", action: { label: "Create an assignment rule", href: "/dashboard/settings/automation/assignment-rules" },
      sql: exists(`select 1 from "AssignmentRule" where "tenantId" = $1 and "isActive" and "deletedAt" is null`) },
  ],
  PARTNERS: [
    { kind: "SETUP_INCOMPLETE", message: "No active partner organization yet.", action: { label: "Add a partner", href: "/dashboard/settings/access/partners" },
      sql: exists(`select 1 from "PartnerOrganization" where "tenantId" = $1 and status = 'ACTIVE'`) },
  ],
  PAYOUTS: [
    { kind: "SETUP_INCOMPLETE", message: "No active commission rule yet.", action: { label: "Create a commission rule", href: "/dashboard/settings/rewards/commission-rules" },
      sql: exists(`select 1 from "CommissionRule" where "tenantId" = $1 and "isActive" and "deletedAt" is null`) },
  ],
  GAMIFICATION: [
    { kind: "SETUP_INCOMPLETE", message: "No active points rule yet.", action: { label: "Create a points rule", href: "/dashboard/settings/rewards/gamification" },
      sql: exists(`select 1 from "GamificationRule" where "tenantId" = $1 and "isActive" and "deletedAt" is null`) },
  ],
  TELEPHONY: [
    { kind: "SETUP_INCOMPLETE", message: "No active telephony provider.", action: { label: "Connect telephony", href: "/dashboard/settings/integrations" },
      sql: exists(`select 1 from "IntegrationSetting" where "tenantId" = $1 and type = 'TELEPHONY' and "isActive" and coalesce(config ->> 'provider', '') <> ''`) },
    { kind: "WORKER_BACKLOG", noun: ["expired call recording still stored", "expired call recordings still stored"], job: "telephony.expireRecordings",
      sql: `select count(*)::int as count from "TelephonyCallLog" where "tenantId" = $1 and "recordingUrl" is not null and "recordingExpiresAt" <= now() - ${GRACE}` },
  ],
  SERVICE_DESK: [
    { kind: "SETUP_INCOMPLETE", message: "No case queue with members yet.", action: { label: "Set up the service desk", href: "/dashboard/settings/service/desk" },
      sql: exists(`select 1 from "CaseQueue" q where q."tenantId" = $1 and exists (select 1 from "CaseQueueMembership" m where m."tenantId" = $1 and m."queueId" = q.id)`) },
    // Mirrors cases.processSlaEscalations' breach query.
    { kind: "WORKER_BACKLOG", noun: ["SLA breach not yet escalated", "SLA breaches not yet escalated"], job: "cases.processSlaEscalations",
      sql: `select count(*)::int as count from "Case" c join "CaseStatus" s on s."tenantId" = c."tenantId" and s.id = c."statusId"
            where c."tenantId" = $1 and s."isClosedStatus" = false and c."slaPausedAt" is null and c."slaBreachedFiredAt" is null
              and ((c."firstResponseDueAt" is not null and c."firstRespondedAt" is null and c."firstResponseDueAt" <= now() - ${GRACE})
                or (c."resolutionDueAt" is not null and c."resolvedAt" is null and c."resolutionDueAt" <= now() - ${GRACE}))` },
    { kind: "WORKER_BACKLOG", noun: ["case message", "case messages"], job: "communications.processDue", sql: outboxBacklog(`"sourceType" like 'CASE\\_%'`) },
    { kind: "FAILURE_RATE", noun: "case messages", action: PROVIDERS, sql: outboxFailures(`"sourceType" like 'CASE\\_%'`) },
    { kind: "STALE_DATA", message: () => "Service desk analytics have not refreshed in the last hour.",
      sql: `select (exists (select 1 from "Case" where "tenantId" = $1)
              and not exists (select 1 from "CaseAnalyticsSnapshot" where "tenantId" = $1 and "generatedAt" > now() - interval '1 hour'))::int as count` },
  ],
  DATA_PLATFORM: [
    // Mirrors webhooks.processOutbox's claim condition.
    { kind: "WORKER_BACKLOG", noun: ["webhook delivery", "webhook deliveries"], job: "webhooks.processOutbox",
      sql: `select count(*)::int as count from "WebhookOutbox" where "tenantId" = $1
            and ((status = 'PENDING' and coalesce("nextRetryAt", "createdAt") <= now() - ${GRACE})
              or (status = 'SENDING' and "leaseExpiresAt" is not null and "leaseExpiresAt" <= now() - ${GRACE}))` },
    { kind: "FAILURE_RATE", noun: "webhook deliveries", action: { label: "Check webhooks", href: "/dashboard/settings/integrations" },
      sql: `select count(*) filter (where status = 'FAILED')::int as failed, count(*) filter (where status = 'DELIVERED')::int as succeeded
            from "WebhookOutbox" where "tenantId" = $1 and status in ('FAILED', 'DELIVERED') and "updatedAt" > now() - ${FAILURE_WINDOW}` },
  ],
  MARKETPLACE: [
    { kind: "SETUP_INCOMPLETE", message: "No app installed yet.", action: { label: "Browse apps", href: "/dashboard/settings/integrations/marketplace" },
      sql: exists(`select 1 from "TenantAppInstall" where "tenantId" = $1 and status = 'INSTALLED'`) },
    // Mirrors marketplace.processAppDeliveries. That job has no lease recovery, so a delivery left
    // SENDING by a crashed worker never moves on its own; count those too.
    { kind: "WORKER_BACKLOG", noun: ["app event delivery", "app event deliveries"], job: "marketplace.processAppDeliveries",
      sql: `select count(*)::int as count from "TenantAppDelivery" where "tenantId" = $1
            and ((status = 'PENDING' and coalesce("nextRetryAt", "createdAt") <= now() - ${GRACE})
              or (status = 'SENDING' and "updatedAt" <= now() - ${GRACE}))` },
    // Mirrors marketplace.processAppSyncs' due condition.
    { kind: "WORKER_BACKLOG", noun: ["app sync overdue", "app syncs overdue"], job: "marketplace.processAppSyncs",
      sql: `select count(*)::int as count from "TenantAppSyncConfig" where "tenantId" = $1 and "syncCadenceMinutes" is not null
            and coalesce("lastSyncedAt", "createdAt") < now() - ("syncCadenceMinutes" || ' minutes')::interval - ${GRACE}` },
    { kind: "FAILING_COUNT", message: (n) => `${n} installed ${n === 1 ? "app reports" : "apps report"} an error.`, action: { label: "Review installed apps", href: "/dashboard/settings/integrations/marketplace" },
      sql: `select count(*)::int as count from "TenantAppHealth" h join "TenantAppInstall" i on i."tenantId" = h."tenantId" and i."appId" = h."appId" and i.status = 'INSTALLED'
            where h."tenantId" = $1 and h.status = 'ERROR'` },
    { kind: "FAILURE_RATE", noun: "app event deliveries",
      sql: `select count(*) filter (where status = 'FAILED')::int as failed, count(*) filter (where status = 'DELIVERED')::int as succeeded
            from "TenantAppDelivery" where "tenantId" = $1 and status in ('FAILED', 'DELIVERED') and "updatedAt" > now() - ${FAILURE_WINDOW}` },
  ],
  PRODUCT_CATALOG: [
    { kind: "SETUP_INCOMPLETE", message: "No active catalog with an active program yet.", action: { label: "Set up the catalog", href: "/dashboard/settings/data/catalog" },
      sql: `select (exists (select 1 from "ProductCatalog" where "tenantId" = $1 and "isActive") and exists (select 1 from "Program" where "tenantId" = $1 and "isActive")) as ok` },
    { kind: "WORKER_BACKLOG", noun: ["document reminder", "document reminders"], job: "applications.documentReminders",
      sql: `select count(*)::int as count from "ApplicationDocumentReminder" where "tenantId" = $1 and enabled and "nextRunAt" <= now() - ${GRACE}` },
  ],
};

// Worst first: the badge shows the first state any issue maps to.
const ISSUE_PRIORITY: ModuleHealthIssueKind[] = ["CONNECTOR_FAILING", "WORKER_BACKLOG", "SETUP_INCOMPLETE", "STALE_DATA"];

async function runCheck(tenantId: string, check: Check): Promise<ModuleHealthIssue | null> {
  const row = await queryOne<Record<string, unknown>>(check.sql, [tenantId]);
  if (check.kind === "SETUP_INCOMPLETE") return row?.ok === true ? null : { kind: "SETUP_INCOMPLETE", message: check.message, action: check.action };
  if (check.kind === "FAILURE_RATE") {
    const failed = Number(row?.failed ?? 0);
    const total = failed + Number(row?.succeeded ?? 0);
    if (failed < FAILURE_MIN_COUNT || failed / total < FAILURE_MIN_RATE) return null;
    return { kind: "CONNECTOR_FAILING", count: failed, message: `${failed} of ${total} ${check.noun} failed in the last 24 hours.`, action: check.action };
  }
  const count = Number(row?.count ?? 0);
  if (count <= 0) return null;
  if (check.kind === "WORKER_BACKLOG") {
    const noun = count === 1 ? check.noun[0] : check.noun[1];
    return { kind: "WORKER_BACKLOG", count, message: `${count.toLocaleString("en-IN")} ${noun} ${count === 1 ? "is" : "are"} more than ${BACKLOG_GRACE_MINUTES} minutes overdue.`, detail: `Processed by ${check.job}` };
  }
  if (check.kind === "FAILING_COUNT") return { kind: "CONNECTOR_FAILING", count, message: check.message(count), action: check.action };
  return { kind: "STALE_DATA", count, message: check.message(count), action: check.action };
}

async function evaluate(tenantId: string): Promise<ModuleHealth[]> {
  const checkedAt = new Date().toISOString();
  const [effective, catalog, entitlements] = await Promise.all([
    getEffectiveModuleStates(tenantId),
    query<{ key: string; isCore: boolean }>(`select "key", "isCore" from "PlatformModule" order by "key"`, []),
    query<{ moduleKey: string; status: string; reason: string | null; lastAction: string | null }>(
      `select e."moduleKey", e.status, e.reason,
              (select a.action from "TenantModuleAuditLog" a where a."tenantId" = e."tenantId" and a."moduleKey" = e."moduleKey" order by a."performedAt" desc limit 1) as "lastAction"
       from "TenantModuleEntitlement" e where e."tenantId" = $1`,
      [tenantId],
    ),
  ]);
  const byKey = new Map(entitlements.map((row) => [row.moduleKey, row]));
  const name = (key: string) => effective.names[key] ?? key;
  const base = { issues: [] as ModuleHealthIssue[], checked: true, checksFailed: 0, checkedAt };

  return Promise.all(catalog.map(async ({ key, isCore }): Promise<ModuleHealth> => {
    if (isCore) return { ...base, moduleKey: key, state: "HEALTHY", checked: false };
    if (NOT_BUILT.has(key)) return { ...base, moduleKey: key, state: "NOT_AVAILABLE" };
    const entitlement = byKey.get(key);
    if (entitlement?.status === "DISABLED") return { ...base, moduleKey: key, state: "DISABLED" };
    if (entitlement?.status === "SUSPENDED") {
      if (entitlement.lastAction === "TRIAL_EXPIRED") return { ...base, moduleKey: key, state: "TRIAL_EXPIRED" };
      if (entitlement.lastAction === "DEPENDENCY_SUSPENDED") {
        return { ...base, moduleKey: key, state: "DISABLED_BY_DEPENDENCY", issues: [{ kind: "DISABLED_BY_DEPENDENCY", message: entitlement.reason || "Suspended because a module it needs was suspended." }] };
      }
      if (entitlement.lastAction === "EMERGENCY_SUSPENDED") {
        return { ...base, moduleKey: key, state: "SUSPENDED", issues: [{ kind: "OFF", message: "Temporarily suspended by the platform team. Data is kept; it is restored when the suspension is lifted." }] };
      }
      return { ...base, moduleKey: key, state: "SUSPENDED" };
    }
    const missing = requiredModules(key).filter((required) => effective.states[required] !== true);
    if (missing.length) {
      return { ...base, moduleKey: key, state: "DISABLED_BY_DEPENDENCY", issues: [{ kind: "DISABLED_BY_DEPENDENCY", message: `Needs ${missing.map(name).join(" and ")}, which ${missing.length > 1 ? "are" : "is"} off.` }] };
    }

    const issues: ModuleHealthIssue[] = [];
    let checksFailed = 0;
    for (const check of MODULE_HEALTH_CHECKS[key] ?? []) {
      try {
        const issue = await runCheck(tenantId, check);
        if (issue) issues.push(issue);
      } catch (error) {
        // An unmigrated table must not break the page, and must not be reported as healthy.
        console.error(`[module-health] ${key} ${check.kind} check failed`, error);
        checksFailed++;
      }
    }
    issues.sort((a, b) => ISSUE_PRIORITY.indexOf(a.kind) - ISSUE_PRIORITY.indexOf(b.kind));
    const state = (issues[0]?.kind as ModuleHealthState | undefined) ?? "HEALTHY";
    return { moduleKey: key, state, issues, checked: (MODULE_HEALTH_CHECKS[key] ?? []).length > 0, checksFailed, checkedAt };
  }));
}

async function saveSnapshot(tenantId: string, health: ModuleHealth[]) {
  await query(
    `insert into "TenantModuleHealth" ("tenantId", "moduleKey", state, issues, "checkedAt")
     select $1, x."moduleKey", x.state, coalesce(x.issues, '[]'::jsonb), x."checkedAt"
     from jsonb_to_recordset($2::jsonb) as x("moduleKey" text, state text, issues jsonb, "checkedAt" timestamptz)
     where exists (select 1 from "PlatformModule" p where p."key" = x."moduleKey")
     on conflict ("tenantId", "moduleKey") do update set state = excluded.state, issues = excluded.issues, "checkedAt" = excluded."checkedAt"`,
    [tenantId, JSON.stringify(health.map(({ moduleKey, state, issues, checkedAt }) => ({ moduleKey, state, issues, checkedAt })))],
  );
}

const NOTIFY_KINDS = ["CONNECTOR_FAILING", "WORKER_BACKLOG"] as const;

async function notifyProblems(tenantId: string, health: ModuleHealth[]) {
  const problems = health.flatMap((module) => NOTIFY_KINDS.filter((kind) => module.issues.some((issue) => issue.kind === kind)).map((kind) => ({ module, kind })));
  if (!problems.length) return 0;
  const { year, month, day } = zonedWallClockParts(new Date(), await getTenantTimeZone(tenantId));
  const today = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const [{ names }, tenant] = await Promise.all([getEffectiveModuleStates(tenantId), queryOne<{ name: string }>(`select name from "Tenant" where id = $1`, [tenantId])]);
  let sent = 0;
  for (const { module, kind } of problems) {
    const inserted = await queryOne<{ kind: string }>(
      `insert into "TenantModuleHealthAlert" ("tenantId", "moduleKey", kind, day) values ($1, $2, $3, $4) on conflict do nothing returning kind`,
      [tenantId, module.moduleKey, kind, today],
    );
    if (!inserted) continue;
    const moduleName = names[module.moduleKey] ?? module.moduleKey;
    const summary = module.issues.filter((issue) => issue.kind === kind).map((issue) => issue.message).join(" ");
    const title = kind === "CONNECTOR_FAILING" ? `${moduleName}: connector failing` : `${moduleName}: work backed up`;
    await notifyAdmins(tenantId, tenant?.name ?? "A workspace", title, summary, { event: "MODULE_HEALTH_PROBLEM", moduleKey: module.moduleKey, kind });
    sent++;
  }
  return sent;
}

async function notifyAdmins(tenantId: string, tenantName: string, title: string, message: string, data: Record<string, unknown>) {
  const { createUserNotification } = await import("@/lib/server/notifications");
  const [platformAdmins, tenantAdmins] = await Promise.all([
    queryAsSystem<{ userId: string }>(`select "userId" from "PlatformAdmin" where "isActive" = true`, []),
    query<{ id: string }>(
      `select u.id from "User" u join "Role" r on r.id = u."roleId"
       where u."tenantId" = $1 and u."deletedAt" is null and coalesce(u.status, 'ACTIVE') = 'ACTIVE'
         and (r.permissions -> 'modules' ->> 'admin' = 'full' or r.permissions ->> 'recordAccess' = 'ALL')`,
      [tenantId],
    ),
  ]);
  for (const { userId } of platformAdmins) await createUserNotification({ tenantId: null, userId, title: `${tenantName} — ${title}`, message, data: { ...data, tenantId } }).catch(() => undefined);
  for (const { id } of tenantAdmins) await createUserNotification({ tenantId, userId: id, title, message: `${message} Admins are reminded once a day while this continues.`, data }).catch(() => undefined);
}

/**
 * Compute every module's health for one tenant now, store the snapshot and send any due daily
 * notice. Runs under that tenant's context so tenant-scoped reads and writes pass RLS whether the
 * caller is the tenant's admin, a platform admin (whose own context has no tenant) or the worker.
 */
export async function refreshTenantModuleHealth(tenantId: string): Promise<ModuleHealth[]> {
  return runWithTenantContext({ tenantId, userId: null, roleId: null }, async () => {
    const health = await evaluate(tenantId);
    await saveSnapshot(tenantId, health);
    await notifyProblems(tenantId, health).catch((error) => console.error("[module-health] notify failed", error));
    return health;
  });
}

/** Tenant admins: same health without operator detail. */
export async function getModuleHealthForTenantAdmin(tenantId: string) {
  const health = await refreshTenantModuleHealth(tenantId);
  return health.map((module) => ({ ...module, issues: module.issues.map(({ detail: _detail, ...issue }) => issue) }));
}

export const HEALTH_REFRESH_MINUTES = 15;
/** Snapshots older than this mean the health job itself is not running. */
const SNAPSHOT_STALE_MINUTES = 60;

/** Worker job: refresh the snapshots of active tenants checked longest ago (never-checked first). */
export async function processModuleHealth(limit = 20) {
  let checked = 0;
  for (const tenant of await tenantsDueForHealthCheck(limit)) {
    try {
      await refreshTenantModuleHealth(tenant.id);
      checked++;
    } catch (error) {
      console.error(`[module-health] tenant ${tenant.id} failed`, error);
    }
  }
  return { checked };
}

export async function tenantsDueForHealthCheck(limit: number) {
  // Cross-tenant by design: discovers which tenants are due; each tenant is then evaluated under
  // its own tenant context.
  return queryAsSystem<{ id: string }>(
    `select t.id from "Tenant" t
     left join lateral (select min(h."checkedAt") as checked from "TenantModuleHealth" h where h."tenantId" = t.id) h on true
     where t.status = 'ACTIVE' and (h.checked is null or h.checked < now() - interval '${HEALTH_REFRESH_MINUTES} minutes')
     order by h.checked asc nulls first
     limit $1`,
    [limit],
  );
}

const PROBLEM_STATES: ModuleHealthState[] = ["CONNECTOR_FAILING", "WORKER_BACKLOG", "SETUP_INCOMPLETE", "STALE_DATA", "DISABLED_BY_DEPENDENCY", "TRIAL_EXPIRED"];

/** Platform admins: every tenant's unhealthy modules from the snapshots, plus snapshot freshness. */
export async function listModuleHealthAcrossTenants() {
  // Cross-tenant platform-admin read by design.
  const [rows, freshness] = await Promise.all([
    queryAsSystem<{ tenantId: string; tenantName: string; moduleKey: string; moduleName: string; state: ModuleHealthState; issues: ModuleHealthIssue[]; checkedAt: string }>(
      `select h."tenantId", t.name as "tenantName", h."moduleKey", p.name as "moduleName", h.state, h.issues, h."checkedAt"
       from "TenantModuleHealth" h join "Tenant" t on t.id = h."tenantId" join "PlatformModule" p on p."key" = h."moduleKey"
       where t.status = 'ACTIVE' and h.state = any($1)
       order by array_position($1::text[], h.state), t.name, p.name
       limit 1000`,
      [PROBLEM_STATES],
    ),
    queryAsSystem<{ activeTenants: number; neverChecked: number; oldestCheckedAt: string | null; snapshotsStale: boolean }>(
      `select count(*)::int as "activeTenants",
              count(*) filter (where h.checked is null)::int as "neverChecked",
              min(h.checked) as "oldestCheckedAt",
              coalesce(min(h.checked) < now() - interval '${SNAPSHOT_STALE_MINUTES} minutes', false) as "snapshotsStale"
       from "Tenant" t left join lateral (select min("checkedAt") as checked from "TenantModuleHealth" where "tenantId" = t.id) h on true
       where t.status = 'ACTIVE'`,
      [],
    ),
  ]);
  return { items: rows, ...(freshness[0] ?? { activeTenants: 0, neverChecked: 0, oldestCheckedAt: null, snapshotsStale: false }), refreshMinutes: HEALTH_REFRESH_MINUTES };
}
