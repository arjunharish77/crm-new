"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
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
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    TextField,
    Switch,
    FormControlLabel,
    Stack,
    IconButton,
    Paper,
    Box,
    Typography,
    Divider
} from "@mui/material";
import {
    DragIndicator as DragIcon,
    Delete as TrashIcon,
    Add as PlusIcon,
    Close as CloseIcon
} from "@mui/icons-material";

interface Stage {
    id: string;
    tempId?: string;
    name: string;
    order: number;
    color?: string;
    probability?: number;
    isWon?: boolean;
    isLost?: boolean;
}

interface Pipeline {
    id: string;
    name: string;
    isDefault: boolean;
    stages: Stage[];
}

interface PipelineDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    pipeline: Pipeline | null;
    onSuccess: () => void;
}

const formSchema = z.object({
    name: z.string().min(2, "Pipeline name is required"),
    isDefault: z.boolean(),
});

function SortableStageItem({
    stage,
    onUpdate,
    onDelete,
}: {
    stage: Stage;
    onUpdate: (updates: Partial<Stage>) => void;
    onDelete: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: stage.tempId || stage.id,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1 : 0,
    };

    return (
        <Paper
            ref={setNodeRef}
            style={style}
            variant="outlined"
            sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                bgcolor: 'background.paper'
            }}
        >
            <Box {...attributes} {...listeners} sx={{ cursor: 'grab', display: 'flex', alignItems: 'center', color: 'text.secondary' }}>
                <DragIcon />
            </Box>

            <TextField
                value={stage.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                placeholder="Stage name"
                fullWidth
                size="small"
            />

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField
                    type="color"
                    value={stage.color}
                    onChange={(e) => onUpdate({ color: e.target.value })}
                    sx={{ width: 60, '& input': { p: 0.5, height: 40 } }}
                    size="small"
                />

                <TextField
                    type="number"
                    value={stage.probability}
                    onChange={(e) => onUpdate({ probability: parseInt(e.target.value) || 0 })}
                    placeholder="%"
                    inputProps={{ min: 0, max: 100 }}
                    sx={{ width: 80 }}
                    size="small"
                    InputProps={{
                        endAdornment: <Typography variant="caption">%</Typography>
                    }}
                />

                <Stack direction="row" spacing={0.5}>
                    <Button
                        variant={stage.isWon ? "contained" : "outlined"}
                        color={stage.isWon ? "success" : "inherit"}
                        size="small"
                        onClick={() => onUpdate({ isWon: !stage.isWon, isLost: false })}
                        sx={{ minWidth: 50, px: 1, fontSize: '0.75rem' }}
                    >
                        Won
                    </Button>
                    <Button
                        variant={stage.isLost ? "contained" : "outlined"}
                        color={stage.isLost ? "error" : "inherit"}
                        size="small"
                        onClick={() => onUpdate({ isLost: !stage.isLost, isWon: false })}
                        sx={{ minWidth: 50, px: 1, fontSize: '0.75rem' }}
                    >
                        Lost
                    </Button>
                </Stack>

                <IconButton size="small" onClick={onDelete} color="default">
                    <TrashIcon fontSize="small" />
                </IconButton>
            </Box>
        </Paper>
    );
}

