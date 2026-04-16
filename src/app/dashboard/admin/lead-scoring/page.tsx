'use client';

import React, { useEffect, useState } from 'react';
import {
    Box,
    Typography,
    Stack,
    Button,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Select,
    MenuItem as MuiMenuItem,
    FormControl,
    InputLabel,
    IconButton,
    Chip,
    Switch,
    FormControlLabel,
    Alert,
    Tooltip,
    CircularProgress,
    alpha,
} from '@mui/material';
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    AutoGraph as ScoreIcon,
    PlayArrow as RunIcon,
    TrendingUp as TrendIcon,
    TrendingDown as TrendDownIcon,
} from '@mui/icons-material';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

interface ScoringRule {
    id: string;
    name: string;
    description?: string;
    fieldKey: string;
    operator: string;
    value?: string;
    scoreChange: number;
    isActive: boolean;
    order: number;
}

const FIELD_OPTIONS = [
    { value: 'source', label: 'Lead Source' },
    { value: 'company', label: 'Company' },
    { value: 'status', label: 'Status' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'name', label: 'Name' },
];

const OPERATOR_OPTIONS = [
    { value: 'EQUALS', label: 'Equals', needsValue: true },
    { value: 'NOT_EQUALS', label: 'Does not equal', needsValue: true },
    { value: 'CONTAINS', label: 'Contains', needsValue: true },
    { value: 'GT', label: 'Greater than (numeric)', needsValue: true },
    { value: 'LT', label: 'Less than (numeric)', needsValue: true },
    { value: 'IS_SET', label: 'Is set (has any value)', needsValue: false },
    { value: 'IS_NOT_SET', label: 'Is not set (empty)', needsValue: false },
];

const EMPTY_RULE = {
    name: '',
    description: '',
    fieldKey: 'source',
    operator: 'EQUALS',
    value: '',
    scoreChange: 10,
    isActive: true,
    order: 0,
};

