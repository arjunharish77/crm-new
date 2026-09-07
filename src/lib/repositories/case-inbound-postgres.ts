import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import { assertModuleEnabled, isModuleEnabledForTenant } from "@/lib/server/module-entitlements";
import { createCaseForTenant, addCommentToCase } from "@/lib/repositories/cases-postgres";
import { writePrivateFile } from "@/lib/storage/file-storage";
import { upsertFileObjectForTenant } from "@/lib/repositories/files-postgres";

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

// ─── Inbound address configuration (settings item 19's "inbound addresses/channels") ──────

const ADDRESS_COLUMNS = 'id, "tenantId", channel, address, "defaultQueueId", "defaultCaseTypeId", "autoAckMacroId", "isActive", "createdAt", "updatedAt"';

export async function listCaseInboundAddressesForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  return query<any>(`select ${ADDRESS_COLUMNS} from "CaseInboundAddress" where "tenantId" = $1 order by channel asc, address asc`, [tenantId]);
}

export async function createCaseInboundAddressForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = await assertServiceDeskEnabled(user);
  if (!input.address || !String(input.address).trim()) throw new Error("CASE_INBOUND_ADDRESS_REQUIRED");
  const now = new Date().toISOString();
  return queryOne<any>(
    `insert into "CaseInboundAddress" (id, "tenantId", channel, address, "defaultQueueId", "defaultCaseTypeId", "autoAckMacroId", "isActive", "createdAt", "updatedAt")
     values ($1,$2,$3,$4,$5,$6,$7,true,$8,$8) returning ${ADDRESS_COLUMNS}`,
    [
      randomUUID(), tenantId, input.channel ? String(input.channel) : "EMAIL", String(input.address).trim(),
      input.defaultQueueId || null, input.defaultCaseTypeId || null, input.autoAckMacroId || null, now,
    ],
  );
}

export async function updateCaseInboundAddressForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  const tenantId = await assertServiceDeskEnabled(user);
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ["channel", "address", "defaultQueueId", "defaultCaseTypeId", "autoAckMacroId", "isActive"] as const) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  const columns = Object.keys(patch);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  return queryOne<any>(
    `update "CaseInboundAddress" set ${assignments} where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2} returning ${ADDRESS_COLUMNS}`,
    [...columns.map((column) => patch[column]), tenantId, id],
  );
}

export async function deleteCaseInboundAddressForTenant(user: TenantUser, id: string) {
  const tenantId = await assertServiceDeskEnabled(user);
  await execute('delete from "CaseInboundAddress" where "tenantId" = $1 and id = $2', [tenantId, id]);
}

// ─── Email-to-case / message-to-case routing (checklist item 5) ──────────────────────────

function normalizeThreadKey(channel: string, fromAddress: string, subject?: string | null) {
  const sender = fromAddress.trim().toLowerCase();
  if (channel !== "EMAIL") return sender; // WhatsApp/SMS: the phone number itself is the thread
  const cleanedSubject = (subject ?? "")
    .toLowerCase()
    .replace(/^(re|fwd|fw)\s*:\s*/i, "")
    .replace(/^(re|fwd|fw)\s*:\s*/i, "") // handles a doubled "Re: Fwd:" prefix
    .trim();
  return `${sender}::${cleanedSubject}`;
}

type CaptureInboundInput = {
  channel: "EMAIL" | "WHATSAPP" | "SMS";
  fromAddress: string;
  toAddress?: string | null;
  subject?: string | null;
  body: string;
  providerMessageId?: string | null;
  rawPayload?: Record<string, unknown>;
  attachments?: Array<{ filename: string; contentType?: string | null; base64: string }>;
};

