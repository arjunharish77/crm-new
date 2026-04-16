'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
    Typography,
    Divider,
    Chip,
    Stack,
    IconButton,
    Paper,
    CircularProgress,
    useTheme,
    alpha,
    Grid,
    Avatar
} from "@mui/material";
import {
    Plus as PlusIcon,
    Edit as EditIcon,
    Trash2 as TrashIcon,
    GripVertical as DragIcon,
    List as ListIcon,
    Settings as SettingsIcon,
    Layout as LayoutIcon
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { OpportunityType } from '@/types/opportunity-types';
import { OpportunityTypeDialog } from './opportunity-type-dialog';
import { CustomFieldManager } from '@/components/admin/custom-field-manager';
import * as Icons from 'lucide-react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion, AnimatePresence } from "framer-motion";
import { fadeInUp } from "@/lib/motion";

export default function OpportunityTypesPage() {
    const theme = useTheme();
    const [types, setTypes] = useState<OpportunityType[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingType, setEditingType] = useState<OpportunityType | null>(null);
    const [managingType, setManagingType] = useState<OpportunityType | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const fetchTypes = useCallback(async () => {
        try {
            setLoading(true);
            const data = await apiFetch('/opportunity-types');
            setTypes(data.sort((a: any, b: any) => a.order - b.order));
        } catch (error) {
            toast.error('Failed to fetch opportunity types');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTypes();
    }, [fetchTypes]);

    const handleCreate = () => {
        setEditingType(null);
        setDialogOpen(true);
    };

    const handleManageFields = (type: OpportunityType) => {
        setManagingType(type);
    };

    const handleEdit = (type: OpportunityType) => {
        setEditingType(type);
        setDialogOpen(true);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = types.findIndex((item) => item.id === active.id);
            const newIndex = types.findIndex((item) => item.id === over.id);
            const newOrder = arrayMove(types, oldIndex, newIndex);

            setTypes(newOrder);

            try {
                await apiFetch('/opportunity-types/reorder', {
                    method: 'PUT',
                    body: JSON.stringify({ ids: newOrder.map(t => t.id) }),
                });
                toast.success("Order updated");
            } catch (error) {
                toast.error("Failed to save order");
                fetchTypes();
            }
        }
    };

    const handleDelete = async (type: OpportunityType) => {
        if (type._count && type._count.opportunities > 0) {
            toast.error(`Cannot delete type with ${type._count.opportunities} opportunities`);
            return;
        }

        if (!confirm(`Delete opportunity type "${type.name}"?`)) {
            return;
        }

        try {
            await apiFetch(`/opportunity-types/${type.id}`, {
                method: 'DELETE',
            });
            toast.success('Opportunity type deleted');
            fetchTypes();
        } catch (error) {
            toast.error('Failed to delete opportunity type');
        }
    };

    const getLucideIcon = (iconName?: string | null) => {
        if (!iconName) return null;
        const Icon = (Icons as any)[iconName];
        return Icon ? <Icon size={20} /> : null;
    };

    function SortableTypeCard({ type }: { type: OpportunityType }) {
        const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: type.id });

        const style = {
            transform: CSS.Transform.toString(transform),
            transition,
            opacity: isDragging ? 0.6 : 1,
            zIndex: isDragging ? 2 : 1,
            height: '100%'
        };

        return (
            <Box ref={setNodeRef} style={style}>
                <Card
                    elevation={isDragging ? 4 : 0}
                    sx={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: '24px',
                        border: '1px solid',
                        borderColor: isDragging ? 'primary.main' : 'divider',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        '&:hover': {
                            bgcolor: alpha(theme.palette.primary.main, 0.01),
                            borderColor: alpha(theme.palette.primary.main, 0.2),
                            boxShadow: isDragging ? undefined : theme.shadows[2],
                            transform: isDragging ? undefined : 'translateY(-4px)'
                        }
                    }}
                >
                    <CardHeader
                        avatar={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box
                                    {...attributes}
                                    {...listeners}
                                    sx={{ cursor: 'grab', color: 'text.disabled', '&:hover': { color: 'primary.main' } }}
                                >
                                    <DragIcon size={18} />
                                </Box>
                                <Avatar
                                    sx={{
                                        width: 44,
                                        height: 44,
                                        borderRadius: '12px',
                                        bgcolor: alpha(type.color || theme.palette.primary.main, 0.1),
                                        color: type.color || theme.palette.primary.main,
                                        border: '1px solid',
                                        borderColor: alpha(type.color || theme.palette.primary.main, 0.2)
                                    }}
                                >
                                    {getLucideIcon(type.icon) || <LayoutIcon size={20} />}
                                </Avatar>
                            </Box>
                        }
                        title={<Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{type.name}</Typography>}
                        subheader={
                            <Chip
                                label={type.isActive ? 'Active' : 'Inactive'}
                                size="small"
                                sx={{
                                    height: 18,
                                    fontSize: '0.625rem',
                                    fontWeight: 900,
                                    textTransform: 'uppercase',
                                    borderRadius: '4px',
                                    bgcolor: type.isActive ? alpha(theme.palette.primary.main, 0.08) : alpha(theme.palette.text.disabled, 0.08),
                                    color: type.isActive ? 'primary.main' : 'text.disabled'
                                }}
                            />
                        }
                    />
                    <CardContent sx={{ flexGrow: 1, py: 0 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ minHeight: 40, mb: 2 }}>
                            {type.description || "No description provided."}
                        </Typography>

                        <Stack spacing={1.5} sx={{ mb: 2 }}>
                            {type.defaultPipeline && (
                                <Box>
                                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        Default Routing
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                        {type.defaultPipeline.name}
                                        {type.defaultStage && <Typography component="span" variant="caption" color="text.secondary"> • {type.defaultStage.name}</Typography>}
                                    </Typography>
                                </Box>
                            )}

                            <Stack direction="row" spacing={3}>
                                <Box>
                                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.disabled' }}>OPPORTUNITIES</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{type._count?.opportunities || 0}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.disabled' }}>CUSTOM FIELDS</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{type._count?.customFields || 0}</Typography>
                                </Box>
                            </Stack>
                        </Stack>
                    </CardContent>
                    <Divider sx={{ mx: 2, opacity: 0.5 }} />
                    <Stack direction="row" spacing={1} sx={{ p: 2 }}>
                        <Button
                            variant="outlined"
                            size="small"
                            fullWidth
                            startIcon={<ListIcon size={14} />}
                            onClick={() => handleManageFields(type)}
                            sx={{ borderRadius: '12px', borderStyle: 'dashed' }}
                        >
                            Fields
                        </Button>
                        <IconButton size="small" onClick={() => handleEdit(type)} sx={{ color: 'primary.main' }}>
                            <EditIcon size={18} />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDelete(type)} disabled={type._count && type._count.opportunities > 0}>
                            <TrashIcon size={18} />
                        </IconButton>
                    </Stack>
                </Card>
            </Box>
        );
    }

    return (
        <Box
            component={motion.div}
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}
        >
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -1 }}>Opportunity Types</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Categorize deals and configure unique picklists and stages for each
                    </Typography>
                </Box>
                <Button variant="contained" onClick={handleCreate} startIcon={<PlusIcon size={18} />} sx={{ borderRadius: '12px', px: 3 }}>
                    Create Type
                </Button>
            </Stack>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : types.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 8, textAlign: 'center', borderRadius: '24px', borderStyle: 'dashed' }}>
                    <SettingsIcon size={64} style={{ opacity: 0.2, marginBottom: 16 }} />
                    <Typography variant="h6" color="text.secondary">No opportunity types found</Typography>
                    <Button variant="text" onClick={handleCreate} sx={{ mt: 1 }}>Add your first type</Button>
                </Paper>
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={types.map(t => t.id)}
                        strategy={rectSortingStrategy}
                    >
                        <Grid container spacing={3}>
                            {types.map((type) => (
                                <Grid size={{ xs: 12, md: 6, lg: 4 }} key={type.id}>
                                    <SortableTypeCard type={type} />
                                </Grid>
                            ))}
                        </Grid>
                    </SortableContext>
                </DndContext>
            )}

            <OpportunityTypeDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                opportunityType={editingType}
                onSuccess={() => {
                    setDialogOpen(false);
                    fetchTypes();
                }}
            />

            {managingType && (
                <CustomFieldManager
                    open={!!managingType}
                    onOpenChange={(open) => !open && setManagingType(null)}
                    entityType="OPPORTUNITY_TYPE"
                    relatedTypeId={managingType.id}
                    relatedTypeName={managingType.name}
                />
            )}
        </Box>
    );
}
