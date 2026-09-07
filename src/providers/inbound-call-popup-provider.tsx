"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PhoneIncoming, UserPlus, Activity as ActivityIcon, ListTodo, UserCheck, History } from "lucide-react";
import { useNotifications } from "./notification-provider";
import { apiFetch } from "@/lib/api";
import { useAuth } from "./auth-provider";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CreateLeadDialog } from "@/app/dashboard/leads/create-lead-dialog";
import { CreateActivityDialog } from "@/app/dashboard/activities/create-activity-dialog";
import { NextBestActionPanel } from "@/components/next-best-action/nba-panel";

type InboundCallContext = {
    phoneNumber: string;
    leadMatches: Array<{ id: string; name: string; email: string | null; phone: string | null; company: string | null; status: string; ownerId: string | null }>;
    opportunityMatches: Array<{ id: string; title: string; leadId: string; stageName: string | null; isClosed: boolean }>;
    partnerMatches: Array<{ id: string; legalBusinessName: string; userName: string }>;
    recentActivities: Array<{ id: string; leadId: string | null; opportunityId: string | null; outcome: string | null; createdAt: string }>;
    recentCalls: Array<{ id: string; direction: string; status: string; startedAt: string }>;
};

type InboundCallPopup = {
    id: string;
    callLogId: string;
    context: InboundCallContext;
};

