'use client';

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    ArrowLeft,
    Building2,
    Calendar,
    Flame,
    Link2,
    Loader2,
    Mail,
    Phone,
    Plus,
    Pencil,
    Tag,
} from "lucide-react";
import { toast } from "sonner";
import { formatWorkspaceDate, formatWorkspaceDateTime, parseWorkspaceDate } from "@/lib/date-format";
import { apiFetch } from "@/lib/api";
import { Lead } from "@/types/leads";
import { Activity } from "@/types/activities";
import { Opportunity } from "@/types/opportunities";
import { PaginatedResponse } from "@/types/common";
import { CreateActivityDialog } from "@/app/dashboard/activities/create-activity-dialog";
import { CreateOpportunityDialog } from "@/app/dashboard/opportunities/create-opportunity-dialog";
import { EditLeadDialog } from "../edit-lead-dialog";
import { Timeline } from "@/components/timeline/timeline";
import { NotesPanel } from "@/components/common/notes-panel";
import { ContextualFormsPanel } from "@/components/forms/contextual-forms-panel";
import { RecordHistory } from "@/components/governance/record-history";
import { RelatedTasksPanel } from "@/components/tasks/related-tasks-panel";
import { formatCurrency, cn } from "@/lib/utils";
import { fadeInUp } from "@/lib/motion";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PredictiveScorePanel } from "@/components/scoring/predictive-score";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

type ActivityTimeFilter = "ALL" | "TODAY" | "7D" | "30D";

const ALL_TYPES_VALUE = "ALL";

