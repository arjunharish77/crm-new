import { randomUUID } from "crypto";
import { query, queryOne, execute } from "@/lib/db/query";
import { createAuditLog } from "@/lib/server/crm";
import { getEffectiveSecurityPolicy } from "@/lib/server/security-policy";
import { changeTenantStatus, impersonateTenantUser, updatePermissionTemplateForTenant } from "@/lib/server/admin";
import { rotateApiKeyForTenant } from "@/lib/server/api-keys";

export type PrivilegedActionType =
  | "TENANT_SUSPEND"
  | "TENANT_UNSUSPEND"
  | "IMPERSONATION_START"
  | "PERMISSION_TEMPLATE_UPDATE"
  | "CONNECTOR_SECRET_UPDATE"
  | "DISTRIBUTION_REASSIGNMENT"
  | "AI_EXTERNAL_SEND"
  | "CASE_MACRO_EXTERNAL_REPLY";

type TenantUser = { id: string; tenantId: string | null };

// Platform-scoped actions have no tenantId of their own (they're platform-admin actions, not
// bound to a single tenant) -- gated by PlatformSecuritySettings instead of a per-tenant
// SecurityPolicy row.
const PLATFORM_ACTIONS = new Set<PrivilegedActionType>(["TENANT_SUSPEND", "TENANT_UNSUSPEND", "IMPERSONATION_START"]);

export type PrivilegedActionRequestRow = {
  id: string;
  tenantId: string | null;
  actionType: PrivilegedActionType;
  targetType: string;
  targetId: string | null;
  payload: Record<string, unknown>;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED";
  requestedBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  executedAt: string | null;
  createdAt: string;
};

const COLUMNS =
  'id, "tenantId", "actionType", "targetType", "targetId", payload, reason, status, "requestedBy", "decidedBy", "decidedAt", "decisionNote", "executedAt", "createdAt"';

export async function isPrivilegedActionApprovalRequired(actionType: PrivilegedActionType, tenantId: string | null): Promise<boolean> {
  if (PLATFORM_ACTIONS.has(actionType)) {
    const settings = await getPlatformSecuritySettings();
    return settings.privilegedActionApprovalRequired;
  }
  const policy = await getEffectiveSecurityPolicy(tenantId);
  return !!policy.privilegedActionApprovalRequired;
}

export async function getPlatformSecuritySettings() {
  const row = await queryOne<{ privilegedActionApprovalRequired: boolean; updatedBy: string | null; updatedAt: string | null }>(
    `select "privilegedActionApprovalRequired", "updatedBy", "updatedAt" from "PlatformSecuritySettings" where id = 'singleton'`,
  );
  return row ?? { privilegedActionApprovalRequired: false, updatedBy: null, updatedAt: null };
}

export async function updatePlatformSecuritySettings(adminUser: TenantUser, privilegedActionApprovalRequired: boolean) {
  const now = new Date().toISOString();
  await execute(
    `insert into "PlatformSecuritySettings" (id, "privilegedActionApprovalRequired", "updatedBy", "updatedAt")
     values ('singleton', $1, $2, $3)
     on conflict (id) do update set "privilegedActionApprovalRequired" = $1, "updatedBy" = $2, "updatedAt" = $3`,
    [privilegedActionApprovalRequired, adminUser.id, now],
  );
}

export async function createPrivilegedActionRequest(requestedBy: TenantUser, input: {
  tenantId: string | null;
  actionType: PrivilegedActionType;
  targetType: string;
  targetId: string | null;
  payload: Record<string, unknown>;
  reason?: string | null;
}) {
  const id = randomUUID();
  await execute(
    `insert into "PrivilegedActionRequest" (id, "tenantId", "actionType", "targetType", "targetId", payload, reason, status, "requestedBy", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8, $9)`,
    [id, input.tenantId, input.actionType, input.targetType, input.targetId, input.payload, input.reason ?? null, requestedBy.id, new Date().toISOString()],
  );
  await createAuditLog(requestedBy as any, "PRIVILEGED_ACTION_REQUESTED", input.targetType, input.targetId ?? id, null, null, {
    actionType: input.actionType,
    requestId: id,
  }).catch(() => undefined);
  return { id };
}

