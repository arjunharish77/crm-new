"use client";

import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { Eye, ExternalLink, Pencil } from "lucide-react";
import { Lead } from "@/types/leads";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PredictiveScoreBadge } from "@/components/scoring/predictive-score";
import { formatWorkspaceDate } from "@/lib/date-format";
import { cn } from "@/lib/utils";

// Same status -> color mapping the MUI version used, ported to Tailwind classes
// keyed off the M3 tokens rather than fixed hex values.
const STATUS_CLASSNAMES: Record<string, string> = {
    NEW: "bg-primary/8 text-primary border-primary/20",
    QUALIFIED: "bg-secondary/15 text-secondary-foreground border-secondary/30",
    LOST: "bg-destructive/8 text-destructive border-destructive/20",
    CONVERTED: "bg-tertiary/12 text-tertiary border-tertiary/25",
};
const DEFAULT_STATUS_CLASSNAME = "bg-muted text-muted-foreground border-border";

export type LeadColumnActions = {
    onQuickView: (leadId: string) => void;
    onEdit: (lead: Lead) => void;
};

export function buildLeadColumns(actions: LeadColumnActions): ColumnDef<Lead, any>[] {
    return [
        {
            accessorKey: "name",
            header: "Lead Name",
            size: 260,
            cell: ({ row }) => (
                <div className="flex items-center gap-3">
                    <Avatar className="size-8 text-sm font-bold">
                        <AvatarFallback>{(row.original.name?.[0] ?? "L").toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <Link
                        href={`/dashboard/leads/${row.original.id}`}
                        className="font-bold text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {row.original.name}
                    </Link>
                </div>
            ),
        },
        {
            accessorKey: "email",
            header: "Email",
            size: 220,
            cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
        },
        {
            accessorKey: "status",
            header: "Status",
            size: 140,
            cell: ({ row }) => {
                const status = row.original.status;
                return (
                    <Badge
                        variant="outline"
                        className={cn("font-bold uppercase tracking-wide", STATUS_CLASSNAMES[status] ?? DEFAULT_STATUS_CLASSNAME)}
                    >
                        {status}
                    </Badge>
                );
            },
        },
        {
            accessorKey: "source",
            header: "Source",
            size: 130,
            cell: ({ row }) => <span className="text-xs font-medium text-muted-foreground">{row.original.source}</span>,
        },
        {
            accessorKey: "predictiveScore",
            header: "Predictive Score",
            size: 190,
            sortingFn: (rowA, rowB) => {
                const a = rowA.original.predictiveScore?.conversionProbability ?? rowA.original.score ?? 0;
                const b = rowB.original.predictiveScore?.conversionProbability ?? rowB.original.score ?? 0;
                return a - b;
            },
            cell: ({ row }) => <PredictiveScoreBadge score={row.original.predictiveScore} />,
        },
        {
            accessorKey: "createdAt",
            header: "Created",
            size: 140,
            cell: ({ row }) => (
                <span className="text-xs text-muted-foreground">{formatWorkspaceDate(row.original.createdAt)}</span>
            ),
        },
        {
            id: "actions",
            header: "",
            size: 100,
            cell: ({ row }) => (
                <div className="flex items-center gap-0.5">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    actions.onQuickView(row.original.id);
                                }}
                            >
                                <Eye className="size-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>View Preview</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon-sm" asChild onClick={(e) => e.stopPropagation()}>
                                <Link href={`/dashboard/leads/${row.original.id}`}>
                                    <ExternalLink className="size-4" />
                                </Link>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Open Detail</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    actions.onEdit(row.original);
                                }}
                            >
                                <Pencil className="size-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit</TooltipContent>
                    </Tooltip>
                </div>
            ),
        },
    ];
}