export default function LeadDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const leadId = params.id as string;

    const [lead, setLead] = useState<Lead | null>(null);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    const [taskCount, setTaskCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [tabValue, setTabValue] = useState<"activity" | "details" | "scoring" | "opportunities" | "tasks" | "notes" | "audit">("activity");
    const [activityTypeFilter, setActivityTypeFilter] = useState<string>("ALL");
    const [activityTimeFilter, setActivityTimeFilter] = useState<ActivityTimeFilter>("ALL");

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [leadData, oppsData] = await Promise.all([
                apiFetch(`/leads/${leadId}`),
                apiFetch("/opportunities"),
            ]);

            setLead(leadData as Lead);

            const allOpps = (oppsData as any).data || [];
            if (Array.isArray(allOpps)) {
                setOpportunities(allOpps.filter((o: Opportunity) => o.leadId === leadId));
            }

            const filter = { logic: "AND", conditions: [{ field: "leadId", operator: "equals", value: leadId }] };
            const actResponse = await apiFetch<PaginatedResponse<Activity> | Activity[]>(
                `/activities?filters=${JSON.stringify(filter)}&limit=100`
            );

            if ("data" in actResponse) {
                setActivities(actResponse.data);
            } else if (Array.isArray(actResponse)) {
                setActivities(actResponse);
            }

            const taskData = await apiFetch<any[]>(`/tasks?leadId=${leadId}`);
            setTaskCount(Array.isArray(taskData) ? taskData.length : 0);
        } catch {
            toast.error("Failed to fetch lead details");
        } finally {
            setLoading(false);
        }
    }, [leadId]);

    useEffect(() => {
        if (leadId) loadData();
    }, [leadId, loadData]);

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

            if (activityTimeFilter === "ALL") {
                return true;
            }

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

    const handleClickToCall = useCallback(async () => {
        if (!lead?.phone) return;
        try {
            const result = await apiFetch("/integrations/telephony/click-to-call", {
                method: "POST",
                body: JSON.stringify({ phoneNumber: lead.phone, leadId: lead.id, execute: true }),
            });
            toast.success(result?.success ? "Call request sent" : "Click-to-call request created");
        } catch (error: any) {
            toast.error(error.message || "Failed to start click-to-call");
        }
    }, [lead]);

    const lastActivity = activities[0];
    const openOpportunityValue = opportunities.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const statusClassName = getStatusClassName(lead?.status || "NEW");

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="size-11 animate-spin text-primary" />
            </div>
        );
    }

    if (!lead) {
        return (
            <div className="p-8 text-center">
                <h1 className="text-2xl font-semibold">Lead not found</h1>
                <Button onClick={() => router.push("/dashboard/leads")} className="mt-4">
                    Back to Leads
                </Button>
            </div>
        );
    }

    return (
        <motion.div
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            className="mx-auto max-w-[1440px] p-2.5 md:p-4"
        >
            <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <Button
                        variant="ghost"
                        onClick={() => router.back()}
                        className="mb-1.5 h-[34px] rounded-[10px] px-3 text-muted-foreground"
                    >
                        <ArrowLeft className="size-4" />
                        Back
                    </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <CreateActivityDialog
                        defaultLeadId={lead.id}
                        onSuccess={loadData}
                        trigger={
                            <Button className="h-9 rounded-[10px] bg-secondary-container px-3.5 text-on-secondary-container shadow-none hover:bg-secondary-container/80">
                                <Plus className="size-4" />
                                Activity
                            </Button>
                        }
                    />
                    <CreateOpportunityDialog
                        defaultLeadId={lead.id}
                        onSuccess={loadData}
                        trigger={
                            <Button variant="outline" className="h-9 rounded-[10px] px-3.5">
                                <Plus className="size-4" />
                                Opportunity
                            </Button>
                        }
                    />
                    <ContextualFormsPanel
                        placement="LEAD_DETAIL"
                        context={{ leadId }}
                        entityData={lead}
                        onSaved={loadData}
                    />
                    <Button
                        onClick={() => setShowEditDialog(true)}
                        className="h-9 rounded-[10px] px-4"
                    >
                        <Pencil className="size-4" />
                        Edit
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[3.8fr_8.2fr]">
                <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
                    <Card className="gap-0 overflow-hidden rounded-[14px] border-primary/20 bg-transparent py-0">
                        <div className="bg-gradient-to-b from-primary/95 to-primary/90 px-5 py-[18px] text-primary-foreground">
                            <div className="mb-[10px] flex items-center gap-[10px]">
                                <Avatar className="size-12">
                                    <AvatarFallback className="bg-white/15 text-lg font-extrabold text-primary-foreground">
                                        {lead.name?.charAt(0) || "L"}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <h2 className="text-lg font-extrabold leading-tight">{lead.name}</h2>
                                    <p className="text-sm italic opacity-80">{lead.status}</p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-[7px]">
                                <CompactContactRow icon={<Mail className="size-[15px]" />} value={lead.email || "No email"} />
                                <CompactContactRow icon={<Phone className="size-[15px]" />} value={lead.phone || "No phone"} onClick={lead.phone ? handleClickToCall : undefined} tooltip="Click to call" />
                                <CompactContactRow icon={<Building2 className="size-[15px]" />} value={lead.company || "No company"} />
                                <CompactContactRow icon={<Tag className="size-[15px]" />} value={lead.source || "Unknown source"} />
                            </div>
                        </div>

                        <div className="grid grid-cols-3">
                            <MetricCell label="Lead Score" value={String(lead.score ?? 0)} />
                            <MetricCell label="Activities" value={String(activities.length)} />
                            <MetricCell label="Deals" value={String(opportunities.length)} />
                        </div>
                    </Card>

                    <Card className="gap-0 rounded-xl py-0">
                        <div className="border-b px-3 py-[9px]">
                            <h3 className="text-base font-extrabold">Lead Properties</h3>
                        </div>
                        <div className="flex flex-col divide-y">
                            <PropertyRow label="Status">
                                <Badge
                                    variant="outline"
                                    className={cn("h-6 text-[0.68rem] font-extrabold uppercase tracking-wide", statusClassName)}
                                >
                                    {lead.status}
                                </Badge>
                            </PropertyRow>
                            <PropertyRow label="Email">{lead.email || "—"}</PropertyRow>
                            <PropertyRow label="Phone">{lead.phone || "—"}</PropertyRow>
                            <PropertyRow label="Company">{lead.company || "—"}</PropertyRow>
                            <PropertyRow label="Source">{lead.source || "—"}</PropertyRow>
                            <PropertyRow label="Created">{formatWorkspaceDate(lead.createdAt)}</PropertyRow>
                            <PropertyRow label="Updated">{formatWorkspaceDate(lead.updatedAt)}</PropertyRow>
                        </div>
                    </Card>

                    <Card className="rounded-xl p-3">
                        <h3 className="mb-[9px] text-base font-extrabold">Quick Snapshot</h3>
                        <div className="grid grid-cols-3 gap-2">
                            <SnapshotCard icon={<Flame className="size-4" />} label="Score" value={String(lead.score ?? 0)} />
                            <SnapshotCard icon={<Calendar className="size-4" />} label="Last Touch" value={lastActivity ? relativeDay(lastActivity.createdAt) : "None"} />
                            <SnapshotCard icon={<Link2 className="size-4" />} label="Open Opportunity Value" value={formatCurrency(openOpportunityValue)} />
                        </div>
                    </Card>

                    <PredictiveScorePanel recordType="LEAD" recordId={lead.id} score={lead.predictiveScore} />
                </div>

                <div>
                    <Card className="gap-0 overflow-hidden rounded-[14px] py-0">
                        <div className="border-b bg-surface-container-lowest px-2 py-2">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div className="flex gap-1.5 overflow-x-auto pb-0.5 md:pb-0">
                                    <WorkspaceTab label={`Activity History (${filteredActivities.length})`} active={tabValue === "activity"} onClick={() => setTabValue("activity")} />
                                    <WorkspaceTab label="Lead Details" active={tabValue === "details"} onClick={() => setTabValue("details")} />
                                    <WorkspaceTab label="Scoring" active={tabValue === "scoring"} onClick={() => setTabValue("scoring")} />
                                    <WorkspaceTab label={`Opportunities (${opportunities.length})`} active={tabValue === "opportunities"} onClick={() => setTabValue("opportunities")} />
                                    <WorkspaceTab label={`Tasks (${taskCount})`} active={tabValue === "tasks"} onClick={() => setTabValue("tasks")} />
                                    <WorkspaceTab label="Notes" active={tabValue === "notes"} onClick={() => setTabValue("notes")} />
                                    <WorkspaceTab label="Audit" active={tabValue === "audit"} onClick={() => setTabValue("audit")} />
                                </div>
                            </div>
                        </div>

                        <div className="p-2.5 md:p-3">
                            {tabValue === "activity" && (
                                <div className="flex flex-col gap-[10px]">
                                    <div className="flex flex-col gap-[6px] rounded-[10px] border bg-surface-container-lowest p-2 sm:flex-row sm:items-center sm:justify-between">
                                        <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
                                            Activity Filters
                                        </span>
                                        <div className="flex flex-wrap gap-[6px]">
                                            <Select value={activityTypeFilter} onValueChange={setActivityTypeFilter}>
                                                <SelectTrigger size="sm" className="min-w-[148px] rounded-lg bg-background">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={ALL_TYPES_VALUE}>All Types</SelectItem>
                                                    {activityTypes.map((type) => (
                                                        <SelectItem key={type.id} value={type.id}>
                                                            {type.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Select value={activityTimeFilter} onValueChange={(value) => setActivityTimeFilter(value as ActivityTimeFilter)}>
                                                <SelectTrigger size="sm" className="min-w-[120px] rounded-lg bg-background">
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
                                <div className="grid gap-[10px] md:grid-cols-2">
                                    <DetailPanel title="Identity">
                                        <PropertyRow label="Lead Name">{lead.name}</PropertyRow>
                                        <PropertyRow label="Status">{lead.status}</PropertyRow>
                                        <PropertyRow label="Company">{lead.company || "—"}</PropertyRow>
                                        <PropertyRow label="Source">{lead.source || "—"}</PropertyRow>
                                    </DetailPanel>
                                    <DetailPanel title="Contact">
                                        <PropertyRow label="Email">{lead.email || "—"}</PropertyRow>
                                        <PropertyRow label="Phone">{lead.phone || "—"}</PropertyRow>
                                        <PropertyRow label="Created">{formatWorkspaceDateTime(lead.createdAt)}</PropertyRow>
                                        <PropertyRow label="Updated">{formatWorkspaceDateTime(lead.updatedAt)}</PropertyRow>
                                    </DetailPanel>
                                </div>
                            )}

                            {tabValue === "scoring" && (
                                <PredictiveScorePanel recordType="LEAD" recordId={lead.id} score={lead.predictiveScore} />
                            )}

                            {tabValue === "opportunities" && (
                                <div className="flex flex-col gap-[10px]">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-base font-extrabold">Linked Opportunities</h3>
                                        <CreateOpportunityDialog
                                            defaultLeadId={lead.id}
                                            onSuccess={loadData}
                                            trigger={
                                                <Button variant="outline" className="h-[34px] rounded-[10px]">
                                                    <Plus className="size-4" />
                                                    New Opportunity
                                                </Button>
                                            }
                                        />
                                    </div>

                                    {opportunities.length === 0 ? (
                                        <div className="rounded-[10px] border border-dashed p-7 text-center">
                                            <p className="text-sm text-muted-foreground">No opportunities associated with this lead yet.</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-2">
                                            {opportunities.map((opp) => (
                                                <div
                                                    key={opp.id}
                                                    className="rounded-[10px] border bg-surface-container-lowest p-2.5"
                                                >
                                                    <div className="flex items-center justify-between gap-4">
                                                        <div className="min-w-0">
                                                            <p className="font-extrabold">{opp.title}</p>
                                                            <p className="text-sm text-muted-foreground">
                                                                {opp.stage?.name || "Unassigned"} • {formatCurrency(opp.amount || 0)}
                                                            </p>
                                                        </div>
                                                        <Button variant="ghost" asChild className="h-8 whitespace-nowrap">
                                                            <Link href={`/dashboard/opportunities/${opp.id}`}>Open</Link>
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {tabValue === "notes" && (
                                <div className="rounded-[10px] bg-surface-container-lowest p-[10px]">
                                    <NotesPanel entityType="lead" entityId={lead.id} currentUserId={user?.id} />
                                </div>
                            )}

                            {tabValue === "tasks" && (
                                <div className="rounded-[10px] bg-surface-container-lowest p-[10px]">
                                    <RelatedTasksPanel leadId={lead.id} currentUserId={user?.id} />
                                </div>
                            )}

                            {tabValue === "audit" && (
                                <div className="rounded-[10px] bg-surface-container-lowest p-[9px]">
                                    <RecordHistory entityType="LEAD" entityId={lead.id} />
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            </div>

            <EditLeadDialog lead={lead} open={showEditDialog} onOpenChange={setShowEditDialog} onSuccess={loadData} />
        </motion.div>
    );
}

function CompactContactRow({ icon, value, onClick, tooltip }: { icon: React.ReactNode; value: string; onClick?: () => void; tooltip?: string }) {
    const row = (
        <div
            onClick={onClick}
            className={cn("group flex items-center gap-2", onClick && "cursor-pointer")}
        >
            <span className="flex items-center opacity-90">{icon}</span>
            <span className={cn("text-sm font-medium leading-[1.35]", onClick && "group-hover:underline")}>
                {value}
            </span>
        </div>
    );
    return tooltip && onClick ? (
        <Tooltip>
            <TooltipTrigger asChild>{row}</TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
    ) : row;
}

function MetricCell({ label, value }: { label: string; value: string }) {
    return (
        <div className="border-t border-white/10 bg-black/20 px-[7px] py-[9px] text-center">
            <p className="text-base font-extrabold leading-tight text-white">{value}</p>
            <p className="text-xs text-white/80">{label}</p>
        </div>
    );
}

function SnapshotCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="rounded-[10px] border bg-surface-container-lowest p-2">
            <div className="flex flex-col gap-[3px]">
                <span className="flex items-center text-primary">{icon}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-sm font-extrabold leading-tight">{value}</span>
            </div>
        </div>
    );
}

function DetailPanel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Card className="gap-0 rounded-[10px] py-0">
            <div className="border-b px-3 py-[9px]">
                <h3 className="text-base font-extrabold">{title}</h3>
            </div>
            <div className="flex flex-col divide-y">{children}</div>
        </Card>
    );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 px-3 py-[8.4px]">
            <span className="text-sm text-muted-foreground">{label}</span>
            <div className="text-right text-sm font-bold">{children}</div>
        </div>
    );
}

function WorkspaceTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "h-[34px] shrink-0 whitespace-nowrap rounded-lg px-3 text-[0.82rem] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                    ? "bg-primary font-extrabold text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
        >
            {label}
        </button>
    );
}

// Same status -> tone convention used by leads/columns.tsx: no dedicated
// "success" role in this M3 theme, so the qualified/contacted state reuses
// "tertiary" the way the columns table does for CONVERTED.
function getStatusClassName(status: string): string {
    const normalized = status.toLowerCase();
    if (normalized.includes("qualified") || normalized.includes("contact")) {
        return "bg-tertiary/12 text-tertiary border-tertiary/25";
    }
    if (normalized.includes("lost") || normalized.includes("dead")) {
        return "bg-destructive/12 text-destructive border-destructive/25";
    }
    return "bg-primary/10 text-primary border-primary/20";
}

function relativeDay(value: string) {
    const diff = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24)));
    return diff === 0 ? "Today" : `${diff}d ago`;
}
