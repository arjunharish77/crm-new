import { assertModuleEnabled, assertTenantModule } from "@/lib/server/module-entitlements";
import { randomUUID } from "crypto";
import { createAuditLog } from "@/lib/server/crm";
import { query, queryOne, execute, queryAsSystem } from "@/lib/db/query";
import {
  createAutomationForTenant,
  getAutomationForTenant,
  updateAutomationForTenant,
  enrollRecordsInAutomation,
  executeAutomationWorkflow,
  loadAutomationTestRecord,
} from "@/lib/repositories/automations-postgres";
import { leadAudienceForList } from "@/lib/repositories/lead-lists-postgres";
import { countLeadAudienceForTenant, listLeadAudiencePageForTenant, type LeadAudienceQuery } from "@/lib/repositories/leads-postgres";
import { toServerQuery } from "@/components/views/smart-view-server-query";
import { countOpportunityAudienceForTenant, listOpportunityAudienceIdsForTenant } from "@/lib/repositories/opportunities-postgres";
import { getCurrentUserById } from "@/lib/repositories/auth-admin-postgres";
import { isSuppressed, isOptedOut } from "@/lib/server/communications";
import { createUserNotification } from "@/lib/server/notifications";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isPlatformAdmin?: boolean;
  isTenantAdmin?: boolean;
  role?: { permissions?: any } | string | null;
};

export type JourneyModule = "LEAD" | "OPPORTUNITY";
export type JourneyStatus = "DRAFT" | "APPROVED" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "ARCHIVED";
export type JourneyAudienceType = "LEAD_LIST" | "SAVED_VIEW" | "MANUAL";

export type JourneyInput = {
  name: string;
  description?: string | null;
  targetModule: JourneyModule;
  audienceType?: JourneyAudienceType;
  audienceConfig?: Record<string, unknown>;
  continuousEnrollment?: boolean;
  scheduledAt?: string | null;
  // Collision handling (item 10): when the same record would be actively enrolled in more
  // than one ACTIVE journey at once, the higher-priority journey wins -- see
  // resolveJourneyEnrollmentCollision.
  priority?: number;
};

const JOURNEY_COLUMNS = `id, "tenantId", "automationId", name, description, "targetModule", status, "audienceType",
  "audienceConfig", "continuousEnrollment", "scheduledAt", priority, "currentVersion", "createdBy", "createdAt", "updatedAt",
  "enrollmentPending"`;

// Only forward transitions are ever allowed automatically -- PAUSED can return to ACTIVE
// (a deliberate exception, since pausing is meant to be reversible), but nothing skips
// backward past ARCHIVED, and DRAFT/APPROVED can't be reached again once launched.
const ALLOWED_STATUS_TRANSITIONS: Record<JourneyStatus, JourneyStatus[]> = {
  DRAFT: ["APPROVED", "ARCHIVED"],
  APPROVED: ["SCHEDULED", "ACTIVE", "ARCHIVED"],
  SCHEDULED: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["PAUSED", "ARCHIVED"],
  PAUSED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],
};

export async function listJourneysForTenant(user: TenantUser) {
  if (!user.tenantId) return [];
  await assertTenantModule(user, "JOURNEY_ORCHESTRATION");
  return query<any>(`select ${JOURNEY_COLUMNS} from "MarketingJourney" where "tenantId" = $1 order by "createdAt" desc`, [user.tenantId]);
}

export async function getJourneyForTenant(user: TenantUser, id: string) {
  if (!user.tenantId) return null;
  await assertTenantModule(user, "JOURNEY_ORCHESTRATION");
  return queryOne<any>(`select ${JOURNEY_COLUMNS} from "MarketingJourney" where "tenantId" = $1 and id = $2 limit 1`, [user.tenantId, id]);
}

// Creates the journey's own underlying AutomationV2 (trigger type MANUAL -- journeys
// drive execution via bulk enrollment, not an event trigger) so the existing automation
// builder UI can be reused verbatim for the actual workflow graph.
export async function createJourneyForTenant(user: TenantUser, input: JourneyInput) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "JOURNEY_ORCHESTRATION", { isPlatformAdmin: user.isPlatformAdmin });
  const automation = await createAutomationForTenant(user, {
    name: `[Journey] ${input.name}`,
    description: input.description ?? null,
    trigger: { type: "MANUAL" },
    workflow: { nodes: [], edges: [] },
    isActive: false,
  });

  const now = new Date().toISOString();
  const journey = await queryOne<any>(
    `insert into "MarketingJourney"
      (id, "tenantId", "automationId", name, description, "targetModule", status, "audienceType", "audienceConfig",
       "continuousEnrollment", "scheduledAt", priority, "currentVersion", "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, 'DRAFT', $7, $8, $9, $10, $11, 0, $12, $13, $13)
     returning ${JOURNEY_COLUMNS}`,
    [
      randomUUID(), user.tenantId, automation.id, input.name, input.description ?? null, input.targetModule,
      input.audienceType ?? "LEAD_LIST", input.audienceConfig ?? {}, input.continuousEnrollment ?? false,
      input.scheduledAt ?? null, input.priority ?? 0, user.id, now,
    ],
  );
  if (!journey) throw new Error("MARKETING_JOURNEY_INSERT_FAILED");
  await createAuditLog(user as any, "CREATE", "MARKETING_JOURNEY", journey.id, null, journey, null);
  return journey;
}

const AUDIENCE_FIELDS = ["audienceType", "audienceConfig", "continuousEnrollment"] as const;

export async function updateJourneyForTenant(user: TenantUser, id: string, input: Partial<JourneyInput>) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "JOURNEY_ORCHESTRATION", { isPlatformAdmin: user.isPlatformAdmin });
  const existing = await getJourneyForTenant(user, id);
  if (!existing) return null;

  // Silently repointing a live journey's audience (e.g. to a different saved view)
  // without pausing first would enroll a new, un-reviewed population under the same
  // already-approved workflow -- require pausing so the change is a deliberate step.
  if (existing.status === "ACTIVE" && AUDIENCE_FIELDS.some((field) => input[field] !== undefined)) {
    throw new Error("MARKETING_JOURNEY_PAUSE_BEFORE_EDITING_AUDIENCE");
  }

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ["name", "description", "audienceType", "audienceConfig", "continuousEnrollment", "scheduledAt", "priority"] as const) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  const columns = Object.keys(patch);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  const data = await queryOne<any>(
    `update "MarketingJourney" set ${assignments} where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2} returning ${JOURNEY_COLUMNS}`,
    [...columns.map((column) => patch[column]), user.tenantId, id],
  );
  if (!data) return null;
  await createAuditLog(user as any, "UPDATE", "MARKETING_JOURNEY", data.id, existing, data, null);
  return data;
}

