'use client';

import { RecordSummary } from "@/components/detail-shell/record-summary";
import { ErrorState } from "@/components/common/error-state";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    Building2,
    Calendar,
    Flame,
    Link2,
    Loader2,
    Mail,
    Phone,
    PhoneCall,
    Plus,
    Pencil,
    Tag,
    Share2,
    Users,
    ClipboardList,
    Star,
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
import { ExternalPushDialog } from "@/components/integrations/external-push-dialog";
import { ExternalPushBadge } from "@/components/integrations/external-push-badge";
import { LogCallOutcomeDialog } from "@/components/telephony/log-call-outcome-dialog";
import { CallRecordingsPanel } from "@/components/telephony/call-recordings-panel";
import { RecordShareDialog } from "@/components/common/record-share-dialog";
import { RecordHistory } from "@/components/governance/record-history";
import { RelatedTasksPanel } from "@/components/tasks/related-tasks-panel";
import { ApplyPlaybookDialog } from "@/components/tasks/apply-playbook-dialog";
import { CommunicationEventsPanel } from "@/components/communications/communication-events-panel";
import { CreateCaseButton } from "@/components/cases/create-case-button";
import { useModuleEnabled } from "@/components/auth/feature-gate";
import { formatCurrency, cn } from "@/lib/utils";
import { fadeInUp } from "@/lib/motion";
import { useAuth } from "@/providers/auth-provider";
import { useClickToCall } from "@/hooks/use-click-to-call";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PredictiveScorePanel } from "@/components/scoring/predictive-score";
import { NextBestActionPanel } from "@/components/next-best-action/nba-panel";
import { CallScriptPanel } from "@/components/telephony/call-script-panel";
import { AiAssistantPanel } from "@/components/ai/ai-assistant-panel";
import { isFavoriteRecord, recordRecentView, toggleFavoriteRecord } from "@/lib/recent-records";
import { DetailPageHeader } from "@/components/detail-shell/detail-page-header";
import { WorkspaceTabs } from "@/components/detail-shell/workspace-tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

type ActivityTimeFilter = "ALL" | "TODAY" | "7D" | "30D";

const ALL_TYPES_VALUE = "ALL";

function hasIntegrationsPermission(user: any) {
    const rolePermissions = typeof user?.role === "object" && user?.role ? user.role.permissions : null;
    return Boolean(user?.isTenantAdmin || user?.isPlatformAdmin || rolePermissions?.modules?.integrations === "full");
}

function canManageSharing(user: any, lead: any) {
    if (!user || !lead) return false;
    if (lead.ownerId === user.id) return true;
    const rolePermissions = typeof user.role === "object" && user.role ? user.role.permissions : null;
    return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.recordAccess === "TEAM" || rolePermissions?.recordAccess === "ALL");
}

