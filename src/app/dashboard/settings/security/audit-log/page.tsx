'use client';

import { PageHeader } from "@/components/layout/page-header";

import React, { useState, useEffect, useRef } from 'react';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { History, Search, Eye, Shield, AlertTriangle, Lock, Send, Loader2, UserCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { formatWorkspaceDateTime } from '@/lib/date-format';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { StandardDialog } from '@/components/common/standard-dialog';
import { TableSkeleton } from '@/components/common/skeletons';
import { EmptyState } from '@/components/common/empty-state';
import { SavedFiltersMenu } from '@/components/common/saved-filters-menu';
import { QueueExportButton } from '@/components/exports/queue-export-button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AuditLog {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    createdAt: string;
    user: { name: string; email: string };
    changes: any;
    metadata: any;
    reviewStatus: 'UNREVIEWED' | 'IN_REVIEW' | 'RESOLVED';
    reviewer: { name: string; email: string } | null;
    reviewedBy: { name: string; email: string } | null;
    reviewedAt: string | null;
    reviewNote: string | null;
    flagged: boolean;
    flagReason: string | null;
    legalHold: boolean;
}

interface AuditLogComment {
    id: string;
    body: string;
    createdAt: string;
    authorName: string | null;
    authorEmail: string | null;
}

const ACTION_CLASSNAMES: Record<string, string> = {
    CREATE: 'border-status-success bg-status-success text-status-success-foreground',
    UPDATE: 'border-status-info bg-status-info text-status-info-foreground',
    DELETE: 'border-destructive/30 bg-destructive/10 text-destructive',
    LOGIN_FAILED: 'border-destructive/30 bg-destructive/10 text-destructive',
    IMPERSONATE: 'border-status-warning bg-status-warning text-status-warning-foreground',
    DOWNLOAD: 'border-status-warning bg-status-warning text-status-warning-foreground',
    EXPORT: 'border-status-warning bg-status-warning text-status-warning-foreground',
};

const REVIEW_STATUS_CLASSNAMES: Record<string, string> = {
    UNREVIEWED: 'border-border bg-muted text-muted-foreground',
    IN_REVIEW: 'border-status-info bg-status-info text-status-info-foreground',
    RESOLVED: 'border-status-success bg-status-success text-status-success-foreground',
};

const DEFAULT_FILTERS = { entityType: '', action: '', userId: '', reviewStatus: '', flagged: false, legalHold: false, dateFrom: '', dateTo: '' };

