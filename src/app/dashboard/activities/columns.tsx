"use client";

import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { Activity } from "@/types/activities";
import { formatWorkspaceDateTime, formatWorkspaceRelativeTime } from "@/lib/date-format";
import { statusDisplay } from "@/lib/display/status";
import { cn } from "@/lib/utils";

// When the activity happened (or is due): completed, else due, else logged.
export function activityWhen(activity: Activity) {
    return activity.completedAt || activity.dueAt || activity.createdAt;
}

export function ActivityRelated({ activity }: { activity: Activity }) {
    if (activity.opportunity) {
        return (
            <Link href={`/dashboard/opportunities/${activity.opportunity.id}?tab=activity`} onClick={(event) => event.stopPropagation()} className="block min-w-0 max-w-48 hover:underline">
                <span className="block truncate">{activity.opportunity.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{activity.lead?.name ? `Opportunity · ${activity.lead.name}` : "Opportunity"}</span>
            </Link>
        );
    }
    if (activity.lead) {
        return (
            <Link href={`/dashboard/leads/${activity.lead.id}?tab=activity`} onClick={(event) => event.stopPropagation()} className="block min-w-0 max-w-48 hover:underline">
                <span className="block truncate">{activity.lead.name}</span>
                <span className="block text-xs text-muted-foreground">Lead</span>
            </Link>
        );
    }
    return <span className="text-muted-foreground">—</span>;
}

// Activities list columns (UI/UX plan §10.4): type as a coloured dot and name (no uppercase
// pills), outcome and SLA as words, the related record as a link, and when it happened.
export function buildActivityColumns(): ColumnDef<Activity, any>[] {
    return [
        {
            accessorKey: "type",
            id: "type",
            header: "Type",
            size: 140,
            cell: ({ row }) => {
                const type = row.original.type as any;
                if (!type) return <span className="text-muted-foreground">—</span>;
                return (
                    <span className="inline-flex items-center gap-2">
                        <span aria-hidden className="size-2 shrink-0 rounded-full bg-muted-foreground" style={type.color ? { backgroundColor: type.color } : undefined} />
                        <span className="truncate">{type.name}</span>
                    </span>
                );
            },
        },
        {
            accessorKey: "notes",
            id: "notes",
            header: "Notes",
            size: 240,
            cell: ({ row }) => row.original.notes
                ? <span className="block max-w-[17rem] truncate" title={row.original.notes}>{row.original.notes}</span>
                : <span className="text-muted-foreground">No notes</span>,
        },
        {
            accessorKey: "outcome",
            id: "outcome",
            header: "Outcome",
            size: 140,
            cell: ({ row }) => {
                if (!row.original.outcome) return <span className="text-muted-foreground">—</span>;
                const shown = statusDisplay("outcome", row.original.outcome);
                return <span className={cn(shown.tone === "danger" ? "text-destructive" : shown.tone === "success" ? "text-status-success-foreground" : "text-foreground")}>{shown.label}</span>;
            },
        },
        { id: "related", header: "Related to", size: 200, cell: ({ row }) => <ActivityRelated activity={row.original} /> },
        {
            id: "by",
            header: "By",
            size: 140,
            cell: ({ row }) => <span className="block max-w-32 truncate">{(row.original as any).user?.name || (row.original as any).user?.email || "—"}</span>,
        },
        {
            id: "date",
            header: "When",
            size: 150,
            cell: ({ row }) => {
                const value = activityWhen(row.original);
                return <span className="whitespace-nowrap text-muted-foreground" title={formatWorkspaceDateTime(value)}>{formatWorkspaceRelativeTime(value)}</span>;
            },
        },
        {
            accessorKey: "slaStatus",
            id: "sla",
            header: "SLA",
            size: 100,
            cell: ({ row }) => {
                if (!row.original.slaStatus) return <span className="text-muted-foreground">—</span>;
                const shown = statusDisplay("sla", row.original.slaStatus);
                return <span className={cn(shown.tone === "danger" ? "text-destructive" : "text-muted-foreground")}>{shown.label}</span>;
            },
        },
    ];
}
