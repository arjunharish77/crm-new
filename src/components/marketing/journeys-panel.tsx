"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StandardDialog } from "@/components/common/standard-dialog";
import { TableSkeleton } from "@/components/common/skeletons";
import { ErrorState } from "@/components/common/error-state";
import { EmptyState } from "@/components/common/empty-state";
import { Plus, ExternalLink, Play, Pause, Send, History, RotateCcw, UploadCloud, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useModuleEnabled } from "@/components/auth/feature-gate";
import { useConfirmDialog } from "@/components/common/confirm-dialog";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { useAskText } from "@/components/common/dialogs-provider";

type Journey = {
    id: string;
    automationId: string;
    name: string;
    description: string | null;
    targetModule: "LEAD" | "OPPORTUNITY";
    status: "DRAFT" | "APPROVED" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "ARCHIVED";
    audienceType: "LEAD_LIST" | "SAVED_VIEW" | "MANUAL";
    audienceConfig: Record<string, any>;
    continuousEnrollment: boolean;
    currentVersion: number;
};

type JourneyVersion = {
    id: string;
    version: number;
    publishNotes: string | null;
    publishedBy: string | null;
    publishedAt: string;
};

type JourneyEnrollment = {
    id: string;
    recordType: "LEAD" | "OPPORTUNITY";
    recordId: string;
    status: "ACTIVE" | "EXITED" | "CONVERTED" | "UNSUBSCRIBED" | string;
    enrolledAt: string;
    exitedAt: string | null;
    exitReason: string | null;
};

const ENROLLMENT_STATUS: Record<string, { label: string; tone: "success" | "info" | "neutral" | "warning" | "danger" }> = {
    ACTIVE: { label: "Active", tone: "info" },
    CONVERTED: { label: "Converted", tone: "success" },
    EXITED: { label: "Exited", tone: "neutral" },
    UNSUBSCRIBED: { label: "Unsubscribed", tone: "warning" },
};

const ENROLLMENT_FILTERS = ["ALL", "ACTIVE", "CONVERTED", "EXITED", "UNSUBSCRIBED"] as const;

const STATUS_CLASSNAMES: Record<Journey["status"], string> = {
    DRAFT: "border-border bg-muted text-muted-foreground",
    APPROVED: "border-tertiary/20 bg-tertiary/10 text-tertiary",
    SCHEDULED: "border-tertiary/20 bg-tertiary/10 text-tertiary",
    ACTIVE: "border-primary/20 bg-primary/10 text-primary",
    PAUSED: "border-status-warning bg-status-warning text-status-warning-foreground",
    ARCHIVED: "border-border bg-muted text-muted-foreground",
};

const NEXT_STATUS: Partial<Record<Journey["status"], Journey["status"]>> = {
    DRAFT: "APPROVED",
    APPROVED: "ACTIVE",
    PAUSED: "ACTIVE",
};

const EMPTY_FORM = {
    name: "",
    description: "",
    targetModule: "LEAD" as Journey["targetModule"],
    audienceType: "LEAD_LIST" as Journey["audienceType"],
    audienceConfig: {} as Record<string, any>,
    continuousEnrollment: false,
};

