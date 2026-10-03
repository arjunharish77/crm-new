'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus, Power, Trash2, Workflow } from 'lucide-react';
import { purgeDate, useArchiveActions } from '@/hooks/use-archive-actions';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { ListToolbar } from '@/components/common/list-toolbar';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { triggerLabel } from '@/components/automations/trigger-types';
import { useUrlState } from '@/hooks/use-url-state';
import { useAuth } from '@/providers/auth-provider';
import { formatCount } from '@/lib/display/format';
import { formatWorkspaceDate } from '@/lib/date-format';

interface Automation {
    id: string;
    name: string;
    createdBy?: string | null;
    description?: string;
    isActive: boolean;
    trigger: any;
    workflow: any;
    createdAt: string;
    deletedAt?: string | null;
    publishedVersion?: number;
    hasDraft?: boolean;
    draftName?: string | null;
    _count?: { executions: number };
}

const STATUS_FILTERS = ['all', 'active', 'off', 'archived'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

// Marketing & automation › Automations (UI/UX plan §5.12): a load error shows an error, not "No
// automations"; the Filters button that did nothing is now a working On/Off filter; triggers read
// as words; the row menu is labelled; turning an automation on or off happens from the list.
export default function AutomationsV2Page() {
    const { user } = useAuth();
    // Archive, restore and delete for good: the creator or an admin (decided 2026-10-03).
    const canManage = (item: { createdBy?: string | null }) => !user || !!(user as any).isTenantAdmin || !!(user as any).isPlatformAdmin || (!!item.createdBy && item.createdBy === user.id);
    const router = useRouter();
    const [automations, setAutomations] = useState<Automation[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [search, setSearch] = useUrlState<string>('q', '');
    const [status, setStatus] = useUrlState<StatusFilter>('status', 'all', { allowed: STATUS_FILTERS });

    const [archivedItems, setArchivedItems] = useState<Automation[]>([]);
    const showArchived = status === 'archived';
    const fetchAutomations = useCallback(async () => {
        setLoading(true);
        setFailed(false);
        try {
            // Archived automations come from their own list (decision 31).
            const [data, archivedData] = await Promise.all([
                apiFetch<Automation[]>('/automation-v2'),
                showArchived ? apiFetch<Automation[]>('/automation-v2?archived=1') : Promise.resolve(null),
            ]);
            setAutomations(Array.isArray(data) ? data : []);
            if (archivedData) setArchivedItems(Array.isArray(archivedData) ? archivedData : []);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [showArchived]);
    useEffect(() => { fetchAutomations(); }, [fetchAutomations]);

    // Delete archives, with Undo; archived ones restore or delete for good (UI/UX plan §11.6 D).
    const archiveActions = useArchiveActions({
        basePath: '/automation-v2',
        noun: 'automation',
        consequence: (item) => {
            const runs = (item as Automation)._count?.executions ?? 0;
            return runs ? `its ${formatCount(runs)} past runs` : null;
        },
        onChange: fetchAutomations,
    });

    const setActive = async (automation: Automation, isActive: boolean) => {
        try {
            await apiFetch(`/automation-v2/${automation.id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) });
            setAutomations((current) => current.map((item) => (item.id === automation.id ? { ...item, isActive } : item)));
            toast.success(isActive ? `Turned on: ${automation.name}` : `Turned off: ${automation.name}`);
        } catch (error: any) {
            toast.error(error?.message || "The automation couldn't be changed");
        }
    };
    // The table's columns are memoised; the row menu reaches the latest handlers through a ref.
    const handlers = useRef({ archiveActions, setActive });
    useEffect(() => { handlers.current = { archiveActions, setActive }; });

    const counts = useMemo(() => ({
        all: automations.length,
        active: automations.filter((item) => item.isActive).length,
        off: automations.filter((item) => !item.isActive).length,
    }), [automations]);
    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        return (showArchived ? archivedItems : automations).filter((item) =>
            (status === 'all' || status === 'archived' || (status === 'active') === item.isActive) &&
            (!term || item.name.toLowerCase().includes(term) || (item.description ?? '').toLowerCase().includes(term) || triggerLabel(item.trigger?.type).toLowerCase().includes(term)),
        );
    }, [automations, archivedItems, showArchived, search, status]);

    const columns = useMemo<ColumnDef<Automation, any>[]>(() => [
        {
            accessorKey: 'name',
            header: 'Name',
            size: 300,
            cell: ({ row }) => (
                <div className="min-w-0 py-1">
                    <Link href={`/dashboard/automations-v2/${row.original.id}`} className="font-medium hover:underline" onClick={(event) => event.stopPropagation()}>
                        {!row.original.publishedVersion && row.original.draftName ? row.original.draftName : row.original.name}
                    </Link>
                    {row.original.description ? <div className="max-w-[360px] truncate text-xs text-muted-foreground">{row.original.description}</div> : null}
                </div>
            ),
        },
        {
            accessorKey: 'isActive',
            header: 'Status',
            size: 100,
            cell: ({ row }) => row.original.deletedAt
                ? <span className="flex flex-col gap-0.5"><Badge tone="warning">Archived</Badge><span className="text-xs text-muted-foreground">Deleted on {purgeDate(row.original.deletedAt)}</span></span>
                : !row.original.publishedVersion
                    ? <Badge tone="info">Draft</Badge>
                    : <span className="flex flex-col gap-0.5">
                        <Badge tone={row.original.isActive ? 'success' : 'neutral'}>{row.original.isActive ? 'On' : 'Off'}</Badge>
                        {row.original.hasDraft ? <span className="text-xs text-muted-foreground">Unpublished changes</span> : null}
                    </span>,
        },
        {
            id: 'trigger',
            header: 'Starts when',
            size: 220,
            cell: ({ row }) => <span className="text-sm">{triggerLabel(row.original.trigger?.type)}</span>,
        },
        {
            id: 'steps',
            header: 'Steps',
            size: 80,
            cell: ({ row }) => <span className="text-sm tabular-nums">{formatCount(row.original.workflow?.nodes?.length ?? 0)}</span>,
        },
        {
            id: 'runs',
            header: 'Runs',
            size: 80,
            cell: ({ row }) => <span className="text-sm tabular-nums">{formatCount(row.original._count?.executions ?? 0)}</span>,
        },
        {
            accessorKey: 'createdAt',
            header: 'Created',
            size: 120,
            cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatWorkspaceDate(row.original.createdAt)}</span>,
        },
    ], []);

    const narrowed = !!search.trim() || status !== 'all';

    return (
        <div className="mx-auto min-w-0 max-w-[1600px]">
            <PageHeader
                title="Automations"
                description="Workflows that run on their own when something happens in the CRM."
                meta={loading || failed ? undefined : <span className="tabular-nums">{formatCount(counts.active)} on · {formatCount(counts.off)} off</span>}
                primaryAction={<Button asChild><Link href="/dashboard/automations-v2/new"><Plus className="size-4" />New automation</Link></Button>}
            />
            <DataTable
                storageKey="automations-v2-table"
                data={visible}
                columns={columns}
                loading={loading}
                error={failed ? "The automations couldn't be loaded." : null}
                onRetry={fetchAutomations}
                clientSort
                getRowId={(row) => row.id}
                onRowClick={(row) => router.push(`/dashboard/automations-v2/${row.id}`)}
                toolbarActions={
                    <ListToolbar
                        search={{ value: search, onChange: setSearch, placeholder: 'Search automations', label: 'Search automations', inputId: 'automations-search' }}
                        quickFilters={[
                            { value: 'all', label: 'All', count: counts.all },
                            { value: 'active', label: 'On', count: counts.active },
                            { value: 'off', label: 'Off', count: counts.off },
                            { value: 'archived', label: 'Archived' },
                        ]}
                        quickFilter={status}
                        onQuickFilterChange={(value) => setStatus(value as StatusFilter)}
                    />
                }
                rowActions={(automation) => (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${automation.name}`} onClick={(event) => event.stopPropagation()}>
                                <MoreHorizontal className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                            {automation.deletedAt ? (
                                <>
                                    {canManage(automation) ? <>
                                        <DropdownMenuItem onSelect={() => handlers.current.archiveActions.restore(automation)}><ArchiveRestore className="size-4" />Restore</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem variant="destructive" onSelect={() => handlers.current.archiveActions.deletePermanently(automation)}><Trash2 className="size-4" />Delete for good</DropdownMenuItem>
                                    </> : <DropdownMenuItem disabled>Only its creator or an admin can restore it</DropdownMenuItem>}
                                </>
                            ) : (
                                <>
                                    <DropdownMenuItem asChild><Link href={`/dashboard/automations-v2/${automation.id}`}><Pencil className="size-4" />Open in builder</Link></DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => handlers.current.setActive(automation, !automation.isActive)}>
                                        <Power className="size-4" />{automation.isActive ? 'Turn off' : 'Turn on'}
                                    </DropdownMenuItem>
                                    {canManage(automation) ? <DropdownMenuSeparator /> : null}
                                    {canManage(automation) ? <DropdownMenuItem variant="destructive" onSelect={() => handlers.current.archiveActions.archive(automation)}>
                                        <Archive className="size-4" />Archive
                                    </DropdownMenuItem> : null}
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
                mobileCard={(automation) => (
                    <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 break-words font-medium">{automation.name}</span>
                            <Badge tone={automation.isActive ? 'success' : 'neutral'}>{automation.isActive ? 'On' : 'Off'}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">Starts when: {triggerLabel(automation.trigger?.type)}</p>
                        <p className="text-xs text-muted-foreground">{formatCount(automation.workflow?.nodes?.length ?? 0)} steps · {formatCount(automation._count?.executions ?? 0)} runs</p>
                    </div>
                )}
                emptyState={showArchived && !search.trim() ? {
                    icon: <Archive />,
                    title: 'Nothing archived',
                    description: `Archived automations stay here for 30 days, then they're deleted.`,
                } : narrowed ? {
                    kind: 'no-match',
                    title: 'No automations match',
                    description: 'Try another search or status.',
                    action: <Button variant="outline" onClick={() => { setSearch(''); setStatus('all'); }}>Clear search and filter</Button>,
                } : {
                    icon: <Workflow />,
                    title: 'No automations yet',
                    description: 'Automations send emails, assign leads, create tasks and more, on their own, when something happens.',
                    action: <Button asChild><Link href="/dashboard/automations-v2/new"><Plus className="size-4" />New automation</Link></Button>,
                }}
            />
        </div>
    );
}
