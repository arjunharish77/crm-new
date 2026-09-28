"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { UserCog, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StandardDialog } from "@/components/common/standard-dialog";
import { formatWorkspaceDateTime } from "@/lib/date-format";

type ImpersonationSession = {
    id: string;
    userName: string;
    userEmail: string;
    impersonatedByName: string | null;
    tenantName: string | null;
    reason: string | null;
    createdAt: string;
    revokedAt: string | null;
    expiresAt: string;
    actionCount: number;
    reviewedAt: string | null;
    reviewedBy: string | null;
    reviewNote: string | null;
};

export default function ImpersonationReviewPage() {
    const [sessions, setSessions] = useState<ImpersonationSession[]>([]);
    const [loadError, setLoadError] = useState(false);
    const requestVersion = useRef(0);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"pending" | "reviewed" | "all">("pending");
    const [reviewingSession, setReviewingSession] = useState<ImpersonationSession | null>(null);
    const [reviewNote, setReviewNote] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const load = () => {
        const version = ++requestVersion.current;
        setLoading(true);
        setLoadError(false);
        const query = filter === "pending" ? "?reviewed=false" : filter === "reviewed" ? "?reviewed=true" : "";
        apiFetch<ImpersonationSession[]>(`/platform-admin/impersonation-sessions${query}`)
            .then((data) => { if (version === requestVersion.current) setSessions(Array.isArray(data) ? data : []); })
            .catch(() => version === requestVersion.current && setLoadError(true))
            .finally(() => { if (version === requestVersion.current) setLoading(false); });
    };

    useEffect(load, [filter]);

    const submitReview = async () => {
        if (!reviewingSession) return;
        setSubmitting(true);
        try {
            await apiFetch(`/platform-admin/impersonation-sessions/${reviewingSession.id}/review`, {
                method: "POST",
                body: JSON.stringify({ note: reviewNote || null }),
            });
            toast.success("Marked reviewed");
            setReviewingSession(null);
            setReviewNote("");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to mark reviewed");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-w-0 space-y-6">
            <PageHeader title="Impersonation Review" description="Review platform access and privileged activity." />

            <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                <TabsList className="h-auto flex-wrap">
                    <TabsTrigger value="pending">Pending Review</TabsTrigger>
                    <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
                    <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
            </Tabs>

            <Card className="min-w-0 overflow-hidden py-0">
                {loadError ? <ErrorState description="Impersonation Review could not be loaded." onRetry={load} /> : loading ? (
                    <p className="p-4 text-sm text-muted-foreground">Loading...</p>
                ) : sessions.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No impersonation sessions.</p>
                ) : (
                    <div className="divide-y">
                        {sessions.map((session) => (
                            <div key={session.id} className="flex min-w-0 flex-wrap items-start justify-between gap-3 p-4">
                                <div className="min-w-0 flex-1 basis-64 break-words">
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <p className="min-w-0 max-w-full break-words text-sm font-medium">
                                            {session.impersonatedByName ?? "Unknown admin"} impersonated {session.userName} ({session.userEmail})
                                        </p>
                                        {session.reviewedAt && (
                                            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                                                <CheckCircle2 className="size-3" />
                                                Reviewed
                                            </Badge>
                                        )}
                                        <Badge variant="outline">{session.actionCount} action{session.actionCount === 1 ? "" : "s"} taken</Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Tenant: {session.tenantName ?? session.userEmail}</p>
                                    <p className="text-xs text-muted-foreground">Started {formatWorkspaceDateTime(session.createdAt)}{session.revokedAt ? ` -- ended ${formatWorkspaceDateTime(session.revokedAt)}` : ""}</p>
                                    <p className="mt-1 text-sm">
                                        <span className="text-muted-foreground">Reason: </span>
                                        {session.reason || <span className="italic text-muted-foreground">No reason recorded</span>}
                                    </p>
                                    {session.reviewNote && (
                                        <p className="mt-1 text-xs text-muted-foreground">Review note: {session.reviewNote}</p>
                                    )}
                                </div>
                                {!session.reviewedAt && (
                                    <Button variant="outline" size="sm" onClick={() => { setReviewingSession(session); setReviewNote(""); }}>
                                        Mark Reviewed
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <StandardDialog
                open={!!reviewingSession}
                onClose={() => setReviewingSession(null)}
                title="Mark Impersonation Session Reviewed"
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="outline" onClick={() => setReviewingSession(null)}>Cancel</Button>
                        <Button onClick={submitReview} disabled={submitting}>{submitting ? "Saving..." : "Mark Reviewed"}</Button>
                    </>
                }
            >
                <div className="space-y-2 py-2">
                    <p className="text-sm text-muted-foreground">Optional note (e.g. confirmation the actions taken match the stated reason).</p>
                    <Textarea aria-label="Review note" rows={3} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Reviewed -- actions consistent with stated reason." />
                </div>
            </StandardDialog>
        </div>
    );
}
