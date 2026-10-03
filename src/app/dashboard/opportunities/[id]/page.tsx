"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ClipboardList, LifeBuoy, ListPlus, Mail, MoreHorizontal, NotebookPen, Pencil, Phone, PhoneCall, Plus, Share2, Star, Users } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Opportunity, OpportunityStageHistory, StageDefinition } from "@/types/opportunities";
import { CreateActivityDialog } from "@/app/dashboard/activities/create-activity-dialog";
import { EditOpportunityDialog } from "../edit-opportunity-dialog";
import { ErrorState } from "@/components/common/error-state";
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
import { ConsentCard } from "@/components/communications/consent-card";
import { CreateCaseButton } from "@/components/cases/create-case-button";
import { useModuleEnabled } from "@/components/auth/feature-gate";
import { PredictiveScorePanel } from "@/components/scoring/predictive-score";
import { NextBestActionPanel } from "@/components/next-best-action/nba-panel";
import { CallScriptPanel } from "@/components/telephony/call-script-panel";
import { AiAssistantPanel } from "@/components/ai/ai-assistant-panel";
import { OpportunityStageHistoryList } from "@/components/opportunities/opportunity-stage-history";
import { StagePath } from "@/components/opportunities/stage-path";
import { DetailPageHeader, type DetailMenuItem } from "@/components/detail-shell/detail-page-header";
import { WorkspaceTabs } from "@/components/detail-shell/workspace-tabs";
import { RecordComposer } from "@/components/detail-shell/record-composer";
import { RecordActivityFeed } from "@/components/detail-shell/record-activity-feed";
import { OwnerControl } from "@/components/detail-shell/owner-control";
import { StatusBadge } from "@/components/common/status-badge";
import { DescriptionList } from "@/components/common/section";
import { useAskText } from "@/components/common/dialogs-provider";
import { useRecordTitle } from "@/components/app-states/page-title";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/providers/auth-provider";
import { useClickToCall } from "@/hooks/use-click-to-call";
import { useUrlState } from "@/hooks/use-url-state";
import { isFavoriteRecord, recordRecentView, toggleFavoriteRecord } from "@/lib/recent-records";
import { useRecordsChanged } from "@/lib/records-events";
import { formatWorkspaceDate, formatWorkspaceDateTime, isPastDate } from "@/lib/date-format";
import { formatMoney } from "@/lib/display/format";
import { statusDisplay } from "@/lib/display/status";

const TABS = ["activity", "details", "tasks", "stages", "communications", "scoring", "history"] as const;
type Tab = (typeof TABS)[number];

function hasIntegrationsPermission(user: any) {
    const rolePermissions = typeof user?.role === "object" && user?.role ? user.role.permissions : null;
    return Boolean(user?.isTenantAdmin || user?.isPlatformAdmin || rolePermissions?.modules?.integrations === "full");
}

function canManageSharing(user: any, opportunity: any) {
    if (!user || !opportunity) return false;
    if (opportunity.ownerId === user.id) return true;
    const rolePermissions = typeof user.role === "object" && user.role ? user.role.permissions : null;
    return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.recordAccess === "TEAM" || rolePermissions?.recordAccess === "ALL");
}

