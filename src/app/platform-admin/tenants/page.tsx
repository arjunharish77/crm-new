"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { Ban, Building2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ListToolbar } from "@/components/common/list-toolbar";
import { useAskText } from "@/components/common/dialogs-provider";
import { IconButton } from "@/components/ui/icon-button";
import { DataTable } from "@/components/ui/data-table";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDate } from "@/lib/date-format";
import { formatCount } from "@/lib/display/format";
import { CreateTenantDialog } from "./create-tenant-dialog";

type Tenant = { id: string; name: string; status: string; plan?: string | null; environment?: string | null; createdAt: string; _count?: { users?: number } };

const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = { ACTIVE: "success", SUSPENDED: "danger", TRIAL: "warning" };

// Platform admin › Tenants (UI/UX plan §11.5): each row opens the tenant's page, and Suspend says
// what it does and goes through approval when that's switched on. The selection bar had no
// actions, so the list no longer offers selection.
export default function TenantsPage() {
    const router = useRouter();
    const askText = useAskText();
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loadError, setLoadError] = useState(false);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const fetchTenants = useCallback(() => {
        setLoading(true);
        setLoadError(false);
        apiFetch<Tenant[]>("/platform-admin/tenants")
            .then((data) => setTenants(Array.isArray(data) ? data : []))
            .catch(() => setLoadError(true))
            .finally(() => setLoading(false));
    }, []);
    useEffect(() => { fetchTenants(); }, [fetchTenants]);

    const toggleSuspend = useCallback(async (tenant: Tenant) => {
        const suspending = tenant.status !== "SUSPENDED";
        // A suspension needs a reason; both are recorded in the workspace's audit log (Section 8 #12).
        const reason = await askText(suspending
            ? { title: `Suspend ${tenant.name}?`, description: "Everyone in this workspace is signed out straight away and can't sign in until it is unsuspended. Their data is kept.", label: "Reason (kept in the workspace's audit log)", required: true, confirmLabel: "Suspend workspace", destructive: true }
            : { title: `Unsuspend ${tenant.name}?`, description: "Its users can sign in again.", label: "Note (optional, kept in the workspace's audit log)", confirmLabel: "Unsuspend" });
        if (reason === null) return;
        try {
            const result = await apiFetch<{ pendingApproval?: boolean }>(`/platform-admin/tenants/${tenant.id}/${suspending ? "suspend" : "unsuspend"}`, { method: "POST", body: JSON.stringify({ reason }) });
            if (result?.pendingApproval) {
                toast.success("Sent for approval: another platform admin has to approve it first");
                return;
            }
            toast.success(suspending ? `${tenant.name} suspended` : `${tenant.name} unsuspended`);
            fetchTenants();
        } catch (error: any) {
            toast.error(error?.message || "The workspace's status couldn't be changed");
        }
    }, [askText, fetchTenants]);

    const columns = useMemo<ColumnDef<Tenant, any>[]>(() => [
        {
            accessorKey: "name", header: "Workspace", size: 260,
            cell: ({ row }) => (
                <div className="min-w-0">
                    <Link href={`/platform-admin/tenants/${row.original.id}`} onClick={(event) => event.stopPropagation()} className="block truncate font-medium hover:underline">{row.original.name}</Link>
                    <span className="block truncate font-mono text-xs text-muted-foreground">{row.original.id}</span>
                </div>
            ),
        },
        { accessorKey: "status", header: "Status", size: 120, cell: ({ row }) => <StatusBadge tone={STATUS_TONE[row.original.status] ?? "neutral"} label={row.original.status === "SUSPENDED" ? "Suspended" : row.original.status === "ACTIVE" ? "Active" : row.original.status} /> },
        { accessorKey: "environment", header: "Environment", size: 130, cell: ({ row }) => <span className="text-muted-foreground">{row.original.environment ? row.original.environment.charAt(0) + row.original.environment.slice(1).toLowerCase() : "—"}</span> },
        { id: "users", header: () => <span className="block text-right">Users</span>, size: 90, cell: ({ row }) => <span className="block text-right tabular-nums">{formatCount(row.original._count?.users ?? 0)}</span> },
        { accessorKey: "createdAt", header: "Created", size: 120, cell: ({ row }) => <span className="text-muted-foreground">{formatWorkspaceDate(row.original.createdAt)}</span> },
    ], []);

    const visible = tenants.filter((tenant) => !search.trim() || `${tenant.name} ${tenant.id}`.toLowerCase().includes(search.trim().toLowerCase()));

    return (
        <div className="min-w-0">
            <PageHeader title="Tenants" meta={loading ? undefined : <span className="tabular-nums">{formatCount(tenants.length)} workspaces</span>} primaryAction={<CreateTenantDialog onSuccess={fetchTenants} />} />
            {loadError ? <ErrorState description="The workspaces couldn't be loaded." onRetry={fetchTenants} /> : (
                <DataTable
                    storageKey="platform-admin-tenants-table"
                    data={visible}
                    columns={columns}
                    loading={loading}
                    getRowId={(row) => row.id}
                    onRowClick={(row) => router.push(`/platform-admin/tenants/${row.id}`)}
                    clientSort
                    toolbarActions={<ListToolbar search={{ value: search, onChange: setSearch, placeholder: "Search by name or id", label: "Search workspaces", inputId: "tenants-search" }} />}
                    rowActions={(tenant) => (
                        <IconButton
                            label={tenant.status === "SUSPENDED" ? `Unsuspend ${tenant.name}` : `Suspend ${tenant.name}`}
                            onClick={(event) => { event.stopPropagation(); toggleSuspend(tenant); }}
                            className={tenant.status === "SUSPENDED" ? "text-muted-foreground" : "text-muted-foreground hover:text-destructive"}
                        >
                            {tenant.status === "SUSPENDED" ? <CheckCircle2 className="size-4" /> : <Ban className="size-4" />}
                        </IconButton>
                    )}
                    mobileCard={(tenant) => (
                        <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{tenant.name}</span><StatusBadge tone={STATUS_TONE[tenant.status] ?? "neutral"} label={tenant.status === "SUSPENDED" ? "Suspended" : "Active"} /></div>
                            <div className="text-xs text-muted-foreground">{formatCount(tenant._count?.users ?? 0)} users · created {formatWorkspaceDate(tenant.createdAt)}</div>
                        </div>
                    )}
                    emptyState={search.trim()
                        ? { title: "No workspaces match", description: "Try another name or id.", kind: "no-match" }
                        : { icon: <Building2 />, title: "No workspaces yet", description: "Create a workspace to get started.", action: <CreateTenantDialog onSuccess={fetchTenants} /> }}
                />
            )}
        </div>
    );
}
