"use client";

import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { Activity } from "@/types/activities";
import { Badge } from "@/components/ui/badge";
import { ContextualFormsPanel } from "@/components/forms/contextual-forms-panel";
import { formatWorkspaceDateTime, formatWorkspaceRelativeTime, parseWorkspaceDate } from "@/lib/date-format";

export type ActivityColumnActions = {
    onFormsSaved: () => void;
};

export function buildActivityColumns(actions: ActivityColumnActions): ColumnDef<Activity, any>[] {
    return [
        {
            accessorKey: "type",
            header: "Type",
            size: 140,
            cell: ({ row }) => {
                const type = row.original.type as any;
                if (!type) return <span className="text-xs text-muted-foreground">-</span>;

                return (
                    <Badge
                        variant="outline"
                        className="font-bold uppercase"
                        style={{
                            backgroundColor: type.color ? `${type.color}14` : undefined,
                            borderColor: type.color ? `${type.color}33` : undefined,
                            color: type.color ?? undefined,
                        }}
                    >
                        {type.name}
                    </Badge>
                );
            },
        },
        {
            accessorKey: "notes",
            header: "Description",
            size: 280,
            cell: ({ row }) => (
                <span className="block max-w-[280px] truncate text-sm font-medium" title={row.original.notes ?? ""}>
                    {row.original.notes}
                </span>
            ),
        },
        {
            accessorKey: "outcome",
            header: "Outcome",
            size: 140,
            cell: ({ row }) => {
                const outcome = row.original.outcome;
                if (!outcome) return <span className="text-xs text-muted-foreground">-</span>;

                return (
                    <Badge variant="outline" className="border-border bg-muted font-bold uppercase text-muted-foreground">
                        {outcome}
                    </Badge>
                );
            },
        },
        {
            id: "date",
            header: "Time",
            size: 170,
            cell: ({ row }) => {
                const value = row.original.completedAt || row.original.dueAt || row.original.createdAt;
                const date = parseWorkspaceDate(value);

                return (
                    <div className="flex min-h-11 flex-col justify-center">
                        <span className="whitespace-nowrap text-sm font-semibold">{formatWorkspaceDateTime(date)}</span>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatWorkspaceRelativeTime(value)}
                        </span>
                    </div>
                );
            },
        },
        {
            id: "related",
            header: "Related To",
            size: 220,
            cell: ({ row }) => {
                if (!row.original.lead && !row.original.opportunity) {
                    return <span className="text-xs text-muted-foreground">-</span>;
                }

                return (
                    <div className="flex flex-wrap items-center gap-1 text-xs font-bold">
                        {row.original.lead ? (
                            <Link
                                href={`/dashboard/leads/${row.original.lead.id}`}
                                className="text-primary hover:underline"
                                onClick={(event) => event.stopPropagation()}
                            >
                                {row.original.lead.name} (Lead)
                            </Link>
                        ) : null}
                        {row.original.opportunity ? (
                            <Link
                                href={`/dashboard/opportunities/${row.original.opportunity.id}`}
                                className="text-secondary hover:underline"
                                onClick={(event) => event.stopPropagation()}
                            >
                                {row.original.lead ? "|" : null} {row.original.opportunity.title} (Opp)
                            </Link>
                        ) : null}
                    </div>
                );
            },
        },
        {
            id: "forms",
            header: "Forms",
            size: 120,
            cell: ({ row }) => (
                <ContextualFormsPanel
                    placement="ACTIVITY_DETAIL"
                    context={{
                        activityId: row.original.id,
                        leadId: row.original.leadId,
                        opportunityId: row.original.opportunityId,
                    }}
                    entityData={row.original}
                    onSaved={actions.onFormsSaved}
                />
            ),
        },
    ];
}
