'use client';

import { PageHeader } from "@/components/layout/page-header";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Lead } from "@/types/leads";
import { PaginatedResponse } from "@/types/common";
import { apiFetch } from "@/lib/api";
import { ListPlus, UserCog } from "lucide-react";
import { Filter as FilterIconLucide } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StandardDialog } from "@/components/common/standard-dialog";
import { buildLeadColumns } from "./columns";
import { toast } from "sonner";
import Link from "next/link";
import { formatWorkspaceDate } from "@/lib/date-format";
import { CreateLeadDialog } from "./create-lead-dialog";
import { RecordPreview } from "@/components/common/record-preview";
import { LeadsMobileList } from "./mobile-list";
import { ErrorState } from "@/components/common/error-state";
import { isAbortError, useAbortableRequest } from "@/hooks/use-abortable-request";
import { BulkActionsToolbar } from "@/components/bulk-actions/bulk-toolbar";
import { EditLeadDialog } from "./edit-lead-dialog";
import { AdvancedFilterDrawer, FilterGroup } from "@/components/filters/advanced-filter-drawer";
import { FilterConfig } from "@/types/filters";
import { QueueExportButton } from "@/components/exports/queue-export-button";
import { ContextualFormsPanel } from "@/components/forms/contextual-forms-panel";
import { useRegisterShortcut } from "@/lib/keyboard-shortcuts";

const EMPTY_FILTERS: FilterConfig = { conditions: [], logic: "AND" };

// Gap checklist Module 17, item 25 (embedded analytics surfaces: "view-level count chips").
// Deliberately a self-contained, independently-fetched component -- it doesn't touch this
// page's existing pagination/selection/filter state at all, so it can't regress any of that.
function LeadStatusChips() {
    const [counts, setCounts] = useState<Array<{ status: string; count: number }>>([]);

    useEffect(() => {
        apiFetch<Array<{ status: string; count: number }>>("/leads/status-counts")
            .then((data) => setCounts(Array.isArray(data) ? data : []))
            .catch(() => setCounts([]));
    }, []);

    if (!counts.length) return null;
    const total = counts.reduce((sum, row) => sum + Number(row.count ?? 0), 0);

    return (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="rounded-md text-xs font-bold">{total} total</Badge>
            {counts.map((row) => (
                <Badge key={row.status} variant="outline" className="rounded-md text-xs font-normal text-muted-foreground">
                    {row.status}: {row.count}
                </Badge>
            ))}
        </div>
    );
}

// Real bug found and fixed while wiring the shared drawer (gap checklist Module 10's universal
// advanced filter drawer): this used to flatten every group's conditions into ONE list using
// only the FIRST group's logic before serializing, silently discarding any additional group's
// own AND/OR logic -- a user building "group 1 (AND) OR group 2 (AND)" got only group 1's
// conditions ANDed together applied, the rest dropped with no error. Serializing the real,
// non-empty groups array directly (matching how Lists' own AdvancedFilterDrawer usage already
// worked) fixes this; the backend's own LeadFilterInput[] shape already supports true nested
// groups, it was only ever this page's own conversion that lost them.
function groupsToQuery(groups: FilterGroup[]) {
    const nonEmpty = groups
        .map((group) => ({ ...group, conditions: group.conditions.filter((condition) => condition.field) }))
        .filter((group) => group.conditions.length > 0);
    return nonEmpty.length > 0 ? JSON.stringify(nonEmpty) : "";
}

// Kept only for QueueExportButton's own opaque `filters` metadata prop (a flat shape it already
// expects) -- not used for the actual query, which now goes through groupsToQuery above instead.
function groupsToFilterConfig(groups: FilterGroup[]): FilterConfig {
    const firstGroup = groups[0];
    if (!firstGroup) return EMPTY_FILTERS;
    return {
        logic: firstGroup.logic,
        conditions: groups.flatMap((group) =>
            group.conditions
                .filter((condition) => condition.field)
                .map((condition) => ({
                    id: condition.id,
                    field: condition.field,
                    operator: condition.operator as any,
                    value: condition.value,
                }))
        ),
    };
}