export default function LeadDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const leadId = params.id as string;
    const serviceDeskEnabled = useModuleEnabled("SERVICE_DESK");

    const [lead, setLead] = useState<Lead | null>(null);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    const [taskCount, setTaskCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [tabValue, setTabValue] = useState<"activity" | "details" | "scoring" | "opportunities" | "tasks" | "communications" | "notes" | "audit">("activity");
    const [activityTypeFilter, setActivityTypeFilter] = useState<string>("ALL");
    const [activityTimeFilter, setActivityTimeFilter] = useState<ActivityTimeFilter>("ALL");
    const [showPushDialog, setShowPushDialog] = useState(false);
    const [pushRefreshKey, setPushRefreshKey] = useState(0);
    const [showLogOutcomeDialog, setShowLogOutcomeDialog] = useState(false);
    const [showPlaybookDialog, setShowPlaybookDialog] = useState(false);
    const [showShareDialog, setShowShareDialog] = useState(false);
    const [tasksRefreshKey, setTasksRefreshKey] = useState(0);
    // "Pin/favorite support" (gap checklist's "recent/favorite records" item).
    const [isFavorite, setIsFavorite] = useState(false);

    const loadData = useCallback(async () => {
        setLoadError(null);
        setLoading(true);
        try {
            const [leadData, oppsData] = await Promise.all([
                apiFetch(`/leads/${leadId}`),
                apiFetch("/opportunities"),
            ]);

            setLead(leadData as Lead);
            recordRecentView("lead", leadId, (leadData as Lead).name || (leadData as Lead).email || "Lead");
            setIsFavorite(isFavoriteRecord("lead", leadId));

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
            setLoadError("Unable to load lead details and related records. Please try again.");
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

    const { call: placeClickToCall } = useClickToCall();
    const handleClickToCall = useCallback(async () => {
        if (!lead?.phone) return;
        await placeClickToCall(lead.phone, { leadId: lead.id });
    }, [lead, placeClickToCall]);

    const lastActivity = activities[0];
    const openOpportunityValue = opportunities.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const statusClassName = getStatusClassName(lead?.status || "NEW");

    const toggleFavorite = () => {
        if (!lead) return;
        toggleFavoriteRecord("lead", lead.id, lead.name || lead.email || "Lead");
        setIsFavorite((current) => !current);
    };

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="size-11 animate-spin text-primary" />
            </div>
        );
    }

    if (loadError) return <ErrorState description={loadError} onRetry={loadData} />;

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
            className="mx-auto min-w-0 max-w-[1440px]"
        >
            <DetailPageHeader
                onBack={() => router.back()}
                title={lead.name}
                subtitle={lead.company || lead.email || undefined}
                statusBadge={
                    <Badge variant="outline" className={cn("h-5 text-[0.6rem] font-extrabold uppercase tracking-wide", statusClassName)}>
                        {lead.status}
                    </Badge>
                }
                primaryAction={<Button
                            variant="default"
                            className="h-9 rounded-[10px] px-3.5"
                            onClick={() => setShowLogOutcomeDialog(true)}
                        >
                            <PhoneCall className="size-4" />
                            Log Call Outcome
                        </Button>}
                actions={
                    <>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 rounded-[10px]"
                            onClick={toggleFavorite}
                            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                        >
                            <Star className={cn("size-4", isFavorite ? "fill-amber-500 text-amber-500" : "text-muted-foreground")} />
                        </Button>
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
                        {serviceDeskEnabled && (
                            <CreateCaseButton relatedLeadId={lead.id} requesterName={lead.name} requesterEmail={lead.email} />
                        )}
                        <AiAssistantPanel entityType="LEAD" entityId={lead.id} entityLabel={lead.name} recipientEmail={lead.email} recipientPhone={lead.phone} />
                        <ContextualFormsPanel
                            placement="LEAD_DETAIL"
                            context={{ leadId }}
                            entityData={lead}
                            onSaved={loadData}
                        />
                        {hasIntegrationsPermission(user) && (
                            <Button
                                variant="outline"
                                className="h-9 rounded-[10px] px-3.5"
                                onClick={() => setShowPushDialog(true)}
                            >
                                <Share2 className="size-4" />
                                Push to External
                            </Button>
                        )}

                        {canManageSharing(user, lead) && (
                            <Button
                                variant="outline"
                                className="h-9 rounded-[10px] px-3.5"
                                onClick={() => setShowShareDialog(true)}
                            >
                                <Users className="size-4" />
                                Share
                            </Button>
                        )}
                        <Button
                            onClick={() => setShowEditDialog(true)}
                            className="h-9 rounded-[10px] px-4"
                        >
                            <Pencil className="size-4" />
                            Edit
                        </Button>
                    </>
                }
            />

            <div className="mb-3 flex flex-wrap gap-3 break-all text-sm lg:hidden">
                {lead.phone && <a className="text-primary underline" href={`tel:${lead.phone}`}>{lead.phone}</a>}
                {lead.email && <a className="text-primary underline" href={`mailto:${lead.email}`}>{lead.email}</a>}
            </div>
            <div className="mb-3 flex justify-end">
                <ExternalPushBadge leadId={leadId} refreshKey={pushRefreshKey} />
            </div>

            <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
                <RecordSummary>
                    <Card className="gap-0 overflow-hidden rounded-[14px] border-primary/20 bg-transparent py-0">
                        <div className="bg-gradient-to-b from-primary/95 to-primary/90 px-5 py-[18px] text-primary-foreground">
                            <div className="mb-[10px] flex items-center gap-[10px]">
                                <Avatar className="size-12 shrink-0">
                                    <AvatarFallback className="bg-white/15 text-lg font-extrabold text-primary-foreground">
                                        {lead.name?.charAt(0) || "L"}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <h2 className="break-words text-lg font-extrabold leading-tight">{lead.name}</h2>
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
                        <div className="grid grid-cols-1 gap-2">
                            <SnapshotCard icon={<Flame className="size-4" />} label="Score" value={String(lead.score ?? 0)} />
                            <SnapshotCard icon={<Calendar className="size-4" />} label="Last Touch" value={lastActivity ? relativeDay(lastActivity.createdAt) : "None"} />
                            <SnapshotCard icon={<Link2 className="size-4" />} label="Open Opportunity Value" value={formatCurrency(openOpportunityValue)} />
                        </div>
                    </Card>

                    <PredictiveScorePanel recordType="LEAD" recordId={lead.id} score={lead.predictiveScore} />
                    <NextBestActionPanel recordType="LEAD" recordId={lead.id} />
                    <CallScriptPanel recordType="LEAD" recordId={lead.id} />
                </RecordSummary>

                <div className="min-w-0">
                    <Card className="min-w-0 gap-0 overflow-hidden rounded-xl py-0">
                        <WorkspaceTabs
                            value={tabValue}
                            onChange={setTabValue}
                            tabs={[
                                { value: "activity", label: `Activity History (${filteredActivities.length})` },
                                { value: "details", label: "Lead Details" },
                                { value: "scoring", label: "Scoring" },
                                { value: "opportunities", label: `Opportunities (${opportunities.length})` },
                                { value: "tasks", label: `Tasks (${taskCount})` },
                                { value: "communications", label: "Communications" },
                                { value: "notes", label: "Notes" },
                                { value: "audit", label: "Audit" },
                            ]}
                        />

                        <div className="p-2.5 md:p-3">
                            {tabValue === "activity" && (
                                <div className="flex flex-col gap-[10px]">
                                    <div className="flex flex-col gap-[6px] rounded-[10px] border bg-surface-container-lowest p-2 sm:flex-row sm:items-center sm:justify-between">
                                        <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
                                            Activity Filters
                                        </span>
                                        <div className="flex flex-wrap gap-[6px]">
                                            <Select value={activityTypeFilter} onValueChange={setActivityTypeFilter}>
                                                <SelectTrigger size="sm" aria-label="Activity type" className="h-auto min-h-8 w-full min-w-0 rounded-lg bg-background [&_span]:whitespace-normal">
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
                                                <SelectTrigger size="sm" aria-label="Activity time range" className="h-auto min-h-8 w-full min-w-0 rounded-lg bg-background [&_span]:whitespace-normal">
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
                                    <div className="mb-2 flex justify-end">
                                        <Button variant="outline" size="sm" onClick={() => setShowPlaybookDialog(true)}>
                                            <ClipboardList className="size-4" />
                                            Apply Playbook
                                        </Button>
                                    </div>
                                    <RelatedTasksPanel key={tasksRefreshKey} leadId={lead.id} currentUserId={user?.id} />
                                </div>
                            )}

                            {tabValue === "communications" && (
                                <div className="rounded-[10px] bg-surface-container-lowest p-[10px] space-y-4">
                                    <CommunicationEventsPanel entityType="LEAD" entityId={lead.id} />
                                    <CallRecordingsPanel entityType="LEAD" entityId={lead.id} />
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
            <ExternalPushDialog
                open={showPushDialog}
                onClose={() => setShowPushDialog(false)}
                leadId={leadId}
                linkedOpportunities={opportunities}
                onPushed={() => setPushRefreshKey((key) => key + 1)}
            />
            <LogCallOutcomeDialog
                open={showLogOutcomeDialog}
                onClose={() => setShowLogOutcomeDialog(false)}
                leadId={leadId}
                onLogged={loadData}
            />
            <RecordShareDialog
                open={showShareDialog}
                onClose={() => setShowShareDialog(false)}
                recordType="leads"
                recordId={leadId}
                recordLabel={lead?.name}
            />
            <ApplyPlaybookDialog
                open={showPlaybookDialog}
                onClose={() => setShowPlaybookDialog(false)}
                leadId={leadId}
                targetModule="LEAD"
                onApplied={() => setTasksRefreshKey((key) => key + 1)}
            />
        </motion.div>
    );
}

function CompactContactRow({ icon, value, onClick, tooltip }: { icon: React.ReactNode; value: string; onClick?: () => void; tooltip?: string }) {
    const row = (
        <div
            onClick={onClick}
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
            onKeyDown={onClick ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onClick();
                }
            } : undefined}
            aria-label={onClick ? (tooltip || value) : undefined}
            className={cn("group flex min-w-0 items-start gap-2", onClick && "cursor-pointer")}
        >
            <span className="flex shrink-0 items-center opacity-90">{icon}</span>
            <span className={cn("min-w-0 break-all text-sm font-medium leading-[1.35]", onClick && "group-hover:underline")}>
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
        <div className="min-w-0 break-words border-t bg-muted px-[7px] py-[9px] text-center">
            <p className="text-base font-extrabold leading-tight text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
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
        <div className="grid min-w-0 grid-cols-1 gap-1 px-3 py-[8.4px]">
            <span className="text-sm text-muted-foreground">{label}</span>
            <div className="min-w-0 break-words text-sm font-bold">{children}</div>
        </div>
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
