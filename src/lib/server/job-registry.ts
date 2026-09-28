// WP10 follow-up (F18 item 4/6): a formal job registry -- the single source of truth this audit
// finding explicitly called out as missing. Before this file, a job's name/queue class lived in
// THREE places that had to be kept in sync by hand: worker.ts's `realtimeJobs`/`backgroundJobs`
// `as const` arrays (which also implicitly defined "recurring or not"), job-queue.ts's separate
// `CrmJobName` string-union type, and each dynamically-enqueued job's own ad hoc `enqueue*`
// function (which encoded "which queue does this go on" as a hardcoded `getCrmQueue()` call with
// no name/class-consistency check against anything else). This file replaces all three with one
// typed object: every job name this app knows about, its workload class, whether it recurs on a
// timer, and whether a single invocation is scoped to one tenant (vs. a scan across many tenants'
// rows in one processor call -- see the `isTenantScoped: false` comments below for why that
// distinction matters for fairness scheduling in job-fairness.ts).
//
// This module is intentionally dependency-free (no imports of `bullmq`, Postgres, or any business
// logic) so it can be imported from job-queue.ts (enqueue-time routing), scripts/worker.ts
// (processor wiring), and the platform-admin dead-letter API without pulling in the worker
// process's full business-logic dependency graph. The actual processor FUNCTIONS still live in
// scripts/worker.ts, which is the one place that legitimately needs to import all of
// automations/reports/scoring/etc. -- but this registry is what worker.ts builds its per-class
// job lists FROM, and job-queue.ts uses it to look up which queue a dynamically-enqueued job name
// belongs to, so the class-to-queue-name mapping (and every job's classification) now has exactly
// one place to change.

// WP10 follow-up: FOUR workload classes instead of the two ("realtime"/"background") shipped in
// the first WP10 pass -- this is the audit's own original ask (job-contract-design section, WP10
// item 4): "realtime/communication, operational-automation, export/import/report, and ML workload
// classes with separate concurrency budgets." "background" is retired as a class name; every job
// that used to be lumped into it is reclassified below into "operational", "heavy", or "ml".
export type JobQueueClass = "realtime" | "operational" | "heavy" | "ml";

export interface JobRegistryEntry {
  /** BullMQ job name -- matches the registry key (kept as a field too so an entry is self-describing when iterated via Object.values). */
  readonly name: string;
  readonly queueClass: JobQueueClass;
  /** True for a job worker.ts registers as a BullMQ repeatable job (a fixed-interval timer tick). False for a job that's only ever dynamically enqueued in response to a specific user/tenant action (exports/imports/scoring recompute). */
  readonly isRecurring: boolean;
  /** Optional per-job override of the recurring interval, in ms. Undefined means "use worker.ts's shared repeatMs() default (WORKER_REPEAT_MS, 60s otherwise)" -- no job needs a different cadence today, but this keeps the registry able to express one without another shape change. */
  readonly repeatMs?: number;
  /**
   * True when a SINGLE invocation of this job's processor does work for exactly one tenant (and
   * that tenant is known from the job's own data payload -- e.g. exports.process's
   * `{ tenantId, exportRequestId }`). False for every recurring "scan tick" job (e.g.
   * reports.processSchedules, automation.processDue) -- those each pull a bounded batch of due
   * rows *across all tenants* in one processor call, so there is no single tenant to attribute a
   * fairness-counter slot to at the whole-invocation level. This flag is exactly what
   * job-fairness.ts's per-tenant concurrency cap depends on: it is only meaningful, and only
   * applied, to isTenantScoped jobs on the "heavy" queue class (see scripts/worker.ts).
   */
  readonly isTenantScoped: boolean;
  readonly description: string;
}

function makeRegistry<T extends Record<string, JobRegistryEntry>>(registry: T): T {
  return registry;
}

