"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
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
    alpha
} from "@mui/material";
import { toast } from "sonner";
import {
    Add as PlusIcon,
    Edit as EditIcon,
    Delete as TrashIcon,
    DragIndicator as DragIcon,
    List as ListIcon,
    Settings as SettingsIcon,
    Workspaces as ActivityIcon
} from "@mui/icons-material";
import { ActivityTypeDialog } from "./activity-type-dialog";
import { CustomFieldManager } from '@/components/admin/custom-field-manager';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "framer-motion";
import { fadeInUp } from "@/lib/motion";

interface ActivityType {
    id: string;
    name: string;
    icon?: string;
    color?: string;
    order: number;
    isActive: boolean;
}

function SortableActivityTypeRow({ activityType, onEdit, onDelete, onManageFields }: {
    activityType: ActivityType;
    onEdit: () => void;
    onDelete: () => void;
    onManageFields: () => void;
}) {
    const theme = useTheme();
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: activityType.id,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 2 : 1,
        position: 'relative' as const,
    };

    return (
        <Paper
            ref={setNodeRef}
            style={style}
            elevation={isDragging ? 4 : 0}
            sx={{
                p: '16px 24px',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                borderRadius: '20px',
                border: '1px solid',
                borderColor: isDragging ? 'primary.main' : 'divider',
                bgcolor: 'background.paper',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.02),
                    borderColor: alpha(theme.palette.primary.main, 0.3),
                    transform: isDragging ? undefined : 'scale(1.005) translateX(4px)',
                    boxShadow: isDragging ? undefined : `0 4px 12px ${alpha(theme.palette.primary.main, 0.08)}`
                }
            }}
        >
            <Box
                {...attributes}
                {...listeners}
                sx={{
                    cursor: 'grab',
                    display: 'flex',
                    alignItems: 'center',
                    color: 'text.disabled',
                    '&:hover': { color: 'primary.main' }
                }}
            >
                <DragIcon />
            </Box>

            <Box
                sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '12px',
                    flexShrink: 0,
                    bgcolor: alpha(activityType.color || "#6b7280", 0.1),
                    color: activityType.color || "#6b7280",
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid',
                    borderColor: alpha(activityType.color || "#6b7280", 0.2)
                }}
            >
                <ActivityIcon />
            </Box>

            <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{activityType.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                    {activityType.icon ? `Identifier: ${activityType.icon}` : 'Standard Interaction'}
                </Typography>
            </Box>

            <Chip
                label={activityType.isActive ? "Active" : "Inactive"}
                size="small"
                sx={{
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.625rem',
                    textTransform: 'uppercase',
                    bgcolor: activityType.isActive ? alpha(theme.palette.success.main, 0.08) : alpha(theme.palette.text.disabled, 0.08),
                    color: activityType.isActive ? 'success.main' : 'text.disabled',
                    border: '1px solid',
                    borderColor: activityType.isActive ? alpha(theme.palette.success.main, 0.2) : alpha(theme.palette.text.disabled, 0.2)
                }}
            />

            <Stack direction="row" spacing={1}>
                <Button
                    variant="outlined"
                    size="small"
                    onClick={onManageFields}
                    startIcon={<ListIcon />}
                    sx={{ borderRadius: '12px', borderStyle: 'dashed' }}
                >
                    Fields
                </Button>
                <IconButton size="small" onClick={onEdit} sx={{ color: 'primary.main' }}>
                    <EditIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={onDelete} color="error">
                    <TrashIcon fontSize="small" />
                </IconButton>
            </Stack>
        </Paper>
    );
}

export default function ActivityTypesPage() {
    const theme = useTheme();
    const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingType, setEditingType] = useState<ActivityType | null>(null);
    const [managingType, setManagingType] = useState<ActivityType | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const fetchActivityTypes = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/activity-types");
            setActivityTypes(data.sort((a: ActivityType, b: ActivityType) => a.order - b.order));
        } catch (error) {
            toast.error("Failed to fetch activity types");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchActivityTypes();
    }, [fetchActivityTypes]);

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = activityTypes.findIndex((item) => item.id === active.id);
            const newIndex = activityTypes.findIndex((item) => item.id === over.id);
            const reordered = arrayMove(activityTypes, oldIndex, newIndex);
            const updated = reordered.map((item, index) => ({ ...item, order: index + 1 }));

            setActivityTypes(updated);

            try {
                // Batch update order
                await Promise.all(updated.map(type =>
                    apiFetch(`/activity-types/${type.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ order: type.order }),
                    })
                ));
                toast.success("Order updated");
            } catch (error) {
                toast.error("Failed to update order");
                fetchActivityTypes();
            }
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this activity type?")) {
            return;
        }

        try {
            await apiFetch(`/activity-types/${id}`, { method: "DELETE" });
            toast.success("Activity type deleted");
            fetchActivityTypes();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete activity type");
        }
    };

    const handleEdit = (type: ActivityType) => {
        setEditingType(type);
        setDialogOpen(true);
    };

    const handleCreate = () => {
        setEditingType(null);
        setDialogOpen(true);
    };

    const handleManageFields = (type: ActivityType) => {
        setManagingType(type);
    };

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
                    <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -1 }}>Activity Types</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Define and sort activity categories for team collaboration
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    onClick={handleCreate}
                    startIcon={<PlusIcon />}
                    sx={{ borderRadius: '12px', px: 3, py: 1 }}
                >
                    Create Activity Type
                </Button>
            </Stack>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <Card
                    elevation={0}
                    sx={{
                        borderRadius: '24px',
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'background.default'
                    }}
                >
                    <CardHeader
                        title={<Typography variant="h6" sx={{ fontWeight: 700 }}>Configuration</Typography>}
                        avatar={<Paper sx={{ p: 1, borderRadius: '10px', bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main' }}><SettingsIcon fontSize="small" /></Paper>}
                        subheader="Drag and drop to reorder the sequence in activity forms"
                    />
                    <Divider sx={{ mx: 2, opacity: 0.5 }} />
                    <CardContent sx={{ p: 3 }}>
                        {activityTypes.length === 0 ? (
                            <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
                                <Typography variant="h6">No activity types configured</Typography>
                                <Button variant="text" onClick={handleCreate} sx={{ mt: 1 }}>Add first type</Button>
                            </Box>
                        ) : (
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={activityTypes.map((t) => t.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <Stack spacing={2}>
                                        {activityTypes.map((type) => (
                                            <SortableActivityTypeRow
                                                key={type.id}
                                                activityType={type}
                                                onEdit={() => handleEdit(type)}
                                                onDelete={() => handleDelete(type.id)}
                                                onManageFields={() => handleManageFields(type)}
                                            />
                                        ))}
                                    </Stack>
                                </SortableContext>
                            </DndContext>
                        )}
                    </CardContent>
                </Card>
            )}

            <ActivityTypeDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                activityType={editingType}
                onSuccess={() => {
                    setDialogOpen(false);
                    fetchActivityTypes();
                }}
            />

            {managingType && (
                <CustomFieldManager
                    open={!!managingType}
                    onOpenChange={(open) => !open && setManagingType(null)}
                    entityType="ACTIVITY_TYPE"
                    relatedTypeId={managingType.id}
                    relatedTypeName={managingType.name}
                />
            )}
        </Box>
    );
}
