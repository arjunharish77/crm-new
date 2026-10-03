'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, Filter as FilterIcon, ListPlus, MoreHorizontal, Pencil, Phone, Tag, Trash2, UserCog } from "lucide-react";
import { Lead } from "@/types/leads";
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
import { StandardDialog } from "@/components/common/standard-dialog";
import { RecordPreview } from "@/components/common/record-preview";
import { RecordPicker } from "@/components/common/record-picker";
import { ListToolbar } from "@/components/common/list-toolbar";
import { SelectionBar } from "@/components/common/selection-bar";
import { useConfirm } from "@/components/common/dialogs-provider";
import { LeadStatusBadge, LeadStatusSelect } from "@/components/leads/lead-status";
import { AdvancedFilterDrawer, FilterGroup } from "@/components/filters/advanced-filter-drawer";
import { FilterConfig } from "@/types/filters";
import { chipsFromGroups, EMPTY_FILTERS, groupsToFilterConfig, groupsToQuery, parseGroups } from "@/lib/filter-groups";
import { QueueExportButton } from "@/components/exports/queue-export-button";
import { ContextualFormsPanel } from "@/components/forms/contextual-forms-panel";
import { isAbortError, useAbortableRequest } from "@/hooks/use-abortable-request";
import { useUrlState } from "@/hooks/use-url-state";
import { useLeadStatuses } from "@/hooks/use-lead-statuses";
import { useRegisterShortcut } from "@/lib/keyboard-shortcuts";
import { fetchMatchingIds, plural, reassignOwnersInBatches, showBulkResult } from "@/lib/bulk-selection";
import { formatCount } from "@/lib/display/format";
import { formatWorkspaceRelativeTime } from "@/lib/date-format";
import { useRecordsChanged } from "@/lib/records-events";
import { CreateLeadDialog } from "./create-lead-dialog";
import { EditLeadDialog } from "./edit-lead-dialog";
import { buildLeadColumns, LEAD_DEFAULT_HIDDEN } from "./columns";

const CATEGORY_VIEWS = ["all", "OPEN", "CONVERTED", "LOST"] as const;
type CategoryView = (typeof CATEGORY_VIEWS)[number];
const SORTABLE = ["name", "status", "owner", "lastActivityAt", "score", "source", "createdAt"];

