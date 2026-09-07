import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import { createAuditLog } from "@/lib/server/crm";
import { writePrivateFile, deletePrivateFile } from "@/lib/storage/file-storage";
import { assertAccountActiveForDownload } from "@/lib/server/file-download-guards";
import { assertNotImpersonating } from "@/lib/server/sessions";

type TenantUser = { id: string; tenantId: string | null; isPlatformAdmin?: boolean; isImpersonating?: boolean };

const REQUEST_COLUMNS =
  'id, "tenantId", "requestType", "entityType", "entityId", status, "resultFileObjectId", "resultSummary", error, "requestedBy", "completedAt", "createdAt", "updatedAt"';

export async function listPrivacyRequestsForTenant(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  // Left-joined, not inner -- a completed DELETE request's Lead row is gone by design, so
  // contactEmail is only best-effort (real for EXPORT requests and any DELETE that ended up
  // PARTIAL/FAILED with the Lead still present).
  return query(
    `select pr.id, pr."tenantId", pr."requestType", pr."entityType", pr."entityId", pr.status,
            pr."resultFileObjectId", pr."resultSummary", pr.error, pr."requestedBy", pr."completedAt", pr."createdAt", pr."updatedAt",
            l.email as "contactEmail"
     from "PrivacyRequest" pr
     left join "Lead" l on l.id = pr."entityId" and l."tenantId" = pr."tenantId"
     where pr."tenantId" = $1
     order by pr."createdAt" desc
     limit 100`,
    [user.tenantId],
  );
}

// Public entry point matching how a real Subject Access Request actually arrives -- by the
// requester's email, not an internal record id (the settings UI collects "Contact Email",
// matching the existing, previously-dead GDPR page's own design, which already got this right).
export async function createPrivacyRequestForContact(user: TenantUser, input: { contactEmail?: string; type?: "EXPORT" | "DELETE" }) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const email = input.contactEmail?.trim().toLowerCase();
  if (!email) throw new Error("CONTACT_EMAIL_REQUIRED");
  const requestType = input.type === "DELETE" ? "DELETE" : "EXPORT";

  const lead = await queryOne<{ id: string }>(`select id from "Lead" where "tenantId" = $1 and lower(email) = $2 and "mergedIntoId" is null order by "createdAt" asc limit 1`, [
    user.tenantId,
    email,
  ]);
  if (!lead) throw new Error("NO_MATCHING_RECORD");

  return requestType === "DELETE" ? runPrivacyDeleteForLead(user, lead.id) : runPrivacyExportForLead(user, lead.id);
}

export async function getPrivacyRequestDownload(user: TenantUser, requestId: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertAccountActiveForDownload(user);
  const request = await queryOne<any>(`select * from "PrivacyRequest" where "tenantId" = $1 and id = $2 limit 1`, [user.tenantId, requestId]);
  if (!request) throw new Error("PRIVACY_REQUEST_NOT_FOUND");
  if (!request.resultFileObjectId) throw new Error("PRIVACY_REQUEST_HAS_NO_FILE");
  const file = await queryOne<{ storageKey: string; originalFilename: string; contentType: string }>(
    `select "storageKey", "originalFilename", "contentType" from "FileObject" where "tenantId" = $1 and id = $2 limit 1`,
    [user.tenantId, request.resultFileObjectId],
  );
  if (!file) throw new Error("PRIVACY_REQUEST_HAS_NO_FILE");
  const { readPrivateFile } = await import("@/lib/storage/file-storage");
  const buffer = await readPrivateFile(file.storageKey);
  await createAuditLog(user as any, "DOWNLOAD", "PRIVACY_REQUEST", requestId, null, { filename: file.originalFilename }, null).catch(() => undefined);
  return { filename: file.originalFilename || `${requestId}.json`, contentType: file.contentType || "application/json", buffer };
}

