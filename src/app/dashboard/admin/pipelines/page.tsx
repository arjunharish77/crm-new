"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
    Box,
    Typography,
    Button,
    Card,
    Stack,
    IconButton,
    Tooltip,
    Chip,
    CardContent,
    Divider,
    CircularProgress,
    Grid,
} from "@mui/material";
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Timeline as PipelineIcon,
} from "@mui/icons-material";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { PipelineDialog } from "./pipeline-dialog";

interface Pipeline {
    id: string;
    name: string;
    isDefault: boolean;
    stages: Array<{
        id: string;
        name: string;
        order: number;
        color?: string;
        probability?: number;
        isWon?: boolean;
        isLost?: boolean;
    }>;
}

export default function PipelinesAdminPage() {
    const [pipelines, setPipelines] = useState<Pipeline[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);

    const fetchPipelines = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/pipelines");
            setPipelines(Array.isArray(data) ? data : []);
        } catch (error: any) {
            toast.error(error.message || "Failed to fetch pipelines");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPipelines();
    }, [fetchPipelines]);

    const handleCreate = () => {
        setSelectedPipeline(null);
        setDialogOpen(true);
    };

    const handleEdit = (pipeline: Pipeline) => {
        setSelectedPipeline(pipeline);
        setDialogOpen(true);
    };

    const handleDelete = async (pipeline: Pipeline) => {
        if (!confirm(`Delete pipeline "${pipeline.name}"?`)) return;
        try {
            await apiFetch(`/pipelines/${pipeline.id}`, { method: "DELETE" });
            toast.success("Pipeline deleted");
            fetchPipelines();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete pipeline");
        }
    };

    return (
        <Box sx={{ maxWidth: 1200, mx: "auto", p: { xs: 2, md: 3 } }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -1 }}>
                        Pipelines
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Configure stage flows and win/loss progression for your deals.
                    </Typography>
                </Box>
                <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
                    Create Pipeline
                </Button>
            </Stack>

            {loading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : pipelines.length === 0 ? (
                <EmptyState
                    title="No pipelines configured"
                    description="Create your first pipeline to define opportunity stages."
                    action={
                        <Button variant="outlined" startIcon={<AddIcon />} onClick={handleCreate}>
                            Create Pipeline
                        </Button>
                    }
                />
            ) : (
                <Grid container spacing={3}>
                    {pipelines.map((pipeline) => (
                        <Grid size={{ xs: 12, md: 6 }} key={pipeline.id}>
                            <Card sx={{ height: "100%" }}>
                                <CardContent>
                                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                                        <Box>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <PipelineIcon color="primary" fontSize="small" />
                                                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                                    {pipeline.name}
                                                </Typography>
                                                {pipeline.isDefault && <Chip label="Default" size="small" color="primary" variant="outlined" />}
                                            </Stack>
                                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                                {pipeline.stages.length} stages configured
                                            </Typography>
                                        </Box>
                                        <Stack direction="row" spacing={0.5}>
                                            <Tooltip title="Edit">
                                                <IconButton size="small" onClick={() => handleEdit(pipeline)}>
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete">
                                                <IconButton size="small" color="error" onClick={() => handleDelete(pipeline)}>
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </Stack>
                                    </Stack>

                                    <Divider sx={{ mb: 2 }} />

                                    <Stack spacing={1}>
                                        {pipeline.stages.map((stage) => (
                                            <Stack
                                                key={stage.id}
                                                direction="row"
                                                alignItems="center"
                                                justifyContent="space-between"
                                                sx={{
                                                    px: 1.5,
                                                    py: 1,
                                                    borderRadius: 2,
                                                    bgcolor: "surfaceContainerLowest",
                                                    border: "1px solid",
                                                    borderColor: "divider",
                                                }}
                                            >
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                    <Box
                                                        sx={{
                                                            width: 10,
                                                            height: 10,
                                                            borderRadius: "50%",
                                                            bgcolor: stage.color || "primary.main",
                                                        }}
                                                    />
                                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                        {stage.order}. {stage.name}
                                                    </Typography>
                                                </Stack>
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                    <Chip label={`${stage.probability ?? 0}%`} size="small" variant="outlined" />
                                                    {stage.isWon && <Chip label="Won" size="small" color="success" />}
                                                    {stage.isLost && <Chip label="Lost" size="small" color="error" />}
                                                </Stack>
                                            </Stack>
                                        ))}
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            <PipelineDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                pipeline={selectedPipeline}
                onSuccess={() => {
                    setDialogOpen(false);
                    fetchPipelines();
                }}
            />
        </Box>
    );
}
