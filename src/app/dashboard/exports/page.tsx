"use client";

import { ErrorState } from "@/components/common/error-state";

import { PageHeader } from "@/components/layout/page-header";

import * as React from "react";
import { Copy, Download, Link2, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/providers/auth-provider";
import { useConfirm } from "@/components/common/dialogs-provider";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatWorkspaceDate, formatWorkspaceDateTime, saveDisplaySettings } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/display/format";

type ExportRequestStatus = "PENDING_APPROVAL" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "REJECTED" | "EXPIRED";

type ExportRequest = {
  id: string;
  moduleName: string;
  exportType: string;
  status: ExportRequestStatus;
  recordCount: number;
  metadata?: string | {
    exportScope?: string;
    requestedRecordCount?: number | null;
    sensitiveColumns?: string[];
  } | null;
  error?: string | null;
  queuedAt: string;
  queuedAtDisplay?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  completedAtDisplay?: string | null;
  expiresAt?: string | null;
  originalFilename?: string | null;
  byteSize?: number | null;
};

type ExportRequestMetadata = {
  exportScope?: string;
  requestedRecordCount?: number | null;
  sensitiveColumns?: string[];
};

type SensitiveFieldRule = {
  id: string;
  moduleName: string;
  fieldKey: string;
  createdAt: string;
};

// GET /exports returns at most this many of your most recent requests.
const EXPORT_HISTORY_LIMIT = 100;

type ShareLink = { url: string; expiresAt: number };

const EXPORT_MODULE_OPTIONS = ["LEADS", "OPPORTUNITIES", "ACTIVITIES", "TASKS", "PARTNERS", "PAYOUTS", "REPORTS", "FORMS"];

function requestMetadata(request: ExportRequest): ExportRequestMetadata {
  if (!request.metadata) return {};
  if (typeof request.metadata === "string") {
    try {
      const parsed = JSON.parse(request.metadata);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ExportRequestMetadata : {};
    } catch {
      return {};
    }
  }
  return request.metadata;
}

