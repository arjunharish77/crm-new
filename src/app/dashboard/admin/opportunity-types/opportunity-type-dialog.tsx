'use client';

import { useState, useEffect } from 'react';
import {
    Box,
    TextField,
    Button,
    Grid,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    FormHelperText,
    Typography,
    Divider,
    Stack,
    Paper,
    Chip
} from '@mui/material';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { OpportunityType, CreateOpportunityTypeDto } from '@/types/opportunity-types';
import { IconPicker } from '@/components/ui/icon-picker';
import { ColorPicker } from '@/components/ui/color-picker';
import { StandardDialog } from '@/components/common/standard-dialog';

interface OpportunityTypeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    opportunityType?: OpportunityType | null;
    onSuccess: () => void;
}

interface Pipeline {
    id: string;
    name: string;
    stages: Stage[];
}

interface Stage {
    id: string;
    name: string;
    pipelineId: string;
}

export function OpportunityTypeDialog({
    open,
    onOpenChange,
    opportunityType,
    onSuccess,
}: OpportunityTypeDialogProps) {
    const [formData, setFormData] = useState<CreateOpportunityTypeDto>({
        name: '',
        description: '',
        icon: '',
        color: '#3b82f6',
        defaultPipelineId: '',
        defaultStageId: '',
    });
    const [pipelines, setPipelines] = useState<Pipeline[]>([]);
    const [filteredStages, setFilteredStages] = useState<Stage[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) {
            fetchPipelines();
            if (opportunityType) {
                setFormData({
                    name: opportunityType.name,
                    description: opportunityType.description || '',
                    icon: opportunityType.icon || '',
                    color: opportunityType.color || '#3b82f6',
                    defaultPipelineId: opportunityType.defaultPipelineId || '',
                    defaultStageId: opportunityType.defaultStageId || '',
                });
            } else {
                setFormData({
                    name: '',
                    description: '',
                    icon: '',
                    color: '#3b82f6',
                    defaultPipelineId: '',
                    defaultStageId: '',
                });
            }
        }
    }, [open, opportunityType]);

    useEffect(() => {
        if (formData.defaultPipelineId) {
            const pipeline = pipelines.find(p => p.id === formData.defaultPipelineId);
            setFilteredStages(pipeline?.stages || []);
            // Reset stage if it doesn't belong to selected pipeline
            if (formData.defaultStageId) {
                const stageExists = pipeline?.stages.some(s => s.id === formData.defaultStageId);
                if (!stageExists) {
                    setFormData(prev => ({ ...prev, defaultStageId: '' }));
                }
            }
        } else {
            setFilteredStages([]);
        }
    }, [formData.defaultPipelineId, pipelines]);

    const fetchPipelines = async () => {
        try {
            const data = await apiFetch('/pipelines');
            setPipelines(data);
        } catch (error) {
            toast.error('Failed to fetch pipelines');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            toast.error('Name is required');
            return;
        }

        setLoading(true);
        try {
            const url = opportunityType
                ? `/opportunity-types/${opportunityType.id}`
                : '/opportunity-types';
            const method = opportunityType ? 'PATCH' : 'POST';

            await apiFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            toast.success(
                opportunityType
                    ? 'Opportunity type updated'
                    : 'Opportunity type created'
            );
            onSuccess();
        } catch (error: any) {
            toast.error(error.message || 'Failed to save opportunity type');
        } finally {
            setLoading(false);
        }
    };

    return (
        <StandardDialog
            open={open}
            onClose={() => onOpenChange(false)}
            title={opportunityType ? 'Edit Opportunity Type' : 'Create Opportunity Type'}
            maxWidth="sm"
            actions={
                <>
                    <Button onClick={() => onOpenChange(false)} disabled={loading}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleSubmit}
                        disabled={loading}
                    >
                        {loading ? 'Saving...' : opportunityType ? 'Update' : 'Create'}
                    </Button>
                </>
            }
        >
            <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
                <Grid container spacing={3}>
                    {/* Name */}
                    <Grid size={{ xs: 12 }}>
                        <TextField
                            id="name"
                            label="Name"
                            fullWidth
                            required
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g., Admission, Partnership"
                        />
                    </Grid>

                    {/* Description */}
                    <Grid size={{ xs: 12 }}>
                        <TextField
                            id="description"
                            label="Description"
                            fullWidth
                            multiline
                            rows={3}
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Brief description of this opportunity type"
                        />
                    </Grid>

                    {/* Icon & Color */}
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Icon</Typography>
                            <IconPicker
                                value={formData.icon || ''}
                                onChange={(icon) => setFormData({ ...formData, icon })}
                            />
                        </Box>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Color</Typography>
                            <ColorPicker
                                value={formData.color || '#3b82f6'}
                                onChange={(color) => setFormData({ ...formData, color })}
                            />
                        </Box>
                    </Grid>

                    <Grid size={{ xs: 12 }}>
                        <Divider />
                    </Grid>

                    {/* Pipeline */}
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <FormControl fullWidth>
                            <InputLabel id="pipeline-label">Default Pipeline</InputLabel>
                            <Select
                                labelId="pipeline-label"
                                label="Default Pipeline"
                                value={formData.defaultPipelineId}
                                onChange={(e) => setFormData({ ...formData, defaultPipelineId: e.target.value as string })}
                            >
                                <MenuItem value=""><em>None</em></MenuItem>
                                {pipelines.map((pipeline) => (
                                    <MenuItem key={pipeline.id} value={pipeline.id}>
                                        {pipeline.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>

                    {/* Stage */}
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <FormControl fullWidth disabled={!formData.defaultPipelineId}>
                            <InputLabel id="stage-label">Default Stage</InputLabel>
                            <Select
                                labelId="stage-label"
                                label="Default Stage"
                                value={formData.defaultStageId}
                                onChange={(e) => setFormData({ ...formData, defaultStageId: e.target.value as string })}
                            >
                                <MenuItem value=""><em>None</em></MenuItem>
                                {filteredStages.map((stage) => (
                                    <MenuItem key={stage.id} value={stage.id}>
                                        {stage.name}
                                    </MenuItem>
                                ))}
                            </Select>
                            {!formData.defaultPipelineId && (
                                <FormHelperText>Select a pipeline first</FormHelperText>
                            )}
                        </FormControl>
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                        <Divider sx={{ my: 1 }}>
                            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>
                                Stage Engine Rules
                            </Typography>
                        </Divider>
                    </Grid>

                    {!formData.defaultPipelineId ? (
                        <Grid size={{ xs: 12 }}>
                            <Box sx={{ p: 2, textAlign: 'center', bgcolor: 'surfaceContainerLowest', borderRadius: 2, border: '1px dashed', borderColor: 'divider' }}>
                                <Typography variant="body2" color="text.secondary">
                                    Select a default pipeline to configure stage-specific rules.
                                </Typography>
                            </Box>
                        </Grid>
                    ) : (
                        <Grid size={{ xs: 12 }}>
                            <Stack spacing={2}>
                                {filteredStages.map((stage) => (
                                    <Paper key={stage.id} elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider', bgcolor: 'surfaceContainerLowest' }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: (stage as any).color || 'primary.main' }} />
                                            {stage.name}
                                        </Typography>

                                        <Grid container spacing={2}>
                                            <Grid size={{ xs: 12, sm: 4 }}>
                                                <TextField
                                                    label="Prob. (%)"
                                                    type="number"
                                                    fullWidth
                                                    size="small"
                                                    value={formData.stageConfig?.[stage.id]?.probability ?? ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            stageConfig: {
                                                                ...prev.stageConfig,
                                                                [stage.id]: { ...prev.stageConfig?.[stage.id], probability: val }
                                                            }
                                                        }));
                                                    }}
                                                />
                                            </Grid>
                                            <Grid size={{ xs: 12, sm: 8 }}>
                                                <FormControl fullWidth size="small">
                                                    <InputLabel>Allowed Transitions To</InputLabel>
                                                    <Select
                                                        multiple
                                                        label="Allowed Transitions To"
                                                        value={formData.stageConfig?.[stage.id]?.allowedTransitions || []}
                                                        onChange={(e) => {
                                                            const val = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value;
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                stageConfig: {
                                                                    ...prev.stageConfig,
                                                                    [stage.id]: { ...prev.stageConfig?.[stage.id], allowedTransitions: val }
                                                                }
                                                            }));
                                                        }}
                                                        renderValue={(selected) => (
                                                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                                {(selected as string[]).map((id) => (
                                                                    <Chip key={id} label={filteredStages.find((s: any) => s.id === id)?.name || id} size="small" />
                                                                ))}
                                                            </Box>
                                                        )}
                                                    >
                                                        {filteredStages.filter((s: any) => s.id !== stage.id).map((s: any) => (
                                                            <MenuItem key={s.id} value={s.id}>
                                                                {s.name}
                                                            </MenuItem>
                                                        ))}
                                                    </Select>
                                                </FormControl>
                                            </Grid>
                                        </Grid>
                                    </Paper>
                                ))}
                            </Stack>
                        </Grid>
                    )}
                </Grid>
            </Box>
        </StandardDialog>
    );
}
