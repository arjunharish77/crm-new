"use client";

import { useConfirm } from "@/components/common/dialogs-provider";
import { ErrorState } from "@/components/common/error-state";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDate } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { INBUILT_REPORT_OPTIONS } from "./report-shared";


const WEEKDAY_OPTIONS = [
    { value: "0", label: "Sunday" },
    { value: "1", label: "Monday" },
    { value: "2", label: "Tuesday" },
    { value: "3", label: "Wednesday" },
    { value: "4", label: "Thursday" },
    { value: "5", label: "Friday" },
    { value: "6", label: "Saturday" },
];


export function ReportSchedulesSection() {
    const confirmDialog = useConfirm();
    const [schedules, setSchedules] = useState<any[]>([]);
    const [customReports, setCustomReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [customState, setCustomState] = useState("loading");
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
        setLoadError(false);
        try {
            const data = await apiFetch<any[]>("/reports/schedules");
            setSchedules(Array.isArray(data) ? data : []);
        } catch {
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    };

    const fetchCustomReports = () => {
        setCustomState("loading");
        apiFetch<any[]>("/reports/custom")
            .then((data) => {
                const reports = Array.isArray(data) ? data : [];
                setCustomReports(reports);
                setCustomReportId((current) => current || reports[0]?.id || "");
                setCustomState("ready");
            })
            .catch(() => setCustomState("error"));
    };
    useEffect(() => { fetchSchedules(); fetchCustomReports(); }, []);

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
        if (!(await confirmDialog({ title: "Delete this schedule?", description: "The report stops being emailed. The report itself is kept.", confirmLabel: "Delete schedule", destructive: true }))) return;
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
            <CardContent className="min-w-0 space-y-5 p-4 sm:p-6">
                <div className="flex min-w-0 flex-wrap justify-between gap-3">
                    <div>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <CalendarClock className="size-5 text-primary" />
                            <h2 className="text-lg font-bold">Report Scheduling</h2>
                            <Badge variant="outline" className="rounded-md">Recurring</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Schedule inbuilt reports for recurring delivery. Until mail transport is connected, due runs create pending delivery records.
                        </p>
                    </div>
                    <Button onClick={createSchedule} disabled={saving || (scheduleSource === "custom" && customState !== "ready") || !recipients.trim() || (scheduleSource === "custom" && !customReportId)}>
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
                        {scheduleSource === "custom" && customState === "error" ? <ErrorState description="Saved reports for scheduling could not be loaded." onRetry={fetchCustomReports} /> : null}
                <div className="grid gap-4 @min-[600px]/reports:grid-cols-2 @min-[1100px]/reports:grid-cols-3">
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="report-source-8">Source</Label>
                        <Select value={scheduleSource} onValueChange={(value) => setScheduleSource(value as "inbuilt" | "custom")}>
                            <SelectTrigger id="report-source-8" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="inbuilt">Inbuilt</SelectItem>
                                <SelectItem value="custom">Custom</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="report-report-9">Report</Label>
                        {scheduleSource === "custom" ? (
                            <Select value={customReportId} onValueChange={setCustomReportId} disabled={customState !== "ready"}>
                                <SelectTrigger id="report-report-9" className="w-full">
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
                                <SelectTrigger id="report-report-9" className="w-full">
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
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="report-frequency-10">Frequency</Label>
                        <Select value={frequency} onValueChange={(value) => setFrequency(value as "DAILY" | "WEEKLY" | "MONTHLY")}>
                            <SelectTrigger id="report-frequency-10" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="DAILY">Daily</SelectItem>
                                <SelectItem value="WEEKLY">Weekly</SelectItem>
                                <SelectItem value="MONTHLY">Monthly</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="report-frequency-monthly-day-of-month-day-of-week-11">{frequency === "MONTHLY" ? "Day of Month" : "Day of Week"}</Label>
                        {frequency === "DAILY" ? (
                            <Input id="report-frequency-monthly-day-of-month-day-of-week-11" value="Every day" disabled />
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
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="report-recipients-12">Recipients</Label>
                        <Input id="report-recipients-12"
                            value={recipients}
                            onChange={(event) => setRecipients(event.target.value)}
                            placeholder="ops@example.com, sales@example.com"
                        />
                    </div>
                    <div className="space-y-2 lg:col-span-1">
                        <Label htmlFor="report-format-13">Format</Label>
                        <Select value={format} onValueChange={(value) => setFormat(value as "LINK" | "CSV" | "PDF" | "XLSX")}>
                            <SelectTrigger id="report-format-13" className="w-full">
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
                ) : loadError ? <ErrorState description="Report schedules could not be loaded." onRetry={fetchSchedules} /> : schedules.length === 0 ? (
                    <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                        No recurring schedules yet.
                    </div>
                ) : (
                    <div className="min-w-0 space-y-2">
                        {schedules.map((schedule) => (
                            <div key={schedule.id} className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-3">
                                <div className="min-w-0 flex-1 basis-60 break-words">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="min-w-0 break-words text-sm font-bold">
                                            {reportScheduleLabel(schedule, customReports)}
                                        </span>
                                        <Badge variant="outline" className="rounded-md text-xs font-semibold">{schedule.frequency}</Badge>
                                        <Badge variant="outline" className="rounded-md text-xs font-semibold">{schedule.format}</Badge>
                                        {!schedule.isActive ? <Badge variant="secondary" className="rounded-md text-xs font-semibold">paused</Badge> : null}
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
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
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
