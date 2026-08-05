"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDate } from "@/lib/date-format";
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
} from "lucide-react";
import { toast } from "sonner";
import { QueueExportButton } from "@/components/exports/queue-export-button";

export default function ReportsPage() {
    const [leadsData, setLeadsData] = useState<any>(null);
    const [oppsData, setOppsData] = useState<any>(null);
    const [activitiesData, setActivitiesData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

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

            <Tabs defaultValue="overview" className="space-y-4">
                <div className="overflow-x-auto pb-1">
                    <TabsList className="h-10 min-w-max">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="inbuilt">Inbuilt Reports</TabsTrigger>
                        <TabsTrigger value="saved">Saved Reports</TabsTrigger>
                        <TabsTrigger value="builder">Builder</TabsTrigger>
                        <TabsTrigger value="schedules">Schedules</TabsTrigger>
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
};

const OBJECTS_BY_ROOT: Record<ReportRoot, string[]> = {
    lead: ["lead", "leadOwner", "opportunity", "opportunityOwner", "stage", "activity", "activityType", "activityCreator", "assignmentLog", "assignedTo"],
    opportunity: ["opportunity", "opportunityOwner", "lead", "leadOwner", "stage", "activity", "activityType", "activityCreator", "assignmentLog", "assignedTo"],
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
        value: "commission_payout_summary",
        label: "Commission & Payout Summary",
        category: "Finance",
        endpoint: "/reports/inbuilt/commission-payout-summary",
        description: "Partner commission ledger, payout states, invoices, and net payout totals.",
    },
    {
        value: "cohort_funnel_progression",
        label: "Cohort Funnel Progression",
        category: "Cohort",
        endpoint: "/reports/inbuilt/cohort-funnel-progression",
        description: "Lead cohorts and how each cohort progresses through opportunity stages.",
    },
    {
        value: "data_quality",
        label: "Data Quality",
        category: "Governance",
        endpoint: "/reports/inbuilt/data-quality",
        description: "Duplicate, stale, ownerless, and missing-field data-quality issues.",
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

function InbuiltReportsSection() {
    const [selectedKey, setSelectedKey] = useState(INBUILT_REPORT_OPTIONS[0].value);
    const [report, setReport] = useState<any>(null);
    const [running, setRunning] = useState(false);
    const [refreshingRollup, setRefreshingRollup] = useState(false);
    const selected = INBUILT_REPORT_OPTIONS.find((option) => option.value === selectedKey) ?? INBUILT_REPORT_OPTIONS[0];
    const previewRows = useMemo(() => inbuiltReportPreviewRows(report), [report]);
    const previewColumns = useMemo(() => previewRows.length ? Object.keys(previewRows[0]).slice(0, 8) : [], [previewRows]);

    const runReport = async (option = selected) => {
        setRunning(true);
        try {
            const data = await apiFetch(option.endpoint);
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
        } catch (error: any) {
            toast.error(error.message || "Failed to refresh report rollup");
        } finally {
            setRefreshingRollup(false);
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
                            <Badge variant="outline" className="rounded-md">10 reports</Badge>
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

                <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
                    <div className="space-y-2">
                        {INBUILT_REPORT_OPTIONS.map((option) => (
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
                            {report?.generatedAt ? (
                                <Badge variant="outline" className="w-fit rounded-md">
                                    Generated {formatWorkspaceDate(report.generatedAt)}
                                </Badge>
                            ) : null}
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
    const [format, setFormat] = useState<"LINK" | "CSV" | "PDF">("LINK");
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
                        <Select value={format} onValueChange={(value) => setFormat(value as "LINK" | "CSV" | "PDF")}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="LINK">Link</SelectItem>
                                <SelectItem value="CSV">CSV</SelectItem>
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

    const handleEdit = (report: any) => {
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
                                    <div className="text-sm font-bold">{report.name}</div>
                                    <div className="text-xs text-muted-foreground">{report.module} • Created {formatWorkspaceDate(report.createdAt)}</div>
                                </div>
                                <div className="flex items-center gap-2">
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
                                    <Button size="icon-sm" variant="ghost" onClick={() => handleDelete(report.id)} aria-label={`Delete ${report.name}`}>
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
