"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Activity } from "@/types/activities";
import { PaginatedResponse } from "@/types/common";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, ListFilter, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ActivitiesMobileList } from "./activities-mobile-list";
import { CreateActivityDialog } from "./create-activity-dialog";
import { DataTable } from "@/components/ui/data-table";
import { buildActivityColumns } from "./columns";
import { AdvancedFilterDrawer, FilterGroup } from "@/components/filters/advanced-filter-drawer";
import { FilterField } from "@/types/filters";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { QueueExportButton } from "@/components/exports/queue-export-button";
import { BulkActionsToolbar } from "@/components/bulk-actions/bulk-toolbar";

const INITIAL_FILTER_FIELDS: FilterField[] = [
    { key: 'notes', label: 'Description', type: 'text' },
    {
        key: 'typeId',
        label: 'Activity Type',
        type: 'select',
        options: []
    },
    {
        key: 'outcome',
        label: 'Outcome',
        type: 'select',
        options: [
            { label: 'Success', value: 'SUCCESS' },
            { label: 'Follow-up Needed', value: 'FOLLOW_UP_NEEDED' },
            { label: 'No Answer', value: 'NO_ANSWER' },
            { label: 'Voicemail', value: 'VOICEMAIL' },
            { label: 'Not Interested', value: 'NOT_INTERESTED' },
        ]
    },
    { key: 'dueAt', label: 'Due', type: 'date' },
    { key: 'completedAt', label: 'Completed', type: 'date' },
    { key: 'createdAt', label: 'Created', type: 'date' },
];

