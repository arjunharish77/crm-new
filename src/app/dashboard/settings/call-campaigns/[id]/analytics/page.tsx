"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type CampaignAnalytics = {
    total: number;
    byStatus: Record<string, number>;
    completed: number;
    exhausted: number;
    doNotCall: number;
    contactRate: number;
    avgAttempts: number;
    dispositionBreakdown: Array<{ outcomeName: string; count: number }>;
};

export default function CallCampaignAnalyticsPage() {
    const params = useParams();
    const campaignId = params.id as string;
    const [analytics, setAnalytics] = useState<CampaignAnalytics | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        apiFetch<CampaignAnalytics>(`/call-campaigns/${campaignId}/analytics`)
            .then(setAnalytics)
            .catch(() => setAnalytics(null))
            .finally(() => setLoading(false));
    }, [campaignId]);

    if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;
    if (!analytics) return <p className="text-sm text-muted-foreground">No analytics available for this campaign.</p>;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <BarChart3 className="size-5 text-primary" />
                <h1 className="text-lg font-bold">Campaign Outcome Analytics</h1>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Card className="p-3 text-center">
                    <p className="text-2xl font-bold">{analytics.total}</p>
                    <p className="text-xs text-muted-foreground">Total Members</p>
                </Card>
                <Card className="p-3 text-center">
                    <p className="text-2xl font-bold">{analytics.contactRate}%</p>
                    <p className="text-xs text-muted-foreground">Contact Rate</p>
                </Card>
                <Card className="p-3 text-center">
                    <p className="text-2xl font-bold">{analytics.avgAttempts}</p>
                    <p className="text-xs text-muted-foreground">Avg Attempts</p>
                </Card>
                <Card className="p-3 text-center">
                    <p className="text-2xl font-bold">{analytics.doNotCall}</p>
                    <p className="text-xs text-muted-foreground">Do Not Call</p>
                </Card>
            </div>

            <Card className="p-4">
                <h2 className="mb-2 font-bold">Members by Status</h2>
                <div className="flex flex-wrap gap-1.5">
                    {Object.entries(analytics.byStatus).map(([status, count]) => (
                        <Badge key={status} variant="outline">
                            {status}: {count}
                        </Badge>
                    ))}
                </div>
            </Card>

            <Card className="p-4">
                <h2 className="mb-2 font-bold">Disposition Breakdown</h2>
                {analytics.dispositionBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No dispositions logged for this campaign yet.</p>
                ) : (
                    <div className="space-y-1">
                        {analytics.dispositionBreakdown.map((row) => (
                            <div key={row.outcomeName} className="flex items-center justify-between text-sm">
                                <span>{row.outcomeName}</span>
                                <Badge variant="outline">{row.count}</Badge>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
}