export async function transitionJourneyStatus(user: TenantUser, id: string, nextStatus: JourneyStatus) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "JOURNEY_ORCHESTRATION", { isPlatformAdmin: user.isPlatformAdmin });
  const existing = await getJourneyForTenant(user, id);
  if (!existing) return null;
  if (!ALLOWED_STATUS_TRANSITIONS[existing.status as JourneyStatus]?.includes(nextStatus)) {
    throw new Error(`INVALID_JOURNEY_TRANSITION: ${existing.status} -> ${nextStatus}`);
  }

  // Deliberately keep the underlying automation "live" (isActive=true) for PAUSED, not
  // just ACTIVE. The automation engine's queue worker (processDueAutomationJobsInternal)
  // CANCELS a waiting step outright when isActive=false -- it does not defer it -- so
  // setting isActive=false on pause would silently and irrecoverably drop every
  // in-flight enrolled record instead of freezing it. "Pause" is enforced at the
  // enrollment layer instead: enrollAudienceIntoJourney already refuses to enroll new
  // records unless status === "ACTIVE", so pausing stops new enrollments while letting
  // already-enrolled records keep progressing through steps they were already at.
  // Only DRAFT/APPROVED/SCHEDULED (never had anything enrolled) and ARCHIVED (terminal)
  // actually deactivate the automation.
  await updateAutomationForTenant(user, existing.automationId, { isActive: nextStatus === "ACTIVE" || nextStatus === "PAUSED" });

  const now = new Date().toISOString();
  const data = await queryOne<any>(
    `update "MarketingJourney" set status = $1, "updatedAt" = $2 where "tenantId" = $3 and id = $4 returning ${JOURNEY_COLUMNS}`,
    [nextStatus, now, user.tenantId, id],
  );
  if (!data) return null;
  await createAuditLog(user as any, "UPDATE", "MARKETING_JOURNEY", id, existing, data, { status: { before: existing.status, after: nextStatus } });
  return data;
}

