import { queryOne } from "@/lib/db/query";
import { createUserNotification } from "@/lib/server/notifications";

// Same "no specific owner -> notify the tenant's earliest-created user" fallback convention
// already established for terminal-failure notifications (marketplace-events.ts,
// webhook-outbox.ts) -- an abuse alert has no natural "requester" to attribute to, since it
// fires from repeated rate-limit hits, not a single user-initiated action.
export async function alertAbuseThresholdCrossed(tenantId: string, category: string, detail: string) {
  const owner = await queryOne<{ id: string }>(`select id from "User" where "tenantId" = $1 order by "createdAt" asc limit 1`, [tenantId]);
  if (!owner) return;
  await createUserNotification({
    tenantId,
    userId: owner.id,
    title: "Repeated rate-limit hits detected",
    message: `${category} has hit its rate limit repeatedly in the last 10 minutes (${detail}). This may indicate abuse, a misconfigured integration, or a runaway script.`,
    data: { type: "abuse.rateLimitThreshold", category, detail },
    category: "SECURITY",
  }).catch(() => undefined);
}
