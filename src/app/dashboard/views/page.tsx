"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/common/empty-state";
import { QueueExportButton } from "@/components/exports/queue-export-button";
import { useFeature } from "@/components/auth/feature-gate";
import { SaveViewDialog } from "@/components/views/save-view-dialog";
import { fieldLabel, getSmartViewFields, isSmartViewModuleEnabled, smartViewModuleDisabledReason, SMART_VIEW_MODULE_OPTIONS } from "@/components/views/smart-view-fields";
import { applySmartViewFilters } from "@/components/views/smart-view-filtering";
import { ViewRowActionsMenu } from "@/components/views/view-row-actions";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { fetchCached } from "@/lib/views-metadata-cache";
import { cn } from "@/lib/utils";
import { FilterConfig } from "@/types/filters";
import { SmartViewModule, SmartViewTab } from "@/types/smart-views";
import { Archive, ChevronLeft, ChevronRight, Copy, LayoutList, MessageSquare, MoreHorizontal, Pencil, Plus, RefreshCw, Search, SlidersHorizontal, Star, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { getFavoriteRecords, isFavoriteRecord, recordRecentView, toggleFavoriteRecord } from "@/lib/recent-records";

type ViewRecord = {
    id: string;
    name: string;
    module?: string;
    ownerId?: string;
    isDefault: boolean;
    isPinned?: boolean;
    isShared: boolean;
    scope?: "PRIVATE" | "SHARED" | "ROLE" | "TENANT_DEFAULT";
    tabs?: SmartViewTab[];
    sharedUserIds?: string[];
    sharedTeamIds?: string[];
    sharedSalesGroupIds?: string[];
    sharedRoleIds?: string[];
    displayOrder?: number;
    defaultModule?: string | null;
    defaultPersona?: "ADMIN" | "MANAGER" | "REP" | "PARTNER" | null;
    viewCount?: number;
    lastOpenedAt?: string | null;
    isArchived?: boolean;
    isStale?: boolean;
    possibleDuplicateOfId?: string | null;
    comments?: Array<{ id: string; body: string; createdBy: string; createdAt: string }>;
};

type CurrentUser = {
    id?: string;
    teamId?: string | null;
    isTenantAdmin?: boolean;
    isPlatformAdmin?: boolean;
    role?: string | { name: string; permissions?: any } | null;
};

// Quick actions mutate Lead/Opportunity/Activity/Task records -- gate them by the same
// module write-permission levels the Role admin UI already exposes (leads/opportunities/
// activities). Tasks has no such module axis (confirmed elsewhere: task access is governed
// by recordAccess, not a permission module), so task quick actions are left ungated here and
// rely on the server-side checks each task route already performs.
function hasModuleWriteAccess(user: CurrentUser | null, module: SmartViewModule) {
    if (!user) return false;
    if (user.isTenantAdmin || user.isPlatformAdmin) return true;
    const permissions = user.role && typeof user.role === "object" ? (user.role as any).permissions : null;
    const key = module === "LEADS" ? "leads" : module === "OPPORTUNITIES" ? "opportunities" : module === "ACTIVITIES" ? "activities" : null;
    if (!key) return true;
    const level = permissions?.modules?.[key];
    return level === "write" || level === "full";
}

const EMPTY_FILTERS: FilterConfig = { conditions: [], logic: "AND" };
// Matches the per-module fetch cap in fetchModuleData below -- used only to detect (not
// enforce) truncation, so the UI can say so explicitly rather than silently showing a
// partial result set as if it were complete.
const ROW_LIMIT = 500;

const DEFAULT_COLUMNS: Record<SmartViewModule, string[]> = {
    LEADS: ["name", "email", "status", "source", "score", "createdAt"],
    OPPORTUNITIES: ["title", "amount", "stageId", "priority", "expectedCloseDate"],
    ACTIVITIES: ["typeId", "outcome", "notes", "dueAt", "slaStatus"],
    TASKS: ["title", "status", "priority", "ownerId", "dueAt"],
    PARTNERS: ["legalBusinessName", "status", "partnerLoginRole", "canAccessPayouts"],
    PAYOUTS: ["partnerId", "status", "amount", "isHeld", "createdAt"],
    REPORTS: ["name", "module", "createdBy", "createdAt"],
};

export default function ViewsPage() {
    const opportunityEnabled = useFeature("opportunityEnabled");
    const advancedReporting = useFeature("advancedReporting");
    const payoutsEnabled = useFeature("payoutsEnabled");
    const [views, setViews] = useState<ViewRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [builderOpen, setBuilderOpen] = useState(false);
    const [editingView, setEditingView] = useState<ViewRecord | null>(null);
    const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
    // "Pin/favorite support" (gap checklist's "recent/favorite records" item) -- a personal,
    // per-browser favorite list, distinct from a SavedView's own `isPinned` field (that one is
    // the view's own creator-set property, shown to everyone it's shared with; this is this
    // viewer's own quick-access list, same as the star toggle Leads/Opportunities detail pages
    // now have).
    const [favoriteViewIds, setFavoriteViewIds] = useState<string[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const [recordsByTab, setRecordsByTab] = useState<Record<string, any[]>>({});
    const [tabErrors, setTabErrors] = useState<Record<string, string>>({});
    const [truncatedTabs, setTruncatedTabs] = useState<Record<string, boolean>>({});
    const [loadingRecords, setLoadingRecords] = useState(false);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
    const [users, setUsers] = useState<Array<{ id: string; name?: string | null; email?: string | null }>>([]);
    const [leadLists, setLeadLists] = useState<Array<{ id: string; name: string }>>([]);
    const [activityTypes, setActivityTypes] = useState<Array<{ id: string; name: string }>>([]);
    const [opportunityTypes, setOpportunityTypes] = useState<any[]>([]);
    const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
    const [showArchived, setShowArchived] = useState(false);
    const [transferDialogOpen, setTransferDialogOpen] = useState(false);
    const [transferTargetUserId, setTransferTargetUserId] = useState("");
    const [commentsDialogOpen, setCommentsDialogOpen] = useState(false);
    const [commentDraft, setCommentDraft] = useState("");
    const [postingComment, setPostingComment] = useState(false);
    const [deepLinkViewId, setDeepLinkViewId] = useState<string | null>(null);
    const [deepLinkSummary, setDeepLinkSummary] = useState<{ id: string; name: string; ownerId: string; ownerName: string } | null>(null);
    const [requestingAccess, setRequestingAccess] = useState(false);

    const canShareViews = !!(currentUser?.isTenantAdmin || currentUser?.isPlatformAdmin);
    const stagesByOpportunityTypeId = useMemo(
        () => new Map(opportunityTypes.map((type: any) => [type.id, type.stages ?? []])),
        [opportunityTypes]
    );

    const fetchViews = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch<ViewRecord[]>("/saved-views?module=ALL");
            const records = Array.isArray(data) ? data : [];
            setViews(records);
            setSelectedViewId((current) => current && records.some((view) => view.id === current) ? current : records[0]?.id ?? null);
        } catch {
            toast.error("Failed to load Smart Views");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setFavoriteViewIds(getFavoriteRecords().filter((r) => r.type === "view").map((r) => r.id));
    }, []);

    const toggleFavoriteView = () => {
        if (!selectedView) return;
        const next = toggleFavoriteRecord("view", selectedView.id, selectedView.name);
        setFavoriteViewIds(next.filter((r) => r.type === "view").map((r) => r.id));
    };

    useEffect(() => {
        fetchViews();
        apiFetch<CurrentUser>("/auth/me").then(setCurrentUser).catch(() => setCurrentUser(null));
        fetchCached("users", () => apiFetch<any[]>("/users")).then((data) => setUsers(Array.isArray(data) ? data : [])).catch(() => setUsers([]));
        apiFetch<any[]>("/lead-lists").then((data) => setLeadLists(Array.isArray(data) ? data : [])).catch(() => setLeadLists([]));
        fetchCached("activity-types", () => apiFetch<any[]>("/activity-types")).then((data) => setActivityTypes(Array.isArray(data) ? data : [])).catch(() => setActivityTypes([]));
        fetchCached("opportunity-types", () => apiFetch<any[]>("/opportunity-types")).then((data) => setOpportunityTypes(Array.isArray(data) ? data : [])).catch(() => setOpportunityTypes([]));
        // Read via window.location rather than next/navigation's useSearchParams -- this page
        // isn't wrapped in a Suspense boundary and nothing else in the app uses that hook yet.
        const viewId = new URLSearchParams(window.location.search).get("viewId");
        if (viewId) setDeepLinkViewId(viewId);
    }, [fetchViews]);

    // A deep-linked View that isn't in this user's normal (access-filtered) list means they
    // don't have access to it -- look up just enough to offer "Request access" without
    // exposing its actual data.
    useEffect(() => {
        if (!deepLinkViewId || loading) return;
        if (views.some((view) => view.id === deepLinkViewId)) {
            setSelectedViewId(deepLinkViewId);
            setDeepLinkSummary(null);
            return;
        }
        apiFetch<any>(`/saved-views/${deepLinkViewId}/summary`).then(setDeepLinkSummary).catch(() => setDeepLinkSummary(null));
    }, [deepLinkViewId, views, loading]);

    const selectedView = useMemo(
        () => views.find((view) => view.id === selectedViewId) ?? views[0] ?? null,
        [selectedViewId, views]
    );

    const tabs = useMemo(() => normalizeTabs(selectedView), [selectedView]);
    const activeTab = useMemo(
        () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null,
        [activeTabId, tabs]
    );

    useEffect(() => {
        setActiveTabId(tabs[0]?.id ?? null);
        setSearch("");
    }, [selectedViewId]);

    useEffect(() => {
        setSelectedRecordIds([]);
    }, [activeTabId]);

    const loadRecords = useCallback(async (view: ViewRecord | null, nextTabs: SmartViewTab[]) => {
        if (!view || nextTabs.length === 0) return;
        setLoadingRecords(true);
        const nextRecords: Record<string, any[]> = {};
        const nextErrors: Record<string, string> = {};
        const nextTruncated: Record<string, boolean> = {};

        await Promise.all(nextTabs.map(async (tab) => {
            if (!isSmartViewModuleEnabled(tab.module, { opportunityEnabled, advancedReporting, payoutsEnabled })) {
                nextRecords[tab.id] = [];
                nextErrors[tab.id] = smartViewModuleDisabledReason(tab.module) ?? `The ${moduleLabel(tab.module)} module is disabled for this tenant.`;
                return;
            }
            try {
                const records = await fetchRecordsForTab(tab, currentUser);
                nextTruncated[tab.id] = records.length >= ROW_LIMIT;
                nextRecords[tab.id] = applySmartViewFilters(records, tab.filters ?? EMPTY_FILTERS);
            } catch (error: any) {
                nextRecords[tab.id] = [];
                nextErrors[tab.id] = error?.status === 408
                    ? `This tab took too long to load. Try narrowing its filters or splitting it into a separate View.`
                    : error?.message || `Failed to load ${moduleLabel(tab.module)}`;
            }
        }));

        setRecordsByTab(nextRecords);
        setTabErrors(nextErrors);
        setTruncatedTabs(nextTruncated);
        setLastUpdatedAt(new Date().toISOString());
        setLoadingRecords(false);
    }, [currentUser, opportunityEnabled, advancedReporting, payoutsEnabled]);

    useEffect(() => {
        loadRecords(selectedView, tabs);
    }, [loadRecords, selectedView, tabs]);

    const cloneView = async (view: ViewRecord) => {
        try {
            await apiFetch(`/saved-views/${view.id}?action=clone`, { method: "POST" });
            toast.success("Smart View cloned");
            fetchViews();
        } catch {
            toast.error("Failed to clone Smart View");
        }
    };

    const deleteView = async (view: ViewRecord) => {
        if (!confirm(`Delete Smart View "${view.name}"?`)) return;
        try {
            await apiFetch(`/saved-views/${view.id}`, { method: "DELETE" });
            toast.success("Smart View deleted");
            fetchViews();
        } catch {
            toast.error("Failed to delete Smart View");
        }
    };

    const updateView = async (view: ViewRecord, patch: Partial<ViewRecord>) => {
        try {
            const updated = await apiFetch<ViewRecord>(`/saved-views/${view.id}`, {
                method: "PATCH",
                body: JSON.stringify(patch),
            });
            setViews((current) => current.map((item) => item.id === view.id ? updated : item));
            setSelectedViewId(updated.id);
            toast.success("Smart View updated");
            fetchViews();
        } catch (error: any) {
            toast.error(error?.message || "Failed to update Smart View");
        }
    };

    const toggleArchiveView = async (view: ViewRecord) => {
        await updateView(view, { isArchived: !view.isArchived });
    };

    const transferOwnership = async () => {
        if (!selectedView || !transferTargetUserId) return;
        await updateView(selectedView, { ownerId: transferTargetUserId });
        setTransferDialogOpen(false);
        setTransferTargetUserId("");
    };

    const openView = (id: string) => {
        setSelectedViewId(id);
        apiFetch(`/saved-views/${id}/open`, { method: "POST" }).catch(() => undefined);
        const view = views.find((v) => v.id === id);
        if (view) recordRecentView("view", id, view.name);
    };

    const postComment = async () => {
        if (!selectedView || !commentDraft.trim()) return;
        setPostingComment(true);
        try {
            const updated = await apiFetch<ViewRecord>(`/saved-views/${selectedView.id}/comments`, {
                method: "POST",
                body: JSON.stringify({ body: commentDraft.trim() }),
            });
            setViews((current) => current.map((item) => item.id === updated.id ? updated : item));
            setCommentDraft("");
        } catch (error: any) {
            toast.error(error?.message || "Failed to add comment");
        } finally {
            setPostingComment(false);
        }
    };

    const requestAccess = async () => {
        if (!deepLinkViewId) return;
        setRequestingAccess(true);
        try {
            await apiFetch(`/saved-views/${deepLinkViewId}/request-access`, { method: "POST" });
            toast.success("Access requested");
        } catch (error: any) {
            toast.error(error?.message || "Failed to request access");
        } finally {
            setRequestingAccess(false);
        }
    };

    const renameView = async (view: ViewRecord) => {
        const name = window.prompt("Rename Smart View", view.name);
        if (!name?.trim() || name.trim() === view.name) return;
        await updateView(view, { name: name.trim() });
    };

    const moveView = async (view: ViewRecord, direction: -1 | 1) => {
        const ordered = [...views].sort((first, second) =>
            Number(first.displayOrder ?? 1000) - Number(second.displayOrder ?? 1000) || first.name.localeCompare(second.name),
        );
        const index = ordered.findIndex((item) => item.id === view.id);
        const swap = ordered[index + direction];
        if (!swap) return;
        await Promise.all([
            apiFetch(`/saved-views/${view.id}`, {
                method: "PATCH",
                body: JSON.stringify({ displayOrder: swap.displayOrder ?? (index + direction + 1) * 10 }),
            }),
            apiFetch(`/saved-views/${swap.id}`, {
                method: "PATCH",
                body: JSON.stringify({ displayOrder: view.displayOrder ?? (index + 1) * 10 }),
            }),
        ]);
        toast.success("Smart View order updated");
        fetchViews();
    };

    const setPersonaDefault = async (view: ViewRecord, persona: ViewRecord["defaultPersona"]) => {
        await updateView(view, {
            isDefault: true,
            defaultModule: activeTab?.module ?? view.module ?? "LEADS",
            defaultPersona: persona,
        });
    };

    const activeRecords = recordsByTab[activeTab?.id ?? ""] ?? [];
    const visibleRecords = useMemo(() => applySearchAndSort(activeRecords, activeTab, search), [activeRecords, activeTab, search]);
    const columns = useMemo(() => activeTab ? columnsForTab(activeTab) : [], [activeTab]);
    // Precomputed once per (records, chip config) change rather than recalculated on every
    // render (e.g. typing in search, toggling row selection) -- each chip re-scans up to 500
    // records through applySmartViewFilters, which isn't free to redo on unrelated re-renders.
    const chipCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const chip of activeTab?.countChips ?? []) counts.set(chip.id, countForChip(activeRecords, chip));
        return counts;
    }, [activeRecords, activeTab?.countChips]);
    const visibleViews = useMemo(() => views.filter((view) => showArchived || !view.isArchived), [views, showArchived]);
    const duplicateOfView = selectedView?.possibleDuplicateOfId ? views.find((view) => view.id === selectedView.possibleDuplicateOfId) : null;
    const sharedTargetCount = (selectedView?.sharedUserIds?.length ?? 0)
        + (selectedView?.sharedTeamIds?.length ?? 0)
        + (selectedView?.sharedSalesGroupIds?.length ?? 0)
        + (selectedView?.sharedRoleIds?.length ?? 0);

    return (
        <div className="flex h-full min-h-[calc(100vh-80px)] flex-col bg-background">
            {deepLinkSummary ? (
                <div className="flex flex-wrap items-center gap-2 border-b bg-amber-50 px-4 py-2.5 text-sm dark:bg-amber-950/30">
                    <span>
                        You don&apos;t have access to &quot;{deepLinkSummary.name}&quot; (owned by {deepLinkSummary.ownerName}).
                    </span>
                    <Button size="sm" disabled={requestingAccess} onClick={requestAccess}>
                        {requestingAccess ? "Requesting..." : "Request access"}
                    </Button>
                </div>
            ) : null}
            <div className="border-b bg-card px-4 py-3 md:px-5">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <LayoutList className="size-4" />
                            </div>
                            <h1 className="text-base font-extrabold tracking-tight">Smart Views</h1>
                        </div>
                        <Select value={selectedViewId ?? ""} onValueChange={openView} disabled={loading || visibleViews.length === 0}>
                            <SelectTrigger className="h-9 w-full min-w-[280px] max-w-[460px] rounded-md font-semibold">
                                <SelectValue placeholder="Select Smart View" />
                            </SelectTrigger>
                            <SelectContent>
                                {visibleViews.map((view) => (
                                    <SelectItem key={view.id} value={view.id}>
                                        {view.name}{view.isArchived ? " (Archived)" : ""}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <Checkbox checked={showArchived} onCheckedChange={(checked) => setShowArchived(!!checked)} />
                            Show archived
                        </label>
                        {selectedView?.isPinned ? <Star className="size-4 fill-amber-500 text-amber-500" /> : null}
                        {selectedView && (
                            <Button variant="ghost" size="icon-sm" onClick={toggleFavoriteView} aria-label={favoriteViewIds.includes(selectedView.id) ? "Remove from favorites" : "Add to favorites"}>
                                <Star className={cn("size-4", favoriteViewIds.includes(selectedView.id) ? "fill-amber-500 text-amber-500" : "text-muted-foreground")} />
                            </Button>
                        )}
                        {selectedView?.isShared ? <Badge variant="secondary" className="rounded-md">{selectedView.scope === "TENANT_DEFAULT" ? "Tenant" : "Assigned"}</Badge> : <Badge variant="outline" className="rounded-md">Private</Badge>}
                        {activeTab ? <Badge variant="outline" className="rounded-md">{moduleLabel(activeTab.module)}</Badge> : null}
                        {selectedView?.isArchived ? <Badge variant="secondary" className="rounded-md">Archived</Badge> : null}
                        {selectedView?.isStale ? <Badge variant="outline" className="rounded-md text-muted-foreground">Stale</Badge> : null}
                        {duplicateOfView ? (
                            <Badge variant="outline" className="rounded-md" title={`Same module and filters as "${duplicateOfView.name}"`}>
                                Possible duplicate of &quot;{duplicateOfView.name}&quot;
                            </Badge>
                        ) : null}
                        {sharedTargetCount > 0 ? (
                            <span className="text-xs text-muted-foreground">
                                Shared with {selectedView?.sharedUserIds?.length ? `${selectedView.sharedUserIds.length} user${selectedView.sharedUserIds.length === 1 ? "" : "s"}` : null}
                                {selectedView?.sharedTeamIds?.length ? `, ${selectedView.sharedTeamIds.length} team${selectedView.sharedTeamIds.length === 1 ? "" : "s"}` : ""}
                                {selectedView?.sharedSalesGroupIds?.length ? `, ${selectedView.sharedSalesGroupIds.length} sales group${selectedView.sharedSalesGroupIds.length === 1 ? "" : "s"}` : ""}
                                {selectedView?.sharedRoleIds?.length ? `, ${selectedView.sharedRoleIds.length} role${selectedView.sharedRoleIds.length === 1 ? "" : "s"}` : ""}
                            </span>
                        ) : null}
                        {selectedView && (selectedView.viewCount ?? 0) > 0 ? (
                            <span className="text-xs text-muted-foreground">Opened {selectedView.viewCount}x{selectedView.lastOpenedAt ? `, last ${relativeTime(selectedView.lastOpenedAt)}` : ""}</span>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => loadRecords(selectedView, tabs)} disabled={!selectedView || loadingRecords}>
                            <RefreshCw className={cn("size-4", loadingRecords && "animate-spin")} />
                            Refresh
                        </Button>
                        <Button size="sm" onClick={() => {
                            setEditingView(null);
                            setBuilderOpen(true);
                        }}>
                            <Plus className="size-4" />
                            New Smart View
                        </Button>
                        {selectedView ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="icon-sm" aria-label="Smart View actions">
                                        <MoreHorizontal className="size-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => {
                                        setEditingView(selectedView);
                                        setBuilderOpen(true);
                                    }}>
                                        <Pencil className="size-4" />
                                        Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => renameView(selectedView)}>
                                        <Pencil className="size-4" />
                                        Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => moveView(selectedView, -1)}>
                                        <ChevronLeft className="size-4" />
                                        Move up
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => moveView(selectedView, 1)}>
                                        <ChevronRight className="size-4" />
                                        Move down
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setPersonaDefault(selectedView, null)}>
                                        <Star className="size-4" />
                                        Default for module
                                    </DropdownMenuItem>
                                    {canShareViews ? (
                                        <>
                                            <DropdownMenuItem onClick={() => setPersonaDefault(selectedView, "ADMIN")}>Default for Admin</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setPersonaDefault(selectedView, "MANAGER")}>Default for Manager</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setPersonaDefault(selectedView, "REP")}>Default for Rep</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setPersonaDefault(selectedView, "PARTNER")}>Default for Partner</DropdownMenuItem>
                                        </>
                                    ) : null}
                                    <DropdownMenuItem onClick={() => cloneView(selectedView)}>
                                        <Copy className="size-4" />
                                        Clone
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => toggleArchiveView(selectedView)}>
                                        <Archive className="size-4" />
                                        {selectedView.isArchived ? "Unarchive" : "Archive"}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setCommentsDialogOpen(true)}>
                                        <MessageSquare className="size-4" />
                                        Comments{selectedView.comments?.length ? ` (${selectedView.comments.length})` : ""}
                                    </DropdownMenuItem>
                                    {canShareViews ? (
                                        <DropdownMenuItem onClick={() => { setTransferTargetUserId(""); setTransferDialogOpen(true); }}>
                                            <UserCog className="size-4" />
                                            Transfer ownership
                                        </DropdownMenuItem>
                                    ) : null}
                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteView(selectedView)}>
                                        <Trash2 className="size-4" />
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : null}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="m-4 rounded-xl border bg-card p-6 text-sm text-muted-foreground">Loading Smart Views...</div>
            ) : views.length === 0 ? (
                <div className="p-4">
                    <EmptyState
                        icon={<LayoutList className="size-12 text-muted-foreground opacity-50" />}
                        title="No Smart Views assigned yet"
                        description={canShareViews ? "Create a Smart View and assign it to users, teams, or sales groups." : "Create a private Smart View for your own workspace."}
                        action={<Button onClick={() => setBuilderOpen(true)}><Plus className="size-4" />New Smart View</Button>}
                    />
                </div>
            ) : selectedView && activeTab ? (
                <>
                    <div className="border-b bg-surface-container-low">
                        <div className="flex overflow-x-auto px-2 md:px-4">
                            {tabs.map((tab) => {
                                const active = tab.id === activeTab.id;
                                const count = recordsByTab[tab.id]?.length;
                                const enabled = isSmartViewModuleEnabled(tab.module, { opportunityEnabled, advancedReporting, payoutsEnabled });
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActiveTabId(tab.id)}
                                        className={cn(
                                            "min-h-[68px] min-w-[220px] border-x border-transparent px-4 py-2.5 text-left transition-colors",
                                            active ? "border-x-border border-t-2 border-t-primary bg-background shadow-sm" : "text-muted-foreground hover:bg-background/70"
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className={cn("truncate text-sm font-bold", active && "text-foreground")}>{tab.name}</span>
                                            {!enabled ? (
                                                <Badge variant="destructive" className="h-5 rounded-md px-1.5 text-[0.65rem]">Disabled</Badge>
                                            ) : tab.filters?.conditions?.length ? (
                                                <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[0.65rem]">{tab.filters.conditions.length}</Badge>
                                            ) : null}
                                        </div>
                                        <div className={cn("mt-0.5 text-lg font-extrabold", active ? "text-primary" : "text-muted-foreground")}>
                                            {!enabled ? "-" : loadingRecords && count === undefined ? "..." : (count ?? 0).toLocaleString()}
                                        </div>
                                        <div className="text-xs text-muted-foreground">{moduleLabel(tab.module)}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="border-b bg-card px-4 py-3 md:px-5">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                <span className={cn("size-2.5 rounded-full", tabErrors[activeTab.id] ? "bg-destructive" : "bg-primary")} />
                                <span>Last Updated: {lastUpdatedAt ? relativeTime(lastUpdatedAt) : "Never"}</span>
                                <span className="hidden sm:inline">|</span>
                                <button type="button" className="font-semibold text-primary" onClick={() => loadRecords(selectedView, tabs)}>
                                    Refresh
                                </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-semibold text-muted-foreground">
                                    <SlidersHorizontal className="size-4" />
                                    {activeTab.filters?.conditions?.length ?? 0} filters
                                </div>
                                <div className="relative w-full sm:w-[300px]">
                                    <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        className="h-9 rounded-md pl-8"
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder={`Search ${moduleLabel(activeTab.module).toLowerCase()}`}
                                    />
                                </div>
                                <Badge variant="outline" className="h-9 rounded-md px-3">
                                    {visibleRecords.length.toLocaleString()} records
                                </Badge>
                                {truncatedTabs[activeTab.id] ? (
                                    <Badge variant="secondary" className="h-9 rounded-md px-3" title="This tab stops at the per-load row limit. Add more specific filters to see records beyond this cap.">
                                        Showing first {ROW_LIMIT} -- add filters for more
                                    </Badge>
                                ) : null}
                            </div>
                        </div>
                        {activeTab.countChips?.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                                {activeTab.countChips.map((chip) => (
                                    <Badge key={chip.id} variant="secondary" className="rounded-md">
                                        {chip.label}: {(chipCounts.get(chip.id) ?? 0).toLocaleString()}
                                    </Badge>
                                ))}
                            </div>
                        ) : null}
                        {selectedRecordIds.length > 0 && (
                            <div className="mt-2 flex items-center gap-2 rounded-md border bg-surface-container-low px-3 py-2">
                                <span className="text-sm font-semibold">{selectedRecordIds.length} selected</span>
                                <QueueExportButton
                                    moduleName={activeTab.module}
                                    selectedIds={selectedRecordIds}
                                    currentPageIds={visibleRecords.map((record) => record.id)}
                                    totalItems={visibleRecords.length}
                                    size="sm"
                                />
                                <Button variant="ghost" size="sm" onClick={() => setSelectedRecordIds([])}>Clear</Button>
                            </div>
                        )}
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto bg-background">
                        {tabErrors[activeTab.id] ? (
                            <div className="p-4">
                                <EmptyState title="Cannot load this tab" description={tabErrors[activeTab.id]} />
                            </div>
                        ) : loadingRecords && visibleRecords.length === 0 ? (
                            <div className="p-4 text-sm text-muted-foreground">Loading records...</div>
                        ) : visibleRecords.length === 0 ? (
                            <div className="p-4">
                                <EmptyState title="No records found" description="Adjust the Smart View filters or refresh this tab." />
                            </div>
                        ) : (
                            <InlineRecordsTable
                                tab={activeTab}
                                records={visibleRecords}
                                columns={columns}
                                selectedIds={selectedRecordIds}
                                onToggleSelect={(id, checked) => setSelectedRecordIds((current) => checked ? [...current, id] : current.filter((existing) => existing !== id))}
                                onToggleSelectAll={(checked) => setSelectedRecordIds(checked ? visibleRecords.map((record) => record.id) : [])}
                                quickActions={hasModuleWriteAccess(currentUser, activeTab.module) ? activeTab.quickActions ?? [] : []}
                                users={users}
                                leadLists={leadLists}
                                activityTypes={activityTypes}
                                stagesByOpportunityTypeId={stagesByOpportunityTypeId}
                                onActionDone={() => loadRecords(selectedView, tabs)}
                            />
                        )}
                    </div>
                </>
            ) : null}

            <SaveViewDialog
                open={builderOpen}
                onOpenChange={(nextOpen) => {
                    setBuilderOpen(nextOpen);
                    if (!nextOpen) setEditingView(null);
                }}
                module="LEADS"
                filters={EMPTY_FILTERS}
                canShare={canShareViews}
                initialView={editingView}
                onSuccess={() => {
                    setBuilderOpen(false);
                    setEditingView(null);
                    fetchViews();
                }}
            />

            <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Transfer ownership</DialogTitle>
                        <DialogDescription>Move this Smart View to another user. They&apos;ll be able to edit or delete it going forward.</DialogDescription>
                    </DialogHeader>
                    <Select value={transferTargetUserId} onValueChange={setTransferTargetUserId}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Select a user" /></SelectTrigger>
                        <SelectContent>
                            {users.filter((user) => user.id !== selectedView?.ownerId).map((user) => (
                                <SelectItem key={user.id} value={user.id}>{user.name || user.email || "User"}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>Cancel</Button>
                        <Button disabled={!transferTargetUserId} onClick={transferOwnership}>Transfer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={commentsDialogOpen} onOpenChange={setCommentsDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Comments</DialogTitle>
                    </DialogHeader>
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                        {selectedView?.comments?.length ? (
                            selectedView.comments.map((comment) => {
                                const author = users.find((user) => user.id === comment.createdBy);
                                return (
                                    <div key={comment.id} className="rounded-md border bg-surface-container-low px-3 py-2 text-sm">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                            <span className="font-semibold">{author?.name || author?.email || "Unknown"}</span>
                                            <span>{relativeTime(comment.createdAt)}</span>
                                        </div>
                                        <p className="mt-1">{comment.body}</p>
                                    </div>
                                );
                            })
                        ) : (
                            <p className="text-sm text-muted-foreground">No comments yet.</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Add a comment" />
                        <Button disabled={postingComment || !commentDraft.trim()} onClick={postComment}>
                            {postingComment ? "Posting..." : "Post"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function normalizeTabs(view: ViewRecord | null): SmartViewTab[] {
    if (!view) return [];
    if (view.tabs?.length) return view.tabs;
    const viewModule = String(view.module ?? "LEADS").toUpperCase() as SmartViewModule;
    return [{
        id: `${view.id}-default`,
        name: view.name,
        module: viewModule,
        filters: EMPTY_FILTERS,
        density: "comfortable",
    }];
}

async function fetchRecordsForTab(tab: SmartViewTab, currentUser: CurrentUser | null) {
    const response = await fetchModuleData(tab.module);
    const records = Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : [];
    return records.map((record: any) => decorateRecord(tab.module, record, currentUser));
}

async function fetchModuleData(module: SmartViewModule) {
    if (module === "LEADS") return apiFetch("/leads?page=1&limit=500");
    if (module === "OPPORTUNITIES") return apiFetch("/opportunities?limit=500");
    if (module === "ACTIVITIES") return apiFetch("/activities?limit=500");
    if (module === "TASKS") return apiFetch("/tasks");
    if (module === "PARTNERS") return apiFetch("/partners");
    if (module === "REPORTS") return apiFetch("/reports/custom");
    if (module === "PAYOUTS") {
        const cycles = await apiFetch<any[]>("/payout-cycles");
        const cycleId = Array.isArray(cycles) ? cycles[0]?.id : null;
        return cycleId ? apiFetch(`/payout-cycles/${cycleId}/payouts`) : [];
    }
    return [];
}

function decorateRecord(module: SmartViewModule, record: any, currentUser: CurrentUser | null) {
    const ownerId = record.ownerId ?? record.owner?.id ?? record.partner?.userId ?? null;
    const ownerSegment = ownerId && currentUser?.id && ownerId === currentUser.id ? "CURRENT_USER" : "OTHER";
    const teamSegment = record.teamId && currentUser?.teamId && record.teamId === currentUser.teamId ? "CURRENT_TEAM" : "OTHER";
    if (module === "TASKS") {
        return { ...record, due: dueSegment(record), ownerSegment, teamSegment, ownerName: record.owner?.name || record.owner?.email || "Unknown user" };
    }
    if (module === "OPPORTUNITIES") {
        return { ...record, ownerSegment, teamSegment, stageName: record.stage?.name || "Unknown stage", leadName: record.lead?.name || record.lead?.email || "Unknown lead" };
    }
    if (module === "ACTIVITIES") {
        return {
            ...record,
            ownerSegment,
            teamSegment,
            activityTypeName: record.type?.name || "Unknown activity type",
            leadName: record.lead?.name || record.lead?.email || "Unknown lead",
            opportunityTitle: record.opportunity?.title || "Unknown opportunity",
            creatorName: record.user?.name || record.user?.email || "Unknown user",
        };
    }
    if (module === "PARTNERS") {
        return {
            ...record,
            ownerSegment,
            teamSegment,
            name: record.user?.name || record.legalBusinessName || "Unnamed partner",
            email: record.user?.email,
            partnerOrganizationName: record.organization?.name || record.partnerOrganization?.name || "No organization",
        };
    }
    if (module === "PAYOUTS") {
        return {
            ...record,
            ownerSegment,
            teamSegment,
            amount: record.totalCommissionAmount ?? record.amount,
            partnerName: record.partner?.legalBusinessName || record.partner?.name || record.partner?.user?.name || "Unknown partner",
            partnerOrganizationName: record.partnerOrganization?.name || record.partner?.organization?.name || "No organization",
        };
    }
    const lastActivityAt = record.lastActivityAt ?? record.lastActivity?.createdAt ?? null;
    return {
        ...record,
        ownerSegment,
        teamSegment,
        activitySegment: lastActivityAt ? "TOUCHED" : "UNTOUCHED",
    };
}

function dueSegment(record: any) {
    const status = String(record.status ?? "").toUpperCase();
    if (status === "COMPLETED") return "completed";
    if (!record.dueAt) return "";
    const due = new Date(record.dueAt).getTime();
    const now = Date.now();
    if (Number.isNaN(due)) return "";
    if (due < now) return "overdue";
    const today = new Date();
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    return due <= end.getTime() ? "today" : "upcoming";
}

function columnsForTab(tab: SmartViewTab) {
    const fields = getSmartViewFields(tab.module);
    const validKeys = new Set(fields.map((field) => field.key));
    const configured = (tab.columns?.length ? tab.columns : DEFAULT_COLUMNS[tab.module]).filter((key) => validKeys.has(key));
    const fallback = DEFAULT_COLUMNS[tab.module].filter((key) => validKeys.has(key));
    const safeColumns = configured.length ? configured : fallback;
    return safeColumns.map((key) => ({ key, label: fieldLabel(fields, key) }));
}

function applySearchAndSort(records: any[], tab: SmartViewTab | null, search: string) {
    let next = records;
    const term = search.trim().toLowerCase();
    if (term) {
        next = next.filter((record) => Object.values(flattenForSearch(record)).some((value) => String(value ?? "").toLowerCase().includes(term)));
    }
    if (tab?.sort?.field) {
        const direction = tab.sort.order === "asc" ? 1 : -1;
        next = [...next].sort((a, b) => compareValues(readValue(a, tab.sort!.field), readValue(b, tab.sort!.field)) * direction);
    }
    return next;
}

function InlineRecordsTable({
    tab,
    records,
    columns,
    selectedIds,
    onToggleSelect,
    onToggleSelectAll,
    quickActions,
    users,
    leadLists,
    activityTypes,
    stagesByOpportunityTypeId,
    onActionDone,
}: {
    tab: SmartViewTab;
    records: any[];
    columns: Array<{ key: string; label: string }>;
    selectedIds: string[];
    onToggleSelect: (id: string, checked: boolean) => void;
    onToggleSelectAll: (checked: boolean) => void;
    quickActions: string[];
    users: Array<{ id: string; name?: string | null; email?: string | null }>;
    leadLists: Array<{ id: string; name: string }>;
    activityTypes: Array<{ id: string; name: string }>;
    stagesByOpportunityTypeId: Map<string, any[]>;
    onActionDone: () => void;
}) {
    const densityClass = tab.density === "compact" ? "py-2" : tab.density === "spacious" ? "py-5" : "py-3";
    const selectedSet = new Set(selectedIds);
    const allSelected = records.length > 0 && records.every((record) => selectedSet.has(record.id));
    return (
        <div className="min-w-full overflow-x-auto">
            <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted">
                    <TableRow>
                        <TableHead className="w-10 border-r">
                            <Checkbox checked={allSelected} onCheckedChange={(checked) => onToggleSelectAll(!!checked)} aria-label="Select all" />
                        </TableHead>
                        {columns.map((column) => (
                            <TableHead key={column.key} className="min-w-[170px] whitespace-nowrap border-r text-xs font-extrabold uppercase tracking-[0.04em] text-muted-foreground">
                                {column.label}
                            </TableHead>
                        ))}
                        <TableHead className="w-10" />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {records.map((record, index) => (
                        <TableRow key={record.id ?? `${tab.id}-${index}`} className="hover:bg-surface-container-low/70">
                            <TableCell className="border-r align-top">
                                <Checkbox
                                    checked={selectedSet.has(record.id)}
                                    onCheckedChange={(checked) => onToggleSelect(record.id, !!checked)}
                                    aria-label={`Select ${record.id}`}
                                />
                            </TableCell>
                            {columns.map((column) => (
                                <TableCell key={column.key} className={cn("max-w-[340px] whitespace-normal border-r align-top text-sm", densityClass)}>
                                    {formatCell(displayValue(tab.module, record, column.key))}
                                </TableCell>
                            ))}
                            <TableCell className="align-top">
                                <ViewRowActionsMenu
                                    module={tab.module}
                                    record={record}
                                    quickActions={quickActions}
                                    users={users}
                                    leadLists={leadLists}
                                    activityTypes={activityTypes}
                                    stagesByOpportunityTypeId={stagesByOpportunityTypeId}
                                    onDone={onActionDone}
                                />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function countForChip(records: any[], chip: NonNullable<SmartViewTab["countChips"]>[number]) {
    return applySmartViewFilters(records, {
        logic: "AND",
        conditions: [{
            id: chip.id,
            field: chip.field,
            operator: chip.operator,
            value: chip.value,
        }],
    }).length;
}

function moduleLabel(module: SmartViewModule) {
    return SMART_VIEW_MODULE_OPTIONS.find((option) => option.value === module)?.label ?? module;
}

function relativeTime(value: string) {
    const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 60) return "less than a minute ago";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
}

function readValue(record: Record<string, any>, path: string) {
    if (path in record) return record[path];
    return path.split(".").reduce((value, key) => value?.[key], record);
}

function displayValue(module: SmartViewModule, record: Record<string, any>, key: string) {
    if (key === "ownerId") return record.owner?.name || record.owner?.email || record.ownerName || "Unknown user";
    if (key === "createdBy") return record.user?.name || record.user?.email || record.creatorName || "Unknown user";
    if (key === "stageId") return record.stage?.name || record.stageName || "Unknown stage";
    if (key === "typeId") return record.type?.name || record.activityTypeName || "Unknown activity type";
    if (key === "leadId") return record.lead?.name || record.lead?.email || record.leadName || "Unknown lead";
    if (key === "opportunityId") return record.opportunity?.title || record.opportunityTitle || "Unknown opportunity";
    if (key === "partnerId") return record.partner?.legalBusinessName || record.partner?.user?.name || record.partnerName || "Unknown partner";
    if (key === "partnerOrganizationId") return record.partnerOrganization?.name || record.organization?.name || record.partnerOrganizationName || "No organization";
    if (module === "REPORTS" && key === "reportKey") return record.name || record.reportKey || "Report";
    return readValue(record, key);
}

function formatCell(value: unknown) {
    if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">...</span>;
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatWorkspaceDateTime(value);
    if (typeof value === "string" && isTechnicalIdentifier(value)) return <span className="text-muted-foreground">Linked record</span>;
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function isTechnicalIdentifier(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
        || /^(demo|seed)-[a-z0-9-]+$/i.test(value);
}

function compareValues(a: unknown, b: unknown) {
    if (a === b) return 0;
    if (a === null || a === undefined) return -1;
    if (b === null || b === undefined) return 1;
    const aNumber = Number(a);
    const bNumber = Number(b);
    if (!Number.isNaN(aNumber) && !Number.isNaN(bNumber)) return aNumber - bNumber;
    return String(a).localeCompare(String(b));
}

function flattenForSearch(record: any) {
    return {
        ...record,
        ownerName: record.owner?.name,
        ownerEmail: record.owner?.email,
        leadName: record.lead?.name,
        opportunityTitle: record.opportunity?.title,
        partnerName: record.partner?.legalBusinessName || record.partner?.name,
    };
}