// Snapshots the underlying automation's current workflow as a new version -- called at
// APPROVED time (and any time the workflow is edited after that) so there's a real
// version history and a rollback target, independent of the live-editable automation row.
export async function publishJourneyVersion(user: TenantUser, id: string, publishNotes?: string | null) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "JOURNEY_ORCHESTRATION", { isPlatformAdmin: user.isPlatformAdmin });
  const journey = await getJourneyForTenant(user, id);
  if (!journey) return null;
  const automation = await getAutomationForTenant(user, journey.automationId);
  if (!automation) throw new Error("MARKETING_JOURNEY_AUTOMATION_NOT_FOUND");

  const version = Number(journey.currentVersion ?? 0) + 1;
  const now = new Date().toISOString();
  await execute(
    `insert into "MarketingJourneyVersion" (id, "tenantId", "journeyId", version, "workflowSnapshot", "publishNotes", "publishedBy", "publishedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), user.tenantId, id, version, automation.workflow ?? { nodes: [], edges: [] }, publishNotes ?? null, user.id, now],
  );
  const data = await queryOne<any>(
    `update "MarketingJourney" set "currentVersion" = $1, "updatedAt" = $2 where "tenantId" = $3 and id = $4 returning ${JOURNEY_COLUMNS}`,
    [version, now, user.tenantId, id],
  );
  await createAuditLog(user as any, "CREATE", "MARKETING_JOURNEY_VERSION", id, null, { version }, null);
  return data;
}

export async function listJourneyVersions(user: TenantUser, journeyId: string) {
  if (!user.tenantId) return [];
  await assertTenantModule(user, "JOURNEY_ORCHESTRATION");
  return query<any>(
    `select id, version, "publishNotes", "publishedBy", "publishedAt" from "MarketingJourneyVersion"
     where "tenantId" = $1 and "journeyId" = $2 order by version desc`,
    [user.tenantId, journeyId],
  );
}

// Restoring doesn't rewind "currentVersion" back to N -- MarketingJourneyVersion has a
// unique("journeyId", "version") constraint, and versions published after N still exist,
// so reusing an old number would collide the next time someone publishes. Instead this
// applies version N's snapshot to the live automation and publishes it again as a brand
// new version at the tip (like a git revert, not a git reset) -- full history stays intact
// and monotonic.
export async function restoreJourneyVersion(user: TenantUser, journeyId: string, version: number) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "JOURNEY_ORCHESTRATION", { isPlatformAdmin: user.isPlatformAdmin });
  const journey = await getJourneyForTenant(user, journeyId);
  if (!journey) return null;

  const versionRow = await queryOne<any>(
    `select id, version, "workflowSnapshot" from "MarketingJourneyVersion"
     where "tenantId" = $1 and "journeyId" = $2 and version = $3
     limit 1`,
    [user.tenantId, journeyId, version],
  );
  if (!versionRow) throw new Error("MARKETING_JOURNEY_VERSION_NOT_FOUND");

  await updateAutomationForTenant(user, journey.automationId, { workflow: versionRow.workflowSnapshot });
  const restored = await publishJourneyVersion(user, journeyId, `Restored from version ${version}`);
  await createAuditLog(user as any, "UPDATE", "MARKETING_JOURNEY", journeyId, journey, restored, { restoredFromVersion: version });
  return restored;
}

// --- Audience resolution ---
// Extracted as a journey-specific function rather than reusing marketing-communications.ts's
// inline `resolveAudience` (which is recipient/channel-shaped and Lead-only for SAVED_VIEW)
// -- enrollment just needs record ids, and needs to work for both Lead and Opportunity views.
export async function resolveJourneyAudienceRecordIds(
  user: TenantUser,
  targetModule: JourneyModule,
  audienceType: JourneyAudienceType,
  audienceConfig: Record<string, any>,
  limit = 100
): Promise<{ total: number; recordIds: string[] }> {
  // The audience size and the first `limit` record ids (simulation). Enrolment reads all of it in
  // batches (journeyAudienceBatch).
  const audience = await journeyAudience(user, targetModule, audienceType, audienceConfig);
  const [total, batch] = await Promise.all([countJourneyAudience(user, audience), journeyAudienceBatch(user, audience, null, limit)]);
  return { total, recordIds: batch.ids };
}

// Every record id in a journey-style audience, `batchSize` at a time, in id order (call campaigns
// use this to add their audience; §8 #24: they took the first 500/1,000/5,000).
export async function forEachJourneyAudienceBatch(
  user: TenantUser,
  targetModule: JourneyModule,
  audienceType: JourneyAudienceType,
  audienceConfig: Record<string, any>,
  onBatch: (ids: string[]) => Promise<void>,
  batchSize = 500,
) {
  const audience = await journeyAudience(user, targetModule, audienceType, audienceConfig);
  let afterId: string | null = null;
  while (true) {
    const batch = await journeyAudienceBatch(user, audience, afterId, batchSize);
    if (batch.ids.length) await onBatch(batch.ids);
    if (!batch.lastId) return;
    afterId = batch.lastId;
  }
}

type JourneyAudience =
  | { kind: "ids"; ids: string[] }
  | { kind: "leads"; query: LeadAudienceQuery }
  | { kind: "opportunities"; filters: any[] | null }
  | { kind: "none" };

// Who a journey enrols. A lead list or saved view is read in batches in id order, all of it (§8
// #24: enrolment used to take the first 500 of a lead list and the first 1,000 of a view).
async function journeyAudience(
  user: TenantUser,
  targetModule: JourneyModule,
  audienceType: JourneyAudienceType,
  audienceConfig: Record<string, any>,
): Promise<JourneyAudience> {
  if (!user.tenantId) return { kind: "none" };

  if (audienceType === "MANUAL") {
    const ids = Array.isArray(audienceConfig.recordIds) ? [...new Set<string>(audienceConfig.recordIds.map(String))].sort() : [];
    return { kind: "ids", ids };
  }

  if (audienceType === "LEAD_LIST" && audienceConfig.leadListId && targetModule === "LEAD") {
    const listQuery = await leadAudienceForList(user, String(audienceConfig.leadListId));
    return listQuery ? { kind: "leads", query: listQuery } : { kind: "none" };
  }

  if (audienceType === "SAVED_VIEW" && audienceConfig.savedViewId) {
    const view = await queryOne<any>(
      `select config from "CustomReport" where "tenantId" = $1 and id = $2 and "chartType" = 'SAVED_VIEW' and "deletedAt" is null limit 1`,
      [user.tenantId, String(audienceConfig.savedViewId)],
    );
    const tabs = Array.isArray(view?.config?.tabs) ? view.config.tabs : [];
    const wantModule = targetModule === "OPPORTUNITY" ? "OPPORTUNITIES" : "LEADS";
    const tab = tabs.find((item: any) => String(item.module).toUpperCase() === wantModule);
    // No fallback to tabs[0]: a saved view with no tab for this journey's target module
    // must resolve to "match nothing," not silently fall back to a wrong-module tab
    // (whose filters would then either no-op or, worse, still parse as valid conditions
    // against the wrong table) -- that footgun would mass-enroll (and mass-email, via
    // enrollAudienceIntoJourney) the entire tenant's population for the target module.
    if (!tab) return { kind: "none" };
    // The view's filters exactly as the Smart View applies them (owner and team segments
    // included), and strict: a condition the server can't apply stops the enrolment instead of
    // being skipped, which would enrol -- and message -- more people than the view shows.
    const translated = toServerQuery(wantModule, tab.filters);
    if (!translated.ok) throw Object.assign(new Error("AUDIENCE_FILTER_UNSUPPORTED"), { field: translated.field });
    const filters = translated.group ? [translated.group] : null;
    if (targetModule === "OPPORTUNITY") return { kind: "opportunities", filters };
    return { kind: "leads", query: { filters: filters as any, strictFilters: true } };
  }

  return { kind: "none" };
}

async function countJourneyAudience(user: TenantUser, audience: JourneyAudience) {
  if (audience.kind === "ids") return audience.ids.length;
  if (audience.kind === "leads") return countLeadAudienceForTenant(user, audience.query);
  if (audience.kind === "opportunities") return countOpportunityAudienceForTenant(user, audience.filters as any);
  return 0;
}

// The next `limit` record ids after `afterId`, in id order; `lastId` is null when this is the end.
async function journeyAudienceBatch(user: TenantUser, audience: JourneyAudience, afterId: string | null, limit: number) {
  let ids: string[] = [];
  if (audience.kind === "ids") ids = audience.ids.filter((id) => afterId === null || id > afterId).slice(0, limit);
  else if (audience.kind === "leads") ids = (await listLeadAudiencePageForTenant(user, audience.query, afterId, limit)).map((row: any) => String(row.id));
  else if (audience.kind === "opportunities") ids = await listOpportunityAudienceIdsForTenant(user, audience.filters as any, afterId, limit);
  return { ids, lastId: ids.length === limit ? ids[ids.length - 1] : null };
}

// --- Enrollment ---

// Leaving a journey (exit, conversion, unsubscribe, or being outranked by another journey) stops
// it for that record: the journey automation's scheduled steps still waiting for the record are
// cancelled, so no further journey messages go out. Without this, an exited record kept
// receiving the journey's queued messages. `journeyIds` null means every journey.
export async function cancelPendingJourneyStepsForRecord(tenantId: string, journeyIds: string[] | null, recordType: string, recordId: string) {
  return execute(
    `update "AutomationQueue" q set status = 'CANCELLED', "updatedAt" = now()
     from "MarketingJourney" j
     where q."tenantId" = $1 and j."tenantId" = $1 and q.status = 'PENDING'
       and q."automationId" = j."automationId" and q."entityType" = $2 and q."entityId" = $3
       and ($4::text[] is null or j.id = any($4::text[]))`,
    [tenantId, recordType, recordId, journeyIds],
  );
}

// Collision handling (item 10): a record actively enrolled in journey A cannot also be
// actively enrolled in journey B for the same target module unless B outranks every journey
// it's currently active in. Returns true when this enrollment should proceed. When it
// outranks the rivals, this exits them (status EXITED) rather than leaving both active --
// letting two journeys message the same record concurrently is exactly the fatigue/collision
// problem this item exists to prevent.
async function resolveJourneyEnrollmentCollision(
  user: TenantUser,
  journeyId: string,
  journeyPriority: number,
  targetModule: JourneyModule,
  recordId: string
): Promise<boolean> {
  const rivals = await query<any>(
    `select e.id, e."journeyId", j.priority
     from "MarketingJourneyEnrollment" e
     join "MarketingJourney" j on j.id = e."journeyId"
     where e."tenantId" = $1 and e."recordType" = $2 and e."recordId" = $3
       and e.status = 'ACTIVE' and e."journeyId" <> $4 and j.status = 'ACTIVE'`,
    [user.tenantId, targetModule, recordId, journeyId],
  );
  if (!rivals.length) return true;
  const outranked = rivals.some((rival: any) => Number(rival.priority ?? 0) >= journeyPriority);
  if (outranked) return false;
  for (const rival of rivals) {
    await queryOne(
      `update "MarketingJourneyEnrollment" set status = 'EXITED', "exitedAt" = $1, "exitReason" = 'JOURNEY_PRIORITY_COLLISION' where id = $2`,
      [new Date().toISOString(), rival.id],
    );
    await cancelPendingJourneyStepsForRecord(user.tenantId!, [rival.journeyId], targetModule, recordId);
  }
  return true;
}

// Enrols the whole audience, a batch at a time (§8 #24). Records already enrolled are skipped in
// bulk, so a repeat run only works on new ones. A run that reaches `timeBudgetMs` stops and is
// marked pending; the worker finishes it as the same person (processDueJourneyEnrollmentRefresh).
const ENROLL_BATCH = 200;

export async function enrollAudienceIntoJourney(user: TenantUser, journeyId: string, options: { timeBudgetMs?: number } = {}) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "JOURNEY_ORCHESTRATION", { isPlatformAdmin: user.isPlatformAdmin });
  const journey = await getJourneyForTenant(user, journeyId);
  if (!journey) throw new Error("MARKETING_JOURNEY_NOT_FOUND");
  if (journey.status !== "ACTIVE") throw new Error("MARKETING_JOURNEY_NOT_ACTIVE");

  const timeBudgetMs = options.timeBudgetMs ?? 20_000;
  const startedAt = Date.now();
  const audience = await journeyAudience(user, journey.targetModule, journey.audienceType, journey.audienceConfig);
  const journeyPriority = Number(journey.priority ?? 0);
  let enrolled = 0;
  let skipped = 0;
  let afterId: string | null = null;
  let complete = false;
  while (true) {
    const batch = await journeyAudienceBatch(user, audience, afterId, ENROLL_BATCH);
    if (batch.ids.length) {
      const existing = new Set((await query<{ recordId: string }>(
        `select "recordId" from "MarketingJourneyEnrollment" where "tenantId" = $1 and "journeyId" = $2 and "recordType" = $3 and "recordId" = any($4::text[])`,
        [user.tenantId, journeyId, journey.targetModule, batch.ids],
      )).map((row) => row.recordId));
      skipped += existing.size;

      // The INSERT's own ON CONFLICT DO NOTHING is the real, atomic dedup gate -- the bulk
      // check above only saves work. Two concurrent callers (the continuous-enrollment worker
      // and a manual "Enroll Audience Now" click) could both pass it before either write
      // commits, then both call enrollRecordsInAutomation (which has no idempotency of its own
      // and runs real side effects like sending email) for the same records. Only records this
      // call actually wins the insert race for are passed on.
      const now = new Date().toISOString();
      const newIds: string[] = [];
      for (const recordId of batch.ids) {
        if (existing.has(recordId)) continue;
        const canEnroll = await resolveJourneyEnrollmentCollision(user, journeyId, journeyPriority, journey.targetModule, recordId);
        if (!canEnroll) { skipped += 1; continue; }
        const inserted = await queryOne<{ id: string }>(
          `insert into "MarketingJourneyEnrollment" (id, "tenantId", "journeyId", "recordType", "recordId", status, "enrolledAt")
           values ($1, $2, $3, $4, $5, 'ACTIVE', $6)
           on conflict ("journeyId", "recordType", "recordId") do nothing
           returning id`,
          [randomUUID(), user.tenantId, journeyId, journey.targetModule, recordId, now],
        );
        if (inserted) newIds.push(recordId);
        else skipped += 1;
      }
      if (newIds.length) {
        // At most ENROLL_BATCH (200) here; enrollRecordsInAutomation takes up to 500 at a time.
        await enrollRecordsInAutomation(user, journey.automationId, journey.targetModule, newIds);
        for (const recordId of newIds) {
          await recordAttributionTouch(user, {
            recordType: journey.targetModule,
            recordId,
            channel: "JOURNEY_ENROLLMENT",
            journeyId,
            touchType: "TOUCH",
          });
        }
        enrolled += newIds.length;
      }
    }
    if (!batch.lastId) {
      complete = true;
      break;
    }
    afterId = batch.lastId;
    if (Date.now() - startedAt > timeBudgetMs) break;
  }

  // Not finished: the worker carries on as this person. Finished: nothing pending.
  await execute(
    `update "MarketingJourney" set "enrollmentPending" = $3 where "tenantId" = $1 and id = $2`,
    [user.tenantId, journeyId, complete ? null : { by: user.id, since: new Date().toISOString() }],
  );
  return { enrolled, skipped, complete };
}

export async function listEnrollmentsForJourney(user: TenantUser, journeyId: string) {
  if (!user.tenantId) return [];
  await assertTenantModule(user, "JOURNEY_ORCHESTRATION");
  return query<any>(
    `select id, "recordType", "recordId", status, "enrolledAt", "exitedAt", "exitReason"
     from "MarketingJourneyEnrollment" where "tenantId" = $1 and "journeyId" = $2 order by "enrolledAt" desc`,
    [user.tenantId, journeyId],
  );
}

export async function markEnrollmentStatus(
  user: TenantUser,
  enrollmentId: string,
  status: "EXITED" | "CONVERTED" | "UNSUBSCRIBED",
  exitReason?: string | null
) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "JOURNEY_ORCHESTRATION", { isPlatformAdmin: user.isPlatformAdmin });
  const now = new Date().toISOString();
  const enrollment = await queryOne<any>(
    `update "MarketingJourneyEnrollment"
     set status = $1, "exitedAt" = $2, "exitReason" = $3
     where "tenantId" = $4 and id = $5
     returning id, "journeyId", "recordType", "recordId", status, "enrolledAt", "exitedAt", "exitReason"`,
    [status, now, exitReason ?? null, user.tenantId, enrollmentId],
  );
  if (enrollment) await cancelPendingJourneyStepsForRecord(user.tenantId, [enrollment.journeyId], enrollment.recordType, enrollment.recordId);
  return enrollment;
}

// --- Attribution ---

export async function recordAttributionTouch(
  user: TenantUser,
  input: {
    recordType: JourneyModule;
    recordId: string;
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
    channel: "FORM_SUBMISSION" | "WEBSITE_VISIT" | "JOURNEY_ENROLLMENT" | "MANUAL" | "COMMUNICATION_CLICK" | "OTHER";
    touchType?: "TOUCH" | "CONVERSION";
    journeyId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  if (!user.tenantId) return null;
  return queryOne<any>(
    `insert into "MarketingAttributionTouch"
      (id, "tenantId", "recordType", "recordId", source, medium, campaign, channel, "touchType", "journeyId", metadata, "occurredAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     returning id`,
    [
      randomUUID(), user.tenantId, input.recordType, input.recordId, input.source ?? null, input.medium ?? null,
      input.campaign ?? null, input.channel, input.touchType ?? "TOUCH", input.journeyId ?? null, input.metadata ?? {},
      new Date().toISOString(),
    ],
  );
}

