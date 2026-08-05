'use client';

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatWorkspaceDate, formatWorkspaceDateTime, parseWorkspaceDate } from "@/lib/date-format";
import { apiFetch } from "@/lib/api";
import { Opportunity, OpportunityStageHistory, StageDefinition } from "@/types/opportunities";
import { Activity } from "@/types/activities";
import { PaginatedResponse } from "@/types/common";
import { Timeline } from "@/components/timeline/timeline";
import { RecordHistory } from "@/components/governance/record-history";
import { EditOpportunityDialog } from "../edit-opportunity-dialog";
import { CreateActivityDialog } from "../../activities/create-activity-dialog";
import { OpportunityStageHistoryList } from "@/components/opportunities/opportunity-stage-history";
import { NotesPanel } from "@/components/common/notes-panel";
import { ContextualFormsPanel } from "@/components/forms/contextual-forms-panel";
import { RelatedTasksPanel } from "@/components/tasks/related-tasks-panel";
import { CommunicationEventsPanel } from "@/components/communications/communication-events-panel";
import { formatCurrency, cn } from "@/lib/utils";
import { fadeInUp } from "@/lib/motion";
import { useAuth } from "@/providers/auth-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { PredictiveScorePanel } from "@/components/scoring/predictive-score";

type ActivityTimeFilter = "ALL" | "TODAY" | "7D" | "30D";

