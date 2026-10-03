"use client";
import { ModuleGate } from "@/components/common/module-gate";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";
import { TableSkeleton } from "@/components/common/skeletons";
import { humanizeEnum } from "@/lib/display/status";
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

function CallCampaignAnalyticsPageContent() {
    const params = useParams();
    const campaignId = params.id as string;
    const [analytics, setAnalytics] = useState<CampaignAnalytics | null>(null);
    const [name, setName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    const load = () => {
        setLoading(true);
        setFailed(false);
        apiFetch<CampaignAnalytics>(`/call-campaigns/${campaignId}/analytics`)
            .then(setAnalytics)
            .catch(() => setFailed(true))
            .finally(() => setLoading(false));
    };
    useEffect(() => {
        load();
        apiFetch<{ name: string }>(`/call-campaigns/${campaignId}`).then((data) => setName(data?.name ?? null)).catch(() => undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [campaignId]);

    // A header and a way back, and a load error that says so (UI/UX plan §5.14).
    const header = <PageHeader title={name ? `${name}: results` : "Campaign results"} description="How the campaign's calls turned out." backHref="/dashboard/settings/calling/campaigns" backLabel="Call campaigns" />;
    if (loading) return <>{header}<TableSkeleton rows={3} columns={4} hasToolbar={false} /></>;
    if (failed || !analytics) return <>{header}<ErrorState description="The campaign's results couldn't be loaded." onRetry={load} /></>;

    return (
        <div className="space-y-4">
            {header}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Card className="p-3 text-center">
                    <p className="text-2xl font-bold">{analytics.total}</p>
                    <p className="text-xs text-muted-foreground">People in the campaign</p>
                </Card>
                <Card className="p-3 text-center">
                    <p className="text-2xl font-bold">{analytics.contactRate}%</p>
                    <p className="text-xs text-muted-foreground">Reached</p>
                </Card>
                <Card className="p-3 text-center">
                    <p className="text-2xl font-bold">{analytics.avgAttempts}</p>
                    <p className="text-xs text-muted-foreground">Average attempts</p>
                </Card>
                <Card className="p-3 text-center">
                    <p className="text-2xl font-bold">{analytics.doNotCall}</p>
                    <p className="text-xs text-muted-foreground">Do not call</p>
                </Card>
            </div>

            <Card className="p-4">
                <h2 className="mb-2 font-semibold">By status</h2>
                <div className="flex flex-wrap gap-1.5">
                    {Object.entries(analytics.byStatus).map(([status, count]) => (
                        <Badge key={status} variant="outline">
                            {humanizeEnum(status)}: {count}
                        </Badge>
                    ))}
                </div>
            </Card>

            <Card className="p-4">
                <h2 className="mb-2 font-semibold">Outcomes</h2>
                {analytics.dispositionBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No outcomes logged for this campaign yet.</p>
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

export default function CallCampaignAnalyticsPage() {
    return <ModuleGate moduleKey="TELEPHONY" name="Telephony"><CallCampaignAnalyticsPageContent /></ModuleGate>;
}
