"use client";

import { useState } from "react";
import { Activity } from "@/types/activities";
import * as LucideIcons from "lucide-react";
import { ChevronDown, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatWorkspaceDate, formatWorkspaceDateTime, formatWorkspaceRelativeTime, formatWorkspaceTime, parseWorkspaceDate } from "@/lib/date-format";
import { cn } from "@/lib/utils";

interface TimelineProps {
    activities: Activity[];
}

// Mirrors the color-mix approach used for CSS tokens in globals.css — lets
// per-activity-type accent colors (arbitrary hex values from the DB) get
// alpha-blended without needing MUI's `alpha()` helper.
function withAlpha(color: string, percent: number) {
    return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
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

export function Timeline({ activities }: TimelineProps) {
    const [expandedActivityIds, setExpandedActivityIds] = useState<string[]>([]);

    const toggleExpanded = (activityId: string) => {
        setExpandedActivityIds((current) =>
            current.includes(activityId)
                ? current.filter((id) => id !== activityId)
                : [...current, activityId]
        );
    };

    if (activities.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed bg-surface-container-lowest py-12 text-center text-muted-foreground">
                <FileText size={40} className="mx-auto mb-3 opacity-[0.18]" />
                <p className="text-base font-bold">
                    No activity yet
                </p>
                <p className="text-sm">Activity history will appear here.</p>
            </div>
        );
    }

    const grouped = activities.reduce<Record<string, Activity[]>>((acc, activity) => {
        const key = getDayLabel(parseWorkspaceDate(activity.createdAt) ?? new Date(activity.createdAt));
        acc[key] = acc[key] || [];
        acc[key].push(activity);
        return acc;
    }, {});

    return (
        <div className="flex flex-col gap-6">
            {Object.entries(grouped).map(([label, items]) => (
                <div key={label}>
                    <span className="mb-3 inline-flex rounded-full bg-primary/8 px-2.5 py-1 text-xs font-extrabold uppercase tracking-[0.04em] text-primary">
                        {label}
                    </span>

                    <div className="flex flex-col gap-2.5">
                        {items.map((activity) => {
                            const type = activity.type;
                            const IconComponent = type?.icon
                                ? (LucideIcons as any)[type.icon]
                                : LucideIcons.FileText;
                            const Icon = IconComponent || LucideIcons.FileText;
                            const accent = type?.color || "var(--primary)";
                            const activityDate = parseWorkspaceDate(activity.createdAt) ?? new Date(activity.createdAt);
                            const isExpanded = expandedActivityIds.includes(activity.id);
                            const customFieldEntries = Object.entries(activity.customFields ?? {}).filter(
                                ([, value]) => value !== null && value !== undefined && value !== ""
                            );
                            const activityFields = [
                                { label: "Type", value: activity.type?.name ?? "Activity" },
                                { label: "Outcome", value: activity.outcome },
                                { label: "Notes", value: activity.notes },
                                { label: "Due At", value: activity.dueAt ? formatWorkspaceDateTime(activity.dueAt) : null },
                                { label: "Completed At", value: activity.completedAt ? formatWorkspaceDateTime(activity.completedAt) : null },
                                { label: "SLA Status", value: activity.slaStatus },
                                { label: "SLA Target", value: activity.slaTarget ? formatWorkspaceDateTime(activity.slaTarget) : null },
                                { label: "Lead", value: activity.lead?.name },
                                { label: "Opportunity", value: activity.opportunity?.title },
                                { label: "Logged By", value: activity.user ? activity.user.name || activity.user.email : null },
                                { label: "Created", value: formatWorkspaceDateTime(activityDate) },
                                { label: "Updated", value: formatWorkspaceDateTime(activity.updatedAt) },
                                { label: "Recurring", value: activity.isRecurring ? "Yes" : "No" },
                                { label: "Recurrence Rule", value: activity.recurrenceRule },
                            ].filter((field) => field.value !== null && field.value !== undefined && field.value !== "");
                            const expandedFields = [
                                ...activityFields,
                                ...customFieldEntries.map(([key, value]) => ({
                                    label: key,
                                    value,
                                })),
                            ];
                            const auditEvents = (activity.auditEvents ?? []).filter((event) => event.action === "UPDATE" && activityChangedFields(event).length > 0);

                            return (
                                <div
                                    key={activity.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => toggleExpanded(activity.id)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            toggleExpanded(activity.id);
                                        }
                                    }}
                                    className="cursor-pointer rounded-2xl border bg-card p-3 transition-[border-color,box-shadow,background-color] duration-150 hover:shadow-[0_10px_28px_var(--tw-shadow-color)]"
                                    style={{
                                        borderColor: withAlpha(accent, 18),
                                        "--tw-shadow-color": withAlpha(accent, 8),
                                    } as React.CSSProperties}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="w-[52px] min-w-[52px] pt-0.5 text-center">
                                            <div
                                                className="mx-auto mb-1 flex size-8 items-center justify-center rounded-full border"
                                                style={{
                                                    backgroundColor: withAlpha(accent, 10),
                                                    color: accent,
                                                    borderColor: withAlpha(accent, 18),
                                                }}
                                            >
                                                <Icon size={14} />
                                            </div>
                                            <span className="block text-xs font-bold">
                                                {formatWorkspaceTime(activityDate)}
                                            </span>
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="mb-1.5 flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className="text-sm font-extrabold">
                                                        {activity.type?.name || "Activity"}
                                                    </span>
                                                    {activity.outcome && (
                                                        <Badge variant="secondary" className="h-5 rounded-[6px] text-[0.65rem] font-bold">
                                                            {activity.outcome}
                                                        </Badge>
                                                    )}
                                                    {activity.slaStatus && activity.slaStatus !== "PENDING" && (
                                                        <Badge
                                                            variant="outline"
                                                            className={cn(
                                                                "h-5 rounded-[6px] text-[0.65rem] font-bold",
                                                                activity.slaStatus === "MET"
                                                                    ? "border-emerald-500/40 text-emerald-600"
                                                                    : "border-destructive/40 text-destructive"
                                                            )}
                                                        >
                                                            {activity.slaStatus}
                                                        </Badge>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">
                                                        {formatWorkspaceRelativeTime(activity.createdAt)}
                                                    </span>
                                                    <div
                                                        className={cn(
                                                            "inline-flex size-6 items-center justify-center rounded-[6px] transition-transform duration-150",
                                                            isExpanded && "rotate-180"
                                                        )}
                                                        style={{ backgroundColor: withAlpha(accent, 8), color: accent }}
                                                    >
                                                        <ChevronDown size={14} />
                                                    </div>
                                                </div>
                                            </div>

                                            {activity.notes ? (
                                                <p className="mb-1.5 whitespace-pre-wrap text-sm leading-[1.45] text-foreground">
                                                    {activity.notes}
                                                </p>
                                            ) : (
                                                <p className="mb-1.5 text-sm text-muted-foreground">
                                                    No notes were added for this activity.
                                                </p>
                                            )}

                                            <div className="flex flex-wrap gap-3">
                                                {activity.lead && (
                                                    <span className="text-xs text-muted-foreground">
                                                        Lead: <strong>{activity.lead.name}</strong>
                                                    </span>
                                                )}
                                                {activity.opportunity && (
                                                    <span className="text-xs text-muted-foreground">
                                                        Opportunity: <strong>{activity.opportunity.title}</strong>
                                                    </span>
                                                )}
                                                {activity.user && (
                                                    <span className="text-xs text-muted-foreground">
                                                        by {activity.user.name || activity.user.email}
                                                    </span>
                                                )}
                                                {auditEvents.length > 0 && (
                                                    <span className="text-xs text-muted-foreground">
                                                        {auditEvents.length} modification{auditEvents.length === 1 ? "" : "s"} tracked
                                                    </span>
                                                )}
                                            </div>

                                            {/* Pure-CSS collapse (grid-template-rows trick) instead of MUI's Collapse */}
                                            <div
                                                className={cn(
                                                    "grid transition-[grid-template-rows] duration-200 ease-in-out",
                                                    isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                                                )}
                                            >
                                                <div className="overflow-hidden">
                                                    <div className="my-3 border-t" />
                                                    {auditEvents.length > 0 && (
                                                        <div className="mb-3 flex flex-col gap-2">
                                                            {auditEvents.map((event) => {
                                                                const changes = activityChangedFields(event);
                                                                const actor = event.user?.name || event.user?.email || "Unknown User";
                                                                return (
                                                                    <div key={event.id} className="rounded-lg border border-sky-500/20 bg-sky-500/[0.06] p-2.5">
                                                                        <span className="mb-1.5 block text-xs font-extrabold text-sky-600">
                                                                            Activity modified by {actor} / {formatWorkspaceRelativeTime(event.createdAt)}
                                                                        </span>
                                                                        <div className="flex flex-col gap-1">
                                                                            {changes.map((change) => (
                                                                                <span key={`${event.id}-${change.field}`} className="text-xs text-muted-foreground">
                                                                                    <strong>{activityFieldLabel(change.field)}</strong>: {formatAuditActivityValue(change.before, change.field, event)} -&gt; {formatAuditActivityValue(change.after, change.field, event)}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                        {expandedFields.length > 0 ? (
                                                            expandedFields.map((field) => (
                                                                <div
                                                                    key={`${activity.id}-${field.label}`}
                                                                    className="rounded-lg border bg-surface-container-lowest px-2.5 py-2"
                                                                >
                                                                    <span className="mb-0.5 block text-xs font-bold uppercase tracking-[0.02em] text-muted-foreground">
                                                                        {field.label}
                                                                    </span>
                                                                    <span className="block whitespace-pre-wrap break-words text-sm font-semibold text-foreground">
                                                                        {formatActivityValue(field.value)}
                                                                    </span>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div className="col-span-full rounded-lg border border-dashed px-2.5 py-2">
                                                                <span className="text-sm text-muted-foreground">
                                                                    No additional fields were stored for this activity.
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
