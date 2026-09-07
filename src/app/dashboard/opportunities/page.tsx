"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Opportunity, OpportunityType } from "@/types/opportunities";
import { PaginatedResponse } from "@/types/common";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColumnDef } from "@tanstack/react-table";
import { Eye, ExternalLink, Filter, ListFilter, Pencil, List as ListIcon, Kanban as KanbanIcon, BarChart3 as AnalyticsIcon, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button, Button as IconButton } from "@/components/ui/button";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import Link from "next/link";
import { CreateOpportunityDialog } from "./create-opportunity-dialog";
import { EditOpportunityDialog } from "./edit-opportunity-dialog";
import { KanbanBoard } from "@/components/opportunities/kanban-board";
import { OpportunityStageAnalytics } from "@/components/opportunities/opportunity-stage-analytics";
import { BulkActionsToolbar } from "@/components/bulk-actions/bulk-toolbar";
import { formatCurrency } from "@/lib/utils";
import { FeatureGate } from "@/components/auth/feature-gate";
import { TableSkeleton } from "@/components/common/skeletons";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { AdvancedFilterDrawer, FilterGroup } from "@/components/filters/advanced-filter-drawer";
import { FilterConfig, FilterField } from "@/types/filters";
import { getSavedViewMode, saveViewMode } from "@/lib/workspace-layout";
import { isAbortError, useAbortableRequest } from "@/hooks/use-abortable-request";
import { PredictiveScoreBadge } from "@/components/scoring/predictive-score";
import { NbaCountChip } from "@/components/next-best-action/nba-count-chip";
import { QueueExportButton } from "@/components/exports/queue-export-button";
import { ContextualFormsPanel } from "@/components/forms/contextual-forms-panel";

const EMPTY_FILTERS: FilterConfig = { conditions: [], logic: "AND" };
const SELECTED_TYPE_STORAGE_KEY = "unnatify.opportunities.selectedTypeId";

// Gap checklist Module 10's universal advanced filter drawer -- serializes the real, possibly
// multi-group FilterGroup[] the drawer now produces (upgraded from the single flat-group
// FilterBuilder this page used before), instead of forcing everything through one FilterConfig
// group the way the old flat builder's own state shape did.
function groupsToQuery(groups: FilterGroup[]) {
    const nonEmpty = groups
        .map((group) => ({ ...group, conditions: group.conditions.filter((condition) => condition.field) }))
        .filter((group) => group.conditions.length > 0);
    return nonEmpty.length > 0 ? JSON.stringify(nonEmpty) : "";
}

function groupsToFilterConfig(groups: FilterGroup[]): FilterConfig {
    const firstGroup = groups[0];
    if (!firstGroup) return EMPTY_FILTERS;
    return {
        logic: firstGroup.logic,
        conditions: groups.flatMap((group) =>
            group.conditions
                .filter((condition) => condition.field)
                .map((condition) => ({ id: condition.id, field: condition.field, operator: condition.operator as any, value: condition.value }))
        ),
    };
}

// Gap checklist Module 17, item 25 (embedded analytics surfaces: "view-level count chips"),
// mirroring the Leads list page's `LeadStatusChips`. Deliberately a self-contained,
// independently-fetched component -- it doesn't touch this page's existing kanban/list/
// selection/filter state at all, so it can't regress any of that.
function OpportunityStageChips() {
    const [counts, setCounts] = useState<Array<{ stageId: string | null; stageName: string; count: number }>>([]);

    useEffect(() => {
        apiFetch<Array<{ stageId: string | null; stageName: string; count: number }>>("/opportunities/stage-counts")
            .then((data) => setCounts(Array.isArray(data) ? data : []))
            .catch(() => setCounts([]));
    }, []);

    if (!counts.length) return null;
    const total = counts.reduce((sum, row) => sum + Number(row.count ?? 0), 0);

    return (
        <div className="flex flex-wrap items-center gap-1.5 border-b bg-background px-3 py-2">
            <Badge variant="outline" className="rounded-md text-xs font-bold">{total} total</Badge>
            {counts.map((row) => (
                <Badge key={row.stageId ?? "unassigned"} variant="outline" className="rounded-md text-xs font-normal text-muted-foreground">
                    {row.stageName}: {row.count}
                </Badge>
            ))}
        </div>
    );
}

