'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, RefreshCw, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/layout/page-header';
import { ErrorState } from '@/components/common/error-state';
import { apiFetch } from '@/lib/api';
import { formatWorkspaceDateTime } from '@/lib/date-format';
import { cn } from '@/lib/utils';

interface MigrationStatusEntry {
    id: string;
    status: 'APPLIED' | 'FAILED' | 'PENDING';
    appliedAt: string | null;
    error: string | null;
}

interface MigrationStatusReport {
    entries: MigrationStatusEntry[];
    totals: { applied: number; pending: number; failed: number };
    schemaMigrationTableExists: boolean;
    schemaMdStale: boolean;
    newestMigrationFile: string | null;
}

const STATUS_CLASSNAMES: Record<string, string> = {
    APPLIED: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    PENDING: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    FAILED: 'border-destructive/30 bg-destructive/10 text-destructive',
};

export default function SchemaStatusPage() {
    const [report, setReport] = useState<MigrationStatusReport | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchStatus = async () => {
        setLoading(true);
        setReport(null);
        try {
            const data = await apiFetch<MigrationStatusReport>('/platform-admin/schema-status');
            setReport(data);
        } catch {
            // handled by empty state below
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, []);

    return (
        <div className="@container/schema min-w-0">
            <PageHeader title="Schema Status" description="Applied, pending and failed database migrations." actions={<Button variant="outline" onClick={fetchStatus} disabled={loading}><RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />Refresh</Button>} />
            {loading && <p role="status">Loading schema status...</p>}
            {!loading && !report && <ErrorState description="Schema status could not be loaded." onRetry={fetchStatus} />}

            {report && (
                <div className="space-y-4">
                    {!report.schemaMigrationTableExists && (
                        <Alert variant="destructive">
                            <XCircle />
                            <AlertDescription>
                                The SchemaMigration tracking table doesn&apos;t exist in this database yet -- run the migration script at least once.
                            </AlertDescription>
                        </Alert>
                    )}
                    {report.totals.failed > 0 && (
                        <Alert variant="destructive">
                            <XCircle />
                            <AlertDescription>{report.totals.failed} migration(s) failed on last apply -- see details below.</AlertDescription>
                        </Alert>
                    )}
                    {report.totals.pending > 0 && (
                        <Alert>
                            <AlertTriangle className="text-amber-600" />
                            <AlertDescription>{report.totals.pending} migration(s) have not been applied to this database.</AlertDescription>
                        </Alert>
                    )}
                    {report.schemaMdStale && (
                        <Alert>
                            <AlertTriangle className="text-amber-600" />
                            <AlertDescription>
                                SCHEMA.md looks stale -- {report.newestMigrationFile} was added after SCHEMA.md was last regenerated. Re-export it (see 01_SCHEMA_EXPORT_INSTRUCTIONS.md).
                            </AlertDescription>
                        </Alert>
                    )}
                    {report.totals.failed === 0 && report.totals.pending === 0 && !report.schemaMdStale && report.schemaMigrationTableExists && (
                        <Alert variant="info">
                            <CheckCircle2 className="text-emerald-600" />
                            <AlertDescription>All migrations applied and SCHEMA.md is up to date.</AlertDescription>
                        </Alert>
                    )}

                    <div className="grid gap-4 @min-[550px]/schema:grid-cols-3">
                        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{report.totals.applied}</div><div className="text-xs text-muted-foreground">Applied</div></CardContent></Card>
                        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-amber-600">{report.totals.pending}</div><div className="text-xs text-muted-foreground">Pending</div></CardContent></Card>
                        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-destructive">{report.totals.failed}</div><div className="text-xs text-muted-foreground">Failed</div></CardContent></Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Migration Files</CardTitle>
                            <CardDescription>{report.entries.length} tracked migration(s), newest first.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>File</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Applied At</TableHead>
                                        <TableHead>Error</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {[...report.entries].reverse().map((entry) => (
                                        <TableRow key={entry.id}>
                                            <TableCell className="font-mono text-xs">{entry.id}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn('border', STATUS_CLASSNAMES[entry.status])}>{entry.status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {entry.appliedAt ? formatWorkspaceDateTime(entry.appliedAt, { seconds: true }) : '-'}
                                            </TableCell>
                                            <TableCell className="whitespace-normal text-xs text-destructive">{entry.error || '-'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