export function JourneysPanel() {
    const moduleEnabled = useModuleEnabled("JOURNEY_ORCHESTRATION");
    const [confirmDialog, askConfirm] = useConfirmDialog();
    const [journeys, setJourneys] = useState<Journey[]>([]);
    const [leadLists, setLeadLists] = useState<Array<{ id: string; name: string }>>([]);
    const [savedViews, setSavedViews] = useState<Array<{ id: string; name: string }>>([]);
    const [viewsState, setViewsState] = useState("loading");
    const [viewRetry, setViewRetry] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [versionsJourney, setVersionsJourney] = useState<Journey | null>(null);
    const [versions, setVersions] = useState<JourneyVersion[]>([]);
    const [versionsLoading, setVersionsLoading] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
    // Embedded analytics surface (gap checklist Module 17, item 25): a compact health summary
    // for the operational-monitoring surface built in Module 8 (getJourneyHealthForTenant),
    // which previously had an API but no UI anywhere to actually see it.
    const [health, setHealth] = useState<Array<{ journeyId: string; status: "HEALTHY" | "DEGRADED" | "AT_RISK" }>>([]);
    // Per-journey enrolments (UI/UX plan decision 33): who is in a journey, with a way to take
    // one record out.
    const askText = useAskText();
    const [enrollmentsJourney, setEnrollmentsJourney] = useState<Journey | null>(null);
    const [enrollments, setEnrollments] = useState<JourneyEnrollment[] | null>(null);
    const [enrollmentsFailed, setEnrollmentsFailed] = useState(false);
    const [enrollmentFilter, setEnrollmentFilter] = useState<(typeof ENROLLMENT_FILTERS)[number]>("ALL");
    const [updatingEnrollmentId, setUpdatingEnrollmentId] = useState<string | null>(null);

    const fetchJourneys = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const data = await apiFetch<Journey[]>("/marketing/journeys");
            setJourneys(Array.isArray(data) ? data : []);
        } catch {
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchJourneys();
        apiFetch<any[]>("/lead-lists").then((data) => setLeadLists(Array.isArray(data) ? data : [])).catch(() => setLeadLists([]));
        apiFetch<any[]>("/marketing/journeys/health").then((data) => setHealth(Array.isArray(data) ? data : [])).catch(() => setHealth([]));
    }, [fetchJourneys]);

    // Scoped to the currently-selected target module (LEADS/OPPORTUNITIES) via the
    // existing server-side module filter, rather than fetching every saved view and
    // letting an admin pick one for the wrong module -- selecting a Lead-only view for
    // an Opportunity-targeted journey (or vice versa) previously resolved server-side to
    // "match everything" (fixed separately), but keeping the picker itself scoped closes
    // the footgun at the source rather than relying only on the server-side fallback fix.
    useEffect(() => {
        let current = true;
        setSavedViews([]);
        setViewsState("loading");
        const savedViewModule = form.targetModule === "OPPORTUNITY" ? "OPPORTUNITIES" : "LEADS";
        apiFetch<any[]>(`/saved-views?module=${savedViewModule}`).then((data) => {
            if (!current) return;
            setSavedViews(Array.isArray(data) ? data : []);
            setViewsState("ready");
        }).catch(() => { if (current) setViewsState("error"); });
        return () => { current = false; };
    }, [form.targetModule, viewRetry]);

    const audienceReady = form.audienceType === "LEAD_LIST" ? !!form.audienceConfig.leadListId
        : form.audienceType === "SAVED_VIEW" ? viewsState === "ready" && !!form.audienceConfig.savedViewId
        : (form.audienceConfig.recordIds?.length ?? 0) > 0;

    const handleCreate = async () => {
        if (!form.name.trim()) {
            toast.error("Journey name is required");
            return;
        }
        setCreating(true);
        try {
            await apiFetch("/marketing/journeys", { method: "POST", body: JSON.stringify(form) });
            toast.success("Journey created — add its workflow, then approve and activate it");
            setCreateOpen(false);
            setForm(EMPTY_FORM);
            fetchJourneys();
        } catch (error: any) {
            toast.error(error.message || "Failed to create journey");
        } finally { setCreating(false); }
    };

    const advanceStatus = async (journey: Journey) => {
        const next = NEXT_STATUS[journey.status];
        if (!next) return;
        setBusyId(journey.id);
        try {
            await apiFetch(`/marketing/journeys/${journey.id}/status`, { method: "POST", body: JSON.stringify({ status: next }) });
            toast.success(`Journey ${next === "ACTIVE" ? "activated" : next.toLowerCase()}`);
            fetchJourneys();
        } catch (error: any) {
            toast.error(error.message || "Failed to update journey status");
        } finally {
            setBusyId(null);
        }
    };

    // Pausing stops new enrollments only: records already in the journey keep moving through
    // its steps (marketing-journeys.ts keeps the automation live so they aren't dropped).
    const pauseJourney = async (journey: Journey) => {
        const confirmed = await askConfirm({
            title: `Pause ${journey.name}?`,
            description: "No one new joins while it's paused. People already in it carry on through its steps, including messages. Resume it any time.",
            confirmLabel: "Pause journey",
        });
        if (!confirmed) return;
        setBusyId(journey.id);
        try {
            await apiFetch(`/marketing/journeys/${journey.id}/status`, { method: "POST", body: JSON.stringify({ status: "PAUSED" }) });
            toast.success("Journey paused");
            fetchJourneys();
        } catch (error: any) {
            toast.error(error.message || "Failed to pause journey");
        } finally {
            setBusyId(null);
        }
    };

    // Enrolling starts the journey's steps (including messages) for every record in the audience,
    // so it confirms first with the audience size (UI/UX plan B2). If the size can't be loaded,
    // nothing is enrolled.
    const enrollNow = async (journey: Journey) => {
        setBusyId(journey.id);
        try {
            let total: number;
            try {
                const simulation = await apiFetch<{ audienceTotal: number }>(`/marketing/journeys/${journey.id}/simulate`, { method: "POST", body: JSON.stringify({ sampleSize: 1 }) });
                total = Number(simulation.audienceTotal ?? 0);
            } catch {
                toast.error("Couldn't count the audience, so no one was enrolled. Try again.");
                return;
            }
            if (total === 0) {
                toast.error("This journey's audience is empty");
                return;
            }
            const records = `${total.toLocaleString()} ${journey.targetModule === "OPPORTUNITY" ? "opportunit" + (total === 1 ? "y" : "ies") : "lead" + (total === 1 ? "" : "s")}`;
            const confirmed = await askConfirm({
                title: "Enroll audience now?",
                description: "The journey's steps start right away, including any messages it sends.",
                confirmLabel: `Enroll ${records}`,
                body: (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                        <dt className="text-muted-foreground">Journey</dt><dd className="min-w-0 break-words font-medium">{journey.name}</dd>
                        <dt className="text-muted-foreground">Audience</dt><dd>{records}</dd>
                        <dt className="text-muted-foreground">Already enrolled</dt><dd>Skipped</dd>
                    </dl>
                ),
            });
            if (!confirmed) return;
            const result = await apiFetch<{ enrolled: number; skipped: number; complete?: boolean }>(`/marketing/journeys/${journey.id}/enroll`, { method: "POST" });
            // A large audience is enrolled in batches; the rest carries on in the background (§8 #24).
            toast.success(result.complete === false
                ? `Enrolled ${result.enrolled.toLocaleString()} so far (${result.skipped.toLocaleString()} skipped); the rest are being enrolled in the background`
                : `Enrolled ${result.enrolled.toLocaleString()} record(s), skipped ${result.skipped.toLocaleString()} already enrolled or in a higher-priority journey`);
        } catch (error: any) {
            toast.error(error.message || "Failed to enroll audience");
        } finally {
            setBusyId(null);
        }
    };

    const fetchVersions = useCallback(async (journeyId: string) => {
        setVersionsLoading(true);
        try {
            const data = await apiFetch<JourneyVersion[]>(`/marketing/journeys/${journeyId}/versions`);
            setVersions(Array.isArray(data) ? data : []);
        } catch {
            toast.error("Failed to load version history");
        } finally {
            setVersionsLoading(false);
        }
    }, []);

    const openVersions = (journey: Journey) => {
        setVersionsJourney(journey);
        fetchVersions(journey.id);
    };

    const publishCurrentWorkflow = async () => {
        if (!versionsJourney) return;
        setPublishing(true);
        try {
            const updated = await apiFetch<Journey>(`/marketing/journeys/${versionsJourney.id}/publish`, { method: "POST", body: JSON.stringify({}) });
            toast.success(`Published version ${updated.currentVersion}`);
            setVersionsJourney(updated);
            fetchVersions(versionsJourney.id);
            fetchJourneys();
        } catch (error: any) {
            toast.error(error.message || "Failed to publish version");
        } finally {
            setPublishing(false);
        }
    };

    const restoreVersion = async (version: number) => {
        if (!versionsJourney) return;
        if (!(await askConfirm({ title: `Restore version ${version}?`, description: "This publishes its workflow as the new current version. Nothing is deleted.", confirmLabel: "Restore version" }))) return;
        setRestoringVersion(version);
        try {
            const updated = await apiFetch<Journey>(`/marketing/journeys/${versionsJourney.id}/versions/${version}/restore`, { method: "POST" });
            toast.success(`Restored version ${version} as new version ${updated.currentVersion}`);
            setVersionsJourney(updated);
            fetchVersions(versionsJourney.id);
            fetchJourneys();
        } catch (error: any) {
            toast.error(error.message || "Failed to restore version");
        } finally {
            setRestoringVersion(null);
        }
    };

    const fetchEnrollments = useCallback(async (journeyId: string) => {
        setEnrollmentsFailed(false);
        setEnrollments(null);
        try {
            const data = await apiFetch<JourneyEnrollment[]>(`/marketing/journeys/${journeyId}/enrollments`);
            setEnrollments(Array.isArray(data) ? data : []);
        } catch {
            setEnrollmentsFailed(true);
        }
    }, []);

    const openEnrollments = (journey: Journey) => {
        setEnrollmentsJourney(journey);
        setEnrollmentFilter("ALL");
        fetchEnrollments(journey.id);
    };

    // Exit / Mark converted set the enrolment's status (the API also accepts UNSUBSCRIBED; there is
    // no pause). The status feeds the journey's reports and collision rules, but the API doesn't
    // cancel workflow steps already scheduled for the record, so the copy says so.
    const updateEnrollment = async (enrollment: JourneyEnrollment, status: "EXITED" | "CONVERTED") => {
        const record = enrollment.recordType === "OPPORTUNITY" ? "opportunity" : "lead";
        let exitReason: string | null = null;
        if (status === "EXITED") {
            const reason = await askText({
                title: `Take this ${record} out of ${enrollmentsJourney?.name ?? "the journey"}?`,
                description: "It's recorded as exited in this journey's reports. Workflow steps already scheduled for it may still run. This can't be undone here.",
                label: "Reason (optional)",
                confirmLabel: `Exit ${record}`,
                destructive: true,
            });
            if (reason === null) return;
            exitReason = reason || "Exited manually";
        } else {
            const confirmed = await askConfirm({
                title: `Mark this ${record} as converted?`,
                description: "It's recorded as converted in this journey's reports. Workflow steps already scheduled for it may still run. This can't be undone here.",
                confirmLabel: "Mark converted",
            });
            if (!confirmed) return;
            exitReason = "Marked converted manually";
        }
        setUpdatingEnrollmentId(enrollment.id);
        try {
            const updated = await apiFetch<JourneyEnrollment>(`/marketing/journeys/enrollments/${enrollment.id}`, {
                method: "PATCH",
                body: JSON.stringify({ status, exitReason }),
            });
            setEnrollments((current) => (current ?? []).map((item) => (item.id === updated.id ? updated : item)));
            toast.success(status === "EXITED" ? `The ${record} left the journey` : `The ${record} was marked converted`);
        } catch (error: any) {
            toast.error(error.message || "The enrolment couldn't be updated");
        } finally {
            setUpdatingEnrollmentId(null);
        }
    };

    if (!moduleEnabled) {
        return <EmptyState title="Journey Orchestration isn't enabled" description="Ask a platform admin to enable this module for your tenant." />;
    }

    if (loadError) return <ErrorState description="Marketing journeys could not be loaded." onRetry={fetchJourneys} />;
    if (loading) return <TableSkeleton rows={3} columns={2} />;

    return (
        <div className="space-y-4">
            {confirmDialog}
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-sm font-bold">Marketing Journeys</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Branching, multi-step outreach on top of Views/Lists as audiences and the existing Automation workflow builder.
                    </p>
                </div>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="size-4" />
                    New Journey
                </Button>
            </div>

            {health.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-3 text-xs">
                    <span className="font-semibold text-muted-foreground">Journey health:</span>
                    <Badge variant="outline" className="rounded-md border-primary/20 bg-primary/10 text-primary">
                        {health.filter((h) => h.status === "HEALTHY").length} healthy
                    </Badge>
                    <Badge variant="outline" className="rounded-md border-status-warning bg-status-warning text-status-warning-foreground">
                        {health.filter((h) => h.status === "DEGRADED").length} degraded
                    </Badge>
                    <Badge variant="outline" className="rounded-md border-destructive/30 bg-destructive/10 text-destructive">
                        {health.filter((h) => h.status === "AT_RISK").length} at risk
                    </Badge>
                </div>
            )}

            {journeys.length === 0 ? (
                <EmptyState title="No journeys yet" description="Create a journey, build its workflow, then approve and activate it." />
            ) : (
                <div className="space-y-3">
                    {journeys.map((journey) => (
                        <div key={journey.id} className="rounded-xl border bg-card p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0 flex-1 basis-60 break-words">
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <span className="min-w-0 break-words text-sm font-bold">{journey.name}</span>
                                        <Badge variant="outline" className={cn("rounded-md text-xs font-semibold", STATUS_CLASSNAMES[journey.status])}>
                                            {journey.status}
                                        </Badge>
                                        <Badge variant="outline" className="rounded-md text-xs">{journey.targetModule}</Badge>
                                        <Badge variant="outline" className="rounded-md text-xs">
                                            {journey.currentVersion > 0 ? `v${journey.currentVersion}` : "Unpublished"}
                                        </Badge>
                                        {(() => {
                                            const journeyHealth = health.find((h) => h.journeyId === journey.id);
                                            if (!journeyHealth || journeyHealth.status === "HEALTHY") return null;
                                            return (
                                                <Badge
                                                    variant="outline"
                                                    className={cn(
                                                        "rounded-md text-xs font-semibold",
                                                        journeyHealth.status === "AT_RISK"
                                                            ? "border-destructive/30 bg-destructive/10 text-destructive"
                                                            : "border-status-warning bg-status-warning text-status-warning-foreground",
                                                    )}
                                                >
                                                    {journeyHealth.status === "AT_RISK" ? "At risk" : "Degraded"}
                                                </Badge>
                                            );
                                        })()}
                                    </div>
                                    {journey.description && <p className="mt-1 text-xs text-muted-foreground">{journey.description}</p>}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button size="sm" variant="outline" asChild>
                                        <Link href={`/dashboard/automations-v2/${journey.automationId}`} target="_blank">
                                            <ExternalLink className="size-4" />
                                            Edit Workflow
                                        </Link>
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => openVersions(journey)}>
                                        <History className="size-4" />
                                        Versions
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => openEnrollments(journey)}>
                                        <Users className="size-4" />
                                        Enrolments
                                    </Button>
                                    {NEXT_STATUS[journey.status] && (
                                        <Button size="sm" disabled={busyId === journey.id} onClick={() => advanceStatus(journey)}>
                                            <Play className="size-4" />
                                            {journey.status === "DRAFT" ? "Approve" : "Activate"}
                                        </Button>
                                    )}
                                    {journey.status === "ACTIVE" && (
                                        <>
                                            <Button size="sm" variant="outline" disabled={busyId === journey.id} onClick={() => enrollNow(journey)}>
                                                <Send className="size-4" />
                                                Enroll Audience Now
                                            </Button>
                                            <Button size="sm" variant="ghost" disabled={busyId === journey.id} onClick={() => pauseJourney(journey)}>
                                                <Pause className="size-4" />
                                                Pause
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <StandardDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                title="New Marketing Journey"
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button disabled={creating || !form.name.trim() || !audienceReady} onClick={handleCreate}>{creating ? "Creating..." : "Create Journey"}</Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="min-w-0 space-y-1.5">
                        <Label htmlFor="journey-field-1">Name</Label>
                        <Input id="journey-field-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="min-w-0 space-y-1.5">
                        <Label htmlFor="journey-field-2">Description (optional)</Label>
                        <Input id="journey-field-2" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="min-w-0 space-y-1.5">
                            <Label htmlFor="journey-field-3">Target Module</Label>
                            <Select value={form.targetModule} onValueChange={(value) => setForm((f) => ({ ...f, targetModule: value as Journey["targetModule"], audienceType: value === "OPPORTUNITY" && f.audienceType === "LEAD_LIST" ? "SAVED_VIEW" : f.audienceType, audienceConfig: {} }))}>
                                <SelectTrigger id="journey-field-3" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="LEAD">Leads</SelectItem>
                                    <SelectItem value="OPPORTUNITY">Opportunities</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="min-w-0 space-y-1.5">
                            <Label htmlFor="journey-field-4">Audience Source</Label>
                            <Select value={form.audienceType} onValueChange={(value) => setForm((f) => ({ ...f, audienceType: value as Journey["audienceType"], audienceConfig: {} }))}>
                                <SelectTrigger id="journey-field-4" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="LEAD_LIST" disabled={form.targetModule !== "LEAD"}>Lead List</SelectItem>
                                    <SelectItem value="SAVED_VIEW">Saved View</SelectItem>
                                    <SelectItem value="MANUAL">Manual Record Ids</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    {form.audienceType === "LEAD_LIST" && (
                        <div className="min-w-0 space-y-1.5">
                            <Label htmlFor="journey-field-5">Lead List</Label>
                            <Select value={form.audienceConfig.leadListId || ""} onValueChange={(value) => setForm((f) => ({ ...f, audienceConfig: { leadListId: value } }))}>
                                <SelectTrigger id="journey-field-5" className="w-full"><SelectValue placeholder="Select a list" /></SelectTrigger>
                                <SelectContent>
                                    {leadLists.map((list) => (
                                        <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    {form.audienceType === "SAVED_VIEW" && (
                        <div className="min-w-0 space-y-1.5">
                            <Label htmlFor="journey-field-6">Saved View</Label>
                            <Select disabled={viewsState !== "ready"} value={form.audienceConfig.savedViewId || ""} onValueChange={(value) => setForm((f) => ({ ...f, audienceConfig: { savedViewId: value } }))}>
                                <SelectTrigger id="journey-field-6" className="w-full"><SelectValue placeholder="Select a view" /></SelectTrigger>
                                <SelectContent>
                                    {savedViews.map((view) => (
                                        <SelectItem key={view.id} value={view.id}>{view.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {viewsState === "error" && <ErrorState description="Audience views could not be loaded." onRetry={() => setViewRetry(value => value + 1)} />}
                        </div>
                    )}
                    {form.audienceType === "MANUAL" && (
                        <div className="min-w-0 space-y-1.5">
                            <Label htmlFor="journey-field-7">Record Ids (comma-separated)</Label>
                            <Input id="journey-field-7"
                                defaultValue={(form.audienceConfig.recordIds ?? []).join(", ")}
                                placeholder="record-id-1, record-id-2"
                                onChange={(e) => setForm((f) => ({ ...f, audienceConfig: { recordIds: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) } }))}
                            />
                        </div>
                    )}
                    <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
                        <Switch checked={form.continuousEnrollment} onCheckedChange={(checked) => setForm((f) => ({ ...f, continuousEnrollment: checked }))} />
                        Continuously enroll new matching records (worker re-checks the audience periodically)
                    </label>
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!versionsJourney}
                onClose={() => setVersionsJourney(null)}
                title={versionsJourney ? `Version History — ${versionsJourney.name}` : "Version History"}
                maxWidth="sm"
                actions={<Button variant="ghost" onClick={() => setVersionsJourney(null)}>Close</Button>}
            >
                <div className="space-y-4">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">
                            Publish the workflow currently open in the editor as a new version, so it becomes a restore point.
                        </p>
                        <Button size="sm" disabled={publishing} onClick={publishCurrentWorkflow}>
                            <UploadCloud className="size-4" />
                            Publish Current
                        </Button>
                    </div>

                    {versionsLoading ? (
                        <TableSkeleton rows={3} columns={1} />
                    ) : versions.length === 0 ? (
                        <EmptyState title="No published versions yet" description="Publish the current workflow to create the first restore point." />
                    ) : (
                        <div className="space-y-2">
                            {versions.map((v) => (
                                <div key={v.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                                    <div>
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <span className="text-sm font-bold">v{v.version}</span>
                                            {versionsJourney?.currentVersion === v.version && (
                                                <Badge variant="outline" className="rounded-md text-xs">Current</Badge>
                                            )}
                                        </div>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {v.publishNotes || "No publish notes"} &middot; {formatWorkspaceDateTime(v.publishedAt)}
                                        </p>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={restoringVersion === v.version || versionsJourney?.currentVersion === v.version}
                                        onClick={() => restoreVersion(v.version)}
                                    >
                                        <RotateCcw className="size-4" />
                                        Restore
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!enrollmentsJourney}
                onClose={() => setEnrollmentsJourney(null)}
                title={enrollmentsJourney ? `Enrolments in ${enrollmentsJourney.name}` : "Enrolments"}
                subtitle="Records in this journey, newest first."
                maxWidth="md"
                actions={<Button variant="ghost" onClick={() => setEnrollmentsJourney(null)}>Close</Button>}
            >
                {enrollmentsFailed ? (
                    <ErrorState variant="inline" description="The enrolments couldn't be loaded." onRetry={() => enrollmentsJourney && fetchEnrollments(enrollmentsJourney.id)} />
                ) : enrollments === null ? (
                    <TableSkeleton rows={4} columns={3} />
                ) : enrollments.length === 0 ? (
                    <EmptyState variant="inline" icon={<Users />} title="No one is enrolled yet" description="Activate the journey and enrol its audience, or turn on continuous enrolment." />
                ) : (() => {
                    const counts = enrollments.reduce<Record<string, number>>((acc, item) => { acc[item.status] = (acc[item.status] ?? 0) + 1; return acc; }, {});
                    const shown = enrollmentFilter === "ALL" ? enrollments : enrollments.filter((item) => item.status === enrollmentFilter);
                    return (
                        <div className="space-y-3">
                            <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1">
                                {ENROLLMENT_FILTERS.map((filter) => (
                                    <Button
                                        key={filter}
                                        size="xs"
                                        variant={enrollmentFilter === filter ? "secondary" : "ghost"}
                                        aria-pressed={enrollmentFilter === filter}
                                        onClick={() => setEnrollmentFilter(filter)}
                                    >
                                        {filter === "ALL" ? "All" : ENROLLMENT_STATUS[filter].label} ({filter === "ALL" ? enrollments.length : counts[filter] ?? 0})
                                    </Button>
                                ))}
                            </div>
                            {shown.length === 0 ? (
                                <EmptyState variant="inline" kind="no-match" title="No enrolments with this status" />
                            ) : (
                                <ul className="divide-y rounded-lg border">
                                    {shown.map((enrollment) => {
                                        const status = ENROLLMENT_STATUS[enrollment.status] ?? { label: enrollment.status, tone: "neutral" as const };
                                        const record = enrollment.recordType === "OPPORTUNITY" ? "Opportunity" : "Lead";
                                        const href = enrollment.recordType === "OPPORTUNITY" ? `/dashboard/opportunities/${enrollment.recordId}` : `/dashboard/leads/${enrollment.recordId}`;
                                        const busy = updatingEnrollmentId === enrollment.id;
                                        return (
                                            <li key={enrollment.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                                                <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                        <Link href={href} target="_blank" className="text-sm font-medium text-primary hover:underline">
                                                            Open {record.toLowerCase()} <span className="font-mono text-xs text-muted-foreground">{enrollment.recordId.slice(0, 8)}</span>
                                                        </Link>
                                                        <Badge tone={status.tone}>{status.label}</Badge>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        Enrolled {formatWorkspaceDateTime(enrollment.enrolledAt)}
                                                        {enrollment.exitedAt ? <> &middot; Left {formatWorkspaceDateTime(enrollment.exitedAt)}</> : null}
                                                        {enrollment.exitReason ? <> &middot; {enrollment.exitReason}</> : null}
                                                    </p>
                                                </div>
                                                {enrollment.status === "ACTIVE" ? (
                                                    <div className="flex shrink-0 gap-1">
                                                        <Button size="sm" variant="outline" disabled={busy} aria-label={`Mark converted: ${record.toLowerCase()} ${enrollment.recordId.slice(0, 8)}`} onClick={() => updateEnrollment(enrollment, "CONVERTED")}>Mark converted</Button>
                                                        <Button size="sm" variant="outline" disabled={busy} isLoading={busy} aria-label={`Exit ${record.toLowerCase()} ${enrollment.recordId.slice(0, 8)}`} onClick={() => updateEnrollment(enrollment, "EXITED")}>Exit</Button>
                                                    </div>
                                                ) : null}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    );
                })()}
            </StandardDialog>
        </div>
    );
}
