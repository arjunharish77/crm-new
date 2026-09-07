"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ShieldCheck, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useModuleEnabled } from "@/components/auth/feature-gate";
import { ACTION_LABELS } from "./nba-panel";

type PendingApproval = {
    id: string;
    recordType: "LEAD" | "OPPORTUNITY";
    recordId: string;
    recordName: string;
    ownerName: string;
    actionType: string;
    reason: string | null;
};

// Self-fetching and hides entirely when there's nothing to show, same convention as
// NextBestActionPanel -- this only ever renders for a user who actually has direct reports
// with a pending approval, so most users never see it at all.
export function NbaPendingApprovalsPanel() {
    const moduleEnabled = useModuleEnabled("NEXT_BEST_ACTION");
    const [approvals, setApprovals] = useState<PendingApproval[]>([]);
    const [loading, setLoading] = useState(true);
    const [respondingId, setRespondingId] = useState<string | null>(null);

    const fetchApprovals = useCallback(() => {
        setLoading(true);
        return apiFetch<PendingApproval[]>("/next-best-action/approvals")
            .then((data) => setApprovals(Array.isArray(data) ? data : []))
            .catch(() => setApprovals([]))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (moduleEnabled) fetchApprovals();
        else setLoading(false);
    }, [fetchApprovals, moduleEnabled]);

    const respond = async (id: string, action: "approve" | "reject") => {
        setRespondingId(id);
        try {
            await apiFetch(`/next-best-action/approvals/${id}/${action}`, { method: "POST" });
            toast.success(action === "approve" ? "Recommendation approved" : "Recommendation rejected");
            await fetchApprovals();
        } catch (error: any) {
            toast.error(error.message || `Failed to ${action} recommendation`);
        } finally {
            setRespondingId(null);
        }
    };

    if (!moduleEnabled || loading || approvals.length === 0) return null;

    return (
        <Card className="mb-6 rounded-2xl p-4">
            <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                <span className="text-sm font-bold">Pending Your Approval</span>
                <Badge variant="secondary" className="rounded-md text-[0.65rem]">{approvals.length}</Badge>
            </div>
            <div className="space-y-2">
                {approvals.map((approval) => (
                    <div key={approval.id} className="rounded-lg border p-2.5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <Link
                                    href={`/dashboard/${approval.recordType === "OPPORTUNITY" ? "opportunities" : "leads"}/${approval.recordId}`}
                                    className="text-sm font-semibold hover:underline"
                                >
                                    {approval.recordName}
                                </Link>
                                <p className="text-xs text-muted-foreground">
                                    {ACTION_LABELS[approval.actionType] ?? approval.actionType} · recommended for {approval.ownerName}
                                </p>
                                {approval.reason && <p className="mt-0.5 text-xs text-muted-foreground">{approval.reason}</p>}
                            </div>
                            <div className="flex gap-1.5">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 rounded-md px-2 text-xs"
                                    disabled={respondingId === approval.id}
                                    onClick={() => respond(approval.id, "approve")}
                                >
                                    <Check className="size-3.5" />
                                    Approve
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 rounded-md px-2 text-xs text-muted-foreground"
                                    disabled={respondingId === approval.id}
                                    onClick={() => respond(approval.id, "reject")}
                                >
                                    <X className="size-3.5" />
                                    Reject
                                </Button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}