export function PipelineDialog({
    open,
    onOpenChange,
    pipeline,
    onSuccess,
}: PipelineDialogProps) {
    const [loading, setLoading] = useState(false);
    const [stages, setStages] = useState<Stage[]>([]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const { control, handleSubmit, reset, formState: { errors } } = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            isDefault: false,
        },
    });

    useEffect(() => {
        if (pipeline) {
            reset({
                name: pipeline.name,
                isDefault: pipeline.isDefault,
            });
            setStages(
                pipeline.stages.sort((a, b) => a.order - b.order).map((s) => ({
                    ...s,
                    tempId: s.id,
                }))
            );
        } else {
            reset({
                name: "",
                isDefault: false,
            });
            setStages([
                {
                    id: "",
                    tempId: `temp-${Date.now()}-1`,
                    name: "Qualified",
                    order: 1,
                    color: "#3b82f6",
                    probability: 25,
                    isWon: false,
                    isLost: false,
                },
                {
                    id: "",
                    tempId: `temp-${Date.now()}-2`,
                    name: "Proposal",
                    order: 2,
                    color: "#8b5cf6",
                    probability: 50,
                    isWon: false,
                    isLost: false,
                },
                {
                    id: "",
                    tempId: `temp-${Date.now()}-3`,
                    name: "Negotiation",
                    order: 3,
                    color: "#f59e0b",
                    probability: 75,
                    isWon: false,
                    isLost: false,
                },
                {
                    id: "",
                    tempId: `temp-${Date.now()}-4`,
                    name: "Closed Won",
                    order: 4,
                    color: "#10b981",
                    probability: 100,
                    isWon: true,
                    isLost: false,
                },
            ]);
        }
    }, [pipeline, reset, open]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setStages((items) => {
                const oldIndex = items.findIndex((item) => (item.tempId || item.id) === active.id);
                const newIndex = items.findIndex((item) => (item.tempId || item.id) === over.id);
                const reordered = arrayMove(items, oldIndex, newIndex);
                return reordered.map((item, index) => ({ ...item, order: index + 1 }));
            });
        }
    };

    const addStage = () => {
        const newStage: Stage = {
            id: "",
            tempId: `temp-${Date.now()}`,
            name: "",
            order: stages.length + 1,
            color: "#6b7280",
            probability: 0,
            isWon: false,
            isLost: false,
        };
        setStages([...stages, newStage]);
    };

    const updateStage = (index: number, updates: Partial<Stage>) => {
        const updated = [...stages];
        updated[index] = { ...updated[index], ...updates };
        setStages(updated);
    };

    const deleteStage = (index: number) => {
        if (stages.length === 1) {
            toast.error("Pipeline must have at least one stage");
            return;
        }
        const updated = stages.filter((_, i) => i !== index);
        setStages(updated.map((s, i) => ({ ...s, order: i + 1 })));
    };

    async function onSubmit(values: any) {
        setLoading(true);
        try {
            if (stages.length === 0) {
                toast.error("Add at least one stage");
                setLoading(false);
                return;
            }

            if (stages.some((s) => !s.name.trim())) {
                toast.error("All stages must have a name");
                setLoading(false);
                return;
            }

            const payload = {
                name: values.name,
                isDefault: values.isDefault,
                stages: stages.map((s, index) => ({
                    ...(s.id && { id: s.id }),
                    name: s.name,
                    order: index + 1,
                    color: s.color,
                    probability: s.probability,
                    isWon: s.isWon,
                    isLost: s.isLost,
                })),
            };

            if (pipeline) {
                await apiFetch(`/pipelines/${pipeline.id}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                toast.success("Pipeline updated");
            } else {
                await apiFetch("/pipelines", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast.success("Pipeline created");
            }

            onSuccess();
        } catch (error: any) {
            toast.error(error.message || "Failed to save pipeline");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog
            open={open}
            onClose={() => onOpenChange(false)}
            maxWidth="md"
            fullWidth
            PaperProps={{ sx: { borderRadius: 3, height: '90vh' } }}
        >
            <Box sx={{ px: 3, pt: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                        <DialogTitle sx={{ p: 0 }}>{pipeline ? "Edit Pipeline" : "Create Pipeline"}</DialogTitle>
                        <DialogContentText>Manage your sales pipeline stages and probabilities.</DialogContentText>
                    </Box>
                    <IconButton onClick={() => onOpenChange(false)}>
                        <CloseIcon />
                    </IconButton>
                </Stack>
            </Box>
            <Divider sx={{ my: 2 }} />

            <DialogContent sx={{ p: 3 }}>
                <form id="pipeline-form" onSubmit={handleSubmit(onSubmit)}>
                    <Stack spacing={3}>
                        <Controller
                            name="name"
                            control={control}
                            render={({ field }) => (
                                <TextField
                                    {...field}
                                    label="Pipeline Name"
                                    placeholder="Sales Pipeline"
                                    fullWidth
                                    error={!!errors.name}
                                    helperText={errors.name?.message as string}
                                />
                            )}
                        />

                        <Controller
                            name="isDefault"
                            control={control}
                            render={({ field }) => (
                                <FormControlLabel
                                    control={<Switch checked={field.value} onChange={field.onChange} />}
                                    label="Default Pipeline (New opportunities will use this by default)"
                                />
                            )}
                        />

                        <Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="subtitle1" fontWeight={600}>Stages</Typography>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={addStage}
                                    startIcon={<PlusIcon />}
                                    sx={{ borderRadius: 20 }}
                                >
                                    Add Stage
                                </Button>
                            </Box>
                            <Box sx={{ bgcolor: 'action.hover', p: 1, borderRadius: 1, mb: 2 }}>
                                <Typography variant="caption" color="text.secondary">
                                    Drag to reorder • Set colors, win probabilities, and mark won/lost stages
                                </Typography>
                            </Box>

                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={stages.map((s) => s.tempId || s.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <Stack spacing={2}>
                                        {stages.map((stage, index) => (
                                            <SortableStageItem
                                                key={stage.tempId || stage.id}
                                                stage={stage}
                                                onUpdate={(updates) => updateStage(index, updates)}
                                                onDelete={() => deleteStage(index)}
                                            />
                                        ))}
                                    </Stack>
                                </SortableContext>
                            </DndContext>
                        </Box>
                    </Stack>
                </form>
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 3 }}>
                <Button onClick={() => onOpenChange(false)} sx={{ borderRadius: 20, color: 'text.secondary' }}>
                    Cancel
                </Button>
                <Button
                    type="submit"
                    form="pipeline-form"
                    variant="contained"
                    disabled={loading}
                    sx={{ borderRadius: 20 }}
                >
                    {loading ? "Saving..." : pipeline ? "Update Pipeline" : "Create Pipeline"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
