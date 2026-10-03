"use client";

import { useAuth } from "@/providers/auth-provider";
import { ErrorState } from "@/components/common/error-state";
import { PartnerPayouts } from "@/components/payouts/partner-payouts";
import { PayoutsWorkspace } from "@/components/payouts/payouts-workspace";

// Insights › Payouts. A partner sees their own payouts; an admin gets the Payouts workspace
// (decision 32). Everyone else has nothing here: the payout endpoints are partner- or admin-only.
export default function PayoutsPage() {
    const { user } = useAuth();
    if (!user) return null;
    if ((user.role as any)?.permissions?.isPartnerRole) return <PartnerPayouts />;
    if ((user as any).isTenantAdmin || user.isPlatformAdmin) return <PayoutsWorkspace />;
    return <ErrorState kind="permission" description="Only admins work on payouts. Ask an admin if you need a payout looked at." />;
}
