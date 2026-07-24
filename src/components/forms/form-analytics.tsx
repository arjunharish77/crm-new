"use client";

import { useEffect, useMemo, useState } from "react";
import {
    FileText as DescriptionOutlinedIcon,
    Users as GroupOutlinedIcon,
    AlertTriangle as ReportGmailerrorredOutlinedIcon,
    Copy as CopyAllOutlinedIcon,
    TrendingUp as TrendingUpOutlinedIcon,
    Loader2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

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

function MetricCard({
    title,
    value,
    subtitle,
    icon,
    tintClassName,
}: {
    title: string;
    value: string | number;
    subtitle: string;
    icon: React.ReactNode;
    tintClassName: string;
}) {
    return (
        <Card className="h-full rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {title}
                    </p>
                    <p className="mt-1.5 text-3xl font-extrabold tracking-tight">
                        {value}
                    </p>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        {subtitle}
                    </p>
                </div>
                <div
                    className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary",
                        tintClassName
                    )}
                >
                    {icon}
                </div>
            </div>
        </Card>
    );
}

function ProgressBar({ value, className }: { value: number; className?: string }) {
    return (
        <div className="h-2 w-full overflow-hidden rounded-full bg-primary/8">
            <div
                className={cn("h-full rounded-full bg-primary transition-all", className)}
                style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
            />
        </div>
    );
}

export function AnalyticsDashboard({ formId }: AnalyticsDashboardProps) {
    const [stats, setStats] = useState<FormStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await apiFetch(`/forms/${formId}/stats`);
                setStats(data);
            } catch (fetchError) {
                console.error("Failed to load stats:", fetchError);
                setError("Failed to load analytics");
            } finally {
                setLoading(false);
            }
        };

        if (formId) fetchStats();
    }, [formId]);

    const conversionPercent = useMemo(() => Math.round((stats?.conversionRate ?? 0) * 100), [stats]);
    const spamPercent = useMemo(() => Math.round((stats?.spamRate ?? 0) * 100), [stats]);
    const duplicatePercent = useMemo(() => Math.round((stats?.duplicateRate ?? 0) * 100), [stats]);

    if (loading) {
        return (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-1">
                <Loader2 className="size-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                    Loading analytics...
                </p>
            </div>
        );
    }

    if (error || !stats) {
        return (
            <Alert variant="destructive">
                <AlertDescription>{error ?? "No analytics available"}</AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div>
                <h2 className="text-lg font-extrabold tracking-tight">
                    Performance Snapshot
                </h2>
                <p className="text-sm text-muted-foreground">
                    Form capture health, lead conversion quality, and recent submission momentum.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    title="Total Submissions"
                    value={stats.total}
                    subtitle="All-time responses collected"
                    icon={<DescriptionOutlinedIcon className="size-4" />}
                    tintClassName="bg-primary/8"
                />
                <MetricCard
                    title="Processed Leads"
                    value={stats.processed}
                    subtitle={`${conversionPercent}% converted successfully`}
                    icon={<GroupOutlinedIcon className="size-4" />}
                    tintClassName="bg-primary/8"
                />
                <MetricCard
                    title="Spam Detected"
                    value={stats.spam}
                    subtitle={`${spamPercent}% blocked or flagged`}
                    icon={<ReportGmailerrorredOutlinedIcon className="size-4 text-destructive" />}
                    tintClassName="bg-destructive/8"
                />
                <MetricCard
                    title="Duplicates"
                    value={stats.duplicate}
                    subtitle={`${duplicatePercent}% merged or skipped`}
                    icon={<CopyAllOutlinedIcon className="size-4 text-tertiary" />}
                    tintClassName="bg-tertiary/12"
                />
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                <Card className="rounded-2xl p-4 lg:col-span-7">
                    <p className="mb-3 text-base font-extrabold">
                        Conversion Health
                    </p>
                    <div className="flex flex-col gap-4">
                        <div>
                            <div className="mb-1.5 flex items-center justify-between">
                                <span className="text-sm font-semibold">Lead Conversion</span>
                                <span className="text-sm text-muted-foreground">{conversionPercent}%</span>
                            </div>
                            <ProgressBar value={conversionPercent} />
                        </div>
                        <div>
                            <div className="mb-1.5 flex items-center justify-between">
                                <span className="text-sm font-semibold">Spam Rate</span>
                                <span className="text-sm text-muted-foreground">{spamPercent}%</span>
                            </div>
                            <ProgressBar value={spamPercent} className="bg-destructive" />
                        </div>
                        <div>
                            <div className="mb-1.5 flex items-center justify-between">
                                <span className="text-sm font-semibold">Duplicate Rate</span>
                                <span className="text-sm text-muted-foreground">{duplicatePercent}%</span>
                            </div>
                            <ProgressBar value={duplicatePercent} className="bg-tertiary" />
                        </div>
                    </div>
                </Card>
                <Card className="rounded-2xl p-4 lg:col-span-5">
                    <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
                            <TrendingUpOutlinedIcon className="size-4" />
                        </div>
                        <div>
                            <p className="text-base font-extrabold">
                                Recent Activity
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Last 30 days of submissions
                            </p>
                        </div>
                    </div>
                    <div className="rounded-xl border border-dashed border-primary/16 bg-primary/[0.03] p-4">
                        <p className="text-4xl font-black tracking-tight">
                            {stats.recentTrend}
                        </p>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            submissions captured in the last 30 days
                        </p>
                        <p className="mt-3 block text-xs text-muted-foreground">
                            Errors: {stats.errors} submissions need manual review
                        </p>
                    </div>
                </Card>
            </div>
        </div>
    );
}
