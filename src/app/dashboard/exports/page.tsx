"use client";

import * as React from "react";
import { Download, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { saveDisplaySettings } from "@/lib/date-format";
import { cn } from "@/lib/utils";

type ExportRequest = {
  id: string;
  moduleName: string;
  exportType: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  recordCount: number;
  metadata?: string | {
    exportScope?: string;
    requestedRecordCount?: number | null;
  } | null;
  error?: string | null;
  queuedAt: string;
  queuedAtDisplay?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  completedAtDisplay?: string | null;
  originalFilename?: string | null;
  byteSize?: number | null;
};

type ExportRequestMetadata = {
  exportScope?: string;
  requestedRecordCount?: number | null;
};

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

const STATUS_CLASS: Record<ExportRequest["status"], string> = {
  QUEUED: "bg-muted text-muted-foreground",
  RUNNING: "bg-blue-50 text-blue-700 border-blue-200",
  COMPLETED: "bg-green-50 text-green-700 border-green-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  CANCELLED: "bg-muted text-muted-foreground",
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

  const fetchRequests = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<ExportRequest[]>("/exports");
      setRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error("Could not load export history");
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

  const hasRunning = requests.some((item) => item.status === "QUEUED" || item.status === "RUNNING");

  return (
    <div className="flex min-h-0 flex-col gap-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Export Requests</h1>
          <p className="text-sm text-muted-foreground">Track queued exports and download completed files from the modules where they were requested.</p>
        </div>
        <Button variant="outline" onClick={fetchRequests} disabled={loading}>
          <RefreshCcw className="size-4" />
          Refresh
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Request History</CardTitle>
          {hasRunning ? <Badge variant="secondary">Worker pending</Badge> : null}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Records</TableHead>
                <TableHead>Queued</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                    Loading exports...
                  </TableCell>
                </TableRow>
              ) : requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                    No export requests yet.
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">{request.moduleName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("border", STATUS_CLASS[request.status])}>
                        {request.status}
                      </Badge>
                      {request.error ? <div className="mt-1 text-xs text-destructive">{request.error}</div> : null}
                    </TableCell>
                    <TableCell className={cn(request.status !== "COMPLETED" && "text-xs text-muted-foreground")}>
                      {formatRecordCount(request)}
                    </TableCell>
                    <TableCell>{request.queuedAtDisplay || "-"}</TableCell>
                    <TableCell>{request.completedAtDisplay || "-"}</TableCell>
                    <TableCell>{formatBytes(request.byteSize)}</TableCell>
                    <TableCell className="text-right">
                      {request.status === "COMPLETED" ? (
                        <Button size="sm" asChild>
                          <a href={`/api/exports/${request.id}/download`}>
                            <Download className="size-4" />
                            Download
                          </a>
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled>
                          Pending
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
