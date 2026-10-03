"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, Filter as FilterIcon, MoreHorizontal } from "lucide-react";
import { Activity } from "@/types/activities";
import { PaginatedResponse } from "@/types/common";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/common/list-toolbar";
import { SelectionBar } from "@/components/common/selection-bar";
import { useConfirm } from "@/components/common/dialogs-provider";
import { AdvancedFilterDrawer, FilterGroup } from "@/components/filters/advanced-filter-drawer";
import { FilterField } from "@/types/filters";
import { QueueExportButton } from "@/components/exports/queue-export-button";
import { ContextualFormsPanel } from "@/components/forms/contextual-forms-panel";
import { isAbortError, useAbortableRequest } from "@/hooks/use-abortable-request";
import { useUrlState } from "@/hooks/use-url-state";
import { fetchMatchingIds, plural, runForEach } from "@/lib/bulk-selection";
import { chipsFromGroups, parseGroups } from "@/lib/filter-groups";
import { useRecordsChanged } from "@/lib/records-events";
import { useAuth } from "@/providers/auth-provider";
import { formatWorkspaceDateTime, workspaceDayStart } from "@/lib/date-format";
import { formatCount } from "@/lib/display/format";
import { statusDisplay } from "@/lib/display/status";
import { CreateActivityDialog } from "./create-activity-dialog";
import { ActivityRelated, activityWhen, buildActivityColumns } from "./columns";

const OUTCOMES = ["SUCCESS", "FOLLOW_UP_NEEDED", "NO_ANSWER", "VOICEMAIL", "NOT_INTERESTED"];
const RANGES = ["all", "today", "7d", "30d"] as const;
type Range = (typeof RANGES)[number];
const RANGE_LABEL: Record<Range, string> = { all: "Any time", today: "Today", "7d": "Last 7 days", "30d": "Last 30 days" };
const DEFAULT_HIDDEN = { sla: false };

function rangeStart(range: Range) {
    if (range === "all") return null;
    // From the workspace's midnight, not the browser's.
    return workspaceDayStart({ days: range === "7d" ? -6 : range === "30d" ? -29 : 0 }).toISOString();
}

