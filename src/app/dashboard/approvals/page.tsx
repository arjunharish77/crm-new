"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Inbox, XCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { ListToolbar } from "@/components/common/list-toolbar";
import { useAskText, useConfirm } from "@/components/common/dialogs-provider";
import { TableSkeleton } from "@/components/common/skeletons";
import { useUrlState } from "@/hooks/use-url-state";
import { formatWorkspaceRelativeTime } from "@/lib/date-format";
import { formatCount } from "@/lib/display/format";

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

const TYPES: Record<ApprovalEntityType, { label: string; href: string }> = {
    PAYOUT: { label: "Payout", href: "/dashboard/payouts" },
    CAMPAIGN: { label: "Campaign", href: "/dashboard/marketing" },
    TEMPLATE: { label: "Message template", href: "/dashboard/settings/integrations?section=messaging" },
    EXPORT_REQUEST: { label: "Export", href: "/dashboard/exports" },
    SCORING_MODEL_VERSION: { label: "Scoring model", href: "/dashboard/settings/automation/lead-scoring" },
    PARTNER_CHANGE_REQUEST: { label: "Partner change", href: "/dashboard/settings/access/partners" },
};

// My work › Approvals (UI/UX plan §5.17): one inbox for every request waiting on you, filterable
// by type, each with a link to where it's reviewed. Approving says what you're approving;
// rejecting asks for an optional reason (it was window.prompt).
export default function ApprovalInboxPage() {
    const confirm = useConfirm();
    const askText = useAskText();
    const [items, setItems] = useState<ApprovalInboxItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [type, setType] = useUrlState<string>("type", "all");

    const fetchItems = async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const data = await apiFetch<ApprovalInboxItem[]>("/approvals");
            setItems(Array.isArray(data) ? data : []);
        } catch {
            setFetchError("The approvals couldn't be loaded.");
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { fetchItems(); }, []);

    const decide = async (item: ApprovalInboxItem, decision: "APPROVE" | "REJECT") => {
        let comment: string | null = null;
        if (decision === "REJECT") {
            comment = await askText({ title: `Reject ${item.title}?`, description: item.summary, label: "Reason (optional, shown to the requester)", confirmLabel: "Reject", destructive: true });
            if (comment === null) return;
        } else {
            const ok = await confirm({ title: `Approve ${item.title}?`, description: item.summary, confirmLabel: "Approve" });
            if (!ok) return;
        }
        const key = `${item.entityType}:${item.entityId}`;
        setBusyKey(key);
        try {
            await apiFetch("/approvals/decide", {
                method: "POST",
                body: JSON.stringify({ entityType: item.entityType, entityId: item.entityId, decision, comment: comment || undefined }),
            });
            toast.success(decision === "APPROVE" ? `Approved: ${item.title}` : `Rejected: ${item.title}`);
            setItems((current) => current.filter((i) => !(i.entityType === item.entityType && i.entityId === item.entityId)));
        } catch (error: any) {
            toast.error(error?.message || "Your decision couldn't be saved");
        } finally {
            setBusyKey(null);
        }
    };

    const counts = useMemo(() => {
        const result: Record<string, number> = { all: items.length };
        for (const item of items) result[item.entityType] = (result[item.entityType] ?? 0) + 1;
        return result;
    }, [items]);
    const typesPresent = (Object.keys(TYPES) as ApprovalEntityType[]).filter((key) => counts[key]);
    const visible = type === "all" ? items : items.filter((item) => item.entityType === type);

    return (
        <div className="mx-auto min-w-0 max-w-4xl">
            <PageHeader title="Approvals" meta={loading || fetchError ? undefined : <span className="tabular-nums">{formatCount(items.length)} waiting for you</span>} />

            {loading ? (
                <TableSkeleton rows={4} columns={1} hasToolbar={false} />
            ) : fetchError ? (
                <ErrorState description={fetchError} onRetry={fetchItems} />
            ) : items.length === 0 ? (
                <EmptyState icon={<Inbox />} title="Nothing waiting for you" description="Payouts, campaigns, templates, exports, scoring models and partner changes appear here when they need your decision." />
            ) : (
                <div className="space-y-3">
                    {typesPresent.length > 1 ? (
                        <ListToolbar
                            quickFilters={[{ value: "all", label: "All", count: counts.all }, ...typesPresent.map((key) => ({ value: key, label: TYPES[key].label, count: counts[key] }))]}
                            quickFilter={type}
                            onQuickFilterChange={setType}
                        />
                    ) : null}
                    <ul className="divide-y rounded-xl border bg-card">
                        {visible.map((item) => {
                            const key = `${item.entityType}:${item.entityId}`;
                            const busy = busyKey === key;
                            return (
                                <li key={key} className="flex flex-wrap items-center justify-between gap-3 p-3">
                                    <div className="min-w-0 flex-1 basis-64 break-words">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge tone="neutral">{TYPES[item.entityType]?.label ?? item.entityType}</Badge>
                                            <p data-slot="approval-title" className="min-w-0 break-words text-sm font-medium">{item.title}</p>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{item.summary}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {item.requestedByName ? `Requested by ${item.requestedByName} · ` : null}
                                            {formatWorkspaceRelativeTime(item.requestedAt)}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {TYPES[item.entityType] ? (
                                            <Button variant="ghost" size="sm" asChild><Link href={TYPES[item.entityType].href}><ExternalLink className="size-3.5" />Review</Link></Button>
                                        ) : null}
                                        {item.canReject && (
                                            <Button variant="outline" size="sm" disabled={busy} onClick={() => decide(item, "REJECT")}>
                                                <XCircle className="size-3.5" />Reject
                                            </Button>
                                        )}
                                        <Button size="sm" isLoading={busy} onClick={() => decide(item, "APPROVE")}>
                                            <CheckCircle2 className="size-3.5" />Approve
                                        </Button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
