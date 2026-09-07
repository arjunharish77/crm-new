"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDate, formatWorkspaceRelativeTime } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatCurrency } from "@/lib/utils";
import { useFeature } from "@/components/auth/feature-gate";
import { getFavoriteRecords, recordRecentView, toggleFavoriteRecord } from "@/lib/recent-records";
import {
    TrendingUp,
    Users,
    DollarSign,
    History,
    Play,
    Plus,
    Save,
    Trash2,
    CalendarClock,
    RefreshCw,
    AlertTriangle,
    Sparkles,
    Copy,
    UserCog,
    Archive,
    RotateCcw,
    MoreVertical,
    Star,
} from "lucide-react";
import { toast } from "sonner";
import { QueueExportButton } from "@/components/exports/queue-export-button";
import { StandardDialog } from "@/components/common/standard-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MetricQueryResult } from "@/lib/server/reporting-query";

export default function ReportsPage() {
    const [leadsData, setLeadsData] = useState<any>(null);
    const [oppsData, setOppsData] = useState<any>(null);
    const [activitiesData, setActivitiesData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("overview");

    // Lets the global create menu (header.tsx) open the Builder tab for a new custom report, or a
    // ?reportId= deep-link (from global search's Recent/Favorites) open it for editing an existing
    // one -- read via window.location, not next/navigation's useSearchParams, matching this app's
    // existing convention (views/page.tsx, tasks/page.tsx) since this page isn't wrapped in a
    // Suspense boundary. editingReportId already defaults to null (a fresh builder session), so
    // switching tabs alone is enough; CustomReportBuilder's own effect fetches+applies the report.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get("create") === "1" || params.get("reportId")) {
            setActiveTab("builder");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [l, o, a] = await Promise.all([
                    apiFetch("/reports/leads"),
                    apiFetch("/reports/opportunities"),
                    apiFetch("/reports/activities")
                ]);
                setLeadsData(l);
                setOppsData(o);
                setActivitiesData(a);
            } catch (error) {
                toast.error("Failed to load reports");
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    if (loading) {
        return (
            <div className="space-y-4 p-4 md:p-8">
                <div className="mb-2 flex justify-between">
                    <div className="space-y-2">
                        <Skeleton className="h-10 w-[300px]" />
                        <Skeleton className="h-5 w-[200px]" />
                    </div>
                    <Skeleton className="h-12 w-[150px] rounded-full" />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-[160px] rounded-2xl" />
                    ))}
                    <div className="md:col-span-2">
                        <Skeleton className="h-[400px] rounded-2xl" />
                    </div>
                    <Skeleton className="h-[400px] rounded-2xl" />
                </div>
            </div>
        );
    }

    const revenue = formatCurrency(oppsData?.totalRevenue || 0, undefined, { maximumFractionDigits: 0 });

    return (
        <div className="p-0 pb-8 sm:p-4">
            <div className="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-3xl font-extrabold tracking-[-1px]">
                            Reports & Analytics
                        </h1>
                    </div>
                    <p className="text-muted-foreground">
                        Overview of your sales performance across all modules.
                    </p>
                </div>
                <QueueExportButton moduleName="REPORTS" label="Export Data" />
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <div className="overflow-x-auto pb-1">
                    <TabsList className="h-10 min-w-max">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="inbuilt">Inbuilt Reports</TabsTrigger>
                        <TabsTrigger value="saved">Saved Reports</TabsTrigger>
                        <TabsTrigger value="builder">Builder</TabsTrigger>
                        <TabsTrigger value="schedules">Schedules</TabsTrigger>
                        <TabsTrigger value="annotations">Annotations</TabsTrigger>
                        <TabsTrigger value="catalog">Data Catalog</TabsTrigger>
                        <TabsTrigger value="metrics">Metrics</TabsTrigger>
                        <TabsTrigger value="compare">Compare</TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="overview" className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                        <MetricCard
                            title="Total Leads"
                            value={leadsData?.total || 0}
                            subtitle="Across all sources"
                            icon={<Users className="size-5" />}
                            color="var(--primary)"
                        />
                        <MetricCard
                            title="Open Opportunity Value"
                            value={revenue}
                            subtitle="Potential value in open deals"
                            icon={<DollarSign className="size-5" />}
                            color="var(--secondary)"
                        />
                        <MetricCard
                            title="Total Activities"
                            value={activitiesData?.total || 0}
                            subtitle="Events & tasks completed"
                            icon={<History className="size-5" />}
                            color="var(--tertiary)"
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                        <Card className="rounded-2xl lg:col-span-7">
                            <CardContent className="p-6">
                                <h2 className="mb-1 text-lg font-bold">Opportunity Value by Stage</h2>
                                <p className="mb-4 text-sm text-muted-foreground">Value breakdown per opportunity stage</p>

                                <div className="space-y-6">
                                    {oppsData?.byStage?.map((item: any) => (
                                        <div key={item.stage}>
                                            <div className="mb-1 flex justify-between">
                                                <span className="text-sm font-semibold">{item.stage}</span>
                                                <span className="text-sm text-muted-foreground">{item.count} Deals</span>
                                            </div>
                                            <div className="h-2 w-full overflow-hidden rounded-full bg-primary/[0.08]">
                                                <div
                                                    className="h-full rounded-full bg-primary"
                                                    style={{ width: `${(item.count / (oppsData.total || 1)) * 100}%` }}
                                                />
                                            </div>
                                            <div className="mt-0.5 text-right text-xs font-bold">
                                                {formatCurrency(item.value, undefined, { maximumFractionDigits: 0 })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-2xl lg:col-span-5">
                            <CardContent className="p-6">
                                <h2 className="mb-1 text-lg font-bold">Leads by Source</h2>
                                <p className="mb-6 text-sm text-muted-foreground">Distribution of incoming leads</p>

                                <div className="space-y-2">
                                    {leadsData?.bySource?.map((item: any) => (
                                        <div
                                            key={item.source}
                                            className="flex items-center justify-between rounded-xl bg-surface-container-low p-3 transition-transform hover:translate-x-1"
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className="size-2 rounded-full bg-primary" />
                                                <span className="text-sm font-semibold">{item.source}</span>
                                            </div>
                                            <span className="text-sm font-extrabold">{item.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="inbuilt">
                    <InbuiltReportsSection />
                </TabsContent>

                <TabsContent value="saved">
                    <CustomReportsSection />
                </TabsContent>

                <TabsContent value="builder">
                    <CustomReportBuilder />
                </TabsContent>

                <TabsContent value="schedules">
                    <ReportSchedulesSection />
                </TabsContent>

                <TabsContent value="annotations">
                    <ReportAnnotationsSection />
                </TabsContent>

                <TabsContent value="catalog">
                    <DataCatalogSection />
                </TabsContent>

                <TabsContent value="metrics" className="space-y-4">
                    <MetricsSection />
                    <CalculatedMetricsSection />
                </TabsContent>

                <TabsContent value="compare">
                    <SegmentComparisonSection />
                </TabsContent>
            </Tabs>
        </div>
    );
}

interface MetricCardProps {
    title: string;
    value: string | number;
    subtitle: string;
    icon: React.ReactNode;
    color: string;
}

function MetricCard({ title, value, subtitle, icon, color }: MetricCardProps) {
    return (
        <Card
            className="relative overflow-hidden rounded-[20px] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
            style={{ "--metric-color": color } as React.CSSProperties}
        >
            <CardContent className="p-6">
                <div className="mb-4 flex justify-between">
                    <div
                        className="flex items-center justify-center rounded-xl p-3"
                        style={{ backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)`, color }}
                    >
                        {icon}
                    </div>
                </div>
                <div>
                    <div className="text-lg font-extrabold tracking-[-1px]">
                        {value}
                    </div>
                    <div className="mt-1 text-sm font-bold">
                        {title}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {subtitle}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

type ReportRoot = "lead" | "opportunity" | "activity";
type ReportFieldSelection = { object: string; field: string; label?: string };
type ReportFilterSelection = { object: string; field: string; operator: string; value?: string | number | boolean | null };

const ROOT_OPTIONS: Array<{ value: ReportRoot; label: string }> = [
    { value: "lead", label: "Leads" },
    { value: "opportunity", label: "Opportunities" },
    { value: "activity", label: "Activities" },
];

const OBJECT_LABELS: Record<string, string> = {
    lead: "Lead",
    leadOwner: "Lead Owner",
    opportunity: "Opportunity",
    opportunityOwner: "Opportunity Owner",
    stage: "Stage",
    activity: "Activity",
    activityType: "Activity Type",
    activityCreator: "Activity Creator",
    assignmentLog: "Assignment Log",
    assignedTo: "Assigned To",
    task: "Task",
    taskOwner: "Task Owner",
    telephonyCall: "Telephony Call",
    telephonyAgent: "Telephony Agent",
    case: "Case",
    caseType: "Case Type",
    caseStatus: "Case Status",
    casePriority: "Case Priority",
    caseOwner: "Case Owner",
    commissionLedger: "Commission Ledger Entry",
    partner: "Partner",
    payout: "Payout",
    communication: "Communication",
    journeyEnrollment: "Journey Enrollment",
    recordScore: "Predictive Score",
};

// Task/TelephonyCallLog/Case are join-only satellites reachable from lead/opportunity roots
// only (see reporting-query.ts's buildJoinContexts) -- not from activity, since Case has no
// activityId at all and this pass kept Task/TelephonyCallLog consistent with it rather than
// giving them a join path Case can't have. Real, pre-existing gap fixed alongside the metric
// layer below: these three (plus their owner/type/status/priority satellites) were already
// supported by the query engine but never appeared in this picker, so the custom-report-builder
// itself couldn't reach them either -- the same class of "built but not wired to the UI" bug as
// the earlier funnel_explorer catalog omission.
const NEW_SATELLITE_OBJECTS = ["task", "taskOwner", "telephonyCall", "telephonyAgent", "case", "caseType", "caseStatus", "casePriority", "caseOwner"];
// Gap checklist Module 17, item 2 ("dataset catalog" -- communications/journeys/scoring).
// Reachable from both lead and opportunity roots, same polymorphic entityType/recordType join
// as assignmentLog.
const SHARED_EVENT_OBJECTS = ["communication", "journeyEnrollment", "recordScore"];
// Opportunity-only: CommissionLedger has no leadId at all -- partner/payout association only
// ever exists at the Opportunity level (see reporting-query.ts's FIELD_CATALOG comments).
const PARTNER_OBJECTS = ["commissionLedger", "partner", "payout"];

const OBJECTS_BY_ROOT: Record<ReportRoot, string[]> = {
    lead: ["lead", "leadOwner", "opportunity", "opportunityOwner", "stage", "activity", "activityType", "activityCreator", "assignmentLog", "assignedTo", ...NEW_SATELLITE_OBJECTS, ...SHARED_EVENT_OBJECTS],
    opportunity: ["opportunity", "opportunityOwner", "lead", "leadOwner", "stage", "activity", "activityType", "activityCreator", "assignmentLog", "assignedTo", ...NEW_SATELLITE_OBJECTS, ...SHARED_EVENT_OBJECTS, ...PARTNER_OBJECTS],
    activity: ["activity", "activityType", "activityCreator", "lead", "leadOwner", "opportunity", "opportunityOwner", "stage"],
};

const REPORT_OPERATORS = [
    { value: "equals", label: "Equals" },
    { value: "not_equals", label: "Does not equal" },
    { value: "contains", label: "Contains" },
    { value: "greater_than", label: "Greater than" },
    { value: "less_than", label: "Less than" },
    { value: "gte", label: "Greater or equal" },
    { value: "lte", label: "Less or equal" },
    { value: "is_empty", label: "Is empty" },
    { value: "is_not_empty", label: "Has any value" },
];

const FIELD_LABELS: Record<string, string> = {
    name: "Name",
    email: "Email",
    phone: "Phone",
    company: "Company",
    source: "Source",
    status: "Status",
    ownerId: "Owner",
    title: "Title",
    amount: "Deal Value",
    stageId: "Stage",
    typeId: "Type",
    priority: "Priority",
    outcome: "Outcome",
    notes: "Notes",
    slaStatus: "SLA Status",
    createdBy: "Created By",
    createdAt: "Created Date",
    updatedAt: "Updated Date",
    assignedAt: "Assigned Date",
};

const COMMON_LEAD_SOURCES = ["Website", "Partner", "Referral", "Campaign", "Walk-in", "Social", "Email", "Event"];
const STATUS_VALUES = ["NEW", "QUALIFIED", "CONTACTED", "WON", "LOST", "OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "ACTIVE", "INACTIVE"];
const PRIORITY_VALUES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const SLA_VALUES = ["PENDING", "MET", "BREACHED"];

function formatFieldLabel(field: string) {
    return FIELD_LABELS[field] ?? field.replace(/Id$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (char) => char.toUpperCase());
}

const INBUILT_REPORT_OPTIONS = [
    {
        value: "funnel_conversion_by_stage",
        label: "Funnel Conversion by Stage",
        category: "Opportunities",
        endpoint: "/reports/inbuilt/funnel-by-stage",
        description: "Stage-wise opportunity counts, value, win/closed flags, and conversion rates.",
    },
    {
        value: "funnel_conversion_by_source_campaign",
        label: "Funnel by Source & Campaign",
        category: "Marketing",
        endpoint: "/reports/inbuilt/funnel-by-source-campaign",
        description: "Lead-to-opportunity and win conversion by source and campaign.",
    },
    {
        value: "rep_performance",
        label: "Rep Performance",
        category: "Team",
        endpoint: "/reports/inbuilt/rep-performance",
        description: "Rep-owned leads, opportunities, wins, activity volume, and first response.",
    },
    {
        value: "sla_response_breaches",
        label: "SLA Response Breaches",
        category: "Operations",
        endpoint: "/reports/inbuilt/sla-response-breaches",
        description: "Owner-level first response and activity SLA breach counts.",
    },
    {
        value: "lead_source_roi",
        label: "Lead Source ROI",
        category: "Marketing",
        endpoint: "/reports/inbuilt/lead-source-roi",
        description: "Source-level lead volume, open opportunity value, won value, and ROI where spend exists.",
    },
    {
        value: "reassignment_impact",
        label: "Reassignment Impact",
        category: "Operations",
        endpoint: "/reports/inbuilt/reassignment-impact",
        description: "Conversion and response behavior grouped by reassignment count buckets.",
    },
    {
        value: "activity_call_volume_trends",
        label: "Activity & Call Volume Trends",
        category: "Activity",
        endpoint: "/reports/inbuilt/activity-call-volume-trends",
        description: "Period trend for activities, calls, completed work, and overdue work.",
    },
    {
        value: "case_analytics",
        label: "Case Analytics",
        category: "Operations",
        endpoint: "/reports/inbuilt/case-analytics",
        description: "Case volume by channel/type/priority/status, SLA hit rates, backlog aging, reopen/escalation rate, agent productivity, queue health, and CSAT.",
    },
    {
        value: "telephony_call_performance",
        label: "Telephony Call Performance",
        category: "Activity",
        endpoint: "/reports/inbuilt/telephony-call-performance",
        description: "Answer rate, talk time, and per-agent call performance sourced from real telephony call logs.",
    },
    {
        value: "commission_payout_summary",
        label: "Commission & Payout Summary",
        category: "Finance",
        endpoint: "/reports/inbuilt/commission-payout-summary",
        description: "Partner commission ledger, payout states, invoices, and net payout totals.",
    },
    {
        value: "next_best_action_performance",
        label: "Next-Best-Action Performance",
        category: "Operations",
        endpoint: "/reports/inbuilt/next-best-action-performance",
        description: "Recommendation accept/dismiss rates by action type, module, and owner.",
    },
    {
        value: "journey_performance",
        label: "Journey Performance",
        category: "Marketing",
        endpoint: "/reports/inbuilt/journey-performance",
        description: "Enrollment, active, exited, converted, and unsubscribed counts per marketing journey.",
    },
    {
        value: "marketing_attribution_summary",
        label: "Marketing Attribution Summary",
        category: "Marketing",
        endpoint: "/reports/inbuilt/marketing-attribution-summary",
        description: "Conversion credit by UTM source across 8 attribution models (first/last touch, linear, U/W-shaped, time decay, and more).",
    },
    {
        // Gap checklist Module 17, item 7 (attribution explorer): same "built but never wired
        // to the UI" gap the funnel explorer had -- the backend/API/tests existed since this
        // module's original pass, but this was never added to the catalog either.
        value: "attribution_explorer",
        label: "Attribution Explorer (touch paths)",
        category: "Marketing",
        endpoint: "/reports/inbuilt/attribution-explorer",
        description: "Full per-record touch paths, assisted conversions, source/journey/partner credit breakdown, and ROI across 8 attribution models.",
    },
    {
        value: "sender_reputation",
        label: "Sender Reputation",
        category: "Marketing",
        endpoint: "/reports/inbuilt/sender-reputation",
        description: "Bounce/complaint/unsubscribe rates, delivery latency, and top failure reasons by channel.",
    },
    {
        value: "campaign_roi",
        label: "Campaign & Journey ROI",
        category: "Marketing",
        endpoint: "/reports/inbuilt/campaign-roi",
        description: "Cost-per-send and ROI per marketing journey, from logged spend/budget and attributed won-deal revenue.",
    },
    {
        value: "period_comparison",
        label: "Period Comparison",
        category: "Cohort",
        endpoint: "/reports/inbuilt/period-comparison",
        description: "Leads, opportunities, wins, and win rate for this period vs. the prior one (week/month/quarter), with percent change.",
    },
    {
        // Gap checklist Module 17, item 12 (funnel explorer): the backend/API for this report
        // has existed and been tested since this module's original pass, but was never actually
        // added to this catalog -- unreachable from the UI until now.
        value: "funnel_explorer",
        label: "Funnel Explorer",
        category: "Cohort",
        endpoint: "/reports/inbuilt/funnel-explorer",
        description: "Stage aging, drop-off reasons, re-entry, and win-rate comparison by source, owner, opportunity type, or partner.",
    },
    {
        value: "cohort_funnel_progression",
        label: "Cohort Funnel Progression",
        category: "Cohort",
        endpoint: "/reports/inbuilt/cohort-funnel-progression",
        description: "Lead cohorts (by created date, source, campaign, score band, owner, or sales group) and how each progresses through opportunity stages.",
    },
    {
        // Gap checklist Module 17, item 9 (anomaly detection). All 7 domains share one
        // rolling-average ± standard-deviation baseline -- see the preview-row mapping below
        // for how each domain's summary is flattened for this table.
        value: "anomaly_detection",
        label: "Anomaly Detection",
        category: "Governance",
        endpoint: "/reports/inbuilt/anomaly-detection",
        description: "Lead volume, conversions, SLA breaches, payout amounts, campaign performance, scoring drift, and service backlog vs. a 14-day rolling baseline.",
    },
    {
        // Gap checklist Module 17, item 10 (forecasting-lite). All 4 buildable domains share
        // one linear-regression trend projection method -- see the preview-row mapping below.
        value: "forecast",
        label: "Forecast",
        category: "Governance",
        endpoint: "/reports/inbuilt/forecast",
        description: "Linear-regression trend projection for campaign volume, task backlog, SLA breach risk, and partner payout, 7 days ahead.",
    },
    {
        // Gap checklist Module 17, item 12 (executive scorecards). One combined page across
        // the 8 buildable areas (admissions summary stays excluded -- no Application schema).
        // Sensitive by nature, gated the same way campaign_roi already is.
        value: "executive_scorecard",
        label: "Executive Scorecard",
        category: "Governance",
        endpoint: "/reports/inbuilt/executive-scorecard",
        description: "Marketing ROI, counselor productivity, partner performance, payout exposure, scoring quality, service SLA, telephony, and data quality in one view.",
    },
    {
        value: "data_quality",
        label: "Data Quality",
        category: "Governance",
        endpoint: "/reports/inbuilt/data-quality",
        description: "Duplicate, stale, ownerless, missing-field, invalid-UTM, SLA-breach, and stage-required-field data-quality issues.",
    },
    {
        value: "data_quality_history",
        label: "Data Quality Trend",
        category: "Governance",
        endpoint: "/reports/inbuilt/data-quality-history",
        description: "Scheduled data-quality scorecard snapshots over time, one row per scan.",
    },
    {
        value: "task_sla_performance",
        label: "Task SLA Performance",
        category: "Operations",
        endpoint: "/reports/inbuilt/task-sla-performance",
        description: "Owner-level task first-action and completion SLA breach counts, plus a breakdown by module.",
    },
    {
        value: "automation_performance",
        label: "Automation Performance",
        category: "Operations",
        endpoint: "/reports/inbuilt/automation-performance",
        description: "Per-automation run counts, success rate, and average execution time, including automations that have never fired.",
    },
    {
        value: "form_drop_off",
        label: "Form Drop-off Analytics",
        category: "Marketing",
        endpoint: "/reports/inbuilt/form-drop-off",
        description: "Per-form, per-tab visitor drop-off funnel showing where real visitors abandon a multi-step form before submitting.",
    },
    {
        value: "split_test_performance",
        label: "Split Test Performance",
        category: "Operations",
        endpoint: "/reports/inbuilt/split-test-performance",
        description: "Per-automation split-test variant distribution and completion rate, computed from real execution history.",
    },
    {
        value: "distribution_fairness",
        label: "Distribution Fairness",
        category: "Operations",
        endpoint: "/reports/inbuilt/distribution-fairness",
        description: "Per-user record assignment counts and how far each user is from an even split, across all distribution rules.",
    },
];

const WEEKDAY_OPTIONS = [
    { value: "0", label: "Sunday" },
    { value: "1", label: "Monday" },
    { value: "2", label: "Tuesday" },
    { value: "3", label: "Wednesday" },
    { value: "4", label: "Thursday" },
    { value: "5", label: "Friday" },
    { value: "6", label: "Saturday" },
];

const ROLLUP_STATUS_STYLES: Record<string, string> = {
    FRESH: "border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400",
    STALE: "border-amber-600/30 bg-amber-600/10 text-amber-700 dark:text-amber-400",
    REFRESHING: "border-blue-600/30 bg-blue-600/10 text-blue-700 dark:text-blue-400",
    ERROR: "border-destructive/30 bg-destructive/10 text-destructive",
};

function RollupFreshnessBadge({ state }: { state: any | null }) {
    if (!state) {
        return <span className="text-xs text-muted-foreground">No rollup has been generated for this report yet.</span>;
    }
    const style = ROLLUP_STATUS_STYLES[state.status] ?? "";
    return (
        <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("rounded-md gap-1", style)}>
                {state.status === "ERROR" ? <AlertTriangle className="size-3" /> : null}
                Rollup {state.status}
            </Badge>
            {state.lastSuccessfulAt ? (
                <span className="text-xs text-muted-foreground">
                    Last refreshed {formatWorkspaceRelativeTime(state.lastSuccessfulAt)}
                </span>
            ) : (
                <span className="text-xs text-muted-foreground">Never successfully refreshed</span>
            )}
            {state.status === "ERROR" && state.error ? (
                <span className="text-xs text-destructive">{state.error}</span>
            ) : null}
        </div>
    );
}

function InbuiltReportsSection() {
    const payoutsEnabled = useFeature("payoutsEnabled");
    const reportOptions = useMemo(
        () => INBUILT_REPORT_OPTIONS.filter((option) => option.value !== "commission_payout_summary" || payoutsEnabled),
        [payoutsEnabled],
    );
    const [selectedKey, setSelectedKey] = useState(reportOptions[0].value);
    const [report, setReport] = useState<any>(null);
    const [running, setRunning] = useState(false);
    const [attributionModel, setAttributionModel] = useState("FIRST_TOUCH");
    const [periodPreset, setPeriodPreset] = useState("THIS_MONTH_VS_LAST");
    const [cohortDimension, setCohortDimension] = useState("CREATED_DATE");
    const [funnelSegment, setFunnelSegment] = useState("SOURCE");
    const [refreshingRollup, setRefreshingRollup] = useState(false);
    const [refreshStates, setRefreshStates] = useState<any[]>([]);
    const [intervalDraft, setIntervalDraft] = useState("");
    const [savingInterval, setSavingInterval] = useState(false);
    const selected = reportOptions.find((option) => option.value === selectedKey) ?? reportOptions[0];
    const previewRows = useMemo(() => inbuiltReportPreviewRows(report), [report]);
    const previewColumns = useMemo(() => previewRows.length ? Object.keys(previewRows[0]).slice(0, 8) : [], [previewRows]);
    const rollupState = refreshStates.find((state) => state.reportKey === selected.value && state.scopeType === "ORG" && !state.scopeId) ?? null;

    const loadRefreshStates = async () => {
        try {
            const data = await apiFetch("/reports/rollups/status");
            setRefreshStates(data.states ?? []);
        } catch {
            // Non-admins can't read rollup status -- the freshness badge simply stays hidden.
        }
    };

    useEffect(() => {
        loadRefreshStates();
    }, []);

    useEffect(() => {
        setIntervalDraft(String(rollupState?.refreshIntervalMinutes ?? 15));
    }, [rollupState?.refreshIntervalMinutes, selectedKey]);

    const runReport = async (option = selected) => {
        setRunning(true);
        try {
            // Gap checklist Module 8, item 13: 8 attribution models total (up from 2) --
            // the model is passed as a query param rather than a dedicated report entry per
            // model, since the underlying report shape is identical across all of them.
            const endpoint =
                option.value === "marketing_attribution_summary" || option.value === "attribution_explorer"
                    ? `${option.endpoint}?model=${attributionModel}`
                    : option.value === "period_comparison"
                        ? `${option.endpoint}?preset=${periodPreset}`
                        : option.value === "cohort_funnel_progression"
                            ? `${option.endpoint}?dimension=${cohortDimension}`
                            : option.value === "funnel_explorer"
                                ? `${option.endpoint}?segment=${funnelSegment}`
                                : option.endpoint;
            const data = await apiFetch(endpoint);
            setSelectedKey(option.value);
            setReport(data);
            toast.success(`${option.label} loaded`);
        } catch (error: any) {
            toast.error(error.message || "Failed to load inbuilt report");
        } finally {
            setRunning(false);
        }
    };

    const refreshRollup = async () => {
        setRefreshingRollup(true);
        try {
            await apiFetch("/reports/rollups/refresh", {
                method: "POST",
                body: JSON.stringify({ reportKey: selected.value, runNow: true }),
            });
            toast.success("Report rollup refreshed");
            await loadRefreshStates();
        } catch (error: any) {
            toast.error(error.message || "Failed to refresh report rollup");
            await loadRefreshStates();
        } finally {
            setRefreshingRollup(false);
        }
    };

    const saveRefreshInterval = async () => {
        const minutes = Number(intervalDraft);
        if (!Number.isFinite(minutes) || minutes < 1) {
            toast.error("Enter a refresh interval of at least 1 minute");
            return;
        }
        setSavingInterval(true);
        try {
            await apiFetch("/reports/rollups/policy", {
                method: "PATCH",
                body: JSON.stringify({ reportKey: selected.value, refreshIntervalMinutes: Math.round(minutes) }),
            });
            toast.success("Refresh policy saved");
            await loadRefreshStates();
        } catch (error: any) {
            toast.error(error.message || "Failed to save refresh policy");
        } finally {
            setSavingInterval(false);
        }
    };

    return (
        <Card className="mb-4 rounded-2xl">
            <CardContent className="space-y-5 p-6">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div>
                        <div className="flex items-center gap-2">
                            <TrendingUp className="size-5 text-primary" />
                            <h2 className="text-lg font-bold">Inbuilt Reports</h2>
                            <Badge variant="outline" className="rounded-md">{reportOptions.length} reports</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Run the packaged CRM reports directly, preview the result, and export the current report.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => runReport()} disabled={running}>
                            <Play className="size-4" />
                            {running ? "Running..." : "Run Selected"}
                        </Button>
                        <QueueExportButton
                            moduleName="REPORTS"
                            filters={{ reportKind: "INBUILT", reportKey: selected.value }}
                            disabled={!report}
                        />
                        <Button variant="outline" onClick={refreshRollup} disabled={refreshingRollup}>
                            <RefreshCw className="size-4" />
                            {refreshingRollup ? "Refreshing..." : "Refresh Rollup"}
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/30 px-3 py-2">
                    <RollupFreshnessBadge state={rollupState} />
                    <div className="ml-auto flex items-center gap-2">
                        <Label htmlFor="rollup-refresh-interval" className="text-xs text-muted-foreground">
                            Auto-refresh every
                        </Label>
                        <Input
                            id="rollup-refresh-interval"
                            type="number"
                            min={1}
                            value={intervalDraft}
                            onChange={(e) => setIntervalDraft(e.target.value)}
                            className="h-8 w-20"
                        />
                        <span className="text-xs text-muted-foreground">min</span>
                        <Button size="sm" variant="ghost" onClick={saveRefreshInterval} disabled={savingInterval}>
                            <Save className="size-3.5" />
                            Save
                        </Button>
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
                    <div className="space-y-2">
                        {reportOptions.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => runReport(option)}
                                className={cn(
                                    "w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    selectedKey === option.value ? "border-primary bg-primary/[0.06]" : "border-border bg-card hover:bg-accent/50"
                                )}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-bold">{option.label}</span>
                                    <Badge variant="outline" className="rounded-md text-[0.65rem] font-semibold">
                                        {option.category}
                                    </Badge>
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{option.description}</p>
                            </button>
                        ))}
                    </div>

                    <div className="min-w-0 rounded-xl border bg-card">
                        <div className="flex flex-col justify-between gap-2 border-b px-4 py-3 md:flex-row md:items-center">
                            <div>
                                <div className="text-sm font-bold">{selected.label}</div>
                                <p className="text-xs text-muted-foreground">{selected.description}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {selected.value === "marketing_attribution_summary" || selected.value === "attribution_explorer" ? (
                                    <Select value={attributionModel} onValueChange={setAttributionModel}>
                                        <SelectTrigger className="h-8 w-[220px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="FIRST_TOUCH">First Touch</SelectItem>
                                            <SelectItem value="LAST_TOUCH">Last Touch</SelectItem>
                                            <SelectItem value="LINEAR">Linear</SelectItem>
                                            <SelectItem value="U_SHAPED">U-Shaped</SelectItem>
                                            <SelectItem value="W_SHAPED">W-Shaped</SelectItem>
                                            <SelectItem value="TIME_DECAY">Time Decay</SelectItem>
                                            <SelectItem value="CAMPAIGN_SOURCE_OVERRIDE">Campaign Source Override</SelectItem>
                                            <SelectItem value="CUSTOM_WEIGHTED">Custom Weighted (equal)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                ) : null}
                                {selected.value === "period_comparison" ? (
                                    <Select value={periodPreset} onValueChange={setPeriodPreset}>
                                        <SelectTrigger className="h-8 w-[220px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="THIS_WEEK_VS_LAST">This week vs. last week</SelectItem>
                                            <SelectItem value="THIS_MONTH_VS_LAST">This month vs. last month</SelectItem>
                                            <SelectItem value="THIS_QUARTER_VS_LAST">This quarter vs. last quarter</SelectItem>
                                        </SelectContent>
                                    </Select>
                                ) : null}
                                {selected.value === "cohort_funnel_progression" ? (
                                    <Select value={cohortDimension} onValueChange={setCohortDimension}>
                                        <SelectTrigger className="h-8 w-[220px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="CREATED_DATE">Created Date</SelectItem>
                                            <SelectItem value="SOURCE">Source</SelectItem>
                                            <SelectItem value="CAMPAIGN">Campaign</SelectItem>
                                            <SelectItem value="SCORE_BAND">Score Band</SelectItem>
                                            <SelectItem value="OWNER">Owner</SelectItem>
                                            <SelectItem value="SALES_GROUP">Sales Group</SelectItem>
                                            <SelectItem value="TEAM">Team</SelectItem>
                                        </SelectContent>
                                    </Select>
                                ) : null}
                                {selected.value === "funnel_explorer" ? (
                                    <Select value={funnelSegment} onValueChange={setFunnelSegment}>
                                        <SelectTrigger className="h-8 w-[220px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="SOURCE">Source</SelectItem>
                                            <SelectItem value="OWNER">Owner</SelectItem>
                                            <SelectItem value="OPPORTUNITY_TYPE">Opportunity Type</SelectItem>
                                            <SelectItem value="PARTNER">Partner</SelectItem>
                                        </SelectContent>
                                    </Select>
                                ) : null}
                                {report?.generatedAt ? (
                                    <Badge variant="outline" className="w-fit rounded-md">
                                        Generated {formatWorkspaceDate(report.generatedAt)}
                                    </Badge>
                                ) : null}
                            </div>
                        </div>

                        {!report ? (
                            <div className="flex min-h-[260px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
                                Select a report and run it to see preview rows here.
                            </div>
                        ) : previewRows.length === 0 ? (
                            <div className="flex min-h-[260px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
                                Report returned no preview rows.
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {previewColumns.map((column) => (
                                            <TableHead key={column}>{humanizeReportKey(column)}</TableHead>
                                        ))}
                                        <TableHead />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {previewRows.slice(0, 10).map((row, rowIndex) => (
                                        <TableRow key={rowIndex}>
                                            {previewColumns.map((column) => (
                                                <TableCell key={column}>{formatReportCell(row[column])}</TableCell>
                                            ))}
                                            <TableCell>
                                                {inbuiltDrilldownHref(selected.value, row) ? (
                                                    <Button size="sm" variant="ghost" asChild>
                                                        <a href={inbuiltDrilldownHref(selected.value, row) ?? "#"} target="_blank" rel="noreferrer">
                                                            Open records
                                                        </a>
                                                    </Button>
                                                ) : null}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function CustomReportBuilder() {
    const [catalog, setCatalog] = useState<Record<string, string[]>>({});
    const [loadingCatalog, setLoadingCatalog] = useState(true);
    const [editingReportId, setEditingReportId] = useState<string | null>(null);
    const [name, setName] = useState("Lead activity report");
    const [root, setRoot] = useState<ReportRoot>("lead");
    const [fields, setFields] = useState<ReportFieldSelection[]>([{ object: "lead", field: "name", label: "Lead Name" }]);
    const [filters, setFilters] = useState<ReportFilterSelection[]>([]);
    const [orderBy, setOrderBy] = useState({ object: "lead", field: "createdAt", direction: "desc" as "asc" | "desc" });
    const [limit, setLimit] = useState(100);
    const [preview, setPreview] = useState<any>(null);
    const [running, setRunning] = useState(false);
    const [saving, setSaving] = useState(false);
    const [users, setUsers] = useState<any[]>([]);
    const [opportunityTypes, setOpportunityTypes] = useState<any[]>([]);
    const [aiPrompt, setAiPrompt] = useState("");
    const [aiGenerating, setAiGenerating] = useState(false);

    // Gap checklist Module 7, item 7: "natural-language report/view helper." Never auto-saves --
    // populates the same builder state a human editing the form would, and shows the same
    // preview, so the generated definition is fully reviewable/editable before Save.
    const runAiReportPrompt = async () => {
        if (!aiPrompt.trim()) return;
        setAiGenerating(true);
        try {
            const response = await apiFetch<{ definition: any; preview: any }>("/ai/nl-report", {
                method: "POST",
                body: JSON.stringify({ prompt: aiPrompt.trim() }),
            });
            const definition = response.definition;
            setRoot(definition.root);
            setFields(Array.isArray(definition.fields) ? definition.fields : []);
            setFilters(Array.isArray(definition.filters) ? definition.filters : []);
            if (definition.orderBy) setOrderBy(definition.orderBy);
            if (definition.limit) setLimit(definition.limit);
            setPreview(response.preview);
            toast.success("Report definition generated -- review before saving");
        } catch (error: any) {
            toast.error(error.message || "Failed to generate report from prompt");
        } finally {
            setAiGenerating(false);
        }
    };
    const [activityTypes, setActivityTypes] = useState<any[]>([]);
    const [savedViews, setSavedViews] = useState<any[]>([]);
    const [savedViewId, setSavedViewId] = useState("__all__");

    useEffect(() => {
        apiFetch<{ objects: Record<string, string[]> }>("/reports/query")
            .then((data) => setCatalog(data.objects ?? {}))
            .catch(() => toast.error("Failed to load report builder catalog"))
            .finally(() => setLoadingCatalog(false));
        apiFetch<any[]>("/users").then((data) => setUsers(Array.isArray(data) ? data : [])).catch(() => setUsers([]));
        apiFetch<any[]>("/opportunity-types").then((data) => setOpportunityTypes(Array.isArray(data) ? data : [])).catch(() => setOpportunityTypes([]));
        apiFetch<any[]>("/activity-types").then((data) => setActivityTypes(Array.isArray(data) ? data : [])).catch(() => setActivityTypes([]));
        apiFetch<any[]>("/saved-views?module=ALL").then((data) => setSavedViews(Array.isArray(data) ? data : [])).catch(() => setSavedViews([]));
    }, []);

    useEffect(() => {
        const loadReport = (event: Event) => {
            const report = (event as CustomEvent<any>).detail;
            const queryDefinition = report?.config?.queryDefinition;
            if (!queryDefinition?.root || !Array.isArray(queryDefinition.fields)) return;
            setEditingReportId(report.id);
            recordRecentView("report", report.id, report.name ?? "Custom report");
            setName(report.name ?? "Custom report");
            setRoot(queryDefinition.root);
            setFields(queryDefinition.fields);
            setFilters(queryDefinition.filters ?? []);
            setOrderBy(queryDefinition.orderBy ?? { object: queryDefinition.root, field: queryDefinition.fields[0]?.field ?? "id", direction: "desc" });
            setSavedViewId(queryDefinition.savedViewId || "__all__");
            setLimit(queryDefinition.limit ?? 100);
            setPreview(null);
            document.getElementById("custom-report-builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
        };
        window.addEventListener("custom-report-edit", loadReport);
        return () => window.removeEventListener("custom-report-edit", loadReport);
    }, []);

    // Deep-link support (?reportId=), from the global search "Recent"/"Favorites" sections --
    // fetches independently rather than relying on CustomReportsSection's own list, since that
    // component only mounts while the "Saved Reports" tab is active.
    useEffect(() => {
        const reportId = new URLSearchParams(window.location.search).get("reportId");
        if (!reportId) return;
        apiFetch<any[]>("/reports/custom")
            .then((data) => {
                const report = Array.isArray(data) ? data.find((item) => item.id === reportId) : null;
                if (report) window.dispatchEvent(new CustomEvent("custom-report-edit", { detail: report }));
            })
            .catch(() => undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const availableObjects = useMemo(() => OBJECTS_BY_ROOT[root].filter((object) => catalog[object]?.length), [catalog, root]);
    const getFieldsForObject = (object: string) => {
        const fields = (catalog[object] ?? []).filter((field) => field !== "id" && !field.endsWith("Id"));
        return fields.length ? fields : (catalog[object] ?? []).filter((field) => field !== "id");
    };
    const defaultFieldForObject = (object: string) => {
        const fields = getFieldsForObject(object);
        return fields.includes("name")
            ? "name"
            : fields.includes("title")
                ? "title"
                : fields.includes("createdAt")
                    ? "createdAt"
                    : fields[0] ?? "createdAt";
    };
    const reportFieldOptions = (object: string) => getFieldsForObject(object);
    const stageOptions = useMemo(() => {
        return opportunityTypes.flatMap((type) => (type.stages ?? []).map((stage: any) => ({
            label: `${type.name}: ${stage.name}`,
            value: stage.id,
        })));
    }, [opportunityTypes]);
    const valueOptionsForFilter = (filter: ReportFilterSelection) => {
        const userOptions = users.map((user) => ({ label: user.name || user.email || "User", value: user.id }));
        if (["ownerId", "createdBy"].includes(filter.field) || filter.object.toLowerCase().includes("owner") || filter.object === "assignedTo") return userOptions;
        if (filter.field === "stageId" || filter.object === "stage") return stageOptions;
        if (filter.field === "typeId" || filter.object === "activityType") return activityTypes.map((type) => ({ label: type.name, value: type.id }));
        if (filter.field === "source") return COMMON_LEAD_SOURCES.map((source) => ({ label: source, value: source }));
        if (filter.field === "status") return STATUS_VALUES.map((status) => ({ label: status.replace(/_/g, " "), value: status }));
        if (filter.field === "priority") return PRIORITY_VALUES.map((priority) => ({ label: priority, value: priority }));
        if (filter.field === "slaStatus") return SLA_VALUES.map((sla) => ({ label: sla, value: sla }));
        return [];
    };
    const definition = {
        root,
        savedViewId: savedViewId === "__all__" ? null : savedViewId,
        fields,
        filters: filters.map((filter) => ({
            ...filter,
            value: filter.operator === "is_empty" || filter.operator === "is_not_empty" ? null : filter.value ?? "",
        })),
        orderBy,
        limit,
    };

    const changeRoot = (nextRoot: ReportRoot) => {
        setRoot(nextRoot);
        const firstField = defaultFieldForObject(nextRoot);
        setFields([{ object: nextRoot, field: firstField, label: `${OBJECT_LABELS[nextRoot]} ${formatFieldLabel(firstField)}` }]);
        setFilters([]);
        setSavedViewId("__all__");
        setOrderBy({ object: nextRoot, field: reportFieldOptions(nextRoot).includes("createdAt") ? "createdAt" : firstField, direction: "desc" });
    };

    const updateField = (index: number, patch: Partial<ReportFieldSelection>) => {
        setFields((current) => current.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field));
    };

    const updateFilter = (index: number, patch: Partial<ReportFilterSelection>) => {
        setFilters((current) => current.map((filter, filterIndex) => filterIndex === index ? { ...filter, ...patch } : filter));
    };

    const addField = () => {
        const object = availableObjects[0] ?? root;
        const field = defaultFieldForObject(object);
        setFields((current) => [...current, { object, field, label: `${OBJECT_LABELS[object] ?? object} ${formatFieldLabel(field)}` }]);
    };

    const addFilter = () => {
        const object = availableObjects[0] ?? root;
        const field = defaultFieldForObject(object);
        setFilters((current) => [...current, { object, field, operator: "equals", value: "" }]);
    };

    const runPreview = async () => {
        setRunning(true);
        try {
            const result = await apiFetch("/reports/query", { method: "POST", body: JSON.stringify(definition) });
            setPreview(result);
            toast.success("Report preview refreshed");
        } catch (error: any) {
            toast.error(error.message || "Failed to run report preview");
        } finally {
            setRunning(false);
        }
    };

    const saveReport = async () => {
        setSaving(true);
        try {
            await apiFetch(editingReportId ? `/reports/custom/${editingReportId}` : "/reports/custom", {
                method: editingReportId ? "PATCH" : "POST",
                body: JSON.stringify({
                    name,
                    module: root.toUpperCase(),
                    chartType: "TABLE",
                    config: { queryDefinition: definition },
                }),
            });
            window.dispatchEvent(new Event("custom-report-saved"));
            toast.success(editingReportId ? "Custom report updated" : "Custom report saved");
        } catch (error: any) {
            toast.error(error.message || "Failed to save custom report");
        } finally {
            setSaving(false);
        }
    };

    if (loadingCatalog) return <Skeleton className="mb-4 h-[360px] rounded-2xl" />;

    return (
        <Card id="custom-report-builder" className="mb-4 rounded-2xl">
            <CardContent className="space-y-5 p-6">
                <div className="flex flex-col gap-2 rounded-xl border border-dashed p-3 md:flex-row md:items-center">
                    <Sparkles className="hidden size-4 shrink-0 text-muted-foreground md:block" />
                    <Input
                        placeholder="Ask AI to build a report, e.g. Leads from Website in the last 30 days grouped by status (requires AI Assistant to be configured in Settings)"
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") runAiReportPrompt(); }}
                    />
                    <Button variant="outline" size="sm" disabled={aiGenerating || !aiPrompt.trim()} onClick={runAiReportPrompt}>
                        <Sparkles className="size-4" />
                        {aiGenerating ? "Generating..." : "Ask AI"}
                    </Button>
                </div>
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold">Custom Report Builder</h2>
                            <Badge variant="outline" className="rounded-md">Cross-object</Badge>
                            {editingReportId ? <Badge variant="secondary" className="rounded-md">Editing</Badge> : null}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Build joined reports from CRM objects with validated fields, filters, sorting, and preview rows.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={runPreview} disabled={running || fields.length === 0}>
                            <Play className="size-4" />
                            {running ? "Running..." : "Run Preview"}
                        </Button>
                        <Button onClick={saveReport} disabled={saving || !name.trim() || fields.length === 0}>
                            <Save className="size-4" />
                            {saving ? "Saving..." : editingReportId ? "Update" : "Save"}
                        </Button>
                        {editingReportId ? (
                            <Button variant="ghost" onClick={() => setEditingReportId(null)}>
                                New Report
                            </Button>
                        ) : null}
                    </div>
                </div>

                <Tabs defaultValue="setup" className="space-y-4">
                    <div className="overflow-x-auto pb-1">
                        <TabsList className="h-10 min-w-max">
                            <TabsTrigger value="setup">Setup</TabsTrigger>
                            <TabsTrigger value="columns">Columns</TabsTrigger>
                            <TabsTrigger value="filters">Filters & Sort</TabsTrigger>
                            <TabsTrigger value="preview">Preview</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="setup">
                <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.6fr]">
                    <div className="space-y-2">
                        <Label>Report Name</Label>
                        <Input value={name} onChange={(event) => setName(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Root Object</Label>
                        <Select value={root} onValueChange={(value) => changeRoot(value as ReportRoot)}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {ROOT_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Record Source</Label>
                        <Select value={savedViewId} onValueChange={setSavedViewId}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">All permitted records</SelectItem>
                                {savedViews
                                    .filter((view) => view.tabs?.some((tab: any) => smartViewModuleForReportRoot(root) === tab.module))
                                    .map((view) => (
                                        <SelectItem key={view.id} value={view.id}>{view.name}</SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Row Limit</Label>
                        <Input type="number" min={1} max={1000} value={limit} onChange={(event) => setLimit(Number(event.target.value))} />
                    </div>
                </div>
                    </TabsContent>

                    <TabsContent value="columns">
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold uppercase text-muted-foreground">Columns</Label>
                        <Button type="button" variant="outline" size="sm" onClick={addField}>
                            <Plus className="size-4" />
                            Add Column
                        </Button>
                    </div>
                    <div className="space-y-2">
                        {fields.map((field, index) => (
                            <div key={index} className="grid gap-2 rounded-lg border bg-surface-container-low p-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                                <Select
                                    value={field.object}
                                    onValueChange={(object) => {
                                        const nextField = defaultFieldForObject(object);
                                        updateField(index, { object, field: nextField, label: `${OBJECT_LABELS[object] ?? object} ${formatFieldLabel(nextField)}` });
                                    }}
                                >
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {availableObjects.map((object) => (
                                            <SelectItem key={object} value={object}>{OBJECT_LABELS[object] ?? object}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select value={field.field} onValueChange={(value) => updateField(index, { field: value })}>
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {reportFieldOptions(field.object).map((item) => (
                                            <SelectItem key={item} value={item}>{formatFieldLabel(item)}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Input
                                    value={field.label ?? ""}
                                    placeholder="Display label"
                                    onChange={(event) => updateField(index, { label: event.target.value })}
                                />
                                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index))} aria-label="Remove column">
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
                    </TabsContent>

                    <TabsContent value="filters">
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold uppercase text-muted-foreground">Filters</Label>
                        <Button type="button" variant="outline" size="sm" onClick={addFilter}>
                            <Plus className="size-4" />
                            Add Filter
                        </Button>
                    </div>
                    {filters.length === 0 ? (
                        <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                            No filters. Preview will use the full permission-scoped dataset.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filters.map((filter, index) => {
                                const valueDisabled = filter.operator === "is_empty" || filter.operator === "is_not_empty";
                                return (
                                    <div key={index} className="grid gap-2 rounded-lg border bg-surface-container-low p-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                                        <Select
                                            value={filter.object}
                                            onValueChange={(object) => updateFilter(index, { object, field: defaultFieldForObject(object), value: "" })}
                                        >
                                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {availableObjects.map((object) => (
                                                    <SelectItem key={object} value={object}>{OBJECT_LABELS[object] ?? object}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Select value={filter.field} onValueChange={(value) => updateFilter(index, { field: value })}>
                                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {reportFieldOptions(filter.object).map((item) => (
                                                    <SelectItem key={item} value={item}>{formatFieldLabel(item)}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Select value={filter.operator} onValueChange={(operator) => updateFilter(index, { operator })}>
                                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {REPORT_OPERATORS.map((operator) => (
                                                    <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {valueOptionsForFilter(filter).length > 0 && !valueDisabled ? (
                                            <Select value={String(filter.value ?? "__none__")} onValueChange={(value) => updateFilter(index, { value: value === "__none__" ? "" : value })}>
                                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__none__">Select value</SelectItem>
                                                    {valueOptionsForFilter(filter).map((option) => (
                                                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <Input
                                                value={valueDisabled ? "" : String(filter.value ?? "")}
                                                disabled={valueDisabled}
                                                placeholder={valueDisabled ? "Not required" : "Value"}
                                                onChange={(event) => updateFilter(index, { value: event.target.value })}
                                            />
                                        )}
                                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => setFilters((current) => current.filter((_, filterIndex) => filterIndex !== index))} aria-label="Remove filter">
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr_1fr_0.7fr]">
                    <div className="space-y-2">
                        <Label>Sort Object</Label>
                        <Select value={orderBy.object} onValueChange={(object) => setOrderBy({ object, field: defaultFieldForObject(object), direction: orderBy.direction })}>
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {availableObjects.map((object) => (
                                    <SelectItem key={object} value={object}>{OBJECT_LABELS[object] ?? object}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Sort Field</Label>
                        <Select value={orderBy.field} onValueChange={(field) => setOrderBy({ ...orderBy, field })}>
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {reportFieldOptions(orderBy.object).map((field) => (
                                    <SelectItem key={field} value={field}>{formatFieldLabel(field)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Direction</Label>
                        <Select value={orderBy.direction} onValueChange={(direction) => setOrderBy({ ...orderBy, direction: direction as "asc" | "desc" })}>
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="desc">Descending</SelectItem>
                                <SelectItem value="asc">Ascending</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                    </TabsContent>

                    <TabsContent value="preview">
                {preview ? (
                    <div className="rounded-xl border">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <div className="text-sm font-bold">Preview</div>
                            <div className="text-xs text-muted-foreground">
                                {preview.meta?.returnedRows ?? 0} of {preview.meta?.totalRows ?? 0} rows
                            </div>
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {preview.columns?.map((column: any) => (
                                        <TableHead key={column.key}>{column.label}</TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {preview.rows?.slice(0, 10).map((row: any, rowIndex: number) => (
                                    <TableRow key={rowIndex}>
                                        {preview.columns?.map((column: any) => (
                                            <TableCell key={column.key}>{formatReportCell(row[column.key])}</TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                        Run the report preview to inspect returned columns and rows.
                    </div>
                )}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}

function formatReportCell(value: unknown) {
    if (value === null || value === undefined || value === "") return "—";
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function inbuiltReportPreviewRows(report: any): Array<Record<string, unknown>> {
    if (!report) return [];
    if (Array.isArray(report.rows)) return report.rows as Array<Record<string, unknown>>;
    if (Array.isArray(report.issues)) return report.issues as Array<Record<string, unknown>>;
    if (Array.isArray(report.recentCycles)) return report.recentCycles as Array<Record<string, unknown>>;
    // Attribution explorer (gap checklist Module 17, item 7): bySource is its primary,
    // directly comparable breakdown -- byPartner/byJourney/touchPaths stay in the raw export,
    // not the on-screen preview table, same "one primary table" convention every other report
    // here follows.
    if (Array.isArray(report.bySource) && Array.isArray(report.touchPaths)) return report.bySource as Array<Record<string, unknown>>;
    // Anomaly detection (gap checklist Module 17, item 9): one summary row per domain --
    // the full daily `series` array stays in the raw export, not this table, same "one primary
    // table" convention as attribution explorer's bySource above.
    if (Array.isArray(report.domains) && typeof report.windowDays === "number") {
        return report.domains.map((domain: any) => ({
            domain: domain.domain,
            latestDate: domain.latestDate,
            latestValue: domain.latestValue,
            baselineMean: domain.baselineMean,
            baselineStdDev: domain.baselineStdDev,
            deviationInStdDevs: domain.deviationInStdDevs,
            anomaly: domain.isAnomaly ? domain.direction : "none",
        }));
    }
    // Forecast (gap checklist Module 17, item 10): one summary row per domain -- the day-by-day
    // `history`/`forecast` arrays stay in the raw export, not this table.
    if (Array.isArray(report.domains) && typeof report.horizonDays === "number") {
        return report.domains.map((domain: any) => {
            const last = domain.history?.[domain.history.length - 1];
            const nextForecast = domain.forecast?.[0];
            return {
                domain: domain.domain,
                latestActual: last?.value ?? null,
                latestActualDate: last?.date ?? null,
                nextForecastValue: nextForecast?.value ?? null,
                nextForecastDate: nextForecast?.date ?? null,
                trendPerDay: domain.slope,
            };
        });
    }
    // Executive scorecard (gap checklist Module 17, item 12): one row per (section, metric)
    // pair -- a flat table is the simplest honest rendering of "8 sections, each with its own
    // few key metrics," without inventing a bespoke multi-panel scorecard layout for this pass.
    if (Array.isArray(report.sections) && report.sections.every((section: any) => Array.isArray(section?.metrics))) {
        return report.sections.flatMap((section: any) =>
            section.metrics.map((metric: any) => ({ section: section.label, metric: metric.label, value: metric.value }))
        );
    }
    if (report.payoutStatusCounts && typeof report.payoutStatusCounts === "object") {
        return Object.entries(report.payoutStatusCounts).map(([status, count]) => ({ status, count }));
    }
    if (report.totals && typeof report.totals === "object") {
        return Object.entries(report.totals).map(([metric, value]) => ({ metric, value }));
    }
    return flattenObjectToRows(report);
}

function flattenObjectToRows(source: any, prefix = ""): Array<Record<string, unknown>> {
    if (!source || typeof source !== "object") return [];
    return Object.entries(source).flatMap(([key, value]) => {
        const nextKey = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === "object" && !Array.isArray(value)) return flattenObjectToRows(value, nextKey);
        if (Array.isArray(value)) return [{ metric: nextKey, value: `${value.length} item(s)` }];
        return [{ metric: nextKey, value }];
    });
}

function humanizeReportKey(key: string) {
    return key
        .replace(/\./g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inbuiltDrilldownHref(reportKey: string, row: Record<string, unknown>) {
    if (reportKey === "funnel_conversion_by_stage" && row.stageId) {
        return filteredRecordsHref("/dashboard/opportunities", [{ field: "stageId", operator: "equals", value: row.stageId }]);
    }
    if ((reportKey === "funnel_conversion_by_source_campaign" || reportKey === "lead_source_roi") && row.source) {
        return filteredRecordsHref("/dashboard/leads", [{ field: "source", operator: "equals", value: row.source }]);
    }
    if ((reportKey === "rep_performance" || reportKey === "sla_response_breaches") && (row.repId || row.ownerId)) {
        return filteredRecordsHref("/dashboard/leads", [{ field: "ownerId", operator: "equals", value: row.repId ?? row.ownerId }]);
    }
    if (reportKey === "activity_call_volume_trends" && row.periodStart && row.periodEnd) {
        return filteredActivityHref([
            { field: "createdAt", operator: "gte", value: row.periodStart },
            { field: "createdAt", operator: "lte", value: row.periodEnd },
        ]);
    }
    if (reportKey === "commission_payout_summary" && row.partnerId) {
        return filteredRecordsHref("/dashboard/admin/partners", [{ field: "userId", operator: "equals", value: row.partnerId }]);
    }
    if (reportKey === "cohort_funnel_progression" && row.cohortStart && row.cohortEnd) {
        return filteredRecordsHref("/dashboard/leads", [
            { field: "createdAt", operator: "gte", value: row.cohortStart },
            { field: "createdAt", operator: "lte", value: row.cohortEnd },
        ]);
    }
    if (reportKey === "data_quality" && Array.isArray(row.recordIds) && row.recordIds[0]) {
        return filteredRecordsHref("/dashboard/leads", [{ field: "id", operator: "equals", value: row.recordIds[0] }]);
    }
    return null;
}

function filteredRecordsHref(pathname: string, conditions: Array<{ field: string; operator: string; value: unknown }>) {
    const params = new URLSearchParams();
    params.set("filters", JSON.stringify([{ logic: "AND", conditions }]));
    return `${pathname}?${params.toString()}`;
}

function filteredActivityHref(conditions: Array<{ field: string; operator: string; value: unknown }>) {
    const params = new URLSearchParams();
    params.set("filters", JSON.stringify({ logic: "AND", conditions }));
    return `/dashboard/activities?${params.toString()}`;
}

function ReportSchedulesSection() {
    const [schedules, setSchedules] = useState<any[]>([]);
    const [customReports, setCustomReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [scheduleSource, setScheduleSource] = useState<"inbuilt" | "custom">("inbuilt");
    const [reportKey, setReportKey] = useState(INBUILT_REPORT_OPTIONS[0].value);
    const [customReportId, setCustomReportId] = useState("");
    const [frequency, setFrequency] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("WEEKLY");
    const [dayOfWeek, setDayOfWeek] = useState("1");
    const [dayOfMonth, setDayOfMonth] = useState("1");
    const [format, setFormat] = useState<"LINK" | "CSV" | "PDF" | "XLSX">("LINK");
    const [recipients, setRecipients] = useState("");
    const selectedCustomReport = customReports.find((report) => report.id === customReportId);

    const fetchSchedules = async () => {
        setLoading(true);
        try {
            const data = await apiFetch<any[]>("/reports/schedules");
            setSchedules(Array.isArray(data) ? data : []);
        } catch {
            toast.error("Failed to load report schedules");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSchedules();
        apiFetch<any[]>("/reports/custom")
            .then((data) => {
                const reports = Array.isArray(data) ? data : [];
                setCustomReports(reports);
                setCustomReportId((current) => current || reports[0]?.id || "");
            })
            .catch(() => null);
    }, []);

    const createSchedule = async () => {
        setSaving(true);
        try {
            await apiFetch("/reports/schedules", {
                method: "POST",
                body: JSON.stringify({
                    reportKey: scheduleSource === "custom" ? `custom:${customReportId}` : reportKey,
                    queryDefinition: scheduleSource === "custom" ? selectedCustomReport?.config?.queryDefinition ?? null : null,
                    frequency,
                    dayOfWeek: frequency === "WEEKLY" ? Number(dayOfWeek) : null,
                    dayOfMonth: frequency === "MONTHLY" ? Number(dayOfMonth) : null,
                    format,
                    recipients: recipients.split(",").map((recipient) => recipient.trim()).filter(Boolean),
                    isActive: true,
                }),
            });
            toast.success("Report schedule created");
            setRecipients("");
            fetchSchedules();
        } catch (error: any) {
            toast.error(error.message || "Failed to create report schedule");
        } finally {
            setSaving(false);
        }
    };

    const updateSchedule = async (id: string, patch: Record<string, unknown>) => {
        try {
            await apiFetch(`/reports/schedules/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
            fetchSchedules();
        } catch (error: any) {
            toast.error(error.message || "Failed to update report schedule");
        }
    };

    const deleteSchedule = async (id: string) => {
        if (!confirm("Delete this report schedule?")) return;
        try {
            await apiFetch(`/reports/schedules/${id}`, { method: "DELETE" });
            toast.success("Report schedule deleted");
            fetchSchedules();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete report schedule");
        }
    };

    return (
        <Card className="mb-4 rounded-2xl">
            <CardContent className="space-y-5 p-6">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div>
                        <div className="flex items-center gap-2">
                            <CalendarClock className="size-5 text-primary" />
                            <h2 className="text-lg font-bold">Report Scheduling</h2>
                            <Badge variant="outline" className="rounded-md">Recurring</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Schedule inbuilt reports for recurring delivery. Until mail transport is connected, due runs create pending delivery records.
                        </p>
                    </div>
                    <Button onClick={createSchedule} disabled={saving || !recipients.trim() || (scheduleSource === "custom" && !customReportId)}>
                        <Plus className="size-4" />
                        {saving ? "Creating..." : "Create Schedule"}
                    </Button>
                </div>

                <Tabs defaultValue="create" className="space-y-4">
                    <TabsList className="h-10">
                        <TabsTrigger value="create">Create Schedule</TabsTrigger>
                        <TabsTrigger value="existing">Existing Schedules</TabsTrigger>
                    </TabsList>

                    <TabsContent value="create">
                <div className="grid gap-4 lg:grid-cols-[0.8fr_1.1fr_0.8fr_0.7fr_1.2fr]">
                    <div className="space-y-2">
                        <Label>Source</Label>
                        <Select value={scheduleSource} onValueChange={(value) => setScheduleSource(value as "inbuilt" | "custom")}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="inbuilt">Inbuilt</SelectItem>
                                <SelectItem value="custom">Custom</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Report</Label>
                        {scheduleSource === "custom" ? (
                            <Select value={customReportId} onValueChange={setCustomReportId}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select custom report" />
                                </SelectTrigger>
                                <SelectContent>
                                    {customReports.map((report) => (
                                        <SelectItem key={report.id} value={report.id}>{report.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <Select value={reportKey} onValueChange={setReportKey}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {INBUILT_REPORT_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label>Frequency</Label>
                        <Select value={frequency} onValueChange={(value) => setFrequency(value as "DAILY" | "WEEKLY" | "MONTHLY")}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="DAILY">Daily</SelectItem>
                                <SelectItem value="WEEKLY">Weekly</SelectItem>
                                <SelectItem value="MONTHLY">Monthly</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>{frequency === "MONTHLY" ? "Day of Month" : "Day of Week"}</Label>
                        {frequency === "DAILY" ? (
                            <Input value="Every day" disabled />
                        ) : frequency === "MONTHLY" ? (
                            <Select value={dayOfMonth} onValueChange={setDayOfMonth}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Array.from({ length: 28 }).map((_, index) => (
                                        <SelectItem key={index + 1} value={String(index + 1)}>Day {index + 1}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {WEEKDAY_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label>Recipients</Label>
                        <Input
                            value={recipients}
                            onChange={(event) => setRecipients(event.target.value)}
                            placeholder="ops@example.com, sales@example.com"
                        />
                    </div>
                    <div className="space-y-2 lg:col-span-1">
                        <Label>Format</Label>
                        <Select value={format} onValueChange={(value) => setFormat(value as "LINK" | "CSV" | "PDF" | "XLSX")}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="LINK">Link</SelectItem>
                                <SelectItem value="CSV">CSV</SelectItem>
                                <SelectItem value="XLSX">XLSX</SelectItem>
                                <SelectItem value="PDF">PDF</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                    </TabsContent>

                    <TabsContent value="existing">
                {loading ? (
                    <Skeleton className="h-[120px] rounded-xl" />
                ) : schedules.length === 0 ? (
                    <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                        No recurring schedules yet.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {schedules.map((schedule) => (
                            <div key={schedule.id} className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-3 md:flex-row md:items-center">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-bold">
                                            {reportScheduleLabel(schedule, customReports)}
                                        </span>
                                        <Badge variant="outline" className="rounded-md text-[0.65rem] font-semibold">{schedule.frequency}</Badge>
                                        <Badge variant="outline" className="rounded-md text-[0.65rem] font-semibold">{schedule.format}</Badge>
                                        {!schedule.isActive ? <Badge variant="secondary" className="rounded-md text-[0.65rem] font-semibold">paused</Badge> : null}
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Next run {formatWorkspaceDate(schedule.nextRunAt)} · {schedule.recipients?.join(", ")}
                                    </p>
                                    {schedule.lastRunAt ? (
                                        <p className="text-xs text-muted-foreground">
                                            Last run {formatWorkspaceDate(schedule.lastRunAt)} · {schedule.lastStatus ?? "UNKNOWN"}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={schedule.isActive}
                                        onCheckedChange={(checked) => updateSchedule(schedule.id, { isActive: checked })}
                                        aria-label="Toggle schedule"
                                    />
                                    <Button variant="ghost" size="icon-sm" onClick={() => deleteSchedule(schedule.id)} aria-label="Delete schedule">
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}

const ANNOTATION_CATEGORIES = [
    { value: "CAMPAIGN", label: "Campaign" },
    { value: "EVENT", label: "Event" },
    { value: "OUTAGE", label: "Outage" },
    { value: "POLICY_CHANGE", label: "Policy Change" },
    { value: "INTAKE_DEADLINE", label: "Intake Deadline" },
    { value: "FEE_DEADLINE", label: "Fee Deadline" },
    { value: "LAUNCH", label: "Launch" },
    { value: "OTHER", label: "Other" },
];

// Gap checklist Module 17, item 21: mark campaigns/events/outages/policy changes/intake and fee
// deadlines/launch dates for context. A flat management list here (not yet overlaid directly on
// every chart) -- see the checklist writeup for what's built vs. deferred.
function ReportAnnotationsSection() {
    const [annotations, setAnnotations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [label, setLabel] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState("LAUNCH");
    const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));

    const fetchAnnotations = async () => {
        setLoading(true);
        try {
            const data = await apiFetch<any[]>("/reports/annotations");
            setAnnotations(Array.isArray(data) ? data : []);
        } catch {
            toast.error("Failed to load annotations");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAnnotations();
    }, []);

    const createAnnotation = async () => {
        if (!label.trim()) {
            toast.error("Label is required");
            return;
        }
        setSaving(true);
        try {
            await apiFetch("/reports/annotations", {
                method: "POST",
                body: JSON.stringify({ label: label.trim(), description: description.trim() || null, category, occurredAt }),
            });
            toast.success("Annotation added");
            setLabel("");
            setDescription("");
            await fetchAnnotations();
        } catch (error: any) {
            toast.error(error.message || "Failed to add annotation");
        } finally {
            setSaving(false);
        }
    };

    const deleteAnnotation = async (id: string) => {
        try {
            await apiFetch(`/reports/annotations/${id}`, { method: "DELETE" });
            setAnnotations((current) => current.filter((item) => item.id !== id));
            toast.success("Annotation removed");
        } catch (error: any) {
            toast.error(error.message || "Failed to remove annotation");
        }
    };

    return (
        <Card className="rounded-2xl">
            <CardContent className="space-y-5 p-6">
                <div>
                    <h2 className="text-lg font-bold">Analytics Annotations</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Mark campaigns, events, outages, policy changes, and deadlines for context when reviewing trends.
                    </p>
                </div>

                <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 md:grid-cols-2 lg:grid-cols-5">
                    <div className="space-y-1.5 lg:col-span-2">
                        <Label>Label</Label>
                        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Fall intake launch" />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Category</Label>
                        <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {ANNOTATION_CATEGORIES.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Date</Label>
                        <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
                    </div>
                    <div className="flex items-end">
                        <Button onClick={createAnnotation} disabled={saving} className="w-full">
                            <Plus className="size-4" />
                            {saving ? "Adding..." : "Add"}
                        </Button>
                    </div>
                    <div className="space-y-1.5 md:col-span-2 lg:col-span-5">
                        <Label>Description (optional)</Label>
                        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What happened, and why it matters for this metric" />
                    </div>
                </div>

                {loading ? (
                    <Skeleton className="h-32 w-full rounded-xl" />
                ) : annotations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No annotations yet.</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Label</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {annotations.map((annotation) => (
                                <TableRow key={annotation.id}>
                                    <TableCell>{formatWorkspaceDate(annotation.occurredAt)}</TableCell>
                                    <TableCell className="font-medium">{annotation.label}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="rounded-md">
                                            {ANNOTATION_CATEGORIES.find((option) => option.value === annotation.category)?.label ?? annotation.category}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="max-w-[320px] truncate text-muted-foreground">{annotation.description || "-"}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon-sm" onClick={() => deleteAnnotation(annotation.id)}>
                                            <Trash2 className="size-4 text-destructive" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}

const CATALOG_OBJECT_LABELS: Record<string, string> = {
    lead: "Lead",
    opportunity: "Opportunity",
    activity: "Activity",
    stage: "Opportunity Stage",
    activityType: "Activity Type",
    leadOwner: "Lead Owner",
    opportunityOwner: "Opportunity Owner",
    activityCreator: "Activity Creator",
    assignedTo: "Assigned To",
    assignmentLog: "Assignment Log",
    task: "Task",
    taskOwner: "Task Owner",
    telephonyCall: "Telephony Call",
    telephonyAgent: "Telephony Agent",
    case: "Case",
    caseType: "Case Type",
    caseStatus: "Case Status",
    casePriority: "Case Priority",
    caseOwner: "Case Owner",
    commissionLedger: "Commission Ledger Entry",
    partner: "Partner",
    payout: "Payout",
    communication: "Communication",
    journeyEnrollment: "Journey Enrollment",
    recordScore: "Predictive Score",
};

// Gap checklist Module 17, item 2 (analytics dataset catalog). A real, browsable listing of
// what the custom-report-builder's query engine already models as a joinable object graph
// (`getReportQueryCatalog`/`FIELD_CATALOG` in reporting-query.ts) -- reusing the exact same
// `GET /reports/query` endpoint the builder's own field picker already calls, not a new
// backend. Deliberately NOT a claim of full dataset-catalog coverage: this surfaces the 3
// root objects (lead/opportunity/activity), their existing join targets, Task/TelephonyCallLog/
// Case (join-only satellites reachable via leadId/opportunityId), and -- as of this pass --
// partners/payouts (Opportunity-only, via CommissionLedger), communications, journeys, and
// scoring (all three reachable from both lead/opportunity roots via a polymorphic entityType/
// recordType FK, the same pattern AssignmentLog already used), and custom fields (via a real
// CustomFieldValue table, resolved by FieldDefinition id -- deliberately excluded from this
// static catalog object below since its field list is per-tenant dynamic, not fixed; see the
// "customField" entry in reporting-query.ts's FIELD_CATALOG for the full design rationale).
// Still missing: applications (no schema exists at all -- Module 12's Product Catalog, unbuilt).
function DataCatalogSection() {
    const [catalog, setCatalog] = useState<Record<string, string[]>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        apiFetch<{ objects: Record<string, string[]> }>("/reports/query")
            .then((data) => setCatalog(data.objects ?? {}))
            .catch(() => toast.error("Failed to load the data catalog"))
            .finally(() => setLoading(false));
    }, []);

    const objects = Object.entries(catalog);

    return (
        <Card className="rounded-2xl">
            <CardContent className="space-y-5 p-6">
                <div>
                    <h2 className="text-lg font-bold">Data Catalog</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Objects and fields available to the Custom Report Builder and Advanced Filters.
                    </p>
                </div>

                {loading ? (
                    <Skeleton className="h-32 w-full rounded-xl" />
                ) : objects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No catalog data available.</p>
                ) : (
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {objects.map(([object, fields]) => (
                            <div key={object} className="rounded-xl border p-4">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <h3 className="text-sm font-bold">{CATALOG_OBJECT_LABELS[object] ?? object}</h3>
                                    <Badge variant="outline" className="rounded-md text-[0.65rem]">{fields.length} fields</Badge>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {fields.map((field) => (
                                        <Badge key={field} variant="outline" className="rounded-md text-[0.65rem] font-normal text-muted-foreground">
                                            {field}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <p className="text-xs text-muted-foreground">
                    This catalog reflects what the Custom Report Builder&apos;s query engine can join and filter on today -- it does not yet cover
                    applications (no schema exists at all). Partners, payouts, communications, journeys, and scoring are all joinable now
                    (see Partner/Payout/Communication/Journey Enrollment/Predictive Score above). Custom fields are also queryable via the API
                    (each tenant&apos;s own fields, resolved by id) but aren&apos;t shown as a card here since the field list is per-tenant
                    dynamic, not a fixed catalog -- and aren&apos;t yet wired into this visual builder&apos;s dropdowns below, only reachable
                    directly today.
                </p>
            </CardContent>
        </Card>
    );
}

const METRIC_AGGREGATIONS = [
    { value: "COUNT", label: "Count" },
    { value: "SUM", label: "Sum" },
    { value: "AVG", label: "Average" },
    { value: "MIN", label: "Minimum" },
    { value: "MAX", label: "Maximum" },
];

type MetricFieldRefState = { object: string; field: string };
type MetricFilterState = { object: string; field: string; operator: string; value: string };

const EMPTY_METRIC_FORM = {
    name: "",
    description: "",
    root: "lead" as ReportRoot,
    aggregation: "COUNT",
    aggregateObject: "lead",
    aggregateField: "",
    groupByObject: "__none__",
    groupByField: "",
    visibility: "PRIVATE" as "PRIVATE" | "TEAM" | "TENANT",
    sharedWithTeamId: "",
    // Gap checklist Module 17's semantic metric layer, "grain" sub-item -- daily/weekly/monthly
    // configurable per metric, "__none__" (the default) keeps computing live, unchanged.
    grain: "__none__" as "__none__" | "DAILY" | "WEEKLY" | "MONTHLY",
};

const METRIC_GRAIN_OPTIONS = [
    { value: "__none__", label: "Live (no grain)" },
    { value: "DAILY", label: "Daily" },
    { value: "WEEKLY", label: "Weekly" },
    { value: "MONTHLY", label: "Monthly" },
];

// Gap checklist Module 17, item 2 (semantic metric layer). Self-service authoring only: pick
// an object + field + aggregation + filters + optional single groupBy dimension -- no free-text
// formula box, reusing the exact same catalog (`GET /reports/query`) the Custom Report Builder
// and Data Catalog tabs already fetch, so any object FIELD_CATALOG models (present or future)
// is selectable here with zero UI changes needed when the backend catalog grows.
function MetricsSection() {
    const [catalog, setCatalog] = useState<Record<string, string[]>>({});
    const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
    const [metrics, setMetrics] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(EMPTY_METRIC_FORM);
    const [filters, setFilters] = useState<MetricFilterState[]>([]);
    const [values, setValues] = useState<Record<string, MetricQueryResult | null>>({});
    const [computingId, setComputingId] = useState<string | null>(null);
    const [historyMetricId, setHistoryMetricId] = useState<string | null>(null);

    const loadMetrics = async () => {
        setLoading(true);
        try {
            const data = await apiFetch<any[]>("/metrics");
            setMetrics(Array.isArray(data) ? data : []);
        } catch (error: any) {
            toast.error(error.message || "Failed to load metrics");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        apiFetch<{ objects: Record<string, string[]> }>("/reports/query")
            .then((data) => setCatalog(data.objects ?? {}))
            .catch(() => toast.error("Failed to load the metric field catalog"));
        apiFetch<Array<{ id: string; name: string }>>("/teams")
            .then((result) => setTeams(Array.isArray(result) ? result : []))
            .catch(() => undefined);
        loadMetrics();
    }, []);

    const availableObjects = useMemo(
        () => OBJECTS_BY_ROOT[form.root].filter((object) => catalog[object]?.length),
        [catalog, form.root],
    );
    const fieldsForObject = (object: string) => {
        const fields = (catalog[object] ?? []).filter((field) => field !== "id" && !field.endsWith("Id"));
        return fields.length ? fields : (catalog[object] ?? []).filter((field) => field !== "id");
    };

    const resetForm = () => {
        setEditingId(null);
        setForm(EMPTY_METRIC_FORM);
        setFilters([]);
    };

    const changeRoot = (root: ReportRoot) => {
        const fields = fieldsForObject(root);
        setForm((current) => ({ ...current, root, aggregateObject: root, aggregateField: fields[0] ?? "", groupByObject: "__none__", groupByField: "" }));
        setFilters([]);
    };

    const addFilter = () => {
        const object = availableObjects[0] ?? form.root;
        setFilters((current) => [...current, { object, field: fieldsForObject(object)[0] ?? "id", operator: "equals", value: "" }]);
    };
    const updateFilter = (index: number, patch: Partial<MetricFilterState>) => {
        setFilters((current) => current.map((filter, filterIndex) => (filterIndex === index ? { ...filter, ...patch } : filter)));
    };

    const startEdit = (metric: any) => {
        setEditingId(metric.id);
        setForm({
            name: metric.name ?? "",
            description: metric.description ?? "",
            root: metric.root,
            aggregation: metric.aggregation,
            aggregateObject: metric.aggregateField?.object ?? metric.root,
            aggregateField: metric.aggregateField?.field ?? "",
            groupByObject: metric.groupBy?.object ?? "__none__",
            groupByField: metric.groupBy?.field ?? "",
            visibility: metric.visibility ?? "PRIVATE",
            sharedWithTeamId: metric.sharedWithTeamId ?? "",
            grain: metric.grain ?? "__none__",
        });
        setFilters((metric.filters ?? []).map((filter: any) => ({
            object: filter.object, field: filter.field, operator: filter.operator ?? "equals", value: filter.value === null || filter.value === undefined ? "" : String(filter.value),
        })));
        document.getElementById("metric-builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const saveMetric = async () => {
        if (!form.name.trim()) {
            toast.error("Metric name is required");
            return;
        }
        if (form.aggregation !== "COUNT" && !form.aggregateField) {
            toast.error("Pick a field to aggregate, or switch to Count");
            return;
        }
        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                description: form.description.trim() || null,
                root: form.root,
                aggregation: form.aggregation,
                aggregateField: form.aggregation === "COUNT" ? null : { object: form.aggregateObject, field: form.aggregateField },
                filters: filters.map((filter) => ({
                    object: filter.object,
                    field: filter.field,
                    operator: filter.operator,
                    value: filter.operator === "is_empty" || filter.operator === "is_not_empty" ? null : filter.value,
                })),
                groupBy: form.groupByObject === "__none__" ? null : { object: form.groupByObject, field: form.groupByField },
                visibility: form.visibility,
                sharedWithTeamId: form.visibility === "TEAM" ? form.sharedWithTeamId || null : null,
                grain: form.grain === "__none__" ? null : form.grain,
            };
            await apiFetch(editingId ? `/metrics/${editingId}` : "/metrics", {
                method: editingId ? "PATCH" : "POST",
                body: JSON.stringify(payload),
            });
            toast.success(editingId ? "Metric updated" : "Metric created");
            resetForm();
            await loadMetrics();
        } catch (error: any) {
            toast.error(error.message || "Failed to save metric");
        } finally {
            setSaving(false);
        }
    };

    const deleteMetric = async (id: string) => {
        try {
            await apiFetch(`/metrics/${id}`, { method: "DELETE" });
            setMetrics((current) => current.filter((metric) => metric.id !== id));
            toast.success("Metric deleted");
        } catch (error: any) {
            toast.error(error.message || "Failed to delete metric");
        }
    };

    const computeValue = async (id: string) => {
        setComputingId(id);
        try {
            const result = await apiFetch<MetricQueryResult>(`/metrics/${id}/value`);
            setValues((current) => ({ ...current, [id]: result }));
        } catch (error: any) {
            toast.error(error.message || "Failed to compute metric value");
        } finally {
            setComputingId(null);
        }
    };

    const setGovernance = async (id: string, patch: { certificationStatus?: string; deprecationStatus?: string }) => {
        try {
            await apiFetch(`/metrics/${id}/governance`, { method: "PATCH", body: JSON.stringify(patch) });
            toast.success("Metric governance updated");
            await loadMetrics();
        } catch (error: any) {
            toast.error(error.message || "You may not have permission to change this metric's governance state");
        }
    };

    const formatMetricValue = (result: MetricQueryResult | null | undefined) => {
        if (!result) return null;
        if (result.groups) return result.groups.map((group) => `${group.label}: ${group.value}`).join(", ");
        return String(result.value);
    };

    return (
        <div className="space-y-4">
            <Card className="rounded-2xl" id="metric-builder">
                <CardContent className="space-y-5 p-6">
                    <div>
                        <h2 className="text-lg font-bold">{editingId ? "Edit Metric" : "New Metric"}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Pick an object, a field, and an aggregation -- no formula editor. Optional filters and a single group-by dimension.
                        </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>Name</Label>
                            <Input value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} placeholder="Open pipeline value" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Description (optional)</Label>
                            <Input value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} placeholder="What this metric means and when to use it" />
                        </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label>Root</Label>
                            <Select value={form.root} onValueChange={(value) => changeRoot(value as ReportRoot)}>
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {ROOT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Aggregation</Label>
                            <Select value={form.aggregation} onValueChange={(value) => setForm((current) => ({ ...current, aggregation: value }))}>
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {METRIC_AGGREGATIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        {form.aggregation !== "COUNT" ? (
                            <div className="space-y-1.5">
                                <Label>Field to aggregate</Label>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <Select
                                        value={form.aggregateObject}
                                        onValueChange={(object) => setForm((current) => ({ ...current, aggregateObject: object, aggregateField: fieldsForObject(object)[0] ?? "" }))}
                                    >
                                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {availableObjects.map((object) => <SelectItem key={object} value={object}>{OBJECT_LABELS[object] ?? object}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Select value={form.aggregateField} onValueChange={(field) => setForm((current) => ({ ...current, aggregateField: field }))}>
                                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {fieldsForObject(form.aggregateObject).map((field) => <SelectItem key={field} value={field}>{formatFieldLabel(field)}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-end text-xs text-muted-foreground">Count doesn&apos;t need a field -- it counts matching records.</div>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label>Group by (optional)</Label>
                        <div className="grid grid-cols-2 gap-1.5 md:w-2/3">
                            <Select
                                value={form.groupByObject}
                                onValueChange={(object) => setForm((current) => ({ ...current, groupByObject: object, groupByField: object === "__none__" ? "" : fieldsForObject(object)[0] ?? "", grain: object === "__none__" ? current.grain : "__none__" }))}
                            >
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">No grouping</SelectItem>
                                    {availableObjects.map((object) => <SelectItem key={object} value={object}>{OBJECT_LABELS[object] ?? object}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            {form.groupByObject !== "__none__" ? (
                                <Select value={form.groupByField} onValueChange={(field) => setForm((current) => ({ ...current, groupByField: field }))}>
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {fieldsForObject(form.groupByObject).map((field) => <SelectItem key={field} value={field}>{formatFieldLabel(field)}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            ) : null}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Grain</Label>
                        <Select
                            value={form.grain}
                            onValueChange={(grain) => setForm((current) => ({ ...current, grain: grain as typeof current.grain, groupByObject: grain === "__none__" ? current.groupByObject : "__none__", groupByField: grain === "__none__" ? current.groupByField : "" }))}
                        >
                            <SelectTrigger className="w-full md:w-1/3"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {METRIC_GRAIN_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Tracks this metric&apos;s value over time instead of only its live total. Requires no group-by dimension.</p>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold uppercase text-muted-foreground">Filters</Label>
                            <Button type="button" variant="outline" size="sm" onClick={addFilter}>
                                <Plus className="size-4" />
                                Add Filter
                            </Button>
                        </div>
                        {filters.length === 0 ? (
                            <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-3 text-sm text-muted-foreground">No filters -- uses the full dataset for this root.</div>
                        ) : (
                            filters.map((filter, index) => (
                                <div key={index} className="grid gap-2 rounded-lg border bg-surface-container-low p-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                                    <Select value={filter.object} onValueChange={(object) => updateFilter(index, { object, field: fieldsForObject(object)[0] ?? "id" })}>
                                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {availableObjects.map((object) => <SelectItem key={object} value={object}>{OBJECT_LABELS[object] ?? object}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Select value={filter.field} onValueChange={(field) => updateFilter(index, { field })}>
                                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {fieldsForObject(filter.object).map((field) => <SelectItem key={field} value={field}>{formatFieldLabel(field)}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Select value={filter.operator} onValueChange={(operator) => updateFilter(index, { operator })}>
                                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {REPORT_OPERATORS.map((operator) => <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        value={filter.operator === "is_empty" || filter.operator === "is_not_empty" ? "" : filter.value}
                                        disabled={filter.operator === "is_empty" || filter.operator === "is_not_empty"}
                                        placeholder={filter.operator === "is_empty" || filter.operator === "is_not_empty" ? "Not required" : "Value"}
                                        onChange={(e) => updateFilter(index, { value: e.target.value })}
                                    />
                                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => setFilters((current) => current.filter((_, filterIndex) => filterIndex !== index))} aria-label="Remove filter">
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label>Sharing</Label>
                        <div className="grid gap-1.5 md:w-2/3 md:grid-cols-2">
                            <Select value={form.visibility} onValueChange={(value) => setForm((current) => ({ ...current, visibility: value as "PRIVATE" | "TEAM" | "TENANT" }))}>
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="PRIVATE">Only me</SelectItem>
                                    <SelectItem value="TEAM">My team</SelectItem>
                                    <SelectItem value="TENANT">Everyone in this workspace</SelectItem>
                                </SelectContent>
                            </Select>
                            {form.visibility === "TEAM" ? (
                                <Select value={form.sharedWithTeamId} onValueChange={(value) => setForm((current) => ({ ...current, sharedWithTeamId: value }))}>
                                    <SelectTrigger className="w-full"><SelectValue placeholder="Select a team" /></SelectTrigger>
                                    <SelectContent>
                                        {teams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">Sharing only affects who can view this metric -- only you can edit or delete it.</p>
                    </div>

                    <div className="flex justify-end gap-2">
                        {editingId ? <Button variant="outline" onClick={resetForm}>Cancel</Button> : null}
                        <Button onClick={saveMetric} disabled={saving}>
                            <Save className="size-4" />
                            {saving ? "Saving..." : editingId ? "Save Changes" : "Create Metric"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-2xl">
                <CardContent className="space-y-4 p-6">
                    <h2 className="text-lg font-bold">Metrics</h2>
                    {loading ? (
                        <Skeleton className="h-32 w-full rounded-xl" />
                    ) : metrics.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No metrics defined yet.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Definition</TableHead>
                                    <TableHead>Governance</TableHead>
                                    <TableHead>Sharing</TableHead>
                                    <TableHead>Value</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {metrics.map((metric) => (
                                    <TableRow key={metric.id}>
                                        <TableCell className="font-medium">
                                            {metric.name}
                                            {metric.description ? <p className="text-xs font-normal text-muted-foreground">{metric.description}</p> : null}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {metric.aggregation}{metric.aggregateField ? ` of ${OBJECT_LABELS[metric.aggregateField.object] ?? metric.aggregateField.object}.${formatFieldLabel(metric.aggregateField.field)}` : ""}
                                            {metric.groupBy ? ` by ${OBJECT_LABELS[metric.groupBy.object] ?? metric.groupBy.object}.${formatFieldLabel(metric.groupBy.field)}` : ""}
                                            {metric.grain ? <Badge variant="outline" className="ml-1.5 py-0 text-[10px]">{metric.grain}</Badge> : null}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <Badge
                                                    variant="outline"
                                                    className={cn("w-fit cursor-pointer rounded-md text-[0.65rem]", metric.certificationStatus === "CERTIFIED" && "border-green-600 text-green-700")}
                                                    onClick={() => setGovernance(metric.id, { certificationStatus: metric.certificationStatus === "CERTIFIED" ? "UNCERTIFIED" : "CERTIFIED" })}
                                                >
                                                    {metric.certificationStatus === "CERTIFIED" ? "Certified" : "Uncertified"}
                                                </Badge>
                                                <Badge
                                                    variant="outline"
                                                    className={cn("w-fit cursor-pointer rounded-md text-[0.65rem]", metric.deprecationStatus === "DEPRECATED" && "border-amber-600 text-amber-700")}
                                                    onClick={() => setGovernance(metric.id, { deprecationStatus: metric.deprecationStatus === "DEPRECATED" ? "ACTIVE" : "DEPRECATED" })}
                                                >
                                                    {metric.deprecationStatus === "DEPRECATED" ? "Deprecated" : "Active"}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {metric.visibility === "PRIVATE" ? "Only me" : metric.visibility === "TENANT" ? "Everyone" : `Team: ${teams.find((team) => team.id === metric.sharedWithTeamId)?.name ?? "—"}`}
                                        </TableCell>
                                        <TableCell className="max-w-[220px] truncate text-xs">
                                            {values[metric.id] !== undefined
                                                ? formatMetricValue(values[metric.id])
                                                : <Button variant="ghost" size="sm" onClick={() => computeValue(metric.id)} disabled={computingId === metric.id}>
                                                    {computingId === metric.id ? "Computing..." : "Compute"}
                                                </Button>}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {metric.grain ? (
                                                <Button variant="ghost" size="icon-sm" onClick={() => setHistoryMetricId(metric.id)} aria-label="View grain history">
                                                    <History className="size-4" />
                                                </Button>
                                            ) : null}
                                            {metric.isOwner ? (
                                                <>
                                                    <Button variant="ghost" size="icon-sm" onClick={() => startEdit(metric)} aria-label="Edit metric">
                                                        <RefreshCw className="size-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon-sm" onClick={() => deleteMetric(metric.id)} aria-label="Delete metric">
                                                        <Trash2 className="size-4 text-destructive" />
                                                    </Button>
                                                </>
                                            ) : null}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <MetricGrainHistoryDialog metricId={historyMetricId} onClose={() => setHistoryMetricId(null)} />
        </div>
    );
}

// Gap checklist Module 17's semantic metric layer, "grain" sub-item -- the stored period-
// snapshot history for a grain-enabled metric.
function MetricGrainHistoryDialog({ metricId, onClose }: { metricId: string | null; onClose: () => void }) {
    const [series, setSeries] = useState<Array<{ date: string; value: number }>>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!metricId) return;
        setLoading(true);
        apiFetch<{ grain: string | null; series: Array<{ date: string; value: number }> }>(`/metrics/${metricId}/series`)
            .then((data) => setSeries(Array.isArray(data.series) ? data.series : []))
            .catch((error: any) => toast.error(error.message || "Failed to load grain history"))
            .finally(() => setLoading(false));
    }, [metricId]);

    return (
        <StandardDialog open={!!metricId} onClose={onClose} title="Grain History" subtitle="One stored value per completed period -- new periods appear here once a background job computes them.">
            {loading ? (
                <Skeleton className="m-4 h-24 rounded-xl" />
            ) : series.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No periods computed yet.</p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Period Start</TableHead>
                            <TableHead>Value</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {series.map((point) => (
                            <TableRow key={point.date}>
                                <TableCell className="text-xs">{formatWorkspaceDate(point.date)}</TableCell>
                                <TableCell className="text-xs font-medium">{point.value}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </StandardDialog>
    );
}

const CALCULATED_METRIC_OPERATORS = [
    { value: "+", label: "+" },
    { value: "-", label: "−" },
    { value: "*", label: "×" },
    { value: "/", label: "÷" },
];

type CalculatedMetricStepDraft = { metricId: string; operator: string | null };

// Gap checklist Module 17, item 16 ("custom calculated fields/measures"). Simple fixed-operator
// math chaining already-defined metrics only -- no free-text formula box, reusing whatever the
// metric layer (built earlier this pass) already produces.
function CalculatedMetricsSection() {
    const [metrics, setMetrics] = useState<any[]>([]);
    const [calculatedMetrics, setCalculatedMetrics] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState("");
    const [steps, setSteps] = useState<CalculatedMetricStepDraft[]>([]);
    const [values, setValues] = useState<Record<string, number | null | undefined>>({});
    const [computingId, setComputingId] = useState<string | null>(null);

    const loadCalculatedMetrics = async () => {
        try {
            const data = await apiFetch<any[]>("/calculated-metrics");
            setCalculatedMetrics(Array.isArray(data) ? data : []);
        } catch (error: any) {
            toast.error(error.message || "Failed to load calculated metrics");
        }
    };

    useEffect(() => {
        setLoading(true);
        Promise.all([
            apiFetch<any[]>("/metrics").then((data) => setMetrics(Array.isArray(data) ? data : [])).catch(() => setMetrics([])),
            loadCalculatedMetrics(),
        ]).finally(() => setLoading(false));
    }, []);

    const metricLabel = (id: string) => metrics.find((m) => m.id === id)?.name ?? id;

    const addStep = () => {
        const defaultMetricId = metrics[0]?.id ?? "";
        setSteps((current) => [...current, { metricId: defaultMetricId, operator: current.length === 0 ? null : "+" }]);
    };
    const updateStep = (index: number, patch: Partial<CalculatedMetricStepDraft>) => {
        setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));
    };
    const removeStep = (index: number) => {
        setSteps((current) => current.filter((_, i) => i !== index).map((step, i) => (i === 0 ? { ...step, operator: null } : step)));
    };

    const save = async () => {
        if (!name.trim()) {
            toast.error("Name is required");
            return;
        }
        if (steps.length < 2 || steps.some((step) => !step.metricId)) {
            toast.error("Pick at least 2 metrics to chain");
            return;
        }
        setSaving(true);
        try {
            await apiFetch("/calculated-metrics", { method: "POST", body: JSON.stringify({ name: name.trim(), steps }) });
            toast.success("Calculated metric created");
            setName("");
            setSteps([]);
            await loadCalculatedMetrics();
        } catch (error: any) {
            toast.error(error.message || "Failed to save calculated metric");
        } finally {
            setSaving(false);
        }
    };

    const deleteCalculatedMetric = async (id: string) => {
        try {
            await apiFetch(`/calculated-metrics/${id}`, { method: "DELETE" });
            setCalculatedMetrics((current) => current.filter((m) => m.id !== id));
        } catch (error: any) {
            toast.error(error.message || "Failed to delete calculated metric");
        }
    };

    const computeValue = async (id: string) => {
        setComputingId(id);
        try {
            const result = await apiFetch<{ value: number | null }>(`/calculated-metrics/${id}/value`);
            setValues((current) => ({ ...current, [id]: result.value }));
        } catch (error: any) {
            toast.error(error.message || "Failed to compute calculated metric");
        } finally {
            setComputingId(null);
        }
    };

    const expressionFor = (metricSteps: CalculatedMetricStepDraft[]) =>
        metricSteps.map((step, i) => (i === 0 ? metricLabel(step.metricId) : `${step.operator} ${metricLabel(step.metricId)}`)).join(" ");

    if (loading) return <Skeleton className="h-32 w-full rounded-xl" />;

    return (
        <Card className="rounded-2xl">
            <CardContent className="space-y-5 p-6">
                <div>
                    <h2 className="text-lg font-bold">Calculated Metrics</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Chain existing metrics with +, −, ×, ÷ -- no free-text formulas.</p>
                </div>

                <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                    <div className="space-y-1.5">
                        <Label>Name</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Net Revenue per Lead" />
                    </div>
                    <div className="space-y-2">
                        {steps.map((step, index) => (
                            <div key={index} className="flex items-center gap-2">
                                {index > 0 ? (
                                    <Select value={step.operator ?? "+"} onValueChange={(operator) => updateStep(index, { operator })}>
                                        <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {CALCULATED_METRIC_OPERATORS.map((op) => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                ) : <span className="w-16 text-center text-sm text-muted-foreground">Start</span>}
                                <Select value={step.metricId} onValueChange={(metricId) => updateStep(index, { metricId })}>
                                    <SelectTrigger className="w-full"><SelectValue placeholder="Choose a metric" /></SelectTrigger>
                                    <SelectContent>
                                        {metrics.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeStep(index)} aria-label="Remove step">
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addStep} disabled={!metrics.length}>
                            <Plus className="size-4" />
                            Add Metric
                        </Button>
                        {!metrics.length ? <p className="text-xs text-muted-foreground">Create a metric first (Metrics section above).</p> : null}
                    </div>
                    <div className="flex justify-end">
                        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Create Calculated Metric"}</Button>
                    </div>
                </div>

                {calculatedMetrics.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No calculated metrics yet.</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Formula</TableHead>
                                <TableHead>Value</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {calculatedMetrics.map((metric) => (
                                <TableRow key={metric.id}>
                                    <TableCell className="font-medium">{metric.name}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{expressionFor(metric.steps)}</TableCell>
                                    <TableCell className="text-xs">
                                        {values[metric.id] !== undefined
                                            ? (values[metric.id] === null ? "—" : values[metric.id])
                                            : <Button variant="ghost" size="sm" onClick={() => computeValue(metric.id)} disabled={computingId === metric.id}>
                                                {computingId === metric.id ? "Computing..." : "Compute"}
                                            </Button>}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {metric.isOwner ? (
                                            <Button variant="ghost" size="icon-sm" onClick={() => deleteCalculatedMetric(metric.id)} aria-label="Delete calculated metric">
                                                <Trash2 className="size-4 text-destructive" />
                                            </Button>
                                        ) : null}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}

// Gap checklist Module 17, item 8 ("segmentation and comparison tools" -- the bullet's own core
// remaining gap: "a user picking any two arbitrary segments and diffing them side by side").
// Deliberately allows comparing across mismatched levels/dimensions (LEAD vs OPPORTUNITY, any
// dimension vs any other), per explicit user direction. LEAD_DIMENSIONS/OPPORTUNITY_DIMENSIONS
// must stay in sync with the server's own LEAD_COMPARISON_DIMENSIONS/
// OPPORTUNITY_COMPARISON_DIMENSIONS (inbuilt-reports.ts) -- small, stable, fixed lists, not
// worth a dedicated catalog endpoint just for this.
const COMPARISON_LEVELS = [
    { value: "LEAD", label: "Leads" },
    { value: "OPPORTUNITY", label: "Opportunities" },
];
const LEAD_DIMENSIONS = [
    { value: "SOURCE", label: "Source" },
    { value: "CAMPAIGN", label: "Campaign" },
    { value: "SCORE_BAND", label: "Score Band" },
    { value: "OWNER", label: "Owner" },
];
const OPPORTUNITY_DIMENSIONS = [
    { value: "SOURCE", label: "Source" },
    { value: "OWNER", label: "Owner" },
    { value: "OPPORTUNITY_TYPE", label: "Opportunity Type" },
    { value: "PARTNER", label: "Partner" },
    { value: "STAGE", label: "Stage" },
];

type ComparisonSegmentDraft = { level: "LEAD" | "OPPORTUNITY"; dimension: string; value: string };
const EMPTY_SEGMENT_DRAFT: ComparisonSegmentDraft = { level: "LEAD", dimension: "SOURCE", value: "" };

function SegmentBuilder({ label, segment, onChange }: { label: string; segment: ComparisonSegmentDraft; onChange: (next: ComparisonSegmentDraft) => void }) {
    const dimensionOptions = segment.level === "LEAD" ? LEAD_DIMENSIONS : OPPORTUNITY_DIMENSIONS;
    return (
        <div className="space-y-2 rounded-xl border p-3">
            <Label className="text-xs font-bold uppercase text-muted-foreground">{label}</Label>
            <div className="grid gap-2 sm:grid-cols-3">
                <Select value={segment.level} onValueChange={(level) => onChange({ level: level as "LEAD" | "OPPORTUNITY", dimension: level === "LEAD" ? "SOURCE" : "SOURCE", value: "" })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {COMPARISON_LEVELS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={segment.dimension} onValueChange={(dimension) => onChange({ ...segment, dimension, value: "" })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {dimensionOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Input value={segment.value} onChange={(e) => onChange({ ...segment, value: e.target.value })} placeholder="Exact value, e.g. Website" />
            </div>
        </div>
    );
}

function SegmentComparisonSection() {
    const [segmentA, setSegmentA] = useState<ComparisonSegmentDraft>(EMPTY_SEGMENT_DRAFT);
    const [segmentB, setSegmentB] = useState<ComparisonSegmentDraft>({ ...EMPTY_SEGMENT_DRAFT });
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const compare = async () => {
        if (!segmentA.value.trim() || !segmentB.value.trim()) {
            toast.error("Both segments need a value to compare");
            return;
        }
        setLoading(true);
        try {
            const params = new URLSearchParams({
                levelA: segmentA.level, dimensionA: segmentA.dimension, valueA: segmentA.value.trim(),
                levelB: segmentB.level, dimensionB: segmentB.dimension, valueB: segmentB.value.trim(),
            });
            const data = await apiFetch(`/reports/inbuilt/segment-comparison?${params.toString()}`);
            setResult(data);
        } catch (error: any) {
            toast.error(error.message || "Failed to compare segments");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="rounded-2xl">
            <CardContent className="space-y-5 p-6">
                <div>
                    <h2 className="text-lg font-bold">Compare Segments</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Pick any two segments -- even across leads and opportunities, or different dimensions -- and diff them side by side.
                    </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                    <SegmentBuilder label="Segment A" segment={segmentA} onChange={setSegmentA} />
                    <SegmentBuilder label="Segment B" segment={segmentB} onChange={setSegmentB} />
                </div>

                <div className="flex justify-end">
                    <Button onClick={compare} disabled={loading}>{loading ? "Comparing..." : "Compare"}</Button>
                </div>

                {result ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Segment</TableHead>
                                <TableHead>Records</TableHead>
                                <TableHead>Won</TableHead>
                                <TableHead>Win Rate</TableHead>
                                <TableHead>Avg Deal Value</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {result.segments.map((segment: any, index: number) => (
                                <TableRow key={index}>
                                    <TableCell className="font-medium">
                                        {segment.level === "LEAD" ? "Lead" : "Opportunity"}: {segment.dimension} = {segment.value}
                                    </TableCell>
                                    <TableCell>{segment.recordCount}</TableCell>
                                    <TableCell>{segment.wonCount}</TableCell>
                                    <TableCell>{segment.wonRate !== null ? `${(segment.wonRate * 100).toFixed(1)}%` : "—"}</TableCell>
                                    <TableCell>{segment.avgDealValue !== null ? formatCurrency(segment.avgDealValue) : "—"}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : null}
            </CardContent>
        </Card>
    );
}

function reportScheduleLabel(schedule: any, customReports: any[]) {
    const reportKey = String(schedule.reportKey ?? "");
    if (reportKey.startsWith("custom:")) {
        const id = reportKey.slice("custom:".length);
        return customReports.find((report) => report.id === id)?.name ?? "Saved custom report";
    }
    return INBUILT_REPORT_OPTIONS.find((option) => option.value === reportKey)?.label ?? reportKey;
}

function smartViewModuleForReportRoot(root: ReportRoot) {
    if (root === "lead") return "LEADS";
    if (root === "opportunity") return "OPPORTUNITIES";
    return "ACTIVITIES";
}

function CustomReportsSection() {
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    // Gap checklist Module 17 ("dashboard/report versioning" -- change history + rollback).
    const [historyReportId, setHistoryReportId] = useState<string | null>(null);
    const [favoriteReportIds, setFavoriteReportIds] = useState<string[]>([]);

    const fetchReports = () => {
        setLoading(true);
        apiFetch("/reports/custom")
            .then(setReports)
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchReports();
        window.addEventListener("custom-report-saved", fetchReports);
        return () => window.removeEventListener("custom-report-saved", fetchReports);
    }, []);

    useEffect(() => {
        setFavoriteReportIds(getFavoriteRecords().filter((record) => record.type === "report").map((record) => record.id));
    }, []);

    const toggleFavoriteReport = (report: any) => {
        const updated = toggleFavoriteRecord("report", report.id, report.name ?? "Custom report");
        setFavoriteReportIds(updated.filter((record) => record.type === "report").map((record) => record.id));
    };

    const handleEdit = (report: any) => {
        // Usage metrics (fire-and-forget, gap checklist's "usage metrics" sub-item) -- only on
        // an actual open, not every render.
        apiFetch(`/reports/custom/${report.id}/open`, { method: "POST" }).catch(() => undefined);
        window.dispatchEvent(new CustomEvent("custom-report-edit", { detail: report }));
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this custom report?")) return;
        try {
            await apiFetch(`/reports/custom/${id}`, { method: "DELETE" });
            toast.success("Custom report deleted");
            fetchReports();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete custom report");
        }
    };

    const publishVersion = async (id: string) => {
        const notes = window.prompt("Publish notes (optional)") ?? undefined;
        try {
            const updated = await apiFetch<any>(`/reports/custom/${id}/versions`, { method: "POST", body: JSON.stringify({ publishNotes: notes || null }) });
            setReports((current) => current.map((report) => (report.id === id ? updated : report)));
            toast.success(`Published version ${updated.currentVersion}`);
        } catch (error: any) {
            toast.error(error.message || "Failed to publish version");
        }
    };

    const cloneReport = async (report: any) => {
        const newName = window.prompt("Name for the cloned report", `${report.name} (Copy)`);
        if (!newName || !newName.trim()) return;
        try {
            await apiFetch(`/reports/custom/${report.id}/clone`, { method: "POST", body: JSON.stringify({ name: newName.trim() }) });
            toast.success(`Cloned to "${newName.trim()}"`);
            fetchReports();
        } catch (error: any) {
            toast.error(error.message || "Failed to clone report");
        }
    };

    const transferOwner = async (id: string) => {
        const newOwnerUserId = window.prompt("New owner's user id");
        if (!newOwnerUserId || !newOwnerUserId.trim()) return;
        try {
            await apiFetch(`/reports/custom/${id}/transfer`, { method: "POST", body: JSON.stringify({ newOwnerUserId: newOwnerUserId.trim() }) });
            toast.success("Report ownership transferred");
            fetchReports();
        } catch (error: any) {
            toast.error(error.message || "Failed to transfer ownership");
        }
    };

    const toggleDeprecation = async (report: any) => {
        const nextStatus = report.deprecationStatus === "DEPRECATED" ? "ACTIVE" : "DEPRECATED";
        const reason = nextStatus === "DEPRECATED" ? window.prompt("Deprecation reason (optional)") ?? undefined : undefined;
        try {
            const updated = await apiFetch<any>(`/reports/custom/${report.id}/deprecation`, { method: "PATCH", body: JSON.stringify({ status: nextStatus, reason: reason || null }) });
            setReports((current) => current.map((item) => (item.id === report.id ? updated : item)));
        } catch (error: any) {
            toast.error(error.message || "Failed to update deprecation status");
        }
    };

    if (loading) return <Skeleton className="mb-4 h-[100px] rounded-2xl" />;

    return (
        <Card className="mb-4 rounded-2xl">
            <CardContent className="p-6">
                <h2 className="mb-3 text-lg font-bold">Custom Reports</h2>
                {reports.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No custom reports created yet.</p>
                ) : (
                    <div className="space-y-3">
                        {reports.map((report) => (
                            <div key={report.id} className="flex items-center justify-between rounded-lg bg-accent p-3">
                                <div>
                                    <div className="flex items-center gap-1.5 text-sm font-bold">
                                        {report.name}
                                        {report.deprecationStatus === "DEPRECATED" ? <Badge variant="outline" className="py-0 text-[10px]">Deprecated</Badge> : null}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {report.module} • Created {formatWorkspaceDate(report.createdAt)}
                                        {report.currentVersion ? ` • v${report.currentVersion}` : ""}
                                        {(report.viewCount ?? 0) > 0 ? ` • Opened ${report.viewCount}x` : ""}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="icon-sm"
                                        variant="ghost"
                                        onClick={() => toggleFavoriteReport(report)}
                                        aria-label={favoriteReportIds.includes(report.id) ? `Unfavorite ${report.name}` : `Favorite ${report.name}`}
                                    >
                                        <Star className={cn("size-4", favoriteReportIds.includes(report.id) ? "fill-amber-500 text-amber-500" : "text-muted-foreground")} />
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => handleEdit(report)}>
                                        Edit
                                    </Button>
                                    <QueueExportButton
                                        moduleName="REPORTS"
                                        filters={{ reportKind: "CUSTOM", customReportId: report.id }}
                                        label="Export CSV"
                                        size="sm"
                                        variant="ghost"
                                    />
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button size="icon-sm" variant="ghost" aria-label={`${report.name} report options`}>
                                                <MoreVertical className="size-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => publishVersion(report.id)}>
                                                <Save className="size-4" />
                                                Publish Version
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setHistoryReportId(report.id)}>
                                                <History className="size-4" />
                                                Version History
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => cloneReport(report)}>
                                                <Copy className="size-4" />
                                                Clone
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => transferOwner(report.id)}>
                                                <UserCog className="size-4" />
                                                Transfer Owner
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => toggleDeprecation(report)}>
                                                <Archive className="size-4" />
                                                {report.deprecationStatus === "DEPRECATED" ? "Reactivate" : "Deprecate"}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <Button size="icon-sm" variant="ghost" onClick={() => handleDelete(report.id)} aria-label={`Delete ${report.name}`}>
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
            <ReportVersionHistoryDialog reportId={historyReportId} onClose={() => setHistoryReportId(null)} onRestored={fetchReports} />
        </Card>
    );
}

// Gap checklist Module 17 ("dashboard/report versioning" -- change history + rollback).
function ReportVersionHistoryDialog({ reportId, onClose, onRestored }: { reportId: string | null; onClose: () => void; onRestored: () => void }) {
    const [versions, setVersions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

    useEffect(() => {
        if (!reportId) return;
        setLoading(true);
        apiFetch<any[]>(`/reports/custom/${reportId}/versions`)
            .then((data) => setVersions(Array.isArray(data) ? data : []))
            .catch((error: any) => toast.error(error.message || "Failed to load version history"))
            .finally(() => setLoading(false));
    }, [reportId]);

    const restore = async (version: number) => {
        if (!reportId) return;
        setRestoringVersion(version);
        try {
            await apiFetch(`/reports/custom/${reportId}/versions/${version}/restore`, { method: "POST" });
            toast.success(`Restored version ${version}`);
            onRestored();
            onClose();
        } catch (error: any) {
            toast.error(error.message || "Failed to restore version");
        } finally {
            setRestoringVersion(null);
        }
    };

    return (
        <StandardDialog open={!!reportId} onClose={onClose} title="Version History" subtitle="Restoring publishes the old snapshot again as a new version -- nothing is ever lost.">
            {loading ? (
                <Skeleton className="m-4 h-24 rounded-xl" />
            ) : versions.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No published versions yet -- use &quot;Publish Version&quot; to create the first one.</p>
            ) : (
                <div className="space-y-2 p-4">
                    {versions.map((version) => (
                        <div key={version.id} className="flex items-center justify-between rounded-lg bg-accent p-3">
                            <div>
                                <div className="text-sm font-bold">Version {version.version}</div>
                                <div className="text-xs text-muted-foreground">
                                    {version.publishNotes || "No notes"} • {formatWorkspaceDate(version.publishedAt)}
                                </div>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => restore(version.version)} disabled={restoringVersion === version.version}>
                                <RotateCcw className="size-4" />
                                {restoringVersion === version.version ? "Restoring..." : "Restore"}
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </StandardDialog>
    );
}