// Opportunity record (UI/UX plan decision 23, §10.5 and §11.4): the lead record's layout, with
// the stage path under the header. Won and Lost ask for a reason, kept on the stage history.
export default function OpportunityDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const askText = useAskText();
    const opportunityId = params.id as string;
    const serviceDeskEnabled = useModuleEnabled("SERVICE_DESK");
    const telephonyEnabled = useModuleEnabled("TELEPHONY");
    const dataPlatformEnabled = useModuleEnabled("DATA_PLATFORM");
    const { call: placeClickToCall } = useClickToCall();

    const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
    useRecordTitle(opportunity?.title);
    const [history, setHistory] = useState<OpportunityStageHistory[]>([]);
    const [taskCount, setTaskCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [tab, setTab] = useUrlState<Tab>("tab", "activity", { allowed: TABS });
    const [feedKey, setFeedKey] = useState(0);
    const [tasksRefreshKey, setTasksRefreshKey] = useState(0);
    const [isFavorite, setIsFavorite] = useState(false);
    const [savingStage, setSavingStage] = useState(false);

    const [showEditDialog, setShowEditDialog] = useState(false);
    const [showActivityDialog, setShowActivityDialog] = useState(false);
    const [showCaseDialog, setShowCaseDialog] = useState(false);
    const [showPushDialog, setShowPushDialog] = useState(false);
    const [pushRefreshKey, setPushRefreshKey] = useState(0);
    const [showLogOutcomeDialog, setShowLogOutcomeDialog] = useState(false);
    const [showPlaybookDialog, setShowPlaybookDialog] = useState(false);
    const [showShareDialog, setShowShareDialog] = useState(false);

    const loadData = useCallback(async () => {
        setLoadError(null);
        try {
            const [opp, histData, taskData] = await Promise.all([
                apiFetch<Opportunity>(`/opportunities/${opportunityId}`),
                apiFetch<OpportunityStageHistory[]>(`/opportunities/${opportunityId}/history`).catch(() => []),
                apiFetch<any[]>(`/tasks?opportunityId=${opportunityId}`).catch(() => []),
            ]);
            setOpportunity(opp);
            recordRecentView("opportunity", opportunityId, opp?.title || "Opportunity");
            setIsFavorite(isFavoriteRecord("opportunity", opportunityId));
            setHistory(Array.isArray(histData) ? histData : []);
            setTaskCount(Array.isArray(taskData) ? taskData.length : 0);
        } catch {
            setLoadError("This opportunity couldn't be loaded.");
        } finally {
            setLoading(false);
        }
    }, [opportunityId]);
    useEffect(() => { if (opportunityId) loadData(); }, [opportunityId, loadData]);
    // Refetch when the header's Create menu adds something here (no full reload).
    useRecordsChanged(["activity", "task", "opportunity"], () => { loadData(); setFeedKey((key) => key + 1); });

    const [composerFocus, setComposerFocus] = useState<{ mode: "note" | "task"; at: number } | null>(null);
    const focusComposer = (mode: "note" | "task") => {
        setTab("activity");
        setComposerFocus({ mode, at: Date.now() });
    };

    const changeStage = async (stage: StageDefinition) => {
        if (!opportunity || stage.id === opportunity.stageId) return;
        const name = stage.label || stage.name;
        let stageChangeNote: string | undefined;
        if (stage.isClosed) {
            const reason = await askText({
                title: `Mark as ${name}`,
                description: opportunity.title,
                label: stage.isWon ? "What won it?" : "Why was it lost?",
                confirmLabel: `Mark as ${name}`,
                required: true,
            });
            if (reason === null) return;
            stageChangeNote = reason;
        }
        const previous = opportunity;
        setSavingStage(true);
        setOpportunity({ ...opportunity, stageId: stage.id, stage });
        try {
            await apiFetch(`/opportunities/${opportunity.id}`, { method: "PATCH", body: JSON.stringify({ stageId: stage.id, stageChangeNote }) });
            toast.success(`Stage: ${name}`, {
                duration: 6000,
                action: stage.isClosed ? undefined : {
                    label: "Undo",
                    onClick: async () => {
                        try {
                            await apiFetch(`/opportunities/${opportunity.id}`, { method: "PATCH", body: JSON.stringify({ stageId: previous.stageId }) });
                            loadData();
                        } catch {
                            toast.error("Couldn't undo");
                        }
                    },
                },
            });
            loadData();
        } catch (error: any) {
            setOpportunity(previous);
            toast.error(error?.message || "Couldn't change the stage");
        } finally {
            setSavingStage(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-4" aria-busy="true">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-9 w-full" />
                <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <Skeleton className="h-80" />
                    <Skeleton className="h-96" />
                </div>
            </div>
        );
    }
    if (loadError) return <ErrorState description={loadError} onRetry={loadData} />;
    if (!opportunity) {
        return <ErrorState kind="permission" title="Opportunity not found" description="It may have been deleted, or you may not have access to it." action={<Button variant="outline" asChild><Link href="/dashboard/opportunities">Back to opportunities</Link></Button>} />;
    }

    const stages = opportunity.opportunityType?.stages ?? [];
    const currentStage = stages.find((stage) => stage.id === opportunity.stageId) ?? opportunity.stage;
    const lead = opportunity.lead;
    const leadPhone = lead?.phone ? lead.phone.replace(/[^\d+]/g, "") : "";
    const score = opportunity.predictiveScore;
    const scoreBand = score ? statusDisplay("scoreBand", score.scoreBand) : null;
    const closeOverdue = !!opportunity.expectedCloseDate && isPastDate(opportunity.expectedCloseDate) && !currentStage?.isClosed;

    const logActivityButton = telephonyEnabled ? (
        <Button size="sm" onClick={() => setShowLogOutcomeDialog(true)}><PhoneCall className="size-4" />Log call</Button>
    ) : (
        <Button size="sm" onClick={() => setShowActivityDialog(true)}><Plus className="size-4" />Log activity</Button>
    );

    const menuItems: DetailMenuItem[] = [
        { label: "Edit opportunity", icon: <Pencil className="size-4" />, onSelect: () => setShowEditDialog(true) },
        { label: "Log other activity", icon: <Plus className="size-4" />, onSelect: () => setShowActivityDialog(true), hidden: !telephonyEnabled },
        { label: "Create case", icon: <LifeBuoy className="size-4" />, onSelect: () => setShowCaseDialog(true), hidden: !serviceDeskEnabled },
        { label: "Apply task playbook", icon: <ClipboardList className="size-4" />, onSelect: () => setShowPlaybookDialog(true) },
        { label: "Share", icon: <Users className="size-4" />, onSelect: () => setShowShareDialog(true), hidden: !canManageSharing(user, opportunity), separatorBefore: true },
        { label: "Push to external system", icon: <Share2 className="size-4" />, onSelect: () => setShowPushDialog(true), hidden: !(hasIntegrationsPermission(user) && dataPlatformEnabled) },
        {
            label: isFavorite ? "Remove from favorites" : "Add to favorites",
            icon: <Star className={isFavorite ? "size-4 fill-amber-500 text-amber-500" : "size-4"} />,
            onSelect: () => { toggleFavoriteRecord("opportunity", opportunity.id, opportunity.title || "Opportunity"); setIsFavorite((current) => !current); },
        },
    ];

    return (
        <div className="mx-auto min-w-0 max-w-[1440px] pb-20 md:pb-0">
            <DetailPageHeader
                onBack={() => router.back()}
                title={opportunity.title}
                subtitle={[formatMoney(opportunity.amount ?? 0), opportunity.opportunityType?.name, lead?.name].filter(Boolean).join(" · ")}
                meta={<>
                    {currentStage ? <StatusBadge tone={currentStage.isClosed ? (currentStage.isWon ? "success" : "danger") : "neutral"} dotColor={currentStage.isClosed ? null : currentStage.color} label={currentStage.label || currentStage.name} /> : null}
                    <OwnerControl entityType="OPPORTUNITY" entityId={opportunity.id} ownerId={opportunity.ownerId} ownerName={opportunity.ownerName} onChanged={loadData} />
                </>}
                quickActions={<>
                    {logActivityButton}
                    <Button size="sm" variant="outline" onClick={() => focusComposer("note")}><NotebookPen className="size-4" />Add note</Button>
                    <Button size="sm" variant="outline" onClick={() => focusComposer("task")}><ListPlus className="size-4" />Add task</Button>
                    <AiAssistantPanel entityType="OPPORTUNITY" entityId={opportunity.id} entityLabel={opportunity.title} recipientEmail={lead?.email} recipientPhone={lead?.phone} />
                    <ContextualFormsPanel placement="OPPORTUNITY_DETAIL" context={{ leadId: opportunity.leadId, opportunityId: opportunity.id }} entityData={opportunity} onSaved={loadData} />
                </>}
                menuItems={menuItems}
                mobileActionBar
            />

            {stages.length ? (
                <div className="mb-4">
                    <StagePath stages={stages} currentStageId={opportunity.stageId} onSelect={changeStage} disabled={savingStage} />
                </div>
            ) : null}

            <div className="mb-3 flex justify-end empty:hidden"><ExternalPushBadge opportunityId={opportunityId} refreshKey={pushRefreshKey} /></div>

            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                <aside aria-label="Opportunity summary" className="order-2 min-w-0 space-y-4 lg:order-none lg:sticky lg:top-[calc(var(--app-header-offset,56px)+64px)]">
                    <Card className="gap-0 py-0">
                        <section aria-labelledby="opp-facts-heading" className="border-b px-4 pb-2 pt-4">
                            <h2 id="opp-facts-heading" className="text-sm font-semibold">Key facts</h2>
                            <DescriptionList compact items={[
                                { label: "Value", value: formatMoney(opportunity.amount ?? 0) },
                                { label: "Close date", value: opportunity.expectedCloseDate ? <span className={closeOverdue ? "text-destructive" : undefined}>{closeOverdue ? "Overdue · " : ""}{formatWorkspaceDate(opportunity.expectedCloseDate)}</span> : null },
                                { label: "Probability", value: currentStage ? `${currentStage.probability ?? 0}%` : null },
                                { label: "Score", value: score?.winProbability != null ? `${Math.round(score.winProbability)} · ${scoreBand?.label}` : null },
                                { label: "Priority", value: opportunity.priority ? statusDisplay("priority", opportunity.priority).label : null },
                                { label: "Type", value: opportunity.opportunityType?.name },
                                { label: "Created", value: formatWorkspaceDate(opportunity.createdAt) },
                            ]} />
                        </section>
                        <section aria-labelledby="opp-lead-heading" className="border-b p-4">
                            <h2 id="opp-lead-heading" className="mb-2 text-sm font-semibold">Lead</h2>
                            {lead ? (
                                <div className="space-y-2 text-sm">
                                    <Link href={`/dashboard/leads/${opportunity.leadId}`} className="block font-medium hover:underline">{lead.name}</Link>
                                    <ul className="space-y-1.5">
                                        <li className="flex min-w-0 items-center gap-2">
                                            <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                                            {lead.email ? <a href={`mailto:${lead.email}`} className="min-w-0 break-all hover:underline">{lead.email}</a> : <span className="text-muted-foreground">No email</span>}
                                        </li>
                                        <li className="flex min-w-0 items-center gap-2">
                                            <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                                            {lead.phone ? (
                                                <>
                                                    <a href={`tel:${leadPhone}`} className="tabular-nums hover:underline">{lead.phone}</a>
                                                    {telephonyEnabled ? <Button size="xs" variant="outline" className="ml-auto" onClick={() => placeClickToCall(lead.phone, { leadId: opportunity.leadId, opportunityId: opportunity.id })}>Call</Button> : null}
                                                </>
                                            ) : <span className="text-muted-foreground">No phone</span>}
                                        </li>
                                    </ul>
                                </div>
                            ) : <p className="text-sm text-muted-foreground">No linked lead.</p>}
                        </section>
                        <div className="p-2"><CallScriptPanel recordType="OPPORTUNITY" recordId={opportunity.id} /></div>
                    </Card>
                    <NextBestActionPanel recordType="OPPORTUNITY" recordId={opportunity.id} />
                </aside>

                <div className="min-w-0">
                    <Card className="min-w-0 gap-0 overflow-hidden py-0">
                        <WorkspaceTabs
                            value={tab}
                            onChange={setTab}
                            tabs={[
                                { value: "activity", label: "Activity" },
                                { value: "details", label: "Details" },
                                { value: "tasks", label: `Tasks (${taskCount})` },
                                { value: "stages", label: `Stage history (${history.length})` },
                                { value: "communications", label: "Communications" },
                                { value: "scoring", label: "Scoring" },
                                { value: "history", label: "History" },
                            ]}
                        />

                        <div className="p-3 md:p-4">
                            {tab === "activity" && (
                                <div className="space-y-4">
                                    <RecordComposer
                                        entityType="opportunity"
                                        entityId={opportunity.id}
                                        onCreated={(kind) => { setFeedKey((key) => key + 1); if (kind === "task") { setTasksRefreshKey((key) => key + 1); loadData(); } }}
                                        logActivity={<Button size="sm" variant="ghost" onClick={() => setShowActivityDialog(true)}><Plus className="size-4" />Log activity</Button>}
                                        focusRequest={composerFocus}
                                    />
                                    <RecordActivityFeed entityType="opportunity" entityId={opportunity.id} refreshKey={feedKey} />
                                </div>
                            )}

                            {tab === "details" && (
                                <div className="grid gap-x-8 md:grid-cols-2">
                                    <DescriptionList items={[
                                        { label: "Title", value: opportunity.title },
                                        { label: "Type", value: opportunity.opportunityType?.name },
                                        { label: "Stage", value: currentStage?.label || currentStage?.name },
                                        { label: "Value", value: formatMoney(opportunity.amount ?? 0) },
                                        { label: "Owner", value: opportunity.ownerName ?? "Unassigned" },
                                    ]} />
                                    <DescriptionList items={[
                                        { label: "Priority", value: opportunity.priority ? statusDisplay("priority", opportunity.priority).label : null },
                                        { label: "Close date", value: opportunity.expectedCloseDate ? formatWorkspaceDate(opportunity.expectedCloseDate) : null },
                                        { label: "Tags", value: opportunity.tags?.length ? opportunity.tags.join(", ") : null },
                                        { label: "Created", value: formatWorkspaceDateTime(opportunity.createdAt) },
                                        { label: "Updated", value: formatWorkspaceDateTime(opportunity.updatedAt) },
                                    ]} />
                                    <div className="md:col-span-2"><Button variant="outline" size="sm" className="mt-3" onClick={() => setShowEditDialog(true)}><Pencil className="size-4" />Edit opportunity</Button></div>
                                </div>
                            )}

                            {tab === "tasks" && (
                                <div className="space-y-2">
                                    <div className="flex justify-end">
                                        <Button variant="outline" size="sm" onClick={() => setShowPlaybookDialog(true)}><ClipboardList className="size-4" />Apply playbook</Button>
                                    </div>
                                    <RelatedTasksPanel key={tasksRefreshKey} leadId={opportunity.leadId} opportunityId={opportunity.id} currentUserId={user?.id} />
                                </div>
                            )}

                            {tab === "stages" && <OpportunityStageHistoryList history={history} />}

                            {tab === "communications" && (
                                <div className="space-y-4">
                                    <ConsentCard entityType="OPPORTUNITY" entityId={opportunity.id} />
                                    <CommunicationEventsPanel entityType="OPPORTUNITY" entityId={opportunity.id} />
                                    <CallRecordingsPanel entityType="OPPORTUNITY" entityId={opportunity.id} />
                                </div>
                            )}

                            {tab === "scoring" && <PredictiveScorePanel recordType="OPPORTUNITY" recordId={opportunity.id} score={opportunity.predictiveScore} />}

                            {tab === "history" && <RecordHistory entityType="OPPORTUNITY" entityId={opportunity.id} />}
                        </div>
                    </Card>
                </div>
            </div>

            {/* Phones (decision 10): a bottom action bar -- Call · Log · Note · More. */}
            <nav aria-label="Opportunity actions" className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t bg-card px-2 py-1.5 md:hidden">
                {leadPhone ? (
                    <a href={`tel:${leadPhone}`} className="flex flex-col items-center gap-0.5 px-3 py-1 text-xs"><Phone className="size-5" aria-hidden />Call</a>
                ) : null}
                <button type="button" onClick={() => (telephonyEnabled ? setShowLogOutcomeDialog(true) : setShowActivityDialog(true))} className="flex flex-col items-center gap-0.5 px-3 py-1 text-xs"><Plus className="size-5" aria-hidden />Log</button>
                <button type="button" onClick={() => focusComposer("note")} className="flex flex-col items-center gap-0.5 px-3 py-1 text-xs"><NotebookPen className="size-5" aria-hidden />Note</button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button type="button" className="flex flex-col items-center gap-0.5 px-3 py-1 text-xs"><MoreHorizontal className="size-5" aria-hidden />More</button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="top">
                        {menuItems.filter((item) => !item.hidden).map((item) => (
                            <DropdownMenuItem key={item.label} onSelect={item.onSelect}>{item.icon}{item.label}</DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </nav>

            <EditOpportunityDialog opportunity={opportunity} open={showEditDialog} onOpenChange={setShowEditDialog} onSuccess={loadData} />
            <CreateActivityDialog open={showActivityDialog} onOpenChange={setShowActivityDialog} defaultLeadId={opportunity.leadId || undefined} defaultOpportunityId={opportunity.id} trigger={<span hidden />} onSuccess={() => { setFeedKey((key) => key + 1); loadData(); }} />
            {serviceDeskEnabled ? <CreateCaseButton open={showCaseDialog} onOpenChange={setShowCaseDialog} relatedOpportunityId={opportunity.id} relatedLeadId={opportunity.leadId || undefined} /> : null}
            <ExternalPushDialog open={showPushDialog} onClose={() => setShowPushDialog(false)} leadId={opportunity.leadId} opportunityId={opportunity.id} onPushed={() => setPushRefreshKey((key) => key + 1)} />
            {telephonyEnabled && <LogCallOutcomeDialog open={showLogOutcomeDialog} onClose={() => setShowLogOutcomeDialog(false)} leadId={opportunity.leadId} opportunityId={opportunity.id} onLogged={() => { setFeedKey((key) => key + 1); loadData(); }} />}
            <RecordShareDialog open={showShareDialog} onClose={() => setShowShareDialog(false)} recordType="opportunities" recordId={opportunity.id} recordLabel={opportunity.title} />
            <ApplyPlaybookDialog open={showPlaybookDialog} onClose={() => setShowPlaybookDialog(false)} leadId={opportunity.leadId} opportunityId={opportunity.id} targetModule="OPPORTUNITY" onApplied={() => setTasksRefreshKey((key) => key + 1)} />
        </div>
    );
}