export default function OpportunitiesPage() {
    // Gap checklist Module 10's "performance UX polish" item, "request cancellation on
    // tab/filter changes".
    const nextFetchSignal = useAbortableRequest();
    const [urlFilters, setUrlFilters] = useState("");
    const [filters, setFilters] = useState<FilterConfig>(EMPTY_FILTERS);
    const [filterGroups, setFilterGroups] = useState<FilterGroup[]>([]);
    const [filterOpen, setFilterOpen] = useState(false);
    const [data, setData] = useState<Opportunity[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewModeState] = useState<'LIST' | 'KANBAN' | 'ANALYTICS'>(() => {
        const saved = getSavedViewMode("opportunities");
        return saved === "KANBAN" || saved === "ANALYTICS" ? saved : "LIST";
    });
    const setViewMode = (mode: 'LIST' | 'KANBAN' | 'ANALYTICS') => {
        setViewModeState(mode);
        saveViewMode("opportunities", mode);
    };
    const [opportunityTypes, setOpportunityTypes] = useState<OpportunityType[]>([]);
    const [selectedTypeId, setSelectedTypeId] = useState<string>("ALL");

    const [selectedRows, setSelectedRows] = useState<string[]>([]);
    const [isAllSelected, setIsAllSelected] = useState(false);
    const [totalItems, setTotalItems] = useState(0);
    const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
    const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
    const [bulkAssignUsers, setBulkAssignUsers] = useState<any[]>([]);
    const [bulkAssignUserId, setBulkAssignUserId] = useState("");
    const [bulkAssignReason, setBulkAssignReason] = useState("");
    const [bulkAssignSubmitting, setBulkAssignSubmitting] = useState(false);

    const [editOpportunityOpen, setEditOpportunityOpen] = useState(false);
    const [opportunityToEdit, setOpportunityToEdit] = useState<Opportunity | null>(null);

    const [fetchError, setFetchError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        const signal = nextFetchSignal();
        try {
            const params = new URLSearchParams({
                page: viewMode === "LIST" ? String(paginationModel.page + 1) : "1",
                limit: viewMode === "LIST" ? String(paginationModel.pageSize) : "500",
            });
            if (selectedTypeId !== "ALL") params.set("opportunityTypeId", selectedTypeId);
            if (urlFilters) params.set("filters", urlFilters);
            const response = await apiFetch<PaginatedResponse<Opportunity> | Opportunity[]>(`/opportunities?${params.toString()}`, { signal });

            if ('meta' in response && response.data) {
                setData(response.data);
                setTotalItems(response.meta.total);
            } else if (Array.isArray(response)) {
                setData(response);
                setTotalItems(response.length);
            }
        } catch (error) {
            // A superseded request (view mode/type/filters changed again before this one
            // resolved) -- the newer fetchData call already owns state, so this stale one must
            // not show an error or touch state at all.
            if (isAbortError(error)) return;
            toast.error("Failed to fetch opportunities");
            setFetchError("Failed to load opportunities.");
        } finally {
            if (!signal.aborted) setLoading(false);
        }
    }, [paginationModel.page, paginationModel.pageSize, selectedTypeId, urlFilters, viewMode, nextFetchSignal]);

    const fetchTypes = useCallback(async () => {
        try {
            const data = await apiFetch<OpportunityType[]>("/opportunity-types");
            const types = Array.isArray(data) ? data : [];
            setOpportunityTypes(types);
            setSelectedTypeId((current) => {
                const saved = typeof window !== "undefined" ? window.localStorage.getItem(SELECTED_TYPE_STORAGE_KEY) : null;
                const candidate = current !== "ALL" ? current : saved;
                if (candidate && candidate !== "ALL" && types.some((type) => type.id === candidate)) return candidate;
                return current;
            });
        } catch (error) {
            // Silently handle - the list view still works without types
            console.warn("Failed to load opportunity types:", error);
        }
    }, []);

    useEffect(() => {
        setUrlFilters(new URLSearchParams(window.location.search).get("filters") ?? "");
    }, []);

    const applyFilterGroups = useCallback((groups: FilterGroup[]) => {
        setFilterGroups(groups);
        setFilters(groupsToFilterConfig(groups));
        setUrlFilters(groupsToQuery(groups));
    }, []);

    // "Query preview/count" -- reuses this page's own /opportunities endpoint with limit=1.
    const previewFilterCount = useCallback(async (groups: FilterGroup[]) => {
        const params = new URLSearchParams({ page: "1", limit: "1" });
        if (selectedTypeId !== "ALL") params.set("opportunityTypeId", selectedTypeId);
        const query = groupsToQuery(groups);
        if (query) params.set("filters", query);
        const response = await apiFetch<PaginatedResponse<Opportunity> | Opportunity[]>(`/opportunities?${params.toString()}`);
        return "meta" in response ? response.meta.total : Array.isArray(response) ? response.length : 0;
    }, [selectedTypeId]);

    useEffect(() => {
        fetchTypes();
    }, [fetchTypes]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        apiFetch<any[]>("/users").then(setBulkAssignUsers).catch(() => undefined);
    }, []);

    const handleTypeChange = useCallback((value: string) => {
        setSelectedTypeId(value);
        if (typeof window !== "undefined") {
            if (value === "ALL") window.localStorage.removeItem(SELECTED_TYPE_STORAGE_KEY);
            else window.localStorage.setItem(SELECTED_TYPE_STORAGE_KEY, value);
        }
    }, []);

    const handleEdit = (opportunity: Opportunity) => {
        setOpportunityToEdit(opportunity);
        setEditOpportunityOpen(true);
    };

    const updateOpportunityStage = async (id: string, stageId: string) => {
        const originalData = [...data];
        // Optimistic update
        setData(data.map(opp =>
            opp.id === id ? { ...opp, stageId } : opp
        ) as Opportunity[]);

        try {
            await apiFetch(`/opportunities/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ stageId }),
            });
            toast.success("Stage updated");
        } catch (error) {
            toast.error("Failed to update stage");
            setData(originalData);
        }
    };

    const handleDelete = async (ids: string[]) => {
        if (!confirm(`Are you sure you want to delete ${ids.length} opportunities?`)) return;
        try {
            await Promise.all(ids.map(id => apiFetch(`/opportunities/${id}`, { method: 'DELETE' })));
            setData(prev => prev.filter(o => !ids.includes(o.id)));
            toast.success(`${ids.length} opportunity${ids.length > 1 ? 'ies' : ''} deleted`);
            setSelectedRows([]);
            setIsAllSelected(false);
        } catch (error) {
            toast.error("Failed to delete opportunities");
        }
    };


    const handleSelectAllFiltered = () => {
        setSelectedRows(kanbanOpportunities.map((opportunity) => opportunity.id));
        setIsAllSelected(true);
        toast.success(`All ${totalItems} opportunities selected`);
    };

    const clearSelection = () => {
        setSelectedRows([]);
        setIsAllSelected(false);
    };

    const handleBulkAssign = async () => {
        if (!bulkAssignUserId || !bulkAssignReason.trim()) {
            toast.error("Select a user and enter a reason");
            return;
        }
        if (selectedRows.length === 0) {
            toast.error("Select at least one opportunity");
            return;
        }
        setBulkAssignSubmitting(true);
        try {
            const outcome = await apiFetch<{ reassigned: number; failed: number; pendingApproval: number }>("/assignment/reassign/bulk", {
                method: "POST",
                body: JSON.stringify({
                    entityType: "OPPORTUNITY",
                    entityIds: selectedRows.map(String),
                    newOwnerId: bulkAssignUserId,
                    reason: bulkAssignReason.trim(),
                }),
            });
            toast.success(
                `${outcome.reassigned} opportunit${outcome.reassigned === 1 ? "y" : "ies"} reassigned` +
                (outcome.pendingApproval ? `, ${outcome.pendingApproval} submitted for approval` : "") +
                (outcome.failed ? `, ${outcome.failed} failed` : ""),
            );
            setBulkAssignOpen(false);
            clearSelection();
            fetchData();
        } catch {
            toast.error("Failed to reassign opportunities");
        } finally {
            setBulkAssignSubmitting(false);
        }
    };

    const columns = useMemo<ColumnDef<Opportunity, any>[]>(() => [
        {
            accessorKey: 'title',
            header: 'Opportunity',
            size: 240,
            cell: ({ row }) => (
                <Link
                    href={`/dashboard/opportunities/${row.original.id}`}
                    className="flex h-full items-center font-bold text-primary hover:underline"
                    onClick={(event) => event.stopPropagation()}
                >
                    {row.original.title}
                </Link>
            )
        },
        {
            accessorKey: 'amount',
            header: 'Value',
            size: 150,
            cell: ({ row }) => (
                <span className="text-sm font-bold text-primary">
                    {formatCurrency(row.original.amount ?? 0)}
                </span>
            )
        },
        {
            accessorKey: 'stage',
            header: 'Stage',
            size: 180,
            cell: ({ row }) => (
                <Badge
                    variant="outline"
                    className="font-bold uppercase"
                    style={{
                        backgroundColor: row.original.stage?.color ? `${row.original.stage.color}14` : undefined,
                        borderColor: row.original.stage?.color ? `${row.original.stage.color}33` : undefined,
                        color: row.original.stage?.color ?? undefined,
                    }}
                >
                    {row.original.stage?.name || 'N/A'}
                </Badge>
            )
        },
        {
            accessorKey: 'priority',
            header: 'Priority',
            size: 120,
            cell: ({ row }) => {
                const priority = row.original.priority;
                const className = priority === 'HIGH'
                    ? "border-destructive/20 bg-destructive/10 text-destructive"
                    : priority === 'MEDIUM'
                        ? "border-tertiary/25 bg-tertiary/10 text-tertiary"
                        : "border-primary/20 bg-primary/10 text-primary";

                return (
                    <Badge variant="outline" className={`font-bold uppercase ${className}`}>
                        {priority}
                    </Badge>
                );
            }
        },
        {
            accessorKey: 'predictiveScore',
            header: 'Predictive Score',
            size: 190,
            sortingFn: (rowA, rowB) => {
                const a = rowA.original.predictiveScore?.winProbability ?? 0;
                const b = rowB.original.predictiveScore?.winProbability ?? 0;
                return a - b;
            },
            cell: ({ row }) => <PredictiveScoreBadge score={row.original.predictiveScore} />,
        },
        {
            accessorKey: 'pendingNbaCount',
            header: 'Next Best Action',
            size: 130,
            cell: ({ row }) => <NbaCountChip count={row.original.pendingNbaCount} />,
        },
        {
            id: 'actions',
            header: '',
            size: 120,
            cell: ({ row }) => (
                <div className="flex gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <IconButton variant="ghost" size="icon-sm" onClick={(event) => event.stopPropagation()}>
                                <Eye className="size-4" />
                            </IconButton>
                        </TooltipTrigger>
                        <TooltipContent>View Preview</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <IconButton variant="ghost" size="icon-sm" asChild onClick={(event) => event.stopPropagation()}>
                                <Link href={`/dashboard/opportunities/${row.original.id}`}>
                                    <ExternalLink className="size-4" />
                                </Link>
                            </IconButton>
                        </TooltipTrigger>
                        <TooltipContent>Open Detail</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <IconButton
                                variant="ghost"
                                size="icon-sm"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleEdit(row.original);
                                }}
                            >
                                <Pencil className="size-4" />
                            </IconButton>
                        </TooltipTrigger>
                        <TooltipContent>Edit</TooltipContent>
                    </Tooltip>
                </div>
            )
        }
    ], []);

    const kanbanOpportunities = useMemo(() =>
        selectedTypeId !== "ALL" ? data.filter(opp => opp.opportunityTypeId === selectedTypeId) : data,
        [data, selectedTypeId]
    );

    const selectedType = useMemo(
        () => opportunityTypes.find((type) => type.id === selectedTypeId) ?? null,
        [opportunityTypes, selectedTypeId]
    );

    const filterFields = useMemo<FilterField[]>(() => [
        { key: "title", label: "Title", type: "text" },
        { key: "amount", label: "Amount", type: "number" },
        {
            key: "priority",
            label: "Priority",
            type: "select",
            options: [
                { label: "Low", value: "LOW" },
                { label: "Medium", value: "MEDIUM" },
                { label: "High", value: "HIGH" },
            ],
        },
        {
            key: "stageId",
            label: "Stage",
            type: "select",
            options: (selectedType?.stages ?? []).map((stage: any) => ({ label: stage.label || stage.name, value: stage.id })),
        },
        {
            key: "predictiveScoreBand",
            label: "Score Band",
            type: "select",
            options: [
                { label: "Hot", value: "HOT" },
                { label: "Warm", value: "WARM" },
                { label: "Cold", value: "COLD" },
                { label: "Risk", value: "RISK" },
            ],
        },
        { key: "predictiveConfidence", label: "Score Confidence", type: "number" },
        { key: "predictiveWinProbability", label: "Win Probability", type: "number" },
        { key: "predictiveStallRisk", label: "Stall Risk", type: "number" },
        { key: "ownerId", label: "Owner", type: "user", options: bulkAssignUsers.map((u) => ({ label: u.name || u.email, value: u.id })) },
        { key: "createdAt", label: "Created", type: "date" },
        { key: "tags", label: "Tags", type: "tags" },
    ], [selectedType, bulkAssignUsers]);

    useEffect(() => {
        clearSelection();
        setPaginationModel((current) => ({ ...current, page: 0 }));
    }, [filters, selectedTypeId, viewMode]);

    const VIEW_OPTIONS: Array<{ value: 'KANBAN' | 'LIST' | 'ANALYTICS'; label: string; icon: typeof ListIcon }> = [
        { value: 'KANBAN', label: 'Board', icon: KanbanIcon },
        { value: 'LIST', label: 'List', icon: ListIcon },
        { value: 'ANALYTICS', label: 'Analytics', icon: AnalyticsIcon },
    ];

    return (
        <FeatureGate
            feature="opportunityEnabled"
            fallback={
                <div className="flex h-full items-center justify-center">
                    <p className="text-muted-foreground">The Opportunities module is disabled for your tenant.</p>
                </div>
            }
        >
            <div className="flex h-full flex-grow flex-col">
                <div className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-3">
                        <h1 className="text-lg font-bold">Opportunities</h1>
                        {/* Opportunity Type selector — switch between types to see their kanban */}
                        {opportunityTypes.length > 0 && (
                            <Select value={selectedTypeId} onValueChange={handleTypeChange}>
                                <SelectTrigger className="min-w-[180px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All opportunity types</SelectItem>
                                    {opportunityTypes.map(t => (
                                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <QueueExportButton
                            moduleName="OPPORTUNITIES"
                            filters={{
                                ...filters,
                                opportunityTypeId: selectedTypeId !== "ALL" ? selectedTypeId : null,
                                viewMode,
                                urlFilters,
                            }}
                            selectedIds={isAllSelected ? [] : selectedRows}
                            currentPageIds={kanbanOpportunities.map((opportunity) => opportunity.id)}
                            totalItems={totalItems}
                        />
                        <div className="flex items-center gap-1 rounded-md border p-0.5">
                            {VIEW_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    aria-pressed={viewMode === option.value}
                                    onClick={() => setViewMode(option.value)}
                                    className={cn(
                                        "flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        viewMode === option.value
                                            ? "bg-primary text-primary-foreground"
                                            : "text-muted-foreground hover:bg-accent"
                                    )}
                                >
                                    <option.icon className="size-4" />
                                    {option.label}
                                </button>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            className={cn(filters.conditions.length > 0 && "border-primary bg-primary/5")}
                            onClick={() => setFilterOpen((current) => !current)}
                        >
                            <ListFilter className="size-4" />
                            Filters
                            {filters.conditions.length > 0 ? (
                                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                                    {filters.conditions.length}
                                </span>
                            ) : null}
                        </Button>
                        <ContextualFormsPanel
                            placement="OPPORTUNITY_CREATE"
                            context={{}}
                            requireModules={["lead", "opportunity"]}
                            triggerLabel="Create Lead + Opportunity"
                            autoOpenSingle
                            onSaved={fetchData}
                        />
                        <CreateOpportunityDialog onSuccess={fetchData} />
                    </div>
                </div>

                <OpportunityStageChips />

                <div className="h-px bg-border" />

                <div className="flex-grow overflow-hidden bg-background px-3 py-2">
                        {loading ? (
                            <TableSkeleton rows={10} columns={4} />
                        ) : fetchError ? (
                            <ErrorState description={fetchError} onRetry={fetchData} />
                        ) : viewMode === 'KANBAN' ? (
                            !selectedType ? (
                                <EmptyState
                                    icon={<KanbanIcon className="size-12 text-muted-foreground opacity-50" />}
                                    title="Select an opportunity type"
                                    description="Kanban boards are type-specific because each type has its own stages."
                                    action={<CreateOpportunityDialog onSuccess={fetchData} />}
                                />
                            ) : kanbanOpportunities.length === 0 ? (
                                <EmptyState
                                    icon={<KanbanIcon className="size-12 text-muted-foreground opacity-50" />}
                                    title="No opportunities found"
                                    description="Create an opportunity to get started."
                                    action={<CreateOpportunityDialog onSuccess={fetchData} />}
                                />
                            ) : (
                                <KanbanBoard
                                    opportunities={kanbanOpportunities}
                                    opportunityType={selectedType!}
                                    onDragEnd={updateOpportunityStage}
                                    onEdit={handleEdit}
                                />
                            )
                        ) : viewMode === 'ANALYTICS' ? (
                            <OpportunityStageAnalytics />
                        ) : (
                            data.length === 0 ? (
                                <EmptyState
                                    icon={<Filter className="size-12 text-muted-foreground opacity-50" />}
                                    title="No opportunities found"
                                    description="Get started by adding your first opportunity."
                                    action={<CreateOpportunityDialog onSuccess={fetchData} />}
                                />
                            ) : (
                                <Card className="overflow-hidden rounded-xl">
                                    <DataTable
                                        storageKey="opportunities-table"
                                        data={kanbanOpportunities}
                                        columns={columns}
                                        getRowId={(row) => row.id}
                                        enableRowSelection
                                        rowSelectionIds={selectedRows}
                                        onRowSelectionIdsChange={(ids) => {
                                            setSelectedRows(ids);
                                            if (isAllSelected) setIsAllSelected(false);
                                        }}
                                        totalItems={totalItems}
                                        isAllSelected={isAllSelected}
                                        onSelectAllFiltered={handleSelectAllFiltered}
                                        onClearSelection={clearSelection}
                                        pageIndex={paginationModel.page}
                                        pageSize={paginationModel.pageSize}
                                        onPaginationChange={({ pageIndex, pageSize }) => setPaginationModel({ page: pageIndex, pageSize })}
                                        emptyState={{
                                            icon: <Filter className="size-10 text-muted-foreground opacity-50" />,
                                            title: "No opportunities found",
                                            description: "Get started by adding your first opportunity.",
                                            action: <CreateOpportunityDialog onSuccess={fetchData} />,
                                        }}
                                    />
                                </Card>
                            )
                        )}
                </div>

                <BulkActionsToolbar
                    selectedCount={Array.isArray(selectedRows) ? selectedRows.length : 0}
                    onClearSelection={clearSelection}
                    module="opportunities"
                    onAssignOwner={() => { setBulkAssignUserId(""); setBulkAssignReason(""); setBulkAssignOpen(true); }}
                    onDelete={() => {
                        if (Array.isArray(selectedRows) && selectedRows.length > 0) {
                            handleDelete(selectedRows.map(id => String(id)));
                        }
                    }}
                />

                <StandardDialog
                    open={bulkAssignOpen}
                    onClose={() => setBulkAssignOpen(false)}
                    title="Reassign selected opportunities"
                    icon={<UserCog className="size-5" />}
                    maxWidth="xs"
                    actions={
                        <>
                            <Button variant="ghost" onClick={() => setBulkAssignOpen(false)}>Cancel</Button>
                            <Button onClick={handleBulkAssign} disabled={!bulkAssignUserId || !bulkAssignReason.trim() || bulkAssignSubmitting}>
                                <UserCog className="size-4" />
                                {bulkAssignSubmitting ? "Reassigning..." : "Reassign"}
                            </Button>
                        </>
                    }
                >
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Reassign {selectedRows.length} selected opportunit{selectedRows.length === 1 ? "y" : "ies"} to another owner.
                        </p>
                        <div className="space-y-2">
                            <Label>New Owner</Label>
                            <Select value={bulkAssignUserId} onValueChange={setBulkAssignUserId}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select a user" />
                                </SelectTrigger>
                                <SelectContent>
                                    {bulkAssignUsers.map((user) => (
                                        <SelectItem key={user.id} value={user.id}>
                                            {user.name || user.email || "User"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Reason</Label>
                            <Textarea
                                placeholder="Why are these opportunities being reassigned?"
                                rows={2}
                                value={bulkAssignReason}
                                onChange={(e) => setBulkAssignReason(e.target.value)}
                            />
                        </div>
                    </div>
                </StandardDialog>

                {opportunityToEdit && (
                    <EditOpportunityDialog
                        open={editOpportunityOpen}
                        onOpenChange={setEditOpportunityOpen}
                        opportunity={opportunityToEdit}
                        onSuccess={(updated) => {
                            fetchData();
                            // Also update local state to avoid full refetch flicker if possible,
                            // but fetchData is safer.
                        }}
                    />
                )}

                <AdvancedFilterDrawer
                    open={filterOpen}
                    onClose={() => setFilterOpen(false)}
                    initialGroups={filterGroups}
                    storageKey="opportunities"
                    previewCount={previewFilterCount}
                    fields={filterFields}
                    onApply={applyFilterGroups}
                />
            </div>
        </FeatureGate>
    );
}