export async function listPrivilegedActionRequests(scope: { tenantId: string | null }, status?: string) {
  const clauses = [scope.tenantId ? '"tenantId" = $1' : '"tenantId" is null'];
  const params: unknown[] = scope.tenantId ? [scope.tenantId] : [];
  if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  return query<PrivilegedActionRequestRow>(
    `select ${COLUMNS} from "PrivilegedActionRequest" where ${clauses.join(" and ")} order by "createdAt" desc`,
    params,
  );
}

// The actual side effect, run at approval time for every action type except impersonation --
// starting an impersonation session hands back a token that has to go to the ORIGINAL
// requester's browser, not the approver's, so that one is deferred to claimApprovedImpersonation
// below instead of executed here.
async function executeApprovedAction(row: PrivilegedActionRequestRow) {
  switch (row.actionType) {
    case "DISTRIBUTION_REASSIGNMENT": {
      // Dynamic import: distribution-engine.ts imports createPrivilegedActionRequest from this
      // module (to create the approval request in the first place), so a static import back
      // here would be circular -- matches this session's established pattern for this exact
      // shape of dependency.
      const { executeReassignment } = await import("@/lib/server/distribution-engine");
      const payload = row.payload as { entityType: string; entityId: string; newOwnerId: string; reason: string };
      await executeReassignment({ id: row.requestedBy, tenantId: row.tenantId }, payload.entityType, payload.entityId, payload.newOwnerId, payload.reason);
      return;
    }
    case "AI_EXTERNAL_SEND": {
      // Same dynamic-import-to-avoid-circularity reasoning as DISTRIBUTION_REASSIGNMENT above --
      // ai-assistant.ts imports createPrivilegedActionRequest from this module.
      const { executeAiDraftSend } = await import("@/lib/server/ai-assistant");
      const payload = row.payload as { entityType: string; entityId: string; channel: "EMAIL" | "WHATSAPP" | "SMS"; recipient: string; subject?: string; body: string };
      await executeAiDraftSend({ id: row.requestedBy, tenantId: row.tenantId }, payload);
      return;
    }
    case "CASE_MACRO_EXTERNAL_REPLY": {
      // Same dynamic-import reasoning -- case-macros-postgres.ts imports createPrivilegedActionRequest from this module.
      const { executeCaseMacroExternalReply } = await import("@/lib/repositories/case-macros-postgres");
      const payload = row.payload as { caseId: string; channel: "EMAIL" | "WHATSAPP" | "SMS"; recipient: string; subject?: string; body: string };
      await executeCaseMacroExternalReply({ id: row.requestedBy, tenantId: row.tenantId }, payload);
      return;
    }
    case "TENANT_SUSPEND":
      if (row.targetId) await changeTenantStatus(row.targetId, "SUSPENDED");
      return;
    case "TENANT_UNSUSPEND":
      if (row.targetId) await changeTenantStatus(row.targetId, "ACTIVE");
      return;
    case "PERMISSION_TEMPLATE_UPDATE":
      if (row.targetId) await updatePermissionTemplateForTenant(row.tenantId as string, row.targetId, row.payload as any);
      return;
    case "CONNECTOR_SECRET_UPDATE":
      // Scoped to API key rotation in this pass -- see the checklist writeup for the honest
      // scope note on why CommunicationProviderConfig/ExternalIntegration secret changes
      // aren't covered here too.
      if (row.targetType === "API_KEY" && row.targetId) {
        await rotateApiKeyForTenant({ id: row.requestedBy, tenantId: row.tenantId }, row.targetId);
      }
      return;
    case "IMPERSONATION_START":
      return;
  }
}