export async function listAttributionTouchesForRecord(user: TenantUser, recordType: JourneyModule, recordId: string) {
  if (!user.tenantId) return [];
  return query<any>(
    `select id, source, medium, campaign, channel, "touchType", "journeyId", "occurredAt"
     from "MarketingAttributionTouch" where "tenantId" = $1 and "recordType" = $2 and "recordId" = $3
     order by "occurredAt" asc`,
    [user.tenantId, recordType, recordId],
  );
}

export type AttributionModel =
  | "FIRST_TOUCH"
  | "LAST_TOUCH"
  | "LINEAR"
  | "U_SHAPED"
  | "W_SHAPED"
  | "TIME_DECAY"
  | "CAMPAIGN_SOURCE_OVERRIDE"
  | "CUSTOM_WEIGHTED";

// Fractional per-touch credit weights (summing to 1) for a single converting record's
// ordered TOUCH-type touches. `touches[n-1]` is the touch immediately preceding conversion.
function computeAttributionWeights(model: AttributionModel, touches: any[], customWeights?: Record<string, number>): number[] {
  const n = touches.length;
  if (n === 0) return [];
  if (n === 1) return [1];

  switch (model) {
    case "LAST_TOUCH": {
      const weights = new Array(n).fill(0);
      weights[n - 1] = 1;
      return weights;
    }
    case "LINEAR":
    case "CAMPAIGN_SOURCE_OVERRIDE":
      return new Array(n).fill(1 / n);
    case "U_SHAPED": {
      if (n === 2) return [0.5, 0.5];
      const middleShare = n > 2 ? 0.2 / (n - 2) : 0;
      const weights = new Array(n).fill(middleShare);
      weights[0] = 0.4;
      weights[n - 1] = 0.4;
      return weights;
    }
    case "W_SHAPED": {
      if (n === 2) return [0.5, 0.5];
      if (n === 3) return [1 / 3, 1 / 3, 1 / 3];
      // No "lead created"/"opportunity created" milestone markers exist on a touch record,
      // so the middle milestone is approximated as the touch nearest the midpoint in
      // sequence -- a documented scope simplification, not a true 3-milestone W-shape.
      const midIndex = Math.floor(n / 2);
      const otherMiddleCount = n - 3;
      const otherShare = otherMiddleCount > 0 ? 0.1 / otherMiddleCount : 0;
      const weights = new Array(n).fill(otherShare);
      weights[0] = 0.3;
      weights[n - 1] = 0.3;
      weights[midIndex] += 0.3;
      return weights;
    }
    case "TIME_DECAY": {
      const halfLifeMs = 7 * 24 * 60 * 60 * 1000;
      const anchor = new Date(touches[n - 1].occurredAt).getTime();
      const raw = touches.map((touch) => Math.pow(2, -(anchor - new Date(touch.occurredAt).getTime()) / halfLifeMs));
      const sum = raw.reduce((a, b) => a + b, 0) || 1;
      return raw.map((value) => value / sum);
    }
    case "CUSTOM_WEIGHTED": {
      const raw = touches.map((touch) => Math.max(0, Number(customWeights?.[touch.channel] ?? 1)));
      const sum = raw.reduce((a, b) => a + b, 0);
      return sum > 0 ? raw.map((value) => value / sum) : new Array(n).fill(1 / n);
    }
    case "FIRST_TOUCH":
    default: {
      const weights = new Array(n).fill(0);
      weights[0] = 1;
      return weights;
    }
  }
}