const STATUS_DISPLAY: Record<ExportRequestStatus, { label: string; tone: "warning" | "neutral" | "info" | "success" | "danger" }> = {
  PENDING_APPROVAL: { label: "Waiting for approval", tone: "warning" },
  QUEUED: { label: "Queued", tone: "neutral" },
  RUNNING: { label: "Running", tone: "info" },
  COMPLETED: { label: "Ready", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  REJECTED: { label: "Rejected", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

function formatBytes(value?: number | null) {
  if (!value) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatRecordCount(request: ExportRequest) {
  if (request.status === "COMPLETED") {
    const exported = Number(request.recordCount ?? 0);
    const requested = Number(requestMetadata(request)?.requestedRecordCount ?? NaN);
    if (Number.isFinite(requested) && requested > 0 && requested !== exported) {
      return (
        <span className="grid gap-0.5">
          <span>{exported.toLocaleString()} exported</span>
          <span className="text-xs font-normal text-muted-foreground">{requested.toLocaleString()} requested</span>
        </span>
      );
    }
    return exported.toLocaleString();
  }
  if (request.status === "FAILED" || request.status === "CANCELLED") return "-";
  return "Counting after export";
}

export default function ExportRequestsPage() {
  const [requests, setRequests] = React.useState<ExportRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const { user } = useAuth();
  const isAdmin = !!(user?.isTenantAdmin || user?.isPlatformAdmin);
  const confirm = useConfirm();
  const [linkingId, setLinkingId] = React.useState<string | null>(null);
  const [shareLink, setShareLink] = React.useState<ShareLink | null>(null);
  const fetchRequests = React.useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await apiFetch<ExportRequest[]>("/exports");
      setRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      setFetchError("Could not load export history.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    apiFetch("/settings/general")
      .then((settings) => {
        if (settings) saveDisplaySettings(settings);
      })
      .catch(() => undefined);
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (id: string) => {
    if (!(await confirm({ title: "Approve this export?", description: "It includes fields marked as sensitive. It runs as soon as you approve it.", confirmLabel: "Approve export" }))) return;
    try {
      await apiFetch(`/exports/${id}/approve`, { method: "POST" });
      toast.success("Export approved and queued");
      fetchRequests();
    } catch (error: any) {
      toast.error(error?.message || "Failed to approve export");
    }
  };

  const handleReject = async (id: string) => {
    if (!(await confirm({ title: "Reject this export?", description: "It won't run. The person who asked for it sees that it was rejected.", confirmLabel: "Reject export", destructive: true }))) return;
    try {
      await apiFetch(`/exports/${id}/reject`, { method: "POST" });
      toast.success("Export rejected");
      fetchRequests();
    } catch (error: any) {
      toast.error(error?.message || "Failed to reject export");
    }
  };

  // Download stays on the signed-in route (/api/exports/<id>/download): it checks your session
  // and needs nothing extra. POST /exports/<id>/signed-url is a separate capability -- a link
  // that works WITHOUT signing in, for a limited time -- so it's offered as "Share link".
  const createShareLink = async (request: ExportRequest) => {
    setLinkingId(request.id);
    try {
      const created = await apiFetch<{ url: string; expiresAt: number }>(`/exports/${request.id}/signed-url`, { method: "POST" });
      const linkExpiresAt = Number(created.expiresAt) * 1000;
      const fileExpiresAt = request.expiresAt ? new Date(request.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      setShareLink({
        url: new URL(created.url, window.location.origin).toString(),
        expiresAt: Math.min(linkExpiresAt, fileExpiresAt),
      });
    } catch (error: any) {
      toast.error(error?.message || "Couldn't create a download link");
    } finally {
      setLinkingId(null);
    }
  };

  const copyShareLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink.url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link. Select it and copy it yourself.");
    }
  };

  const hasRunning = requests.some((item) => item.status === "QUEUED" || item.status === "RUNNING");
  // While an export is queued or running, check again every few seconds so "Ready" appears
  // without reloading.
  React.useEffect(() => {
    if (!hasRunning) return;
    const timer = window.setInterval(() => {
      apiFetch<ExportRequest[]>("/exports").then((data) => setRequests(Array.isArray(data) ? data : [])).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasRunning]);

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-5">
      <PageHeader title="Your exports" description="Exports you've asked for. Files can be downloaded until they expire." secondaryActions={
        <Button variant="outline" onClick={fetchRequests} isLoading={loading}><RefreshCcw className="size-4" />Refresh</Button>
      } />

      <Card className="overflow-hidden">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">History</CardTitle>
          {hasRunning ? <Badge tone="info">Checking for updates…</Badge> : null}
        </CardHeader>
        <CardContent className="p-0">
          <p className="px-4 pb-2 text-xs text-muted-foreground lg:hidden">Scroll the table horizontally to see dates and download actions.</p>
          {fetchError ? <ErrorState description={fetchError} onRetry={fetchRequests} /> : <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Records</TableHead>
                <TableHead>Queued</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                    Loading exports...
                  </TableCell>
                </TableRow>
              ) : requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                    No export requests yet.
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((request) => {
                  const metadata = requestMetadata(request);
                  return (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">{request.moduleName}</TableCell>
                    <TableCell>
                      <Badge tone={STATUS_DISPLAY[request.status]?.tone ?? "neutral"}>
                        {STATUS_DISPLAY[request.status]?.label ?? request.status}
                      </Badge>
                      {request.error ? <div className="mt-1 max-w-72 whitespace-normal break-words text-xs text-destructive">{request.error}</div> : null}
                      {metadata.sensitiveColumns?.length ? (
                        <div className="mt-1 text-xs text-status-warning-foreground">Includes: {metadata.sensitiveColumns.join(", ")}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className={cn(request.status !== "COMPLETED" && "text-xs text-muted-foreground")}>
                      {formatRecordCount(request)}
                    </TableCell>
                    <TableCell>{request.queuedAtDisplay || "-"}</TableCell>
                    <TableCell>{request.completedAtDisplay || "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {request.status === "COMPLETED" && request.expiresAt ? formatWorkspaceDate(request.expiresAt) : "-"}
                    </TableCell>
                    <TableCell>{formatBytes(request.byteSize)}</TableCell>
                    <TableCell className="text-right">
                      {request.status === "PENDING_APPROVAL" && isAdmin ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => handleApprove(request.id)}>Approve</Button>
                          <Button size="sm" variant="ghost" onClick={() => handleReject(request.id)}>Reject</Button>
                        </div>
                      ) : request.status === "COMPLETED" ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" asChild>
                            <a href={`/api/exports/${request.id}/download`}>
                              <Download className="size-4" />
                              Download
                            </a>
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => createShareLink(request)} isLoading={linkingId === request.id}>
                            {linkingId === request.id ? null : <Link2 className="size-4" />}
                            Share link
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" disabled>
                          {request.status === "EXPIRED" ? "Expired" : request.status === "PENDING_APPROVAL" ? "Waiting" : request.status === "FAILED" || request.status === "REJECTED" || request.status === "CANCELLED" ? "Not available" : "Preparing"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>}
          {!fetchError && !loading && requests.length >= EXPORT_HISTORY_LIMIT ? (
            <p className="border-t px-4 py-3 text-xs text-muted-foreground">
              Showing your {formatCount(EXPORT_HISTORY_LIMIT)} most recent exports. Older ones aren&apos;t listed here.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <StandardDialog
        open={!!shareLink}
        onClose={() => setShareLink(null)}
        title="Download link"
        subtitle="Anyone with this link can download the file without signing in."
        maxWidth="sm"
        actions={
          <>
            <Button variant="outline" onClick={() => setShareLink(null)}>Close</Button>
            <Button onClick={copyShareLink}><Copy className="size-4" />Copy link</Button>
          </>
        }
      >
        {shareLink ? (
          <div className="grid gap-2 pb-1">
            <Label htmlFor="export-share-link">Link</Label>
            <Input id="export-share-link" readOnly value={shareLink.url} onFocus={(event) => event.currentTarget.select()} />
            <p className="text-xs text-muted-foreground">
              Works until {formatWorkspaceDateTime(shareLink.expiresAt)}. Only share it with people who should see this data.
            </p>
          </div>
        ) : null}
      </StandardDialog>

      {isAdmin ? <p className="text-sm text-muted-foreground">Fields that make an export wait for approval are set in <Link href="/dashboard/settings/security/export-rules" className="text-primary hover:underline">Settings › Export rules</Link>.</p> : null}
    </div>
  );
}