// Renders a real, in-app inbound-call popup -- previously this app only offered
// `agentPanelUrl`/`enableAgentPopup` as an *external provider's* embeddable popup config with
// nothing rendered by the CRM itself. Driven off the existing app-wide SSE notification pipe
// (NotificationProvider); the default toast is suppressed for this notification type there so
// this is the only UI reaction to an inbound call landing.
export function InboundCallPopupProvider({ children }: { children: React.ReactNode }) {
    const { notifications } = useNotifications();
    const { user } = useAuth();
    const seenIds = useRef(new Set<string>());
    const [queue, setQueue] = useState<InboundCallPopup[]>([]);
    const [quickAddActivityLeadId, setQuickAddActivityLeadId] = useState<string | null>(null);
    const [quickCreateLeadOpen, setQuickCreateLeadOpen] = useState(false);
    const [taskTitle, setTaskTitle] = useState("");
    const [creatingTask, setCreatingTask] = useState(false);
    const [assigningId, setAssigningId] = useState<string | null>(null);

    useEffect(() => {
        const fresh = notifications.filter(
            (item) => item.data?.type === "INBOUND_CALL" && item.id && !seenIds.current.has(item.id),
        );
        if (!fresh.length) return;
        for (const item of fresh) seenIds.current.add(item.id!);
        setQueue((current) => [
            ...current,
            ...fresh.map((item) => ({ id: item.id!, callLogId: item.data.callLogId, context: item.data.context as InboundCallContext })),
        ]);
    }, [notifications]);

    const active = queue[0] ?? null;

    const dismiss = () => {
        setTaskTitle("");
        setQueue((current) => current.slice(1));
    };

    const assignToMe = async (lead: InboundCallContext["leadMatches"][number]) => {
        if (!user) return;
        setAssigningId(lead.id);
        try {
            await apiFetch(`/leads/${lead.id}`, {
                method: "PATCH",
                body: JSON.stringify({ name: lead.name, email: lead.email, phone: lead.phone, company: lead.company, status: lead.status, ownerId: user.id }),
            });
            toast.success(`${lead.name} assigned to you`);
        } catch (error: any) {
            toast.error(error?.message || "Failed to assign lead");
        } finally {
            setAssigningId(null);
        }
    };

    const createTask = async (leadId: string | null) => {
        if (!taskTitle.trim()) {
            toast.error("Enter a task title");
            return;
        }
        setCreatingTask(true);
        try {
            await apiFetch("/tasks", { method: "POST", body: JSON.stringify({ title: taskTitle.trim(), leadId }) });
            toast.success("Task created");
            setTaskTitle("");
        } catch (error: any) {
            toast.error(error?.message || "Failed to create task");
        } finally {
            setCreatingTask(false);
        }
    };

    return (
        <>
            {children}

            {active && (
                <StandardDialog
                    open
                    onClose={dismiss}
                    title="Incoming Call"
                    subtitle={active.context.phoneNumber}
                    icon={<PhoneIncoming className="size-5" />}
                    maxWidth="sm"
                    actions={
                        <Button variant="outline" onClick={dismiss}>
                            Dismiss
                        </Button>
                    }
                >
                    <div className="space-y-4 p-[18px] pt-1">
                        {active.context.leadMatches.length === 0 ? (
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">No matching Lead found for this number.</p>
                                <Button size="sm" onClick={() => setQuickCreateLeadOpen(true)}>
                                    <UserPlus className="size-4" />
                                    Quick Create Lead
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {active.context.leadMatches.length > 1 && (
                                    <p className="text-xs text-muted-foreground">Multiple possible matches -- pick the right record:</p>
                                )}
                                {active.context.leadMatches.map((lead) => (
                                    <div key={lead.id} className="rounded-md border p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <Link href={`/dashboard/leads/${lead.id}`} className="font-medium text-primary hover:underline" onClick={dismiss}>
                                                {lead.name}
                                            </Link>
                                            <Badge variant="outline">{lead.status}</Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">{lead.company || lead.email || ""}</p>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            <Button size="sm" variant="outline" disabled={assigningId === lead.id} onClick={() => assignToMe(lead)}>
                                                <UserCheck className="size-3.5" />
                                                Assign to Me
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => setQuickAddActivityLeadId(lead.id)}>
                                                <ActivityIcon className="size-3.5" />
                                                Add Activity
                                            </Button>
                                            <Link href={`/dashboard/leads/${lead.id}`} onClick={dismiss}>
                                                <Button size="sm" variant="ghost">
                                                    <History className="size-3.5" />
                                                    Open Timeline
                                                </Button>
                                            </Link>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* "Recommendation surfaces... telephony popup" (gap checklist: "NBA
                            recommendation surfaces") -- scoped to the primary (first) matched
                            Lead, since that's the record most relevant to a live call; self-
                            fetches and renders nothing when NEXT_BEST_ACTION is disabled or
                            there are no pending recommendations, same as every other surface. */}
                        {active.context.leadMatches[0] && (
                            <NextBestActionPanel
                                recordType="LEAD"
                                recordId={active.context.leadMatches[0].id}
                                title="Recommended Next Actions"
                            />
                        )}

                        {active.context.opportunityMatches.length > 0 && (
                            <div>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">Linked Opportunities</p>
                                <div className="space-y-1">
                                    {active.context.opportunityMatches.map((opportunity) => (
                                        <Link
                                            key={opportunity.id}
                                            href={`/dashboard/opportunities/${opportunity.id}`}
                                            onClick={dismiss}
                                            className="block text-sm text-primary hover:underline"
                                        >
                                            {opportunity.title} {opportunity.stageName ? `· ${opportunity.stageName}` : ""}
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}

                        {active.context.partnerMatches.length > 0 && (
                            <div>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">Partner Match</p>
                                {active.context.partnerMatches.map((partner) => (
                                    <p key={partner.id} className="text-sm">
                                        {partner.legalBusinessName} ({partner.userName})
                                    </p>
                                ))}
                            </div>
                        )}

                        {active.context.recentActivities.length > 0 && (
                            <div>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">Recent Timeline</p>
                                <div className="space-y-1">
                                    {active.context.recentActivities.slice(0, 5).map((activity) => (
                                        <p key={activity.id} className="text-xs text-muted-foreground">
                                            {activity.outcome || "Activity"}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-1.5">
                            <Input
                                className="w-full"
                                placeholder="Create task..."
                                value={taskTitle}
                                onChange={(event) => setTaskTitle(event.target.value)}
                            />
                            <Button
                                size="sm"
                                disabled={creatingTask}
                                onClick={() => createTask(active.context.leadMatches[0]?.id ?? null)}
                            >
                                <ListTodo className="size-4" />
                                Create Task
                            </Button>
                        </div>
                    </div>
                </StandardDialog>
            )}

            {quickAddActivityLeadId && (
                <CreateActivityDialog
                    open
                    onOpenChange={(open) => !open && setQuickAddActivityLeadId(null)}
                    defaultLeadId={quickAddActivityLeadId}
                    onSuccess={() => setQuickAddActivityLeadId(null)}
                    trigger={<span hidden />}
                />
            )}

            {quickCreateLeadOpen && active && (
                <CreateLeadDialog
                    open
                    onOpenChange={setQuickCreateLeadOpen}
                    initialData={{ phone: active.context.phoneNumber }}
                    onSuccess={() => {
                        setQuickCreateLeadOpen(false);
                        dismiss();
                    }}
                />
            )}
        </>
    );
}