// Leads list (UI/UX plan Phase 2, decisions 5, 6, 21): one-row toolbar with search and quick
// views by status category, 25 rows, the agreed default columns, row click opens the lead,
// and a selection bar with status, owner, list and delete actions.
export default function LeadsPage() {
    const router = useRouter();
    const confirm = useConfirm();
    const nextFetchSignal = useAbortableRequest();
    const { statuses, display } = useLeadStatuses();

    const [search, setSearch] = useUrlState<string>("q", "");
    const [categoryView, setCategoryView] = useUrlState<CategoryView>("view", "all", { allowed: CATEGORY_VIEWS });
    const [sortParam, setSortParam] = useUrlState<string>("sort", "");
    const sort = useMemo(() => {
        const id = sortParam.replace(/^-/, "");
        return SORTABLE.includes(id) ? { id, desc: sortParam.startsWith("-") } : null;
    }, [sortParam]);

    const [urlFilters, setUrlFilters] = useState("");
    const [filterGroups, setFilterGroups] = useState<FilterGroup[]>([]);
    const [filters, setFilters] = useState<FilterConfig>(EMPTY_FILTERS);
    const [data, setData] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [totalItems, setTotalItems] = useState(0);
    const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
    const [statusCounts, setStatusCounts] = useState<Array<{ status: string; count: number }>>([]);

    const [isAllSelected, setIsAllSelected] = useState(false);
    const [selectedRows, setSelectedRows] = useState<string[]>([]);
    const [quickViewLeadId, setQuickViewLeadId] = useState<string | null>(null);
    const [leadToEdit, setLeadToEdit] = useState<Lead | null>(null);
    const [filterOpen, setFilterOpen] = useState(false);
    const [users, setUsers] = useState<any[]>([]);

    const [addToListOpen, setAddToListOpen] = useState(false);
    const [staticLists, setStaticLists] = useState<any[]>([]);
    const [targetListId, setTargetListId] = useState("");
    const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
    const [bulkAssignUserId, setBulkAssignUserId] = useState<string | null>(null);
    const [bulkAssignReason, setBulkAssignReason] = useState("");
    const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
    const [bulkStatus, setBulkStatus] = useState("");
    const [bulkBusy, setBulkBusy] = useState(false);

    useEffect(() => {
        const raw = new URLSearchParams(window.location.search).get("filters") ?? "";
        setUrlFilters(raw);
        const groups = parseGroups(raw);
        setFilterGroups(groups);
        setFilters(groupsToFilterConfig(groups));
    }, []);

    // The quick view (All / Open / Converted / Lost) is one more filter group on top of the drawer's.
    const effectiveFilters = useMemo(() => {
        const groups = parseGroups(urlFilters);
        if (categoryView !== "all") groups.push({ id: "category", logic: "AND", conditions: [{ id: "category", field: "statusCategory", operator: "equals", value: categoryView } as any] });
        return groups.length ? JSON.stringify(groups) : "";
    }, [urlFilters, categoryView]);

    const listParams = useCallback((extra: Record<string, string> = {}) => {
        const params = new URLSearchParams(extra);
        if (effectiveFilters) params.set("filters", effectiveFilters);
        if (search.trim()) params.set("q", search.trim());
        return params;
    }, [effectiveFilters, search]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        const signal = nextFetchSignal();
        try {
            const params = listParams({ page: String(paginationModel.page + 1), limit: String(paginationModel.pageSize) });
            if (sort) { params.set("sort", sort.id); params.set("dir", sort.desc ? "desc" : "asc"); }
            const response = await apiFetch<PaginatedResponse<Lead> | Lead[]>(`/leads?${params.toString()}`, { signal });
            if ('meta' in response && response.data) {
                setData(response.data);
                setTotalItems(response.meta.total);
            } else if (Array.isArray(response)) {
                setData(response);
                setTotalItems(response.length);
            }
        } catch (error) {
            // A superseded request: the newer call owns loading and state.
            if (isAbortError(error)) return;
            setFetchError("Leads couldn't be loaded.");
        } finally {
            if (!signal.aborted) setLoading(false);
        }
    }, [listParams, paginationModel, sort, nextFetchSignal]);
    useEffect(() => { fetchData(); }, [fetchData]);
    // Refetch when the header's Create menu adds a lead (no full reload).
    useRecordsChanged(["lead"], fetchData);

    const fetchCounts = useCallback(() => {
        apiFetch<Array<{ status: string; count: number }>>("/leads/status-counts")
            .then((rows) => setStatusCounts(Array.isArray(rows) ? rows : []))
            .catch(() => setStatusCounts([]));
    }, []);
    useEffect(() => { fetchCounts(); }, [fetchCounts]);

    useEffect(() => {
        apiFetch<any[]>("/users").then((rows) => setUsers(Array.isArray(rows) ? rows : [])).catch(() => undefined);
        apiFetch<any[]>("/lead-lists").then((lists) => {
            const staticOnly = Array.isArray(lists) ? lists.filter((list) => list.type === "STATIC") : [];
            setStaticLists(staticOnly);
            if (staticOnly[0]?.id) setTargetListId((current) => current || staticOnly[0].id);
        }).catch(() => undefined);
    }, []);

    // Any change to what's listed starts at page 1 and clears the selection.
    const resetPaging = () => {
        setPaginationModel((current) => ({ ...current, page: 0 }));
        setSelectedRows([]);
        setIsAllSelected(false);
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
        const query = groupsToQuery(groups);
        if (query) params.set("filters", query);
        const response = await apiFetch<PaginatedResponse<Lead> | Lead[]>(`/leads?${params.toString()}`);
        return "meta" in response ? response.meta.total : Array.isArray(response) ? response.length : 0;
    }, []);

    const categoryCounts = useMemo(() => {
        const totals = { all: 0, OPEN: 0, CONVERTED: 0, LOST: 0 } as Record<CategoryView, number>;
        for (const row of statusCounts) {
            totals.all += Number(row.count ?? 0);
            totals[display(row.status).category] += Number(row.count ?? 0);
        }
        return totals;
    }, [statusCounts, display]);

    const handleStatusChange = async (lead: Lead, status: string) => {
        try {
            await apiFetch(`/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
        } catch (error: any) {
            toast.error(error?.message || "Couldn't change the status");
            throw error;
        }
        const previous = lead.status;
        setData((current) => current.map((item) => (item.id === lead.id ? { ...item, status } : item)));
        fetchCounts();
        toast.success(`${lead.name}: ${display(status).label}`, {
            duration: 6000,
            action: {
                label: "Undo",
                onClick: async () => {
                    try {
                        await apiFetch(`/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ status: previous }) });
                        setData((current) => current.map((item) => (item.id === lead.id ? { ...item, status: previous } : item)));
                        fetchCounts();
                    } catch {
                        toast.error("Couldn't undo");
                    }
                },
            },
        });
    };

    // The columns are rebuilt only when the status list changes; the status menu calls the
    // latest handler through this ref, so it refreshes the counts for the current filters.
    const statusChangeRef = useRef(handleStatusChange);
    useEffect(() => { statusChangeRef.current = handleStatusChange; });
    const columns = useMemo(() => buildLeadColumns({ onStatusChange: (lead, status) => statusChangeRef.current(lead, status) }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [display]);

    const handleSelectAllFiltered = () => {
        setSelectedRows(data.map((lead) => lead.id));
        setIsAllSelected(true);
    };
    const clearSelection = () => {
        setSelectedRows([]);
        setIsAllSelected(false);
    };
    const selectedCount = isAllSelected ? totalItems : selectedRows.length;

    useRegisterShortcut({ id: "leads-refresh", combo: { key: "r" }, description: "Refresh this list", group: "Leads", handler: () => fetchData() });
    useRegisterShortcut({ id: "leads-select-all", combo: { key: "a" }, description: "Select all matching leads", group: "Leads", handler: () => handleSelectAllFiltered() });
    useRegisterShortcut({ id: "leads-search", combo: { key: "/" }, description: "Search leads", group: "Leads", handler: () => document.getElementById("leads-search")?.focus() });

    // "Select all N matching" resolves to exactly the leads the current search, view and filters match.
    const getSelectedLeadIds = async () => {
        if (!isAllSelected) return selectedRows.map(String);
        return fetchMatchingIds("/leads", listParams());
    };
    const withSelection = async (run: (ids: string[]) => Promise<void>) => {
        let ids: string[];
        try {
            ids = await getSelectedLeadIds();
        } catch (error: any) {
            toast.error(error?.message || "Couldn't work out which leads are selected");
            return;
        }
        if (!ids.length) return;
        await run(ids);
    };

    const handleDelete = () => withSelection(async (ids) => {
        const ok = await confirm({
            title: `Delete ${plural(ids.length, "lead", "leads")}?`,
            description: "Their activities, tasks and history are removed with them. This can't be undone.",
            confirmLabel: `Delete ${plural(ids.length, "lead", "leads")}`,
            destructive: true,
            typedConfirmation: ids.length > 25 ? `DELETE ${ids.length}` : undefined,
        });
        if (!ok) return;
        try {
            const result = await apiFetch<{ deleted?: number }>('/leads/bulk', { method: 'DELETE', body: JSON.stringify({ ids }) });
            const deleted = Number(result?.deleted ?? ids.length);
            if (deleted < ids.length) toast.warning(`${plural(deleted, "lead", "leads")} deleted; ${(ids.length - deleted).toLocaleString()} couldn't be deleted`);
            else toast.success(`${plural(deleted, "lead", "leads")} deleted`);
            clearSelection();
            fetchData();
            fetchCounts();
        } catch {
            toast.error("Couldn't delete the leads");
        }
    });

    const handleAddToList = () => withSelection(async (leadIds) => {
        if (!targetListId) { toast.error("Choose a list"); return; }
        setBulkBusy(true);
        try {
            await apiFetch(`/lead-lists/${targetListId}/members`, { method: "POST", body: JSON.stringify({ leadIds }) });
            const list = staticLists.find((item) => item.id === targetListId);
            toast.success(`${plural(leadIds.length, "lead", "leads")} added to ${list?.name ?? "the list"}`);
            setAddToListOpen(false);
            clearSelection();
        } catch {
            toast.error("Couldn't add the leads to the list");
        } finally {
            setBulkBusy(false);
        }
    });

    // Decision 17: a reason is required for bulk reassignment.
    const handleBulkAssign = () => withSelection(async (leadIds) => {
        if (!bulkAssignUserId || !bulkAssignReason.trim()) return;
        setBulkBusy(true);
        try {
            const outcome = await reassignOwnersInBatches("LEAD", leadIds, bulkAssignUserId, bulkAssignReason.trim());
            const message = `${plural(outcome.reassigned, "lead", "leads")} reassigned` +
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

    const handleBulkStatus = () => withSelection(async (ids) => {
        if (!bulkStatus) return;
        if (ids.length > 1000) { toast.error("At most 1,000 leads can be changed at once. Narrow the selection."); return; }
        setBulkBusy(true);
        try {
            const result = await apiFetch<{ updated: number; failed: Array<{ id: string; reason: string }> }>("/leads/bulk/status", { method: "POST", body: JSON.stringify({ ids, status: bulkStatus }) });
            const names = new Map(data.map((lead) => [lead.id, lead.name]));
            showBulkResult({
                done: `set to ${display(bulkStatus).label}`,
                succeeded: result.updated,
                noun: ["lead", "leads"],
                failures: result.failed.map((failure) => ({ label: names.get(failure.id) ?? "A lead", reason: failure.reason })),
            });
            setBulkStatusOpen(false);
            clearSelection();
            fetchData();
            fetchCounts();
        } catch (error: any) {
            toast.error(error?.message || "Couldn't change the statuses");
        } finally {
            setBulkBusy(false);
        }
    });

    const fieldLabels: Record<string, string> = { name: "Name", email: "Email", phone: "Phone", status: "Status", statusCategory: "Status type", source: "Source", ownerId: "Owner", createdAt: "Created", tags: "Tags", company: "Company", predictiveScoreBand: "Score band", predictiveConfidence: "Score confidence", predictiveConversionProbability: "Likelihood", predictiveStallRisk: "Stall risk" };
    const chips = chipsFromGroups(filterGroups, applyFilterGroups, {
        field: (field) => fieldLabels[field] ?? field,
        value: (field, value) => field === "status" ? display(value).label : field === "ownerId" ? users.find((user) => user.id === value)?.name ?? "a user" : String(value ?? ""),
    });
    const activeFilterCount = chips.length;

    const hasNarrowing = !!search.trim() || categoryView !== "all" || activeFilterCount > 0;

    return (
        <div className="flex h-full w-full flex-col">
            <PageHeader
                title="Leads"
                meta={<span className="tabular-nums">{formatCount(categoryCounts.all)} leads</span>}
                primaryAction={<CreateLeadDialog onSuccess={() => { fetchData(); fetchCounts(); }} />}
                secondaryActions={<>
                    <QueueExportButton
                        moduleName="LEADS"
                        filters={{ ...filters, urlFilters: effectiveFilters }}
                        selectedIds={isAllSelected ? [] : selectedRows}
                        currentPageIds={data.map((lead) => lead.id)}
                        totalItems={totalItems}
                    />
                    <ContextualFormsPanel
                        placement="LEAD_CREATE"
                        context={{}}
                        requireModules={["lead", "opportunity"]}
                        triggerLabel="Lead + opportunity"
                        autoOpenSingle
                        onSaved={fetchData}
                    />
                </>}
            />

            <AdvancedFilterDrawer
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                initialGroups={filterGroups}
                storageKey="leads"
                previewCount={previewFilterCount}
                fields={[
                    { label: 'Name', key: 'name', type: 'text' },
                    { label: 'Email', key: 'email', type: 'text' },
                    { label: 'Phone', key: 'phone', type: 'text' },
                    { label: 'Company', key: 'company', type: 'text' },
                    { label: 'Status', key: 'status', type: 'select', options: statuses.map((status) => ({ label: status.label, value: status.key })) },
                    { label: 'Status type', key: 'statusCategory', type: 'select', options: [{ label: 'Open', value: 'OPEN' }, { label: 'Converted', value: 'CONVERTED' }, { label: 'Lost', value: 'LOST' }] },
                    { label: 'Source', key: 'source', type: 'text' },
                    { label: 'Owner', key: 'ownerId', type: 'user', options: users.map((u) => ({ label: u.name || u.email, value: u.id })) },
                    { label: 'Created', key: 'createdAt', type: 'date' },
                    { label: 'Tags', key: 'tags', type: 'tags' },
                    { label: 'Score band', key: 'predictiveScoreBand', type: 'select', options: [{ label: 'Hot', value: 'HOT' }, { label: 'Warm', value: 'WARM' }, { label: 'Cold', value: 'COLD' }, { label: 'At risk', value: 'RISK' }] },
                    { label: 'Score confidence', key: 'predictiveConfidence', type: 'number' },
                    { label: 'Likelihood to convert', key: 'predictiveConversionProbability', type: 'number' },
                    { label: 'Stall risk', key: 'predictiveStallRisk', type: 'number' },
                ]}
                onApply={applyFilterGroups}
            />

            <DataTable
                storageKey="leads-table"
                data={data}
                columns={columns}
                defaultColumnVisibility={LEAD_DEFAULT_HIDDEN}
                loading={loading}
                error={fetchError}
                onRetry={fetchData}
                getRowId={(row) => row.id}
                onRowClick={(row) => router.push(`/dashboard/leads/${row.id}`)}
                sort={sort}
                onSortChange={(next) => { setSortParam(next ? `${next.desc ? "-" : ""}${next.id}` : ""); resetPaging(); }}
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
                pageSizeOptions={[25, 50, 100]}
                onPaginationChange={({ pageIndex, pageSize }) => setPaginationModel({ page: pageIndex, pageSize })}
                toolbarActions={
                    <ListToolbar
                        search={{ value: search, onChange: (value) => { setSearch(value); resetPaging(); }, placeholder: "Search name, email, phone, company", label: "Search leads", inputId: "leads-search" }}
                        quickFilters={[
                            { value: "all", label: "All", count: categoryCounts.all },
                            { value: "OPEN", label: "Open", count: categoryCounts.OPEN },
                            { value: "CONVERTED", label: "Converted", count: categoryCounts.CONVERTED },
                            { value: "LOST", label: "Lost", count: categoryCounts.LOST },
                        ]}
                        quickFilter={categoryView}
                        onQuickFilterChange={(value) => { setCategoryView(value as CategoryView); resetPaging(); }}
                        chips={chips}
                        onClearAll={() => applyFilterGroups([])}
                        actions={<Button variant="outline" size="sm" onClick={() => setFilterOpen(true)}><FilterIcon className="size-4" />Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}</Button>}
                    />
                }
                rowActions={(lead) => (
                    <>
                        <IconButton label={`Preview ${lead.name}`} onClick={() => setQuickViewLeadId(lead.id)}><Eye className="size-4" /></IconButton>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${lead.name}`}><MoreHorizontal className="size-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => setLeadToEdit(lead)}><Pencil className="size-4" />Edit</DropdownMenuItem>
                                {lead.phone ? <DropdownMenuItem asChild><a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}><Phone className="size-4" />Call</a></DropdownMenuItem> : null}
                                <DropdownMenuItem asChild><Link href={`/dashboard/tasks?create=1&leadId=${lead.id}`}><ListPlus className="size-4" />Add task</Link></DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </>
                )}
                mobileCard={(lead) => (
                    <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 truncate font-medium">{lead.name}</span>
                            <LeadStatusBadge value={lead.status} />
                        </div>
                        <div className="truncate text-sm text-muted-foreground">{[lead.company, lead.phone].filter(Boolean).join(" · ") || lead.email}</div>
                        <div className="text-xs text-muted-foreground">
                            {lead.ownerName ?? "Unassigned"}{lead.lastActivityAt ? ` · ${formatWorkspaceRelativeTime(lead.lastActivityAt)}` : ""}
                        </div>
                    </div>
                )}
                emptyState={hasNarrowing ? {
                    title: "No leads match",
                    description: "Try another search, view or filter.",
                    kind: "no-match",
                    action: <Button variant="outline" onClick={() => { setSearch(""); setCategoryView("all"); applyFilterGroups([]); }}>Clear search and filters</Button>,
                } : {
                    title: "No leads yet",
                    description: "Add your first lead, or connect a form or integration to bring them in.",
                    action: <CreateLeadDialog onSuccess={fetchData} />,
                }}
            />

            <SelectionBar
                count={selectedCount}
                totalMatching={totalItems}
                allMatchingSelected={isAllSelected}
                onSelectAllMatching={handleSelectAllFiltered}
                onClear={clearSelection}
                actions={[
                    { label: "Change status", icon: <Tag className="size-4" />, onClick: () => { setBulkStatus(""); setBulkStatusOpen(true); } },
                    { label: "Assign", icon: <UserCog className="size-4" />, onClick: () => { setBulkAssignUserId(null); setBulkAssignReason(""); setBulkAssignOpen(true); } },
                    { label: "Add to list", icon: <ListPlus className="size-4" />, onClick: () => setAddToListOpen(true) },
                    { label: "Delete", icon: <Trash2 className="size-4" />, onClick: handleDelete, destructive: true },
                ]}
            />

            <StandardDialog
                open={bulkStatusOpen}
                onClose={() => setBulkStatusOpen(false)}
                title={`Change status of ${plural(selectedCount, "lead", "leads")}`}
                maxWidth="xs"
                actions={<>
                    <Button variant="outline" onClick={() => setBulkStatusOpen(false)}>Cancel</Button>
                    <Button disabled={!bulkStatus} isLoading={bulkBusy} onClick={handleBulkStatus}>Change status</Button>
                </>}
            >
                <div className="space-y-1.5 pb-1">
                    <Label htmlFor="bulk-lead-status">New status</Label>
                    <Select value={bulkStatus} onValueChange={setBulkStatus}>
                        <SelectTrigger id="bulk-lead-status" className="w-full"><SelectValue placeholder="Choose a status" /></SelectTrigger>
                        <SelectContent>
                            {statuses.filter((status) => status.isActive).map((status) => (
                                <SelectItem key={status.key} value={status.key}>{status.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </StandardDialog>

            <StandardDialog
                open={addToListOpen}
                onClose={() => setAddToListOpen(false)}
                title={`Add ${plural(selectedCount, "lead", "leads")} to a list`}
                maxWidth="xs"
                actions={<>
                    <Button variant="outline" onClick={() => setAddToListOpen(false)}>Cancel</Button>
                    <Button onClick={handleAddToList} isLoading={bulkBusy} disabled={!targetListId}>Add to list</Button>
                </>}
            >
                <div className="space-y-1.5 pb-1">
                    <Label htmlFor="bulk-lead-list">List</Label>
                    <Select value={targetListId} onValueChange={setTargetListId}>
                        <SelectTrigger id="bulk-lead-list" className="w-full"><SelectValue placeholder="Choose a list" /></SelectTrigger>
                        <SelectContent>
                            {staticLists.map((list) => <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    {staticLists.length === 0 ? <p className="text-xs text-muted-foreground">There are no static lists yet. <Link href="/dashboard/lists" className="text-primary hover:underline">Create one in Lists</Link>.</p> : null}
                </div>
            </StandardDialog>

            <StandardDialog
                open={bulkAssignOpen}
                onClose={() => setBulkAssignOpen(false)}
                title={`Assign ${plural(selectedCount, "lead", "leads")}`}
                maxWidth="xs"
                actions={<>
                    <Button variant="outline" onClick={() => setBulkAssignOpen(false)}>Cancel</Button>
                    <Button onClick={handleBulkAssign} isLoading={bulkBusy} disabled={!bulkAssignUserId || !bulkAssignReason.trim()}>Assign</Button>
                </>}
            >
                <div className="space-y-4 pb-1">
                    <div className="space-y-1.5">
                        <Label htmlFor="bulk-lead-owner">New owner</Label>
                        <RecordPicker id="bulk-lead-owner" entity="user" value={bulkAssignUserId} allowClear={false} onChange={(id) => setBulkAssignUserId(id)} placeholder="Choose a person" />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="bulk-lead-reason">Reason <span aria-hidden className="text-destructive">*</span></Label>
                        <Textarea id="bulk-lead-reason" aria-required placeholder="Why are these leads being reassigned?" rows={2} value={bulkAssignReason} onChange={(event) => setBulkAssignReason(event.target.value)} />
                    </div>
                </div>
            </StandardDialog>

            <RecordPreview entityType="lead" entityId={quickViewLeadId} isOpen={!!quickViewLeadId} onClose={() => setQuickViewLeadId(null)} />

            {leadToEdit && (
                <EditLeadDialog open={!!leadToEdit} onOpenChange={(open) => { if (!open) setLeadToEdit(null); }} lead={leadToEdit} onSuccess={() => { setLeadToEdit(null); fetchData(); }} />
            )}
        </div>
    );
}

