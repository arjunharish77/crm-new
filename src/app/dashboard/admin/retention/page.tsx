"use client";

import { useEffect, useState } from "react";
import { Edit, History, Loader2, Play, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/providers/auth-provider";
import { toast } from "sonner";
import { formatWorkspaceDateTime } from "@/lib/date-format";

interface RetentionPolicy {
    id: string;
    tenantId: string | null;
    leadRetentionDays: number;
    opportunityRetentionDays: number;
    activityRetentionDays: number;
    auditLogRetentionDays: number;
    deletedRecordsRetentionDays: number;
    lastEnforcedAt: string | null;
    tenant?: {
        id: string;
        name: string;
    } | null;
}

export default function RetentionPage() {
    const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
    const [loading, setLoading] = useState(true);
    const [enforcing, setEnforcing] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState<RetentionPolicy | null>(null);
    const { token, user } = useAuth();
    const isPlatformAdmin = user?.isPlatformAdmin;

    useEffect(() => {
        if (token && isPlatformAdmin) {
            fetchPolicies();
        }
    }, [token, isPlatformAdmin]);

    const fetchPolicies = async () => {
        setLoading(true);
        try {
            const res = await fetch(
                `/api/platform-admin/retention/policies`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            if (res.ok) {
                const data = await res.json();
                setPolicies(data);
            } else {
                toast.error("Failed to fetch retention policies");
            }
        } catch (error) {
            toast.error("Failed to load retention policies");
        } finally {
            setLoading(false);
        }
    };

    const updatePolicy = async (tenantId: string | null, values: Partial<RetentionPolicy>) => {
        try {
            const res = await fetch(
                `/api/platform-admin/retention/policy/${tenantId || 'global'}`,
                {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(values),
                }
            );

            if (res.ok) {
                toast.success("Retention policy updated");
                fetchPolicies();
                setEditingPolicy(null);
            } else {
                toast.error("Failed to update policy");
            }
        } catch (error) {
            toast.error("Failed to update policy");
        }
    };

    const enforceNow = async () => {
        setEnforcing(true);
        try {
            const res = await fetch(
                `/api/platform-admin/retention/enforce`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            if (res.ok) {
                const results = await res.json();
                toast.success(
                    `Enforcement complete! Deleted: ${results.leadsDeleted} leads, ${results.opportunitiesDeleted} opps, ${results.activitiesDeleted} activities, ${results.auditLogsDeleted} logs`
                );
                fetchPolicies();
            } else {
                toast.error("Failed to enforce policies");
            }
        } catch (error) {
            toast.error("Failed to enforce policies");
        } finally {
            setEnforcing(false);
        }
    };

    if (!isPlatformAdmin) {
        return (
            <div className="p-8 text-center text-destructive">You do not have permission to view this page.</div>
        );
    }

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Loader2 className="size-6 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[1200px] p-4">
            <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                    <h1 className="mb-1 text-lg font-bold">Data Retention Policies</h1>
                    <p className="text-sm text-muted-foreground">
                        Configure automatic deletion rules for data compliance.
                    </p>
                </div>
                <Button
                    onClick={enforceNow}
                    disabled={enforcing}
                >
                    {enforcing ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                    {enforcing ? "Enforcing..." : "Enforce Now"}
                </Button>
            </div>

            <div className="rounded-lg border bg-card">
                <div className="border-b p-4">
                    <h2 className="text-base font-semibold">Retention Periods</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Configure how long data is retained (in days). Set to 0 to disable deletion.
                    </p>
                </div>
                <div>
                    {policies.length === 0 ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">
                                No retention policies configured. Create one to get started.
                        </div>
                    ) : (
                        <div className="divide-y">
                            {policies.map((policy) => (
                                <div key={policy.id} className="p-6">
                                    <div className="mb-6 flex items-start justify-between gap-4">
                                        <div>
                                            <div className="font-semibold">
                                                {policy.tenant ? policy.tenant.name : "Global Default Policy"}
                                            </div>
                                            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                                <History className="size-4" />
                                                <span>
                                                    {policy.lastEnforcedAt
                                                        ? `Last enforced: ${formatWorkspaceDateTime(policy.lastEnforcedAt)}`
                                                        : "Never enforced"}
                                                </span>
                                            </div>
                                        </div>
                                        <Button
                                            variant={editingPolicy?.id === policy.id ? "outline" : "ghost"}
                                            size="sm"
                                            onClick={() => setEditingPolicy(editingPolicy?.id === policy.id ? null : policy)}
                                        >
                                            {editingPolicy?.id === policy.id ? <X className="size-4" /> : <Edit className="size-4" />}
                                            {editingPolicy?.id === policy.id ? "Cancel" : "Edit"}
                                        </Button>
                                    </div>

                                    {editingPolicy?.id === policy.id ? (
                                        <div>
                                            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                                                <RetentionInput
                                                    label="Leads (days)"
                                                    value={editingPolicy.leadRetentionDays}
                                                    onChange={(value) => setEditingPolicy({ ...editingPolicy, leadRetentionDays: value })}
                                                />
                                                <RetentionInput
                                                    label="Opportunities (days)"
                                                    value={editingPolicy.opportunityRetentionDays}
                                                    onChange={(value) => setEditingPolicy({ ...editingPolicy, opportunityRetentionDays: value })}
                                                />
                                                <RetentionInput
                                                    label="Activities (days)"
                                                    value={editingPolicy.activityRetentionDays}
                                                    onChange={(value) => setEditingPolicy({ ...editingPolicy, activityRetentionDays: value })}
                                                />
                                                <RetentionInput
                                                    label="Audit Logs (days)"
                                                    value={editingPolicy.auditLogRetentionDays}
                                                    onChange={(value) => setEditingPolicy({ ...editingPolicy, auditLogRetentionDays: value })}
                                                />
                                            </div>
                                            <div className="mt-4 flex justify-end">
                                                    <Button
                                                        onClick={() => updatePolicy(policy.tenantId, {
                                                            leadRetentionDays: editingPolicy.leadRetentionDays,
                                                            opportunityRetentionDays: editingPolicy.opportunityRetentionDays,
                                                            activityRetentionDays: editingPolicy.activityRetentionDays,
                                                            auditLogRetentionDays: editingPolicy.auditLogRetentionDays,
                                                        })}
                                                    >
                                                        <Save className="size-4" />
                                                        Save Changes
                                                    </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                                            <RetentionStat label="Leads" value={policy.leadRetentionDays} />
                                            <RetentionStat label="Opportunities" value={policy.opportunityRetentionDays} />
                                            <RetentionStat label="Activities" value={policy.activityRetentionDays} />
                                            <RetentionStat label="Audit Logs" value={policy.auditLogRetentionDays} />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function RetentionInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            <Input
                type="number"
                value={value}
                onChange={(event) => onChange(parseInt(event.target.value) || 0)}
            />
        </div>
    );
}

function RetentionStat({ label, value }: { label: string; value: number }) {
    return (
        <div>
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="font-medium">{value} days</div>
        </div>
    );
}