export default function AuditLogPage() {
    const { user } = useAuth();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [category, setCategory] = useState<'' | 'privacy'>('');
    const [comments, setComments] = useState<AuditLogComment[]>([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [postingComment, setPostingComment] = useState(false);
    const [savingReview, setSavingReview] = useState(false);
    const [reviewNote, setReviewNote] = useState('');
    const [savingHold, setSavingHold] = useState(false);

    // Typed filters wait for a pause, and only the newest answer is shown (round-2 plan F8).
    const appliedFilters = useDebouncedValue(filters, 350);
    const requestSeq = useRef(0);
    useEffect(() => {
        fetchLogs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appliedFilters, category]);

    useEffect(() => {
        if (!selectedLog) return;
        setReviewNote(selectedLog.reviewNote || '');
        setLoadingComments(true);
        apiFetch<AuditLogComment[]>(`/governance/audit-logs/${selectedLog.id}/comments`)
            .then((data) => setComments(Array.isArray(data) ? data : []))
            .catch(() => setComments([]))
            .finally(() => setLoadingComments(false));
    }, [selectedLog]);

    const fetchLogs = async () => {
        const seq = ++requestSeq.current;
        const filters = appliedFilters;
        setLoading(true);
        setLoadError(false);
        try {
            const params = new URLSearchParams({ entityType: filters.entityType, action: filters.action });
            if (filters.userId) params.set('userId', filters.userId);
            if (category) params.set('category', category);
            if (filters.reviewStatus) params.set('reviewStatus', filters.reviewStatus);
            if (filters.flagged) params.set('flagged', 'true');
            if (filters.legalHold) params.set('legalHold', 'true');
            if (filters.dateFrom) params.set('dateFrom', new Date(filters.dateFrom).toISOString());
            if (filters.dateTo) params.set('dateTo', new Date(filters.dateTo).toISOString());
            const data = await apiFetch(`/governance/audit-logs?${params.toString()}`);
            if (seq !== requestSeq.current) return;
            setLogs(data || []);
        } catch {
            if (seq === requestSeq.current) setLoadError(true);
        } finally {
            if (seq === requestSeq.current) setLoading(false);
        }
    };

    const applySavedFilter = (saved: any) => {
        setFilters({ ...DEFAULT_FILTERS, ...saved });
    };

    const refreshSelected = (updated: Partial<AuditLog>) => {
        setSelectedLog((current) => (current ? { ...current, ...updated } : current));
        setLogs((current) => current.map((log) => (log.id === selectedLog?.id ? { ...log, ...updated } : log)));
    };

    const updateReviewStatus = async (status: AuditLog['reviewStatus']) => {
        if (!selectedLog) return;
        setSavingReview(true);
        try {
            await apiFetch(`/governance/audit-logs/${selectedLog.id}/review`, {
                method: 'PATCH',
                body: JSON.stringify({ reviewStatus: status, reviewNote: reviewNote || null }),
            });
            refreshSelected({ reviewStatus: status, reviewNote });
            toast.success('Review status updated');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to update review status');
        } finally {
            setSavingReview(false);
        }
    };

    const assignToMe = async () => {
        if (!selectedLog || !user) return;
        setSavingReview(true);
        try {
            await apiFetch(`/governance/audit-logs/${selectedLog.id}/review`, {
                method: 'PATCH',
                body: JSON.stringify({ reviewerId: user.id, reviewStatus: 'IN_REVIEW' }),
            });
            refreshSelected({ reviewer: { name: user.name || user.email, email: user.email }, reviewStatus: 'IN_REVIEW' });
            toast.success('Assigned to you');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to assign');
        } finally {
            setSavingReview(false);
        }
    };

    const toggleLegalHold = async () => {
        if (!selectedLog) return;
        setSavingHold(true);
        try {
            const nextHold = !selectedLog.legalHold;
            await apiFetch(`/governance/audit-logs/${selectedLog.id}/legal-hold`, {
                method: 'PATCH',
                body: JSON.stringify({ legalHold: nextHold }),
            });
            refreshSelected({ legalHold: nextHold });
            toast.success(nextHold ? 'Legal hold applied -- excluded from retention purge' : 'Legal hold removed');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to update legal hold');
        } finally {
            setSavingHold(false);
        }
    };

    const postComment = async () => {
        if (!selectedLog || !newComment.trim()) return;
        setPostingComment(true);
        try {
            await apiFetch(`/governance/audit-logs/${selectedLog.id}/comments`, {
                method: 'POST',
                body: JSON.stringify({ body: newComment.trim() }),
            });
            setNewComment('');
            const data = await apiFetch<AuditLogComment[]>(`/governance/audit-logs/${selectedLog.id}/comments`);
            setComments(Array.isArray(data) ? data : []);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to add comment');
        } finally {
            setPostingComment(false);
        }
    };

    return (
        <div className="min-w-0">
            <PageHeader title="Audit log" description="Trace actions across your workspace and review evidence." actions={
                <QueueExportButton
                    moduleName="AUDIT_LOGS"
                    filters={{
                        entityType: filters.entityType || undefined,
                        action: filters.action || undefined,
                        reviewStatus: filters.reviewStatus || undefined,
                        flagged: filters.flagged || undefined,
                        legalHold: filters.legalHold || undefined,
                    }}
                    label="Export Evidence"
                />
            } />

            <div className="mb-3 flex flex-wrap gap-2">
                <Button
                    variant={category === '' ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setCategory('')}
                >
                    All Activity
                </Button>
                <Button
                    variant={category === 'privacy' ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setCategory('privacy')}
                >
                    <Shield className="size-3.5" />
                    Privacy activity
                </Button>
                <Button
                    variant={filters.flagged ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setFilters({ ...filters, flagged: !filters.flagged })}
                >
                    <AlertTriangle className="size-3.5" />
                    Flagged
                </Button>
                <Button
                    variant={filters.legalHold ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setFilters({ ...filters, legalHold: !filters.legalHold })}
                >
                    <Lock className="size-3.5" />
                    Legal Hold
                </Button>
            </div>

            {category === "privacy" && <p className="mb-3 text-sm text-muted-foreground">Exports, consent, suppression and data privacy requests.</p>}
            <div className="mb-6 flex flex-wrap items-center gap-2">
                <Input
                    className="w-full sm:w-56"
                    aria-label="Filter by entity"
                    placeholder="Filter by Entity (e.g. LEAD)"
                    value={filters.entityType}
                    onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
                />
                <Input
                    className="w-full sm:w-56"
                    aria-label="Filter by action"
                    placeholder="Filter by Action (e.g. UPDATE)"
                    value={filters.action}
                    onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                />
                <Input
                    className="w-full sm:w-56"
                    aria-label="Filter by user ID"
                    placeholder="Filter by User ID"
                    value={filters.userId}
                    onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
                />
                <Select value={filters.reviewStatus || '__any'} onValueChange={(v) => setFilters({ ...filters, reviewStatus: v === '__any' ? '' : v })}>
                    <SelectTrigger aria-label="Review status" className="w-full sm:w-44"><SelectValue placeholder="Review status" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__any">Any review status</SelectItem>
                        <SelectItem value="UNREVIEWED">Unreviewed</SelectItem>
                        <SelectItem value="IN_REVIEW">In Review</SelectItem>
                        <SelectItem value="RESOLVED">Resolved</SelectItem>
                    </SelectContent>
                </Select>
                <Input
                    type="date"
                    className="w-full sm:w-40"
                    aria-label="From date"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                />
                <Input
                    type="date"
                    className="w-full sm:w-40"
                    aria-label="To date"
                    value={filters.dateTo}
                    onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                />
                <Button variant="outline" onClick={fetchLogs}>
                    <Search className="size-4" />
                    Search
                </Button>
                <SavedFiltersMenu module="AUDIT_LOGS" activeFilter={filters} onApply={applySavedFilter} onClear={() => setFilters(DEFAULT_FILTERS)} />
            </div>

            {loading ? (
                <TableSkeleton rows={8} columns={6} hasToolbar={false} />
            ) : loadError ? (
                    <div role="alert" className="rounded-lg border p-4 text-sm">Unable to load audit logs. <Button variant="outline" size="sm" onClick={fetchLogs}>Retry</Button></div>
                ) : logs.length === 0 ? (
                <div className="rounded-xl border">
                    <EmptyState
                        icon={<History className="size-10 text-muted-foreground opacity-50" />}
                        title="No audit logs found"
                    />
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-primary/5">
                                <TableHead>Timestamp</TableHead>
                                <TableHead>User</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead>Entity</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Details</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.map((log) => (
                                <TableRow
                                    key={log.id}
                                    className="cursor-pointer"
                                    onClick={() => setSelectedLog(log)}
                                >
                                    <TableCell>{formatWorkspaceDateTime(log.createdAt, { seconds: true })}</TableCell>
                                    <TableCell>
                                        <div className="text-sm">{log.user.name}</div>
                                        <div className="text-xs text-muted-foreground">{log.user.email}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={cn(ACTION_CLASSNAMES[log.action])}>
                                            {log.action}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm">{log.entityType}</div>
                                        <div className="text-xs text-muted-foreground">Record change</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            <Badge variant="outline" className={cn(REVIEW_STATUS_CLASSNAMES[log.reviewStatus])}>
                                                {log.reviewStatus.replace('_', ' ')}
                                            </Badge>
                                            {log.flagged && (
                                                <Badge variant="outline" className="border-status-warning bg-status-warning text-status-warning-foreground">
                                                    <AlertTriangle className="size-3" />
                                                    Flagged
                                                </Badge>
                                            )}
                                            {log.legalHold && (
                                                <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400">
                                                    <Lock className="size-3" />
                                                    Hold
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedLog(log);
                                            }}
                                        >
                                            <Eye className="size-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            <StandardDialog
                open={!!selectedLog}
                onClose={() => setSelectedLog(null)}
                title={selectedLog ? `${selectedLog.action} ${selectedLog.entityType}` : "Audit Detail"}
                subtitle="Full change record"
                icon={<History className="size-4" />}
                maxWidth="md"
                actions={
                    <Button variant="outline" onClick={() => setSelectedLog(null)}>Close</Button>
                }
            >
                {selectedLog && (
                    <div className="flex flex-col gap-4 pb-1">
                        {selectedLog.flagged && (
                            <div className="flex items-start gap-2 rounded-lg border border-status-warning bg-status-warning p-3 text-sm text-status-warning-foreground">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                                <span>{selectedLog.flagReason || 'Flagged as anomalous activity.'}</span>
                            </div>
                        )}

                        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                            <div>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Review Status</p>
                                <Select value={selectedLog.reviewStatus} onValueChange={(v) => updateReviewStatus(v as AuditLog['reviewStatus'])} disabled={savingReview}>
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="UNREVIEWED">Unreviewed</SelectItem>
                                        <SelectItem value="IN_REVIEW">In Review</SelectItem>
                                        <SelectItem value="RESOLVED">Resolved</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reviewer</p>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm">{selectedLog.reviewer?.name || 'Unassigned'}</span>
                                    <Button variant="outline" size="sm" onClick={assignToMe} disabled={savingReview}>
                                        <UserCheck className="size-3.5" />
                                        Assign to me
                                    </Button>
                                </div>
                            </div>
                            <div className="sm:col-span-2 space-y-1.5">
                                <Label className="text-xs">Review note</Label>
                                <Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={2} placeholder="Findings, follow-up, or justification..." />
                                <Button size="sm" variant="outline" onClick={() => updateReviewStatus(selectedLog.reviewStatus)} disabled={savingReview}>
                                    {savingReview ? <Loader2 className="size-3.5 animate-spin" /> : 'Save note'}
                                </Button>
                            </div>
                            <div className="sm:col-span-2 flex flex-wrap items-center justify-between border-t pt-3">
                                <div>
                                    <p className="text-sm font-medium">Legal Hold</p>
                                    <p className="text-xs text-muted-foreground">Excludes this entry from the retention-policy purge job.</p>
                                </div>
                                <Button variant={selectedLog.legalHold ? 'secondary' : 'outline'} size="sm" onClick={toggleLegalHold} disabled={savingHold}>
                                    <Lock className="size-3.5" />
                                    {selectedLog.legalHold ? 'Remove Hold' : 'Apply Hold'}
                                </Button>
                            </div>
                        </div>

                        <div>
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Changes (Diff)
                            </p>
                            <pre className="max-w-full overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
                                {JSON.stringify(selectedLog.changes, null, 2)}
                            </pre>
                        </div>
                        <div>
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Metadata (IP/User Agent)
                            </p>
                            <pre className="max-w-full overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
                                {JSON.stringify(selectedLog.metadata, null, 2)}
                            </pre>
                        </div>

                        <div>
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comments</p>
                            {loadingComments ? (
                                <p className="text-sm text-muted-foreground">Loading...</p>
                            ) : comments.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No comments yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {comments.map((comment) => (
                                        <div key={comment.id} className="min-w-0 break-words rounded-lg border p-2.5 text-sm">
                                            <div className="mb-1 flex flex-wrap items-center justify-between text-xs text-muted-foreground">
                                                <span className="font-medium text-foreground">{comment.authorName || comment.authorEmail || 'Unknown'}</span>
                                                <span>{formatWorkspaceDateTime(comment.createdAt)}</span>
                                            </div>
                                            {comment.body}
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="mt-2 flex gap-2">
                                <Input
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="Add a comment..."
                                    onKeyDown={(e) => e.key === 'Enter' && postComment()}
                                />
                                <Button size="icon" onClick={postComment} disabled={postingComment || !newComment.trim()}>
                                    {postingComment ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </StandardDialog>
        </div>
    );
}