// Attribution (item 13): FIRST_TOUCH/LAST_TOUCH give a converting record's earliest/latest
// touch full credit; the remaining 6 models split fractional credit across all of a record's
// touches per computeAttributionWeights. `credit` (fractional, summed across records) is the
// real output of the weighted models -- `conversions` (count of converting records that
// touched a given source at all) is kept alongside it for backward compatibility with the
// original FIRST_TOUCH/LAST_TOUCH-only shape.
export async function getAttributionSummaryForTenant(
  user: TenantUser,
  model: AttributionModel = "FIRST_TOUCH",
  customWeights?: Record<string, number>
) {
  if (!user.tenantId) return { model, bySource: [] as Array<{ source: string; conversions: number; credit: number }> };
  const touches = await query<any>(
    `select "recordType", "recordId", source, campaign, channel, "touchType", "occurredAt"
     from "MarketingAttributionTouch" where "tenantId" = $1 order by "occurredAt" asc`,
    [user.tenantId],
  );

  const byRecord = new Map<string, any[]>();
  for (const touch of touches) {
    const key = `${touch.recordType}:${touch.recordId}`;
    const list = byRecord.get(key) ?? [];
    list.push(touch);
    byRecord.set(key, list);
  }

  const sourceCredit = new Map<string, number>();
  const sourceConversions = new Map<string, number>();
  for (const [, recordTouches] of byRecord) {
    const hasConversion = recordTouches.some((touch) => touch.touchType === "CONVERSION");
    if (!hasConversion) continue;
    const touchOnly = recordTouches.filter((touch) => touch.touchType === "TOUCH" && (touch.source || touch.campaign));
    if (!touchOnly.length) continue;

    const groupKeys = touchOnly.map((touch) => (model === "CAMPAIGN_SOURCE_OVERRIDE" ? touch.campaign || touch.source : touch.source) as string);
    const weights = computeAttributionWeights(model, touchOnly, customWeights);
    const creditedSources = new Set<string>();
    for (let i = 0; i < touchOnly.length; i++) {
      const weight = weights[i] ?? 0;
      if (weight <= 0) continue;
      const key = groupKeys[i];
      sourceCredit.set(key, (sourceCredit.get(key) ?? 0) + weight);
      creditedSources.add(key);
    }
    for (const key of creditedSources) sourceConversions.set(key, (sourceConversions.get(key) ?? 0) + 1);
  }

  return {
    model,
    bySource: [...sourceCredit.entries()]
      .map(([source, credit]) => ({ source, conversions: sourceConversions.get(source) ?? 0, credit: Math.round(credit * 10000) / 10000 }))
      .sort((a, b) => b.credit - a.credit),
  };
}