export default function OpportunityDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const opportunityId = params.id as string;

    const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
    const [stages, setStages] = useState<StageDefinition[]>([]);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [history, setHistory] = useState<OpportunityStageHistory[]>([]);
    const [taskCount, setTaskCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [tabValue, setTabValue] = useState<"activity" | "details" | "scoring" | "stage" | "tasks" | "communications" | "notes" | "audit">("activity");
    const [activityTypeFilter, setActivityTypeFilter] = useState<string>("ALL");
    const [activityTimeFilter, setActivityTimeFilter] = useState<ActivityTimeFilter>("ALL");

    const loadData = useCallback(async () => {
        try {
            const opp = await apiFetch<Opportunity>(`/opportunities/${opportunityId}`);
            setOpportunity(opp);
            setStages(opp.opportunityType?.stages || []);

            const filter = {
                logic: "AND",
                conditions: [{ field: "opportunityId", operator: "equals", value: opportunityId }],
            };
            const response = await apiFetch<PaginatedResponse<Activity> | Activity[]>(
                `/activities?filters=${JSON.stringify(filter)}&limit=100`
            );

            if ("data" in response) {
                setActivities(response.data);
            } else if (Array.isArray(response)) {
                setActivities(response);
            }

            const histData = await apiFetch(`/opportunities/${opportunityId}/history`);
            setHistory(histData);
            const taskData = await apiFetch<any[]>(`/tasks?opportunityId=${opportunityId}`);
            setTaskCount(Array.isArray(taskData) ? taskData.length : 0);
        } catch {
            toast.error("Failed to load opportunity details");
        } finally {
            setLoading(false);
        }
    }, [opportunityId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const currentStage = stages.find((stage) => stage.id === opportunity?.stageId);

    const activityTypes = useMemo(
        () =>
            Array.from(
                new Map(
                    activities
                        .filter((activity) => activity.type?.id)
                        .map((activity) => [activity.type!.id, activity.type!])
                ).values()
            ),
        [activities]
    );

    const filteredActivities = useMemo(() => {
        const now = Date.now();
        return activities.filter((activity) => {
            if (activityTypeFilter !== "ALL" && activity.typeId !== activityTypeFilter) {
                return false;
            }

            if (activityTimeFilter === "ALL") return true;
            const createdAtDate = parseWorkspaceDate(activity.createdAt);
            const createdAt = createdAtDate?.getTime() ?? 0;
            if (activityTimeFilter === "TODAY") {
                return formatWorkspaceDate(createdAtDate) === formatWorkspaceDate(new Date());
            }
            if (activityTimeFilter === "7D") {
                return createdAt >= now - 7 * 24 * 60 * 60 * 1000;
            }
            if (activityTimeFilter === "30D") {
                return createdAt >= now - 30 * 24 * 60 * 60 * 1000;
            }
            return true;
        });
    }, [activities, activityTimeFilter, activityTypeFilter]);

    const handleStageChange = async (newStageId: string) => {
        try {
            await apiFetch(`/opportunities/${opportunityId}`, {
                method: "PATCH",
                body: JSON.stringify({ stageId: newStageId }),
            });
            toast.success("Stage updated");
            loadData();
        } catch {
            toast.error("Failed to update stage");
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="size-9 animate-spin text-primary" />
            </div>
        );
    }

    if (!opportunity) {
        return (
            <div className="p-8 text-center">
                <h2 className="text-xl font-bold">Opportunity not found</h2>
                <Button className="mt-4" onClick={() => router.push("/dashboard/opportunities")}>
                    Back to Opportunities
                </Button>
            </div>
        );
    }

    return (
        <motion.div
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            className="mx-auto max-w-[1440px] p-3 md:p-4"
        >
            <div className="mb-4 flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
                <Button
                    variant="ghost"
                    onClick={() => router.back()}
                    className="min-h-[34px] text-muted-foreground"
                >
                    <ArrowLeft className="size-4" />
                    Back
                </Button>

                <div className="flex flex-wrap gap-2">
                    <CreateActivityDialog
                        defaultLeadId={opportunity.leadId || undefined}
                        defaultOpportunityId={opportunity.id}
                        onSuccess={loadData}
                        trigger={
                            <Button
                                size="sm"
                                className="min-h-9 bg-secondary-container px-3.5 text-on-secondary-container shadow-none hover:bg-secondary-container/80"
                            >
                                <Plus className="size-4" />
                                Activity
                            </Button>
                        }
                    />
                    <ContextualFormsPanel
                        placement="OPPORTUNITY_DETAIL"
                        context={{ leadId: opportunity.leadId, opportunityId: opportunity.id }}
                        entityData={opportunity}
                        onSaved={loadData}
                    />
                    <Button size="sm" className="min-h-9 px-4" onClick={() => setShowEditDialog(true)}>
                        <Pencil className="size-4" />
                        Edit
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
                <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
                    <div className="overflow-hidden rounded-2xl border border-secondary/20">
                        <div className="bg-secondary px-5 py-4.5 text-secondary-foreground">
                            <div className="mb-3 flex items-center gap-3">
                                <Avatar className="size-12">
                                    <AvatarFallback className="bg-white/15 text-base font-extrabold text-white">
                                        {opportunity.title.charAt(0)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <h2 className="text-lg leading-tight font-extrabold">{opportunity.title}</h2>
                                    <p className="text-sm text-secondary-foreground/80">
                                        {opportunity.opportunityType?.name || "Opportunity"}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                                <Badge className="h-[22px] rounded-lg border-transparent bg-white/15 font-extrabold text-white">
                                    {currentStage?.name || "Unassigned"}
                                </Badge>
                                <Badge className="h-[22px] rounded-lg border-transparent bg-white/10 font-extrabold text-white">
                                    {opportunity.priority || "MEDIUM"}
                                </Badge>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 divide-x divide-white/10 bg-black/20">
                            <MetricCell label="Value" value={formatCurrency(opportunity.amount || 0)} />
                            <MetricCell label="Probability" value={`${currentStage?.probability ?? 0}%`} />
                            <MetricCell label="Activities" value={String(activities.length)} />
                        </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card">
                        <div className="border-b border-border px-3 py-2.5">
                            <h3 className="text-sm font-extrabold">Deal Properties</h3>
                        </div>
                        <div className="divide-y divide-border">
                            <PropertyRow label="Stage">{currentStage?.name || "—"}</PropertyRow>
                            <PropertyRow label="Type">{opportunity.opportunityType?.name || "—"}</PropertyRow>
                            <PropertyRow label="Value">{formatCurrency(opportunity.amount || 0)}</PropertyRow>
                            <PropertyRow label="Priority">{opportunity.priority || "—"}</PropertyRow>
                            <PropertyRow label="Expected Close">
                                {opportunity.expectedCloseDate ? formatWorkspaceDate(opportunity.expectedCloseDate) : "—"}
                            </PropertyRow>
                            <PropertyRow label="Created">{formatWorkspaceDate(opportunity.createdAt)}</PropertyRow>
                        </div>
                    </div>

                    <PredictiveScorePanel recordType="OPPORTUNITY" recordId={opportunity.id} score={opportunity.predictiveScore} />

                    <div className="rounded-xl border border-border bg-card">
                        <div className="border-b border-border px-3 py-2.5">
                            <h3 className="text-sm font-extrabold">Stage Progression</h3>
                        </div>
                        <div className="flex flex-col gap-1.5 p-2.5">
                            {stages.map((stage) => {
                                const active = stage.id === opportunity.stageId;
                                return (
                                    <button
                                        key={stage.id}
                                        type="button"
                                        onClick={() => !active && handleStageChange(stage.id)}
                                        className={cn(
                                            "flex min-h-9 items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                            active
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-primary/[0.04] text-foreground hover:bg-primary/10"
                                        )}
                                    >
                                        <span className="flex items-center gap-2">
                                            <span
                                                className="size-2 shrink-0 rounded-full"
                                                style={{ backgroundColor: active ? "#fff" : stage.color || "var(--primary)" }}
                                            />
                                            <span className="text-sm font-bold">{stage.name}</span>
                                        </span>
                                        <span className={cn("text-xs", active ? "opacity-90" : "opacity-70")}>
                                            {stage.probability}%
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-3">
                        <h3 className="mb-2.5 text-sm font-extrabold">Linked Lead</h3>
                        {opportunity.lead ? (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <Avatar className="size-9.5">
                                        <AvatarFallback className="bg-primary-container text-on-primary-container">
                                            {opportunity.lead.name.charAt(0)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                        <p className="font-extrabold">{opportunity.lead.name}</p>
                                        <p className="text-sm text-muted-foreground">{opportunity.lead.email || "No email"}</p>
                                    </div>
                                </div>
                                <Button asChild variant="outline" size="sm" className="min-h-[34px] w-full">
                                    <Link href={`/dashboard/leads/${opportunity.leadId}`}>Open Lead</Link>
                                </Button>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">No linked lead.</p>
                        )}
                    </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                    <div className="border-b border-border bg-surface-container-lowest px-2 py-2">
                        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                            <WorkspaceTab
                                label={`Activity History (${filteredActivities.length})`}
                                active={tabValue === "activity"}
                                onClick={() => setTabValue("activity")}
                            />
                            <WorkspaceTab label="Deal Details" active={tabValue === "details"} onClick={() => setTabValue("details")} />
                            <WorkspaceTab label="Scoring" active={tabValue === "scoring"} onClick={() => setTabValue("scoring")} />
                            <WorkspaceTab
                                label={`Stage History (${history.length})`}
                                active={tabValue === "stage"}
                                onClick={() => setTabValue("stage")}
                            />
                            <WorkspaceTab label={`Tasks (${taskCount})`} active={tabValue === "tasks"} onClick={() => setTabValue("tasks")} />
                            <WorkspaceTab label="Communications" active={tabValue === "communications"} onClick={() => setTabValue("communications")} />
                            <WorkspaceTab label="Notes" active={tabValue === "notes"} onClick={() => setTabValue("notes")} />
                            <WorkspaceTab label="Audit" active={tabValue === "audit"} onClick={() => setTabValue("audit")} />
                        </div>
                    </div>

                    <div className="p-3 md:p-4">
                        {tabValue === "activity" && (
                            <div className="space-y-3">
                                <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-container-lowest p-2.5 sm:flex-row sm:items-center sm:justify-between">
                                    <span className="text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
                                        Activity Filters
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                        <Select value={activityTypeFilter} onValueChange={setActivityTypeFilter}>
                                            <SelectTrigger className="w-[148px] bg-background">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ALL">All Types</SelectItem>
                                                {activityTypes.map((type) => (
                                                    <SelectItem key={type.id} value={type.id}>
                                                        {type.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Select
                                            value={activityTimeFilter}
                                            onValueChange={(value) => setActivityTimeFilter(value as ActivityTimeFilter)}
                                        >
                                            <SelectTrigger className="w-[120px] bg-background">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ALL">All Time</SelectItem>
                                                <SelectItem value="TODAY">Today</SelectItem>
                                                <SelectItem value="7D">7 Days</SelectItem>
                                                <SelectItem value="30D">30 Days</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <Timeline activities={filteredActivities} />
                            </div>
                        )}

                        {tabValue === "details" && (
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <DetailPanel title="Deal Summary">
                                    <PropertyRow label="Title">{opportunity.title}</PropertyRow>
                                    <PropertyRow label="Type">{opportunity.opportunityType?.name || "—"}</PropertyRow>
                                    <PropertyRow label="Stage">{currentStage?.name || "—"}</PropertyRow>
                                    <PropertyRow label="Value">{formatCurrency(opportunity.amount || 0)}</PropertyRow>
                                </DetailPanel>
                                <DetailPanel title="Commercials">
                                    <PropertyRow label="Priority">{opportunity.priority || "—"}</PropertyRow>
                                    <PropertyRow label="Probability">{`${currentStage?.probability ?? 0}%`}</PropertyRow>
                                    <PropertyRow label="Expected Close">
                                        {opportunity.expectedCloseDate ? formatWorkspaceDateTime(opportunity.expectedCloseDate) : "—"}
                                    </PropertyRow>
                                    <PropertyRow label="Created">{formatWorkspaceDateTime(opportunity.createdAt)}</PropertyRow>
                                </DetailPanel>
                            </div>
                        )}

                        {tabValue === "scoring" && (
                            <PredictiveScorePanel recordType="OPPORTUNITY" recordId={opportunity.id} score={opportunity.predictiveScore} />
                        )}

                        {tabValue === "stage" && <OpportunityStageHistoryList history={history} />}

                        {tabValue === "tasks" && (
                            <div className="rounded-lg bg-surface-container-lowest p-2.5">
                                <RelatedTasksPanel
                                    leadId={opportunity.leadId}
                                    opportunityId={opportunity.id}
                                    currentUserId={user?.id}
                                />
                            </div>
                        )}

                        {tabValue === "notes" && (
                            <div className="rounded-lg bg-surface-container-lowest p-2.5">
                                <NotesPanel entityType="opportunity" entityId={opportunity.id} currentUserId={user?.id} />
                            </div>
                        )}

                        {tabValue === "communications" && (
                            <div className="rounded-lg bg-surface-container-lowest p-2.5">
                                <CommunicationEventsPanel entityType="OPPORTUNITY" entityId={opportunity.id} />
                            </div>
                        )}

                        {tabValue === "audit" && (
                            <div className="rounded-lg bg-surface-container-lowest p-2.5">
                                <RecordHistory entityType="OPPORTUNITY" entityId={opportunity.id} />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <EditOpportunityDialog opportunity={opportunity} open={showEditDialog} onOpenChange={setShowEditDialog} onSuccess={loadData} />
        </motion.div>
    );
}

function MetricCell({ label, value }: { label: string; value: string }) {
    return (
        <div className="border-t border-white/10 px-2 py-2.5 text-center">
            <p className="text-base leading-tight font-extrabold text-white">{value}</p>
            <p className="text-xs text-white/80">{label}</p>
        </div>
    );
}

function DetailPanel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-3 py-2.5">
                <h4 className="text-sm font-extrabold">{title}</h4>
            </div>
            <div className="divide-y divide-border">{children}</div>
        </div>
    );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="text-right text-sm font-bold">{children}</span>
        </div>
    );
}

function WorkspaceTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "min-h-[34px] shrink-0 rounded-lg px-2.5 py-1.5 text-[0.82rem] font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            )}
        >
            {label}
        </button>
    );
}
