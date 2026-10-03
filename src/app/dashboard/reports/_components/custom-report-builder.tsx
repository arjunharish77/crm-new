"use client";

import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/common/dialogs-provider";
import { ErrorState } from "@/components/common/error-state";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { recordRecentView } from "@/lib/recent-records";
import { History, Play, Plus, Save, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { QueueExportButton } from "@/components/exports/queue-export-button";
import { StandardDialog } from "@/components/common/standard-dialog";
import { OBJECTS_BY_ROOT, OBJECT_LABELS, REPORT_OPERATORS, ROOT_OPTIONS, ReportRoot, ReportVersionHistoryDialog, formatFieldLabel, formatReportCell } from "./report-shared";

type ReportFieldSelection = { object: string; field: string; label?: string };

type ReportFilterSelection = { object: string; field: string; operator: string; value?: string | number | boolean | null };


const COMMON_LEAD_SOURCES = ["Website", "Partner", "Referral", "Campaign", "Walk-in", "Social", "Email", "Event"];

const STATUS_VALUES = ["NEW", "QUALIFIED", "CONTACTED", "WON", "LOST", "OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "ACTIVE", "INACTIVE"];

const PRIORITY_VALUES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const SLA_VALUES = ["PENDING", "MET", "BREACHED"];


// The query definition exactly as the builder saves it. Used both for what is sent and for
// telling whether the on-screen report still matches the saved one (export reads the saved one).
function normalizeReportDefinition(input: {
    root: ReportRoot;
    savedViewId: string | null;
    fields: ReportFieldSelection[];
    filters: ReportFilterSelection[];
    orderBy: { object: string; field: string; direction: "asc" | "desc" };
    limit: number;
}) {
    return {
        root: input.root,
        savedViewId: input.savedViewId,
        fields: input.fields,
        filters: input.filters.map((filter) => ({
            ...filter,
            value: filter.operator === "is_empty" || filter.operator === "is_not_empty" ? null : filter.value ?? "",
        })),
        orderBy: input.orderBy,
        limit: input.limit,
    };
}


// `reportId` (the /reports/custom/<id> page) loads that saved report; without it the builder
// starts a new one (/reports/new). Saving a new report moves to its own URL.
// Equal regardless of key order (the published definition comes back from jsonb).
function sameJson(a: unknown, b: unknown) {
    const stable = (value: unknown): string => Array.isArray(value)
        ? `[${value.map(stable).join(",")}]`
        : value && typeof value === "object"
            ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable((value as any)[key])}`).join(",")}}`
            : JSON.stringify(value ?? null);
    return stable(a) === stable(b);
}


// What Publish changes, compared with the published definition.
function summarizeReportChanges(published: any, next: any): string[] {
    if (!published?.root) return [`First version: ${next.fields?.length ?? 0} column${next.fields?.length === 1 ? "" : "s"}`];
    const items: string[] = [];
    if (published.root !== next.root) items.push(`Records: ${published.root} → ${next.root}`);
    const key = (field: any) => `${field.object}.${field.field}`;
    const before = new Map((published.fields ?? []).map((field: any) => [key(field), field]));
    const after = new Map((next.fields ?? []).map((field: any) => [key(field), field]));
    const added = [...after.keys()].filter((id) => !before.has(id)).map((id) => (after.get(id) as any)?.label || id);
    const removed = [...before.keys()].filter((id) => !after.has(id)).map((id) => (before.get(id) as any)?.label || id);
    if (added.length) items.push(`Columns added: ${added.join(", ")}`);
    if (removed.length) items.push(`Columns removed: ${removed.join(", ")}`);
    const beforeCount = (published.fields ?? []).length;
    const afterCount = (next.fields ?? []).length;
    if (!added.length && !removed.length && beforeCount !== afterCount) items.push(`Columns: ${beforeCount} → ${afterCount}`);
    if (!sameJson(published.filters ?? [], next.filters ?? [])) items.push(`Filters: ${(published.filters ?? []).length} → ${(next.filters ?? []).length}`);
    if ((published.savedViewId ?? null) !== (next.savedViewId ?? null)) items.push("Record source changed");
    if (!sameJson(published.orderBy ?? null, next.orderBy ?? null)) items.push("Sort order changed");
    if ((published.limit ?? null) !== (next.limit ?? null)) items.push(`Row limit: ${published.limit ?? "—"} → ${next.limit ?? "—"}`);
    if (!items.length && !sameJson(published.fields, next.fields)) items.push("Column labels or order changed");
    return items.length ? items : ["No changes from the published report"];
}


export function CustomReportBuilder({ selectedReport, reportId: routeReportId }: { selectedReport?: any; reportId?: string }) {
    const router = useRouter();
    const confirm = useConfirm();
    const [catalog, setCatalog] = useState<Record<string, string[]>>({});
    const [loadingCatalog, setLoadingCatalog] = useState(true);
    const [catalogError, setCatalogError] = useState(false);
    const [editingReportId, setEditingReportId] = useState<string | null>(null);
    // The saved report this page was opened for (/reports/custom/<id>, or ?reportId=).
    const [routeReport, setRouteReport] = useState<any>(null);
    const [routeLoad, setRouteLoad] = useState<"loading" | "failed" | "missing" | "unsupported" | "done">(routeReportId ? "loading" : "done");
    const [routeRetryKey, setRouteRetryKey] = useState(0);
    const [name, setName] = useState("Lead activity report");
    // Who can see the saved report (decided 2026-10-03): everyone in the workspace, or only its
    // owner (and admins).
    const [sharedWithEveryone, setSharedWithEveryone] = useState(true);
    // Save model (decision 29): the builder autosaves a draft; Publish makes it what runs.
    // `published` is the report's published definition (null before the first publish).
    const [reportState, setReportState] = useState<{ version: number; hasDraft: boolean; published: any | null }>({ version: 0, hasDraft: false, published: null });
    const [savedDraftKey, setSavedDraftKey] = useState<string | null>(null);
    const [saveError, setSaveError] = useState(false);
    const [publishOpen, setPublishOpen] = useState(false);
    const [publishNotes, setPublishNotes] = useState("");
    const [publishing, setPublishing] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [root, setRoot] = useState<ReportRoot>("lead");
    const [fields, setFields] = useState<ReportFieldSelection[]>([{ object: "lead", field: "name", label: "Lead Name" }]);
    const [filters, setFilters] = useState<ReportFilterSelection[]>([]);
    const [orderBy, setOrderBy] = useState({ object: "lead", field: "createdAt", direction: "desc" as "asc" | "desc" });
    const [limit, setLimit] = useState(100);
    const [preview, setPreview] = useState<any>(null);
    const [running, setRunning] = useState(false);
    const [saving, setSaving] = useState(false);
    const [users, setUsers] = useState<any[]>([]);
    const [opportunityTypes, setOpportunityTypes] = useState<any[]>([]);
    const [aiPrompt, setAiPrompt] = useState("");
    const [aiGenerating, setAiGenerating] = useState(false);

    // Gap checklist Module 7, item 7: "natural-language report/view helper." Never auto-saves --
    // populates the same builder state a human editing the form would, and shows the same
    // preview, so the generated definition is fully reviewable/editable before Save.
    const runAiReportPrompt = async () => {
        if (!aiPrompt.trim() || aiGenerating) return;
        setAiGenerating(true);
        setPreview(null);
        try {
            const response = await apiFetch<{ definition: any; preview: any }>("/ai/nl-report", {
                method: "POST",
                body: JSON.stringify({ prompt: aiPrompt.trim() }),
            });
            const definition = response.definition;
            setRoot(definition.root);
            setFields(Array.isArray(definition.fields) ? definition.fields : []);
            setFilters(Array.isArray(definition.filters) ? definition.filters : []);
            setOrderBy(definition.orderBy ?? { object: definition.fields[0].object, field: definition.fields[0].field, direction: "asc" });
            setLimit(definition.limit ?? 200);
            setSavedViewId("__all__");
            setPreview(response.preview);
            toast.success("Report definition generated -- review before saving");
        } catch (error: any) {
            toast.error(error.message || "Failed to generate report from prompt");
        } finally {
            setAiGenerating(false);
        }
    };
    const [activityTypes, setActivityTypes] = useState<any[]>([]);
    const [savedViews, setSavedViews] = useState<any[]>([]);
    const [savedViewId, setSavedViewId] = useState("__all__");

    const fetchCatalog = () => {
        setLoadingCatalog(true);
        setCatalogError(false);
        apiFetch<{ objects: Record<string, string[]> }>("/reports/query")
            .then((data) => setCatalog(data.objects ?? {}))
            .catch(() => setCatalogError(true))
            .finally(() => setLoadingCatalog(false));
    };
    useEffect(() => {
        fetchCatalog();
        apiFetch<any[]>("/users").then((data) => setUsers(Array.isArray(data) ? data : [])).catch(() => setUsers([]));
        apiFetch<any[]>("/opportunity-types").then((data) => setOpportunityTypes(Array.isArray(data) ? data : [])).catch(() => setOpportunityTypes([]));
        apiFetch<any[]>("/activity-types").then((data) => setActivityTypes(Array.isArray(data) ? data : [])).catch(() => setActivityTypes([]));
        apiFetch<any[]>("/saved-views?module=ALL").then((data) => setSavedViews(Array.isArray(data) ? data : [])).catch(() => setSavedViews([]));
    }, []);

    useEffect(() => {
        const loadReport = (event: Event) => {
            const report = (event as CustomEvent<any>).detail;
            // The draft when there is one; otherwise what's published.
            const queryDefinition = (report?.draft?.config ?? report?.config)?.queryDefinition;
            if (!queryDefinition?.root || !Array.isArray(queryDefinition.fields)) return;
            const loaded = {
                root: queryDefinition.root as ReportRoot,
                savedViewId: queryDefinition.savedViewId || null,
                fields: queryDefinition.fields as ReportFieldSelection[],
                filters: (queryDefinition.filters ?? []) as ReportFilterSelection[],
                orderBy: queryDefinition.orderBy ?? { object: queryDefinition.root, field: queryDefinition.fields[0]?.field ?? "id", direction: "desc" as const },
                limit: queryDefinition.limit ?? 100,
            };
            setEditingReportId(report.id);
            recordRecentView("report", report.id, report.name ?? "Custom report");
            setName(report.name ?? "Custom report");
            setSharedWithEveryone(report.isPublic !== false);
            setRoot(loaded.root);
            setFields(loaded.fields);
            setFilters(loaded.filters);
            setOrderBy(loaded.orderBy);
            setSavedViewId(loaded.savedViewId || "__all__");
            setLimit(loaded.limit);
            setSavedDraftKey(JSON.stringify({ definition: normalizeReportDefinition(loaded), name: (report.name ?? "Custom report").trim(), shared: report.isPublic !== false }));
            setReportState({ version: Number(report.currentVersion ?? 0), hasDraft: !!report.draft, published: report.config?.queryDefinition ?? null });
            setPreview(null);
            document.getElementById("custom-report-builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
        };
        const report = selectedReport ?? routeReport;
        if (report) loadReport(new CustomEvent("custom-report-edit", { detail: report }));
        // After Discard or Restore as draft, the builder reloads the report.
        window.addEventListener("custom-report-reload", loadReport);
        return () => window.removeEventListener("custom-report-reload", loadReport);
    }, [selectedReport, routeReport]);

    // Deep-link support (/reports/custom/<id>, or ?reportId= from the global search
    // "Recent"/"Favorites" sections). Since the Reports split (decision 30) nothing listened for
    // the old "custom-report-edit" window event any more, so a saved report's own page opened an
    // empty new-report builder; the report found here now loads straight into the builder.
    useEffect(() => {
        const reportId = routeReportId ?? new URLSearchParams(window.location.search).get("reportId");
        if (!reportId) return;
        let active = true;
        apiFetch<any[]>("/reports/custom")
            .then((data) => {
                if (!active) return;
                const report = Array.isArray(data) ? data.find((item) => item.id === reportId) : null;
                if (!report) {
                    setRouteLoad(routeReportId ? "missing" : "done");
                } else if (!(report.draft?.config ?? report.config)?.queryDefinition?.root || !Array.isArray((report.draft?.config ?? report.config)?.queryDefinition?.fields)) {
                    setRouteLoad(routeReportId ? "unsupported" : "done");
                } else {
                    setRouteReport(report);
                    setRouteLoad("done");
                }
            })
            .catch(() => {
                if (active) setRouteLoad(routeReportId ? "failed" : "done");
            });
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [routeRetryKey]);

    const availableObjects = useMemo(() => OBJECTS_BY_ROOT[root].filter((object) => catalog[object]?.length), [catalog, root]);
    const getFieldsForObject = (object: string) => {
        const fields = (catalog[object] ?? []).filter((field) => field !== "id" && !field.endsWith("Id"));
        return fields.length ? fields : (catalog[object] ?? []).filter((field) => field !== "id");
    };
    const defaultFieldForObject = (object: string) => {
        const fields = getFieldsForObject(object);
        return fields.includes("name")
            ? "name"
            : fields.includes("title")
                ? "title"
                : fields.includes("createdAt")
                    ? "createdAt"
                    : fields[0] ?? "createdAt";
    };
    const reportFieldOptions = (object: string) => getFieldsForObject(object);
    const stageOptions = useMemo(() => {
        return opportunityTypes.flatMap((type) => (type.stages ?? []).map((stage: any) => ({
            label: `${type.name}: ${stage.name}`,
            value: stage.id,
        })));
    }, [opportunityTypes]);
    const valueOptionsForFilter = (filter: ReportFilterSelection) => {
        const userOptions = users.map((user) => ({ label: user.name || user.email || "User", value: user.id }));
        if (["ownerId", "createdBy"].includes(filter.field) || filter.object.toLowerCase().includes("owner") || filter.object === "assignedTo") return userOptions;
        if (filter.field === "stageId" || filter.object === "stage") return stageOptions;
        if (filter.field === "typeId" || filter.object === "activityType") return activityTypes.map((type) => ({ label: type.name, value: type.id }));
        if (filter.field === "source") return COMMON_LEAD_SOURCES.map((source) => ({ label: source, value: source }));
        if (filter.field === "status") return STATUS_VALUES.map((status) => ({ label: status.replace(/_/g, " "), value: status }));
        if (filter.field === "priority") return PRIORITY_VALUES.map((priority) => ({ label: priority, value: priority }));
        if (filter.field === "slaStatus") return SLA_VALUES.map((sla) => ({ label: sla, value: sla }));
        return [];
    };
    const definition = normalizeReportDefinition({
        root,
        savedViewId: savedViewId === "__all__" ? null : savedViewId,
        fields,
        filters,
        orderBy,
        limit,
    });

    const changeRoot = (nextRoot: ReportRoot) => {
        setRoot(nextRoot);
        const firstField = defaultFieldForObject(nextRoot);
        setFields([{ object: nextRoot, field: firstField, label: `${OBJECT_LABELS[nextRoot]} ${formatFieldLabel(firstField)}` }]);
        setFilters([]);
        setSavedViewId("__all__");
        setOrderBy({ object: nextRoot, field: reportFieldOptions(nextRoot).includes("createdAt") ? "createdAt" : firstField, direction: "desc" });
    };

    const updateField = (index: number, patch: Partial<ReportFieldSelection>) => {
        setFields((current) => current.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field));
    };

    const updateFilter = (index: number, patch: Partial<ReportFilterSelection>) => {
        setFilters((current) => current.map((filter, filterIndex) => filterIndex === index ? { ...filter, ...patch } : filter));
    };

    const addField = () => {
        const object = availableObjects[0] ?? root;
        const field = defaultFieldForObject(object);
        setFields((current) => [...current, { object, field, label: `${OBJECT_LABELS[object] ?? object} ${formatFieldLabel(field)}` }]);
    };

    const addFilter = () => {
        const object = availableObjects[0] ?? root;
        const field = defaultFieldForObject(object);
        setFilters((current) => [...current, { object, field, operator: "equals", value: "" }]);
    };

    const runPreview = async () => {
        setRunning(true);
        try {
            const result = await apiFetch("/reports/query", { method: "POST", body: JSON.stringify(definition) });
            setPreview(result);
            toast.success("Report preview refreshed");
        } catch (error: any) {
            toast.error(error.message || "Failed to run report preview");
        } finally {
            setRunning(false);
        }
    };

    const draftKey = JSON.stringify({ definition, name: name.trim(), shared: sharedWithEveryone });
    const hasUnsavedDraft = savedDraftKey !== null && savedDraftKey !== draftKey;

    // Saves the draft (creating the report on its first save); `quiet` for autosave.
    const saveDraft = async (quiet = false) => {
        if (saving || !name.trim() || fields.length === 0) return false;
        setSaving(true);
        const savingKey = draftKey;
        try {
            const saved = await apiFetch<any>(editingReportId ? `/reports/custom/${editingReportId}` : "/reports/custom", {
                method: editingReportId ? "PATCH" : "POST",
                body: JSON.stringify({
                    name,
                    module: root.toUpperCase(),
                    chartType: "TABLE",
                    isPublic: sharedWithEveryone,
                    config: { queryDefinition: definition },
                    draft: true,
                }),
            });
            window.dispatchEvent(new Event("custom-report-saved"));
            setSavedDraftKey(savingKey);
            setSaveError(false);
            if (saved) setReportState((current) => ({ version: Number(saved.currentVersion ?? current.version), hasDraft: !!saved.draft, published: saved.config?.queryDefinition ?? current.published }));
            if (!quiet) toast.success(editingReportId ? "Draft saved" : `“${name}” saved as a draft`);
            if (!editingReportId && saved?.id) {
                setEditingReportId(saved.id);
                router.replace(`/dashboard/reports/custom/${saved.id}`);
            }
            return true;
        } catch (error: any) {
            setSaveError(true);
            if (!quiet) toast.error(error.message || "Failed to save the draft");
            return false;
        } finally {
            setSaving(false);
        }
    };
    const saveReport = () => saveDraft(false);

    // Autosave: a moment after the last change to a saved report.
    useEffect(() => {
        if (!editingReportId || !hasUnsavedDraft || saving) return;
        const timer = window.setTimeout(() => { saveDraft(true); }, 1500);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draftKey, editingReportId, hasUnsavedDraft, saving]);

    // ⌘S / Ctrl+S saves the draft now.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                saveDraft(false);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    const publishChanges = summarizeReportChanges(reportState.published, definition);
    const canPublish = !!editingReportId && fields.length > 0 && (reportState.version === 0 || reportState.hasDraft || hasUnsavedDraft);
    const openPublish = async () => {
        if (hasUnsavedDraft && !(await saveDraft(true))) return;
        setPublishNotes("");
        setPublishOpen(true);
    };
    const publish = async () => {
        if (!editingReportId) return;
        setPublishing(true);
        try {
            const result = await apiFetch<any>(`/reports/custom/${editingReportId}/versions`, { method: "POST", body: JSON.stringify({ publishNotes: publishNotes || null }) });
            setReportState({ version: Number(result.currentVersion ?? 0), hasDraft: false, published: result.config?.queryDefinition ?? null });
            setPublishOpen(false);
            window.dispatchEvent(new Event("custom-report-saved"));
            toast.success(`Published version ${result.currentVersion}`, { description: "The report page, exports, schedules and dashboards use it now." });
        } catch (error: any) {
            toast.error(error?.message || "The report couldn't be published");
        } finally {
            setPublishing(false);
        }
    };
    const loadIntoBuilder = (report: any) => {
        if (report) window.dispatchEvent(new CustomEvent("custom-report-reload", { detail: report }));
    };
    const discardDraft = async () => {
        if (!editingReportId) return;
        const ok = await confirm({ title: "Discard unpublished changes?", description: `The builder goes back to version ${reportState.version}, which is what runs now.`, confirmLabel: "Discard changes", destructive: true });
        if (!ok) return;
        try {
            loadIntoBuilder(await apiFetch<any>(`/reports/custom/${editingReportId}/draft`, { method: "DELETE" }));
            toast.success("Changes discarded");
        } catch (error: any) {
            toast.error(error?.message || "The changes couldn't be discarded");
        }
    };
    const reloadAfterRestore = async () => {
        const data = await apiFetch<any[]>("/reports/custom").catch(() => []);
        loadIntoBuilder(Array.isArray(data) ? data.find((item) => item.id === editingReportId) : null);
    };
    const saveStatus = saving ? "Saving…"
        : hasUnsavedDraft ? (editingReportId ? "Unsaved changes" : "Not saved yet")
        : saveError ? "Couldn't save · ⌘S to retry"
        : !editingReportId ? "New report"
        : reportState.version === 0 ? "Draft · not published yet"
        : reportState.hasDraft ? `Draft saved · version ${reportState.version} is live`
        : `Version ${reportState.version} is live`;

    if (catalogError) return <ErrorState description="Report fields could not be loaded." onRetry={fetchCatalog} />;
    if (routeLoad === "failed") return <ErrorState description="This report couldn't be loaded." onRetry={() => { setRouteLoad("loading"); setRouteRetryKey((key) => key + 1); }} />;
    if (routeLoad === "missing") return <ErrorState title="Report not found" description="It may have been deleted." />;
    if (routeLoad === "unsupported") return <ErrorState title="This report can't be opened here" description="It was made before the report builder, so it can't be edited in it. Export it from Saved reports." />;
    if (loadingCatalog || routeLoad === "loading") return <Skeleton className="mb-4 h-[360px] rounded-2xl" />;

    return (
        <Card id="custom-report-builder" className="mb-4 rounded-2xl">
            <CardContent className="min-w-0 space-y-5 p-4 sm:p-6">
                <StandardDialog
                    open={publishOpen}
                    onClose={() => setPublishOpen(false)}
                    title={reportState.version === 0 ? `Publish ${name}?` : `Publish version ${reportState.version + 1}?`}
                    subtitle="The report page, exports, schedules and dashboards use the published version."
                    maxWidth="sm"
                    actions={<>
                        <Button variant="ghost" onClick={() => setPublishOpen(false)}>Cancel</Button>
                        <Button onClick={publish} isLoading={publishing} disabled={publishing}>Publish</Button>
                    </>}
                >
                    <div className="space-y-3">
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                            {publishChanges.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                        <div className="space-y-1.5">
                            <Label htmlFor="report-publish-notes">Notes (optional)</Label>
                            <Input id="report-publish-notes" value={publishNotes} onChange={(event) => setPublishNotes(event.target.value)} placeholder="What changed and why" />
                        </div>
                    </div>
                </StandardDialog>
                <ReportVersionHistoryDialog reportId={historyOpen ? editingReportId : null} onClose={() => setHistoryOpen(false)} onRestored={reloadAfterRestore} />
                <div className="flex min-w-0 flex-wrap justify-between gap-3">
                    <div>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <h2 className="text-lg font-bold">Custom Report Builder</h2>
                            <Badge variant="outline" className="rounded-md">Cross-object</Badge>
                            {editingReportId ? <Badge variant="secondary" className="rounded-md">Editing</Badge> : null}
                        </div>
                        <p role="status" aria-live="polite" className="mt-1 text-xs text-muted-foreground">{saveStatus}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Build joined reports from CRM objects with validated fields, filters, sorting, and preview rows.
                        </p>
                    </div>
                    <div className="flex max-w-full flex-wrap gap-2">
                        <Button variant="outline" onClick={runPreview} disabled={running || fields.length === 0}>
                            <Play className="size-4" />
                            {running ? "Running..." : "Run Preview"}
                        </Button>
                        {!editingReportId || hasUnsavedDraft || saveError ? (
                            <Button variant="outline" onClick={saveReport} disabled={saving || !name.trim() || fields.length === 0}>
                                <Save className="size-4" />
                                {saving ? "Saving..." : "Save draft"}
                            </Button>
                        ) : null}
                        {editingReportId ? (
                            <Button onClick={openPublish} disabled={!canPublish || publishing}>
                                Publish
                            </Button>
                        ) : null}
                        {editingReportId && reportState.version > 0 && reportState.hasDraft ? (
                            <Button variant="ghost" onClick={discardDraft}>Discard changes</Button>
                        ) : null}
                        {editingReportId && reportState.version > 0 ? (
                            <Button variant="ghost" onClick={() => setHistoryOpen(true)}><History className="size-4" />Versions</Button>
                        ) : null}
                        {/* The same governed export as the Saved reports list (export rules, approval,
                            audit, rate limit), not the direct CSV route. It exports the published version. */}
                        {editingReportId && reportState.version > 0 ? (
                            <QueueExportButton
                                moduleName="REPORTS"
                                filters={{ reportKind: "CUSTOM", customReportId: editingReportId }}
                                label={reportState.hasDraft || hasUnsavedDraft ? "Export published version" : "Export CSV"}
                            />
                        ) : null}
                        {editingReportId ? (
                            <Button variant="ghost" onClick={() => { setEditingReportId(null); setSavedDraftKey(null); setSharedWithEveryone(true); setReportState({ version: 0, hasDraft: false, published: null }); }}>
                                New Report
                            </Button>
                        ) : null}
                    </div>
                </div>

                <details className="rounded-lg border p-3">
                    <summary className="cursor-pointer text-sm font-medium">Build with AI</summary>
                    <p className="my-2 text-sm text-muted-foreground">Describe a record list with filters and one sort field. For grouped counts or totals, use Metrics. Requires AI Assistant in Settings; review before saving.</p>
                <div className="flex flex-col gap-2 rounded-xl border border-dashed p-3 md:flex-row md:items-center">
                    <Sparkles className="hidden size-4 shrink-0 text-muted-foreground md:block" />
                    <Input
                        aria-label="Describe your report for AI"
                        placeholder="e.g. Website leads from the last 30 days"
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") runAiReportPrompt(); }}
                    />
                    <Button variant="outline" size="sm" disabled={aiGenerating || !aiPrompt.trim()} onClick={runAiReportPrompt}>
                        <Sparkles className="size-4" />
                        {aiGenerating ? "Generating..." : "Ask AI"}
                    </Button>
                </div>
                </details>

                <Tabs defaultValue="setup" className="space-y-4">
                    <div className="overflow-x-auto pb-1">
                        <TabsList className="h-10 min-w-max">
                            <TabsTrigger value="setup">Setup</TabsTrigger>
                            <TabsTrigger value="columns">Columns</TabsTrigger>
                            <TabsTrigger value="filters">Filters & Sort</TabsTrigger>
                            <TabsTrigger value="preview">Preview</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="setup">
                <div className="grid gap-4 @min-[600px]/reports:grid-cols-2 @min-[1100px]/reports:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,0.8fr))]">
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="report-report-name-1">Report Name</Label>
                        <Input id="report-report-name-1" value={name} onChange={(event) => setName(event.target.value)} />
                    </div>
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="report-root-object-2">Root Object</Label>
                        <Select value={root} onValueChange={(value) => changeRoot(value as ReportRoot)}>
                            <SelectTrigger id="report-root-object-2" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {ROOT_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="report-record-source-3">Record Source</Label>
                        <Select value={savedViewId} onValueChange={setSavedViewId}>
                            <SelectTrigger id="report-record-source-3" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">All permitted records</SelectItem>
                                {savedViews
                                    .filter((view) => view.tabs?.some((tab: any) => smartViewModuleForReportRoot(root) === tab.module))
                                    .map((view) => (
                                        <SelectItem key={view.id} value={view.id}>{view.name}</SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="report-row-limit-4">Row Limit</Label>
                        <Input id="report-row-limit-4" type="number" min={1} max={1000} value={limit} onChange={(event) => setLimit(Number(event.target.value))} />
                    </div>
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="report-shared-with-5">Who can see it</Label>
                        <Select value={sharedWithEveryone ? "everyone" : "owner"} onValueChange={(value) => setSharedWithEveryone(value === "everyone")}>
                            <SelectTrigger id="report-shared-with-5" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="everyone">Everyone in this workspace</SelectItem>
                                <SelectItem value="owner">Only me and admins</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                    </TabsContent>

                    <TabsContent value="columns">
                <div className="space-y-3">
                    <div className="flex min-w-0 flex-wrap items-center justify-between">
                        <Label className="text-xs font-bold uppercase text-muted-foreground">Columns</Label>
                        <Button type="button" variant="outline" size="sm" onClick={addField}>
                            <Plus className="size-4" />
                            Add Column
                        </Button>
                    </div>
                    <div className="min-w-0 space-y-2">
                        {fields.map((field, index) => (
                            <div key={index} className="grid gap-2 rounded-lg border bg-surface-container-low p-2 @min-[900px]/reports:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
                                <Select
                                    value={field.object}
                                    onValueChange={(object) => {
                                        const nextField = defaultFieldForObject(object);
                                        updateField(index, { object, field: nextField, label: `${OBJECT_LABELS[object] ?? object} ${formatFieldLabel(nextField)}` });
                                    }}
                                >
                                    <SelectTrigger aria-label={`Column ${index + 1} object`} className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {availableObjects.map((object) => (
                                            <SelectItem key={object} value={object}>{OBJECT_LABELS[object] ?? object}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select value={field.field} onValueChange={(value) => updateField(index, { field: value })}>
                                    <SelectTrigger aria-label={`Column ${index + 1} field`} className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {reportFieldOptions(field.object).map((item) => (
                                            <SelectItem key={item} value={item}>{formatFieldLabel(item)}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Input
                                    value={field.label ?? ""}
                                    aria-label={`Column ${index + 1} display label`}
                                    placeholder="Display label"
                                    onChange={(event) => updateField(index, { label: event.target.value })}
                                />
                                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index))} aria-label="Remove column">
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
                    </TabsContent>

                    <TabsContent value="filters">
                <div className="space-y-3">
                    <div className="flex min-w-0 flex-wrap items-center justify-between">
                        <Label className="text-xs font-bold uppercase text-muted-foreground">Filters</Label>
                        <Button type="button" variant="outline" size="sm" onClick={addFilter}>
                            <Plus className="size-4" />
                            Add Filter
                        </Button>
                    </div>
                    {filters.length === 0 ? (
                        <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                            No filters. Preview will use the full permission-scoped dataset.
                        </div>
                    ) : (
                        <div className="min-w-0 space-y-2">
                            {filters.map((filter, index) => {
                                const valueDisabled = filter.operator === "is_empty" || filter.operator === "is_not_empty";
                                return (
                                    <div key={index} className="grid gap-2 rounded-lg border bg-surface-container-low p-2 @min-[1100px]/reports:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
                                        <Select
                                            value={filter.object}
                                            onValueChange={(object) => updateFilter(index, { object, field: defaultFieldForObject(object), value: "" })}
                                        >
                                            <SelectTrigger aria-label={`Filter ${index + 1} object`} className="w-full"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {availableObjects.map((object) => (
                                                    <SelectItem key={object} value={object}>{OBJECT_LABELS[object] ?? object}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Select value={filter.field} onValueChange={(value) => updateFilter(index, { field: value })}>
                                            <SelectTrigger aria-label={`Filter ${index + 1} field`} className="w-full"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {reportFieldOptions(filter.object).map((item) => (
                                                    <SelectItem key={item} value={item}>{formatFieldLabel(item)}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Select value={filter.operator} onValueChange={(operator) => updateFilter(index, { operator })}>
                                            <SelectTrigger aria-label={`Filter ${index + 1} operator`} className="w-full"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {REPORT_OPERATORS.map((operator) => (
                                                    <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {valueOptionsForFilter(filter).length > 0 && !valueDisabled ? (
                                            <Select value={String(filter.value ?? "__none__")} onValueChange={(value) => updateFilter(index, { value: value === "__none__" ? "" : value })}>
                                                <SelectTrigger aria-label={`Filter ${index + 1} value`} className="w-full"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__none__">Select value</SelectItem>
                                                    {valueOptionsForFilter(filter).map((option) => (
                                                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <Input
                                                aria-label={`Filter ${index + 1} value`}
                                                value={valueDisabled ? "" : String(filter.value ?? "")}
                                                disabled={valueDisabled}
                                                placeholder={valueDisabled ? "Not required" : "Value"}
                                                onChange={(event) => updateFilter(index, { value: event.target.value })}
                                            />
                                        )}
                                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => setFilters((current) => current.filter((_, filterIndex) => filterIndex !== index))} aria-label="Remove filter">
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="grid gap-4 @min-[800px]/reports:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.7fr)]">
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="report-sort-object-5">Sort Object</Label>
                        <Select value={orderBy.object} onValueChange={(object) => setOrderBy({ object, field: defaultFieldForObject(object), direction: orderBy.direction })}>
                            <SelectTrigger id="report-sort-object-5" className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {availableObjects.map((object) => (
                                    <SelectItem key={object} value={object}>{OBJECT_LABELS[object] ?? object}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="report-sort-field-6">Sort Field</Label>
                        <Select value={orderBy.field} onValueChange={(field) => setOrderBy({ ...orderBy, field })}>
                            <SelectTrigger id="report-sort-field-6" className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {reportFieldOptions(orderBy.object).map((field) => (
                                    <SelectItem key={field} value={field}>{formatFieldLabel(field)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="report-direction-7">Direction</Label>
                        <Select value={orderBy.direction} onValueChange={(direction) => setOrderBy({ ...orderBy, direction: direction as "asc" | "desc" })}>
                            <SelectTrigger id="report-direction-7" className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="desc">Descending</SelectItem>
                                <SelectItem value="asc">Ascending</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                    </TabsContent>

                    <TabsContent value="preview">
                {preview ? (
                    <div className="rounded-xl border">
                        <div className="flex min-w-0 flex-wrap items-center justify-between border-b px-4 py-3">
                            <div className="text-sm font-bold">Preview</div>
                            <div className="text-xs text-muted-foreground">
                                {preview.meta?.returnedRows ?? 0} of {preview.meta?.totalRows ?? 0} rows
                            </div>
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {preview.columns?.map((column: any) => (
                                        <TableHead key={column.key}>{column.label}</TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {preview.rows?.slice(0, 10).map((row: any, rowIndex: number) => (
                                    <TableRow key={rowIndex}>
                                        {preview.columns?.map((column: any) => (
                                            <TableCell key={column.key}>{formatReportCell(row[column.key])}</TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                        Run the report preview to inspect returned columns and rows.
                    </div>
                )}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}


function smartViewModuleForReportRoot(root: ReportRoot) {
    if (root === "lead") return "LEADS";
    if (root === "opportunity") return "OPPORTUNITIES";
    return "ACTIVITIES";
}