// --- Attribution explorer (gap checklist Module 17, item 13's "attribution explorer") ---
// `getAttributionSummaryForTenant` above computes the correct per-model credit split but
// returns only a flat per-source credit/conversion table -- no ROI, no assisted-conversion
// flag, no ordered touch-path, no revenue. This adds those on top of the same weighting core.
export async function getAttributionExplorerForTenant(
  user: TenantUser,
  model: AttributionModel = "LINEAR",
  customWeights?: Record<string, number>,
  limit = 200,
) {
  const empty = {
    model,
    generatedAt: new Date().toISOString(),
    bySource: [] as Array<{ source: string; conversions: number; credit: number; revenue: number }>,
    byJourney: [] as Array<{ journeyId: string; revenue: number; costBasis: number | null; roi: number | null }>,
    byPartner: [] as Array<{ partner: string; conversions: number; revenue: number }>,
    assistedConversions: 0,
    totalConversions: 0,
    totalRevenue: 0,
    touchPaths: [] as Array<{
      recordType: string;
      recordId: string;
      isAssisted: boolean;
      revenue: number;
      partner: string | null;
      touches: Array<{ source: string | null; campaign: string | null; channel: string; journeyId: string | null; occurredAt: string }>;
    }>,
  };
  if (!user.tenantId) return empty;

  const touches = await query<any>(
    `select "recordType", "recordId", source, campaign, channel, "touchType", "journeyId", "occurredAt"
     from "MarketingAttributionTouch" where "tenantId" = $1 order by "occurredAt" asc`,
    [user.tenantId],
  );
  const byRecord = new Map<string, any[]>();
  for (const touch of touches) {
    const key = `${touch.recordType}:${touch.recordId}`;
    const list = byRecord.get(key) ?? [];
    list.push(touch);
    byRecord.set(key, list);
  }

  // Revenue join: only OPPORTUNITY-type touches carry a real $ figure (won-deal amount, via
  // its stage's isWon flag -- Opportunity has no `status` column). LEAD-type touches have no
  // revenue of their own in this schema; their credit/conversion counts are still included,
  // just with revenue = 0 -- a documented scope simplification, not a missing join.
  const opportunityIds = [...byRecord.keys()]
    .filter((key) => key.startsWith("OPPORTUNITY:"))
    .map((key) => key.split(":")[1]);
  const opportunities = opportunityIds.length
    ? await query<any>(
        `select o.id, o.amount, s."isWon" from "Opportunity" o
         join "StageDefinition" s on s.id = o."stageId"
         where o."tenantId" = $1 and o.id = any($2::text[])`,
        [user.tenantId, opportunityIds],
      )
    : [];
  const revenueByOpportunity = new Map(opportunities.map((o: any) => [o.id, o.isWon ? Number(o.amount ?? 0) : 0]));

  // Gap checklist Module 17, item 7 ("attribution explorer" -- "partner touch paths"). There is
  // no touch-level partner attribute (a touch only ever carries source/campaign/channel) --
  // partner is a whole-RECORD fact, resolved the same way the funnel explorer's PARTNER segment
  // dimension already does: via CommissionLedger (populated only once commission is actually
  // earned on a won deal). Every touch in a converting Opportunity's path gets labeled with that
  // SAME resolved partner, and partner credit below is a plain per-record rollup (one partner
  // per record, not a multi-touch weighted split) -- the chosen attribution model still governs
  // source/campaign credit, but doesn't apply to partner since there's only ever one partner to
  // credit, never several to split between. LEAD-type touches have no partner at all, same as
  // they have no revenue -- partner association only exists at the Opportunity level.
  const partnerNameByOpportunityId = new Map<string, string>();
  if (opportunityIds.length) {
    for (let index = 0; index < opportunityIds.length; index += 100) {
      const chunk = opportunityIds.slice(index, index + 100);
      const partnerRows = await query<{ opportunityId: string; partnerName: string }>(
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
      for (const row of partnerRows) partnerNameByOpportunityId.set(row.opportunityId, row.partnerName);
    }
  }

  // Journey-level cost join for ROI -- `journeyId` is the one real FK a touch carries (recorded
  // by enrollAudienceIntoJourney's own attribution-touch call); touches have no channel field
  // of the EMAIL/WHATSAPP/SMS kind MarketingCostEntry's CHANNEL scope uses, so that scope can't
  // be joined here at all -- only JOURNEY-scoped cost entries have a valid join key.
  const costRows = await query<any>(
    `select "scopeId", "costType", amount from "MarketingCostEntry" where "tenantId" = $1 and "scopeType" = 'JOURNEY'`,
    [user.tenantId],
  );
  const costByJourney = new Map<string, { actual: number; planned: number }>();
  for (const row of costRows) {
    const bucket = costByJourney.get(row.scopeId) ?? { actual: 0, planned: 0 };
    if (row.costType === "ACTUAL_SPEND") bucket.actual += Number(row.amount);
    if (row.costType === "PLANNED_BUDGET") bucket.planned += Number(row.amount);
    costByJourney.set(row.scopeId, bucket);
  }

  const sourceCredit = new Map<string, number>();
  const sourceConversions = new Map<string, number>();
  const sourceRevenue = new Map<string, number>();
  const journeyRevenue = new Map<string, number>();
  const partnerConversions = new Map<string, number>();
  const partnerRevenue = new Map<string, number>();
  const touchPaths: typeof empty.touchPaths = [];
  let assistedConversions = 0;
  let totalConversions = 0;
  let totalRevenue = 0;

  for (const [key, recordTouches] of byRecord) {
    const hasConversion = recordTouches.some((touch) => touch.touchType === "CONVERSION");
    if (!hasConversion) continue;
    const touchOnly = recordTouches.filter((touch) => touch.touchType === "TOUCH" && (touch.source || touch.campaign));
    if (!touchOnly.length) continue;

    const [recordType, recordId] = key.split(":");
    const revenue = recordType === "OPPORTUNITY" ? revenueByOpportunity.get(recordId) ?? 0 : 0;
    const isAssisted = touchOnly.length > 1;
    const partner = recordType === "OPPORTUNITY" ? partnerNameByOpportunityId.get(recordId) ?? "No Partner" : null;

    totalConversions += 1;
    totalRevenue += revenue;
    if (isAssisted) assistedConversions += 1;
    if (partner) {
      partnerConversions.set(partner, (partnerConversions.get(partner) ?? 0) + 1);
      partnerRevenue.set(partner, (partnerRevenue.get(partner) ?? 0) + revenue);
    }

    const groupKeys = touchOnly.map((touch) => (model === "CAMPAIGN_SOURCE_OVERRIDE" ? touch.campaign || touch.source : touch.source) as string);
    const weights = computeAttributionWeights(model, touchOnly, customWeights);
    const creditedSources = new Set<string>();
    for (let i = 0; i < touchOnly.length; i++) {
      const weight = weights[i] ?? 0;
      if (weight <= 0) continue;
      const sourceKey = groupKeys[i];
      sourceCredit.set(sourceKey, (sourceCredit.get(sourceKey) ?? 0) + weight);
      sourceRevenue.set(sourceKey, (sourceRevenue.get(sourceKey) ?? 0) + weight * revenue);
      creditedSources.add(sourceKey);
      const journeyKey = touchOnly[i].journeyId;
      if (journeyKey) journeyRevenue.set(journeyKey, (journeyRevenue.get(journeyKey) ?? 0) + weight * revenue);
    }
    for (const sourceKey of creditedSources) sourceConversions.set(sourceKey, (sourceConversions.get(sourceKey) ?? 0) + 1);

    if (touchPaths.length < limit) {
      touchPaths.push({
        recordType,
        recordId,
        isAssisted,
        revenue,
        partner,
        touches: touchOnly.map((touch) => ({
          source: touch.source,
          campaign: touch.campaign,
          channel: touch.channel,
          journeyId: touch.journeyId,
          occurredAt: touch.occurredAt,
        })),
      });
    }
  }

  return {
    model,
    generatedAt: new Date().toISOString(),
    bySource: [...sourceCredit.entries()]
      .map(([source, credit]) => ({
        source,
        conversions: sourceConversions.get(source) ?? 0,
        credit: Math.round(credit * 10000) / 10000,
        revenue: Math.round((sourceRevenue.get(source) ?? 0) * 100) / 100,
      }))
      .sort((a, b) => b.revenue - a.revenue || b.credit - a.credit),
    byJourney: [...journeyRevenue.entries()].map(([journeyId, revenue]) => {
      const cost = costByJourney.get(journeyId);
      const costBasis = cost ? (cost.actual > 0 ? cost.actual : cost.planned) : null;
      return {
        journeyId,
        revenue: Math.round(revenue * 100) / 100,
        costBasis: costBasis || null,
        roi: costBasis && costBasis > 0 ? Math.round(((revenue - costBasis) / costBasis) * 10000) / 10000 : null,
      };
    }),
    byPartner: [...partnerConversions.entries()]
      .map(([partner, conversions]) => ({
        partner,
        conversions,
        revenue: Math.round((partnerRevenue.get(partner) ?? 0) * 100) / 100,
      }))
      .sort((a, b) => b.revenue - a.revenue || b.conversions - a.conversions),
    assistedConversions,
    totalConversions,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    touchPaths,
  };
}

// --- Preference center ---

export async function getPreferencesForRecord(user: TenantUser, recordType: JourneyModule, recordId: string) {
  if (!user.tenantId) return [];
  return query<any>(
    `select id, topic, "isOptedIn", source, "updatedAt" from "MarketingPreference" where "tenantId" = $1 and "recordType" = $2 and "recordId" = $3`,
    [user.tenantId, recordType, recordId],
  );
}

export async function setPreferenceForRecord(
  tenantId: string,
  recordType: JourneyModule,
  recordId: string,
  topic: string,
  isOptedIn: boolean,
  source?: string | null
) {
  const now = new Date().toISOString();
  const existing = await queryOne<any>(
    `select id from "MarketingPreference" where "tenantId" = $1 and "recordType" = $2 and "recordId" = $3 and topic = $4 limit 1`,
    [tenantId, recordType, recordId, topic],
  );
  if (existing) {
    return queryOne<any>(
      `update "MarketingPreference" set "isOptedIn" = $1, source = $2, "updatedAt" = $3 where id = $4 returning id, topic, "isOptedIn"`,
      [isOptedIn, source ?? null, now, existing.id],
    );
  }
  return queryOne<any>(
    `insert into "MarketingPreference" (id, "tenantId", "recordType", "recordId", topic, "isOptedIn", source, "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $8)
     returning id, topic, "isOptedIn"`,
    [randomUUID(), tenantId, recordType, recordId, topic, isOptedIn, source ?? null, now],
  );
}

// --- Scheduled worker refresh (continuous-enrollment journeys only) ---

// --- Simulation (item 18) ---
// Audience-sampled TEST-mode execution: runs the journey's real workflow (via the same
// executeAutomationWorkflow used by the existing single-record dry-run, which skips action
// nodes in TEST mode) against a sample of the real resolved audience, plus consent/suppression
// explanation, a best-effort token-availability preview, and cross-journey overlap detection.
// Compute-and-return only -- nothing here is persisted.
export async function simulateJourneyAudience(user: TenantUser, journeyId: string, options: { sampleSize?: number } = {}) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "JOURNEY_ORCHESTRATION", { isPlatformAdmin: user.isPlatformAdmin });
  const journey = await getJourneyForTenant(user, journeyId);
  if (!journey) throw new Error("MARKETING_JOURNEY_NOT_FOUND");
  const automation = await getAutomationForTenant(user, journey.automationId);
  if (!automation) throw new Error("MARKETING_JOURNEY_AUTOMATION_NOT_FOUND");

  const sampleSize = Math.min(Math.max(1, Number(options.sampleSize ?? 20)), 100);
  const { total, recordIds } = await resolveJourneyAudienceRecordIds(
    user,
    journey.targetModule,
    journey.audienceType,
    journey.audienceConfig,
    sampleSize
  );

  const workflow = (automation.workflow ?? {}) as { nodes?: any[] };
  const sendNodes = (Array.isArray(workflow.nodes) ? workflow.nodes : []).filter((node: any) => (node?.data?.type ?? node?.type) === "send_email");
  const channelsUsed = [...new Set(sendNodes.map((node: any) => String((node.data ?? node).channel ?? "EMAIL").toUpperCase()))];
  const templateText = sendNodes
    .map((node: any) => `${(node.data ?? node).subject ?? ""}\n${(node.data ?? node).message ?? (node.data ?? node).body ?? ""}`)
    .join("\n");
  const templateTokens = [...new Set([...templateText.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)].map((match) => match[1]))];

  const results: Array<{
    recordId: string;
    log: unknown;
    blocked: Array<{ channel: string; reason: string }>;
    missingTokens: string[];
    overlappingJourneyIds: string[];
  }> = [];
  let blockedCount = 0;
  let overlapCount = 0;

  for (const recordId of recordIds) {
    const record = await loadAutomationTestRecord(user, journey.targetModule, recordId);
    const log = await executeAutomationWorkflow(user, automation, journey.targetModule, recordId, record, "TEST");

    const blocked: Array<{ channel: string; reason: string }> = [];
    for (const channel of channelsUsed) {
      const recipient = channel === "EMAIL" ? String((record as any).email ?? "") : String((record as any).phone ?? "");
      if (!recipient) {
        blocked.push({ channel, reason: "NO_RECIPIENT" });
        continue;
      }
      if (await isSuppressed(user.tenantId, channel as any, recipient)) blocked.push({ channel, reason: "SUPPRESSED" });
      else if (await isOptedOut(user.tenantId, channel as any, journey.targetModule, recordId)) blocked.push({ channel, reason: "OPTED_OUT" });
    }
    if (blocked.length) blockedCount += 1;

    // Best-effort: `token` may be a bare field name or a `module.field` path -- this checks
    // both against the loaded record, not a real template-context resolver.
    const missingTokens = templateTokens.filter((token) => {
      const field = token.includes(".") ? token.split(".").slice(1).join(".") : token;
      const value = (record as any)[field];
      return value === undefined || value === null || value === "";
    });

    const overlapping = await query<any>(
      `select "journeyId" from "MarketingJourneyEnrollment"
       where "tenantId" = $1 and "recordType" = $2 and "recordId" = $3 and status = 'ACTIVE' and "journeyId" <> $4`,
      [user.tenantId, journey.targetModule, recordId, journeyId],
    );
    if (overlapping.length) overlapCount += 1;

    results.push({ recordId, log, blocked, missingTokens, overlappingJourneyIds: overlapping.map((row: any) => row.journeyId) });
  }

  return {
    journeyId,
    audienceTotal: total,
    sampled: recordIds.length,
    channelsUsed,
    summary: { blocked: blockedCount, overlapping: overlapCount },
    results,
  };
}

