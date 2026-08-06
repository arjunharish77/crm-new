"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDateTime } from "@/lib/date-format";

interface ExternalPushBadgeProps {
    leadId?: string | null;
    opportunityId?: string | null;
    /** Bump this to force a refetch after a new push (e.g. from the push dialog's onPushed). */
    refreshKey?: number;
}

// Not gated by the "integrations" permission -- anyone who can view this record can see its
// push status, same as any other metadata on the page (see plan's permission-scope decision).
export function ExternalPushBadge({ leadId, opportunityId, refreshKey }: ExternalPushBadgeProps) {
    const [lastAttempt, setLastAttempt] = useState<any>(null);

    useEffect(() => {
        if (!leadId && !opportunityId) return;
        const params = new URLSearchParams();
        if (leadId) params.set("leadId", leadId);
        if (opportunityId) params.set("opportunityId", opportunityId);
        apiFetch(`/external-integrations/attempts?${params.toString()}`)
            .then((data) => setLastAttempt(Array.isArray(data) && data.length > 0 ? data[0] : null))
            .catch(() => setLastAttempt(null));
    }, [leadId, opportunityId, refreshKey]);

    if (!lastAttempt) return null;

    return (
        <Badge variant={lastAttempt.status === "SUCCESS" ? "default" : "destructive"} className="whitespace-nowrap">
            {lastAttempt.status === "SUCCESS" ? "Pushed" : "Push failed"} to {lastAttempt.integrationName || "external system"} · {formatWorkspaceDateTime(lastAttempt.createdAt)}
        </Badge>
    );
}
