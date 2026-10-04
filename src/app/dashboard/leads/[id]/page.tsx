"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ClipboardList, LifeBuoy, ListPlus, Mail, MessageCircle, MoreHorizontal, NotebookPen, Pencil, Phone, PhoneCall, Plus, Share2, Star, Users } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Lead } from "@/types/leads";
import { Opportunity } from "@/types/opportunities";
import { PaginatedResponse } from "@/types/common";
import { CreateActivityDialog } from "@/app/dashboard/activities/create-activity-dialog";
import { CreateOpportunityDialog } from "@/app/dashboard/opportunities/create-opportunity-dialog";
import { EditLeadDialog } from "../edit-lead-dialog";
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
import { DetailPageHeader, type DetailMenuItem } from "@/components/detail-shell/detail-page-header";
import { WorkspaceTabs } from "@/components/detail-shell/workspace-tabs";
import { RecordAddDialog, type ComposerMode } from "@/components/detail-shell/record-composer";
import { RecordActivityFeed } from "@/components/detail-shell/record-activity-feed";
import { OwnerControl } from "@/components/detail-shell/owner-control";
import { LeadStatusSelect } from "@/components/leads/lead-status";
import { DescriptionList } from "@/components/common/section";
import { useRecordTitle } from "@/components/app-states/page-title";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/providers/auth-provider";
import { useClickToCall } from "@/hooks/use-click-to-call";
import { useUrlState } from "@/hooks/use-url-state";
import { useLeadStatuses } from "@/hooks/use-lead-statuses";
import { isFavoriteRecord, recordRecentView, toggleFavoriteRecord } from "@/lib/recent-records";
import { useRecordsChanged } from "@/lib/records-events";
import { formatWorkspaceDate, formatWorkspaceDateTime, formatWorkspaceRelativeTime } from "@/lib/date-format";
import { formatMoney } from "@/lib/display/format";
import { statusDisplay } from "@/lib/display/status";

const TABS = ["activity", "details", "opportunities", "tasks", "communications", "scoring", "history"] as const;
type Tab = (typeof TABS)[number];

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

