"use client";

import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/common/dialogs-provider";
import { ErrorState } from "@/components/common/error-state";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDate } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { useArchiveActions } from "@/hooks/use-archive-actions";
import { ArchivedItemsSection } from "@/components/common/archived-items-section";
import { getFavoriteRecords, toggleFavoriteRecord } from "@/lib/recent-records";
import { History, Save, Trash2, Copy, UserCog, Archive, MoreVertical, Star } from "lucide-react";
import { toast } from "sonner";
import { QueueExportButton } from "@/components/exports/queue-export-button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useReasonDialog } from "@/components/common/reason-dialog";
import { usePickRecordDialog } from "@/components/common/record-picker";
import { ReportVersionHistoryDialog } from "./report-shared";


export function CustomReportsSection() {
    const { user } = useAuth();
    const router = useRouter();
    const confirmDialog = useConfirm();
    const [reasonDialog, askReason] = useReasonDialog();
    const [pickDialog, pickRecord] = usePickRecordDialog();
    const [reports, setReports] = useState<any[]>([]);
    const [archiveToken, setArchiveToken] = useState(0);
    const { archive: archiveReport } = useArchiveActions({ basePath: "/reports/custom", archiveKind: "custom-report", noun: "report", onChange: () => { fetchReports(); setArchiveToken((token) => token + 1); } });
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    // Gap checklist Module 17 ("dashboard/report versioning" -- change history + rollback).
    const [historyReportId, setHistoryReportId] = useState<string | null>(null);
    const [favoriteReportIds, setFavoriteReportIds] = useState<string[]>([]);

    const fetchReports = () => {
        setLoading(true);
        setLoadError(false);
        apiFetch("/reports/custom")
            .then(setReports)
            .catch(() => setLoadError(true))
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
        router.push(`/dashboard/reports/custom/${report.id}`);
    };

    // Delete archives the report (decision 31): Undo in the toast, restore from Archived for 30 days.
    const handleDelete = async (id: string) => {
        const report = reports.find((item) => item.id === id);
        if (report) await archiveReport({ id, name: report.name });
    };

    const publishVersion = async (id: string) => {
        const notes = await askReason({ title: "Publish this report's changes?", description: "The report page, exports, schedules and dashboards use the published version. Open the report to see what changes.", label: "Notes (optional)", confirmLabel: "Publish" });
        if (notes === null) return;
        try {
            const updated = await apiFetch<any>(`/reports/custom/${id}/versions`, { method: "POST", body: JSON.stringify({ publishNotes: notes || null }) });
            setReports((current) => current.map((report) => (report.id === id ? updated : report)));
            toast.success(`Published version ${updated.currentVersion}`);
        } catch (error: any) {
            toast.error(error.message || "Failed to publish version");
        }
    };

    const cloneReport = async (report: any) => {
        const newName = await askReason({ title: "Clone report", label: "Name for the copy", defaultValue: `${report.name} (Copy)`, confirmLabel: "Clone", singleLine: true, required: true });
        if (!newName) return;
        try {
            await apiFetch(`/reports/custom/${report.id}/clone`, { method: "POST", body: JSON.stringify({ name: newName }) });
            toast.success(`Cloned to "${newName}"`);
            fetchReports();
        } catch (error: any) {
            toast.error(error.message || "Failed to clone report");
        }
    };

    const transferOwner = async (id: string) => {
        const owner = await pickRecord({ entity: "user", title: "Transfer ownership", description: "The new owner can edit, publish and delete this report.", label: "New owner", confirmLabel: "Transfer" });
        if (!owner) return;
        try {
            await apiFetch(`/reports/custom/${id}/transfer`, { method: "POST", body: JSON.stringify({ newOwnerUserId: owner.id }) });
            toast.success("Report ownership transferred");
            fetchReports();
        } catch (error: any) {
            toast.error(error.message || "Failed to transfer ownership");
        }
    };

    const toggleDeprecation = async (report: any) => {
        const nextStatus = report.deprecationStatus === "DEPRECATED" ? "ACTIVE" : "DEPRECATED";
        const reason = nextStatus === "DEPRECATED"
            ? await askReason({ title: "Deprecate report", description: "People will see that this report is deprecated.", label: "Reason (optional)", confirmLabel: "Deprecate", destructive: true })
            : "";
        if (reason === null) return;
        try {
            const updated = await apiFetch<any>(`/reports/custom/${report.id}/deprecation`, { method: "PATCH", body: JSON.stringify({ status: nextStatus, reason: reason || null }) });
            setReports((current) => current.map((item) => (item.id === report.id ? updated : item)));
        } catch (error: any) {
            toast.error(error.message || "Failed to update deprecation status");
        }
    };

    if (loadError) return <ErrorState description="Saved reports could not be loaded." onRetry={fetchReports} />;
    if (loading) return <Skeleton className="mb-4 h-[100px] rounded-2xl" />;

    return (
        <Card className="mb-4 rounded-2xl">
            {reasonDialog}
            {pickDialog}
            <CardContent className="p-6">
                <h2 className="mb-3 text-lg font-bold">Custom Reports</h2>
                {reports.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No custom reports created yet.</p>
                ) : (
                    <div className="space-y-3">
                        {reports.map((report) => (
                            <div key={report.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                                <div className="min-w-0 flex-1 basis-60">
                                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-bold">
                                        <span className="min-w-0 break-words">{report.name}</span>
                                        {report.deprecationStatus === "DEPRECATED" ? <Badge variant="outline" className="py-0 text-xs">Deprecated</Badge> : null}
                                        {report.isPublic === false ? <Badge tone="neutral" className="py-0 text-xs">{report.createdBy === user?.id ? "Only me" : "Private"}</Badge> : null}
                                        {Number(report.currentVersion ?? 0) === 0 ? <Badge tone="warning" className="py-0 text-xs">Draft · not published</Badge> : report.draft ? <Badge tone="info" className="py-0 text-xs">Unpublished changes</Badge> : null}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {report.module} • Created {formatWorkspaceDate(report.createdAt)}
                                        {report.currentVersion ? ` • v${report.currentVersion}` : ""}
                                        {(report.viewCount ?? 0) > 0 ? ` • Opened ${report.viewCount}x` : ""}
                                    </div>
                                </div>
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
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
                                    {Number(report.currentVersion ?? 0) > 0 ? (
                                        <QueueExportButton
                                            moduleName="REPORTS"
                                            filters={{ reportKind: "CUSTOM", customReportId: report.id }}
                                            label="Export CSV"
                                            size="sm"
                                            variant="ghost"
                                        />
                                    ) : null}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button size="icon-sm" variant="ghost" aria-label={`${report.name} report options`}>
                                                <MoreVertical className="size-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {Number(report.currentVersion ?? 0) === 0 || report.draft ? (
                                                <DropdownMenuItem onClick={() => publishVersion(report.id)}>
                                                    <Save className="size-4" />
                                                    Publish changes
                                                </DropdownMenuItem>
                                            ) : null}
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
            <div className="px-6 pb-6">
                <ArchivedItemsSection kind="custom-report" basePath="/reports/custom" noun="report" title="Archived reports" refreshToken={archiveToken} onChange={fetchReports} />
            </div>
            <ReportVersionHistoryDialog reportId={historyReportId} onClose={() => setHistoryReportId(null)} onRestored={fetchReports} />
        </Card>
    );
}
