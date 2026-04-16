
import { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Box, Typography, IconButton, Stack,
    Select, MenuItem, TextField, FormControl, InputLabel, alpha, useTheme
} from '@mui/material';
import { Close as CloseIcon, Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { StandardDialog } from '@/components/common/standard-dialog';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

export interface FilterCondition {
    id: string;
    field: string;
    operator: string;
    value: any;
}

export interface FilterGroup {
    id: string;
    logic: 'AND' | 'OR';
    conditions: FilterCondition[];
}

interface AdvancedFilterModalProps {
    open: boolean;
    onClose: () => void;
    fields: { label: string; key: string; type: string; options?: { label: string; value: string }[] }[];
    onApply: (filters: FilterGroup[]) => void;
}

export function AdvancedFilterModal({ open, onClose, fields, onApply }: AdvancedFilterModalProps) {
    const theme = useTheme();
    const [groups, setGroups] = useState<FilterGroup[]>([
        { id: 'g1', logic: 'AND', conditions: [{ id: 'c1', field: '', operator: 'equals', value: '' }] }
    ]);

    const handleAddCondition = (groupId: string) => {
        setGroups(prev => prev.map(g => {
            if (g.id === groupId) {
                return {
                    ...g,
                    conditions: [...g.conditions, { id: `c-${Date.now()}`, field: '', operator: 'equals', value: '' }]
                };
            }
            return g;
        }));
    };

    const handleRemoveCondition = (groupId: string, conditionId: string) => {
        setGroups(prev => prev.map(g => {
            if (g.id === groupId) {
                return { ...g, conditions: g.conditions.filter(c => c.id !== conditionId) };
            }
            return g;
        }));
    };

    const handleUpdateCondition = (groupId: string, conditionId: string, updates: Partial<FilterCondition>) => {
        setGroups(prev => prev.map(g => {
            if (g.id === groupId) {
                return {
                    ...g,
                    conditions: g.conditions.map(c => c.id === conditionId ? { ...c, ...updates } : c)
                };
            }
            return g;
        }));
    };

    return (
        <StandardDialog
            open={open}
            onClose={onClose}
            title="Advanced Filters"
            subtitle="Build complex queries with AND/OR logic"
            maxWidth="md"
            actions={
                <>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button variant="contained" onClick={() => { onApply(groups); onClose(); }}>Apply Filters</Button>
                </>
            }
        >
            <Stack spacing={3}>
                {groups.map((group, gIndex) => (
                    <Box key={group.id} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: alpha(theme.palette.background.paper, 0.5) }}>
                        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" fontWeight={700}>Group {gIndex + 1}</Typography>
                            <Select
                                value={group.logic}
                                size="small"
                                onChange={(e) => setGroups(prev => prev.map(g => g.id === group.id ? { ...g, logic: e.target.value as any } : g))}
                                sx={{ minWidth: 100 }}
                            >
                                <MenuItem value="AND">Match ALL (AND)</MenuItem>
                                <MenuItem value="OR">Match ANY (OR)</MenuItem>
                            </Select>
                        </Stack>

                        <Stack spacing={2}>
                            {group.conditions.map((condition) => (
                                <Stack key={condition.id} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center">
                                    <FormControl size="small" sx={{ minWidth: 150, flex: 1 }}>
                                        <InputLabel>Field</InputLabel>
                                        <Select
                                            value={condition.field}
                                            label="Field"
                                            onChange={(e) => handleUpdateCondition(group.id, condition.id, { field: e.target.value })}
                                        >
                                            {fields.map(f => <MenuItem key={f.key} value={f.key}>{f.label}</MenuItem>)}
                                        </Select>
                                    </FormControl>

                                    <FormControl size="small" sx={{ minWidth: 120 }}>
                                        <InputLabel>Operator</InputLabel>
                                        <Select
                                            value={condition.operator}
                                            label="Operator"
                                            onChange={(e) => handleUpdateCondition(group.id, condition.id, { operator: e.target.value })}
                                        >
                                            <MenuItem value="equals">Is</MenuItem>
                                            <MenuItem value="not_equals">Is not</MenuItem>
                                            <MenuItem value="contains">Contains</MenuItem>
                                            <MenuItem value="greater_than">Greater than</MenuItem>
                                            <MenuItem value="less_than">Less than</MenuItem>
                                        </Select>
                                    </FormControl>

                                    <TextField
                                        size="small"
                                        placeholder="Value"
                                        value={condition.value}
                                        onChange={(e) => handleUpdateCondition(group.id, condition.id, { value: e.target.value })}
                                        sx={{ flex: 1 }}
                                    />

                                    <IconButton size="small" color="error" onClick={() => handleRemoveCondition(group.id, condition.id)}>
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </Stack>
                            ))}
                            <Button startIcon={<AddIcon />} size="small" onClick={() => handleAddCondition(group.id)}>
                                Add Condition
                            </Button>
                        </Stack>
                    </Box>
                ))}
            </Stack>
        </StandardDialog>
    );
}

