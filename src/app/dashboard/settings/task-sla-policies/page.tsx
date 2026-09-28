"use client";

import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";

import { useEffect, useState } from "react";
import { TimerReset } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";

type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

interface PolicyRow {
    priority: Priority;
    firstActionMinutes: string;
    completionMinutes: string;
    isActive: boolean;
    saving: boolean;
}

const PRIORITIES: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];

const PRIORITY_LABELS: Record<Priority, string> = {
    URGENT: "Urgent",
    HIGH: "High",
    MEDIUM: "Medium",
    LOW: "Low",
};

function emptyRow(priority: Priority): PolicyRow {
    return { priority, firstActionMinutes: "", completionMinutes: "", isActive: true, saving: false };
}

export default function TaskSlaPoliciesSettingsPage() {
    const [rows, setRows] = useState<Record<Priority, PolicyRow>>(() => {
        const initial = {} as Record<Priority, PolicyRow>;
        for (const priority of PRIORITIES) initial[priority] = emptyRow(priority);
        return initial;
    });
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);

    useEffect(() => {
        setLoading(true);
        setLoadError(null);
        apiFetch("/settings/task-sla-policies")
            .then((data: any[]) => {
                setRows((current) => {
                    const next = { ...current };
                    for (const policy of Array.isArray(data) ? data : []) {
                        next[policy.priority as Priority] = {
                            priority: policy.priority,
                            firstActionMinutes: policy.firstActionMinutes != null ? String(policy.firstActionMinutes) : "",
                            completionMinutes: policy.completionMinutes != null ? String(policy.completionMinutes) : "",
                            isActive: policy.isActive,
                            saving: false,
                        };
                    }
                    return next;
                });
            })
            .catch(() => setLoadError("Failed to load SLA policies. Existing targets could not be retrieved."))
            .finally(() => setLoading(false));
    }, [retryKey]);

    const updateRow = (priority: Priority, patch: Partial<PolicyRow>) => {
        setRows((current) => ({ ...current, [priority]: { ...current[priority], ...patch } }));
    };

    const saveRow = async (priority: Priority) => {
        const row = rows[priority];
        updateRow(priority, { saving: true });
        try {
            const saved = await apiFetch("/settings/task-sla-policies", {
                method: "POST",
                body: JSON.stringify({
                    priority,
                    firstActionMinutes: row.firstActionMinutes ? Number(row.firstActionMinutes) : null,
                    completionMinutes: row.completionMinutes ? Number(row.completionMinutes) : null,
                    isActive: row.isActive,
                }),
            });
            updateRow(priority, {
                firstActionMinutes: saved.firstActionMinutes != null ? String(saved.firstActionMinutes) : "",
                completionMinutes: saved.completionMinutes != null ? String(saved.completionMinutes) : "",
                isActive: saved.isActive,
                saving: false,
            });
            toast.success(`${PRIORITY_LABELS[priority]} SLA policy saved`);
        } catch (error: any) {
            toast.error(error?.message || "Failed to save SLA policy");
            updateRow(priority, { saving: false });
        }
    };

    return (
        <div className="space-y-4">
            <PageHeader title="Task SLA Policies" description="Set first-action and completion targets for each task priority." />

            {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
            ) : loadError ? <ErrorState description={loadError} onRetry={() => setRetryKey(current => current + 1)} /> : (
                <Card className="overflow-hidden py-0">
                    <div className="divide-y">
                        {PRIORITIES.map((priority) => {
                            const row = rows[priority];
                            return (
                                <div key={priority} className="flex flex-wrap items-end gap-3 p-4">
                                    <div className="flex min-w-[7rem] items-center gap-2">
                                        <TimerReset className="size-4 text-primary" />
                                        <span className="font-medium">{PRIORITY_LABELS[priority]}</span>
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor={`sla-first-${priority}`} className="text-xs">First action within (minutes)</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            className="w-40"
                                            placeholder="Not tracked"
                                            id={`sla-first-${priority}`} value={row.firstActionMinutes}
                                            onChange={(e) => updateRow(priority, { firstActionMinutes: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor={`sla-complete-${priority}`} className="text-xs">Complete within (minutes)</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            className="w-40"
                                            placeholder="Falls back to due date"
                                            id={`sla-complete-${priority}`} value={row.completionMinutes}
                                            onChange={(e) => updateRow(priority, { completionMinutes: e.target.value })}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 pb-1.5">
                                        <Switch aria-label={`${PRIORITY_LABELS[priority]} SLA enabled`} checked={row.isActive} onCheckedChange={(checked) => updateRow(priority, { isActive: checked })} />
                                        <Label className="text-xs">Enabled</Label>
                                    </div>
                                    <Button size="sm" disabled={row.saving} onClick={() => saveRow(priority)}>
                                        {row.saving ? "Saving..." : "Save"}
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}
        </div>
    );
}
