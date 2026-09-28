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
import { cn } from '@/lib/utils';

interface GDPRRequest {
    id: string;
    contactEmail: string;
    type: string;
    status: string;
    createdAt: string;
    filePath?: string;
}

export default function GDPRPage() {
    const [requests, setRequests] = useState<GDPRRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [newRequest, setNewRequest] = useState({ contactEmail: '', type: 'EXPORT' });

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

    return (
        <div className="min-w-0">
            <PageHeader title="GDPR & Data Privacy" description="Manage data access and deletion requests." />

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
                    <div role="alert" className="rounded-lg border p-4 text-sm">Unable to load privacy requests. <Button variant="outline" size="sm" onClick={fetchRequests}>Retry</Button></div>
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
                                                {req.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    req.status === 'COMPLETED'
                                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                                        : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                                                )}
                                            >
                                                {req.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {req.filePath && (
                                                <Button variant="ghost" size="sm" asChild>
                                                    <a href={`/api${req.filePath}`}>
                                                        <Download className="size-4" />
                                                        Download
                                                    </a>
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
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
