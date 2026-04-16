"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users, Database, TrendingUp, Zap, CheckCircle, XCircle } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { toast } from "sonner";

interface UsageOverview {
    tenants: {
        total: number;
        active: number;
        suspended: number;
        trial: number;
    };
    users: {
        total: number;
        byTenant: { tenantId: string; count: number }[];
    };
    data: {
        leads: number;
        opportunities: number;
        activities: number;
    };
}

interface AutomationStats {
    totalRules: number;
    executions: {
        total: number;
        success: number;
        failed: number;
        last24h: number;
    };
    topRules: {
        ruleId: string;
        ruleName: string;
        executionCount: number;
    }[];
}

export default function UsagePage() {
    const [usage, setUsage] = useState<UsageOverview | null>(null);
    const [automation, setAutomation] = useState<AutomationStats | null>(null);
    const [loading, setLoading] = useState(true);
    const { token, user } = useAuth();

    useEffect(() => {
        if (token) {
            fetchData();
        }
    }, [token]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [usageRes, automationRes] = await Promise.all([
                fetch(`${process.env.NEXT_PUBLIC_API_URL}/platform-admin/usage/overview`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch(`${process.env.NEXT_PUBLIC_API_URL}/platform-admin/automation/stats`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ]);

            if (usageRes.ok && automationRes.ok) {
                const [usageData, automationData] = await Promise.all([
                    usageRes.json(),
                    automationRes.json(),
                ]);
                setUsage(usageData);
                setAutomation(automationData);
            } else {
                toast.error("Failed to fetch usage data");
            }
        } catch (error) {
            toast.error("Failed to load usage data");
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

    const successRate = automation?.executions.total
        ? ((automation.executions.success / automation.executions.total) * 100).toFixed(1)
        : "0";

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Usage Monitoring</h2>
            </div>

            {/* Tenant Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{usage?.tenants.total || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            {usage?.tenants.active || 0} active, {usage?.tenants.suspended || 0} suspended
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{usage?.users.total || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            Across all tenants
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
                        <Database className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{usage?.data.leads || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            {usage?.data.opportunities || 0} opportunities
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Activities</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{usage?.data.activities || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            Logged actions
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Automation Stats */}
            <Card>
                <CardHeader>
                    <CardTitle>Automation Monitoring</CardTitle>
                    <CardDescription>
                        Track automation rule execution across all tenants
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Zap className="h-4 w-4 text-muted-foreground" />
                                <p className="text-sm font-medium">Total Rules</p>
                            </div>
                            <p className="text-2xl font-bold">{automation?.totalRules || 0}</p>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <p className="text-sm font-medium">Success Rate</p>
                            </div>
                            <p className="text-2xl font-bold">{successRate}%</p>
                            <p className="text-xs text-muted-foreground">
                                {automation?.executions.success || 0} / {automation?.executions.total || 0}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <XCircle className="h-4 w-4 text-red-500" />
                                <p className="text-sm font-medium">Failed</p>
                            </div>
                            <p className="text-2xl font-bold">{automation?.executions.failed || 0}</p>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                                <p className="text-sm font-medium">Last 24h</p>
                            </div>
                            <p className="text-2xl font-bold">{automation?.executions.last24h || 0}</p>
                        </div>
                    </div>

                    {automation?.topRules && automation.topRules.length > 0 && (
                        <div className="mt-6">
                            <h3 className="text-sm font-medium mb-3">Top Automation Rules</h3>
                            <div className="space-y-2">
                                {automation.topRules.slice(0, 5).map((rule) => (
                                    <div
                                        key={rule.ruleId}
                                        className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                                    >
                                        <span className="text-sm font-medium">{rule.ruleName}</span>
                                        <span className="text-sm text-muted-foreground">
                                            {rule.executionCount} executions
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
