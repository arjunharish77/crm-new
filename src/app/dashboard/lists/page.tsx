"use client";

import { PageHeader } from "@/components/layout/page-header";

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
import { AdvancedFilterDrawer, FilterGroup } from "@/components/filters/advanced-filter-drawer";
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
    { label: "Created", key: "createdAt", type: "date" },
    { label: "Tags", key: "tags", type: "tags" },
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
    const [fetchError, setFetchError] = useState<string | null>(null);
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
            setFetchError(null);
        }
        try {
            const data = await apiFetch("/lead-lists");
            if (mountedRef.current) {
                setLists(Array.isArray(data) ? data : []);
            }
        } catch {
            if (mountedRef.current) {
                setFetchError("Failed to load lists.");
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

    // Lets the global create menu (header.tsx) open this page's own real "New List" dialog on
    // load -- read via window.location, not next/navigation's useSearchParams, matching this
    // app's existing convention (views/page.tsx, tasks/page.tsx) since this page isn't wrapped
    // in a Suspense boundary.
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get("create") === "1") {
            setOpen(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
                    <div className="font-semibold leading-tight text-primary">{row.original.name}</div>
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
                            ? "border-primary/20 bg-primary/10 font-semibold text-primary"
                            : "border-border bg-muted font-semibold text-muted-foreground"
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
                <span className="font-semibold">{row.original.count ?? 0}</span>
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
        <div className="min-w-0">
            <div className="space-y-3">
                <PageHeader title="Lead Lists" description="Segment leads into smart lists or manage membership in static lists." actions={
                    <Button onClick={() => setOpen(true)}><Plus className="size-4" />New List</Button>
                } />

                <Card className="rounded-xl p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative min-w-0 flex-1 basis-60">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                aria-label="Search lists" placeholder="Search lists"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as any)}>
                            <SelectTrigger aria-label="List type" className="w-full sm:w-40">
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
                            {loading || fetchError ? "—" : filteredLists.length} lists
                        </span>
                    </div>
                </Card>

                <Card className="overflow-hidden rounded-xl">
                        <DataTable
                            storageKey="lead-lists-table"
                            data={paginatedLists}
                            columns={columns}
                            loading={loading}
                            error={fetchError}
                            onRetry={fetchLists}
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
                        <Label htmlFor="list-name">Name</Label>
                        <Input id="list-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="list-description">Description</Label>
                        <Input id="list-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="list-type">Type</Label>
                        <Select value={form.type} onValueChange={(value) => setForm({ ...form, type: value })}>
                            <SelectTrigger id="list-type" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="SMART">Smart list</SelectItem>
                                <SelectItem value="STATIC">Static list</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {form.type === "SMART" && (
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => setFilterOpen(true)}>Configure filters</Button>
                            <span className="text-xs text-muted-foreground">{filters.reduce((sum, group) => sum + group.conditions.length, 0)} conditions</span>
                        </div>
                    )}
                </div>
            </StandardDialog>

            <AdvancedFilterDrawer
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                initialGroups={filters}
                storageKey="lists"
                previewCount={async (groups) => {
                    const nonEmpty = groups
                        .map((group) => ({ ...group, conditions: group.conditions.filter((condition) => condition.field) }))
                        .filter((group) => group.conditions.length > 0);
                    const params = new URLSearchParams({ page: "1", limit: "1" });
                    if (nonEmpty.length) params.set("filters", JSON.stringify(nonEmpty));
                    const response = await apiFetch<{ meta?: { total: number } } | any[]>(`/leads?${params.toString()}`);
                    return Array.isArray(response) ? response.length : response.meta?.total ?? 0;
                }}
                fields={LEAD_FILTER_FIELDS}
                onApply={setFilters}
            />
        </div>
    );
}