// --- Operational monitoring (item 19) ---
// AutomationQueue is the real wait-step/retry queue the worker drains (processDueAutomationJobs
// in automations-postgres.ts) -- "stuck" here means a PENDING row overdue by more than 24h.
// Delivery stats are scoped to sends for records currently enrolled in this journey via a join
// on MarketingJourneyEnrollment (a documented approximation: a record enrolled in more than one
// AUTOMATION-sourced flow at once would have its unrelated sends counted too).
export async function getJourneyHealthForTenant(user: TenantUser, journeyId: string) {
  if (!user.tenantId) return null;
  const journey = await getJourneyForTenant(user, journeyId);
  if (!journey) return null;

  const enrollmentCounts = await query<{ status: string; count: number }>(
    `select status, count(*)::int as count from "MarketingJourneyEnrollment" where "tenantId" = $1 and "journeyId" = $2 group by status`,
    [user.tenantId, journeyId],
  );

  const stuckThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const queueStats = await queryOne<{ pending: number; stuck: number; failed: number }>(
    `select
       count(*) filter (where status = 'PENDING')::int as pending,
       count(*) filter (where status = 'PENDING' and "runAt" < $1)::int as stuck,
       count(*) filter (where status = 'FAILED')::int as failed
     from "AutomationQueue"
     where "tenantId" = $2 and "automationId" = $3`,
    [stuckThreshold, user.tenantId, journey.automationId],
  );

  const outboxStats = await queryOne<{ sent: number; failed: number; suppressed: number }>(
    `select
       count(*) filter (where o.status = 'SENT')::int as sent,
       count(*) filter (where o.status = 'FAILED')::int as failed,
       count(*) filter (where o.status = 'SUPPRESSED')::int as suppressed
     from "CommunicationOutbox" o
     join "MarketingJourneyEnrollment" e
       on e."tenantId" = o."tenantId" and e."recordType" = o."entityType" and e."recordId" = o."entityId"
     where o."tenantId" = $1 and o."sourceType" = 'AUTOMATION' and e."journeyId" = $2`,
    [user.tenantId, journeyId],
  );

  const stuck = Number(queueStats?.stuck ?? 0);
  const failedJobs = Number(queueStats?.failed ?? 0);
  const failedSends = Number(outboxStats?.failed ?? 0);
  const totalSends = Number(outboxStats?.sent ?? 0) + failedSends + Number(outboxStats?.suppressed ?? 0);
  const failureRate = totalSends > 0 ? failedSends / totalSends : 0;

  let status: "HEALTHY" | "DEGRADED" | "AT_RISK" = "HEALTHY";
  if (stuck > 0 || failedJobs > 0 || failureRate >= 0.2) status = "AT_RISK";
  else if (failedSends > 0) status = "DEGRADED";

  return {
    journeyId,
    name: journey.name,
    status,
    enrollment: { byStatus: Object.fromEntries(enrollmentCounts.map((row) => [row.status, Number(row.count)])) },
    automationQueue: { pending: Number(queueStats?.pending ?? 0), stuck, failed: failedJobs },
    delivery: { sent: Number(outboxStats?.sent ?? 0), failed: failedSends, suppressed: Number(outboxStats?.suppressed ?? 0) },
  };
}

