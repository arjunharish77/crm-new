"use client";

import { useState } from "react";
import { Activity } from "@/types/activities";
import * as LucideIcons from "lucide-react";
import { ChevronDown, FileText } from "lucide-react";
import { formatWorkspaceDate, formatWorkspaceDateTime, formatWorkspaceRelativeTime, formatWorkspaceTime, parseWorkspaceDate } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { statusDisplay } from "@/lib/display/status";

export type TimelineNote = { id: string; content: string; createdAt: string; author?: { name?: string | null; email?: string | null } | null };

interface TimelineProps {
    activities: Activity[];
    // Notes on the same record, shown in the same feed (UI/UX plan §10.5: notes move into Activity).
    notes?: TimelineNote[];
    // The record this feed belongs to: its own "Lead: …" / "Opportunity: …" line is left out and
    // shown only for items that belong to a different record.
    context?: { leadId?: string | null; opportunityId?: string | null };
    emptyMessage?: string;
}

function getDayLabel(date: Date) {
    const today = formatWorkspaceDate(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateLabel = formatWorkspaceDate(date);
    if (dateLabel === today) return "Today";
    if (dateLabel === formatWorkspaceDate(yesterday)) return "Yesterday";
    return dateLabel;
}

function formatActivityValue(value: unknown): string {
    if (value === null || value === undefined || value === "") {
        return "Not set";
    }

    if (typeof value === "boolean") {
        return value ? "Yes" : "No";
    }

    if (typeof value === "number") {
        return String(value);
    }

    if (typeof value === "string") {
        return value;
    }

    if (Array.isArray(value)) {
        return value.length ? value.map((item) => formatActivityValue(item)).join(", ") : "Not set";
    }

    return JSON.stringify(value);
}

const ACTIVITY_AUDIT_SKIP_FIELDS = new Set(["tenantId", "objectId", "createdAt", "updatedAt", "deletedAt", "deletedBy", "hash"]);

function activityFieldLabel(field: string) {
    return field
        .replace(/Id$/, "")
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .replace(/^./, (value) => value.toUpperCase());
}

function humanizeActivityToken(value: string) {
    return value
        .replace(/^stage_/, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAuditActivityValue(value: unknown, field: string, event: any) {
    if (value === null || value === undefined || value === "") return "Not set";
    const stringValue = String(value);
    if (field === "typeId") return event.valueLabels?.activityTypes?.[stringValue] || humanizeActivityToken(stringValue);
    if (field === "stageId") return event.valueLabels?.stages?.[stringValue] || humanizeActivityToken(stringValue);
    if (field === "opportunityTypeId") return event.valueLabels?.opportunityTypes?.[stringValue] || humanizeActivityToken(stringValue);
    if (["outcome", "slaStatus", "priority", "status"].includes(field)) return humanizeActivityToken(stringValue);
    return formatActivityValue(value);
}

function activityChangedFields(event: any) {
    if (event.diff && typeof event.diff === "object") {
        return Object.entries(event.diff)
            .filter(([key]) => !ACTIVITY_AUDIT_SKIP_FIELDS.has(key))
            .map(([field, value]: any) => ({ field, before: value?.before, after: value?.after }));
    }

    const before = event.before ?? {};
    const after = event.after ?? {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys]
        .filter((key) => !ACTIVITY_AUDIT_SKIP_FIELDS.has(key) && JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
        .map((field) => ({ field, before: before[field], after: after[field] }));
}

type FeedItem =
    | { kind: "activity"; id: string; at: Date; activity: Activity }
    | { kind: "note"; id: string; at: Date; note: TimelineNote };

// Compact activity feed (UI/UX plan C12): divided rows grouped by day, outcome and SLA as text,
// details on demand. Admin-chosen type colours appear only as the icon colour, never as text
// or fills.
export function Timeline({ activities, notes = [], context, emptyMessage = "Calls, messages, notes and other activity will appear here." }: TimelineProps) {
    const [expandedActivityIds, setExpandedActivityIds] = useState<string[]>([]);

    const toggleExpanded = (activityId: string) => {
        setExpandedActivityIds((current) =>
            current.includes(activityId)
                ? current.filter((id) => id !== activityId)
                : [...current, activityId]
        );
    };

    const items: FeedItem[] = [
        ...activities.map((activity) => ({ kind: "activity" as const, id: activity.id, at: parseWorkspaceDate(activity.createdAt) ?? new Date(activity.createdAt), activity })),
        ...notes.map((note) => ({ kind: "note" as const, id: `note-${note.id}`, at: parseWorkspaceDate(note.createdAt) ?? new Date(note.createdAt), note })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());

    if (items.length === 0) {
        return (
            <div className="py-10 text-center">
                <FileText size={20} className="mx-auto mb-2 text-muted-foreground" aria-hidden />
                <p className="text-sm font-medium">No activity yet</p>
                <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            </div>
        );
    }

    const groups: Array<{ label: string; items: FeedItem[] }> = [];
    for (const item of items) {
        const label = getDayLabel(item.at);
        const last = groups[groups.length - 1];
        if (last && last.label === label) last.items.push(item);
        else groups.push({ label, items: [item] });
    }

    return (
        <div className="flex flex-col gap-4">
            {groups.map((group) => (
                <section key={group.label} aria-label={group.label}>
                    <h4 className="mb-1 text-xs font-medium text-muted-foreground">{group.label}</h4>
                    <ul className="divide-y rounded-lg border">
                        {group.items.map((item) => item.kind === "note" ? (
                            <li key={item.id} className="flex gap-3 px-3 py-2.5">
                                <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                    <LucideIcons.StickyNote size={13} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                        <span className="text-sm font-medium">Note</span>
                                        <span className="text-xs tabular-nums text-muted-foreground" title={formatWorkspaceDateTime(item.at)}>{formatWorkspaceTime(item.at)}</span>
                                    </div>
                                    <p className="whitespace-pre-wrap break-words text-sm">{item.note.content}</p>
                                    {item.note.author ? <p className="text-xs text-muted-foreground">{item.note.author.name || item.note.author.email}</p> : null}
                                </div>
                            </li>
                        ) : (() => {
                            const activity = item.activity;
                            const type = activity.type;
                            const IconComponent = type?.icon ? (LucideIcons as any)[type.icon] : LucideIcons.FileText;
                            const Icon = IconComponent || LucideIcons.FileText;
                            const isExpanded = expandedActivityIds.includes(activity.id);
                            const customFieldEntries = Object.entries(activity.customFields ?? {}).filter(
                                ([, value]) => value !== null && value !== undefined && value !== ""
                            );
                            const otherLead = activity.lead && activity.leadId !== context?.leadId ? activity.lead : null;
                            const otherOpportunity = activity.opportunity && activity.opportunityId !== context?.opportunityId ? activity.opportunity : null;
                            const outcome = activity.outcome ? statusDisplay("outcome", activity.outcome).label : null;
                            const sla = activity.slaStatus && activity.slaStatus !== "PENDING" ? statusDisplay("sla", activity.slaStatus) : null;
                            const expandedFields = [
                                { label: "Due", value: activity.dueAt ? formatWorkspaceDateTime(activity.dueAt) : null },
                                { label: "Completed", value: activity.completedAt ? formatWorkspaceDateTime(activity.completedAt) : null },
                                { label: "SLA target", value: activity.slaTarget ? formatWorkspaceDateTime(activity.slaTarget) : null },
                                { label: "Logged", value: formatWorkspaceDateTime(item.at) },
                                { label: "Updated", value: formatWorkspaceDateTime(activity.updatedAt) },
                                { label: "Repeats", value: activity.isRecurring ? activity.recurrenceRule || "Yes" : null },
                                ...customFieldEntries.map(([key, value]) => ({ label: key, value: formatActivityValue(value) })),
                            ].filter((field) => field.value !== null && field.value !== undefined && field.value !== "");
                            const auditEvents = (activity.auditEvents ?? []).filter((event) => event.action === "UPDATE" && activityChangedFields(event).length > 0);
                            return (
                                <li key={item.id} className="px-3 py-2.5">
                                    <div className="flex gap-3">
                                        <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted" style={{ color: type?.color || undefined }}>
                                            <Icon size={13} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                                <span className="text-sm">
                                                    <span className="font-medium">{type?.name || "Activity"}</span>
                                                    {outcome ? <span className="text-muted-foreground"> · {outcome}</span> : null}
                                                    {sla ? <span className={cn(sla.tone === "danger" ? "text-destructive" : "text-muted-foreground")}> · SLA {sla.label.toLowerCase()}</span> : null}
                                                </span>
                                                <span className="text-xs tabular-nums text-muted-foreground" title={formatWorkspaceDateTime(item.at)}>{formatWorkspaceTime(item.at)}</span>
                                            </div>
                                            {activity.notes ? <p className="whitespace-pre-wrap break-words text-sm">{activity.notes}</p> : null}
                                            <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                                                {activity.user ? <span>{activity.user.name || activity.user.email}</span> : null}
                                                {otherLead ? <span>Lead: {otherLead.name}</span> : null}
                                                {otherOpportunity ? <span>Opportunity: {otherOpportunity.title}</span> : null}
                                                {expandedFields.length > 0 || auditEvents.length > 0 ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleExpanded(activity.id)}
                                                        aria-expanded={isExpanded}
                                                        className="inline-flex items-center gap-0.5 rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    >
                                                        {isExpanded ? "Hide details" : "Details"}
                                                        <ChevronDown size={12} className={cn("transition-transform", isExpanded && "rotate-180")} />
                                                    </button>
                                                ) : null}
                                            </div>
                                            {isExpanded ? (
                                                <div className="mt-2 space-y-2 border-t pt-2">
                                                    {expandedFields.length ? (
                                                        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                                                            {expandedFields.map((field) => (
                                                                <div key={field.label} className="flex gap-2">
                                                                    <dt className="shrink-0 text-muted-foreground">{field.label}</dt>
                                                                    <dd className="min-w-0 break-words">{String(field.value)}</dd>
                                                                </div>
                                                            ))}
                                                        </dl>
                                                    ) : null}
                                                    {auditEvents.map((event) => (
                                                        <div key={event.id} className="text-xs text-muted-foreground">
                                                            <span className="font-medium text-foreground">Changed by {event.user?.name || event.user?.email || "someone"}</span> · {formatWorkspaceRelativeTime(event.createdAt)}
                                                            <ul className="mt-0.5 space-y-0.5">
                                                                {activityChangedFields(event).map((change) => (
                                                                    <li key={`${event.id}-${change.field}`}>{activityFieldLabel(change.field)}: {formatAuditActivityValue(change.before, change.field, event)} → {formatAuditActivityValue(change.after, change.field, event)}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                </li>
                            );
                        })())}
                    </ul>
                </section>
            ))}
        </div>
    );
}
