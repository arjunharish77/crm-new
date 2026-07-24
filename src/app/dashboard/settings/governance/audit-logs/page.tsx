'use client';

import React, { useState, useEffect } from 'react';
import { History, Search, Eye } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatWorkspaceDateTime } from '@/lib/date-format';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import { TableSkeleton } from '@/components/common/skeletons';
import { EmptyState } from '@/components/common/empty-state';
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
}

const ACTION_CLASSNAMES: Record<string, string> = {
    CREATE: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    UPDATE: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
    DELETE: 'border-destructive/30 bg-destructive/10 text-destructive',
};

export default function AuditLogPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
    const [filters, setFilters] = useState({ entityType: '', action: '' });

    useEffect(() => {
        fetchLogs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const data = await apiFetch(`/governance/audit-logs?entityType=${filters.entityType}&action=${filters.action}`);
            setLogs(data || []);
        } catch (err) {
            console.error('Failed to fetch audit logs', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8">
            <h1 className="text-lg font-bold">Audit logs</h1>
            <p className="mb-4 text-muted-foreground">
                Trace every action across your tenant for security and compliance.
            </p>

            <div className="mb-6 flex flex-wrap gap-2">
                <Input
                    className="w-64"
                    placeholder="Filter by Entity (e.g. LEAD)"
                    value={filters.entityType}
                    onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
                />
                <Input
                    className="w-64"
                    placeholder="Filter by Action (e.g. UPDATE)"
                    value={filters.action}
                    onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                />
                <Button variant="outline" onClick={fetchLogs}>
                    <Search className="size-4" />
                    Search
                </Button>
            </div>

            {loading ? (
                <TableSkeleton rows={8} columns={5} hasToolbar={false} />
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
                        <div>
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Changes (Diff)
                            </p>
                            <pre className="overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
                                {JSON.stringify(selectedLog.changes, null, 2)}
                            </pre>
                        </div>
                        <div>
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Metadata (IP/User Agent)
                            </p>
                            <pre className="overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
                                {JSON.stringify(selectedLog.metadata, null, 2)}
                            </pre>
                        </div>
                    </div>
                )}
            </StandardDialog>
        </div>
    );
}
