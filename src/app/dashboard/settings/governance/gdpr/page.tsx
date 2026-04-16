'use client';

import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    Stack,
    TextField,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormControl,
    FormLabel,
    RadioGroup,
    FormControlLabel,
    Radio,
    Divider,
    alpha
} from '@mui/material';
import {
    Security as SecurityIcon,
    Add as AddIcon,
    GetApp as ExportIcon,
    DeleteForever as DeleteIcon,
    Info as InfoIcon
} from '@mui/icons-material';
import { apiFetch } from '@/lib/api';
import { format } from 'date-fns';
import { toast } from 'sonner';

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
    const [isAdding, setIsAdding] = useState(false);
    const [newRequest, setNewRequest] = useState({ contactEmail: '', type: 'EXPORT' });

    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const data = await apiFetch('/governance/gdpr/requests');
            setRequests(data || []);
        } catch (err) {
            console.error('Failed to fetch GDPR requests', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateRequest = async () => {
        if (!newRequest.contactEmail) return toast.error('Email is required');

        try {
            const created = await apiFetch('/governance/gdpr/request', {
                method: 'POST',
                body: JSON.stringify(newRequest),
            });
            setRequests([created, ...requests]);
            setIsAdding(false);
            setNewRequest({ contactEmail: '', type: 'EXPORT' });
            toast.success('GDPR request initiated');
        } catch (err) {
            toast.error('Failed to create request');
        }
    };

    return (
        <Box sx={{ p: 4 }}>
            <Typography variant="h4" fontWeight="bold" gutterBottom>
                GDPR & Data Privacy
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 4 }}>
                Manage Subject Access Requests (SARs) and "Right to be Forgotten" mandates.
            </Typography>

            <Stack spacing={4}>
                <Alert severity="info" icon={<SecurityIcon />}>
                    Initiating a "DELETE" request will permanently purge all leads, opportunities, and activities associated with that email across your entire tenant.
                </Alert>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6">Request History</Typography>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setIsAdding(true)}
                    >
                        New Request
                    </Button>
                </Box>

                <TableContainer component={Paper} variant="outlined">
                    <Table>
                        <TableHead sx={{ bgcolor: (theme) => alpha(theme.palette.primary.main, 0.05) }}>
                            <TableRow>
                                <TableCell>Date</TableCell>
                                <TableCell>Contact Email</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {requests.length === 0 ? (
                                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}>No privacy requests found.</TableCell></TableRow>
                            ) : requests.map((req) => (
                                <TableRow key={req.id}>
                                    <TableCell>{format(new Date(req.createdAt), 'MMM d, yyyy')}</TableCell>
                                    <TableCell>{req.contactEmail}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={req.type}
                                            size="small"
                                            variant="outlined"
                                            icon={req.type === 'EXPORT' ? <ExportIcon /> : <DeleteIcon />}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={req.status}
                                            size="small"
                                            color={req.status === 'COMPLETED' ? 'success' : 'warning'}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {req.status === 'COMPLETED' && req.type === 'EXPORT' && (
                                            <Button size="small" startIcon={<ExportIcon />}>Download</Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Stack>

            <Dialog open={isAdding} onClose={() => setIsAdding(false)} maxWidth="sm" fullWidth>
                <DialogTitle>New Privacy Request</DialogTitle>
                <DialogContent>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            Enter the email of the person making the request. We will search all modules for matching records.
                        </Typography>
                        <TextField
                            label="Contact Email"
                            fullWidth
                            value={newRequest.contactEmail}
                            onChange={(e) => setNewRequest({ ...newRequest, contactEmail: e.target.value })}
                            placeholder="customer@example.com"
                        />
                        <Divider />
                        <FormControl>
                            <FormLabel>Request Type</FormLabel>
                            <RadioGroup
                                value={newRequest.type}
                                onChange={(e) => setNewRequest({ ...newRequest, type: e.target.value })}
                            >
                                <FormControlLabel value="EXPORT" control={<Radio />} label="Data Export (Subject Access Request)" />
                                <FormControlLabel value="DELETE" control={<Radio />} label="Data Deletion (Right to be Forgotten)" />
                            </RadioGroup>
                        </FormControl>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsAdding(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleCreateRequest}>Initiate Request</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
