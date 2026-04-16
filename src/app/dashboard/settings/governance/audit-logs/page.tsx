'use client';

import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Card,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    IconButton,
    TextField,
    Stack,
    Button,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Pagination,
    alpha
} from '@mui/material';
import {
    History as HistoryIcon,
    Search as SearchIcon,
    Visibility as ViewIcon,
    FilterList as FilterIcon
} from '@mui/icons-material';
import { apiFetch } from '@/lib/api';
import { format } from 'date-fns';

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

export default function AuditLogPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
    const [filters, setFilters] = useState({ entityType: '', action: '' });

    useEffect(() => {
        fetchLogs();
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

    const getActionColor = (action: string) => {
        switch (action) {
            case 'CREATE': return 'success';
            case 'UPDATE': return 'info';
            case 'DELETE': return 'error';
            default: return 'default';
        }
    };

    return (
        <Box sx={{ p: 4 }}>
            <Typography variant="h4" fontWeight="bold" gutterBottom>
                Audit logs
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 4 }}>
                Trace every action across your tenant for security and compliance.
            </Typography>

            <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
                <TextField
                    size="small"
                    placeholder="Filter by Entity (e.g. LEAD)"
                    value={filters.entityType}
                    onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
                />
                <TextField
                    size="small"
                    placeholder="Filter by Action (e.g. UPDATE)"
                    value={filters.action}
                    onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                />
                <Button startIcon={<SearchIcon />} variant="outlined">Search</Button>
            </Stack>

            <TableContainer component={Paper} variant="outlined">
                <Table>
                    <TableHead sx={{ bgcolor: (theme) => alpha(theme.palette.primary.main, 0.05) }}>
                        <TableRow>
                            <TableCell>Timestamp</TableCell>
                            <TableCell>User</TableCell>
                            <TableCell>Action</TableCell>
                            <TableCell>Entity</TableCell>
                            <TableCell>Details</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={5} align="center"><CircularProgress sx={{ my: 4 }} /></TableCell></TableRow>
                        ) : logs.length === 0 ? (
                            <TableRow><TableCell colSpan={5} align="center">No audit logs found.</TableCell></TableRow>
                        ) : logs.map((log) => (
                            <TableRow key={log.id} hover onClick={() => setSelectedLog(log)} sx={{ cursor: 'pointer' }}>
                                <TableCell>{format(new Date(log.createdAt), 'MMM d, HH:mm:ss')}</TableCell>
                                <TableCell>
                                    <Typography variant="body2">{log.user.name}</Typography>
                                    <Typography variant="caption" color="text.secondary">{log.user.email}</Typography>
                                </TableCell>
                                <TableCell>
                                    <Chip label={log.action} size="small" color={getActionColor(log.action) as any} variant="outlined" />
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2">{log.entityType}</Typography>
                                    <Typography variant="caption" color="text.secondary">{log.entityId}</Typography>
                                </TableCell>
                                <TableCell>
                                    <IconButton size="small"><ViewIcon fontSize="small" /></IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Detail Dialog */}
            <Dialog open={!!selectedLog} onClose={() => setSelectedLog(null)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <HistoryIcon /> Audit Detail: {selectedLog?.action} {selectedLog?.entityType}
                </DialogTitle>
                <DialogContent>
                    {selectedLog && (
                        <Stack spacing={3} sx={{ mt: 1 }}>
                            <Box>
                                <Typography variant="overline" color="text.secondary">Changes (Diff)</Typography>
                                <Paper variant="outlined" sx={{ p: 2, bgcolor: (theme) => alpha(theme.palette.common.black, 0.02), fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                    <pre>{JSON.stringify(selectedLog.changes, null, 2)}</pre>
                                </Paper>
                            </Box>
                            <Box>
                                <Typography variant="overline" color="text.secondary">Metadata (IP/User Agent)</Typography>
                                <Paper variant="outlined" sx={{ p: 2, bgcolor: (theme) => alpha(theme.palette.common.black, 0.02), fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                    <pre>{JSON.stringify(selectedLog.metadata, null, 2)}</pre>
                                </Paper>
                            </Box>
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSelectedLog(null)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
