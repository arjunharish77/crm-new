"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Building, Coins, Activity } from "lucide-react";

export default function PlatformAdminDashboard() {
    const [stats, setStats] = useState({
        totalTenants: 0,
        totalUsers: 0,
        activeTenants: 0,
        totalLeads: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        apiFetch('/platform-admin/tenants')
            .then((tenants: any[]) => {
                const totalTenants = tenants.length;
                const activeTenants = tenants.filter(t => t.status === 'ACTIVE').length;
                const totalUsers = tenants.reduce((acc, t) => acc + (t._count?.users || 0), 0);
                const totalLeads = tenants.reduce((acc, t) => acc + (t._count?.leads || 0), 0);

                setStats({ totalTenants, totalUsers, activeTenants, totalLeads });
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="p-8">Loading dashboard...</div>;

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold tracking-tight">Dashboard Overview</h2>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Revenue (Est)</CardTitle>
                        <Coins className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">$0.00</div>
                        <p className="text-xs text-muted-foreground">
                            Billing integration pending
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Activity or Tenant List Snippet could go here */}
        </div>
    );
}
