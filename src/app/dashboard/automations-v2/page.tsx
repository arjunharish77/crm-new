'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Search, ListFilter, Pencil, Trash2 } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';
import { Bolt, GitBranch, History, MoreVertical, Workflow } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button as IconButton } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

interface Automation {
    id: string;
    name: string;
    description?: string;
    isActive: boolean;
    trigger: any;
    workflow: any;
    createdAt: string;
    _count?: {
        executions: number;
    };
}

export default function AutomationsV2Page() {
    const router = useRouter();
    const [automations, setAutomations] = useState<Automation[]>([]);
    const [loading, setLoading] = useState(true);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchAutomations = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch('/automation-v2');
            setAutomations(data);
        } catch (error) {
            console.error('Failed to fetch automations:', error);
            setAutomations([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAutomations();
    }, [fetchAutomations]);

    const deleteAutomation = async (id: string) => {
        if (!confirm('Are you sure you want to delete this automation?')) return;

        try {
            await apiFetch(`/automation-v2/${id}`, { method: 'DELETE' });
            setAutomations(automations.filter((a) => a.id !== id));
            toast.success("Automation deleted");
        } catch (error) {
            console.error('Failed to delete automation:', error);
            toast.error("Failed to delete automation");
        }
    };

    const filteredAutomations = automations.filter(a =>
        a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.description && a.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const columns = useMemo<ColumnDef<Automation, any>[]>(() => [
        {
            accessorKey: 'name',
            header: 'Automation Name',
            size: 280,
            cell: ({ row }) => (
                <div className="py-1">
                    <div className="text-sm font-bold text-primary">{row.original.name}</div>
                    <div className="block max-w-[320px] truncate text-xs text-muted-foreground">
                        {row.original.description || "No description"}
                    </div>
                </div>
            )
        },
        {
            accessorKey: 'isActive',
            header: 'Status',
            size: 120,
            cell: ({ row }) => (
                <Badge
                    variant="outline"
                    className={
                        row.original.isActive
                            ? "border-primary/20 bg-primary/10 font-bold uppercase text-primary"
                            : "border-border bg-muted font-bold uppercase text-muted-foreground"
                    }
                >
                    {row.original.isActive ? 'Active' : 'Inactive'}
                </Badge>
            )
        },
        {
            accessorKey: 'trigger',
            header: 'Trigger',
            size: 180,
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <Bolt className="size-4 text-secondary" />
                    <span className="text-sm font-semibold">{row.original.trigger?.type?.replace('_', ' ') || 'Manual'}</span>
                </div>
            )
        },
        {
            id: 'steps',
            header: 'Steps',
            size: 100,
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <GitBranch className="size-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">{row.original.workflow?.nodes?.length || 0}</span>
                </div>
            )
        },
        {
            id: 'runs',
            header: 'Runs',
            size: 100,
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <History className="size-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">{row.original._count?.executions || 0}</span>
                </div>
            )
        },
        {
            id: 'actions',
            header: '',
            size: 80,
            cell: ({ row }) => (
                <DropdownMenu
                    open={openMenuId === row.original.id}
                    onOpenChange={(open) => setOpenMenuId(open ? row.original.id : null)}
                >
                    <DropdownMenuTrigger asChild>
                        <IconButton
                            variant="ghost"
                            size="icon-sm"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <MoreVertical className="size-4" />
                        </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                        <DropdownMenuItem onClick={() => router.push(`/dashboard/automations-v2/${row.original.id}`)}>
                            <Pencil className="size-4" />
                            Edit Designer
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            variant="destructive"
                            onClick={() => deleteAutomation(row.original.id)}
                        >
                            <Trash2 className="size-4" />
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        }
    ], [router]);

    return (
        <div className="mx-auto max-w-[1600px] p-3 md:p-4">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold tracking-[-0.5px]">Workflow Automations</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Build and manage visual workflows to automate your sales processes
                    </p>
                </div>
                <Button className="rounded-xl" onClick={() => router.push('/dashboard/automations-v2/new')}>
                    <Plus className="size-4" />
                    New Automation
                </Button>
            </div>

            <div className="mb-6 flex gap-2">
                <div className="relative w-80">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search automations..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="rounded-xl pl-10"
                    />
                </div>
                <Button variant="outline" className="rounded-xl border-dashed">
                    <ListFilter className="size-4" />
                    Filters
                </Button>
            </div>

            <div className="h-[calc(100vh-280px)] min-h-[600px]">
                <DataTable
                    storageKey="automations-v2-table"
                    data={filteredAutomations}
                    columns={columns}
                    loading={loading}
                    getRowId={(row) => row.id}
                    onRowClick={(row) => router.push(`/dashboard/automations-v2/${row.id}`)}
                    emptyState={{
                        icon: <Workflow className="size-10 text-muted-foreground opacity-50" />,
                        title: "No automations found",
                        description: "Create an automation to start streamlining your sales process.",
                    }}
                />
            </div>
        </div>
    );
}
