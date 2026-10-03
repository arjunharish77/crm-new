"use client";

import { PageHeader } from "@/components/layout/page-header";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Shield, AlertTriangle, Info } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { toast } from "sonner";

// F23 fix (WP11): this page previously called an API route that didn't exist at all
// (/api/platform-admin/rate-limits/stats), silently falling back to 0 for every figure --
// indistinguishable from "genuinely zero violations." The route now exists and returns real
// data, but there is no PERSISTENT rate-limit violation log in this app (the underlying Redis
// counters are intentionally ephemeral, ~10-minute windows) -- so this shows a live snapshot of
// currently-active violations, explicitly labeled as such, rather than fabricating an "all
// time"/"last 24h" history this system doesn't actually track.
interface RateLimitSnapshot {
    live: boolean;
    scanned: boolean;
    totalActive: number;
    byTenant: { tenantId: string; tenantName: string; violationCount: number }[];
    byCategory: { category: string; violationCount: number }[];
}

export default function RateLimitsPage() {
    const [stats, setStats] = useState<RateLimitSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [unavailable, setUnavailable] = useState(false);
    const { isAuthenticated, user } = useAuth();

    useEffect(() => {
        if (isAuthenticated) {
            fetchStats();
        }
    }, [isAuthenticated]);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/platform-admin/rate-limits/stats`);

            if (res.ok) {
                const data = await res.json();
                setStats(data);
                setUnavailable(!data.scanned);
            } else {
                setUnavailable(true);
                toast.error("Failed to fetch rate limit stats");
            }
        } catch (error) {
            setUnavailable(true);
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
        <div className="min-w-0 space-y-4">
            <PageHeader title="Rate limits" description="Requests turned away for going over the limits, by workspace and user." />

            {unavailable && (
                <Card className="border-status-warning-foreground/30 bg-status-warning">
                    <CardContent className="flex items-center gap-3 pt-6">
                        <Info className="size-5 shrink-0 text-status-warning-foreground" aria-hidden />
                        <p className="text-sm text-muted-foreground">
                            Live violation data is unavailable right now (Redis unreachable, or not configured in
                            this environment). This is not the same as zero violations -- the underlying rate
                            limiter itself still fails safe independently of this dashboard.
                        </p>
                    </CardContent>
                </Card>
            )}

            {!unavailable && (
                <Card className="border-status-info">
                    <CardContent className="flex items-center gap-3 pt-6">
                        <Info className="h-5 w-5 text-blue-500 shrink-0" />
                        <p className="text-sm text-muted-foreground">
                            This is a <strong>live snapshot</strong> of currently-active violation counters
                            (roughly the last 10 minutes) -- this app does not keep a persistent, longer-term
                            rate-limit violation log.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Violations</CardTitle>
                        <Shield className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{unavailable ? "—" : stats?.totalActive ?? 0}</div>
                        <p className="text-xs text-muted-foreground">Right now, across all tenants</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tenants Affected</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{unavailable ? "—" : stats?.byTenant.length ?? 0}</div>
                        <p className="text-xs text-muted-foreground">Currently over a rate limit</p>
                    </CardContent>
                </Card>
            </div>

            {/* Top Violating Tenants */}
            <Card>
                <CardHeader>
                    <CardTitle>Tenants With Active Violations</CardTitle>
                    <CardDescription>Live, not a historical ranking</CardDescription>
                </CardHeader>
                <CardContent>
                    {stats?.byTenant && stats.byTenant.length > 0 ? (
                        <div className="space-y-2">
                            {stats.byTenant.map((tenant) => (
                                <div
                                    key={tenant.tenantId}
                                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                                >
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">{tenant.tenantName}</p>
                                        <p className="text-xs text-muted-foreground">Tenant workspace</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-destructive">
                                            {tenant.violationCount}
                                        </p>
                                        <p className="text-xs text-muted-foreground">active violations</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            {unavailable ? "Unavailable" : "No active violations right now"}
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* By Category */}
            <Card>
                <CardHeader>
                    <CardTitle>By Category</CardTitle>
                    <CardDescription>
                        Which limiter is being hit (e.g. general per-user/per-tenant, login, OTP) -- not a
                        per-endpoint breakdown, since limits in this app are scoped to a category, not a URL.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {stats?.byCategory && stats.byCategory.length > 0 ? (
                        <div className="space-y-2">
                            {stats.byCategory.map((row) => (
                                <div
                                    key={row.category}
                                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                                >
                                    <p className="text-sm font-mono">{row.category}</p>
                                    <div className="text-right">
                                        <p className="text-sm font-bold">{row.violationCount}</p>
                                        <p className="text-xs text-muted-foreground">active violations</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            {unavailable ? "Unavailable" : "No active violations right now"}
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