export async function approvePrivilegedActionRequest(approver: TenantUser, requestId: string) {
  const row = await queryOne<PrivilegedActionRequestRow>(
    `select ${COLUMNS} from "PrivilegedActionRequest" where id = $1 and status = 'PENDING'`,
    [requestId],
  );
  if (!row) throw new Error("REQUEST_NOT_PENDING");
  // The actual point of this control: a second, different person has to sign off. Unlike the
  // import/export approval gates (which don't enforce a distinct approver, since those are
  // about a second look on bulk data operations, not preventing one rogue admin from acting
  // unilaterally), self-approval here would make the whole control theater for exactly the
  // actions it exists to guard (a tenant admin approving their own permission-template change,
  // a platform admin approving their own impersonation request).
  if (row.requestedBy === approver.id) throw new Error("CANNOT_APPROVE_OWN_REQUEST");
  if (row.tenantId && row.tenantId !== approver.tenantId) throw new Error("FORBIDDEN");

  const now = new Date().toISOString();
  if (row.actionType === "IMPERSONATION_START") {
    await execute(`update "PrivilegedActionRequest" set status = 'APPROVED', "decidedBy" = $1, "decidedAt" = $2 where id = $3`, [approver.id, now, requestId]);
  } else {
    await executeApprovedAction(row);
    await execute(
      `update "PrivilegedActionRequest" set status = 'EXECUTED', "decidedBy" = $1, "decidedAt" = $2, "executedAt" = $2 where id = $3`,
      [approver.id, now, requestId],
    );
  }
  await createAuditLog(approver as any, "PRIVILEGED_ACTION_APPROVED", row.targetType, row.targetId ?? requestId, null, null, {
    actionType: row.actionType,
    requestId,
  }).catch(() => undefined);
  return { status: row.actionType === "IMPERSONATION_START" ? "APPROVED" : "EXECUTED" };
}

export async function rejectPrivilegedActionRequest(approver: TenantUser, requestId: string, decisionNote?: string | null) {
  const row = await queryOne<PrivilegedActionRequestRow>(
    `select ${COLUMNS} from "PrivilegedActionRequest" where id = $1 and status = 'PENDING'`,
    [requestId],
  );
  if (!row) throw new Error("REQUEST_NOT_PENDING");
  if (row.requestedBy === approver.id) throw new Error("CANNOT_APPROVE_OWN_REQUEST");
  if (row.tenantId && row.tenantId !== approver.tenantId) throw new Error("FORBIDDEN");

  await execute(
    `update "PrivilegedActionRequest" set status = 'REJECTED', "decidedBy" = $1, "decidedAt" = $2, "decisionNote" = $3 where id = $4`,
    [approver.id, new Date().toISOString(), decisionNote ?? null, requestId],
  );
  await createAuditLog(approver as any, "PRIVILEGED_ACTION_REJECTED", row.targetType, row.targetId ?? requestId, null, null, {
    actionType: row.actionType,
    requestId,
  }).catch(() => undefined);
}

// The requester comes back for their own approved impersonation request once someone else has
// approved it -- this is what actually creates the session/token, scoped to the requester's own
// browser rather than the approver's.
export async function claimApprovedImpersonation(requester: TenantUser, requestId: string) {
  const row = await queryOne<PrivilegedActionRequestRow>(
    `select ${COLUMNS} from "PrivilegedActionRequest" where id = $1 and status = 'APPROVED' and "actionType" = 'IMPERSONATION_START'`,
    [requestId],
  );
  if (!row) throw new Error("REQUEST_NOT_APPROVED");
  if (row.requestedBy !== requester.id) throw new Error("FORBIDDEN");

  const payload = row.payload as { tenantId: string; userId: string; reason: string };
  const result = await impersonateTenantUser(requester.id, payload.tenantId, payload.userId, payload.reason);
  await execute(`update "PrivilegedActionRequest" set status = 'EXECUTED', "executedAt" = $1 where id = $2`, [new Date().toISOString(), requestId]);
  return result;
}
