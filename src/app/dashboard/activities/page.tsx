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
import { FilterBuilder } from "@/components/filters/filter-builder";
import { FilterConfig, FilterField } from "@/types/filters";
import { EmptyState } from "@/components/common/empty-state";
import { QueueExportButton } from "@/components/exports/queue-export-button";

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
    const [filters, setFilters] = useState<FilterConfig>({
        conditions: [],
        logic: 'AND',
    });

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

    const buildQueryParams = useCallback(() => {
        const params = new URLSearchParams();
        if (urlFilters && filters.conditions.length === 0 && selectedActivityTypeId === "ALL") {
            params.set("filters", urlFilters);
            return params.toString();
        }
        const conditions = [...filters.conditions];
        if (selectedActivityTypeId !== "ALL") {
            conditions.push({ id: "quick-activity-type", field: "typeId", operator: "equals", value: selectedActivityTypeId });
        }
        if (conditions.length > 0) {
            params.set('filters', JSON.stringify({ ...filters, conditions }));
        }
        return params.toString();
    }, [filters, selectedActivityTypeId, urlFilters]);

    const fetchData = useCallback(async () => {
        setLoading(true);
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

    const handleSelectAllFiltered = () => {
        setSelectedRows(data.map((activity) => activity.id));
        setIsAllSelected(true);
        toast.success(`All ${totalItems.toLocaleString()} activities selected`);
    };

    const clearSelection = () => {
        setSelectedRows([]);
        setIsAllSelected(false);
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
                            filters.conditions.length > 0 && "border-primary bg-primary/5"
                        )}
                        onClick={() => setFilterOpen(!filterOpen)}
                    >
                        <ListFilter className="size-4" />
                        Filters
                        {filters.conditions.length > 0 && (
                            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                                {filters.conditions.length}
                            </span>
                        )}
                    </Button>
                    <CreateActivityDialog onSuccess={fetchData} />
                </div>
            </div>

            {/* Filter Builder */}
            {filterOpen && (
                <div className="mb-3 rounded-xl border bg-primary/[0.02] p-3">
                    <FilterBuilder
                        fields={filterFields}
                        value={filters}
                        onChange={setFilters}
                    />
                </div>
            )}

            {/* Content */}
            {data.length === 0 && !loading ? (
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
        </div>
    );
}