// Activities (UI/UX plan Phase 2): one toolbar (search notes, time range, type, who, filters
// as chips), compact columns, row click opens the related record's activity, the selection bar.
export default function ActivitiesPage() {
    const router = useRouter();
    const { user } = useAuth();
    const confirm = useConfirm();
    const nextFetchSignal = useAbortableRequest();
    const [search, setSearch] = useUrlState<string>("q", "");
    const [range, setRange] = useUrlState<Range>("range", "all", { allowed: RANGES });
    const [typeId, setTypeId] = useUrlState<string>("type", "all");
    const [who, setWho] = useUrlState<"anyone" | "me">("by", "anyone", { allowed: ["anyone", "me"] as const });
    const [filters, setFilters] = useState<FilterGroup[]>([]);
    const [filterOpen, setFilterOpen] = useState(false);
    const [activityTypes, setActivityTypes] = useState<Array<{ label: string; value: string }>>([]);
    const [data, setData] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
    const [totalItems, setTotalItems] = useState(0);
    const [selectedRows, setSelectedRows] = useState<string[]>([]);
    const [isAllSelected, setIsAllSelected] = useState(false);

    useEffect(() => {
        // A ?filters= link (Smart Views, reports) arrives as chips.
        setFilters(parseGroups(new URLSearchParams(window.location.search).get("filters") ?? ""));
        apiFetch<any[]>("/activity-types")
            .then((rows) => setActivityTypes((Array.isArray(rows) ? rows : []).filter((type) => type.isActive).map((type) => ({ label: type.name, value: type.id }))))
            .catch(() => setActivityTypes([]));
    }, []);

    // The drawer's groups plus the toolbar's own conditions, each its own ANDed group.
    const groupsForQuery = useCallback((): FilterGroup[] => {
        const groups = filters
            .map((group) => ({ ...group, conditions: group.conditions.filter((condition) => condition.field) }))
            .filter((group) => group.conditions.length > 0);
        const extra: any[] = [];
        if (typeId !== "all") extra.push({ id: "type", field: "typeId", operator: "equals", value: typeId });
        // The user's own id, not the "@me" token: the export filter doesn't resolve tokens.
        if (who === "me" && user?.id) extra.push({ id: "by", field: "createdBy", operator: "equals", value: user.id });
        const start = rangeStart(range);
        if (start) extra.push({ id: "range", field: "createdAt", operator: "gte", value: start });
        if (search.trim()) extra.push({ id: "q", field: "notes", operator: "contains", value: search.trim() });
        if (extra.length) groups.push({ id: "toolbar", logic: "AND", conditions: extra });
        return groups;
    }, [filters, typeId, who, range, search, user?.id]);

    const queryParams = useCallback(() => {
        const params = new URLSearchParams();
        const groups = groupsForQuery();
        if (groups.length) params.set("filters", JSON.stringify(groups));
        return params;
    }, [groupsForQuery]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        const signal = nextFetchSignal();
        try {
            const params = queryParams();
            params.set("page", String(paginationModel.page + 1));
            params.set("limit", String(paginationModel.pageSize));
            const response = await apiFetch<PaginatedResponse<Activity>>(`/activities?${params.toString()}`, { signal });
            setData(Array.isArray(response?.data) ? response.data : []);
            setTotalItems(Number(response?.meta?.total ?? 0));
        } catch (error) {
            if (isAbortError(error)) return;
            setFetchError("Activities couldn't be loaded.");
        } finally {
            if (!signal.aborted) setLoading(false);
        }
    }, [queryParams, paginationModel, nextFetchSignal]);
    useEffect(() => { fetchData(); }, [fetchData]);
    // Refetch when the header's Create menu adds something here (no full reload).
    useRecordsChanged(["activity"], fetchData);

    const resetPaging = () => {
        setPaginationModel((current) => ({ ...current, page: 0 }));
        setSelectedRows([]);
        setIsAllSelected(false);
    };
    const applyFilterGroups = (groups: FilterGroup[]) => { setFilters(groups); resetPaging(); };

    const previewFilterCount = useCallback(async (groups: FilterGroup[]) => {
        const nonEmpty = groups
            .map((group) => ({ ...group, conditions: group.conditions.filter((condition) => condition.field) }))
            .filter((group) => group.conditions.length > 0);
        const params = new URLSearchParams({ page: "1", limit: "1" });
        if (nonEmpty.length) params.set("filters", JSON.stringify(nonEmpty));
        const response = await apiFetch<PaginatedResponse<Activity>>(`/activities?${params.toString()}`);
        return Number(response?.meta?.total ?? 0);
    }, []);

    const filterFields = useMemo<FilterField[]>(() => [
        { key: "notes", label: "Notes", type: "text" },
        { key: "typeId", label: "Type", type: "select", options: activityTypes },
        { key: "outcome", label: "Outcome", type: "select", options: OUTCOMES.map((value) => ({ value, label: statusDisplay("outcome", value).label })) },
        { key: "slaStatus", label: "SLA", type: "select", options: ["PENDING", "MET", "BREACHED"].map((value) => ({ value, label: statusDisplay("sla", value).label })) },
        { key: "dueAt", label: "Due", type: "date" },
        { key: "completedAt", label: "Completed", type: "date" },
        { key: "createdAt", label: "Logged", type: "date" },
    ], [activityTypes]);

    const fieldLabels: Record<string, string> = Object.fromEntries(filterFields.map((field) => [field.key, field.label]));
    const chips = chipsFromGroups(filters, applyFilterGroups, {
        field: (field) => fieldLabels[field] ?? field,
        value: (field, value) => {
            if (field === "typeId") return activityTypes.find((type) => type.value === value)?.label ?? "a type";
            if (field === "outcome") return statusDisplay("outcome", value).label;
            if (field === "slaStatus") return statusDisplay("sla", value).label;
            return String(value ?? "");
        },
    });

    const columns = useMemo(() => buildActivityColumns(), []);
    const selectedCount = isAllSelected ? totalItems : selectedRows.length;
    const clearSelection = () => { setSelectedRows([]); setIsAllSelected(false); };

    // "Select all N matching" resolves to exactly the activities the current filters match (B8).
    const handleBulkMarkCompleted = async () => {
        let ids: string[];
        try {
            ids = isAllSelected ? await fetchMatchingIds("/activities", queryParams()) : selectedRows;
        } catch (error: any) {
            toast.error(error?.message || "Couldn't work out which activities are selected");
            return;
        }
        if (ids.length === 0) return;
        if (ids.length > 25) {
            const ok = await confirm({ title: `Mark ${plural(ids.length, "activity", "activities")} completed?`, description: "Each one gets today's date as its completed date.", confirmLabel: "Mark completed" });
            if (!ok) return;
        }
        const completedAt = new Date().toISOString();
        const { succeeded, failed } = await runForEach(ids, (id) => apiFetch(`/activities/${id}`, { method: "PATCH", body: JSON.stringify({ completedAt }) }));
        if (failed) toast.warning(`${plural(succeeded, "activity", "activities")} marked completed; ${failed.toLocaleString()} couldn't be updated`);
        else toast.success(`${plural(succeeded, "activity", "activities")} marked completed`);
        clearSelection();
        fetchData();
    };

    const openRelated = (activity: Activity) => {
        if (activity.opportunityId) router.push(`/dashboard/opportunities/${activity.opportunityId}?tab=activity`);
        else if (activity.leadId) router.push(`/dashboard/leads/${activity.leadId}?tab=activity`);
    };

    const hasNarrowing = chips.length > 0 || !!search.trim() || range !== "all" || typeId !== "all" || who !== "anyone";
    const clearAll = () => { setSearch(""); setRange("all"); setTypeId("all"); setWho("anyone"); applyFilterGroups([]); };

    return (
        <div className="mx-auto min-w-0 max-w-[1520px]">
            <PageHeader
                title="Activities"
                meta={<span className="tabular-nums">{loading ? " " : `${formatCount(totalItems)} ${hasNarrowing ? "matching" : "activities"}`}</span>}
                primaryAction={<CreateActivityDialog onSuccess={fetchData} />}
                secondaryActions={
                    <QueueExportButton
                        moduleName="ACTIVITIES"
                        filters={{ urlFilters: queryParams().get("filters") ?? "" }}
                        selectedIds={isAllSelected ? [] : selectedRows}
                        currentPageIds={data.map((activity) => activity.id)}
                        totalItems={totalItems}
                    />
                }
            />

            <DataTable
                storageKey="activities-table"
                data={data}
                columns={columns}
                defaultColumnVisibility={DEFAULT_HIDDEN}
                loading={loading}
                error={fetchError}
                onRetry={fetchData}
                getRowId={(row) => row.id}
                onRowClick={openRelated}
                enableRowSelection
                rowSelectionIds={selectedRows}
                onRowSelectionIdsChange={(ids) => { setSelectedRows(ids); if (isAllSelected) setIsAllSelected(false); }}
                totalItems={totalItems}
                isAllSelected={isAllSelected}
                onSelectAllFiltered={() => { setSelectedRows(data.map((activity) => activity.id)); setIsAllSelected(true); }}
                onClearSelection={clearSelection}
                pageIndex={paginationModel.page}
                pageSize={paginationModel.pageSize}
                pageSizeOptions={[25, 50, 100]}
                onPaginationChange={({ pageIndex, pageSize }) => setPaginationModel({ page: pageIndex, pageSize })}
                toolbarActions={
                    <ListToolbar
                        search={{ value: search, onChange: (value) => { setSearch(value); resetPaging(); }, placeholder: "Search notes", label: "Search activity notes", inputId: "activities-search" }}
                        quickFilters={RANGES.map((value) => ({ value, label: RANGE_LABEL[value] }))}
                        quickFilter={range}
                        onQuickFilterChange={(value) => { setRange(value as Range); resetPaging(); }}
                        chips={chips}
                        onClearAll={() => applyFilterGroups([])}
                        actions={<>
                            <Select value={typeId} onValueChange={(value) => { setTypeId(value); resetPaging(); }}>
                                <SelectTrigger size="sm" aria-label="Activity type" className="w-40"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All types</SelectItem>
                                    {activityTypes.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Select value={who} onValueChange={(value) => { setWho(value as "anyone" | "me"); resetPaging(); }}>
                                <SelectTrigger size="sm" aria-label="Logged by" className="w-36"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="anyone">Anyone</SelectItem>
                                    <SelectItem value="me">Logged by me</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="outline" size="sm" onClick={() => setFilterOpen(true)}><FilterIcon className="size-4" />Filters{chips.length ? ` (${chips.length})` : ""}</Button>
                        </>}
                    />
                }
                rowActions={(activity) => (
                    <>
                        <ContextualFormsPanel placement="ACTIVITY_DETAIL" context={{ activityId: activity.id, leadId: activity.leadId, opportunityId: activity.opportunityId }} entityData={activity} onSaved={fetchData} />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label="More actions for this activity"><MoreHorizontal className="size-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {activity.leadId ? <DropdownMenuItem asChild><Link href={`/dashboard/leads/${activity.leadId}?tab=activity`}>Open lead</Link></DropdownMenuItem> : null}
                                {activity.opportunityId ? <DropdownMenuItem asChild><Link href={`/dashboard/opportunities/${activity.opportunityId}?tab=activity`}>Open opportunity</Link></DropdownMenuItem> : null}
                                {!activity.completedAt ? (
                                    <DropdownMenuItem onSelect={async () => {
                                        try {
                                            await apiFetch(`/activities/${activity.id}`, { method: "PATCH", body: JSON.stringify({ completedAt: new Date().toISOString() }) });
                                            toast.success("Marked completed");
                                            fetchData();
                                        } catch (error: any) {
                                            toast.error(error?.message || "Couldn't update the activity");
                                        }
                                    }}><CheckCircle2 className="size-4" />Mark completed</DropdownMenuItem>
                                ) : null}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </>
                )}
                mobileCard={(activity) => (
                    <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                            <span className="inline-flex min-w-0 items-center gap-2 font-medium">
                                <span aria-hidden className="size-2 shrink-0 rounded-full bg-muted-foreground" style={(activity.type as any)?.color ? { backgroundColor: (activity.type as any).color } : undefined} />
                                <span className="truncate">{activity.type?.name ?? "Activity"}</span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">{formatWorkspaceDateTime(activityWhen(activity))}</span>
                        </div>
                        {activity.notes ? <p className="line-clamp-2 text-sm">{activity.notes}</p> : null}
                        <div className="text-sm"><ActivityRelated activity={activity} /></div>
                    </div>
                )}
                emptyState={hasNarrowing ? {
                    title: "No activities match", description: "Try another time range, type or filter.", kind: "no-match",
                    action: <Button variant="outline" onClick={clearAll}>Clear search and filters</Button>,
                } : {
                    title: "No activities yet", description: "Calls, meetings and other interactions you log show here.",
                    action: <CreateActivityDialog onSuccess={fetchData} />,
                }}
            />

            <SelectionBar
                count={selectedCount}
                totalMatching={totalItems}
                allMatchingSelected={isAllSelected}
                onSelectAllMatching={() => { setSelectedRows(data.map((activity) => activity.id)); setIsAllSelected(true); }}
                onClear={clearSelection}
                actions={[{ label: "Mark completed", icon: <CheckCircle2 className="size-4" />, onClick: handleBulkMarkCompleted }]}
            />

            <AdvancedFilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)} initialGroups={filters} storageKey="activities" previewCount={previewFilterCount} fields={filterFields} onApply={applyFilterGroups} />
        </div>
    );
}
