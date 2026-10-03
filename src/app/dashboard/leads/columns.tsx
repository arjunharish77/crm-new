"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { Phone } from "lucide-react";
import { Lead } from "@/types/leads";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NbaCountChip } from "@/components/next-best-action/nba-count-chip";
import { LeadStatusSelect } from "@/components/leads/lead-status";
import { formatWorkspaceDate, formatWorkspaceRelativeTime, isPastDate } from "@/lib/date-format";
import { statusDisplay } from "@/lib/display/status";
import { cn } from "@/lib/utils";

export type LeadColumnActions = {
    // Inline status edit -- resolves once the PATCH settles (or throws), so the cell can
    // roll back optimistic UI on failure without the parent needing to know cell internals.
    onStatusChange: (lead: Lead, status: string) => Promise<void>;
};

// Columns hidden until a user turns them on (decisions 5 and 21). Saved choices are kept.
export const LEAD_DEFAULT_HIDDEN = { email: false, createdAt: false, pendingNbaCount: false };

function StatusCell({ lead, onStatusChange }: { lead: Lead; onStatusChange: LeadColumnActions["onStatusChange"] }) {
    const [status, setStatus] = useState(lead.status);
    const [saving, setSaving] = useState(false);

    // Keep in sync if the row's underlying data refetches with a different status (e.g.
    // another user changed it, or a filter/sort re-triggered a fetch).
    useEffect(() => setStatus(lead.status), [lead.status]);

    return (
        <LeadStatusSelect
            value={status}
            disabled={saving}
            ariaLabel={`Status for ${lead.name}`}
            onChange={(next) => {
                const previous = status;
                setStatus(next);
                setSaving(true);
                onStatusChange(lead, next)
                    .catch(() => setStatus(previous))
                    .finally(() => setSaving(false));
            }}
        />
    );
}

const BAND_DOT: Record<string, string> = {
    success: "bg-status-success-foreground",
    warning: "bg-status-warning-foreground",
    danger: "bg-status-danger-foreground",
    info: "bg-status-info-foreground",
    neutral: "bg-status-neutral-foreground",
    accent: "bg-status-accent-foreground",
};

// One compact Score column (decision 21): the likelihood as a number with a small band dot; band,
// likelihood and confidence in the tooltip.
function ScoreCell({ lead }: { lead: Lead }) {
    const score = lead.predictiveScore;
    const value = score?.conversionProbability ?? null;
    if (!score || value === null) return <span className="text-muted-foreground">—</span>;
    const band = statusDisplay("scoreBand", score.scoreBand);
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1.5 tabular-nums" tabIndex={0}>
                    <span aria-hidden className={cn("size-2 rounded-full", BAND_DOT[band.tone])} />
                    {Math.round(value)}
                    <span className="sr-only">, {band.label}</span>
                </span>
            </TooltipTrigger>
            <TooltipContent>
                {band.label} · {Math.round(value)}% likely to convert · {Math.round(score.confidence ?? 0)}% confidence
            </TooltipContent>
        </Tooltip>
    );
}

function NextTaskCell({ lead }: { lead: Lead }) {
    const task = lead.nextTask;
    if (!task) return <span className="text-muted-foreground">—</span>;
    const due = task.dueAt ? new Date(task.dueAt) : null;
    const overdue = isPastDate(task.dueAt);
    return (
        <div className="min-w-0 max-w-44">
            <Link
                href={`/dashboard/tasks?taskId=${task.id}`}
                onClick={(event) => event.stopPropagation()}
                className="block truncate hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {task.title}
            </Link>
            {due ? (
                <span className={cn("text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
                    {overdue ? "Overdue · " : ""}{formatWorkspaceDate(task.dueAt)}
                </span>
            ) : null}
        </div>
    );
}

export function buildLeadColumns(actions: LeadColumnActions): ColumnDef<Lead, any>[] {
    return [
        {
            accessorKey: "name",
            id: "name",
            header: "Name",
            enableSorting: true,
            size: 210,
            cell: ({ row }) => (
                <div className="min-w-0 max-w-52">
                    {/* The first cell is a real link (§11.6 F): middle-click and keyboard work. */}
                    <Link
                        href={`/dashboard/leads/${row.original.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="block truncate font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {row.original.name || row.original.email || "Unnamed lead"}
                    </Link>
                    {row.original.company ? <span className="block truncate text-xs text-muted-foreground">{row.original.company}</span> : null}
                </div>
            ),
        },
        {
            accessorKey: "phone",
            id: "phone",
            header: "Phone",
            size: 150,
            cell: ({ row }) => row.original.phone ? (
                <a
                    href={`tel:${row.original.phone.replace(/[^\d+]/g, "")}`}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Call ${row.original.name}: ${row.original.phone}`}
                    className="inline-flex items-center gap-1.5 tabular-nums hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Phone className="size-3.5 text-muted-foreground" aria-hidden />
                    {row.original.phone}
                </a>
            ) : <span className="text-muted-foreground">—</span>,
        },
        {
            accessorKey: "status",
            id: "status",
            header: "Status",
            enableSorting: true,
            size: 130,
            cell: ({ row }) => <StatusCell lead={row.original} onStatusChange={actions.onStatusChange} />,
        },
        {
            accessorKey: "ownerName",
            id: "owner",
            header: "Owner",
            enableSorting: true,
            size: 150,
            cell: ({ row }) => row.original.ownerName
                ? <span className="block max-w-32 truncate">{row.original.ownerName}</span>
                : <span className="text-muted-foreground">Unassigned</span>,
        },
        {
            accessorKey: "lastActivityAt",
            id: "lastActivityAt",
            header: "Last activity",
            enableSorting: true,
            size: 120,
            cell: ({ row }) => row.original.lastActivityAt
                ? <span className="text-muted-foreground" title={formatWorkspaceDate(row.original.lastActivityAt)}>{formatWorkspaceRelativeTime(row.original.lastActivityAt)}</span>
                : <span className="text-muted-foreground">None yet</span>,
        },
        {
            id: "nextTask",
            header: "Next task",
            size: 180,
            cell: ({ row }) => <NextTaskCell lead={row.original} />,
        },
        {
            accessorKey: "predictiveScore",
            id: "score",
            header: "Score",
            enableSorting: true,
            size: 80,
            cell: ({ row }) => <ScoreCell lead={row.original} />,
        },
        {
            accessorKey: "source",
            id: "source",
            header: "Source",
            enableSorting: true,
            size: 130,
            cell: ({ row }) => row.original.source ? <span className="text-muted-foreground">{row.original.source}</span> : <span className="text-muted-foreground">—</span>,
        },
        {
            accessorKey: "email",
            id: "email",
            header: "Email",
            size: 220,
            cell: ({ row }) => row.original.email ? <span className="block max-w-56 truncate text-muted-foreground">{row.original.email}</span> : <span className="text-muted-foreground">—</span>,
        },
        {
            accessorKey: "createdAt",
            id: "createdAt",
            header: "Created",
            enableSorting: true,
            size: 120,
            cell: ({ row }) => <span className="text-muted-foreground">{formatWorkspaceDate(row.original.createdAt)}</span>,
        },
        {
            accessorKey: "pendingNbaCount",
            id: "pendingNbaCount",
            header: "Next best action",
            size: 130,
            cell: ({ row }) => <NbaCountChip count={row.original.pendingNbaCount} />,
        },
    ];
}
