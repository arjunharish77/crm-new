"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ColumnDef } from "@tanstack/react-table";
import { BarChart3 as AnalyticsIcon, Eye, Filter as FilterIcon, Kanban as KanbanIcon, List as ListIcon, MoreHorizontal, Pencil, Trash2, UserCog } from "lucide-react";
import { Opportunity, OpportunityType } from "@/types/opportunities";
import { PaginatedResponse } from "@/types/common";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StandardDialog } from "@/components/common/standard-dialog";
import { RecordPicker } from "@/components/common/record-picker";
import { RecordPreviewPopover } from "@/components/common/record-preview-popover";
import { ListToolbar } from "@/components/common/list-toolbar";
import { SelectionBar } from "@/components/common/selection-bar";
import { SegmentedControl } from "@/components/common/page-tabs";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { useAskText, useConfirm } from "@/components/common/dialogs-provider";
import { KanbanBoard } from "@/components/opportunities/kanban-board";
import { OpportunityStageAnalytics } from "@/components/opportunities/opportunity-stage-analytics";
import { NbaCountChip } from "@/components/next-best-action/nba-count-chip";
import { FeatureGate } from "@/components/auth/feature-gate";
import { AdvancedFilterDrawer, FilterGroup } from "@/components/filters/advanced-filter-drawer";
import { FilterConfig, FilterField } from "@/types/filters";
import { QueueExportButton } from "@/components/exports/queue-export-button";
import { ContextualFormsPanel } from "@/components/forms/contextual-forms-panel";
import { isAbortError, useAbortableRequest } from "@/hooks/use-abortable-request";
import { useUrlState } from "@/hooks/use-url-state";
import { getSavedViewMode, saveViewMode } from "@/lib/workspace-layout";
import { deleteOpportunitiesInBatches, fetchMatchingIds, plural, reassignOwnersInBatches, showBulkResult } from "@/lib/bulk-selection";
import { chipsFromGroups, EMPTY_FILTERS, groupsToFilterConfig, groupsToQuery, parseGroups } from "@/lib/filter-groups";
import { useRecordsChanged } from "@/lib/records-events";
import { storageGet, storageRemove, storageSet } from "@/lib/storage";
import { formatWorkspaceDate, isPastDate } from "@/lib/date-format";
import { formatCount, formatMoney } from "@/lib/display/format";
import { statusDisplay } from "@/lib/display/status";
import { cn } from "@/lib/utils";
import { CreateOpportunityDialog } from "./create-opportunity-dialog";
import { EditOpportunityDialog } from "./edit-opportunity-dialog";

const SELECTED_TYPE_STORAGE_KEY = "unnatify.opportunities.selectedTypeId";
const VIEWS = ["all", "OPEN", "WON", "LOST"] as const;
type View = (typeof VIEWS)[number];
type Mode = "LIST" | "KANBAN" | "ANALYTICS";
const SORTABLE = ["title", "amount", "stage", "priority", "owner", "expectedCloseDate", "createdAt"];
const DEFAULT_HIDDEN = { pendingNbaCount: false, createdAt: false };

const BAND_DOT: Record<string, string> = {
    success: "bg-status-success-foreground", warning: "bg-status-warning-foreground", danger: "bg-status-danger-foreground",
    info: "bg-status-info-foreground", neutral: "bg-status-neutral-foreground", accent: "bg-status-accent-foreground",
};