async function insertPrivacyRequest(tenantId: string, requestType: "EXPORT" | "DELETE", entityId: string, requestedBy: string) {
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "PrivacyRequest" (id, "tenantId", "requestType", "entityType", "entityId", status, "requestedBy", "createdAt", "updatedAt")
     values ($1, $2, $3, 'LEAD', $4, 'PROCESSING', $5, $6, $6)
     returning ${REQUEST_COLUMNS}`,
    [randomUUID(), tenantId, requestType, entityId, requestedBy, now],
  );
  if (!row) throw new Error("PRIVACY_REQUEST_INSERT_FAILED");
  return row;
}

async function completeRequest(id: string, patch: { status: "COMPLETED" | "PARTIAL" | "FAILED"; resultFileObjectId?: string | null; resultSummary?: unknown; error?: string | null }) {
  const now = new Date().toISOString();
  return execute(
    `update "PrivacyRequest" set status = $1, "resultFileObjectId" = $2, "resultSummary" = $3, error = $4, "completedAt" = $5, "updatedAt" = $5 where id = $6`,
    [patch.status, patch.resultFileObjectId ?? null, patch.resultSummary ?? null, patch.error ?? null, now, id],
  );
}

// Right-to-access export: bundles everything this app knows about one Lead -- and everything
// tied to its Opportunities -- into a single JSON file. Deliberately NOT reusing the
// module-scoped CSV export pipeline (exports.ts): that system produces one CSV per module per
// request and has no concept of "every module's rows for one specific person," so this is
// new, purpose-built orchestration rather than a CSV-shaped export.
export async function runPrivacyExportForLead(user: TenantUser, leadId: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const tenantId = user.tenantId;
  const lead = await queryOne<any>(`select * from "Lead" where "tenantId" = $1 and id = $2 limit 1`, [tenantId, leadId]);
  if (!lead) throw new Error("LEAD_NOT_FOUND");

  const request = await insertPrivacyRequest(tenantId, "EXPORT", leadId, user.id);

  try {
    const opportunities = await query<any>(`select * from "Opportunity" where "tenantId" = $1 and "leadId" = $2`, [tenantId, leadId]);
    const opportunityIds = opportunities.map((o) => o.id);

    const [activities, tasks, notesLead, notesOpps, consent, consentHistory, emailLogsLead, emailLogsOpps, outboxLead, outboxOpps, fileObjectsLead, fileObjectsOpps] = await Promise.all([
      query<any>(`select * from "Activity" where "tenantId" = $1 and ("leadId" = $2 or "opportunityId" = any($3::text[]))`, [tenantId, leadId, opportunityIds]),
      query<any>(`select * from "Task" where "tenantId" = $1 and ("leadId" = $2 or "opportunityId" = any($3::text[]))`, [tenantId, leadId, opportunityIds]),
      query<any>(`select * from "Note" where "tenantId" = $1 and "entityType" = 'LEAD' and "entityId" = $2`, [tenantId, leadId]),
      query<any>(`select * from "Note" where "tenantId" = $1 and "entityType" = 'OPPORTUNITY' and "entityId" = any($2::text[])`, [tenantId, opportunityIds]),
      query<any>(`select * from "CommunicationConsent" where "tenantId" = $1 and "entityType" = 'LEAD' and "entityId" = $2`, [tenantId, leadId]),
      query<any>(`select * from "CommunicationConsentHistory" where "tenantId" = $1 and "entityType" = 'LEAD' and "entityId" = $2 order by "createdAt" desc`, [tenantId, leadId]),
      query<any>(`select * from "EmailLog" where "tenantId" = $1 and "entityType" = 'LEAD' and "entityId" = $2`, [tenantId, leadId]),
      query<any>(`select * from "EmailLog" where "tenantId" = $1 and "entityType" = 'OPPORTUNITY' and "entityId" = any($2::text[])`, [tenantId, opportunityIds]),
      query<any>(`select * from "CommunicationOutbox" where "tenantId" = $1 and "entityType" = 'LEAD' and "entityId" = $2`, [tenantId, leadId]),
      query<any>(`select * from "CommunicationOutbox" where "tenantId" = $1 and "entityType" = 'OPPORTUNITY' and "entityId" = any($2::text[])`, [tenantId, opportunityIds]),
      query<any>(`select id, "originalFilename", "contentType", "byteSize", "createdAt" from "FileObject" where "tenantId" = $1 and "entityType" = 'LEAD' and "entityId" = $2`, [tenantId, leadId]),
      query<any>(`select id, "originalFilename", "contentType", "byteSize", "createdAt" from "FileObject" where "tenantId" = $1 and "entityType" = 'OPPORTUNITY' and "entityId" = any($2::text[])`, [tenantId, opportunityIds]),
    ]);

    const suppressionAddresses = [lead.email, lead.phone].filter(Boolean);
    const suppressions = suppressionAddresses.length
      ? await query<any>(`select * from "CommunicationSuppression" where "tenantId" = $1 and address = any($2::text[])`, [tenantId, suppressionAddresses])
      : [];

    const bundle = {
      exportedAt: new Date().toISOString(),
      lead,
      opportunities,
      activities,
      tasks,
      notes: [...notesLead, ...notesOpps],
      communicationConsent: consent,
      communicationConsentHistory: consentHistory,
      communicationSuppressions: suppressions,
      emailLogs: [...emailLogsLead, ...emailLogsOpps],
      communicationOutbox: [...outboxLead, ...outboxOpps],
      attachments: [...fileObjectsLead, ...fileObjectsOpps],
    };

    const json = JSON.stringify(bundle, null, 2);
    const filename = `privacy-export-${leadId}-${Date.now()}.json`;
    const storageKey = `privacy-exports/${tenantId}/${request.id}/${filename}`;
    const stored = await writePrivateFile(storageKey, Buffer.from(json, "utf8"), { bucket: "privacy-exports", contentType: "application/json" });

    const fileObjectId = randomUUID();
    const now = new Date().toISOString();
    await execute(
      `insert into "FileObject"
        (id, "tenantId", "storageDriver", bucket, "storageKey", "originalFilename", "contentType", "byteSize", checksum, "entityType", "entityId", visibility, metadata, "createdBy", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PRIVACY_REQUEST', $10, 'PRIVATE', $11, $12, $13, $13)`,
      [fileObjectId, tenantId, stored.driver, stored.bucket, stored.storageKey, filename, stored.contentType, stored.byteSize, stored.checksum, request.id, {}, user.id, now],
    );

    const summary = {
      opportunities: opportunities.length,
      activities: bundle.activities.length,
      tasks: tasks.length,
      notes: bundle.notes.length,
      communicationRecords: bundle.emailLogs.length + bundle.communicationOutbox.length,
      attachments: bundle.attachments.length,
    };
    await completeRequest(request.id, { status: "COMPLETED", resultFileObjectId: fileObjectId, resultSummary: summary });
    await createAuditLog(user as any, "EXPORT", "PRIVACY_REQUEST", request.id, null, summary, { entityType: "LEAD", entityId: leadId }).catch(() => undefined);

    return { requestId: request.id, status: "COMPLETED", summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await completeRequest(request.id, { status: "FAILED", error: message });
    throw error;
  }
}

