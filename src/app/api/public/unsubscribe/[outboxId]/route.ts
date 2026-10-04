import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { queryOne, execute } from "@/lib/db/query";
import { cancelPendingJourneyStepsForRecord, setPreferenceForRecord } from "@/lib/server/marketing-journeys";
import { badRequest, serverError } from "@/lib/server/http";
import { maskRecipient } from "@/lib/mask-recipient";

async function loadOutboxContext(outboxId: string) {
  return queryOne<any>(
    `select id, "tenantId", channel, recipient, "entityType", "entityId" from "CommunicationOutbox" where id = $1 limit 1`,
    [outboxId],
  );
}

// Public, unauthenticated by design -- reached from an unsubscribe link in a sent
// email/WhatsApp/SMS, identified by the CommunicationOutbox row id rather than a
// separate token system (that row id already uniquely and non-guessably identifies
// one specific send, which is all this needs).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ outboxId: string }> }
) {
  try {
    const { outboxId } = await params;
    const outbox = await loadOutboxContext(outboxId);
    if (!outbox) return NextResponse.json({ message: "Not found" }, { status: 404 });
    return NextResponse.json({ channel: outbox.channel, recipient: maskRecipient(outbox.recipient), entityType: outbox.entityType });
  } catch (error) {
    return serverError("Failed to load unsubscribe context", error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ outboxId: string }> }
) {
  try {
    const { outboxId } = await params;
    const outbox = await loadOutboxContext(outboxId);
    if (!outbox) return NextResponse.json({ message: "Not found" }, { status: 404 });
    if (!outbox.entityType || !outbox.entityId) return badRequest("This message isn't linked to a record that can be unsubscribed");

    const body = await request.json().catch(() => ({}));
    const scope: "CHANNEL" | "ALL" = body?.scope === "ALL" ? "ALL" : "CHANNEL";

    const now = new Date().toISOString();
    // Each opt-out also goes into the append-only consent history (it used to be missing, so link
    // opt-outs never appeared in a record's consent history), with no user: the recipient did it.
    const optOut = async (channel: string) => {
      await execute(
        `insert into "CommunicationConsent" (id, "tenantId", "entityType", "entityId", channel, status, source, "capturedAt", "updatedAt")
         values ($1, $2, $3, $4, $5, 'OPTED_OUT', 'UNSUBSCRIBE_LINK', $6, $6)
         on conflict ("tenantId", "entityType", "entityId", channel) do update set status = 'OPTED_OUT', source = 'UNSUBSCRIBE_LINK', "updatedAt" = $6`,
        [randomUUID(), outbox.tenantId, outbox.entityType, outbox.entityId, channel, now],
      );
      await execute(
        `insert into "CommunicationConsentHistory" (id, "tenantId", "entityType", "entityId", channel, status, "lawfulBasis", source, "changedBy", "createdAt")
         values ($1, $2, $3, $4, $5, 'OPTED_OUT', null, 'UNSUBSCRIBE_LINK', null, $6)`,
        [randomUUID(), outbox.tenantId, outbox.entityType, outbox.entityId, channel, now],
      );
    };
    if (scope === "ALL") {
      for (const channel of ["EMAIL", "WHATSAPP", "SMS"]) await optOut(channel);
    } else {
      await optOut(outbox.channel);
    }

    if (outbox.entityType === "LEAD" || outbox.entityType === "OPPORTUNITY") {
      await setPreferenceForRecord(outbox.tenantId, outbox.entityType, outbox.entityId, "GENERAL", false, "UNSUBSCRIBE_LINK");
      await execute(
        `update "MarketingJourneyEnrollment"
         set status = 'UNSUBSCRIBED', "exitedAt" = $1, "exitReason" = 'Recipient unsubscribed'
         where "tenantId" = $2 and "recordType" = $3 and "recordId" = $4 and status = 'ACTIVE'`,
        [now, outbox.tenantId, outbox.entityType, outbox.entityId],
      );
      // Unsubscribing stops every journey's scheduled steps for this record.
      await cancelPendingJourneyStepsForRecord(outbox.tenantId, null, outbox.entityType, outbox.entityId);
    }

    return NextResponse.json({ success: true, scope });
  } catch (error) {
    return serverError("Failed to process unsubscribe request", error);
  }
}
