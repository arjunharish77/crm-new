import { randomUUID } from "crypto";
import { appBaseUrlString } from "@/lib/app-url";
import { execute, query, queryOne, queryAsSystem } from "@/lib/db/query";
import { assertModuleEnabled, isModuleEnabledForTenant } from "@/lib/server/module-entitlements";
import { createUserNotification } from "@/lib/server/notifications";
import { requireTenantId } from "@/lib/server/tenant-guard";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isPlatformAdmin?: boolean;
};

// Low-score threshold below which a response triggers manager escalation (checklist item 15's
// "low-score escalation") -- 1-5 scale, matching the CHECK constraint on CaseSurveyResponse.score.
const LOW_SCORE_THRESHOLD = 2;

// Identified by its own row id, the same "the id itself is the unguessable token" convention
// the existing unsubscribe-link flow already uses (CommunicationOutbox.id as its own token) --
// no separate signed-token scheme exists anywhere else in this codebase's public routes to
// reuse instead.
export async function getCaseSurveyForPublic(id: string) {
  const row = await queryOne<any>(
    `select r.id, r."tenantId", r."caseId", r.channel, r."sentAt", r."respondedAt", r.score, r.comment, c."caseNumber", c.subject
     from "CaseSurveyResponse" r join "Case" c on c.id = r."caseId" and c."tenantId" = r."tenantId"
     where r.id = $1`,
    [id],
  );
  if (!row) return null;
  // A survey link for a tenant whose Service Desk is off is treated like an unknown link.
  if (!(await isModuleEnabledForTenant(row.tenantId, "SERVICE_DESK"))) return null;
  const { tenantId: _tenantId, ...survey } = row;
  return survey;
}

export async function submitCaseSurveyResponse(id: string, input: { score: number; comment?: string | null }) {
  const existing = await queryOne<any>('select * from "CaseSurveyResponse" where id = $1', [id]);
  if (!existing) throw new Error("CASE_SURVEY_NOT_FOUND");
  if (!(await isModuleEnabledForTenant(existing.tenantId, "SERVICE_DESK"))) throw new Error("CASE_SURVEY_NOT_FOUND");
  if (existing.respondedAt) throw new Error("CASE_SURVEY_ALREADY_SUBMITTED");
  if (!Number.isFinite(input.score) || input.score < 1 || input.score > 5) throw new Error("CASE_SURVEY_SCORE_INVALID");

  const now = new Date().toISOString();
  const updated = await queryOne<any>(
    `update "CaseSurveyResponse" set "respondedAt" = $1, score = $2, comment = $3 where id = $4 returning *`,
    [now, Math.round(input.score), input.comment?.trim() || null, id],
  );

  if (updated) {
    const caseRow = await queryOne<{ tenantId: string }>('select "tenantId" from "Case" where id = $1', [updated.caseId]);
    if (caseRow) {
      const { runAutomationsForEvent } = await import("@/lib/repositories/automations-postgres");
      await runAutomationsForEvent({ id: "system", tenantId: caseRow.tenantId }, "CASE_SATISFACTION_SUBMITTED", "CASE", updated.caseId, updated).catch(() => undefined);
    }
  }

  if (updated && updated.score <= LOW_SCORE_THRESHOLD) {
    await escalateLowScoreSurvey(updated).catch(() => undefined);
  }
  return updated;
}

async function escalateLowScoreSurvey(response: any) {
  const caseRow = await queryOne<any>('select "tenantId", "caseNumber", subject, "ownerId" from "Case" where id = $1', [response.caseId]);
  if (!caseRow) return;
  if (!(await isModuleEnabledForTenant(caseRow.tenantId, "SERVICE_DESK"))) return;

  const targets = new Set<string>();
  if (caseRow.ownerId) {
    targets.add(caseRow.ownerId);
    const owner = await queryOne<{ managerId: string | null }>('select "managerId" from "User" where id = $1', [caseRow.ownerId]);
    if (owner?.managerId) targets.add(owner.managerId);
  }
  for (const userId of targets) {
    await createUserNotification({
      tenantId: caseRow.tenantId,
      userId,
      title: "Low satisfaction score received",
      message: `Case #${caseRow.caseNumber} "${caseRow.subject}" received a satisfaction score of ${response.score}/5.`,
      data: { entityType: "CASE", entityId: response.caseId, caseId: response.caseId },
      category: "CASES",
    }).catch(() => undefined);
  }
}

// Worker job (checklist item 20): dispatches a survey for every recently-resolved case that
// hasn't already been sent one. Scoped to cases resolved in the last 3 days rather than an
// unbounded scan, matching this codebase's other worker jobs' bounded-lookback convention.
// WP07 (F04): BACKGROUND_JOB, disposition B -- worker-invoked recurring job, discovers
// recently-resolved cases across every tenant at once.
export async function dispatchCaseSurveys(limit = 100, now = new Date()) {
  const lookbackIso = new Date(now.getTime() - 3 * 24 * 60 * 60_000).toISOString();
  const candidates = await queryAsSystem<any>(
    `select c.id, c."tenantId", c."caseNumber", c.subject, c."requesterEmail", c."requesterPhone", c."resolvedAt"
     from "Case" c
     where c."resolvedAt" is not null and c."resolvedAt" >= $1
       and not exists (select 1 from "CaseSurveyResponse" r where r."caseId" = c.id)
     order by c."resolvedAt" asc limit $2`,
    [lookbackIso, limit],
  );

  let sent = 0;
  for (const caseRow of candidates) {
    if (!(await isModuleEnabledForTenant(caseRow.tenantId, "SERVICE_DESK"))) continue;
    const channel = caseRow.requesterEmail ? "EMAIL" : caseRow.requesterPhone ? "SMS" : null;
    const recipient = caseRow.requesterEmail || caseRow.requesterPhone;
    if (!channel || !recipient) continue;

    const responseId = randomUUID();
    const nowIso = new Date().toISOString();
    await execute(
      `insert into "CaseSurveyResponse" (id, "tenantId", "caseId", channel, "sentAt", "createdAt") values ($1,$2,$3,$4,$5,$5)`,
      [responseId, caseRow.tenantId, caseRow.id, channel, nowIso],
    );

    const { queueCommunicationForTenant } = await import("@/lib/server/communications");
    // APP_URL like every other emailed link (APP_PUBLIC_URL was never set, so the link was relative).
    const surveyUrl = `${appBaseUrlString()}/case-survey/${responseId}`;
    await queueCommunicationForTenant({ id: "system", tenantId: caseRow.tenantId }, {
      channel,
      recipient,
      subject: `How did we do? Case #${caseRow.caseNumber}`,
      body: `We recently resolved your case "${caseRow.subject}". Please rate your experience: ${surveyUrl}`,
      sourceType: "CASE_SURVEY",
      sourceId: responseId,
      entityType: "CASE",
      entityId: caseRow.id,
    }).catch(() => undefined);
    sent += 1;
  }
  return { sent };
}

export async function listCaseSurveyResponsesForTenant(user: TenantUser, caseId?: string) {
  const tenantId = requireTenantId(user);
  await assertModuleEnabled(tenantId, "SERVICE_DESK", { isPlatformAdmin: user.isPlatformAdmin });
  const clauses = ['"tenantId" = $1'];
  const values: unknown[] = [tenantId];
  if (caseId) {
    values.push(caseId);
    clauses.push(`"caseId" = $${values.length}`);
  }
  return query<any>(`select * from "CaseSurveyResponse" where ${clauses.join(" and ")} order by "sentAt" desc`, values);
}
