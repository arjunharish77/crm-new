"use client";

// Gap checklist Module 10's "user-level audit of productivity actions" item -- individual
// actions (bulk changes, exports, approvals, inline edits, automation/campaign launches) already
// flowed into the shared `AuditLog` table via each module's own write path; the real gap was that
// nothing could filter it by userId, and there was no rollup view answering "what did I do
// today." This is deliberately a per-user, per-day view of the SAME underlying AuditLog data
// (plus the newly-added command-execution logging), not a second, parallel audit system.
import { useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceRelativeTime } from "@/lib/date-format";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";

type AuditLogEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  metadata?: { impersonatedBy?: string } | null;
};

export function humanizeEntityType(entityType: string): string {
  return entityType
    .split("_")
    .map((word) => (word ? word.charAt(0) + word.slice(1).toLowerCase() : word))
    .join(" ");
}

function startOfTodayIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

export function MyActivityTab() {
  const [logs, setLogs] = useState<AuditLogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ userId: "me", dateFrom: startOfTodayIso() });
    apiFetch<AuditLogEntry[]>(`/governance/audit-logs?${params.toString()}`)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  const byEntityType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of logs ?? []) {
      counts.set(log.entityType, (counts.get(log.entityType) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [logs]);

  if (loading) {
    return <Skeleton className="h-64 rounded-2xl" />;
  }

  if (!logs || logs.length === 0) {
    return (
      <EmptyState
        icon={<History className="size-12 text-muted-foreground opacity-50" />}
        title="No activity yet today"
        description="Actions you take across the app today -- creating and editing records, running exports, launching automations, using the command palette -- show up here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[14px] border bg-card p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground/60">
          Today&apos;s activity ({logs.length})
        </p>
        <div className="flex flex-wrap gap-2">
          {byEntityType.map(([entityType, count]) => (
            <Badge key={entityType} variant="outline" className="rounded-full">
              {humanizeEntityType(entityType)}: {count}
            </Badge>
          ))}
        </div>
      </section>

      <section className="rounded-[14px] border bg-card p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground/60">Timeline</p>
        <div className="flex flex-col divide-y">
          {logs.map((log) => (
            <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-md text-[0.65rem] font-semibold uppercase">
                  {log.action}
                </Badge>
                <span className="font-medium">{humanizeEntityType(log.entityType)}</span>
                {log.metadata?.impersonatedBy ? (
                  <Badge variant="secondary" className="rounded-md text-[0.6rem]">
                    Performed by an admin impersonating you
                  </Badge>
                ) : null}
              </div>
              <span className="text-xs text-muted-foreground">{formatWorkspaceRelativeTime(log.createdAt)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
