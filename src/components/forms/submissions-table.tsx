"use client";

import { useState, useEffect } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { MoreHorizontal, Download, RefreshCw, Search, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Chip } from "@mui/material";
import Link from "next/link";
import { toast } from "sonner";

interface Submission {
    id: string;
    createdAt: string;
    status: 'PROCESSED' | 'SPAM' | 'DUPLICATE' | 'ERROR';
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

export function SubmissionsTable({ formId }: SubmissionsTableProps) {
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const limit = 20;

    const fetchSubmissions = async () => {
        setLoading(true);
        try {
            const data = await apiFetch(`/forms/${formId}/submissions?limit=${limit}&offset=${page * limit}`);
            setSubmissions(data.submissions);
            setTotal(data.total);
        } catch (error) {
            console.error(error);
            toast.error("Failed to load submissions");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSubmissions();
    }, [formId, page]);

    const handleExport = async () => {
        try {
            toast.success("Preparing export...");
            const response = await apiFetch(`/forms/${formId}/export`, {
                method: 'GET',
            });

            const blob = new Blob([response], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `submissions-${formId}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error(error);
            toast.error("Export failed. Please try again.");
        }
    };


    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="text-lg font-medium">Submissions ({total})</h3>
                    <Button variant="ghost" size="icon" onClick={fetchSubmissions} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
                <Button variant="outline" size="sm" onClick={handleExport}>
                    <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Lead</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Spam Score</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading && submissions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    Loading...
                                </TableCell>
                            </TableRow>
                        ) : submissions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    No submissions yet.
                                </TableCell>
                            </TableRow>
                        ) : (
                            submissions.map((sub) => (
                                <TableRow key={sub.id}>
                                    <TableCell className="font-medium whitespace-nowrap">
                                        {format(new Date(sub.createdAt), 'MMM d, HH:mm')}
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={sub.status}
                                            color={
                                                sub.status === 'PROCESSED' ? 'default' :
                                                    sub.status === 'SPAM' ? 'error' :
                                                        sub.status === 'DUPLICATE' ? 'secondary' :
                                                            sub.status === 'ERROR' ? 'error' : 'default'
                                            }
                                            variant={sub.status === 'PROCESSED' ? 'filled' : 'outlined'}
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {sub.lead ? (
                                            <Link href={`/dashboard/leads/${sub.lead.id}`} className="hover:underline flex items-center gap-1 font-medium">
                                                {sub.lead.name}
                                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                            </Link>
                                        ) : (
                                            <span className="text-muted-foreground">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell>{sub.lead?.email || sub.data?.email || sub.data?.Email || '-'}</TableCell>
                                    <TableCell>
                                        <span className={sub.spamScore > 0.5 ? "text-red-500 font-medium" : ""}>
                                            {(sub.spamScore * 100).toFixed(0)}%
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0">
                                                    <span className="sr-only">Open menu</span>
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                <DropdownMenuItem onClick={() => navigator.clipboard.writeText(JSON.stringify(sub.data, null, 2))}>
                                                    Copy Raw Data
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                {sub.lead && (
                                                    <DropdownMenuItem asChild>
                                                        <Link href={`/dashboard/leads/${sub.lead.id}`}>View Lead</Link>
                                                    </DropdownMenuItem>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex items-center justify-end space-x-2 py-4">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0 || loading}
                >
                    Previous
                </Button>
                <div className="text-sm text-muted-foreground">
                    Page {page + 1} of {Math.max(1, Math.ceil(total / limit))}
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={(page + 1) * limit >= total || loading}
                >
                    Next
                </Button>
            </div>
        </div>
    );
}
