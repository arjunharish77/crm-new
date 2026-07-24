'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Lead } from "@/types/leads";
import { PaginatedResponse } from "@/types/common";
import { apiFetch } from "@/lib/api";
import { ListPlus } from "lucide-react";
import { Filter as FilterIconLucide } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { StandardDialog } from "@/components/common/standard-dialog";
import { buildLeadColumns } from "./columns";
import { toast } from "sonner";
import Link from "next/link";
import { formatWorkspaceDate } from "@/lib/date-format";
import { CreateLeadDialog } from "./create-lead-dialog";
import { RecordPreview } from "@/components/common/record-preview";
import { BulkActionsToolbar } from "@/components/bulk-actions/bulk-toolbar";
import { EditLeadDialog } from "./edit-lead-dialog";
import { AdvancedFilterModal, FilterGroup } from "@/components/filters/advanced-filter-modal";
import { FilterConfig } from "@/types/filters";
import { QueueExportButton } from "@/components/exports/queue-export-button";

const EMPTY_FILTERS: FilterConfig = { conditions: [], logic: "AND" };

function filtersToQuery(filters: FilterConfig) {
    return filters.conditions.length > 0 ? JSON.stringify([filters]) : "";
}

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
    const [addToListOpen, setAddToListOpen] = useState(false);
    const [staticLists, setStaticLists] = useState<any[]>([]);
    const [targetListId, setTargetListId] = useState("");

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('page', (paginationModel.page + 1).toString());
            params.set('limit', paginationModel.pageSize.toString());
            if (urlFilters) params.set("filters", urlFilters);

            const response = await apiFetch<PaginatedResponse<Lead> | Lead[]>(`/leads?${params.toString()}`);

            if ('meta' in response && response.data) {
                setData(response.data);
                setTotalItems(response.meta.total);
            } else if (Array.isArray(response)) {
                // Fallback for non-paginated endpoints
                setData(response);
                setTotalItems(response.length);
            }
        } catch (error) {
            console.error("Fetch error:", error);
            toast.error("Failed to fetch leads");
        } finally {
            setLoading(false);
        }
    }, [paginationModel, urlFilters]);

    useEffect(() => {
        setUrlFilters(new URLSearchParams(window.location.search).get("filters") ?? "");
    }, []);

    const applyFilters = useCallback((nextFilters: FilterConfig) => {
        setFilters(nextFilters);
        setUrlFilters(filtersToQuery(nextFilters));
        setPaginationModel((current) => ({ ...current, page: 0 }));
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

    const handleEdit = (lead: Lead) => {
        setLeadToEdit(lead);
        setEditLeadOpen(true);
    };

    const columns = useMemo(
        () =>
            buildLeadColumns({
                onQuickView: (leadId) => setQuickViewLeadId(leadId),
                onEdit: handleEdit,
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

    return (
        <div className="flex h-full w-full flex-col">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold tracking-[-0.5px]">Leads</h1>
                    <p className="text-xs text-muted-foreground">Manage and track your sales prospects</p>
                </div>
                <div className="flex gap-2">
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
                    <CreateLeadDialog onSuccess={fetchData} />
                </div>
            </div>

            <AdvancedFilterModal
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
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
                onApply={(filters: FilterGroup[]) => {
                    applyFilters(groupsToFilterConfig(filters));
                }}
            />

            <Card className="flex flex-grow flex-col overflow-hidden rounded-[14px] bg-surface-container-low">
                <div className="w-full overflow-x-auto">
                    <div className="min-w-[800px]">
                        <DataTable
                            storageKey="leads-table"
                            data={data}
                            columns={columns}
                            loading={loading}
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

            <BulkActionsToolbar
                selectedCount={isAllSelected ? totalItems : selectedRows.length}
                onClearSelection={clearSelection}
                module="leads"
                onAddToList={() => setAddToListOpen(true)}
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
