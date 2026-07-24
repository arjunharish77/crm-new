"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { Plus, ArrowLeft, RefreshCw, Search, ExternalLink, SearchX, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { StandardDialog } from "@/components/common/standard-dialog";
import { BulkActionsToolbar } from "@/components/bulk-actions/bulk-toolbar";
import { formatWorkspaceDate } from "@/lib/date-format";
import { cn } from "@/lib/utils";

type LeadRecord = {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    source?: string | null;
    status?: string | null;
    score?: number | null;
    createdAt?: string;
    updatedAt?: string;
};

type LeadListDetail = {
    id: string;
    name: string;
    description?: string | null;
    type: "SMART" | "STATIC";
    leads: LeadRecord[];
    count: number;
    updatedAt?: string;
};

export default function LeadListDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const listId = params.id;
    const [list, setList] = useState<LeadListDetail | null>(null);
    const [allLeads, setAllLeads] = useState<LeadRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);
    const [selectedToAdd, setSelectedToAdd] = useState<LeadRecord[]>([]);
    const [search, setSearch] = useState("");
    const [selectedRows, setSelectedRows] = useState<string[]>([]);
    const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });

    const fetchList = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch<LeadListDetail>(`/lead-lists/${listId}`);
            setList(data);
        } catch {
            toast.error("Failed to load list");
        } finally {
            setLoading(false);
        }
    }, [listId]);

    const fetchAllLeads = useCallback(async () => {
        try {
            const response = await apiFetch<any>("/leads?page=1&limit=5000");
            setAllLeads(Array.isArray(response) ? response : response.data ?? []);
        } catch {
            toast.error("Failed to load leads");
        }
    }, []);

    useEffect(() => {
        fetchList();
        fetchAllLeads();
    }, [fetchList, fetchAllLeads]);

    const existingLeadIds = useMemo(() => new Set((list?.leads ?? []).map((lead) => lead.id)), [list?.leads]);
    const addableLeads = useMemo(() => allLeads.filter((lead) => !existingLeadIds.has(lead.id)), [allLeads, existingLeadIds]);
    const visibleLeads = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return list?.leads ?? [];
        return (list?.leads ?? []).filter((lead) =>
            `${lead.name} ${lead.email ?? ""} ${lead.phone ?? ""} ${lead.company ?? ""} ${lead.source ?? ""} ${lead.status ?? ""}`
                .toLowerCase()
                .includes(term)
        );
    }, [list?.leads, search]);

    useEffect(() => {
        setPagination((current) => ({ ...current, pageIndex: 0 }));
    }, [search, listId]);

    const paginatedLeads = useMemo(() => {
        const start = pagination.pageIndex * pagination.pageSize;
        return visibleLeads.slice(start, start + pagination.pageSize);
    }, [visibleLeads, pagination]);

    const addLeads = async () => {
        const leadIds = selectedToAdd.map((lead) => lead.id);
        if (leadIds.length === 0) {
            toast.error("Select at least one lead");
            return;
        }
        try {
            await apiFetch(`/lead-lists/${listId}/members`, {
                method: "POST",
                body: JSON.stringify({ leadIds }),
            });
            toast.success(`${leadIds.length} lead${leadIds.length === 1 ? "" : "s"} added`);
            setAddOpen(false);
            setSelectedToAdd([]);
            fetchList();
        } catch {
            toast.error("Failed to add leads");
        }
    };

    const removeLead = async (leadId: string) => {
        if (!confirm("Remove this lead from the list?")) return;
        try {
            await apiFetch(`/lead-lists/${listId}/members/${leadId}`, { method: "DELETE" });
            toast.success("Lead removed from list");
            setSelectedRows((current) => current.filter((id) => id !== leadId));
            fetchList();
        } catch {
            toast.error("Failed to remove lead");
        }
    };

    const removeSelected = async () => {
        if (!list || list.type !== "STATIC" || selectedRows.length === 0) return;
        if (!confirm(`Remove ${selectedRows.length} selected lead${selectedRows.length === 1 ? "" : "s"} from this list?`)) return;
        try {
            await Promise.all(selectedRows.map((leadId) => apiFetch(`/lead-lists/${listId}/members/${leadId}`, { method: "DELETE" })));
            toast.success("Selected leads removed");
            setSelectedRows([]);
            fetchList();
        } catch {
            toast.error("Failed to remove selected leads");
        }
    };

    const columns = useMemo<ColumnDef<LeadRecord, any>[]>(() => [
        {
            accessorKey: "name",
            header: "Lead Name",
            size: 240,
            cell: ({ row }) => (
                <Link
                    href={`/dashboard/leads/${row.original.id}`}
                    className="font-extrabold text-primary hover:underline"
                    onClick={(event) => event.stopPropagation()}
                >
                    {row.original.name || "Untitled Lead"}
                </Link>
            ),
        },
        {
            accessorKey: "email",
            header: "Email",
            size: 210,
            cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.email || "-"}</span>,
        },
        {
            accessorKey: "phone",
            header: "Phone",
            size: 150,
            cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.phone || "-"}</span>,
        },
        {
            accessorKey: "company",
            header: "Company",
            size: 160,
            cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.company || "-"}</span>,
        },
        {
            accessorKey: "status",
            header: "Stage",
            size: 130,
            cell: ({ row }) => (
                <Badge variant="outline" className="border-border bg-muted font-extrabold text-muted-foreground">
                    {row.original.status || "-"}
                </Badge>
            ),
        },
        {
            accessorKey: "source",
            header: "Source",
            size: 130,
            cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.source || "-"}</span>,
        },
        {
            accessorKey: "createdAt",
            header: "Created On",
            size: 160,
            cell: ({ row }) => (
                <span className="text-sm text-muted-foreground">
                    {row.original.createdAt ? formatWorkspaceDate(row.original.createdAt) : "-"}
                </span>
            ),
        },
        {
            id: "actions",
            header: "",
            size: 120,
            cell: ({ row }) => (
                <div className="flex gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon-sm" asChild onClick={(event) => event.stopPropagation()}>
                                <Link href={`/dashboard/leads/${row.original.id}`}>
                                    <ExternalLink className="size-4" />
                                </Link>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Open lead</TooltipContent>
                    </Tooltip>
                    {list?.type === "STATIC" ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        removeLead(row.original.id);
                                    }}
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Remove from list</TooltipContent>
                        </Tooltip>
                    ) : null}
                </div>
            ),
        },
    ], [list?.type, removeLead]);

    return (
        <div className="mx-auto max-w-[1500px] px-3 py-3 md:px-4 md:py-4">
            <div className="space-y-3">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon-sm" onClick={() => router.push("/dashboard/lists")}>
                            <ArrowLeft className="size-4" />
                        </Button>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="text-lg font-black">{list?.name ?? "Lead List"}</h1>
                                <Badge className={list?.type === "SMART" ? "font-extrabold" : "font-extrabold"} variant={list?.type === "SMART" ? "default" : "secondary"}>
                                    {list?.type === "SMART" ? "Smart list" : "Static list"}
                                </Badge>
                                <Badge variant="outline" className="font-extrabold">{`${list?.count ?? 0} leads`}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {list?.description || "Search, review, and manage leads in this list."}
                            </p>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={fetchList}>
                            <RefreshCw className="size-4" />
                            Refresh
                        </Button>
                        {list?.type === "STATIC" ? (
                            <Button onClick={() => setAddOpen(true)}>
                                <Plus className="size-4" />
                                Add Leads
                            </Button>
                        ) : null}
                    </div>
                </div>

                <Card className="rounded-xl p-2.5">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search leads in this list"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className="pl-9"
                        />
                    </div>
                </Card>

                <Card className="overflow-hidden rounded-xl">
                    <DataTable
                        storageKey="lead-list-detail-table"
                        data={paginatedLeads}
                        columns={columns}
                        loading={loading}
                        getRowId={(row) => row.id}
                        enableRowSelection
                        rowSelectionIds={selectedRows}
                        onRowSelectionIdsChange={setSelectedRows}
                        totalItems={visibleLeads.length}
                        pageIndex={pagination.pageIndex}
                        pageSize={pagination.pageSize}
                        pageSizeOptions={[25, 50, 100]}
                        onPaginationChange={setPagination}
                        emptyState={{
                            icon: <SearchX className="size-10 text-muted-foreground opacity-50" />,
                            title: "No leads found",
                            description: "Add leads to this list or adjust your search.",
                        }}
                    />
                </Card>
            </div>

            <BulkActionsToolbar
                selectedCount={selectedRows.length}
                onClearSelection={() => setSelectedRows([])}
                module="leads"
                onDelete={list?.type === "STATIC" ? removeSelected : undefined}
            />

            <StandardDialog
                open={addOpen}
                onClose={() => setAddOpen(false)}
                title={`Add leads to ${list?.name ?? ""}`}
                maxWidth="md"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
                        <Button onClick={addLeads} disabled={selectedToAdd.length === 0}>Add To List</Button>
                    </>
                }
            >
                <div className="space-y-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-3 py-1.5 text-left text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                {selectedToAdd.length === 0 ? (
                                    <span className="text-muted-foreground">Search leads to add</span>
                                ) : (
                                    selectedToAdd.map((lead) => (
                                        <Badge
                                            key={lead.id}
                                            variant="secondary"
                                            className="gap-1"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                setSelectedToAdd((current) => current.filter((item) => item.id !== lead.id));
                                            }}
                                        >
                                            {lead.name || "Untitled Lead"}
                                            <X className="size-3" />
                                        </Badge>
                                    ))
                                )}
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Search leads..." />
                                <CommandList>
                                    <CommandEmpty>No leads found.</CommandEmpty>
                                    <CommandGroup>
                                        {addableLeads.map((lead) => {
                                            const isSelected = selectedToAdd.some((item) => item.id === lead.id);
                                            return (
                                                <CommandItem
                                                    key={lead.id}
                                                    value={`${lead.name || "Untitled Lead"} ${lead.email ?? ""}`}
                                                    onSelect={() => {
                                                        setSelectedToAdd((current) =>
                                                            isSelected
                                                                ? current.filter((item) => item.id !== lead.id)
                                                                : [...current, lead]
                                                        );
                                                    }}
                                                >
                                                    <div className={cn("flex size-4 items-center justify-center rounded-sm border", isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                                                        {isSelected ? <X className="size-3" /> : null}
                                                    </div>
                                                    {lead.name || "Untitled Lead"}{lead.email ? ` (${lead.email})` : ""}
                                                </CommandItem>
                                            );
                                        })}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                    <p className="block text-xs text-muted-foreground">
                        Smart lists are filter-based; manual additions are available for static lists only.
                    </p>
                </div>
            </StandardDialog>
        </div>
    );
}
