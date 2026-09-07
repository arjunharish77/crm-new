"use client";

import * as React from "react";
import { Download, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const STATUS_CLASS: Record<ExportRequestStatus, string> = {
  PENDING_APPROVAL: "bg-amber-50 text-amber-700 border-amber-200",
  QUEUED: "bg-muted text-muted-foreground",
  RUNNING: "bg-blue-50 text-blue-700 border-blue-200",
  COMPLETED: "bg-green-50 text-green-700 border-green-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  CANCELLED: "bg-muted text-muted-foreground",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  EXPIRED: "bg-muted text-muted-foreground",
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
  const [sensitiveRules, setSensitiveRules] = React.useState<SensitiveFieldRule[]>([]);
  const [newRuleModule, setNewRuleModule] = React.useState(EXPORT_MODULE_OPTIONS[0]);
  const [newRuleField, setNewRuleField] = React.useState("");

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

  const fetchSensitiveRules = React.useCallback(async () => {
    try {
      const data = await apiFetch<SensitiveFieldRule[]>("/exports/sensitive-fields");
      setSensitiveRules(Array.isArray(data) ? data : []);
    } catch {
      // Non-admins may not have access to view/manage these; fail silently rather than
      // showing an error toast for a card most users will never touch.
    }
  }, []);

  React.useEffect(() => {
    apiFetch("/settings/general")
      .then((settings) => {
        if (settings) saveDisplaySettings(settings);
      })
      .catch(() => undefined);
    fetchRequests();
    fetchSensitiveRules();
  }, [fetchRequests, fetchSensitiveRules]);

  const handleApprove = async (id: string) => {
    try {
      await apiFetch(`/exports/${id}/approve`, { method: "POST" });
      toast.success("Export approved and queued");
      fetchRequests();
    } catch (error: any) {
      toast.error(error?.message || "Failed to approve export");
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm("Reject this export? It will not run.")) return;
    try {
      await apiFetch(`/exports/${id}/reject`, { method: "POST" });
      toast.success("Export rejected");
      fetchRequests();
    } catch (error: any) {
      toast.error(error?.message || "Failed to reject export");
    }
  };

  const handleAddSensitiveRule = async () => {
    if (!newRuleField.trim()) {
      toast.error("Enter a field key");
      return;
    }
    try {
      await apiFetch("/exports/sensitive-fields", {
        method: "POST",
        body: JSON.stringify({ moduleName: newRuleModule, fieldKey: newRuleField.trim() }),
      });
      setNewRuleField("");
      fetchSensitiveRules();
      toast.success("Sensitive field rule added");
    } catch (error: any) {
      toast.error(error?.message || "Failed to add rule");
    }
  };

  const handleDeleteSensitiveRule = async (id: string) => {
    try {
      await apiFetch(`/exports/sensitive-fields/${id}`, { method: "DELETE" });
      setSensitiveRules(sensitiveRules.filter((rule) => rule.id !== id));
    } catch {
      toast.error("Failed to remove rule");
    }
  };

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
                      <Badge variant="outline" className={cn("border", STATUS_CLASS[request.status])}>
                        {request.status.replace(/_/g, " ")}
                      </Badge>
                      {request.error ? <div className="mt-1 text-xs text-destructive">{request.error}</div> : null}
                      {metadata.sensitiveColumns?.length ? (
                        <div className="mt-1 text-xs text-amber-700">Includes: {metadata.sensitiveColumns.join(", ")}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className={cn(request.status !== "COMPLETED" && "text-xs text-muted-foreground")}>
                      {formatRecordCount(request)}
                    </TableCell>
                    <TableCell>{request.queuedAtDisplay || "-"}</TableCell>
                    <TableCell>{request.completedAtDisplay || "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {request.status === "COMPLETED" && request.expiresAt ? new Date(request.expiresAt).toLocaleDateString() : "-"}
                    </TableCell>
                    <TableCell>{formatBytes(request.byteSize)}</TableCell>
                    <TableCell className="text-right">
                      {request.status === "PENDING_APPROVAL" ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => handleApprove(request.id)}>Approve</Button>
                          <Button size="sm" variant="ghost" onClick={() => handleReject(request.id)}>Reject</Button>
                        </div>
                      ) : request.status === "COMPLETED" ? (
                        <Button size="sm" asChild>
                          <a href={`/api/exports/${request.id}/download`}>
                            <Download className="size-4" />
                            Download
                          </a>
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled>
                          {request.status === "EXPIRED" ? "Expired" : "Pending"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sensitive Field Rules</CardTitle>
          <CardDescription>
            Exports that include one of these fields require admin approval before they run. Requires tenant admin access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select value={newRuleModule} onValueChange={setNewRuleModule}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_MODULE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="max-w-[220px]"
              placeholder="Field key, e.g. ssn"
              value={newRuleField}
              onChange={(event) => setNewRuleField(event.target.value)}
            />
            <Button variant="outline" onClick={handleAddSensitiveRule}>
              <Plus className="size-4" />
              Add Rule
            </Button>
          </div>
          {sensitiveRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sensitive fields flagged yet -- every export runs immediately.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sensitiveRules.map((rule) => (
                <Badge key={rule.id} variant="outline" className="gap-1.5 pr-1">
                  {rule.moduleName}.{rule.fieldKey}
                  <button type="button" onClick={() => handleDeleteSensitiveRule(rule.id)} className="rounded-full p-0.5 hover:bg-muted">
                    <Trash2 className="size-3 text-destructive" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
