import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { countPayoutQueuesForTenant, listPayoutQueueForTenant, listPayoutsPageForTenant, PAYOUT_QUEUES, type PayoutQueue } from "@/lib/server/payouts";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

// The Payouts workspace queues (decision 32): ?queue=to-approve|on-hold|to-pay lists one queue
// across every cycle; ?counts=1 returns how many payouts are in each. Admins only, like every
// other payout review endpoint. ?page=&limit= lists every payout, newest cycle first.
export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const params = new URL(request.url).searchParams;
    if (params.get("counts") === "1") return NextResponse.json(await countPayoutQueuesForTenant(user));
    // ?page=&limit= (no queue): every payout across every cycle, one page plus the total.
    if (params.has("page") && !params.has("queue")) return NextResponse.json(await listPayoutsPageForTenant(user, Number(params.get("page")), Number(params.get("limit") ?? 100)));
    const queue = params.get("queue") as PayoutQueue | null;
    if (!queue || !PAYOUT_QUEUES.includes(queue)) return badRequest(`queue must be one of ${PAYOUT_QUEUES.join(", ")}`);
    return NextResponse.json(await listPayoutQueueForTenant(user, queue));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) return forbidden("Payouts is turned off for this workspace");
    return serverError("Failed to fetch payouts", error);
  }
}