// --- realtime: unchanged from the first WP10 pass -- everything directly on a counselor- or
// lead-facing dispatch path (an outbound message, a webhook delivery, a task reminder/escalation
// actually due now, or an NBA recommendation feeding a live UI). ---
const realtimeEntries = makeRegistry({
  "communications.processDue": {
    name: "communications.processDue",
    queueClass: "realtime",
    isRecurring: true,
    isTenantScoped: false,
    description: "Drains the due communication outbox (processCommunicationOutbox) across all tenants.",
  },
  "webhooks.processOutbox": {
    name: "webhooks.processOutbox",
    queueClass: "realtime",
    isRecurring: true,
    isTenantScoped: false,
    description: "Drains the due webhook outbox (processWebhookOutbox) across all tenants.",
  },
  "tasks.processReminders": {
    name: "tasks.processReminders",
    queueClass: "realtime",
    isRecurring: true,
    isTenantScoped: false,
    description: "Sends due task reminders across all tenants.",
  },
  "tasks.processReminderEscalations": {
    name: "tasks.processReminderEscalations",
    queueClass: "realtime",
    isRecurring: true,
    isTenantScoped: false,
    description: "Escalates overdue task reminders across all tenants.",
  },
  "tasks.processSlaBreaches": {
    name: "tasks.processSlaBreaches",
    queueClass: "realtime",
    isRecurring: true,
    isTenantScoped: false,
    description: "Flags task SLA breaches across all tenants.",
  },
  "nba.processScheduledRefresh": {
    name: "nba.processScheduledRefresh",
    queueClass: "realtime",
    isRecurring: true,
    isTenantScoped: false,
    description: "Refreshes due Next Best Action recommendations across all tenants.",
  },
});

// --- operational: recurring background-automation work that is not itself heavy (no bulk
// export/import/report generation, no ML training/inference) and is not on the realtime dispatch
// path either -- automations, journeys, data quality, marketplace sync, telephony/retention
// housekeeping, case SLA/analytics, metrics rollups. ---
const operationalEntries = makeRegistry({
  "automation.processDue": {
    name: "automation.processDue",
    queueClass: "operational",
    isRecurring: true,
    isTenantScoped: false,
    description: "Runs due workflow-automation jobs across all tenants.",
  },
  "tasks.processOverdue": {
    name: "tasks.processOverdue",
    queueClass: "operational",
    isRecurring: true,
    isTenantScoped: false,
    description: "Runs overdue-task automations across all tenants.",
  },
  "journeys.processEnrollmentRefresh": {
    name: "journeys.processEnrollmentRefresh",
    queueClass: "operational",
    isRecurring: true,
    isTenantScoped: false,
    description: "Refreshes due marketing-journey enrollments across all tenants.",
  },
  "journeys.alertDegraded": {
    name: "journeys.alertDegraded",
    queueClass: "operational",
    isRecurring: true,
    isTenantScoped: false,
    description: "Alerts on degraded marketing journeys across all tenants.",
  },
  "dataQuality.processScheduledScan": {
    name: "dataQuality.processScheduledScan",
    queueClass: "operational",
    isRecurring: true,
    isTenantScoped: false,
    description: "Runs scheduled data-quality scans across all tenants.",
  },
  "marketplace.processAppDeliveries": {
    name: "marketplace.processAppDeliveries",
    queueClass: "operational",
    isRecurring: true,
    isTenantScoped: false,
    description: "Delivers pending marketplace app events across all tenants.",
  },
  "marketplace.processAppSyncs": {
    name: "marketplace.processAppSyncs",
    queueClass: "operational",
    isRecurring: true,
    isTenantScoped: false,
    description: "Runs due marketplace app syncs across all tenants.",
  },
  "telephony.expireRecordings": {
    name: "telephony.expireRecordings",
    queueClass: "operational",
    isRecurring: true,
    isTenantScoped: false,
    description: "Expires call recordings past retention across all tenants.",
  },
  "retention.enforce": {
    name: "retention.enforce",
    queueClass: "operational",
    isRecurring: true,
    isTenantScoped: false,
    description: "Enforces data-retention policies across all tenants.",
  },
  "communications.processSuppressionExpiry": {
    name: "communications.processSuppressionExpiry",
    queueClass: "operational",
    isRecurring: true,
    isTenantScoped: false,
    description: "Expires due communication suppressions across all tenants.",
  },
  "cases.processSlaEscalations": {
    name: "cases.processSlaEscalations",
    queueClass: "operational",
    isRecurring: true,
    isTenantScoped: false,
    description: "Escalates case SLA breaches across all tenants.",
  },
  "cases.dispatchSurveys": {
    name: "cases.dispatchSurveys",
    queueClass: "operational",
    isRecurring: true,
    isTenantScoped: false,
    description: "Dispatches due case surveys across all tenants.",
  },
  "cases.refreshAnalyticsSnapshots": {
    name: "cases.refreshAnalyticsSnapshots",
    queueClass: "operational",
    isRecurring: true,
    isTenantScoped: false,
    description: "Refreshes case analytics snapshots across all tenants.",
  },
  "applications.documentReminders": {
    name: "applications.documentReminders", queueClass: "operational", isRecurring: true, isTenantScoped: false,
    description: "Delivers opted-in owner document reminders for applications.",
  },
  "cases.alertStaleUnassigned": {
    name: "cases.alertStaleUnassigned",
    queueClass: "operational",
    isRecurring: true,
    isTenantScoped: false,
    description: "Alerts on stale unassigned cases across all tenants.",
  },
  "metrics.computeGrainSnapshots": {
    name: "metrics.computeGrainSnapshots",
    queueClass: "operational",
    isRecurring: true,
    isTenantScoped: false,
    description: "Computes due metric-grain snapshots across all tenants.",
  },
});