// Lead record (UI/UX plan decision 23 and §10.5): the same summary-column-plus-tabs layout,
// simplified. Header: name, inline status and owner, quick actions (decision 7). Summary: one
// surface with dividers. Activity tab: composer, then the compact feed with notes in it.
export default function LeadDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const leadId = params.id as string;
    const serviceDeskEnabled = useModuleEnabled("SERVICE_DESK");
    const telephonyEnabled = useModuleEnabled("TELEPHONY");
    const dataPlatformEnabled = useModuleEnabled("DATA_PLATFORM");
    const { display, statuses } = useLeadStatuses();

    const [lead, setLead] = useState<Lead | null>(null);
    useRecordTitle(lead?.name);
    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    const [taskCount, setTaskCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [tab, setTab] = useUrlState<Tab>("tab", "activity", { allowed: TABS });
    const [feedKey, setFeedKey] = useState(0);
    const [tasksRefreshKey, setTasksRefreshKey] = useState(0);
    const [isFavorite, setIsFavorite] = useState(false);
    const [savingStatus, setSavingStatus] = useState(false);

    const [showEditDialog, setShowEditDialog] = useState(false);
    const [showActivityDialog, setShowActivityDialog] = useState(false);
    const [showOpportunityDialog, setShowOpportunityDialog] = useState(false);
    const [showCaseDialog, setShowCaseDialog] = useState(false);
    const [showPushDialog, setShowPushDialog] = useState(false);
    const [pushRefreshKey, setPushRefreshKey] = useState(0);
    const [showLogOutcomeDialog, setShowLogOutcomeDialog] = useState(false);
    const [showPlaybookDialog, setShowPlaybookDialog] = useState(false);
    const [showShareDialog, setShowShareDialog] = useState(false);

    const loadData = useCallback(async () => {
        setLoadError(null);
        try {
            // Only this lead's opportunities, from the server (it used to load the first 100
            // opportunities of the whole tenant and filter them here, missing the rest).
            const opportunityFilter = JSON.stringify([{ logic: "AND", conditions: [{ field: "leadId", operator: "equals", value: leadId }] }]);
            const [leadData, oppsData, taskData] = await Promise.all([
                apiFetch<Lead>(`/leads/${leadId}`),
                apiFetch<PaginatedResponse<Opportunity>>(`/opportunities?limit=100&filters=${encodeURIComponent(opportunityFilter)}`).catch(() => ({ data: [] } as any)),
                apiFetch<any[]>(`/tasks?leadId=${leadId}`).catch(() => []),
            ]);
            setLead(leadData);
            recordRecentView("lead", leadId, leadData?.name || leadData?.email || "Lead");
            setIsFavorite(isFavoriteRecord("lead", leadId));
            setOpportunities(Array.isArray((oppsData as any)?.data) ? (oppsData as any).data : []);
            setTaskCount(Array.isArray(taskData) ? taskData.length : 0);
        } catch {
            setLoadError("This lead couldn't be loaded.");
        } finally {
            setLoading(false);
        }
    }, [leadId]);
    useEffect(() => { if (leadId) loadData(); }, [leadId, loadData]);
    // Refetch when the header's Create menu adds something here (no full reload).
    useRecordsChanged(["activity", "opportunity", "task"], () => { loadData(); setFeedKey((key) => key + 1); });

    const { call: placeClickToCall } = useClickToCall();
    const handleClickToCall = useCallback(async () => {
        if (!lead?.phone) return;
        await placeClickToCall(lead.phone, { leadId: lead.id });
    }, [lead, placeClickToCall]);

    const openValue = useMemo(
        () => opportunities.filter((item: any) => !item.stage?.isClosed).reduce((sum, item) => sum + Number(item.amount || 0), 0),
        [opportunities],
    );

    const changeStatus = async (status: string) => {
        if (!lead || status === lead.status) return;
        const previous = lead.status;
        setSavingStatus(true);
        setLead({ ...lead, status });
        try {
            await apiFetch(`/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
            toast.success(`Status: ${display(status).label}`, {
                duration: 6000,
                action: {
                    label: "Undo",
                    onClick: async () => {
                        try {
                            await apiFetch(`/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ status: previous }) });
                            setLead((current) => (current ? { ...current, status: previous } : current));
                        } catch {
                            toast.error("Couldn't undo");
                        }
                    },
                },
            });
        } catch (error: any) {
            setLead((current) => (current ? { ...current, status: previous } : current));
            toast.error(error?.message || "Couldn't change the status");
        } finally {
            setSavingStatus(false);
        }
    };

    // "Convert" (UI/UX plan §11.4): after an opportunity is created from an open lead, offer to
    // set the lead to the workspace's Converted status.
    const afterOpportunityCreated = () => {
        loadData();
        const converted = statuses.find((status) => status.isActive && status.category === "CONVERTED");
        if (!lead || !converted || display(lead.status).category !== "OPEN") return;
        toast.success("Opportunity created", {
            duration: 8000,
            action: { label: `Mark lead ${converted.label.toLowerCase()}`, onClick: () => { changeStatus(converted.key); } },
        });
    };

    // "Add note" / "Add task" open a dialog (they used to be a form inline above the history).
    const [addMode, setAddMode] = useState<ComposerMode | null>(null);
    const focusComposer = (mode: ComposerMode) => setAddMode(mode);

    if (loading) {
        return (
            <div className="space-y-4" aria-busy="true">
                <Skeleton className="h-12 w-full" />
                <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <Skeleton className="h-80" />
                    <Skeleton className="h-96" />
                </div>
            </div>
        );
    }
    if (loadError) return <ErrorState description={loadError} onRetry={loadData} />;
    if (!lead) {
        return <ErrorState kind="permission" title="Lead not found" description="It may have been deleted or merged, or you may not have access to it." action={<Button variant="outline" asChild><Link href="/dashboard/leads">Back to leads</Link></Button>} />;
    }

    const logActivityButton = telephonyEnabled ? (
        <Button size="sm" onClick={() => setShowLogOutcomeDialog(true)}><PhoneCall className="size-4" />Log call</Button>
    ) : (
        <Button size="sm" onClick={() => setShowActivityDialog(true)}><Plus className="size-4" />Log activity</Button>
    );

    const menuItems: DetailMenuItem[] = [
        { label: "Edit lead", icon: <Pencil className="size-4" />, onSelect: () => setShowEditDialog(true) },
        { label: telephonyEnabled ? "Log other activity" : "Log call outcome", icon: <Plus className="size-4" />, onSelect: () => (telephonyEnabled ? setShowActivityDialog(true) : setShowLogOutcomeDialog(true)), hidden: !telephonyEnabled },
        { label: "Create opportunity", icon: <Plus className="size-4" />, onSelect: () => setShowOpportunityDialog(true) },
        { label: "Create case", icon: <LifeBuoy className="size-4" />, onSelect: () => setShowCaseDialog(true), hidden: !serviceDeskEnabled },
        { label: "Apply task playbook", icon: <ClipboardList className="size-4" />, onSelect: () => setShowPlaybookDialog(true) },
        { label: "Share", icon: <Users className="size-4" />, onSelect: () => setShowShareDialog(true), hidden: !canManageSharing(user, lead), separatorBefore: true },
        { label: "Push to external system", icon: <Share2 className="size-4" />, onSelect: () => setShowPushDialog(true), hidden: !(hasIntegrationsPermission(user) && dataPlatformEnabled) },
        {
            label: isFavorite ? "Remove from favorites" : "Add to favorites",
            icon: <Star className={isFavorite ? "size-4 fill-amber-500 text-amber-500" : "size-4"} />,
            onSelect: () => { toggleFavoriteRecord("lead", lead.id, lead.name || lead.email || "Lead"); setIsFavorite((current) => !current); },
        },
    ];

    const score = lead.predictiveScore;
    const scoreBand = score ? statusDisplay("scoreBand", score.scoreBand) : null;
    const phoneDigits = lead.phone ? lead.phone.replace(/[^\d+]/g, "") : "";

    return (
        <div className="mx-auto min-w-0 max-w-[1440px] pb-20 md:pb-0">
            <DetailPageHeader
                onBack={() => router.back()}
                title={lead.name}
                subtitle={[lead.company, lead.email].filter(Boolean).join(" · ") || undefined}
                meta={<>
                    <LeadStatusSelect value={lead.status} onChange={changeStatus} disabled={savingStatus} ariaLabel={`Status for ${lead.name}`} />
                    <OwnerControl entityType="LEAD" entityId={lead.id} ownerId={lead.ownerId} ownerName={lead.ownerName} onChanged={loadData} />
                </>}
                quickActions={<>
                    {logActivityButton}
                    <Button size="sm" variant="outline" onClick={() => focusComposer("note")}><NotebookPen className="size-4" />Add note</Button>
                    <Button size="sm" variant="outline" onClick={() => focusComposer("task")}><ListPlus className="size-4" />Add task</Button>
                    <AiAssistantPanel entityType="LEAD" entityId={lead.id} entityLabel={lead.name} recipientEmail={lead.email} recipientPhone={lead.phone} />
                    <ContextualFormsPanel placement="LEAD_DETAIL" context={{ leadId }} entityData={lead} onSaved={loadData} />
                </>}
                menuItems={menuItems}
                mobileActionBar
            />

            <div className="mb-3 flex justify-end empty:hidden"><ExternalPushBadge leadId={leadId} refreshKey={pushRefreshKey} /></div>

            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                {/* Phones show the activity first, then the summary (decision 10). */}
                <aside aria-label="Lead summary" className="order-2 min-w-0 space-y-4 lg:order-none lg:sticky lg:top-[calc(var(--app-header-offset,56px)+64px)]">
                    <Card className="gap-0 py-0">
                        <section aria-labelledby="lead-contact-heading" className="border-b p-4">
                            <h2 id="lead-contact-heading" className="mb-2 text-sm font-semibold">Contact</h2>
                            <ul className="space-y-2 text-sm">
                                <li className="flex min-w-0 items-center gap-2">
                                    <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                                    {lead.email ? <a href={`mailto:${lead.email}`} className="min-w-0 break-all hover:underline">{lead.email}</a> : <span className="text-muted-foreground">No email</span>}
                                </li>
                                <li className="flex min-w-0 items-center gap-2">
                                    <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                                    {lead.phone ? (
                                        <>
                                            <a href={`tel:${phoneDigits}`} className="tabular-nums hover:underline">{lead.phone}</a>
                                            {telephonyEnabled ? <Button size="xs" variant="outline" className="ml-auto" onClick={handleClickToCall}>Call</Button> : null}
                                            <a href={`https://wa.me/${phoneDigits.replace(/^\+/, "")}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${lead.name} (opens WhatsApp)`} className={telephonyEnabled ? "" : "ml-auto"}>
                                                <MessageCircle className="size-4 text-muted-foreground hover:text-foreground" aria-hidden />
                                            </a>
                                        </>
                                    ) : <span className="text-muted-foreground">No phone</span>}
                                </li>
                            </ul>
                        </section>
                        <section aria-labelledby="lead-facts-heading" className="border-b px-4 pb-2 pt-4">
                            <h2 id="lead-facts-heading" className="text-sm font-semibold">Key facts</h2>
                            <DescriptionList compact items={[
                                { label: "Score", value: score?.conversionProbability != null ? `${Math.round(score.conversionProbability)} · ${scoreBand?.label}` : lead.score ? String(lead.score) : null },
                                { label: "Last activity", value: lead.lastActivityAt ? formatWorkspaceRelativeTime(lead.lastActivityAt) : "None yet" },
                                { label: "Open value", value: opportunities.length ? formatMoney(openValue) : null },
                                { label: "Company", value: lead.company },
                                { label: "Source", value: lead.source },
                                { label: "Created", value: formatWorkspaceDate(lead.createdAt) },
                            ]} />
                        </section>
                        <div className="p-2"><CallScriptPanel recordType="LEAD" recordId={lead.id} /></div>
                    </Card>
                    <NextBestActionPanel recordType="LEAD" recordId={lead.id} />
                </aside>

                <div className="min-w-0">
                    <Card className="min-w-0 gap-0 overflow-hidden py-0">
                        <WorkspaceTabs
                            value={tab}
                            onChange={setTab}
                            tabs={[
                                { value: "activity", label: "Activity" },
                                { value: "details", label: "Details" },
                                { value: "opportunities", label: `Opportunities (${opportunities.length})` },
                                { value: "tasks", label: `Tasks (${taskCount})` },
                                { value: "communications", label: "Communications" },
                                { value: "scoring", label: "Scoring" },
                                { value: "history", label: "History" },
                            ]}
                        />

                        <div className="p-3 md:p-4">
                            {tab === "activity" && (
                                <div className="space-y-4">
                                    <RecordActivityFeed entityType="lead" entityId={lead.id} refreshKey={feedKey} />
                                </div>
                            )}

                            {tab === "details" && (
                                <div className="grid gap-x-8 md:grid-cols-2">
                                    <DescriptionList items={[
                                        { label: "Name", value: lead.name },
                                        { label: "Status", value: display(lead.status).label },
                                        { label: "Owner", value: lead.ownerName ?? "Unassigned" },
                                        { label: "Company", value: lead.company },
                                        { label: "Source", value: lead.source },
                                    ]} />
                                    <DescriptionList items={[
                                        { label: "Email", value: lead.email },
                                        { label: "Phone", value: lead.phone },
                                        { label: "Tags", value: lead.tags?.length ? lead.tags.join(", ") : null },
                                        { label: "Created", value: formatWorkspaceDateTime(lead.createdAt) },
                                        { label: "Updated", value: formatWorkspaceDateTime(lead.updatedAt) },
                                    ]} />
                                    <div className="md:col-span-2"><Button variant="outline" size="sm" className="mt-3" onClick={() => setShowEditDialog(true)}><Pencil className="size-4" />Edit lead</Button></div>
                                </div>
                            )}

                            {tab === "opportunities" && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <h3 className="text-sm font-semibold">Opportunities for this lead</h3>
                                        <Button variant="outline" size="sm" onClick={() => setShowOpportunityDialog(true)}><Plus className="size-4" />Create opportunity</Button>
                                    </div>
                                    {opportunities.length === 0 ? (
                                        <p className="py-6 text-center text-sm text-muted-foreground">No opportunities yet.</p>
                                    ) : (
                                        <ul className="divide-y rounded-lg border">
                                            {opportunities.map((opp: any) => (
                                                <li key={opp.id}>
                                                    <Link href={`/dashboard/opportunities/${opp.id}`} className="flex items-center justify-between gap-4 px-3 py-2.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                                                        <span className="min-w-0">
                                                            <span className="block truncate font-medium">{opp.title}</span>
                                                            <span className="block text-sm text-muted-foreground">{opp.stage?.name || "No stage"}</span>
                                                        </span>
                                                        <span className="shrink-0 text-sm tabular-nums">{formatMoney(opp.amount || 0)}</span>
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}

                            {tab === "tasks" && (
                                <div className="space-y-2">
                                    <div className="flex justify-end">
                                        <Button variant="outline" size="sm" onClick={() => setShowPlaybookDialog(true)}><ClipboardList className="size-4" />Apply playbook</Button>
                                    </div>
                                    <RelatedTasksPanel key={tasksRefreshKey} leadId={lead.id} currentUserId={user?.id} />
                                </div>
                            )}

                            {tab === "communications" && (
                                <div className="space-y-4">
                                    <ConsentCard entityType="LEAD" entityId={lead.id} />
                                    <CommunicationEventsPanel entityType="LEAD" entityId={lead.id} />
                                    <CallRecordingsPanel entityType="LEAD" entityId={lead.id} />
                                </div>
                            )}

                            {tab === "scoring" && <PredictiveScorePanel recordType="LEAD" recordId={lead.id} score={lead.predictiveScore} />}

                            {tab === "history" && <RecordHistory entityType="LEAD" entityId={lead.id} />}
                        </div>
                    </Card>
                </div>
            </div>

            {/* Phones (decision 10): a bottom action bar -- Call · Log · Note · More. */}
            <nav aria-label="Lead actions" className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t bg-card px-2 py-1.5 md:hidden">
                {lead.phone ? (
                    <a href={`tel:${phoneDigits}`} className="flex flex-col items-center gap-0.5 px-3 py-1 text-xs"><Phone className="size-5" aria-hidden />Call</a>
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

            <EditLeadDialog lead={lead} open={showEditDialog} onOpenChange={setShowEditDialog} onSuccess={loadData} />
            <RecordAddDialog entityType="lead" entityId={lead.id} mode={addMode} onClose={() => setAddMode(null)} onCreated={(kind) => { setFeedKey((key) => key + 1); if (kind === "task") { setTasksRefreshKey((key) => key + 1); loadData(); } }} />
            <CreateActivityDialog open={showActivityDialog} onOpenChange={setShowActivityDialog} defaultLeadId={lead.id} trigger={<span hidden />} onSuccess={() => { setFeedKey((key) => key + 1); loadData(); }} />
            <CreateOpportunityDialog open={showOpportunityDialog} onOpenChange={setShowOpportunityDialog} defaultLeadId={lead.id} trigger={<span hidden />} onSuccess={afterOpportunityCreated} />
            {serviceDeskEnabled ? <CreateCaseButton open={showCaseDialog} onOpenChange={setShowCaseDialog} relatedLeadId={lead.id} requesterName={lead.name} requesterEmail={lead.email} /> : null}
            <ExternalPushDialog open={showPushDialog} onClose={() => setShowPushDialog(false)} leadId={leadId} linkedOpportunities={opportunities} onPushed={() => setPushRefreshKey((key) => key + 1)} />
            {telephonyEnabled && <LogCallOutcomeDialog open={showLogOutcomeDialog} onClose={() => setShowLogOutcomeDialog(false)} leadId={leadId} onLogged={() => { setFeedKey((key) => key + 1); loadData(); }} />}
            <RecordShareDialog open={showShareDialog} onClose={() => setShowShareDialog(false)} recordType="leads" recordId={leadId} recordLabel={lead.name} />
            <ApplyPlaybookDialog open={showPlaybookDialog} onClose={() => setShowPlaybookDialog(false)} leadId={leadId} targetModule="LEAD" onApplied={() => setTasksRefreshKey((key) => key + 1)} />
        </div>
    );
}