export async function listJourneyHealthForTenant(user: TenantUser) {
  if (!user.tenantId) return [];
  await assertTenantModule(user, "JOURNEY_ORCHESTRATION");
  const journeys = await query<{ id: string }>(`select id from "MarketingJourney" where "tenantId" = $1 and status = 'ACTIVE'`, [user.tenantId]);
  const results = [];
  for (const row of journeys) {
    const health = await getJourneyHealthForTenant(user, row.id);
    if (health) results.push(health);
  }
  return results;
}

// --- RBAC (item 20) ---
// `role.permissions.modules` is genuinely fetched and attached to every authenticated user
// object (requireCurrentUser/requireTenantAdmin -> getCurrentUserById), just never checked by
// any route before this -- so this reads already-available data rather than needing new
// plumbing. "view"/"export" only need read; "create"/"edit" need their own level (or `manage`);
// approve/launch/pause/overrideSuppression are governance-weight actions gated on `manage`
// specifically, which PermissionMatrix (src/components/roles/permission-matrix.tsx) previously
// never even rendered as a checkbox despite being a valid PermissionAction.
export type JourneyPermissionAction = "view" | "create" | "edit" | "approve" | "launch" | "pause" | "export" | "overrideSuppression";

export function assertJourneyPermission(user: TenantUser, action: JourneyPermissionAction) {
  if (user.isPlatformAdmin || user.isTenantAdmin) return;
  const permissions = user.role && typeof user.role === "object" ? (user.role as any).permissions : null;
  const journeys = permissions?.modules?.journeys;
  if (journeys === "full") return;
  if (journeys && typeof journeys === "object") {
    if ((action === "view" || action === "export") && (journeys.read || journeys.manage)) return;
    if (action === "create" && (journeys.create || journeys.manage)) return;
    if (action === "edit" && (journeys.update || journeys.manage)) return;
    if (["approve", "launch", "pause", "overrideSuppression"].includes(action) && journeys.manage) return;
  }
  throw new Error("FORBIDDEN");
}

// Cross-tenant worker job: notifies each AT_RISK journey's creator, matching the alerting
// pattern already used for stale unassigned cases (alertStaleUnassignedCases).
// WP07 (F04): BACKGROUND_JOB, disposition B -- worker-invoked, cross-tenant by its own comment.
export async function alertDegradedJourneys(limit = 100) {
  const journeys = await queryAsSystem<any>(`select id, "tenantId", name, "createdBy" from "MarketingJourney" where status = 'ACTIVE' limit $1`, [limit]);
  let alerted = 0;
  for (const journey of journeys) {
    const health = await getJourneyHealthForTenant({ id: "journey-health-worker", tenantId: journey.tenantId }, journey.id);
    if (health?.status !== "AT_RISK" || !journey.createdBy) continue;
    await createUserNotification({
      tenantId: journey.tenantId,
      userId: journey.createdBy,
      title: "Marketing journey needs attention",
      message: `Journey "${journey.name}" is AT_RISK -- stuck automation jobs or a high delivery failure rate detected.`,
      data: { entityType: "MARKETING_JOURNEY", entityId: journey.id },
      category: "MARKETING",
    }).catch(() => undefined);
    alerted += 1;
  }
  return { checked: journeys.length, alerted };
}

// WP07 (F04): BACKGROUND_JOB, disposition B -- worker-invoked recurring job, discovers active
// continuous-enrollment journeys across every tenant at once.
// Continuous journeys refresh their enrolment; an "Enroll audience now" that ran out of time
// (enrollmentPending) is finished as the person who started it.
export async function processDueJourneyEnrollmentRefresh() {
  const journeys = await queryAsSystem<any>(
    `select ${JOURNEY_COLUMNS} from "MarketingJourney" where status = 'ACTIVE' and ("continuousEnrollment" = true or "enrollmentPending" is not null)`,
    [],
  );
  let processed = 0;
  for (const journey of journeys) {
    const pendingBy = journey.enrollmentPending?.by ? await getCurrentUserById(String(journey.enrollmentPending.by)) : null;
    const actor = pendingBy && pendingBy.tenantId === journey.tenantId ? (pendingBy as TenantUser) : { id: "journey-worker", tenantId: journey.tenantId };
    await enrollAudienceIntoJourney(actor, journey.id, { timeBudgetMs: 45_000 }).catch(() => undefined);
    processed += 1;
  }
  return { processed };
}