// --- heavy: the audit's own named example workload -- export/import/report generation. Includes
// both recurring "scan and process a bounded batch" ticks (reports.*, exports.processExpiry, all
// isTenantScoped: false -- see the field doc above) AND the two dynamically-enqueued,
// genuinely-single-tenant-per-job types (exports.process, imports.process) that job-fairness.ts's
// per-tenant concurrency cap actually applies to. ---
const heavyEntries = makeRegistry({
  "reports.processRollups": {
    name: "reports.processRollups",
    queueClass: "heavy",
    isRecurring: true,
    isTenantScoped: false,
    description: "Processes pending report-refresh jobs (processPendingReportRefreshJobs) across all tenants.",
  },
  "reports.processRollupSchedule": {
    name: "reports.processRollupSchedule",
    queueClass: "heavy",
    isRecurring: true,
    isTenantScoped: false,
    description: "Enqueues due report-rollup refreshes across all tenants.",
  },
  "reports.processSchedules": {
    name: "reports.processSchedules",
    queueClass: "heavy",
    isRecurring: true,
    isTenantScoped: false,
    description: "Runs due scheduled reports across all tenants.",
  },
  "reports.retryFailedSchedules": {
    name: "reports.retryFailedSchedules",
    queueClass: "heavy",
    isRecurring: true,
    isTenantScoped: false,
    description: "Retries failed report schedules across all tenants.",
  },
  "exports.processExpiry": {
    name: "exports.processExpiry",
    queueClass: "heavy",
    isRecurring: true,
    isTenantScoped: false,
    description: "Expires stale export files across all tenants.",
  },
  "exports.process": {
    name: "exports.process",
    queueClass: "heavy",
    isRecurring: false,
    isTenantScoped: true,
    description: "Generates one export request's file. Dynamically enqueued per export request; subject to the per-tenant fairness cap (job-fairness.ts).",
  },
  "imports.process": {
    name: "imports.process",
    queueClass: "heavy",
    isRecurring: false,
    isTenantScoped: true,
    description: "Processes one import job's rows. Dynamically enqueued per import job; subject to the per-tenant fairness cap (job-fairness.ts).",
  },
});

// --- ml: model training/scoring work -- CPU/memory-heavy per job, so this class defaults to a
// LOW concurrency (see DEFAULT_CONCURRENCY_BY_CLASS below) regardless of how many jobs are
// queued. ---
const mlEntries = makeRegistry({
  "scoring.processScheduledRetraining": {
    name: "scoring.processScheduledRetraining",
    queueClass: "ml",
    isRecurring: true,
    isTenantScoped: false,
    description: "Runs due scheduled scoring-model retraining across all tenants.",
  },
  "scoring.recomputeRules": {
    name: "scoring.recomputeRules",
    queueClass: "ml",
    isRecurring: false,
    isTenantScoped: true,
    description: "Recomputes rule-based lead scores for one tenant. Dynamically enqueued (deduped per tenant).",
  },
  "scoring.recomputeSelfLearning": {
    name: "scoring.recomputeSelfLearning",
    queueClass: "ml",
    isRecurring: false,
    isTenantScoped: true,
    description: "Recomputes predictive (self-learning) scores for one tenant. Dynamically enqueued (deduped per tenant).",
  },
});

export const JOB_REGISTRY = {
  ...realtimeEntries,
  ...operationalEntries,
  ...heavyEntries,
  ...mlEntries,
};

export type CrmJobName = keyof typeof JOB_REGISTRY;

export function isCrmJobName(name: string): name is CrmJobName {
  return Object.prototype.hasOwnProperty.call(JOB_REGISTRY, name);
}

export function jobRegistryEntry(name: CrmJobName): JobRegistryEntry {
  return JOB_REGISTRY[name];
}

export function allJobNames(): CrmJobName[] {
  return Object.keys(JOB_REGISTRY) as CrmJobName[];
}

