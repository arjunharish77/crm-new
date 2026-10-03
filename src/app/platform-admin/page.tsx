"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Building, Activity } from "lucide-react";

export default function PlatformAdminDashboard() {
    const [stats, setStats] = useState({
        totalTenants: 0,
        totalUsers: 0,
        activeTenants: 0,
        totalLeads: 0
    });
    const [loading, setLoading] = useState(true);

    const [loadError, setLoadError] = useState(false);
    const loadStats = useCallback(() => {
        setLoading(true); setLoadError(false);
        apiFetch('/platform-admin/tenants')
            .then((tenants: any[]) => {
                const totalTenants = tenants.length;
                const activeTenants = tenants.filter(t => t.status === 'ACTIVE').length;
                const totalUsers = tenants.reduce((acc, t) => acc + (t._count?.users || 0), 0);
                const totalLeads = tenants.reduce((acc, t) => acc + (t._count?.leads || 0), 0);

                setStats({ totalTenants, totalUsers, activeTenants, totalLeads });
            })
            .catch(() => setLoadError(true))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { loadStats(); }, [loadStats]);
    if (loading) return <p role="status">Loading dashboard...</p>;
    if (loadError) return <ErrorState description="Platform overview could not be loaded." onRetry={loadStats} />;

    return (
        <div className="@container/platform min-w-0 space-y-6">
            <PageHeader title="Overview" description="Workspaces, users and records across the platform." />

            <div className="grid gap-4 @min-[550px]/platform:grid-cols-2 @min-[1050px]/platform:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
                        <Building className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalTenants}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats.activeTenants} active
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalUsers}</div>
                        <p className="text-xs text-muted-foreground">
                            Across all organizations
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalLeads}</div>
                        <p className="text-xs text-muted-foreground">
                            System-wide volume
                        </p>
                    </CardContent>
                </Card>

            </div>

            {/* Recent Activity or Tenant List Snippet could go here */}
        </div>
    );
}