// Right-to-delete: hard-deletes everything that can safely be deleted (no other row's FK
// depends on it), in dependency order, and anonymizes-by-deletion the communication records
// tied to this person. What it does NOT force through: Opportunity/Lead rows blocked by a
// RESTRICT foreign key it can't safely ignore (e.g. a commission ledger entry referencing the
// Opportunity -- CommissionLedger is enforced append-only by DB trigger and is exactly the
// kind of settled financial record real-world erasure requests are routinely allowed to
// exclude). Reported honestly as PARTIAL with the specific blocking reason, rather than
// silently succeeding or throwing an opaque 500.
export async function runPrivacyDeleteForLead(user: TenantUser, leadId: string) {
  assertNotImpersonating(user, "privacy_delete");
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const tenantId = user.tenantId;
  const lead = await queryOne<any>(`select * from "Lead" where "tenantId" = $1 and id = $2 limit 1`, [tenantId, leadId]);
  if (!lead) throw new Error("LEAD_NOT_FOUND");

  const request = await insertPrivacyRequest(tenantId, "DELETE", leadId, user.id);

  try {
    const opportunities = await query<{ id: string }>(`select id from "Opportunity" where "tenantId" = $1 and "leadId" = $2`, [tenantId, leadId]);
    const opportunityIds = opportunities.map((o) => o.id);

    const deletedCounts: Record<string, number> = {};
    deletedCounts.tasks = await execute(`delete from "Task" where "tenantId" = $1 and ("leadId" = $2 or "opportunityId" = any($3::text[]))`, [tenantId, leadId, opportunityIds]);
    deletedCounts.activities = await execute(`delete from "Activity" where "tenantId" = $1 and ("leadId" = $2 or "opportunityId" = any($3::text[]))`, [tenantId, leadId, opportunityIds]);
    deletedCounts.notes =
      (await execute(`delete from "Note" where "tenantId" = $1 and "entityType" = 'LEAD' and "entityId" = $2`, [tenantId, leadId])) +
      (await execute(`delete from "Note" where "tenantId" = $1 and "entityType" = 'OPPORTUNITY' and "entityId" = any($2::text[])`, [tenantId, opportunityIds]));
    deletedCounts.opportunityStageHistory = await execute(`delete from "OpportunityStageHistory" where "tenantId" = $1 and "opportunityId" = any($2::text[])`, [tenantId, opportunityIds]);
    deletedCounts.formSubmissions = await execute(`delete from "FormSubmission" where "tenantId" = $1 and "leadId" = $2`, [tenantId, leadId]);
    deletedCounts.leadListMemberships = await execute(`delete from "LeadListMember" where "tenantId" = $1 and "leadId" = $2`, [tenantId, leadId]);
    deletedCounts.recordScores =
      (await execute(`delete from "RecordScore" where "tenantId" = $1 and "recordType" = 'LEAD' and "recordId" = $2`, [tenantId, leadId])) +
      (await execute(`delete from "RecordScore" where "tenantId" = $1 and "recordType" = 'OPPORTUNITY' and "recordId" = any($2::text[])`, [tenantId, opportunityIds]));
    deletedCounts.recordScoreHistory =
      (await execute(`delete from "RecordScoreHistory" where "tenantId" = $1 and "recordType" = 'LEAD' and "recordId" = $2`, [tenantId, leadId])) +
      (await execute(`delete from "RecordScoreHistory" where "tenantId" = $1 and "recordType" = 'OPPORTUNITY' and "recordId" = any($2::text[])`, [tenantId, opportunityIds]));

    const fileObjects = await query<{ id: string; storageKey: string | null }>(
      `select id, "storageKey" from "FileObject" where "tenantId" = $1 and (("entityType" = 'LEAD' and "entityId" = $2) or ("entityType" = 'OPPORTUNITY' and "entityId" = any($3::text[])))`,
      [tenantId, leadId, opportunityIds],
    );
    for (const file of fileObjects) {
      if (file.storageKey) await deletePrivateFile(file.storageKey).catch(() => undefined);
    }
    deletedCounts.attachments = await execute(
      `delete from "FileObject" where "tenantId" = $1 and (("entityType" = 'LEAD' and "entityId" = $2) or ("entityType" = 'OPPORTUNITY' and "entityId" = any($3::text[])))`,
      [tenantId, leadId, opportunityIds],
    );

    deletedCounts.emailLogs =
      (await execute(`delete from "EmailLog" where "tenantId" = $1 and "entityType" = 'LEAD' and "entityId" = $2`, [tenantId, leadId])) +
      (await execute(`delete from "EmailLog" where "tenantId" = $1 and "entityType" = 'OPPORTUNITY' and "entityId" = any($2::text[])`, [tenantId, opportunityIds]));
    deletedCounts.communicationOutbox =
      (await execute(`delete from "CommunicationOutbox" where "tenantId" = $1 and "entityType" = 'LEAD' and "entityId" = $2`, [tenantId, leadId])) +
      (await execute(`delete from "CommunicationOutbox" where "tenantId" = $1 and "entityType" = 'OPPORTUNITY' and "entityId" = any($2::text[])`, [tenantId, opportunityIds]));
    deletedCounts.consent = await execute(`delete from "CommunicationConsent" where "tenantId" = $1 and "entityType" = 'LEAD' and "entityId" = $2`, [tenantId, leadId]);
    deletedCounts.consentHistory = await execute(`delete from "CommunicationConsentHistory" where "tenantId" = $1 and "entityType" = 'LEAD' and "entityId" = $2`, [tenantId, leadId]);
    const suppressionAddresses = [lead.email, lead.phone].filter(Boolean);
    deletedCounts.suppressions = suppressionAddresses.length
      ? await execute(`delete from "CommunicationSuppression" where "tenantId" = $1 and address = any($2::text[])`, [tenantId, suppressionAddresses])
      : 0;

    let blockedReason: string | null = null;
    let opportunitiesDeleted = 0;
    for (const oppId of opportunityIds) {
      try {
        opportunitiesDeleted += await execute(`delete from "Opportunity" where "tenantId" = $1 and id = $2`, [tenantId, oppId]);
      } catch (error) {
        blockedReason = `Opportunity ${oppId} could not be deleted (${error instanceof Error ? error.message : "referenced by other records"}); its child data was still removed.`;
      }
    }
    deletedCounts.opportunities = opportunitiesDeleted;

    let leadDeleted = false;
    if (opportunitiesDeleted === opportunityIds.length) {
      try {
        await execute(`delete from "Lead" where "tenantId" = $1 and id = $2`, [tenantId, leadId]);
        leadDeleted = true;
      } catch (error) {
        blockedReason = `Lead could not be deleted (${error instanceof Error ? error.message : "referenced by other records"}).`;
      }
    } else {
      blockedReason = blockedReason ?? "One or more Opportunities could not be deleted, so the Lead itself was kept to avoid an orphaned reference.";
    }

    // Deliberately does not log the deleted data itself (that would defeat the point of an
    // erasure request) -- only that a deletion happened, by whom, and what (if anything) was
    // held back.
    await createAuditLog(user as any, "DELETE", "PRIVACY_REQUEST", request.id, null, null, {
      entityType: "LEAD",
      entityId: leadId,
      leadDeleted,
      deletedCounts,
      blockedReason,
    }).catch(() => undefined);

    const status = leadDeleted && !blockedReason ? "COMPLETED" : "PARTIAL";
    await completeRequest(request.id, { status, resultSummary: { leadDeleted, ...deletedCounts }, error: blockedReason });
    return { requestId: request.id, status, leadDeleted, deletedCounts, blockedReason };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await completeRequest(request.id, { status: "FAILED", error: message });
    throw error;
  }
}
