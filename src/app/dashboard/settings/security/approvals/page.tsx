"use client";

import { PageHeader } from "@/components/layout/page-header";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldAlert, Check, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatWorkspaceDateTime } from "@/lib/date-format";

type PrivilegedActionRequest = {
    id: string;
    actionType: "PERMISSION_TEMPLATE_UPDATE" | "CONNECTOR_SECRET_UPDATE" | "DISTRIBUTION_REASSIGNMENT" | "AI_EXTERNAL_SEND" | "CASE_MACRO_EXTERNAL_REPLY";
    targetType: string;
    targetId: string | null;
    status: "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED";
    requestedBy: string;
    createdAt: string;
};

const ACTION_LABELS: Record<string, string> = {
    PERMISSION_TEMPLATE_UPDATE: "Update permission template",
    CONNECTOR_SECRET_UPDATE: "Rotate API key",
    DISTRIBUTION_REASSIGNMENT: "Reassign record owner",
    AI_EXTERNAL_SEND: "Send AI-drafted communication",
    CASE_MACRO_EXTERNAL_REPLY: "Send case macro reply",
};

// Gap checklist: "privileged action controls" -- tenant-scoped half of the approval queue
// (permission template changes, API key rotation). Only appears actionable when a platform
// admin has turned on "Require a second admin's approval" on this tenant's SecurityPolicy;
// otherwise the queue just stays empty since those actions execute immediately instead.
export default function TenantPrivilegedActionsPage() {
    const { user } = useAuth();
    const [requests, setRequests] = useState<PrivilegedActionRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [actingId, setActingId] = useState<string | null>(null);

    const load = () => {
        setLoading(true);
        apiFetch<PrivilegedActionRequest[]>("/privileged-action-requests")
            .then((data) => setRequests(Array.isArray(data) ? data : []))
            .catch(() => toast.error("Failed to load privileged action requests"))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const approve = async (request: PrivilegedActionRequest) => {
        setActingId(request.id);
        try {
            await apiFetch(`/privileged-action-requests/${request.id}/approve`, { method: "POST" });
            toast.success("Approved and applied");
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

    return (
        <div className="min-w-0">
            <PageHeader title="Approvals" description="Sensitive changes waiting for a second admin: permission template changes, API key rotations, reassignments and AI-drafted messages." />

            <Card className="overflow-hidden py-0">
                {loading ? (
                    <p role="status" className="p-4 text-sm text-muted-foreground">Loading…</p>
                ) : requests.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">Nothing is waiting for approval.</p>
                ) : (
                    <div className="divide-y">
                        {requests.map((request) => {
                            const isOwn = request.requestedBy === user?.id;
                            return (
                                <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium">{ACTION_LABELS[request.actionType] ?? request.actionType}</p>
                                            <Badge variant="outline">{request.status}</Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">Requested {formatWorkspaceDateTime(request.createdAt)}</p>
                                    </div>
                                    {request.status === "PENDING" && (
                                        isOwn ? (
                                            <Badge variant="outline" className="text-muted-foreground">Awaiting another admin&apos;s approval</Badge>
                                        ) : (
                                            <div className="flex gap-2">
                                                <Button size="sm" variant="outline" disabled={actingId === request.id} onClick={() => approve(request)}>
                                                    <Check className="size-3.5" />
                                                    Approve
                                                </Button>
                                                <Button size="sm" variant="ghost" disabled={actingId === request.id} onClick={() => reject(request)}>
                                                    <X className="size-3.5" />
                                                    Reject
                                                </Button>
                                            </div>
                                        )
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>
        </div>
    );
}
