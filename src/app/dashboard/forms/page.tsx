"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Copy, ExternalLink, FileText, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { purgeDate, useArchiveActions } from "@/hooks/use-archive-actions";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { ListToolbar } from "@/components/common/list-toolbar";
import { QueueExportButton } from "@/components/exports/queue-export-button";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StandardDialog } from "@/components/common/standard-dialog";
import { useUrlState } from "@/hooks/use-url-state";
import { useAuth } from "@/providers/auth-provider";
import { formatWorkspaceDate } from "@/lib/date-format";
import { formatCount } from "@/lib/display/format";
import { publicFormPath, publicFormUrl } from "@/lib/forms/public-url";

interface Form {
    id: string;
    name: string;
    createdBy?: string | null;
    description?: string;
    slug: string;
    isActive: boolean;
    createdAt: string;
    deletedAt?: string | null;
    publishedVersion?: number;
    draft?: unknown;
    _count?: { submissions: number };
}

const STATUS_FILTERS = ["all", "live", "draft", "archived"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

// Marketing & automation › Forms (UI/UX plan §5.13): a table instead of clickable cards with an
// "Edit" button that did nothing; a working Live/Draft filter instead of a Filters button that
// did nothing; a load error shows an error; the row menu is labelled.
export default function FormsPage() {
    const { user } = useAuth();
    // Archive, restore and delete for good: the creator or an admin (decided 2026-10-03).
    const canManage = (item: { createdBy?: string | null }) => !user || !!(user as any).isTenantAdmin || !!(user as any).isPlatformAdmin || (!!item.createdBy && item.createdBy === user.id);
    const router = useRouter();
    const [forms, setForms] = useState<Form[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [search, setSearch] = useUrlState<string>("q", "");
    const [status, setStatus] = useUrlState<StatusFilter>("status", "all", { allowed: STATUS_FILTERS });
    const [createOpen, setCreateOpen] = useState(false);
    const [newFormName, setNewFormName] = useState("");
    const [nameError, setNameError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    const [archivedForms, setArchivedForms] = useState<Form[]>([]);
    const showArchived = status === "archived";
    const fetchForms = useCallback(async () => {
        setLoading(true);
        setFailed(false);
        try {
            // Archived forms come from their own list (decision 31).
            const [data, archivedData] = await Promise.all([
                apiFetch<Form[]>("/forms"),
                showArchived ? apiFetch<Form[]>("/forms?archived=1") : Promise.resolve(null),
            ]);
            setForms(Array.isArray(data) ? data : []);
            if (archivedData) setArchivedForms(Array.isArray(archivedData) ? archivedData : []);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [showArchived]);
    useEffect(() => { fetchForms(); }, [fetchForms]);

    const handleCreate = async () => {
        if (!newFormName.trim()) {
            setNameError("Give the form a name.");
            return;
        }
        setCreating(true);
        try {
            const created = await apiFetch<{ id: string }>("/forms", { method: "POST", body: JSON.stringify({ name: newFormName.trim(), asDraft: true }) });
            toast.success("Form created");
            setCreateOpen(false);
            setNewFormName("");
            router.push(`/dashboard/forms/${created.id}`);
        } catch (error: any) {
            setNameError(error?.message || "The form couldn't be created. Try again.");
        } finally {
            setCreating(false);
        }
    };

    const copyLink = async (form: Form) => {
        try {
            await navigator.clipboard.writeText(publicFormUrl(form.slug));
            toast.success("Public link copied");
        } catch {
            toast.error("The link couldn't be copied");
        }
    };

    // Delete archives, with Undo; archived forms restore or delete for good (UI/UX plan §11.6 D).
    const archiveActions = useArchiveActions({
        basePath: "/forms",
        noun: "form",
        consequence: (item) => {
            const submissions = (item as Form)._count?.submissions ?? 0;
            return submissions ? `its ${formatCount(submissions)} submissions` : null;
        },
        onChange: fetchForms,
    });
    // The table's columns are memoised; the row menu reaches the latest handlers through a ref.
    const handlers = useRef({ copyLink, archiveActions });
    useEffect(() => { handlers.current = { copyLink, archiveActions }; });

    const counts = useMemo(() => ({
        all: forms.length,
        live: forms.filter((form) => form.isActive).length,
        draft: forms.filter((form) => !form.isActive).length,
    }), [forms]);
    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        return (showArchived ? archivedForms : forms).filter((form) =>
            (status === "all" || status === "archived" || (status === "live") === form.isActive) &&
            (!term || form.name.toLowerCase().includes(term) || (form.description ?? "").toLowerCase().includes(term)),
        );
    }, [forms, archivedForms, showArchived, search, status]);

    const columns = useMemo<ColumnDef<Form, any>[]>(() => [
        {
            accessorKey: "name",
            header: "Name",
            size: 320,
            cell: ({ row }) => (
                <div className="min-w-0 py-1">
                    <Link href={`/dashboard/forms/${row.original.id}`} className="font-medium hover:underline" onClick={(event) => event.stopPropagation()}>
                        {row.original.name}
                    </Link>
                    {row.original.description ? <div className="max-w-[360px] truncate text-xs text-muted-foreground">{row.original.description}</div> : null}
                </div>
            ),
        },
        {
            accessorKey: "isActive",
            header: "Status",
            size: 100,
            cell: ({ row }) => row.original.deletedAt
                ? <span className="flex flex-col gap-0.5"><Badge tone="warning">Archived</Badge><span className="text-xs text-muted-foreground">Deleted on {purgeDate(row.original.deletedAt)}</span></span>
                : !row.original.publishedVersion
                    ? <Badge tone="info">Draft</Badge>
                    : <span className="flex flex-col gap-0.5">
                        <Badge tone={row.original.isActive ? "success" : "neutral"}>{row.original.isActive ? "Live" : "Off"}</Badge>
                        {row.original.draft ? <span className="text-xs text-muted-foreground">Unpublished changes</span> : null}
                    </span>,
        },
        {
            id: "submissions",
            accessorFn: (form) => form._count?.submissions ?? 0,
            header: "Submissions",
            size: 120,
            cell: ({ row }) => <span className="text-sm tabular-nums">{formatCount(row.original._count?.submissions ?? 0)}</span>,
        },
        {
            accessorKey: "createdAt",
            header: "Created",
            size: 120,
            cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatWorkspaceDate(row.original.createdAt)}</span>,
        },
    ], []);

    const narrowed = !!search.trim() || status !== "all";

    return (
        <div className="mx-auto min-w-0 max-w-[1600px]">
            <PageHeader
                title="Forms"
                description="Lead capture forms for your website and campaigns."
                meta={loading || failed ? undefined : <span className="tabular-nums">{formatCount(counts.live)} live · {formatCount(counts.draft)} off</span>}
                secondaryActions={<QueueExportButton moduleName="FORMS" filters={{ search: search || null }} />}
                primaryAction={<Button onClick={() => { setNameError(null); setCreateOpen(true); }}><Plus className="size-4" />New form</Button>}
            />
            <DataTable
                storageKey="forms-table"
                data={visible}
                columns={columns}
                loading={loading}
                error={failed ? "The forms couldn't be loaded." : null}
                onRetry={fetchForms}
                clientSort
                getRowId={(row) => row.id}
                onRowClick={(row) => router.push(`/dashboard/forms/${row.id}`)}
                toolbarActions={
                    <ListToolbar
                        search={{ value: search, onChange: setSearch, placeholder: "Search forms", label: "Search forms", inputId: "forms-search" }}
                        quickFilters={[
                            { value: "all", label: "All", count: counts.all },
                            { value: "live", label: "Live", count: counts.live },
                            { value: "draft", label: "Off", count: counts.draft },
                            { value: "archived", label: "Archived" },
                        ]}
                        quickFilter={status}
                        onQuickFilterChange={(value) => setStatus(value as StatusFilter)}
                    />
                }
                rowActions={(form) => (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${form.name}`} onClick={(event) => event.stopPropagation()}>
                                <MoreHorizontal className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                            {form.deletedAt ? (
                                <>
                                    {canManage(form) ? <>
                                        <DropdownMenuItem onSelect={() => handlers.current.archiveActions.restore(form)}><ArchiveRestore className="size-4" />Restore</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem variant="destructive" onSelect={() => handlers.current.archiveActions.deletePermanently(form)}><Trash2 className="size-4" />Delete for good</DropdownMenuItem>
                                    </> : <DropdownMenuItem disabled>Only its creator or an admin can restore it</DropdownMenuItem>}
                                </>
                            ) : (
                                <>
                                    <DropdownMenuItem asChild><Link href={`/dashboard/forms/${form.id}`}><Pencil className="size-4" />Open in editor</Link></DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => handlers.current.copyLink(form)}><Copy className="size-4" />Copy public link</DropdownMenuItem>
                                    <DropdownMenuItem asChild><a href={publicFormPath(form.slug)} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />Open public form</a></DropdownMenuItem>
                                    {canManage(form) ? <DropdownMenuSeparator /> : null}
                                    {canManage(form) ? <DropdownMenuItem variant="destructive" onSelect={() => handlers.current.archiveActions.archive(form)}><Archive className="size-4" />Archive</DropdownMenuItem> : null}
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
                mobileCard={(form) => (
                    <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 break-words font-medium">{form.name}</span>
                            <Badge tone={!form.publishedVersion ? "info" : form.isActive ? "success" : "neutral"}>{!form.publishedVersion ? "Draft" : form.isActive ? "Live" : "Off"}</Badge>
                        </div>
                        {form.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{form.description}</p> : null}
                        <p className="text-xs text-muted-foreground">{formatCount(form._count?.submissions ?? 0)} submissions · created {formatWorkspaceDate(form.createdAt)}</p>
                    </div>
                )}
                emptyState={showArchived && !search.trim() ? {
                    icon: <Archive />,
                    title: "Nothing archived",
                    description: "Archived forms stay here for 30 days, then they're deleted with their submissions.",
                } : narrowed ? {
                    kind: "no-match",
                    title: "No forms match",
                    description: "Try another search or status.",
                    action: <Button variant="outline" onClick={() => { setSearch(""); setStatus("all"); }}>Clear search and filter</Button>,
                } : {
                    icon: <FileText />,
                    title: "No forms yet",
                    description: "Create a form to collect leads from your website or a campaign.",
                    action: <Button onClick={() => { setNameError(null); setCreateOpen(true); }}><Plus className="size-4" />New form</Button>,
                }}
            />

            <StandardDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                title="New form"
                subtitle="Name it now; add fields in the editor."
                maxWidth="xs"
                actions={
                    <>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreate} isLoading={creating}>Create and edit</Button>
                    </>
                }
            >
                <div className="space-y-1.5">
                    <Label htmlFor="new-form-name">Form name</Label>
                    <Input
                        id="new-form-name"
                        autoFocus
                        placeholder="For example: Contact us"
                        value={newFormName}
                        aria-invalid={!!nameError}
                        aria-describedby={nameError ? "new-form-name-error" : undefined}
                        onChange={(e) => { setNewFormName(e.target.value); if (nameError) setNameError(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                    />
                    {nameError ? <p id="new-form-name-error" className="text-xs text-destructive">{nameError}</p> : null}
                </div>
            </StandardDialog>
        </div>
    );
}
