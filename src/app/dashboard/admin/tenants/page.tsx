"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Ban, Building2, CheckCircle, MoreVertical, Plus, Settings } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button as IconButton } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/providers/auth-provider";
import { toast } from "sonner";
import { FeaturesDialog } from "@/components/admin/features-dialog";
import { CreateTenantDialog } from "@/components/admin/create-tenant-dialog";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDate } from "@/lib/date-format";

interface Tenant {
    id: string;
    name: string;
    plan: string;
    status: string;
    createdAt: string;
    _count: {
        users: number;
        leads: number;
        opportunities: number;
    };
}

export default function TenantsPage() {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const { token, user } = useAuth();

    const fetchTenants = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/platform-admin/tenants`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setTenants(data);
            } else {
                toast.error("Failed to fetch tenants");
            }
        } catch (error) {
            toast.error("Failed to load tenants");
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchTenants();
    }, [fetchTenants]);

    const updateTenantStatus = async (tenant: Tenant, status: string) => {
        try {
            await apiFetch(`/platform-admin/tenants/${tenant.id}/status`, {
                method: "PATCH",
                body: JSON.stringify({ status }),
            });
            toast.success(`Tenant ${status.toLowerCase()}d successfully`);
            fetchTenants();
        } catch (error: any) {
            toast.error(error.message || "Failed to update tenant status");
        }
    };

    const columns = useMemo<ColumnDef<Tenant, any>[]>(() => [
        {
            accessorKey: 'name',
            header: 'Organization',
            size: 280,
            cell: ({ row }) => (
                <div className="flex h-full items-center gap-3">
                    <Avatar className="size-9 rounded-lg bg-primary/10 text-primary">
                        <AvatarFallback className="rounded-lg bg-primary/10">
                            <Building2 className="size-5" />
                        </AvatarFallback>
                    </Avatar>
                    <div>
                        <div className="text-sm font-bold text-foreground">{row.original.name}</div>
                        <div className="text-xs text-muted-foreground opacity-70">{row.original.plan ?? "Tenant"}</div>
                    </div>
                </div>
            )
        },
        {
            accessorKey: 'plan',
            header: 'Plan',
            size: 140,
            cell: ({ row }) => (
                <Badge variant="outline" className="border-secondary/20 bg-secondary/10 font-bold uppercase text-secondary">
                    {row.original.plan}
                </Badge>
            )
        },
        {
            accessorKey: 'status',
            header: 'Status',
            size: 140,
            cell: ({ row }) => {
                const status = row.original.status;
                const statusClassName = status === 'SUSPENDED'
                    ? "border-destructive/20 bg-destructive/10 text-destructive"
                    : status === 'TRIAL'
                        ? "border-tertiary/25 bg-tertiary/10 text-tertiary"
                        : status === 'ACTIVE'
                            ? "border-primary/20 bg-primary/10 text-primary"
                            : "border-border bg-muted text-muted-foreground";

                return (
                    <Badge variant="outline" className={`font-bold uppercase ${statusClassName}`}>
                        {status}
                    </Badge>
                );
            }
        },
        {
            id: 'users',
            header: 'Users',
            size: 100,
            cell: ({ row }) => (
                <span className="text-sm font-semibold">{row.original._count.users}</span>
            )
        },
        {
            id: 'data',
            header: 'Data Usage',
            size: 180,
            cell: ({ row }) => (
                <div>
                    <div className="text-sm font-semibold">{row.original._count.leads} Leads</div>
                    <div className="text-xs text-muted-foreground">{row.original._count.opportunities} Opportunities</div>
                </div>
            )
        },
        {
            accessorKey: 'createdAt',
            header: 'Created',
            size: 140,
            cell: ({ row }) => (
                <span className="text-xs text-muted-foreground">
                    {formatWorkspaceDate(row.original.createdAt)}
                </span>
            )
        },
        {
            id: 'actions',
            header: '',
            size: 140,
            cell: ({ row }) => (
                <div className="flex items-center justify-end gap-1">
                    <FeaturesDialog
                        tenantId={row.original.id}
                        tenantName={row.original.name}
                        trigger={
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <IconButton variant="ghost" size="icon-sm">
                                        <Settings className="size-4" />
                                    </IconButton>
                                </TooltipTrigger>
                                <TooltipContent>Manage Features</TooltipContent>
                            </Tooltip>
                        }
                    />
                    <DropdownMenu>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild>
                                    <IconButton variant="ghost" size="icon-sm">
                                        <MoreVertical className="size-4" />
                                    </IconButton>
                                </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent>More Actions</TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent align="end" className="w-52">
                            {row.original.status === "ACTIVE" ? (
                                <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => updateTenantStatus(row.original, "SUSPENDED")}
                                >
                                    <Ban className="size-4" />
                                    Suspend Tenant
                                </DropdownMenuItem>
                            ) : (
                                <DropdownMenuItem
                                    className="text-primary focus:text-primary"
                                    onClick={() => updateTenantStatus(row.original, "ACTIVE")}
                                >
                                    <CheckCircle className="size-4" />
                                    Activate Tenant
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            )
        }
    ], [fetchTenants]);

    if (!user?.isPlatformAdmin) {
        return (
            <div className="px-4 py-10 text-center">
                <h1 className="text-xl font-semibold text-foreground">Access Denied</h1>
                <p className="mt-1 text-sm text-muted-foreground">You do not have platform administrator privileges.</p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[1600px] px-4 py-4 md:px-6">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-xl font-semibold tracking-normal text-foreground">Tenants</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Platform administration and multi-tenant management
                    </p>
                </div>
                <IconButton onClick={() => setCreateDialogOpen(true)}>
                    <Plus className="size-4" />
                    Create Tenant
                </IconButton>
            </div>

            <div className="min-h-[600px]">
                <DataTable
                    storageKey="admin-tenants-table"
                    data={tenants}
                    columns={columns}
                    loading={loading}
                    getRowId={(row) => row.id}
                    emptyState={{
                        icon: <Building2 className="size-10 text-muted-foreground opacity-50" />,
                        title: "No tenants found",
                        description: "Create a tenant to begin managing the platform.",
                    }}
                />
            </div>

            <CreateTenantDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                onSuccess={fetchTenants}
            />
        </div>
    );
}
