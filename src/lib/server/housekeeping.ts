import { executeAsSystem } from "@/lib/db/query";

// Round-2 plan B14: tables that only ever grew. Each rule removes rows that no screen or
// process needs any more, at most `limit` rows per table per run, so a backlog is cleared over
// a few runs without long locks. Recurring job "housekeeping.run" (scripts/worker.ts).
//
// Kept on purpose: sessions for 90 days after they end (login history shows them), impersonation
// sessions until reviewed and a year old, webhook and app deliveries for 30 days (the delivery
// history screens) and failed ones for 90.
export const HOUSEKEEPING_RULES: ReadonlyArray<{ table: string; where: string; label: string }> = [
  { table: "UserSession", label: "ended sessions", where: `"isImpersonation" = false and coalesce("revokedAt", "expiresAt") < now() - interval '90 days'` },
  { table: "UserSession", label: "reviewed impersonation sessions", where: `"isImpersonation" = true and "reviewedAt" is not null and coalesce("revokedAt", "expiresAt") < now() - interval '365 days'` },
  { table: "PasswordResetToken", label: "used or expired reset links", where: `coalesce("usedAt", "expiresAt") < now() - interval '7 days'` },
  { table: "TrustedDevice", label: "expired trusted devices", where: `"expiresAt" < now() - interval '7 days'` },
  { table: "RequestIdempotencyKey", label: "idempotency keys", where: `"createdAt" < now() - interval '30 days'` },
  { table: "JobDeadLetter", label: "failed background jobs", where: `"failedAt" < now() - interval '90 days'` },
  { table: "WebhookOutbox", label: "delivered webhooks", where: `status in ('DELIVERED', 'CANCELLED') and "updatedAt" < now() - interval '30 days'` },
  { table: "WebhookOutbox", label: "failed webhooks", where: `status = 'FAILED' and "updatedAt" < now() - interval '90 days'` },
  { table: "TenantAppDelivery", label: "delivered app events", where: `status in ('DELIVERED', 'CANCELLED') and "updatedAt" < now() - interval '30 days'` },
  { table: "TenantAppDelivery", label: "failed app events", where: `status = 'FAILED' and "updatedAt" < now() - interval '90 days'` },
];

export async function runHousekeeping(limit = 5000) {
  const removed: Record<string, number> = {};
  for (const rule of HOUSEKEEPING_RULES) {
    const count = await executeAsSystem(
      `delete from "${rule.table}" where id in (select id from "${rule.table}" where ${rule.where} limit $1)`,
      [limit],
    );
    removed[`${rule.table}: ${rule.label}`] = count;
  }
  return removed;
}
