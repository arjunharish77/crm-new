import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { queryOne } from "@/lib/db/query";
import { listPartnerInvoiceHistoryForPayout } from "@/lib/server/partner-invoices";
import { getPartnerPayoutSettingsForTenant } from "@/lib/server/payouts";
import { getPayoutVisiblePartnerUserIds } from "@/lib/server/partner-access";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

// Full invoice history for a payout, including cancelled ones -- the concrete
// transparency surface for the credit-note flow: a partner (or admin) can see that an
// invoice was corrected and why, not just the current active one.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;

    if (!user.isTenantAdmin && !user.isPlatformAdmin) {
      const payout = await queryOne<{ partnerId: string | null }>(
        `select "partnerId" from "Payout" where id = $1 and "tenantId" = $2`,
        [id, user.tenantId],
      );
      if (!payout || !payout.partnerId) return forbidden("You can only view invoices for your own payout");
      const settings = await getPartnerPayoutSettingsForTenant(user);
      const visibleIds = await getPayoutVisiblePartnerUserIds(user, settings);
      if (!visibleIds.includes(payout.partnerId)) {
        return forbidden("You can only view invoices for your own payout");
      }
    }

    const invoices = await listPartnerInvoiceHistoryForPayout(user, id);
    return NextResponse.json(invoices);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch invoice history", error);
  }
}
