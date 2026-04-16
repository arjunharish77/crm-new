"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Shield, AlertTriangle, TrendingDown } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { toast } from "sonner";

interface RateLimitStats {
    totalBlocked: number;
    last24h: number;
    topTenants: {
        tenantId: string;
        tenantName: string;
        violationCount: number;
    }[];
    topEndpoints: {
        endpoint: string;
        violationCount: number;
    }[];
}

export default function RateLimitsPage() {
    const [stats, setStats] = useState<RateLimitStats | null>(null);
    const [loading, setLoading] = useState(true);
    const { token, user } = useAuth();

    useEffect(() => {
        if (token) {
            fetchStats();
        }
    }, [token]);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/platform-admin/rate-limits/stats`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            if (res.ok) {
                const data = await res.json();
                setStats(data);
            } else {
                toast.error("Failed to fetch rate limit stats");
            }
        } catch (error) {
            toast.error("Failed to load rate limit stats");
        } finally {
            setLoading(false);
        }
    };

    if (!user?.isPlatformAdmin) {
        return <div className="p-8 text-center">You do not have permission to view this page.</div>;
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Rate Limiting Dashboard</h2>
            </div>

            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Violations</CardTitle>
                        <Shield className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.totalBlocked || 0}</div>
                        <p className="text-xs text-muted-foreground">All time</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Last 24 Hours</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.last24h || 0}</div>
                        <p className="text-xs text-muted-foreground">Recent violations</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Rate Limit</CardTitle>
                        <TrendingDown className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">100/min</div>
                        <p className="text-xs text-muted-foreground">Requests per minute</p>
                    </CardContent>
                </Card>
            </div>

            {/* Top Violating Tenants */}
            <Card>
                <CardHeader>
                    <CardTitle>Top Violating Tenants</CardTitle>
                    <CardDescription>Tenants with the most rate limit violations</CardDescription>
                </CardHeader>
                <CardContent>
                    {stats?.topTenants && stats.topTenants.length > 0 ? (
                        <div className="space-y-2">
                            {stats.topTenants.map((tenant) => (
                                <div
                                    key={tenant.tenantId}
                                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                                >
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">{tenant.tenantName}</p>
                                        <p className="text-xs text-muted-foreground">
                                            ID: {tenant.tenantId}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-red-500">
                                            {tenant.violationCount}
                                        </p>
                                        <p className="text-xs text-muted-foreground">violations</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            No violations recorded
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Top Rate-Limited Endpoints */}
            <Card>
                <CardHeader>
                    <CardTitle>Most Rate-Limited Endpoints</CardTitle>
                    <CardDescription>Endpoints with the most violations</CardDescription>
                </CardHeader>
                <CardContent>
                    {stats?.topEndpoints && stats.topEndpoints.length > 0 ? (
                        <div className="space-y-2">
                            {stats.topEndpoints.map((endpoint, index) => (
                                <div
                                    key={index}
                                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                                >
                                    <p className="text-sm font-mono">{endpoint.endpoint}</p>
                                    <div className="text-right">
                                        <p className="text-sm font-bold">{endpoint.violationCount}</p>
                                        <p className="text-xs text-muted-foreground">violations</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            No violations recorded
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
