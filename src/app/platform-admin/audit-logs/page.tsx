'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { FileText, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatWorkspaceDateTime } from '@/lib/date-format';

interface AuditLog {
    id: string;
    userId: string;
    action: string;
    entityType: string | null;
    entityId: string | null;
    changes: any;
    metadata: any;
    createdAt: string;
    user: {
        id: string;
        name: string;
        email: string;
    } | null;
    tenant: {
        id: string;
        name: string;
    } | null;
}

export default function AuditLogsPage() {
    const requestVersion = useRef(0);
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    // Filters
    const [actionFilter, setActionFilter] = useState('');
    const [entityTypeFilter, setEntityTypeFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const fetchLogs = async () => {
        const version = ++requestVersion.current;
        setLoading(true);
        setError(null);
        try {
            const queryParams = new URLSearchParams({
                page: page.toString(),
                limit: '50',
            });

            if (actionFilter) queryParams.append('action', actionFilter);
            if (entityTypeFilter) queryParams.append('entityType', entityTypeFilter);

            const response = await apiFetch(`/audit-logs?${queryParams.toString()}`);

            if (version !== requestVersion.current) return;
            setLogs(response.data || []);
            setTotal(response.pagination.total);
            setTotalPages(response.pagination.totalPages);
        } catch (err: any) {
            if (version !== requestVersion.current) return;
            setError(err.message || 'Failed to load audit logs');
            console.error('Audit logs fetch error:', err);
        } finally {
            if (version === requestVersion.current) setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [page, actionFilter, entityTypeFilter]);


    const search = searchQuery.trim().toLowerCase();
    const visibleLogs = logs.filter((log) => !search || [log.user?.name, log.user?.email, log.entityType, log.entityId].some((value) => String(value ?? "").toLowerCase().includes(search)));

    const formatChanges = (changes: any) => {
        if (!changes) return 'N/A';
        if (typeof changes === 'string') return changes;
        return JSON.stringify(changes, null, 2);
    };

    return (
        <div className="@container/audit min-w-0 space-y-6">
            <div className="flex min-w-0 flex-wrap items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Audit Logs</h1>
                    <p className="text-muted-foreground mt-1">
                        View system activity and changes
                    </p>
                </div>
                <FileText className="h-8 w-8 text-muted-foreground" />
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle>Filters</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 @min-[750px]/audit:grid-cols-3 gap-4">
                        <div>
                            <label className="text-sm font-medium mb-2 block">Action</label>
                            <Select value={actionFilter || "__all__"} onValueChange={(value) => { setActionFilter(value === "__all__" ? "" : value); setPage(1); }}>
                                <SelectTrigger aria-label="Action filter" className="w-full">
                                    <SelectValue placeholder="All actions" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">All actions</SelectItem>
                                    <SelectItem value="CREATE">Create</SelectItem>
                                    <SelectItem value="UPDATE">Update</SelectItem>
                                    <SelectItem value="DELETE">Delete</SelectItem>
                                    <SelectItem value="LOGIN">Login</SelectItem>
                                    <SelectItem value="LOGOUT">Logout</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-2 block">Entity Type</label>
                            <Select value={entityTypeFilter || "__all__"} onValueChange={(value) => { setEntityTypeFilter(value === "__all__" ? "" : value); setPage(1); }}>
                                <SelectTrigger aria-label="Entity type filter" className="w-full">
                                    <SelectValue placeholder="All types" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">All types</SelectItem>
                                    <SelectItem value="LEAD">Lead</SelectItem>
                                    <SelectItem value="OPPORTUNITY">Opportunity</SelectItem>
                                    <SelectItem value="ACTIVITY">Activity</SelectItem>
                                    <SelectItem value="USER">User</SelectItem>
                                    <SelectItem value="ROLE">Role</SelectItem>
                                    <SelectItem value="FORM">Form</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-2 block">Search current page</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    aria-label="Search current page" placeholder="Search this page by user or entity..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Table */}
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-8 text-center text-muted-foreground">
                            Loading audit logs...
                        </div>
                    ) : error ? (
                        <div className="p-8 text-center">
                            <p className="text-destructive mb-4">{error}</p>
                            <Button onClick={fetchLogs}>Try Again</Button>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            No audit logs found
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Timestamp</TableHead>
                                            <TableHead>User</TableHead>
                                            <TableHead>Tenant</TableHead>
                                            <TableHead>Action</TableHead>
                                            <TableHead>Entity Type</TableHead>
                                            <TableHead>Record</TableHead>
                                            <TableHead>Changes</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {visibleLogs.length === 0 && <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No matching logs on this page.</TableCell></TableRow>}
                                        {visibleLogs.map((log) => (
                                            <TableRow key={log.id}>
                                                <TableCell className="whitespace-nowrap">
                                                    {formatWorkspaceDateTime(log.createdAt, { seconds: true })}
                                                </TableCell>
                                                <TableCell>
                                                    <div>
                                                        <div className="font-medium">{log.user?.name || "Unknown user"}</div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {log.user?.email || "—"}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {log.tenant ? (
                                                        <span className="text-sm">{log.tenant.name}</span>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">Platform</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant={
                                                            log.action === 'DELETE' ? 'destructive' :
                                                                log.action === 'LOGIN' ? 'secondary' :
                                                                    log.action === 'CREATE' || log.action === 'UPDATE' ? 'default' : 'outline'
                                                        }
                                                    >
                                                        {log.action}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>{log.entityType || 'N/A'}</TableCell>
                                                <TableCell>
                                                    {log.entityId ? "Linked record" : 'N/A'}
                                                </TableCell>
                                                <TableCell>
                                                    {log.changes ? (
                                                        <details className="max-w-xs">
                                                            <summary className="cursor-pointer text-xs text-status-info-foreground hover:underline">
                                                                View changes
                                                            </summary>
                                                            <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">
                                                                {formatChanges(log.changes)}
                                                            </pre>
                                                        </details>
                                                    ) : (
                                                        'N/A'
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Pagination */}
                            <div className="flex min-w-0 flex-wrap items-center justify-between px-6 py-4 border-t">
                                <div className="text-sm text-muted-foreground">
                                    Showing {visibleLogs.length} of {total} audit logs
                                </div>
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                        Previous
                                    </Button>
                                    <span className="text-sm">
                                        Page {page} of {totalPages}
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                    >
                                        Next
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