export default function ActivitiesPage() {
    const [urlFilters, setUrlFilters] = useState("");
    const [data, setData] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterOpen, setFilterOpen] = useState(false);
    const [filterFields, setFilterFields] = useState<FilterField[]>(INITIAL_FILTER_FIELDS);
    const [activityTypeOptions, setActivityTypeOptions] = useState<Array<{ label: string; value: string }>>([]);
    const [selectedActivityTypeId, setSelectedActivityTypeId] = useState("ALL");
    const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
    const [totalItems, setTotalItems] = useState(0);
    const [selectedRows, setSelectedRows] = useState<string[]>([]);
    const [isAllSelected, setIsAllSelected] = useState(false);
    const [filters, setFilters] = useState<FilterGroup[]>([]);

    useEffect(() => {
        apiFetch('/activity-types')
            .then((res) => {
                const typeOptions = res
                    .filter((t: any) => t.isActive)
                    .map((t: any) => ({ label: t.name, value: t.id }));
                setActivityTypeOptions(typeOptions);

                setFilterFields(prev => prev.map(field => {
                    if (field.key === 'typeId') {
                        return { ...field, options: typeOptions };
                    }
                    return field;
                }));
            })
            .catch(() => toast.error('Failed to load activity types'));
    }, []);

    // Gap checklist Module 10's universal advanced filter drawer -- serializes the real,
    // possibly multi-group FilterGroup[] the drawer now produces (upgraded from the single flat
    // {conditions, logic} object this page used before, whose `logic` the backend silently
    // ignored anyway -- see buildGroupedFilterClause, query-filters.ts). The quick activity-type
    // selector is appended as its own extra one-condition group, always ANDed with whatever
    // groups the drawer itself built, matching its previous "always narrows scope" behavior.
    const groupsForQuery = useCallback((): FilterGroup[] => {
        const nonEmpty = filters
            .map((group) => ({ ...group, conditions: group.conditions.filter((condition) => condition.field) }))
            .filter((group) => group.conditions.length > 0);
        if (selectedActivityTypeId !== "ALL") {
            nonEmpty.push({ id: "quick-activity-type", logic: "AND", conditions: [{ id: "quick-activity-type-c", field: "typeId", operator: "equals", value: selectedActivityTypeId }] });
        }
        return nonEmpty;
    }, [filters, selectedActivityTypeId]);

    const buildQueryParams = useCallback(() => {
        const params = new URLSearchParams();
        const groups = groupsForQuery();
        if (groups.length === 0 && urlFilters) {
            params.set("filters", urlFilters);
            return params.toString();
        }
        if (groups.length > 0) params.set("filters", JSON.stringify(groups));
        return params.toString();
    }, [groupsForQuery, urlFilters]);

    // "Query preview/count" -- reuses this page's own /activities endpoint with limit=1.
    const previewFilterCount = useCallback(async (groups: FilterGroup[]) => {
        const nonEmpty = groups
            .map((group) => ({ ...group, conditions: group.conditions.filter((condition) => condition.field) }))
            .filter((group) => group.conditions.length > 0);
        const params = new URLSearchParams({ page: "1", limit: "1" });
        if (nonEmpty.length) params.set("filters", JSON.stringify(nonEmpty));
        const response = await apiFetch<PaginatedResponse<Activity> | Activity[]>(`/activities?${params.toString()}`);
        return "meta" in response ? response.meta.total : Array.isArray(response) ? response.length : 0;
    }, []);

    const [fetchError, setFetchError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const queryString = buildQueryParams();
            const params = new URLSearchParams(queryString);
            params.set("page", String(paginationModel.page + 1));
            params.set("limit", String(paginationModel.pageSize));
            const url = `/activities?${params.toString()}`;
            const response = await apiFetch<PaginatedResponse<Activity> | Activity[]>(url);

            if ('meta' in response && response.data) {
                setData(response.data);
                setTotalItems(response.meta.total);
            } else if (Array.isArray(response)) {
                setData(response);
                setTotalItems(response.length);
            }
        } catch (error) {
            toast.error("Failed to fetch activities");
            setFetchError("Failed to load activities.");
        } finally {
            setLoading(false);
        }
    }, [buildQueryParams, paginationModel.page, paginationModel.pageSize]);

    useEffect(() => {
        setUrlFilters(new URLSearchParams(window.location.search).get("filters") ?? "");
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        setPaginationModel((current) => ({ ...current, page: 0 }));
        setSelectedRows([]);
        setIsAllSelected(false);
    }, [filters, selectedActivityTypeId, urlFilters]);

    const filterConditionCount = useMemo(() => filters.reduce((sum, group) => sum + group.conditions.filter((c) => c.field).length, 0), [filters]);

    const handleSelectAllFiltered = () => {
        setSelectedRows(data.map((activity) => activity.id));
        setIsAllSelected(true);
        toast.success(`All ${totalItems.toLocaleString()} activities selected`);
    };

    const clearSelection = () => {
        setSelectedRows([]);
        setIsAllSelected(false);
    };

    const handleBulkMarkCompleted = async () => {
        const ids = isAllSelected ? data.map((activity) => activity.id) : selectedRows;
        if (ids.length === 0) return;
        try {
            const completedAt = new Date().toISOString();
            await Promise.all(ids.map((id) => apiFetch(`/activities/${id}`, { method: "PATCH", body: JSON.stringify({ completedAt }) })));
            toast.success(`${ids.length} activit${ids.length === 1 ? "y" : "ies"} marked completed`);
            clearSelection();
            fetchData();
        } catch {
            toast.error("Failed to mark activities completed");
        }
    };

    const activityColumns = useMemo(() => buildActivityColumns({ onFormsSaved: fetchData }), [fetchData]);

    return (
        <div className="mx-auto max-w-[1520px] px-3 py-3 md:px-4 md:py-4">
            {/* Header */}
            <div className="mb-3 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-lg font-bold tracking-[-0.5px]">Activities</h1>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Track and manage your sales interactions
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <QueueExportButton
                        moduleName="ACTIVITIES"
                        filters={{
                            ...filters,
                            selectedActivityTypeId: selectedActivityTypeId !== "ALL" ? selectedActivityTypeId : null,
                            urlFilters,
                        }}
                        selectedIds={isAllSelected ? [] : selectedRows}
                        currentPageIds={data.map((activity) => activity.id)}
                        totalItems={totalItems}
                    />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="rounded-[10px] bg-accent" onClick={fetchData}>
                                <RefreshCw className="size-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Refresh</TooltipContent>
                    </Tooltip>
                    <Select value={selectedActivityTypeId} onValueChange={setSelectedActivityTypeId}>
                        <SelectTrigger className="min-w-[190px] rounded-[10px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All activity types</SelectItem>
                            {activityTypeOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        variant="outline"
                        className={cn(
                            "rounded-[10px]",
                            filterConditionCount > 0 && "border-primary bg-primary/5"
                        )}
                        onClick={() => setFilterOpen(true)}
                    >
                        <ListFilter className="size-4" />
                        Filters
                        {filterConditionCount > 0 && (
                            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                                {filterConditionCount}
                            </span>
                        )}
                    </Button>
                    <CreateActivityDialog onSuccess={fetchData} />
                </div>
            </div>

            <AdvancedFilterDrawer
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                initialGroups={filters}
                storageKey="activities"
                previewCount={previewFilterCount}
                fields={filterFields}
                onApply={setFilters}
            />

            {/* Content */}
            {fetchError && !loading ? (
                <ErrorState description={fetchError} onRetry={fetchData} />
            ) : data.length === 0 && !loading ? (
                <EmptyState
                    icon={<CalendarDays className="size-12 text-muted-foreground opacity-50" />}
                    title="No activities found"
                    description="Log an activity or adjust your filters to see results."
                    action={<CreateActivityDialog onSuccess={fetchData} />}
                />
            ) : (
                <>
                    <div className="hidden md:block">
                        <DataTable
                            storageKey="activities-table"
                            data={data}
                            columns={activityColumns}
                            loading={loading}
                            getRowId={(row) => row.id}
                            defaultDensity="comfortable"
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
                                icon: <CalendarDays className="size-10 text-muted-foreground opacity-50" />,
                                title: "No activities found",
                                description: "Log an activity or adjust your filters to see results.",
                                action: <CreateActivityDialog onSuccess={fetchData} />,
                            }}
                        />
                    </div>

                    <div className="mt-4 md:hidden">
                        <ActivitiesMobileList data={data} />
                    </div>
                </>
            )}

            <BulkActionsToolbar
                selectedCount={isAllSelected ? totalItems : selectedRows.length}
                onClearSelection={clearSelection}
                module="activities"
                onMarkCompleted={handleBulkMarkCompleted}
            />
        </div>
    );
}
