'use client';

import { PageHeader } from "@/components/layout/page-header";

import React, { useState, useEffect } from 'react';
import { ShieldCheck, Plus, Download, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatWorkspaceDate } from '@/lib/date-format';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { StandardDialog } from '@/components/common/standard-dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { EmptyState } from '@/components/common/empty-state';
import { TableSkeleton } from '@/components/common/skeletons';
import { ErrorState } from '@/components/common/error-state';
import { humanizeEnum } from '@/lib/display/status';
import { formatCount } from '@/lib/display/format';

interface GDPRRequest {
    id: string;
    contactEmail: string;
    type: string;
    status: string;
    createdAt: string;
    filePath?: string;
    error?: string | null;
}

// GET /governance/gdpr/requests returns at most this many of the most recent requests.
const REQUEST_HISTORY_LIMIT = 100;

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
    COMPLETED: 'success',
    PARTIAL: 'warning',
    FAILED: 'danger',
    PROCESSING: 'info',
};

// Only a finished export has a file to hand over (a DELETE request never does).
function canDownload(req: GDPRRequest) {
    return req.type === 'EXPORT' && !!req.filePath && (req.status === 'COMPLETED' || req.status === 'PARTIAL');
}

function filenameFromContentDisposition(header: string | null, fallback: string) {
    const match = header?.match(/filename="?([^";]+)"?/i);
    return match?.[1]?.trim() || fallback;
}

export default function GDPRPage() {
    const [requests, setRequests] = useState<GDPRRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [newRequest, setNewRequest] = useState({ contactEmail: '', type: 'EXPORT' });
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const data = await apiFetch('/governance/gdpr/requests');
            setRequests(data || []);
        } catch (err) {
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateRequest = async () => {
        if (!newRequest.contactEmail) return toast.error('Email is required');

        try {
            await apiFetch('/governance/gdpr/request', {
                method: 'POST',
                body: JSON.stringify(newRequest),
            });
            setIsAdding(false);
            setNewRequest({ contactEmail: '', type: 'EXPORT' });
            toast.success('GDPR request completed');
            fetchRequests();
        } catch (err: any) {
            toast.error(err?.message || 'Failed to create request');
        }
    };

    // GET /governance/gdpr/requests/<id>/download streams the JSON file. Fetched (not a plain
    // link) so a failure shows as a message here instead of an error page.
    const handleDownload = async (req: GDPRRequest) => {
        setDownloadingId(req.id);
        try {
            const response = await fetch(`/api/governance/gdpr/requests/${req.id}/download`);
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body?.message || body?.error || "The file couldn't be downloaded.");
            }
            const url = URL.createObjectURL(await response.blob());
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filenameFromContentDisposition(response.headers.get('Content-Disposition'), `privacy-export-${req.id}.json`);
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (err: any) {
            toast.error(err?.message || "The file couldn't be downloaded.");
        } finally {
            setDownloadingId(null);
        }
    };

    return (
        <div className="min-w-0">
            <PageHeader title="Data privacy requests" description="Manage data access and deletion requests." />

            <div className="flex flex-col gap-4">
                <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm text-foreground">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                    <p>
                        Initiating a &quot;DELETE&quot; request will permanently purge all leads, opportunities, and
                        activities associated with that email across your entire tenant.
                    </p>
                </div>

                <div className="flex flex-wrap items-center justify-between">
                    <h2 className="text-base font-semibold">Request History</h2>
                    <Button onClick={() => setIsAdding(true)}>
                        <Plus className="size-4" />
                        New Request
                    </Button>
                </div>

                {loading ? (
                    <TableSkeleton rows={5} columns={5} hasToolbar={false} />
                ) : loadError ? (
                    <ErrorState description="Privacy requests couldn't be loaded." onRetry={fetchRequests} />
                ) : requests.length === 0 ? (
                    <div className="rounded-xl border">
                        <EmptyState
                            icon={<ShieldCheck className="size-10 text-muted-foreground opacity-50" />}
                            title="No privacy requests found"
                        />
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-xl border">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-primary/5">
                                    <TableHead>Date</TableHead>
                                    <TableHead>Contact Email</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requests.map((req) => (
                                    <TableRow key={req.id}>
                                        <TableCell>{formatWorkspaceDate(req.createdAt)}</TableCell>
                                        <TableCell>{req.contactEmail}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="gap-1">
                                                {req.type === 'EXPORT' ? (
                                                    <Download className="size-3" />
                                                ) : (
                                                    <Trash2 className="size-3" />
                                                )}
                                                {humanizeEnum(req.type)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge tone={STATUS_TONE[req.status] ?? 'neutral'}>{humanizeEnum(req.status)}</Badge>
                                            {req.error ? <div className="mt-1 max-w-72 whitespace-normal break-words text-xs text-destructive">{req.error}</div> : null}
                                        </TableCell>
                                        <TableCell>
                                            {canDownload(req) ? (
                                                <Button variant="ghost" size="sm" onClick={() => handleDownload(req)} isLoading={downloadingId === req.id}>
                                                    {downloadingId === req.id ? null : <Download className="size-4" />}
                                                    Download
                                                </Button>
                                            ) : null}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        {requests.length >= REQUEST_HISTORY_LIMIT ? (
                            <p className="border-t px-4 py-3 text-xs text-muted-foreground">
                                Showing the {formatCount(REQUEST_HISTORY_LIMIT)} most recent requests. Older ones aren&apos;t listed here.
                            </p>
                        ) : null}
                    </div>
                )}
            </div>

            <StandardDialog
                open={isAdding}
                onClose={() => setIsAdding(false)}
                title="New Privacy Request"
                icon={<ShieldCheck className="size-4" />}
                actions={
                    <>
                        <Button variant="outline" onClick={() => setIsAdding(false)}>Cancel</Button>
                        <Button onClick={handleCreateRequest}>Initiate Request</Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4 pb-1">
                    <p className="text-sm text-muted-foreground">
                        Enter the email of the person making the request. We will search all modules for matching records.
                    </p>
                    <div className="space-y-1.5">
                        <Label htmlFor="gdpr-email">Contact Email</Label>
                        <Input
                            id="gdpr-email"
                            value={newRequest.contactEmail}
                            onChange={(e) => setNewRequest({ ...newRequest, contactEmail: e.target.value })}
                            placeholder="customer@example.com"
                        />
                    </div>
                    <div className="h-px bg-border" />
                    <div className="space-y-2">
                        <Label>Request Type</Label>
                        <RadioGroup
                            value={newRequest.type}
                            onValueChange={(value) => setNewRequest({ ...newRequest, type: value })}
                        >
                            <label className="flex items-center gap-2 text-sm">
                                <RadioGroupItem value="EXPORT" id="gdpr-type-export" />
                                Data Export (Subject Access Request)
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <RadioGroupItem value="DELETE" id="gdpr-type-delete" />
                                Data Deletion (Right to be Forgotten)
                            </label>
                        </RadioGroup>
                    </div>
                </div>
            </StandardDialog>
        </div>
    );
}
