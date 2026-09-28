import { randomUUID } from "crypto";
import { execute, query, queryOne, jsonbParam } from "@/lib/db/query";
import { assertModuleEnabled } from "@/lib/server/module-entitlements";
import { addCommentToCase } from "@/lib/repositories/cases-postgres";
import { queueCommunicationForTenant, renderTemplate } from "@/lib/server/communications";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isPlatformAdmin?: boolean;
};

function requireTenantId(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return user.tenantId;
}

async function assertServiceDeskEnabled(user: TenantUser) {
  const tenantId = requireTenantId(user);
  await assertModuleEnabled(tenantId, "SERVICE_DESK", { isPlatformAdmin: user.isPlatformAdmin });
  return tenantId;
}

const MACRO_COLUMNS =
  'id, "tenantId", name, description, channel, "bodyTemplate", "isInternalNote", "requiresApprovalForExternalReply", "restrictedToRoleIds", "isActive", "createdBy", "updatedBy", "createdAt", "updatedAt"';

export async function listCaseMacrosForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  return query<any>(`select ${MACRO_COLUMNS} from "CaseMacro" where "tenantId" = $1 order by name asc`, [tenantId]);
}

export async function getCaseMacroForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  return queryOne<any>(`select ${MACRO_COLUMNS} from "CaseMacro" where "tenantId" = $1 and id = $2`, [tenantId, id]);
}

export async function createCaseMacroForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = await assertServiceDeskEnabled(user);
  if (!String(input.name ?? "").trim()) throw new Error("CASE_MACRO_NAME_REQUIRED");
  if (!String(input.bodyTemplate ?? "").trim()) throw new Error("CASE_MACRO_BODY_REQUIRED");
  const now = new Date().toISOString();
  return queryOne<any>(
    `insert into "CaseMacro" (id, "tenantId", name, description, channel, "bodyTemplate", "isInternalNote", "requiresApprovalForExternalReply", "restrictedToRoleIds", "isActive", "createdBy", "updatedBy", "createdAt", "updatedAt")
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$10,$11,$11) returning ${MACRO_COLUMNS}`,
    [
      randomUUID(), tenantId, String(input.name).trim(), input.description ? String(input.description) : null,
      input.channel ? String(input.channel) : null, String(input.bodyTemplate),
      input.isInternalNote !== false, input.requiresApprovalForExternalReply === true,
      jsonbParam(Array.isArray(input.restrictedToRoleIds) ? input.restrictedToRoleIds : []), user.id, now,
    ],
  );
}

export async function updateCaseMacroForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  const tenantId = await assertServiceDeskEnabled(user);
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString(), updatedBy: user.id };
  for (const key of ["name", "description", "channel", "bodyTemplate", "isInternalNote", "requiresApprovalForExternalReply", "restrictedToRoleIds", "isActive"] as const) {
    if (input[key] === undefined) continue;
    // "restrictedToRoleIds" is a jsonb column storing an array -- a raw array parameter would
    // be misserialized by node-postgres (see jsonbParam's own doc comment in db/query.ts).
    patch[key] = key === "restrictedToRoleIds" ? jsonbParam(Array.isArray(input[key]) ? input[key] : []) : input[key];
  }
  const columns = Object.keys(patch);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  return queryOne<any>(
    `update "CaseMacro" set ${assignments} where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2} returning ${MACRO_COLUMNS}`,
    [...columns.map((column) => patch[column]), tenantId, id],
  );
}

export async function deleteCaseMacroForTenant(user: TenantUser, id: string) {
  const tenantId = await assertServiceDeskEnabled(user);
  await execute('delete from "CaseMacro" where "tenantId" = $1 and id = $2', [tenantId, id]);
}

