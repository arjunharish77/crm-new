'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
    Box,
    Grid,
    Typography,
    Button,
    CircularProgress,
    Stack,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    MenuItem
} from '@mui/material';
import {
    Add as AddIcon,
    Refresh as RefreshIcon,
    Dashboard as DashboardIcon
} from '@mui/icons-material';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { DashboardWidget } from './widget-library';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableWidgetProps {
    widget: any;
    onDelete: (id: string) => void;
}

function SortableWidget({ widget, onDelete }: SortableWidgetProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: widget.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        height: '100%'
    };

    return (
        <Grid size={widget.layout?.w === 2 ? { xs: 12 } : { xs: 12, md: 6, lg: 4 }} ref={setNodeRef} style={style} {...attributes}>
            <Box sx={{ height: '100%', position: 'relative' }}>
                {/* Drag handle overlay if needed, but we'll let the header handle it via listeners if we pass them down */}
                <DashboardWidget
                    widget={widget}
                    onDelete={() => onDelete(widget.id)}
                />
                <Box
                    {...listeners}
                    sx={{
                        position: 'absolute',
                        top: 8,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 40,
                        height: 8,
                        bgcolor: 'action.hover',
                        borderRadius: 4,
                        cursor: 'grab',
                        opacity: 0,
                        transition: 'opacity 0.2s',
                        '&:hover': { opacity: 1 }
                    }}
                />
            </Box>
        </Grid>
    );
}

export function DashboardManager() {
    const [widgets, setWidgets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const fetchWidgets = useCallback(async () => {
        try {
            setLoading(true);
            const data = await apiFetch('/dashboard-widgets');
            setWidgets(data);
        } catch (err) {
            console.error('Failed to fetch widgets', err);
            toast.error('Failed to load dashboard widgets');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchWidgets();
    }, [fetchWidgets]);

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = widgets.findIndex(i => i.id === active.id);
            const newIndex = widgets.findIndex(i => i.id === over.id);
            const nextWidgets = arrayMove(widgets, oldIndex, newIndex).map((widget, index) => ({
                ...widget,
                layout: {
                    ...(widget.layout ?? {}),
                    y: index,
                    x: widget.layout?.x ?? 0,
                }
            }));

            setWidgets(nextWidgets);

            try {
                await Promise.all(
                    nextWidgets.map((widget) =>
                        apiFetch(`/dashboard-widgets/${widget.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({
                                layout: widget.layout,
                            })
                        })
                    )
                );
            } catch (err) {
                console.error('Failed to persist widget order', err);
                toast.error('Widget order could not be saved');
                fetchWidgets();
            }
        }
    };

    const handleDeleteWidget = async (id: string) => {
        try {
            await apiFetch(`/dashboard-widgets/${id}`, { method: 'DELETE' });
            setWidgets(prev => prev.filter(w => w.id !== id));
            toast.success('Widget removed');
        } catch (err) {
            console.error('Failed to delete widget', err);
            toast.error('Failed to delete widget');
        }
    };

    const initializeDefaults = async () => {
        const defaults = [
            { title: 'Total Leads', type: 'STAT', config: { module: 'LEADS', metric: 'COUNT' }, layout: { w: 1, h: 1 } },
            { title: 'Open Opportunities', type: 'STAT', config: { module: 'OPPORTUNITIES', metric: 'COUNT', filters: { stage: { isWon: false, isLost: false } } }, layout: { w: 1, h: 1 } },
            { title: 'Lead Acquisition Trend', type: 'TREND', config: { module: 'LEADS', metric: 'COUNT', groupBy: 'createdAt' }, layout: { w: 2, h: 1 } },
            { title: 'Sales Funnel', type: 'FUNNEL', config: { pipelineId: null }, layout: { w: 1, h: 1 } }
        ];

        try {
            setLoading(true);
            for (const widget of defaults) {
                await apiFetch('/dashboard-widgets', {
                    method: 'POST',
                    body: JSON.stringify(widget)
                });
            }
            await fetchWidgets();
            toast.success('Default dashboard initialized');
        } catch (err) {
            console.error('Failed to initialize defaults', err);
            toast.error('Failed to initialize default dashboard');
        } finally {
            setLoading(false);
        }
    };

    if (loading && widgets.length === 0) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (widgets.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', py: 12, bgcolor: 'background.paper', borderRadius: 8, border: '1px dashed', borderColor: 'divider' }}>
                <DashboardIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h5" gutterBottom fontWeight={700}>Welcome to your Dashboard</Typography>
                <Typography color="text.secondary" sx={{ mb: 4 }}>You haven't added any widgets yet. Start by initializing the default set.</Typography>
                <Button variant="contained" size="large" onClick={initializeDefaults} startIcon={<AddIcon />} sx={{ borderRadius: 4 }}>
                    Initialize Default Dashboard
                </Button>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                <Typography variant="h4" fontWeight={800}>Dashboard</Typography>
                <Stack direction="row" spacing={2}>
                    <Button startIcon={<RefreshIcon />} onClick={fetchWidgets}>Refresh</Button>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setIsAdding(true)} sx={{ borderRadius: 4 }}>
                        Add Widget
                    </Button>
                </Stack>
            </Box>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={widgets.map(w => w.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <Grid container spacing={3}>
                        {widgets.map((widget) => (
                            <SortableWidget
                                key={widget.id}
                                widget={widget}
                                onDelete={handleDeleteWidget}
                            />
                        ))}
                    </Grid>
                </SortableContext>
            </DndContext>

            <AddWidgetDialog
                open={isAdding}
                onClose={() => setIsAdding(false)}
                onAdded={fetchWidgets}
            />
        </Box>
    );
}

function AddWidgetDialog({ open, onClose, onAdded }: { open: boolean, onClose: () => void, onAdded: () => void }) {
    const [title, setTitle] = useState('');
    const [type, setType] = useState('STAT');
    const [module, setModule] = useState('LEADS');
    const [metric, setMetric] = useState('COUNT');

    const handleAdd = async () => {
        const config = { module, metric };
        if (type === 'TREND') {
            (config as any).groupBy = 'createdAt';
        }

        try {
            await apiFetch('/dashboard-widgets', {
                method: 'POST',
                body: JSON.stringify({
                    title,
                    type,
                    config,
                    layout: { w: type === 'TREND' ? 2 : 1, h: 1 }
                })
            });
            onAdded();
            onClose();
            toast.success('Widget added');
        } catch (err) {
            console.error('Failed to add widget', err);
            toast.error('Failed to add widget');
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
            <DialogTitle>Add New Widget</DialogTitle>
            <DialogContent>
                <Stack spacing={3} sx={{ mt: 1 }}>
                    <TextField label="Widget Title" fullWidth value={title} onChange={e => setTitle(e.target.value)} />
                    <TextField select label="Widget Type" fullWidth value={type} onChange={e => setType(e.target.value)}>
                        <MenuItem value="STAT">Stat Summary</MenuItem>
                        <MenuItem value="TREND">Trend Chart</MenuItem>
                        <MenuItem value="BAR">Bar Comparison</MenuItem>
                        <MenuItem value="FUNNEL">Sales Funnel</MenuItem>
                    </TextField>
                    <TextField select label="Data Module" fullWidth value={module} onChange={e => setModule(e.target.value)}>
                        <MenuItem value="LEADS">Leads</MenuItem>
                        <MenuItem value="OPPORTUNITIES">Opportunities</MenuItem>
                        <MenuItem value="ACTIVITIES">Activities</MenuItem>
                    </TextField>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={handleAdd}>Add Widget</Button>
            </DialogActions>
        </Dialog>
    );
}
