"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Inbox, XCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { TableSkeleton } from "@/components/common/skeletons";
import { formatWorkspaceRelativeTime } from "@/lib/date-format";

type ApprovalEntityType = "PAYOUT" | "CAMPAIGN" | "TEMPLATE" | "EXPORT_REQUEST" | "SCORING_MODEL_VERSION" | "PARTNER_CHANGE_REQUEST";

type ApprovalInboxItem = {
    entityType: ApprovalEntityType;
    entityId: string;
    title: string;
    summary: string;
    requestedByName: string | null;
    requestedAt: string;
    canReject: boolean;
};

const ENTITY_TYPE_LABELS: Record<ApprovalEntityType, string> = {
    PAYOUT: "Payout",
    CAMPAIGN: "Campaign",
    TEMPLATE: "Template",
    EXPORT_REQUEST: "Export",
    SCORING_MODEL_VERSION: "Scoring Model",
    PARTNER_CHANGE_REQUEST: "Partner Change",
};

// Gap checklist Module 10's "approval inbox" item -- one page aggregating every domain's own
// real pending-approval state (see src/lib/server/approval-inbox.ts for what each domain's
// "pending" actually means and which of the underlying approve/reject actions were already real
// vs. newly built for this pass).
export default function ApprovalInboxPage() {
    const [items, setItems] = useState<ApprovalInboxItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [busyKey, setBusyKey] = useState<string | null>(null);

    const fetchItems = async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const data = await apiFetch<ApprovalInboxItem[]>("/approvals");
            setItems(Array.isArray(data) ? data : []);
        } catch {
            setFetchError("Failed to load the approval inbox.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchItems();
    }, []);

    const decide = async (item: ApprovalInboxItem, decision: "APPROVE" | "REJECT") => {
        const key = `${item.entityType}:${item.entityId}`;
        let comment: string | null = null;
        if (decision === "REJECT") {
            comment = window.prompt(`Reason for rejecting "${item.title}" (optional):`);
            if (comment === null) return; // cancelled the prompt
        }
        setBusyKey(key);
        try {
            await apiFetch("/approvals/decide", {
                method: "POST",
                body: JSON.stringify({ entityType: item.entityType, entityId: item.entityId, decision, comment: comment || undefined }),
            });
            toast.success(decision === "APPROVE" ? "Approved" : "Rejected");
            setItems((current) => current.filter((i) => !(i.entityType === item.entityType && i.entityId === item.entityId)));
        } catch (error: any) {
            toast.error(error?.message || "Failed to record decision");
        } finally {
            setBusyKey(null);
        }
    };

    return (
        <div className="mx-auto max-w-4xl px-3 py-4">
            <div className="mb-4 flex items-center gap-3">
                <div className="flex items-center justify-center rounded-[10px] bg-primary/10 p-2 text-primary">
                    <Inbox className="size-4" />
                </div>
                <div>
                    <h1 className="text-xl font-extrabold tracking-tight">Approval Inbox</h1>
                    <p className="text-sm text-muted-foreground">
                        Everything across the workspace currently waiting on your review, in one place.
                    </p>
                </div>
            </div>

            {loading ? (
                <TableSkeleton rows={4} columns={1} hasToolbar={false} />
            ) : fetchError ? (
                <ErrorState description={fetchError} onRetry={fetchItems} />
            ) : items.length === 0 ? (
                <EmptyState
                    icon={<Inbox className="size-12 text-muted-foreground opacity-50" />}
                    title="Nothing waiting on you"
                    description="Payouts, campaigns, templates, exports, scoring models, and partner change requests will show up here as they need review."
                />
            ) : (
                <Card className="overflow-hidden py-0">
                    <div className="divide-y">
                        {items.map((item) => {
                            const key = `${item.entityType}:${item.entityId}`;
                            const busy = busyKey === key;
                            return (
                                <div key={key} className="flex flex-wrap items-center justify-between gap-3 p-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline">{ENTITY_TYPE_LABELS[item.entityType]}</Badge>
                                            <p className="truncate text-sm font-medium">{item.title}</p>
                                        </div>
                                        <p className="text-xs text-muted-foreground">{item.summary}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {item.requestedByName ? `Requested by ${item.requestedByName} · ` : null}
                                            {formatWorkspaceRelativeTime(item.requestedAt)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {item.canReject && (
                                            <Button variant="outline" size="sm" disabled={busy} onClick={() => decide(item, "REJECT")}>
                                                <XCircle className="size-3.5" />
                                                Reject
                                            </Button>
                                        )}
                                        <Button size="sm" disabled={busy} onClick={() => decide(item, "APPROVE")}>
                                            <CheckCircle2 className="size-3.5" />
                                            Approve
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}
        </div>
    );
}
