"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import {
    MoreHorizontal as MoreHorizIcon,
    ExternalLink as OpenInNewIcon,
    RefreshCw as RefreshIcon,
    Copy as ContentCopyIcon,
    Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DataTable } from "@/components/ui/data-table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api";
import { QueueExportButton } from "@/components/exports/queue-export-button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Submission {
    id: string;
    createdAt: string;
    status: "PROCESSED" | "SPAM" | "DUPLICATE" | "ERROR";
    spamScore: number;
    lead?: {
        id: string;
        name: string;
        email: string;
        status: string;
    };
    data: any;
}

interface SubmissionsTableProps {
    formId: string;
}

const STATUS_BADGE_CLASSNAMES: Record<Submission["status"], string> = {
    PROCESSED: "border-primary/20 bg-primary/8 text-primary",
    SPAM: "border-destructive/20 bg-destructive/8 text-destructive",
    DUPLICATE: "border-tertiary/25 bg-tertiary/12 text-tertiary",
    ERROR: "border-destructive/20 bg-destructive/8 text-destructive",
};

export function SubmissionsTable({ formId }: SubmissionsTableProps) {
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [total, setTotal] = useState(0);
    const [pageIndex, setPageIndex] = useState(0);
    const limit = 20;

    const fetchSubmissions = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiFetch(`/forms/${formId}/submissions?limit=${limit}&offset=${pageIndex * limit}`);
            setSubmissions(Array.isArray(data.submissions) ? data.submissions : []);
            setTotal(typeof data.total === "number" ? data.total : 0);
        } catch (fetchError) {
            console.error(fetchError);
            setError("Failed to load submissions");
            toast.error("Failed to load submissions");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSubmissions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formId, pageIndex]);

    const summary = useMemo(() => {
        const processed = submissions.filter((submission) => submission.status === "PROCESSED").length;
        const flagged = submissions.filter((submission) => submission.status !== "PROCESSED").length;
        return { processed, flagged };
    }, [submissions]);

    const columns = useMemo<ColumnDef<Submission, any>[]>(() => [
        {
            accessorKey: "createdAt",
            header: "Date",
            size: 170,
            cell: ({ row }) => (
                <span className="whitespace-nowrap font-semibold">
                    {formatWorkspaceDateTime(row.original.createdAt)}
                </span>
            ),
        },
        {
            accessorKey: "status",
            header: "Status",
            size: 120,
            cell: ({ row }) => (
                <Badge variant="outline" className={cn("font-bold text-[11px]", STATUS_BADGE_CLASSNAMES[row.original.status])}>
                    {row.original.status}
                </Badge>
            ),
        },
        {
            id: "lead",
            header: "Lead",
            size: 200,
            cell: ({ row }) => {
                const lead = row.original.lead;
                if (!lead) return <span className="text-sm text-muted-foreground">-</span>;
                return (
                    <Link
                        href={`/dashboard/leads/${lead.id}`}
                        className="inline-flex items-center gap-1 font-bold text-primary no-underline hover:underline"
                    >
                        {lead.name}
                        <OpenInNewIcon className="size-3.5 text-muted-foreground" />
                    </Link>
                );
            },
        },
        {
            id: "email",
            header: "Email",
            size: 220,
            cell: ({ row }) => (
                <span className="text-sm">
                    {row.original.lead?.email || row.original.data?.email || row.original.data?.Email || "-"}
                </span>
            ),
        },
        {
            id: "spamScore",
            header: "Spam Score",
            size: 120,
            cell: ({ row }) => (
                <span className={cn("text-sm", row.original.spamScore > 0.5 ? "font-bold text-destructive" : "font-medium text-muted-foreground")}>
                    {(row.original.spamScore * 100).toFixed(0)}%
                </span>
            ),
        },
        {
            id: "actions",
            header: "",
            size: 60,
            cell: ({ row }) => {
                const submission = row.original;
                return (
                    <div className="flex justify-end">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" onClick={(e) => e.stopPropagation()}>
                                    <MoreHorizIcon className="size-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                    onClick={() => {
                                        navigator.clipboard.writeText(JSON.stringify(submission.data, null, 2));
                                        toast.success("Submission JSON copied");
                                    }}
                                >
                                    <ContentCopyIcon className="size-4" />
                                    Copy raw data
                                </DropdownMenuItem>
                                {submission.lead && (
                                    <DropdownMenuItem asChild>
                                        <Link href={`/dashboard/leads/${submission.lead.id}`}>
                                            <OpenInNewIcon className="size-4" />
                                            Open lead
                                        </Link>
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                );
            },
        },
    ], []);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                    <h2 className="text-lg font-extrabold tracking-tight">
                        Submissions ({total})
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Review captured form submissions, lead matches, and spam signals.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="icon-sm" onClick={fetchSubmissions} disabled={loading}>
                                {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshIcon className="size-4" />}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Refresh</TooltipContent>
                    </Tooltip>
                    <QueueExportButton
                        moduleName="FORMS"
                        filters={{ exportScope: "SUBMISSIONS", formId }}
                        label="Export CSV"
                    />
                </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
                <Card className="min-w-[180px] gap-0 rounded-xl bg-primary/[0.03] px-3.5 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Processed
                    </p>
                    <p className="mt-0.5 text-lg font-extrabold">
                        {summary.processed}
                    </p>
                </Card>
                <Card className="min-w-[180px] gap-0 rounded-xl px-3.5 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Needs Review
                    </p>
                    <p className="mt-0.5 text-lg font-extrabold">
                        {summary.flagged}
                    </p>
                </Card>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <DataTable
                storageKey="form-submissions-table"
                columns={columns}
                data={submissions}
                getRowId={(row) => row.id}
                loading={loading}
                emptyState={{
                    title: "No submissions yet",
                    description: "New captures will appear here once this form starts receiving responses.",
                }}
                totalItems={total}
                pageIndex={pageIndex}
                pageSize={limit}
                pageSizeOptions={[limit]}
                onPaginationChange={({ pageIndex: nextPageIndex }) => setPageIndex(nextPageIndex)}
            />
        </div>
    );
}