async function captureInboundAttachments(tenantId: string, caseId: string, commentId: string | null, attachments: CaptureInboundInput["attachments"]) {
  if (!attachments?.length) return;
  for (const attachment of attachments) {
    const buffer = Buffer.from(attachment.base64, "base64");
    const storageKey = `cases/${tenantId}/${caseId}/${randomUUID()}-${attachment.filename}`;
    const written = await writePrivateFile(storageKey, buffer, { bucket: "case-attachments", contentType: attachment.contentType ?? null });
    const fileObject = await upsertFileObjectForTenant({ id: "system", tenantId }, {
      bucket: written.bucket, storageKey: written.storageKey, storageDriver: written.driver,
      originalFilename: attachment.filename, contentType: written.contentType, byteSize: written.byteSize,
      checksum: written.checksum, entityType: "CASE", entityId: caseId, visibility: "TENANT",
    });
    await execute(
      `insert into "CaseAttachment" (id, "tenantId", "caseId", "fileObjectId", "commentId", filename, "contentType", "byteSize", source, "createdAt")
       values ($1,$2,$3,$4,$5,$6,$7,$8,'INBOUND',$9)`,
      [randomUUID(), tenantId, caseId, fileObject.id, commentId, attachment.filename, attachment.contentType ?? null, written.byteSize, new Date().toISOString()],
    );
  }
}

// Idempotency (duplicate detection): a provider redelivering the same message is identified by
// (tenantId, inboundAddressId, providerMessageId) -- the concrete, cheap form of "duplicate
// detection" that actually matters for inbound webhooks (redelivery), not fuzzy content-based
// dedup. Thread detection: an EMAIL's normalized sender+subject (WhatsApp/SMS: sender alone) is
// looked up against prior CaseInboundMessage rows -- a hit on a still-open case appends this
// message as a real case comment instead of opening a duplicate case; a hit on an already-
// closed case (or no hit) opens a fresh one, rather than silently reopening old, resolved work.
// Sender matching: an EMAIL sender matched against an existing Lead prefills requester name and
// links the case for free. Fallback unassigned queue: when no inbound address config (or its
// own defaultQueueId) applies, the tenant's isDefault CaseQueue is used so the message still
// lands somewhere triageable instead of vanishing into a queue-less, owner-less case.
export async function captureInboundCaseMessage(tenantId: string, input: CaptureInboundInput) {
  if (!(await isModuleEnabledForTenant(tenantId, "SERVICE_DESK"))) {
    return { status: "REJECTED" as const, reason: "Service Desk module is disabled for this tenant" };
  }

  const inboundAddress = input.toAddress
    ? await queryOne<any>(`select ${ADDRESS_COLUMNS} from "CaseInboundAddress" where "tenantId" = $1 and channel = $2 and address = $3 and "isActive" = true`, [tenantId, input.channel, input.toAddress])
    : null;

  const messageId = randomUUID();
  const nowIso = new Date().toISOString();

  if (input.providerMessageId) {
    const duplicate = await queryOne<{ id: string; caseId: string | null }>(
      `select id, "caseId" from "CaseInboundMessage" where "tenantId" = $1 and "inboundAddressId" is not distinct from $2 and "providerMessageId" = $3 limit 1`,
      [tenantId, inboundAddress?.id ?? null, input.providerMessageId],
    );
    if (duplicate) {
      await execute(
        `insert into "CaseInboundMessage" (id, "tenantId", "inboundAddressId", channel, "fromAddress", "toAddress", subject, body, "providerMessageId", "rawPayload", "caseId", status, "duplicateOfId", "receivedAt", "createdAt")
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'DUPLICATE',$12,$13,$13)`,
        [messageId, tenantId, inboundAddress?.id ?? null, input.channel, input.fromAddress, input.toAddress ?? null, input.subject ?? null, input.body, input.providerMessageId, input.rawPayload ?? {}, duplicate.caseId, duplicate.id, nowIso],
      );
      return { status: "DUPLICATE" as const, caseId: duplicate.caseId, messageId };
    }
  }

  const threadKey = normalizeThreadKey(input.channel, input.fromAddress, input.subject);
  const priorThread = await queryOne<{ caseId: string }>(
    `select "caseId" from "CaseInboundMessage" where "tenantId" = $1 and "threadKey" = $2 and "caseId" is not null order by "createdAt" desc limit 1`,
    [tenantId, threadKey],
  );

  const systemUser = { id: "system", tenantId };
  let caseId: string;
  let commentId: string | null = null;
  let created = false;

  if (priorThread?.caseId) {
    const openCase = await queryOne<{ id: string }>(
      `select c.id from "Case" c join "CaseStatus" s on s."tenantId" = c."tenantId" and s.id = c."statusId"
       where c."tenantId" = $1 and c.id = $2 and s."isClosedStatus" = false`,
      [tenantId, priorThread.caseId],
    );
    if (openCase) {
      const comment = await addCommentToCase(systemUser, openCase.id, { body: input.body, isInternal: false });
      caseId = openCase.id;
      commentId = comment?.id ?? null;
    } else {
      caseId = await createCaseFromInbound(systemUser, tenantId, input, inboundAddress);
      created = true;
    }
  } else {
    caseId = await createCaseFromInbound(systemUser, tenantId, input, inboundAddress);
    created = true;
  }

  await execute(
    `insert into "CaseInboundMessage" (id, "tenantId", "inboundAddressId", channel, "fromAddress", "toAddress", subject, body, "providerMessageId", "threadKey", "rawPayload", "caseId", "commentId", status, "receivedAt", "createdAt")
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ROUTED',$14,$14)`,
    [messageId, tenantId, inboundAddress?.id ?? null, input.channel, input.fromAddress, input.toAddress ?? null, input.subject ?? null, input.body, input.providerMessageId ?? null, threadKey, input.rawPayload ?? {}, caseId, commentId, nowIso],
  );

  await captureInboundAttachments(tenantId, caseId, commentId, input.attachments);

  // Auto-acknowledgement: a routine autoresponder, not a discretionary agent reply -- sent
  // directly (not approval-gated the way a macro's external reply can optionally be) only when
  // this is a genuinely NEW case, so a reply into an existing thread doesn't re-ack every time.
  if (created && inboundAddress?.autoAckMacroId) {
    await sendAutoAcknowledgement(tenantId, caseId, inboundAddress.autoAckMacroId, input).catch(() => undefined);
  }

  return { status: "ROUTED" as const, caseId, created, messageId };
}

