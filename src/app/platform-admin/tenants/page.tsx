"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { ColumnDef } from "@tanstack/react-table";
import { Ban, CheckCircle2, Building2 } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button as IconButton } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatWorkspaceRelativeTime } from "@/lib/date-format";
import { toast } from "sonner";
import { CreateTenantDialog } from "./create-tenant-dialog";
import { BulkActionsToolbar } from "@/components/bulk-actions/bulk-toolbar";

export default function TenantsPage() {
    const [tenants, setTenants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRows, setSelectedRows] = useState<string[]>([]);
    const [isAllSelected, setIsAllSelected] = useState(false);
    const [totalItems, setTotalItems] = useState(0);

    const fetchTenants = useCallback(() => {
        setLoading(true);
        apiFetch('/platform-admin/tenants')
            .then((data) => {
                const safeData = Array.isArray(data) ? data : [];
                setTenants(safeData);
                setTotalItems(safeData.length);
            })
            .catch(() => toast.error("Failed to load tenants"))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchTenants();
    }, [fetchTenants]);

    const handleSuspend = async (tenantId: string, currentStatus: string) => {
        const isSuspended = currentStatus === 'SUSPENDED';
        const action = isSuspended ? 'unsuspend' : 'suspend';

        if (!confirm(`Are you sure you want to ${action} this tenant?`)) return;

        try {
            await apiFetch(`/platform-admin/tenants/${tenantId}/${action}`, {
                method: 'POST',
                body: isSuspended ? undefined : JSON.stringify({ reason: 'Admin Action' })
            });
            toast.success(`Tenant ${action}ed`);
            fetchTenants();
        } catch (error) {
            toast.error(`Failed to ${action} tenant`);
        }
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Are you sure you want to delete ${selectedRows.length} tenants?`)) return;
        // Mock bulk delete
        toast.success("Tenants deleted (mock)");
        setTenants(prev => prev.filter(t => !selectedRows.includes(t.id)));
        setSelectedRows([]);
        setIsAllSelected(false);
    };

    const handleSelectAllFiltered = () => {
        setSelectedRows(tenants.map((tenant) => tenant.id));
        setIsAllSelected(true);
        toast.success(`All ${totalItems} tenants selected`);
    };

    const clearSelection = () => {
        setSelectedRows([]);
        setIsAllSelected(false);
    };

    const columns = useMemo<ColumnDef<any, any>[]>(() => [
        {
            accessorKey: 'name',
            header: 'Name',
            size: 240,
            cell: ({ row }) => (
                <div>
                    <div className="text-sm font-semibold text-foreground">{row.original.name}</div>
                    <div className="text-xs text-muted-foreground">{row.original.plan ?? "Tenant"}</div>
                </div>
            ),
        },
        {
            accessorKey: 'status',
            header: 'Status',
            size: 120,
            cell: ({ row }) => {
                const isSuspended = row.original.status === 'SUSPENDED';
                return (
                    <Badge
                        variant="outline"
                        className={
                            isSuspended
                                ? "border-destructive/20 bg-destructive/10 font-semibold text-destructive"
                                : "border-primary/20 bg-primary/10 font-semibold text-primary"
                        }
                    >
                        {row.original.status}
                    </Badge>
                );
            },
        },
        {
            accessorKey: 'plan',
            header: 'Plan',
            size: 120,
            cell: ({ row }) => (
                <Badge variant="outline" className="border-primary/20 bg-primary/10 font-semibold text-primary">
                    {row.original.plan}
                </Badge>
            ),
        },
        {
            id: 'users',
            header: 'Users',
            size: 100,
            cell: ({ row }) => (
                <span className="text-sm text-muted-foreground">{row.original._count?.users || 0} users</span>
            )
        },
        {
            accessorKey: 'createdAt',
            header: 'Created',
            size: 150,
            cell: ({ row }) => (
                <span className="text-xs text-muted-foreground">
                    {formatWorkspaceRelativeTime(row.original.createdAt)}
                </span>
            ),
        },
        {
            id: 'actions',
            header: '',
            size: 100,
            cell: ({ row }) => (
                <div className="flex gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <IconButton
                                variant="ghost"
                                size="icon-sm"
                                className={row.original.status === 'SUSPENDED' ? "text-primary hover:bg-primary/10" : "text-tertiary hover:bg-tertiary/10"}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleSuspend(row.original.id, row.original.status);
                                }}
                            >
                                {row.original.status === 'SUSPENDED' ? <CheckCircle2 className="size-4" /> : <Ban className="size-4" />}
                            </IconButton>
                        </TooltipTrigger>
                        <TooltipContent>{row.original.status === 'SUSPENDED' ? "Unsuspend" : "Suspend"}</TooltipContent>
                    </Tooltip>
                </div>
            ),
        },
    ], [handleSuspend]);

    return (
        <div className="mx-auto max-w-[1600px] p-6">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-[-0.5px]">Tenants</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Manage workspaces and subscriptions.
                    </p>
                </div>
                <CreateTenantDialog onSuccess={fetchTenants} />
            </div>

            <Card className="h-[600px] w-full overflow-hidden">
                <DataTable
                    storageKey="platform-admin-tenants-table"
                    data={tenants || []}
                    columns={columns}
                    loading={loading}
                    getRowId={(row) => row?.id}
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
                    emptyState={{
                        icon: <Building2 className="size-10 text-muted-foreground opacity-50" />,
                        title: "No tenants found",
                        description: "Create a tenant to start managing workspaces.",
                    }}
                />
            </Card>

            <BulkActionsToolbar
                selectedCount={isAllSelected ? totalItems : selectedRows.length}
                onClearSelection={clearSelection}
                module="tenants"
                onDelete={handleBulkDelete}
            />
        </div>
    );
}