export function jobNamesForClass(queueClass: JobQueueClass): CrmJobName[] {
  return allJobNames().filter((name) => JOB_REGISTRY[name].queueClass === queueClass);
}

export function recurringJobNamesForClass(queueClass: JobQueueClass): CrmJobName[] {
  return jobNamesForClass(queueClass).filter((name) => JOB_REGISTRY[name].isRecurring);
}

// One BullMQ queue name per workload class -- "crm-jobs" (background) and "crm-jobs-realtime"
// (from the first WP10 pass) become four: realtime is unchanged, and what used to be one
// "crm-jobs" background queue splits into "crm-jobs-operational", "crm-jobs-heavy", and
// "crm-jobs-ml". The realtime queue name is intentionally left as-is (not renamed to
// "crm-jobs-realtime-v2" or similar) since renaming it would needlessly orphan whatever's already
// queued there across a deploy.
export const QUEUE_NAME_BY_CLASS: Record<JobQueueClass, string> = {
  realtime: "crm-jobs-realtime",
  operational: "crm-jobs-operational",
  heavy: "crm-jobs-heavy",
  ml: "crm-jobs-ml",
};

export function queueNameForClass(queueClass: JobQueueClass): string {
  return QUEUE_NAME_BY_CLASS[queueClass];
}

export function queueNameForJob(name: CrmJobName): string {
  return QUEUE_NAME_BY_CLASS[JOB_REGISTRY[name].queueClass];
}

// One concurrency env var per class, following the existing WORKER_CONCURRENCY_REALTIME /
// WORKER_CONCURRENCY_BACKGROUND naming convention from the first WP10 pass.
export const CONCURRENCY_ENV_VAR_BY_CLASS: Record<JobQueueClass, string> = {
  realtime: "WORKER_CONCURRENCY_REALTIME",
  operational: "WORKER_CONCURRENCY_OPERATIONAL",
  heavy: "WORKER_CONCURRENCY_HEAVY",
  ml: "WORKER_CONCURRENCY_ML",
};

// ML jobs (model training/scoring) are CPU/memory-heavy per job, so this class defaults to a low
// concurrency regardless of queue depth -- running many at once risks starving the whole worker
// process's memory/CPU budget, not just other ML jobs. Heavy (export/import/report) defaults
// modestly higher since a single job is typically I/O-bound (DB reads, file writes), not
// CPU-pegged, but still lower than realtime/operational's "many small, fast jobs" profile.
export const DEFAULT_CONCURRENCY_BY_CLASS: Record<JobQueueClass, number> = {
  realtime: 5,
  operational: 5,
  heavy: 3,
  ml: 2,
};

// Default per-tenant concurrent-heavy-job cap for job-fairness.ts (see that file for the full
// mechanism). Configurable via JOB_FAIRNESS_HEAVY_MAX_CONCURRENT_PER_TENANT.
export const DEFAULT_TENANT_FAIRNESS_MAX_CONCURRENT = 2;

/**
 * Resolves a workload class's Worker concurrency from its own env var, falling back (for
 * "operational" only) to the pre-existing WORKER_CONCURRENCY_BACKGROUND / WORKER_CONCURRENCY env
 * vars so an unmodified deployment's config keeps meaning the same thing it did before this
 * change -- "operational" is the direct successor of the old single "background" class (it keeps
 * the largest share of the old background job list). "heavy" and "ml" are newly split OUT of that
 * same old background budget, so they deliberately do NOT also inherit
 * WORKER_CONCURRENCY_BACKGROUND -- letting all three classes separately claim that same old number
 * would silently triple total worker concurrency on a deployment that hasn't set the new
 * per-class env vars yet. Operators should set WORKER_CONCURRENCY_HEAVY/WORKER_CONCURRENCY_ML
 * explicitly once they've re-tuned for the four-class split; until then they get these
 * deliberately modest defaults instead of an inherited, untuned number.
 */
export function resolveConcurrency(queueClass: JobQueueClass): number {
  const envVar = CONCURRENCY_ENV_VAR_BY_CLASS[queueClass];
  const raw = process.env[envVar];
  if (raw !== undefined) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (queueClass === "operational") {
    const legacy = Number(process.env.WORKER_CONCURRENCY_BACKGROUND || process.env.WORKER_CONCURRENCY || DEFAULT_CONCURRENCY_BY_CLASS.operational);
    if (Number.isFinite(legacy) && legacy > 0) return legacy;
  }
  return DEFAULT_CONCURRENCY_BY_CLASS[queueClass];
}
