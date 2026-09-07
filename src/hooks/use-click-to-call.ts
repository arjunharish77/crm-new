"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

type ClickToCallInput = {
    leadId?: string | null;
    opportunityId?: string | null;
};

// Shared across every click-to-call surface (Lead detail, Opportunity detail, and any future
// call site) so the same audit-logged, record-access-scoped server path
// (buildClickToCallPayloadForTenant) backs all of them -- no surface reimplements the fetch.
export function useClickToCall() {
    const [calling, setCalling] = useState(false);

    const call = useCallback(async (phoneNumber: string | null | undefined, context: ClickToCallInput = {}) => {
        if (!phoneNumber) {
            toast.error("No phone number on this record");
            return;
        }
        setCalling(true);
        try {
            const result = await apiFetch<{ success: boolean; executed: boolean; blocked?: boolean; blockReason?: string | null }>(
                "/integrations/telephony/click-to-call",
                { method: "POST", body: JSON.stringify({ phoneNumber, leadId: context.leadId, opportunityId: context.opportunityId, execute: true }) },
            );
            if (result?.blocked) {
                const reasonLabel = result.blockReason === "SUPPRESSED"
                    ? "this number is on the do-not-call list"
                    : result.blockReason === "OPTED_OUT"
                        ? "this contact has opted out of phone contact"
                        : result.blockReason === "QUIET_HOURS"
                            ? "it's currently within configured quiet hours"
                            : "compliance rules";
                toast.error(`Call blocked -- ${reasonLabel}`);
            } else {
                toast.success(result?.success ? "Call request sent" : "Click-to-call request created");
            }
            return result;
        } catch (error: any) {
            toast.error(error?.message || "Failed to start click-to-call");
        } finally {
            setCalling(false);
        }
    }, []);

    return { call, calling };
}