// Role-scoped access (checklist item 10) -- an empty restrictedToRoleIds means usable by every
// internal user; otherwise the caller's roleId must be in the list. Matches this codebase's
// existing posture of simple allow-list checks rather than a dedicated permission level.
function canUseMacro(macro: any, user: TenantUser & { roleId?: string | null }) {
  const restricted: string[] = Array.isArray(macro.restrictedToRoleIds) ? macro.restrictedToRoleIds : [];
  if (restricted.length === 0) return true;
  return !!user.roleId && restricted.includes(user.roleId);
}

// Applying a macro renders its template against the case, then posts it exactly like a human
// typing the same text would: an internal note goes straight through addCommentToCase; an
// EXTERNAL reply additionally sends the real message via the existing CommunicationOutbox
// pipeline, gated by the same PrivilegedActionRequest approval mechanism AI-drafted sends use
// (Module 7) when the macro is configured to require it -- one governed external-send pattern
// reused for both AI-generated and macro-generated replies, not two parallel ones.
export async function applyCaseMacro(user: TenantUser & { roleId?: string | null }, caseId: string, macroId: string) {
  const tenantId = await assertServiceDeskEnabled(user);
  const macro = await getCaseMacroForTenant(user, macroId);
  if (!macro) throw new Error("CASE_MACRO_NOT_FOUND");
  if (!macro.isActive) throw new Error("CASE_MACRO_INACTIVE");
  if (!canUseMacro(macro, user)) throw new Error("CASE_MACRO_NOT_PERMITTED");

  const caseRow = await queryOne<any>('select * from "Case" where "tenantId" = $1 and id = $2', [tenantId, caseId]);
  if (!caseRow) throw new Error("CASE_NOT_FOUND");

  const body = renderTemplate(macro.bodyTemplate, {
    caseNumber: caseRow.caseNumber, subject: caseRow.subject, requesterName: caseRow.requesterName ?? "",
  });

  if (macro.isInternalNote) {
    return addCommentToCase(user, caseId, { body, isInternal: true }).then((comment) => ({ comment, sent: null }));
  }

  const comment = await addCommentToCase(user, caseId, { body, isInternal: false });

  if (!macro.channel || (!caseRow.requesterEmail && !caseRow.requesterPhone)) {
    return { comment, sent: null };
  }
  const recipient = macro.channel === "EMAIL" ? caseRow.requesterEmail : caseRow.requesterPhone;
  if (!recipient) return { comment, sent: null };

  if (macro.requiresApprovalForExternalReply) {
    const { createPrivilegedActionRequest } = await import("@/lib/server/privileged-actions");
    const { id: requestId } = await createPrivilegedActionRequest(user, {
      tenantId,
      actionType: "CASE_MACRO_EXTERNAL_REPLY",
      targetType: "CASE",
      targetId: caseId,
      payload: { caseId, channel: macro.channel, recipient, subject: `Re: Case #${caseRow.caseNumber} ${caseRow.subject}`, body },
      reason: `Macro "${macro.name}" external reply`,
    });
    return { comment, sent: { pendingApproval: true, requestId } };
  }

  const outcome = await queueCommunicationForTenant(user, {
    channel: macro.channel, recipient, subject: `Re: Case #${caseRow.caseNumber} ${caseRow.subject}`, body,
    sourceType: "CASE_MACRO", sourceId: macroId, entityType: "CASE", entityId: caseId,
  });
  return { comment, sent: outcome };
}

// Invoked from privileged-actions.ts's approval-execution switch once a second admin approves
// a CASE_MACRO_EXTERNAL_REPLY request -- the actual send, factored out so both the immediate
// and approval-gated paths share it, mirroring executeAiDraftSend/executeReassignment.
export async function executeCaseMacroExternalReply(
  actor: TenantUser,
  payload: { caseId: string; channel: "EMAIL" | "WHATSAPP" | "SMS"; recipient: string; subject?: string; body: string },
) {
  return queueCommunicationForTenant(actor, {
    channel: payload.channel, recipient: payload.recipient, subject: payload.subject ?? null, body: payload.body,
    sourceType: "CASE_MACRO", sourceId: null, entityType: "CASE", entityId: payload.caseId,
  });
}
