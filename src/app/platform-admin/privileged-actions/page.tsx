"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldAlert, Check, X, LogIn } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { formatWorkspaceDateTime } from "@/lib/date-format";

type PrivilegedActionRequest = {
    id: string;
    actionType: "TENANT_SUSPEND" | "TENANT_UNSUSPEND" | "IMPERSONATION_START";
    targetType: string;
    targetId: string | null;
    reason: string | null;
    status: "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED";
    requestedBy: string;
    createdAt: string;
};

const ACTION_LABELS: Record<string, string> = {
    TENANT_SUSPEND: "Suspend tenant",
    TENANT_UNSUSPEND: "Unsuspend tenant",
    IMPERSONATION_START: "Start impersonation",
};

export default function PrivilegedActionsPage() {
    const { user, login } = useAuth();
    const router = useRouter();
    const [requests, setRequests] = useState<PrivilegedActionRequest[]>([]);
    const [loadError, setLoadError] = useState(false);
    const requestVersion = useRef(0);
    const [loading, setLoading] = useState(true);
    const [approvalRequired, setApprovalRequired] = useState(false);
    const [savingToggle, setSavingToggle] = useState(false);
    const [actingId, setActingId] = useState<string | null>(null);

    const load = () => {
        const version = ++requestVersion.current;
        setLoading(true);
        setLoadError(false);
        Promise.all([
            apiFetch<PrivilegedActionRequest[]>("/privileged-action-requests"),
            apiFetch<{ privilegedActionApprovalRequired: boolean }>("/platform-admin/security/platform-settings"),
        ])
            .then(([reqs, settings]) => {
                if (version !== requestVersion.current) return;
                setRequests(Array.isArray(reqs) ? reqs : []);
                setApprovalRequired(!!settings?.privilegedActionApprovalRequired);
            })
            .catch(() => version === requestVersion.current && setLoadError(true))
            .finally(() => { if (version === requestVersion.current) setLoading(false); });
    };

    useEffect(load, []);

    const toggleApprovalRequired = async (checked: boolean) => {
        setSavingToggle(true);
        try {
            await apiFetch("/platform-admin/security/platform-settings", {
                method: "PATCH",
                body: JSON.stringify({ privilegedActionApprovalRequired: checked }),
            });
            setApprovalRequired(checked);
            toast.success(checked ? "Approval now required for platform-level privileged actions" : "Approval requirement disabled");
        } catch (error: any) {
            toast.error(error?.message || "Failed to update setting");
        } finally {
            setSavingToggle(false);
        }
    };

    const approve = async (request: PrivilegedActionRequest) => {
        setActingId(request.id);
        try {
            await apiFetch(`/privileged-action-requests/${request.id}/approve`, { method: "POST" });
            toast.success("Approved");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to approve request");
        } finally {
            setActingId(null);
        }
    };

    const reject = async (request: PrivilegedActionRequest) => {
        setActingId(request.id);
        try {
            await apiFetch(`/privileged-action-requests/${request.id}/reject`, { method: "POST" });
            toast.success("Rejected");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to reject request");
        } finally {
            setActingId(null);
        }
    };

    const claim = async (request: PrivilegedActionRequest) => {
        setActingId(request.id);
        try {
            // F06 fix (WP05): the claim route now sets the impersonation session as an HttpOnly
            // cookie directly on its own response -- login() just re-reads "who am I now".
            await apiFetch(`/privileged-action-requests/${request.id}/claim`, { method: "POST" });
            await login();
            toast.success("Impersonation session started");
            router.push("/dashboard");
        } catch (error: any) {
            toast.error(error?.message || "Failed to start impersonation");
        } finally {
            setActingId(null);
        }
    };

    return (
        <div className="min-w-0 space-y-6">
            <PageHeader title="Privileged Actions" description="Review platform access and privileged activity." />

            {!loading && !loadError && <Card className="flex min-w-0 flex-wrap items-center justify-between gap-4 p-4">
                <div>
                    <Label htmlFor="approval-required" className="text-sm font-medium">Require a second platform admin&apos;s approval</Label>
                    <p className="text-xs text-muted-foreground">When on, tenant suspend/unsuspend and impersonation requests need a different admin to approve before they take effect.</p>
                </div>
                <Switch id="approval-required" checked={approvalRequired} onCheckedChange={toggleApprovalRequired} disabled={savingToggle || loading || loadError} />
            </Card>}

            <Card className="min-w-0 overflow-hidden py-0">
                {loadError ? <ErrorState description="Privileged Actions could not be loaded." onRetry={load} /> : loading ? (
                    <p className="p-4 text-sm text-muted-foreground">Loading...</p>
                ) : requests.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No privileged action requests.</p>
                ) : (
                    <div className="divide-y">
                        {requests.map((request) => {
                            const isOwn = request.requestedBy === user?.id;
                            return (
                                <div key={request.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 p-4">
                                    <div className="min-w-0 flex-1 basis-64 break-words">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <p className="text-sm font-medium">{ACTION_LABELS[request.actionType] ?? request.actionType}</p>
                                            <Badge variant="outline">{request.status}</Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">Requested {formatWorkspaceDateTime(request.createdAt)}</p>
                                        {request.reason && <p className="mt-1 text-sm text-muted-foreground">Reason: {request.reason}</p>}
                                    </div>
                                    <div className="flex gap-2">
                                        {request.status === "PENDING" && !isOwn && (
                                            <>
                                                <Button size="sm" variant="outline" disabled={actingId === request.id} onClick={() => approve(request)}>
                                                    <Check className="size-3.5" />
                                                    Approve
                                                </Button>
                                                <Button size="sm" variant="ghost" disabled={actingId === request.id} onClick={() => reject(request)}>
                                                    <X className="size-3.5" />
                                                    Reject
                                                </Button>
                                            </>
                                        )}
                                        {request.status === "PENDING" && isOwn && (
                                            <Badge variant="outline" className="text-muted-foreground">Awaiting another admin&apos;s approval</Badge>
                                        )}
                                        {request.status === "APPROVED" && request.actionType === "IMPERSONATION_START" && isOwn && (
                                            <Button size="sm" disabled={actingId === request.id} onClick={() => claim(request)}>
                                                <LogIn className="size-3.5" />
                                                Start Impersonation
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>
        </div>
    );
}
