"use client";

import { PageHeader } from "@/components/layout/page-header";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { LifeBuoy, Plus } from "lucide-react";
import { SlaBadge } from "@/components/cases/sla-badge";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { ListToolbar } from "@/components/common/list-toolbar";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { StandardDialog } from "@/components/common/standard-dialog";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { useModuleEnabled } from "@/components/auth/feature-gate";

const ALL = "__all__";

const PRIORITY_TONE: Record<string, "neutral" | "info" | "warning" | "danger"> = {
    Low: "neutral",
    Medium: "info",
    High: "warning",
    Urgent: "danger",
};


export default function CasesPage() {
    const router = useRouter();
    const serviceDeskEnabled = useModuleEnabled("SERVICE_DESK");

    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [totalItems, setTotalItems] = useState(0);
    const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });

    const [statuses, setStatuses] = useState<any[]>([]);
    const [priorities, setPriorities] = useState<any[]>([]);
    const [queues, setQueues] = useState<any[]>([]);
    const [types, setTypes] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);

    const [statusFilter, setStatusFilter] = useState(ALL);
    const [priorityFilter, setPriorityFilter] = useState(ALL);
    const [queueFilter, setQueueFilter] = useState(ALL);
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebouncedValue(search.trim(), 300);
    const [configError, setConfigError] = useState(false);
    const [subjectError, setSubjectError] = useState<string | null>(null);

    const [createOpen, setCreateOpen] = useState(false);
    const [createSubmitting, setCreateSubmitting] = useState(false);
    const [form, setForm] = useState({ subject: "", description: "", typeId: "", priorityId: "", queueId: "", requesterName: "", requesterEmail: "" });

    const fetchConfig = useCallback(async () => {
        setConfigError(false);
        try {
            const [statusesData, prioritiesData, queuesData, typesData, usersData] = await Promise.all([
                apiFetch<any[]>("/case-statuses"),
                apiFetch<any[]>("/case-priorities"),
                apiFetch<any[]>("/case-queues"),
                apiFetch<any[]>("/case-types"),
                apiFetch<any[]>("/users"),
            ]);
            setStatuses(Array.isArray(statusesData) ? statusesData : []);
            setPriorities(Array.isArray(prioritiesData) ? prioritiesData : []);
            setQueues(Array.isArray(queuesData) ? queuesData : []);
            setTypes(Array.isArray(typesData) ? typesData : []);
            setUsers(Array.isArray(usersData) ? usersData : []);
        } catch {
            // The list still loads; the filters and the create form say what's missing (UI/UX plan §5.15).
            setConfigError(true);
        }
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const params = new URLSearchParams();
            params.set("page", String(paginationModel.page + 1));
            params.set("limit", String(paginationModel.pageSize));
            if (statusFilter !== ALL) params.set("statusId", statusFilter);
            if (priorityFilter !== ALL) params.set("priorityId", priorityFilter);
            if (queueFilter !== ALL) params.set("queueId", queueFilter);
            if (debouncedSearch) params.set("q", debouncedSearch);
            const response = await apiFetch<{ data: any[]; meta: { total: number } }>(`/cases?${params.toString()}`);
            setData(Array.isArray(response?.data) ? response.data : []);
            setTotalItems(response?.meta?.total ?? 0);
        } catch {
            setFetchError("The cases couldn't be loaded.");
        } finally {
            setLoading(false);
        }
    }, [paginationModel, statusFilter, priorityFilter, queueFilter, debouncedSearch]);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    useEffect(() => {
        if (serviceDeskEnabled) fetchData();
        else setLoading(false);
    }, [fetchData, serviceDeskEnabled]);

    const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
    const priorityById = useMemo(() => new Map(priorities.map((p) => [p.id, p])), [priorities]);
    const queueById = useMemo(() => new Map(queues.map((q) => [q.id, q])), [queues]);
    const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

    const columns = useMemo<ColumnDef<any, any>[]>(() => [
        {
            accessorKey: "caseNumber",
            header: "Case",
            size: 260,
            cell: ({ row }) => (
                <Link href={`/dashboard/cases/${row.original.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                    #{row.original.caseNumber} · {row.original.subject}
                </Link>
            ),
        },
        {
            accessorKey: "statusId",
            header: "Status",
            size: 130,
            cell: ({ row }) => <Badge tone="neutral">{statusById.get(row.original.statusId)?.name ?? "—"}</Badge>,
        },
        {
            accessorKey: "priorityId",
            header: "Priority",
            size: 120,
            cell: ({ row }) => {
                const name = priorityById.get(row.original.priorityId)?.name ?? "—";
                return <Badge tone={PRIORITY_TONE[name] ?? "neutral"}>{name}</Badge>;
            },
        },
        {
            accessorKey: "queueId",
            header: "Queue",
            size: 150,
            cell: ({ row }) => <span className="text-sm text-muted-foreground">{queueById.get(row.original.queueId)?.name ?? "Unassigned"}</span>,
        },
        {
            accessorKey: "ownerId",
            header: "Owner",
            size: 160,
            cell: ({ row }) => <span className="text-sm">{userById.get(row.original.ownerId)?.name ?? userById.get(row.original.ownerId)?.email ?? "Unassigned"}</span>,
        },
        {
            accessorKey: "resolutionDueAt",
            header: "Resolve by",
            size: 200,
            cell: ({ row }) => <SlaBadge due={row.original.resolutionDueAt} resolvedAt={row.original.resolvedAt} />,
        },
    ], [statusById, priorityById, queueById, userById]);

    const handleCreate = async () => {
        if (!form.subject.trim()) {
            setSubjectError("Enter a subject.");
            document.getElementById("case-subject")?.focus();
            return;
        }
        setCreateSubmitting(true);
        try {
            const created = await apiFetch<any>("/cases", {
                method: "POST",
                body: JSON.stringify({
                    subject: form.subject.trim(),
                    description: form.description || null,
                    typeId: form.typeId || undefined,
                    priorityId: form.priorityId || undefined,
                    queueId: form.queueId || undefined,
                    requesterName: form.requesterName || null,
                    requesterEmail: form.requesterEmail || null,
                }),
            });
            toast.success(`Case #${created.caseNumber} created`);
            setCreateOpen(false);
            setForm({ subject: "", description: "", typeId: "", priorityId: "", queueId: "", requesterName: "", requesterEmail: "" });
            fetchData();
            router.push(`/dashboard/cases/${created.id}`);
        } catch (error: any) {
            toast.error(error?.message || "The case couldn't be created");
        } finally {
            setCreateSubmitting(false);
        }
    };

    if (!serviceDeskEnabled) {
        return (
            <div className="min-w-0">
                <EmptyState
                    icon={<LifeBuoy className="size-10 text-muted-foreground opacity-50" />}
                    title="Service desk isn't turned on"
                    description="Ask an admin to turn on the Service desk module."
                />
            </div>
        );
    }

    return (
        <div className="min-w-0">
            <PageHeader title="Cases" description="Track and resolve support cases." actions={
                <Button onClick={() => { setSubjectError(null); setCreateOpen(true); }}><Plus className="size-4" />New case</Button>
            } />
            {configError ? <ErrorState variant="inline" description="Statuses, priorities and queues couldn't be loaded, so filtering and new cases are limited." onRetry={fetchConfig} className="mb-3" /> : null}
            <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Case filters">
                    <ListToolbar
                        className="min-w-0 flex-1 basis-64"
                        search={{ value: search, onChange: (value) => { setSearch(value); setPaginationModel((current) => ({ ...current, page: 0 })); }, placeholder: "Search subject, requester or #number", label: "Search cases", inputId: "cases-search" }}
                    />
                    <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPaginationModel(current => ({ ...current, page: 0 })); }}>
                        <SelectTrigger aria-label="Status filter" className="w-full sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All statuses</SelectItem>
                            {statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={priorityFilter} onValueChange={(value) => { setPriorityFilter(value); setPaginationModel(current => ({ ...current, page: 0 })); }}>
                        <SelectTrigger aria-label="Priority filter" className="w-full sm:w-40"><SelectValue placeholder="Priority" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All priorities</SelectItem>
                            {priorities.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={queueFilter} onValueChange={(value) => { setQueueFilter(value); setPaginationModel(current => ({ ...current, page: 0 })); }}>
                        <SelectTrigger aria-label="Queue filter" className="w-full sm:w-40"><SelectValue placeholder="Queue" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All queues</SelectItem>
                            {queues.map((q) => <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
            </div>

            <Card className="overflow-hidden rounded-xl">
                <DataTable
                    storageKey="cases-table"
                    data={data}
                    columns={columns}
                    loading={loading}
                    error={fetchError}
                    onRetry={fetchData}
                    getRowId={(row) => row.id}
                    onRowClick={(row) => router.push(`/dashboard/cases/${row.id}`)}
                    totalItems={totalItems}
                    pageIndex={paginationModel.page}
                    pageSize={paginationModel.pageSize}
                    onPaginationChange={({ pageIndex, pageSize }) => setPaginationModel({ page: pageIndex, pageSize })}
                    emptyState={debouncedSearch || statusFilter !== ALL || priorityFilter !== ALL || queueFilter !== ALL ? {
                        kind: "no-match",
                        title: "No cases match",
                        description: "Try another search or filter.",
                        action: <Button variant="outline" onClick={() => { setSearch(""); setStatusFilter(ALL); setPriorityFilter(ALL); setQueueFilter(ALL); }}>Clear search and filters</Button>,
                    } : {
                        icon: <LifeBuoy />,
                        title: "No cases yet",
                        description: "Create a case to start tracking a support request.",
                        action: <Button onClick={() => { setSubjectError(null); setCreateOpen(true); }}><Plus className="size-4" />New case</Button>,
                    }}
                />
            </Card>

            <StandardDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                title="New case"
                icon={<LifeBuoy className="size-5" />}
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreate} isLoading={createSubmitting}>Create case</Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="case-subject">Subject</Label>
                        <Input
                            id="case-subject"
                            value={form.subject}
                            aria-invalid={!!subjectError}
                            aria-describedby={subjectError ? "case-subject-error" : undefined}
                            onChange={(e) => { setForm({ ...form, subject: e.target.value }); if (subjectError) setSubjectError(null); }}
                            placeholder="Brief summary of the issue"
                        />
                        {subjectError ? <p id="case-subject-error" className="text-xs text-destructive">{subjectError}</p> : null}
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="case-description">Description</Label>
                        <Textarea id="case-description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="More detail about the request" />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="case-type">Type</Label>
                            <Select value={form.typeId} onValueChange={(value) => setForm({ ...form, typeId: value })}>
                                <SelectTrigger id="case-type" className="w-full"><SelectValue placeholder="Default" /></SelectTrigger>
                                <SelectContent>
                                    {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="case-priority">Priority</Label>
                            <Select value={form.priorityId} onValueChange={(value) => setForm({ ...form, priorityId: value })}>
                                <SelectTrigger id="case-priority" className="w-full"><SelectValue placeholder="Default" /></SelectTrigger>
                                <SelectContent>
                                    {priorities.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="case-queue">Queue</Label>
                        <Select value={form.queueId} onValueChange={(value) => setForm({ ...form, queueId: value })}>
                            <SelectTrigger id="case-queue" className="w-full"><SelectValue placeholder="No queue (unassigned)" /></SelectTrigger>
                            <SelectContent>
                                {queues.map((q) => <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="case-requesterName">Requester name</Label>
                            <Input id="case-requesterName" value={form.requesterName} onChange={(e) => setForm({ ...form, requesterName: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="case-requesterEmail">Requester email</Label>
                            <Input type="email" id="case-requesterEmail" value={form.requesterEmail} onChange={(e) => setForm({ ...form, requesterEmail: e.target.value })} />
                        </div>
                    </div>
                </div>
            </StandardDialog>
        </div>
    );
}
