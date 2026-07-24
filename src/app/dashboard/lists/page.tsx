"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { Eye, ListFilter, ListPlus, Plus, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Button as UiButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StandardDialog } from "@/components/common/standard-dialog";
import { AdvancedFilterModal, FilterGroup } from "@/components/filters/advanced-filter-modal";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import type { FilterField } from "@/types/filters";

const LEAD_FILTER_FIELDS: FilterField[] = [
    { label: "Name", key: "name", type: "text" },
    { label: "Email", key: "email", type: "text" },
    {
        label: "Status",
        key: "status",
        type: "select",
        options: [
            { label: "New", value: "NEW" },
            { label: "Qualified", value: "QUALIFIED" },
            { label: "Contacted", value: "CONTACTED" },
            { label: "Lost", value: "LOST" },
            { label: "Converted", value: "CONVERTED" },
        ],
    },
    { label: "Source", key: "source", type: "text" },
    { label: "Score", key: "score", type: "number" },
];

type LeadListSummary = {
    id: string;
    name: string;
    description?: string | null;
    type: "SMART" | "STATIC";
    count?: number;
    isActive?: boolean;
    updatedAt?: string;
    createdAt?: string;
};

export default function LeadListsPage() {
    const router = useRouter();
    const mountedRef = useRef(false);
    const [lists, setLists] = useState<LeadListSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);
    const [form, setForm] = useState({ name: "", description: "", type: "SMART" });
    const [filters, setFilters] = useState<FilterGroup[]>([]);
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState<"ALL" | "SMART" | "STATIC">("ALL");
    const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });

    const fetchLists = useCallback(async () => {
        if (mountedRef.current) {
            setLoading(true);
        }
        try {
            const data = await apiFetch("/lead-lists");
            if (mountedRef.current) {
                setLists(Array.isArray(data) ? data : []);
            }
        } catch {
            if (mountedRef.current) {
                toast.error("Failed to load lists");
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        fetchLists();
        return () => {
            mountedRef.current = false;
        };
    }, [fetchLists]);

    const createList = async () => {
        if (!form.name.trim()) {
            toast.error("List name is required");
            return;
        }
        try {
            await apiFetch("/lead-lists", {
                method: "POST",
                body: JSON.stringify({
                    ...form,
                    filters: form.type === "SMART" ? filters : [],
                }),
            });
            toast.success("List created");
            setOpen(false);
            setForm({ name: "", description: "", type: "SMART" });
            setFilters([]);
            fetchLists();
        } catch {
            toast.error("Failed to create list");
        }
    };

    const filteredLists = useMemo(() => {
        const term = search.trim().toLowerCase();
        return lists.filter((list) => {
            if (typeFilter !== "ALL" && list.type !== typeFilter) return false;
            if (!term) return true;
            return `${list.name} ${list.description ?? ""}`.toLowerCase().includes(term);
        });
    }, [lists, search, typeFilter]);

    useEffect(() => {
        setPagination((current) => ({ ...current, pageIndex: 0 }));
    }, [search, typeFilter]);

    const paginatedLists = useMemo(() => {
        const start = pagination.pageIndex * pagination.pageSize;
        return filteredLists.slice(start, start + pagination.pageSize);
    }, [filteredLists, pagination]);

    const columns = useMemo<ColumnDef<LeadListSummary, any>[]>(() => [
        {
            accessorKey: "name",
            header: "List Name",
            size: 280,
            cell: ({ row }) => (
                <Link
                    href={`/dashboard/lists/${row.original.id}`}
                    className="block text-inherit"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="font-extrabold leading-tight text-primary">{row.original.name}</div>
                    {row.original.description ? (
                        <div className="truncate text-xs text-muted-foreground">{row.original.description}</div>
                    ) : null}
                </Link>
            ),
        },
        {
            accessorKey: "type",
            header: "Type",
            size: 150,
            cell: ({ row }) => (
                <Badge
                    variant="outline"
                    className={
                        row.original.type === "SMART"
                            ? "border-primary/20 bg-primary/10 font-extrabold text-primary"
                            : "border-border bg-muted font-extrabold text-muted-foreground"
                    }
                >
                    {row.original.type === "SMART" ? "Smart list" : "Static list"}
                </Badge>
            ),
        },
        {
            accessorKey: "count",
            header: "Leads",
            size: 120,
            cell: ({ row }) => (
                <span className="font-extrabold">{row.original.count ?? 0}</span>
            ),
        },
        {
            accessorKey: "updatedAt",
            header: "Modified On",
            size: 180,
            cell: ({ row }) => (
                <span className="text-sm text-muted-foreground">
                    {row.original.updatedAt ? formatWorkspaceDateTime(row.original.updatedAt) : "-"}
                </span>
            ),
        },
        {
            id: "actions",
            header: "",
            size: 120,
            cell: ({ row }) => (
                <UiButton
                    asChild
                    variant="ghost"
                    size="sm"
                    onClick={(event) => event.stopPropagation()}
                >
                    <Link
                        href={`/dashboard/lists/${row.original.id}`}
                    >
                        <Eye className="size-4" />
                        View
                    </Link>
                </UiButton>
            ),
        },
    ], []);

    return (
        <div className="mx-auto max-w-[1480px] px-3 py-3 md:px-4 md:py-4">
            <div className="space-y-3">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                    <div>
                        <h1 className="text-lg font-extrabold">Lead Lists</h1>
                        <p className="text-sm text-muted-foreground">
                            Create static and smart lead views for segmentation, follow-up, and automation enrollment.
                        </p>
                    </div>
                    <Button onClick={() => setOpen(true)} className="rounded-[10px]">
                        <Plus className="size-4" />
                        New List
                    </Button>
                </div>

                <Card className="rounded-xl p-2.5">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center">
                        <div className="relative md:min-w-[320px]">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search lists"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as any)}>
                            <SelectTrigger className="min-w-[160px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All lists</SelectItem>
                                <SelectItem value="SMART">Smart lists</SelectItem>
                                <SelectItem value="STATIC">Static lists</SelectItem>
                            </SelectContent>
                        </Select>
                        <div className="flex-grow" />
                        <span className="text-xs font-bold text-muted-foreground">
                            {filteredLists.length} lists
                        </span>
                    </div>
                </Card>

                <Card className="overflow-hidden rounded-xl">
                        <DataTable
                            storageKey="lead-lists-table"
                            data={paginatedLists}
                            columns={columns}
                            loading={loading}
                            getRowId={(row) => row.id}
                            totalItems={filteredLists.length}
                            pageIndex={pagination.pageIndex}
                            pageSize={pagination.pageSize}
                            pageSizeOptions={[25, 50, 100]}
                            onPaginationChange={setPagination}
                            onRowClick={(row) => router.push(`/dashboard/lists/${row.id}`)}
                            emptyState={{
                                icon: <ListFilter className="size-10 text-muted-foreground opacity-50" />,
                                title: "No lists found",
                                description: "Create a smart list from filters or a static list for manual membership.",
                            }}
                        />
                </Card>
            </div>

            <StandardDialog
                open={open}
                onClose={() => setOpen(false)}
                title="New lead list"
                icon={<ListPlus className="size-5" />}
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button onClick={createList}>Create</Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <Label>Type</Label>
                        <Select value={form.type} onValueChange={(value) => setForm({ ...form, type: value })}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="SMART">Smart list</SelectItem>
                                <SelectItem value="STATIC">Static list</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {form.type === "SMART" && (
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => setFilterOpen(true)}>Configure filters</Button>
                            <span className="text-xs text-muted-foreground">{filters.reduce((sum, group) => sum + group.conditions.length, 0)} conditions</span>
                        </div>
                    )}
                </div>
            </StandardDialog>

            <AdvancedFilterModal
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                fields={LEAD_FILTER_FIELDS}
                onApply={setFilters}
            />
        </div>
    );
}