// Opportunities list and board (UI/UX plan Phase 2): the same one-row toolbar as Leads, quick
// views Open / Won / Lost (instead of a wall of per-stage chips), ₹ values, the compact Score
// column, row click opens the record, and a board you can drive with the keyboard.
export default function OpportunitiesPage() {
    const router = useRouter();
    const confirm = useConfirm();
    const askText = useAskText();
    const nextFetchSignal = useAbortableRequest();
    const nextCountSignal = useAbortableRequest();

    const [search, setSearch] = useUrlState<string>("q", "");
    const [view, setView] = useUrlState<View>("view", "all", { allowed: VIEWS });
    const [sortParam, setSortParam] = useUrlState<string>("sort", "");
    const sort = useMemo(() => {
        const id = sortParam.replace(/^-/, "");
        return SORTABLE.includes(id) ? { id, desc: sortParam.startsWith("-") } : null;
    }, [sortParam]);
    const [mode, setModeState] = useState<Mode>(() => {
        const saved = getSavedViewMode("opportunities");
        return saved === "KANBAN" || saved === "ANALYTICS" ? saved : "LIST";
    });
    const setMode = (next: Mode) => { setModeState(next); saveViewMode("opportunities", next); };

    const [urlFilters, setUrlFilters] = useState("");
    const [filters, setFilters] = useState<FilterConfig>(EMPTY_FILTERS);
    const [filterGroups, setFilterGroups] = useState<FilterGroup[]>([]);
    const [filterOpen, setFilterOpen] = useState(false);
    const [data, setData] = useState<Opportunity[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [totalItems, setTotalItems] = useState(0);
    const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
    const [counts, setCounts] = useState<Record<View, number>>({ all: 0, OPEN: 0, WON: 0, LOST: 0 });
    const [opportunityTypes, setOpportunityTypes] = useState<OpportunityType[]>([]);
    const [selectedTypeId, setSelectedTypeId] = useState<string>("ALL");
    const [users, setUsers] = useState<any[]>([]);

    const [selectedRows, setSelectedRows] = useState<string[]>([]);
    const [isAllSelected, setIsAllSelected] = useState(false);
    const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
    const [bulkAssignUserId, setBulkAssignUserId] = useState<string | null>(null);
    const [bulkAssignReason, setBulkAssignReason] = useState("");
    const [bulkBusy, setBulkBusy] = useState(false);
    const [opportunityToEdit, setOpportunityToEdit] = useState<Opportunity | null>(null);

    useEffect(() => {
        const raw = new URLSearchParams(window.location.search).get("filters") ?? "";
        setUrlFilters(raw);
        const groups = parseGroups(raw);
        setFilterGroups(groups);
        setFilters(groupsToFilterConfig(groups));
    }, []);

    const filtersWithView = useCallback((viewValue: View) => {
        const groups = parseGroups(urlFilters);
        if (viewValue !== "all") groups.push({ id: "view", logic: "AND", conditions: [{ id: "view", field: "stageCategory", operator: "equals", value: viewValue } as any] });
        return groups.length ? JSON.stringify(groups) : "";
    }, [urlFilters]);

    const listParams = useCallback((extra: Record<string, string> = {}, viewValue: View = view) => {
        const params = new URLSearchParams(extra);
        if (selectedTypeId !== "ALL") params.set("opportunityTypeId", selectedTypeId);
        const applied = filtersWithView(viewValue);
        if (applied) params.set("filters", applied);
        if (search.trim()) params.set("q", search.trim());
        return params;
    }, [selectedTypeId, filtersWithView, search, view]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        const signal = nextFetchSignal();
        try {
            const params = listParams({
                page: mode === "LIST" ? String(paginationModel.page + 1) : "1",
                limit: mode === "LIST" ? String(paginationModel.pageSize) : "500",
            });
            if (sort) { params.set("sort", sort.id); params.set("dir", sort.desc ? "desc" : "asc"); }
            const response = await apiFetch<PaginatedResponse<Opportunity> | Opportunity[]>(`/opportunities?${params.toString()}`, { signal });
            if ('meta' in response && response.data) {
                setData(response.data);
                setTotalItems(response.meta.total);
            } else if (Array.isArray(response)) {
                setData(response);
                setTotalItems(response.length);
            }
        } catch (error) {
            if (isAbortError(error)) return;
            setFetchError("Opportunities couldn't be loaded.");
        } finally {
            if (!signal.aborted) setLoading(false);
        }
    }, [listParams, mode, paginationModel, sort, nextFetchSignal]);
    useEffect(() => { fetchData(); }, [fetchData]);
    useRecordsChanged(["opportunity"], fetchData);

    // Counts for the quick views, for the current type and search.
    const fetchCounts = useCallback(async () => {
        const signal = nextCountSignal();
        const entries = await Promise.all(VIEWS.map(async (value) => {
            try {
                const params = listParams({ page: "1", limit: "1" }, value);
                const response = await apiFetch<PaginatedResponse<Opportunity>>(`/opportunities?${params.toString()}`, { signal });
                return [value, Number(response?.meta?.total ?? 0)] as const;
            } catch {
                return [value, 0] as const;
            }
        }));
        if (!signal.aborted) setCounts(Object.fromEntries(entries) as Record<View, number>);
    }, [listParams, nextCountSignal]);
    useEffect(() => { fetchCounts(); }, [fetchCounts]);

    useEffect(() => {
        apiFetch<OpportunityType[]>("/opportunity-types").then((rows) => {
            const types = Array.isArray(rows) ? rows : [];
            setOpportunityTypes(types);
            const saved = storageGet(SELECTED_TYPE_STORAGE_KEY);
            if (saved && types.some((type) => type.id === saved)) setSelectedTypeId(saved);
        }).catch(() => undefined);
        apiFetch<any[]>("/users").then((rows) => setUsers(Array.isArray(rows) ? rows : [])).catch(() => undefined);
    }, []);

    const resetPaging = () => {
        setPaginationModel((current) => ({ ...current, page: 0 }));
        setSelectedRows([]);
        setIsAllSelected(false);
    };

    const handleTypeChange = (value: string) => {
        setSelectedTypeId(value);
        if (value === "ALL") storageRemove(SELECTED_TYPE_STORAGE_KEY);
        else storageSet(SELECTED_TYPE_STORAGE_KEY, value);
        resetPaging();
    };

    const applyFilterGroups = useCallback((groups: FilterGroup[]) => {
        setFilterGroups(groups);
        setFilters(groupsToFilterConfig(groups));
        setUrlFilters(groupsToQuery(groups));
        setPaginationModel((current) => ({ ...current, page: 0 }));
        setSelectedRows([]);
        setIsAllSelected(false);
    }, []);

    const previewFilterCount = useCallback(async (groups: FilterGroup[]) => {
        const params = new URLSearchParams({ page: "1", limit: "1" });
        if (selectedTypeId !== "ALL") params.set("opportunityTypeId", selectedTypeId);
        const query = groupsToQuery(groups);
        if (query) params.set("filters", query);
        const response = await apiFetch<PaginatedResponse<Opportunity> | Opportunity[]>(`/opportunities?${params.toString()}`);
        return "meta" in response ? response.meta.total : Array.isArray(response) ? response.length : 0;
    }, [selectedTypeId]);

    const selectedType = useMemo(() => opportunityTypes.find((type) => type.id === selectedTypeId) ?? null, [opportunityTypes, selectedTypeId]);
    const allStages = useMemo(() => opportunityTypes.flatMap((type: any) => type.stages ?? []), [opportunityTypes]);

    // Won and Lost ask for a reason (UI/UX plan §11.4); it is kept on the stage history.
    const updateOpportunityStage = async (id: string, stageId: string) => {
        const opportunity = data.find((item) => item.id === id);
        const stage = allStages.find((item: any) => item.id === stageId);
        if (!opportunity || !stage || opportunity.stageId === stageId) return;
        let stageChangeNote: string | undefined;
        if (stage.isClosed) {
            const reason = await askText({
                title: `Mark as ${stage.label || stage.name}`,
                description: opportunity.title,
                label: stage.isWon ? "What won it?" : "Why was it lost?",
                confirmLabel: `Mark ${(stage.label || stage.name).toLowerCase()}`,
                required: true,
            });
            if (reason === null) return;
            stageChangeNote = reason;
        }
        const previous = opportunity.stageId;
        setData((current) => current.map((item) => (item.id === id ? { ...item, stageId, stage } : item)));
        try {
            await apiFetch(`/opportunities/${id}`, { method: 'PATCH', body: JSON.stringify({ stageId, stageChangeNote }) });
            fetchCounts();
            toast.success(`${opportunity.title}: ${stage.label || stage.name}`, {
                duration: 6000,
                action: stage.isClosed ? undefined : {
                    label: "Undo",
                    onClick: async () => {
                        try {
                            await apiFetch(`/opportunities/${id}`, { method: 'PATCH', body: JSON.stringify({ stageId: previous }) });
                            fetchData();
                        } catch {
                            toast.error("Couldn't undo");
                        }
                    },
                },
            });
        } catch (error: any) {
            setData((current) => current.map((item) => (item.id === id ? opportunity : item)));
            toast.error(error?.message || "Couldn't change the stage");
        }
    };

    const columns = useMemo<ColumnDef<Opportunity, any>[]>(() => [
        {
            accessorKey: 'title', id: "title", header: 'Opportunity', enableSorting: true, size: 240,
            cell: ({ row }) => (
                <div className="min-w-0 max-w-60">
                    <Link href={`/dashboard/opportunities/${row.original.id}`} onClick={(event) => event.stopPropagation()} className="block truncate font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {row.original.title}
                    </Link>
                    {row.original.lead?.name ? <span className="block truncate text-xs text-muted-foreground">{row.original.lead.name}</span> : null}
                </div>
            ),
        },
        {
            accessorKey: 'amount', id: "amount", header: () => <span className="block text-right">Value</span>, enableSorting: true, size: 120,
            cell: ({ row }) => <span className="block text-right tabular-nums">{formatMoney(row.original.amount ?? 0)}</span>,
        },
        {
            accessorKey: 'stage', id: "stage", header: 'Stage', enableSorting: true, size: 170,
            cell: ({ row }) => {
                const stage: any = row.original.stage;
                if (!stage) return <span className="text-muted-foreground">—</span>;
                return <StatusBadge tone={stage.isClosed ? (stage.isWon ? "success" : "danger") : "neutral"} dotColor={stage.isClosed ? null : stage.color} label={stage.label || stage.name} />;
            },
        },
        {
            accessorKey: 'priority', id: "priority", header: 'Priority', enableSorting: true, size: 100,
            cell: ({ row }) => {
                const shown = statusDisplay("priority", row.original.priority);
                return <span className={cn(shown.tone === "danger" ? "text-destructive" : "text-muted-foreground")}>{shown.label}</span>;
            },
        },
        {
            accessorKey: 'ownerName', id: "owner", header: 'Owner', enableSorting: true, size: 140,
            cell: ({ row }) => row.original.ownerName ? <span className="block max-w-32 truncate">{row.original.ownerName}</span> : <span className="text-muted-foreground">Unassigned</span>,
        },
        {
            accessorKey: 'expectedCloseDate', id: "expectedCloseDate", header: 'Close date', enableSorting: true, size: 120,
            cell: ({ row }) => {
                const value = row.original.expectedCloseDate;
                if (!value) return <span className="text-muted-foreground">—</span>;
                const overdue = isPastDate(value) && !(row.original.stage as any)?.isClosed;
                return <span className={cn(overdue ? "text-destructive" : "text-muted-foreground")}>{overdue ? "Overdue · " : ""}{formatWorkspaceDate(value)}</span>;
            },
        },
        {
            accessorKey: 'predictiveScore', id: "score", header: 'Score', size: 80,
            cell: ({ row }) => {
                const score = row.original.predictiveScore;
                const value = score?.winProbability ?? null;
                if (!score || value === null) return <span className="text-muted-foreground">—</span>;
                const band = statusDisplay("scoreBand", score.scoreBand);
                return (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1.5 tabular-nums" tabIndex={0}>
                                <span aria-hidden className={cn("size-2 rounded-full", BAND_DOT[band.tone])} />
                                {Math.round(value)}<span className="sr-only">, {band.label}</span>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>{band.label} · {Math.round(value)}% likely to win · {Math.round(score.confidence ?? 0)}% confidence</TooltipContent>
                    </Tooltip>
                );
            },
        },
        { accessorKey: 'pendingNbaCount', id: "pendingNbaCount", header: 'Next best action', size: 130, cell: ({ row }) => <NbaCountChip count={row.original.pendingNbaCount} /> },
        { accessorKey: 'createdAt', id: "createdAt", header: 'Created', enableSorting: true, size: 120, cell: ({ row }) => <span className="text-muted-foreground">{formatWorkspaceDate(row.original.createdAt)}</span> },
    ], []);

    const filterFields = useMemo<FilterField[]>(() => [
        { key: "title", label: "Title", type: "text" },
        { key: "amount", label: "Value", type: "number" },
        { key: "priority", label: "Priority", type: "select", options: [{ label: "Low", value: "LOW" }, { label: "Medium", value: "MEDIUM" }, { label: "High", value: "HIGH" }] },
        { key: "stageId", label: "Stage", type: "select", options: (selectedType?.stages ?? allStages).map((stage: any) => ({ label: stage.label || stage.name, value: stage.id })) },
        { key: "expectedCloseDate", label: "Close date", type: "date" },
        { key: "predictiveScoreBand", label: "Score band", type: "select", options: [{ label: "Hot", value: "HOT" }, { label: "Warm", value: "WARM" }, { label: "Cold", value: "COLD" }, { label: "At risk", value: "RISK" }] },
        { key: "predictiveWinProbability", label: "Likelihood to win", type: "number" },
        { key: "predictiveStallRisk", label: "Stall risk", type: "number" },
        { key: "ownerId", label: "Owner", type: "user", options: users.map((u) => ({ label: u.name || u.email, value: u.id })) },
        { key: "createdAt", label: "Created", type: "date" },
        { key: "tags", label: "Tags", type: "tags" },
    ], [selectedType, allStages, users]);

    const fieldLabels: Record<string, string> = Object.fromEntries(filterFields.map((field) => [field.key, field.label]));
    const chips = chipsFromGroups(filterGroups, applyFilterGroups, {
        field: (field) => fieldLabels[field] ?? field,
        value: (field, value) => {
            if (field === "stageId") return allStages.find((stage: any) => stage.id === value)?.name ?? "a stage";
            if (field === "ownerId") return users.find((user) => user.id === value)?.name ?? "a user";
            if (field === "priority") return statusDisplay("priority", value).label;
            return String(value ?? "");
        },
    });

    const selectedCount = isAllSelected ? totalItems : selectedRows.length;
    const clearSelection = () => { setSelectedRows([]); setIsAllSelected(false); };
    const getSelectedIds = async () => (isAllSelected ? fetchMatchingIds("/opportunities", listParams()) : selectedRows.map(String));
    const withSelection = async (run: (ids: string[]) => Promise<void>) => {
        let ids: string[];
        try {
            ids = await getSelectedIds();
        } catch (error: any) {
            toast.error(error?.message || "Couldn't work out which opportunities are selected");
            return;
        }
        if (ids.length) await run(ids);
    };

    const handleDelete = () => withSelection(async (ids) => {
        const ok = await confirm({
            title: `Delete ${plural(ids.length, "opportunity", "opportunities")}?`,
            description: "Their stage history goes with them. This can't be undone.",
            confirmLabel: `Delete ${plural(ids.length, "opportunity", "opportunities")}`,
            destructive: true,
            typedConfirmation: ids.length > 25 ? `DELETE ${ids.length}` : undefined,
        });
        if (!ok) return;
        // One request per 1,000 records (Section 8 #5); each failure comes back with its reason.
        const { deleted, failed } = await deleteOpportunitiesInBatches(ids);
        const titles = new Map(data.map((opportunity) => [String(opportunity.id), opportunity.title]));
        showBulkResult({
            done: "deleted",
            succeeded: deleted,
            noun: ["opportunity", "opportunities"],
            failures: failed.map((failure) => ({ label: titles.get(failure.id) || "An opportunity", reason: failure.reason })),
        });
        clearSelection();
        fetchData();
        fetchCounts();
    });

    const handleBulkAssign = () => withSelection(async (ids) => {
        if (!bulkAssignUserId || !bulkAssignReason.trim()) return;
        setBulkBusy(true);
        try {
            const outcome = await reassignOwnersInBatches("OPPORTUNITY", ids, bulkAssignUserId, bulkAssignReason.trim());
            const message = `${plural(outcome.reassigned, "opportunity", "opportunities")} reassigned` +
                (outcome.pendingApproval ? `, ${outcome.pendingApproval.toLocaleString()} sent for approval` : "") +
                (outcome.failed ? `, ${outcome.failed.toLocaleString()} failed` : "");
            if (outcome.failed) toast.warning(message); else toast.success(message);
            setBulkAssignOpen(false);
            clearSelection();
            fetchData();
        } finally {
            setBulkBusy(false);
        }
    });

    const hasNarrowing = !!search.trim() || view !== "all" || chips.length > 0;

    const toolbar = (
        <ListToolbar
            search={{ value: search, onChange: (value) => { setSearch(value); resetPaging(); }, placeholder: "Search title or lead", label: "Search opportunities", inputId: "opportunities-search" }}
            quickFilters={[
                { value: "all", label: "All", count: counts.all },
                { value: "OPEN", label: "Open", count: counts.OPEN },
                { value: "WON", label: "Won", count: counts.WON },
                { value: "LOST", label: "Lost", count: counts.LOST },
            ]}
            quickFilter={view}
            onQuickFilterChange={(value) => { setView(value as View); resetPaging(); }}
            chips={chips}
            onClearAll={() => applyFilterGroups([])}
            actions={<>
                {opportunityTypes.length > 0 && (
                    <Select value={selectedTypeId} onValueChange={handleTypeChange}>
                        <SelectTrigger size="sm" aria-label="Opportunity type" className="w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All types</SelectItem>
                            {opportunityTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                )}
                <Button variant="outline" size="sm" onClick={() => setFilterOpen(true)}><FilterIcon className="size-4" />Filters{chips.length ? ` (${chips.length})` : ""}</Button>
            </>}
        />
    );

    return (
        <FeatureGate feature="opportunityEnabled" fallback={<EmptyState title="Opportunities aren't turned on" description="Ask an admin to turn on the Opportunities module." />}>
            <div className="flex h-full flex-grow flex-col">
                <PageHeader
                    title="Opportunities"
                    meta={<span className="tabular-nums">{formatCount(counts.all)} opportunities</span>}
                    primaryAction={<CreateOpportunityDialog onSuccess={() => { fetchData(); fetchCounts(); }} />}
                    secondaryActions={<>
                        <SegmentedControl
                            label="View"
                            value={mode}
                            onChange={setMode}
                            options={[
                                { value: "LIST", label: "List", icon: <ListIcon /> },
                                { value: "KANBAN", label: "Board", icon: <KanbanIcon /> },
                                { value: "ANALYTICS", label: "Analytics", icon: <AnalyticsIcon /> },
                            ]}
                        />
                        <QueueExportButton
                            moduleName="OPPORTUNITIES"
                            filters={{ ...filters, opportunityTypeId: selectedTypeId !== "ALL" ? selectedTypeId : null, viewMode: mode, urlFilters: filtersWithView(view) }}
                            selectedIds={isAllSelected ? [] : selectedRows}
                            currentPageIds={data.map((opportunity) => opportunity.id)}
                            totalItems={totalItems}
                        />
                        <ContextualFormsPanel placement="OPPORTUNITY_CREATE" context={{}} requireModules={["lead", "opportunity"]} triggerLabel="Lead + opportunity" autoOpenSingle onSaved={fetchData} />
                    </>}
                />

                {mode === "LIST" ? (
                    <DataTable
                        storageKey="opportunities-table"
                        data={data}
                        columns={columns}
                        defaultColumnVisibility={DEFAULT_HIDDEN}
                        loading={loading}
                        error={fetchError}
                        onRetry={fetchData}
                        getRowId={(row) => row.id}
                        onRowClick={(row) => router.push(`/dashboard/opportunities/${row.id}`)}
                        sort={sort}
                        onSortChange={(next) => { setSortParam(next ? `${next.desc ? "-" : ""}${next.id}` : ""); resetPaging(); }}
                        enableRowSelection
                        rowSelectionIds={selectedRows}
                        onRowSelectionIdsChange={(ids) => { setSelectedRows(ids); if (isAllSelected) setIsAllSelected(false); }}
                        totalItems={totalItems}
                        isAllSelected={isAllSelected}
                        onSelectAllFiltered={() => { setSelectedRows(data.map((item) => item.id)); setIsAllSelected(true); }}
                        onClearSelection={clearSelection}
                        pageIndex={paginationModel.page}
                        pageSize={paginationModel.pageSize}
                        pageSizeOptions={[25, 50, 100]}
                        onPaginationChange={({ pageIndex, pageSize }) => setPaginationModel({ page: pageIndex, pageSize })}
                        toolbarActions={toolbar}
                        rowActions={(opportunity) => (
                            <>
                                <RecordPreviewPopover entityType="opportunity" entityId={opportunity.id}>
                                    <IconButton label={`Preview ${opportunity.title}`} onClick={(event) => event.stopPropagation()}><Eye className="size-4" /></IconButton>
                                </RecordPreviewPopover>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${opportunity.title}`}><MoreHorizontal className="size-4" /></Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onSelect={() => setOpportunityToEdit(opportunity)}><Pencil className="size-4" />Edit</DropdownMenuItem>
                                        {opportunity.leadId ? <DropdownMenuItem asChild><Link href={`/dashboard/leads/${opportunity.leadId}`}>Open lead</Link></DropdownMenuItem> : null}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </>
                        )}
                        mobileCard={(opportunity) => (
                            <div className="space-y-1">
                                <div className="flex items-start justify-between gap-2">
                                    <span className="min-w-0 truncate font-medium">{opportunity.title}</span>
                                    <span className="shrink-0 tabular-nums">{formatMoney(opportunity.amount ?? 0)}</span>
                                </div>
                                <div className="truncate text-sm text-muted-foreground">{[opportunity.lead?.name, (opportunity.stage as any)?.name].filter(Boolean).join(" · ")}</div>
                                <div className="text-xs text-muted-foreground">{opportunity.ownerName ?? "Unassigned"}{opportunity.expectedCloseDate ? ` · closes ${formatWorkspaceDate(opportunity.expectedCloseDate)}` : ""}</div>
                            </div>
                        )}
                        emptyState={hasNarrowing ? {
                            title: "No opportunities match", description: "Try another search, view or filter.", kind: "no-match",
                            action: <Button variant="outline" onClick={() => { setSearch(""); setView("all"); applyFilterGroups([]); }}>Clear search and filters</Button>,
                        } : {
                            title: "No opportunities yet", description: "Create one from a lead, or add one here.",
                            action: <CreateOpportunityDialog onSuccess={fetchData} />,
                        }}
                    />
                ) : mode === "KANBAN" ? (
                    <div className="space-y-3">
                        <div className="rounded-xl border bg-card px-3 py-1.5">{toolbar}</div>
                        {!selectedType ? (
                            <EmptyState
                                icon={<KanbanIcon />}
                                title="Choose an opportunity type"
                                description="Each type has its own stages, so the board shows one type at a time."
                                action={<Select value={selectedTypeId} onValueChange={handleTypeChange}>
                                    <SelectTrigger aria-label="Opportunity type for the board" className="w-56"><SelectValue placeholder="Choose a type" /></SelectTrigger>
                                    <SelectContent>{opportunityTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}</SelectContent>
                                </Select>}
                            />
                        ) : loading ? (
                            <div className="h-80 animate-pulse rounded-xl bg-muted" aria-busy="true" />
                        ) : (
                            <KanbanBoard opportunities={data} opportunityType={selectedType} onDragEnd={updateOpportunityStage} onEdit={setOpportunityToEdit} />
                        )}
                        {totalItems > data.length ? <p className="text-sm text-muted-foreground">The board shows the first {data.length.toLocaleString()} of {totalItems.toLocaleString()}. Narrow the view or use the list for the rest.</p> : null}
                    </div>
                ) : (
                    <OpportunityStageAnalytics />
                )}

                <SelectionBar
                    count={selectedCount}
                    totalMatching={totalItems}
                    allMatchingSelected={isAllSelected}
                    onSelectAllMatching={() => { setSelectedRows(data.map((item) => item.id)); setIsAllSelected(true); }}
                    onClear={clearSelection}
                    actions={[
                        { label: "Assign", icon: <UserCog className="size-4" />, onClick: () => { setBulkAssignUserId(null); setBulkAssignReason(""); setBulkAssignOpen(true); } },
                        { label: "Delete", icon: <Trash2 className="size-4" />, onClick: handleDelete, destructive: true },
                    ]}
                />

                <StandardDialog
                    open={bulkAssignOpen}
                    onClose={() => setBulkAssignOpen(false)}
                    title={`Assign ${plural(selectedCount, "opportunity", "opportunities")}`}
                    maxWidth="xs"
                    actions={<>
                        <Button variant="outline" onClick={() => setBulkAssignOpen(false)}>Cancel</Button>
                        <Button onClick={handleBulkAssign} isLoading={bulkBusy} disabled={!bulkAssignUserId || !bulkAssignReason.trim()}>Assign</Button>
                    </>}
                >
                    <div className="space-y-4 pb-1">
                        <div className="space-y-1.5">
                            <Label htmlFor="opportunity-bulk-owner">New owner</Label>
                            <RecordPicker id="opportunity-bulk-owner" entity="user" value={bulkAssignUserId} allowClear={false} onChange={(id) => setBulkAssignUserId(id)} placeholder="Choose a person" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="opportunity-bulk-reason">Reason <span aria-hidden className="text-destructive">*</span></Label>
                            <Textarea id="opportunity-bulk-reason" aria-required placeholder="Why are these opportunities being reassigned?" rows={2} value={bulkAssignReason} onChange={(event) => setBulkAssignReason(event.target.value)} />
                        </div>
                    </div>
                </StandardDialog>

                {opportunityToEdit && (
                    <EditOpportunityDialog open={!!opportunityToEdit} onOpenChange={(open) => { if (!open) setOpportunityToEdit(null); }} opportunity={opportunityToEdit} onSuccess={() => { setOpportunityToEdit(null); fetchData(); }} />
                )}

                <AdvancedFilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)} initialGroups={filterGroups} storageKey="opportunities" previewCount={previewFilterCount} fields={filterFields} onApply={applyFilterGroups} />
            </div>
        </FeatureGate>
    );
}
