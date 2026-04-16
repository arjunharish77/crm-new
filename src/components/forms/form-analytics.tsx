"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { Activity, Users, AlertTriangle, FileCheck } from "lucide-react";

interface FormStats {
    total: number;
    processed: number;
    spam: number;
    duplicate: number;
    errors: number;
    conversionRate: number;
    spamRate: number;
    duplicateRate: number;
    recentTrend: number;
}

interface AnalyticsDashboardProps {
    formId: string;
}

export function AnalyticsDashboard({ formId }: AnalyticsDashboardProps) {
    const [stats, setStats] = useState<FormStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const data = await apiFetch(`/forms/${formId}/stats`);
                setStats(data);
            } catch (error) {
                console.error("Failed to load stats:", error);
            } finally {
                setLoading(false);
            }
        };

        if (formId) fetchStats();
    }, [formId]);

    if (loading) return <div className="p-8 text-center text-muted-foreground">Loading analytics...</div>;
    if (!stats) return <div className="p-8 text-center text-muted-foreground">No data available</div>;

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Submissions
                        </CardTitle>
                        <FileCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.total}</div>
                        <p className="text-xs text-muted-foreground">
                            All time submissions
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Processed Leads
                        </CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.processed}</div>
                        <p className="text-xs text-muted-foreground">
                            Successfully created/updated ({(stats.conversionRate * 100).toFixed(1)}%)
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Spam Detected
                        </CardTitle>
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.spam}</div>
                        <p className="text-xs text-muted-foreground">
                            Blocked submissions ({(stats.spamRate * 100).toFixed(1)}%)
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Duplicates
                        </CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.duplicate}</div>
                        <p className="text-xs text-muted-foreground">
                            Merged or skipped ({(stats.duplicateRate * 100).toFixed(1)}%)
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card className="col-span-4">
                <CardHeader>
                    <CardTitle>Recent Activity (30 Days)</CardTitle>
                </CardHeader>
                <CardContent className="pl-2">
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground bg-muted/10 rounded-md">
                        <div className="text-center">
                            <div className="text-4xl font-bold mb-2">{stats.recentTrend}</div>
                            <div className="text-sm">Submissions in last 30 days</div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