async function resolveFallbackQueueId(tenantId: string) {
  const row = await queryOne<{ id: string }>('select id from "CaseQueue" where "tenantId" = $1 and "isDefault" = true limit 1', [tenantId]);
  return row?.id ?? null;
}

async function createCaseFromInbound(systemUser: TenantUser, tenantId: string, input: CaptureInboundInput, inboundAddress: any) {
  let requesterName: string | null = null;
  let relatedLeadId: string | null = null;
  if (input.channel === "EMAIL") {
    const lead = await queryOne<{ id: string; name: string }>(
      'select id, name from "Lead" where "tenantId" = $1 and lower(email) = $2 order by "createdAt" desc limit 1',
      [tenantId, input.fromAddress.toLowerCase()],
    );
    if (lead) {
      relatedLeadId = lead.id;
      requesterName = lead.name;
    }
  }

  const queueId = inboundAddress?.defaultQueueId || (await resolveFallbackQueueId(tenantId));
  const created = await createCaseForTenant(systemUser, {
    subject: input.subject?.trim() || `Message from ${input.fromAddress}`,
    description: input.body,
    typeId: inboundAddress?.defaultCaseTypeId || null,
    queueId,
    requesterName,
    requesterEmail: input.channel === "EMAIL" ? input.fromAddress : null,
    requesterPhone: input.channel !== "EMAIL" ? input.fromAddress : null,
    relatedLeadId,
  });
  return created.id;
}

async function sendAutoAcknowledgement(tenantId: string, caseId: string, macroId: string, input: CaptureInboundInput) {
  const macro = await queryOne<any>('select "bodyTemplate", channel from "CaseMacro" where "tenantId" = $1 and id = $2 and "isActive" = true', [tenantId, macroId]);
  if (!macro?.channel) return;
  const caseRow = await queryOne<any>('select "caseNumber", subject from "Case" where "tenantId" = $1 and id = $2', [tenantId, caseId]);
  if (!caseRow) return;

  const { renderTemplate, queueCommunicationForTenant } = await import("@/lib/server/communications");
  const body = renderTemplate(macro.bodyTemplate, { caseNumber: caseRow.caseNumber, subject: caseRow.subject, requesterName: "" });
  await queueCommunicationForTenant({ id: "system", tenantId }, {
    channel: macro.channel, recipient: input.fromAddress, subject: `Re: ${caseRow.subject} [#${caseRow.caseNumber}]`, body,
    sourceType: "CASE_AUTO_ACK", sourceId: caseId, entityType: "CASE", entityId: caseId,
  });
}
