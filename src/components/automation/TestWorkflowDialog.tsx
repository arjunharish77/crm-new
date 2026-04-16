'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Button,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Box,
    Typography,
    Paper,
    Chip,
    Stack,
    CircularProgress,
    IconButton,
    Alert,
    AlertTitle,
    Divider
} from '@mui/material';
import {
    PlayArrow as PlayIcon,
    CheckCircle as CheckIcon,
    Error as ErrorIcon,
    Warning as WarningIcon,
    Close as CloseIcon,
    Science as ScienceIcon
} from '@mui/icons-material';
import { apiFetch } from '@/lib/api';

interface TestDialogProps {
    open: boolean;
    onClose: () => void;
    automationId: string;
    automationName: string;
}

export function TestWorkflowDialog({ open, onClose, automationId, automationName }: TestDialogProps) {
    const [entityType, setEntityType] = useState<'LEAD' | 'OPPORTUNITY'>('LEAD');
    const [entityId, setEntityId] = useState('');
    const [testing, setTesting] = useState(false);
    const [testResults, setTestResults] = useState<any>(null);

    const runTest = async () => {
        if (!entityId) {
            // Toast or alert handled by UI validation usually, but we'll just return here
            return;
        }

        setTesting(true);
        setTestResults(null);

        try {
            const data = await apiFetch(`/automation-v2/${automationId}/test`, {
                method: 'POST',
                body: JSON.stringify({
                    entityType,
                    entityId,
                }),
            });
            setTestResults(data);
        } catch (error: any) {
            setTestResults({
                success: false,
                error: error.message || 'Failed to run test',
                log: [],
            });
        } finally {
            setTesting(false);
        }
    };

    const handleClose = () => {
        onClose();
        setTestResults(null);
        setEntityId('');
    };

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="md"
            fullWidth
            PaperProps={{ sx: { borderRadius: 3 } }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
                <Box display="flex" alignItems="center" gap={1}>
                    <ScienceIcon color="primary" />
                    <Box>
                        <Typography variant="h6">Test Workflow</Typography>
                        <Typography variant="body2" color="text.secondary">{automationName}</Typography>
                    </Box>
                </Box>
                <IconButton onClick={handleClose} size="small">
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent dividers>
                <DialogContentText sx={{ mb: 3 }}>
                    Run a test execution without making any actual changes (dry run).
                </DialogContentText>

                <Paper variant="outlined" sx={{ p: 3, mb: 3, borderRadius: 2, bgcolor: 'background.default' }}>
                    <Stack spacing={2}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Entity Type</InputLabel>
                            <Select
                                value={entityType}
                                label="Entity Type"
                                onChange={(e) => setEntityType(e.target.value as any)}
                            >
                                <MenuItem value="LEAD">Lead</MenuItem>
                                <MenuItem value="OPPORTUNITY">Opportunity</MenuItem>
                            </Select>
                        </FormControl>
                        <TextField
                            label="Entity ID"
                            placeholder="Enter lead or opportunity ID"
                            fullWidth
                            size="small"
                            value={entityId}
                            onChange={(e) => setEntityId(e.target.value)}
                            helperText="The ID of the record you want to test against"
                        />
                        <Button
                            variant="contained"
                            onClick={runTest}
                            disabled={testing || !entityId}
                            startIcon={testing ? <CircularProgress size={20} color="inherit" /> : <PlayIcon />}
                        >
                            {testing ? 'Running Test...' : 'Run Test'}
                        </Button>
                    </Stack>
                </Paper>

                {testResults && (
                    <Box sx={{ animation: 'fadeIn 0.3s ease-in' }}>
                        <Divider sx={{ mb: 3 }}>
                            <Chip label="Test Results" size="small" />
                        </Divider>

                        <Alert
                            severity={testResults.success ? "success" : "error"}
                            icon={testResults.success ? <CheckIcon fontSize="inherit" /> : <ErrorIcon fontSize="inherit" />}
                            sx={{ mb: 3, borderRadius: 2 }}
                        >
                            <AlertTitle>{testResults.success ? "Test Passed" : "Test Failed"}</AlertTitle>
                            {testResults.error || "Workflow execution simulation completed successfully."}
                        </Alert>

                        {testResults.log && testResults.log.length > 0 && (
                            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                                <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
                                    <Typography variant="subtitle2">Execution Log</Typography>
                                </Box>
                                <Box sx={{ maxHeight: 300, overflowY: 'auto', p: 0 }}>
                                    {testResults.log.map((entry: any, idx: number) => (
                                        <Box
                                            key={idx}
                                            sx={{
                                                p: 1.5,
                                                borderBottom: idx < testResults.log.length - 1 ? 1 : 0,
                                                borderColor: 'divider',
                                                display: 'flex',
                                                gap: 2
                                            }}
                                        >
                                            <Box sx={{ mt: 0.5 }}>
                                                {entry.status === 'TEST_SUCCESS' ? (
                                                    <CheckIcon color="success" fontSize="small" />
                                                ) : entry.status === 'UNKNOWN' ? (
                                                    <WarningIcon color="warning" fontSize="small" />
                                                ) : (
                                                    <ErrorIcon color="error" fontSize="small" />
                                                )}
                                            </Box>
                                            <Box>
                                                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                                                    {entry.type}
                                                </Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                    {entry.action || entry.node}
                                                </Typography>
                                                {entry.result !== undefined && (
                                                    <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block', mt: 0.5, color: 'text.secondary' }}>
                                                        Result: {String(entry.result)}
                                                    </Typography>
                                                )}
                                            </Box>
                                        </Box>
                                    ))}
                                </Box>
                            </Paper>
                        )}

                        <Alert severity="info" sx={{ mt: 3, borderRadius: 2 }}>
                            This was a test run. No actual changes were made to your data.
                        </Alert>
                    </Box>
                )}
            </DialogContent>
        </Dialog>
    );
}