export default function LeadsPage() {
    // Gap checklist Module 10's "performance UX polish" item, "request cancellation on
    // tab/filter changes" -- rapidly changing pagination/filters previously fired overlapping
    // fetches with no guard against an older one resolving after (and overwriting) a newer one.
    const nextFetchSignal = useAbortableRequest();
    const [urlFilters, setUrlFilters] = useState("");
    const [data, setData] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalItems, setTotalItems] = useState(0);
    const [paginationModel, setPaginationModel] = useState<{ page: number; pageSize: number }>({
        page: 0,
        pageSize: 10,
    });
    const [isAllSelected, setIsAllSelected] = useState(false);
    const [selectedRows, setSelectedRows] = useState<string[]>([]);
    const [quickViewLeadId, setQuickViewLeadId] = useState<string | null>(null);
    const [editLeadOpen, setEditLeadOpen] = useState(false);
    const [leadToEdit, setLeadToEdit] = useState<Lead | null>(null);
    const [filterOpen, setFilterOpen] = useState(false);
    const [filters, setFilters] = useState<FilterConfig>(EMPTY_FILTERS);
    const [filterGroups, setFilterGroups] = useState<FilterGroup[]>([]);
    const [addToListOpen, setAddToListOpen] = useState(false);
    const [staticLists, setStaticLists] = useState<any[]>([]);
    const [targetListId, setTargetListId] = useState("");
    const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
    const [users, setUsers] = useState<any[]>([]);
    const [bulkAssignUserId, setBulkAssignUserId] = useState("");
    const [bulkAssignReason, setBulkAssignReason] = useState("");
    const [bulkAssignSubmitting, setBulkAssignSubmitting] = useState(false);

    const [fetchError, setFetchError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        const signal = nextFetchSignal();
        try {
            const params = new URLSearchParams();
            params.set('page', (paginationModel.page + 1).toString());
            params.set('limit', paginationModel.pageSize.toString());
            if (urlFilters) params.set("filters", urlFilters);

            const response = await apiFetch<PaginatedResponse<Lead> | Lead[]>(`/leads?${params.toString()}`, { signal });

            if ('meta' in response && response.data) {
                setData(response.data);
                setTotalItems(response.meta.total);
            } else if (Array.isArray(response)) {
                // Fallback for non-paginated endpoints
                setData(response);
                setTotalItems(response.length);
            }
        } catch (error) {
            // A superseded request (the user changed filters/pagination again before this one
            // resolved) -- the newer fetchData call already owns `loading`/state, so this stale
            // one must NOT show an error or touch state at all.
            if (isAbortError(error)) return;
            console.error("Fetch error:", error);
            toast.error("Failed to fetch leads");
            setFetchError("Failed to load leads.");
        } finally {
            // Same reasoning as the catch block above -- a superseded call's own `finally` must
            // not flip `loading` back to false while the newer call it lost to is still in flight.
            if (!signal.aborted) setLoading(false);
        }
    }, [paginationModel, urlFilters, nextFetchSignal]);

    useEffect(() => {
        setUrlFilters(new URLSearchParams(window.location.search).get("filters") ?? "");
    }, []);

    const applyFilterGroups = useCallback((groups: FilterGroup[]) => {
        setFilterGroups(groups);
        setFilters(groupsToFilterConfig(groups));
        setUrlFilters(groupsToQuery(groups));
        setPaginationModel((current) => ({ ...current, page: 0 }));
    }, []);

    // "Query preview/count" -- reuses this same page's own /leads endpoint with limit=1 (no
    // separate count-only endpoint needed) and reads back meta.total, exactly what a real
    // fetchData call would return, just without paying for a full page of rows.
    const previewFilterCount = useCallback(async (groups: FilterGroup[]) => {
        const params = new URLSearchParams({ page: "1", limit: "1" });
        const query = groupsToQuery(groups);
        if (query) params.set("filters", query);
        const response = await apiFetch<PaginatedResponse<Lead> | Lead[]>(`/leads?${params.toString()}`);
        return "meta" in response ? response.meta.total : Array.isArray(response) ? response.length : 0;
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const fetchStaticLists = useCallback(async () => {
        try {
            const lists = await apiFetch<any[]>("/lead-lists");
            const staticOnly = Array.isArray(lists) ? lists.filter((list) => list.type === "STATIC") : [];
            setStaticLists(staticOnly);
            if (!targetListId && staticOnly[0]?.id) {
                setTargetListId(staticOnly[0].id);
            }
        } catch {
            toast.error("Failed to load static lists");
        }
    }, [targetListId]);

    useEffect(() => {
        fetchStaticLists();
    }, [fetchStaticLists]);

    useEffect(() => {
        apiFetch<any[]>("/users").then(setUsers).catch(() => undefined);
    }, []);

    const handleEdit = (lead: Lead) => {
        setLeadToEdit(lead);
        setEditLeadOpen(true);
    };

    const handleStatusChange = async (lead: Lead, status: string) => {
        await apiFetch(`/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ name: lead.name, status }) });
        setData((prev) => prev.map((item) => (item.id === lead.id ? { ...item, status } : item)));
        toast.success("Status updated");
    };

    const columns = useMemo(
        () =>
            buildLeadColumns({
                onQuickView: (leadId) => setQuickViewLeadId(leadId),
                onEdit: handleEdit,
                onStatusChange: handleStatusChange,
            }),
        []
    );


    const handleSelectAllFiltered = () => {
        const visibleLeadIds = data.map((lead) => lead.id);
        setSelectedRows(visibleLeadIds);
        setIsAllSelected(true);
        toast.success(`${totalItems} leads selected`);
    };

    const clearSelection = () => {
        setSelectedRows([]);
        setIsAllSelected(false);
    };

    // Gap checklist Module 10's keyboard shortcut system, "refresh" and "bulk select" sub-items
    // -- wired onto Leads as the concrete, representative example (this app's highest-traffic
    // list page), not a sweep across every module's own list page.
    useRegisterShortcut({
        id: "leads-refresh",
        combo: { key: "r" },
        description: "Refresh this list",
        group: "Leads",
        handler: () => fetchData(),
    });
    useRegisterShortcut({
        id: "leads-select-all",
        combo: { key: "a" },
        description: "Select all leads on this page",
        group: "Leads",
        handler: () => handleSelectAllFiltered(),
    });

    const handleDelete = async () => {
        const count = isAllSelected ? totalItems : selectedRows.length;
        if (!confirm(`Are you sure you want to delete ${count} leads?`)) return;

        try {
            await apiFetch('/leads/bulk', {
                method: 'DELETE',
                body: JSON.stringify({
                    ids: isAllSelected ? [] : selectedRows,
                    all: isAllSelected,
                })
            });

            toast.success('Leads deleted');
            fetchData();
            clearSelection();
        } catch (e) {
            toast.error('Failed to delete leads');
        }
    };

    const getSelectedLeadIdsForAction = async () => {
        if (!isAllSelected) return selectedRows.map(String);
        const response = await apiFetch<PaginatedResponse<Lead> | Lead[]>("/leads?page=1&limit=5000");
        const leads = Array.isArray(response) ? response : response.data ?? [];
        return leads.map((lead) => lead.id);
    };

    const handleAddToList = async () => {
        if (!targetListId) {
            toast.error("Select a static list");
            return;
        }
        try {
            const leadIds = await getSelectedLeadIdsForAction();
            if (leadIds.length === 0) {
                toast.error("Select at least one lead");
                return;
            }
            await apiFetch(`/lead-lists/${targetListId}/members`, {
                method: "POST",
                body: JSON.stringify({ leadIds }),
            });
            toast.success(`${leadIds.length} lead${leadIds.length === 1 ? "" : "s"} added to list`);
            setAddToListOpen(false);
            clearSelection();
            fetchStaticLists();
        } catch {
            toast.error("Failed to add leads to list");
        }
    };

    const handleBulkAssign = async () => {
        if (!bulkAssignUserId || !bulkAssignReason.trim()) {
            toast.error("Select a user and enter a reason");
            return;
        }
        setBulkAssignSubmitting(true);
        try {
            const leadIds = await getSelectedLeadIdsForAction();
            if (leadIds.length === 0) {
                toast.error("Select at least one lead");
                return;
            }
            const outcome = await apiFetch<{ reassigned: number; failed: number; pendingApproval: number }>("/assignment/reassign/bulk", {
                method: "POST",
                body: JSON.stringify({ entityType: "LEAD", entityIds: leadIds, newOwnerId: bulkAssignUserId, reason: bulkAssignReason.trim() }),
            });
            toast.success(
                `${outcome.reassigned} lead${outcome.reassigned === 1 ? "" : "s"} reassigned` +
                (outcome.pendingApproval ? `, ${outcome.pendingApproval} submitted for approval` : "") +
                (outcome.failed ? `, ${outcome.failed} failed` : ""),
            );
            setBulkAssignOpen(false);
            clearSelection();
            fetchData();
        } catch {
            toast.error("Failed to reassign leads");
        } finally {
            setBulkAssignSubmitting(false);
        }
    };

    return (
        <div className="flex h-full w-full flex-col">
            <PageHeader title="Leads" description="Manage and track your sales prospects" actions={<>

                    <QueueExportButton
                        moduleName="LEADS"
                        filters={{ ...filters, urlFilters }}
                        selectedIds={isAllSelected ? [] : selectedRows}
                        currentPageIds={data.map((lead) => lead.id)}
                        totalItems={totalItems}
                    />
                    <Button
                        variant="outline"
                        onClick={() => setFilterOpen(true)}
                    >
                        <FilterIconLucide className="size-4" />
                        Filters
                    </Button>
                    <ContextualFormsPanel
                        placement="LEAD_CREATE"
                        context={{}}
                        requireModules={["lead", "opportunity"]}
                        triggerLabel="Create Lead + Opportunity"
                        autoOpenSingle
                        onSaved={fetchData}
                    />
                    <CreateLeadDialog onSuccess={fetchData} />
                            </>} />

            <LeadStatusChips />

            <AdvancedFilterDrawer
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                initialGroups={filterGroups}
                storageKey="leads"
                previewCount={previewFilterCount}
                fields={[
                    { label: 'Name', key: 'name', type: 'text' },
                    { label: 'Email', key: 'email', type: 'text' },
                    {
                        label: 'Status', key: 'status', type: 'select', options: [
                            { label: 'New', value: 'NEW' },
                            { label: 'Qualified', value: 'QUALIFIED' },
                            { label: 'Contacted', value: 'CONTACTED' },
                            { label: 'Lost', value: 'LOST' },
                            { label: 'Converted', value: 'CONVERTED' }
                        ]
                    },
                    { label: 'Source', key: 'source', type: 'text' },
                    { label: 'Owner', key: 'ownerId', type: 'user', options: users.map((u) => ({ label: u.name || u.email, value: u.id })) },
                    { label: 'Created', key: 'createdAt', type: 'date' },
                    { label: 'Tags', key: 'tags', type: 'tags' },
                    {
                        label: 'Score Band', key: 'predictiveScoreBand', type: 'select', options: [
                            { label: 'Hot', value: 'HOT' },
                            { label: 'Warm', value: 'WARM' },
                            { label: 'Cold', value: 'COLD' },
                            { label: 'Risk', value: 'RISK' },
                        ]
                    },
                    { label: 'Score Confidence', key: 'predictiveConfidence', type: 'number' },
                    { label: 'Conversion Probability', key: 'predictiveConversionProbability', type: 'number' },
                    { label: 'Stall Risk', key: 'predictiveStallRisk', type: 'number' },
                ]}
                onApply={applyFilterGroups}
            />

            <div className="hidden md:block">
                <Card className="flex flex-grow flex-col overflow-hidden rounded-[14px] bg-surface-container-low">
                    <div className="min-w-0">
                        <div className="min-w-0">
                            <DataTable
                                storageKey="leads-table"
                                data={data}
                                columns={columns}
                                loading={loading}
                                error={fetchError}
                                onRetry={fetchData}
                                getRowId={(row) => row.id}
                                onRowClick={(row) => setQuickViewLeadId(row.id)}
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
                                    icon: <FilterIconLucide className="size-10 text-muted-foreground opacity-50" />,
                                    title: "No leads found",
                                    description: "Get started by adding your first lead.",
                                    action: <CreateLeadDialog onSuccess={fetchData} />,
                                }}
                            />
                        </div>
                    </div>
                </Card>
            </div>

            {/* Gap checklist Module 10's "mobile responsive pass" item -- this component already
                existed (LeadsMobileList) but was never wired in anywhere, so Leads had no real
                mobile fallback despite one being built; matches the exact hidden md:block /
                md:hidden split Activities already uses. */}
            <div className="mt-4 md:hidden">
                {fetchError && !loading ? (
                    <ErrorState description={fetchError} onRetry={fetchData} />
                ) : (
                    <LeadsMobileList data={data} />
                )}
            </div>

            <BulkActionsToolbar
                selectedCount={isAllSelected ? totalItems : selectedRows.length}
                onClearSelection={clearSelection}
                module="leads"
                onAddToList={() => setAddToListOpen(true)}
                onAssignOwner={() => { setBulkAssignUserId(""); setBulkAssignReason(""); setBulkAssignOpen(true); }}
                onDelete={handleDelete}
            />

            <StandardDialog
                open={addToListOpen}
                onClose={() => setAddToListOpen(false)}
                title="Add selected leads to list"
                icon={<ListPlus className="size-5" />}
                maxWidth="xs"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setAddToListOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddToList} disabled={!targetListId}>
                            <ListPlus className="size-4" />
                            Add To List
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Add {isAllSelected ? totalItems : selectedRows.length} selected lead{(isAllSelected ? totalItems : selectedRows.length) === 1 ? "" : "s"} to a static list.
                    </p>
                    <div className="space-y-2">
                        <Label>Static List</Label>
                        <Select value={targetListId} onValueChange={setTargetListId}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {staticLists.map((list) => (
                                    <SelectItem key={list.id} value={list.id}>
                                        {list.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {staticLists.length === 0 ? (
                        <p className="text-xs text-destructive">
                            Create a static list first from Lists.
                        </p>
                    ) : null}
                </div>
            </StandardDialog>

            <StandardDialog
                open={bulkAssignOpen}
                onClose={() => setBulkAssignOpen(false)}
                title="Reassign selected leads"
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
                        Reassign {isAllSelected ? totalItems : selectedRows.length} selected lead{(isAllSelected ? totalItems : selectedRows.length) === 1 ? "" : "s"} to another owner.
                    </p>
                    <div className="space-y-2">
                        <Label>New Owner</Label>
                        <Select value={bulkAssignUserId} onValueChange={setBulkAssignUserId}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select a user" />
                            </SelectTrigger>
                            <SelectContent>
                                {users.map((user) => (
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
                            placeholder="Why are these leads being reassigned?"
                            rows={2}
                            value={bulkAssignReason}
                            onChange={(e) => setBulkAssignReason(e.target.value)}
                        />
                    </div>
                </div>
            </StandardDialog>

            <RecordPreview
                entityType="lead"
                entityId={quickViewLeadId}
                isOpen={!!quickViewLeadId}
                onClose={() => setQuickViewLeadId(null)}
            />

            {leadToEdit && (
                <EditLeadDialog
                    open={editLeadOpen}
                    onOpenChange={setEditLeadOpen}
                    lead={leadToEdit}
                    onSuccess={fetchData}
                />
            )}
        </div>
    );
}