export default function LeadScoringAdminPage() {
    const [rules, setRules] = useState<ScoringRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<ScoringRule | null>(null);
    const [form, setForm] = useState<typeof EMPTY_RULE>({ ...EMPTY_RULE });
    const [saving, setSaving] = useState(false);
    const [recomputing, setRecomputing] = useState(false);

    const fetchRules = async () => {
        try {
            const data = await apiFetch<ScoringRule[]>('/lead-scoring/rules');
            setRules(Array.isArray(data) ? data : []);
        } catch {
            toast.error('Failed to load scoring rules');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchRules(); }, []);

    const handleAdd = () => {
        setEditingRule(null);
        setForm({ ...EMPTY_RULE });
        setDialogOpen(true);
    };

    const handleEdit = (rule: ScoringRule) => {
        setEditingRule(rule);
        setForm({
            name: rule.name,
            description: rule.description || '',
            fieldKey: rule.fieldKey,
            operator: rule.operator,
            value: rule.value || '',
            scoreChange: rule.scoreChange,
            isActive: rule.isActive,
            order: rule.order,
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            const payload = {
                ...form,
                value: form.value || undefined,
            };
            if (editingRule) {
                const updated = await apiFetch<ScoringRule>(`/lead-scoring/rules/${editingRule.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(payload),
                });
                setRules(prev => prev.map(r => r.id === editingRule.id ? updated : r));
                toast.success('Rule updated');
            } else {
                const created = await apiFetch<ScoringRule>('/lead-scoring/rules', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
                setRules(prev => [...prev, created]);
                toast.success('Rule created');
            }
            setDialogOpen(false);
        } catch {
            toast.error('Failed to save rule');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (ruleId: string) => {
        if (!confirm('Delete this scoring rule?')) return;
        try {
            await apiFetch(`/lead-scoring/rules/${ruleId}`, { method: 'DELETE' });
            setRules(prev => prev.filter(r => r.id !== ruleId));
            toast.success('Rule deleted');
        } catch {
            toast.error('Failed to delete rule');
        }
    };

    const handleToggle = async (rule: ScoringRule) => {
        try {
            const updated = await apiFetch<ScoringRule>(`/lead-scoring/rules/${rule.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ isActive: !rule.isActive }),
            });
            setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
        } catch {
            toast.error('Failed to toggle rule');
        }
    };

    const handleRecomputeAll = async () => {
        if (!confirm('Recompute scores for ALL leads? This may take a moment.')) return;
        setRecomputing(true);
        try {
            const result = await apiFetch<{ count: number }>('/lead-scoring/recompute-all', { method: 'POST' });
            toast.success(`Recomputed scores for ${result.count} leads`);
        } catch {
            toast.error('Recompute failed');
        } finally {
            setRecomputing(false);
        }
    };

    const needsValue = OPERATOR_OPTIONS.find(o => o.value === form.operator)?.needsValue ?? true;

    return (
        <Box>
            {/* Header */}
            <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                <Box>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <ScoreIcon sx={{ fontSize: 28, color: 'primary.main' }} />
                        <Box>
                            <Typography variant="h5" fontWeight={800}>Lead Scoring</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Define rules to automatically score leads based on their attributes.
                            </Typography>
                        </Box>
                    </Stack>
                </Box>
                <Stack direction="row" spacing={1}>
                    <Button
                        variant="outlined"
                        startIcon={recomputing ? <CircularProgress size={16} /> : <RunIcon />}
                        onClick={handleRecomputeAll}
                        disabled={recomputing}
                        sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                        Recompute All
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={handleAdd}
                        sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                    >
                        Add Rule
                    </Button>
                </Stack>
            </Stack>

            <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
                Rules are evaluated in order. The <strong>Score Change</strong> can be positive (add points) or negative (subtract points). Final score is clamped to <strong>0–100</strong>.
            </Alert>

            {/* Rules table */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <TableContainer component={Paper} sx={{ borderRadius: 3, overflow: 'hidden' }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                                <TableCell sx={{ fontWeight: 700 }}>Rule Name</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Condition</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Score Δ</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rules.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                                        No rules yet. Add one to start scoring leads automatically.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rules
                                    .sort((a, b) => a.order - b.order)
                                    .map(rule => (
                                        <TableRow
                                            key={rule.id}
                                            sx={{ opacity: rule.isActive ? 1 : 0.5, '&:hover': { bgcolor: 'action.hover' } }}
                                        >
                                            <TableCell>
                                                <Typography variant="body2" fontWeight={600}>{rule.name}</Typography>
                                                {rule.description && (
                                                    <Typography variant="caption" color="text.secondary">{rule.description}</Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                                    <strong>{rule.fieldKey}</strong>{' '}
                                                    {rule.operator.replace(/_/g, ' ').toLowerCase()}{' '}
                                                    {rule.value ? <em>"{rule.value}"</em> : ''}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    icon={rule.scoreChange >= 0 ? <TrendIcon /> : <TrendDownIcon />}
                                                    label={`${rule.scoreChange >= 0 ? '+' : ''}${rule.scoreChange}`}
                                                    size="small"
                                                    color={rule.scoreChange > 0 ? 'success' : rule.scoreChange < 0 ? 'error' : 'default'}
                                                    sx={{ fontWeight: 700 }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Switch
                                                    size="small"
                                                    checked={rule.isActive}
                                                    onChange={() => handleToggle(rule)}
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                <Stack direction="row" spacing={0.5}>
                                                    <Tooltip title="Edit">
                                                        <IconButton size="small" onClick={() => handleEdit(rule)}>
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Delete">
                                                        <IconButton size="small" color="error" onClick={() => handleDelete(rule.id)}>
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Add/Edit Dialog */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>
                    {editingRule ? 'Edit Scoring Rule' : 'New Scoring Rule'}
                </DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <TextField
                            label="Rule name *"
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            fullWidth
                            size="small"
                        />
                        <TextField
                            label="Description"
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            fullWidth
                            size="small"
                        />

                        <Typography variant="subtitle2" fontWeight={700} sx={{ pt: 1 }}>Condition</Typography>
                        <Stack direction="row" spacing={1.5}>
                            <FormControl size="small" sx={{ flex: 1 }}>
                                <InputLabel>Field</InputLabel>
                                <Select
                                    label="Field"
                                    value={form.fieldKey}
                                    onChange={e => setForm(f => ({ ...f, fieldKey: e.target.value }))}
                                >
                                    {FIELD_OPTIONS.map(o => (
                                        <MuiMenuItem key={o.value} value={o.value}>{o.label}</MuiMenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl size="small" sx={{ flex: 1.5 }}>
                                <InputLabel>Operator</InputLabel>
                                <Select
                                    label="Operator"
                                    value={form.operator}
                                    onChange={e => setForm(f => ({ ...f, operator: e.target.value }))}
                                >
                                    {OPERATOR_OPTIONS.map(o => (
                                        <MuiMenuItem key={o.value} value={o.value}>{o.label}</MuiMenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Stack>
                        {needsValue && (
                            <TextField
                                label="Value"
                                value={form.value}
                                onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                                fullWidth
                                size="small"
                                placeholder='e.g. "Website" or "50"'
                            />
                        )}

                        <Typography variant="subtitle2" fontWeight={700} sx={{ pt: 1 }}>Score Impact</Typography>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <TextField
                                label="Score change"
                                type="number"
                                value={form.scoreChange}
                                onChange={e => setForm(f => ({ ...f, scoreChange: parseInt(e.target.value) || 0 }))}
                                size="small"
                                sx={{ width: 160 }}
                                helperText="Positive = add, negative = subtract"
                            />
                            <TextField
                                label="Order"
                                type="number"
                                value={form.order}
                                onChange={e => setForm(f => ({ ...f, order: parseInt(e.target.value) || 0 }))}
                                size="small"
                                sx={{ width: 100 }}
                                helperText="Lower = first"
                            />
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={form.isActive}
                                        onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                                    />
                                }
                                label="Active"
                            />
                        </Stack>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ pb: 2, px: 3 }}>
                    <Button onClick={() => setDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={handleSave}
                        disabled={!form.name.trim() || saving}
                        sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                    >
                        {saving ? <CircularProgress size={16} /> : editingRule ? 'Update Rule' : 'Create Rule'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
