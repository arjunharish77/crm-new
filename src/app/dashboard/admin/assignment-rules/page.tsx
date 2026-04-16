"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
    Box,
    Button,
    Typography,
    Divider,
    IconButton,
    Chip,
    Paper,
    useTheme,
    alpha,
    Stack,
    CircularProgress
} from "@mui/material";
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as TrashIcon,
    Rule as RuleIcon
} from "@mui/icons-material";
import { toast } from "sonner";
import { GridColDef } from "@mui/x-data-grid";
import { StandardDataGrid } from "@/components/common/standard-data-grid";
import { RuleBuilder } from "./rule-builder";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";

export default function AssignmentSettingsPage() {
    const theme = useTheme();
    const [rules, setRules] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isBuilderOpen, setIsBuilderOpen] = useState(false);
    const [selectedRule, setSelectedRule] = useState<any>(null);

    const fetchRules = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/assignment/rules");
            setRules(data);
        } catch (error) {
            toast.error("Failed to load assignment rules");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRules();
    }, [fetchRules]);

    const handleCreate = () => {
        setSelectedRule(null);
        setIsBuilderOpen(true);
    };

    const handleEdit = (rule: any) => {
        setSelectedRule(rule);
        setIsBuilderOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this rule?")) return;
        try {
            await apiFetch(`/assignment/rules/${id}`, {
                method: "DELETE",
            });
            toast.success("Rule deleted");
            fetchRules();
        } catch (error) {
            toast.error("Failed to delete rule");
        }
    };

    const handleSave = async (ruleData: any) => {
        try {
            if (selectedRule) {
                await apiFetch(`/assignment/rules/${selectedRule.id}`, {
                    method: "PUT",
                    body: JSON.stringify(ruleData),
                });
                toast.success("Rule updated");
            } else {
                await apiFetch("/assignment/rules", {
                    method: "POST",
                    body: JSON.stringify(ruleData),
                });
                toast.success("Rule created");
            }
            fetchRules();
        } catch (error) {
            toast.error("Failed to save rule");
            throw error;
        }
    };

    const columns: GridColDef[] = [
        {
            field: 'name',
            headerName: 'Rule Name',
            flex: 1,
            minWidth: 250,
            renderCell: (params) => (
                <Typography variant="body2" sx={{ fontWeight: 700, py: 1 }}>{params.value}</Typography>
            )
        },
        {
            field: 'isActive',
            headerName: 'Status',
            width: 140,
            renderCell: (params) => (
                <Chip
                    label={params.value ? "Active" : "Paused"}
                    size="small"
                    sx={{
                        borderRadius: '8px',
                        fontWeight: 800,
                        fontSize: '0.625rem',
                        textTransform: 'uppercase',
                        bgcolor: params.value ? alpha(theme.palette.success.main, 0.08) : alpha(theme.palette.text.disabled, 0.08),
                        color: params.value ? 'success.main' : 'text.disabled',
                        border: '1px solid',
                        borderColor: params.value ? alpha(theme.palette.success.main, 0.2) : alpha(theme.palette.text.disabled, 0.2)
                    }}
                />
            )
        },
        {
            field: 'priority',
            headerName: 'Priority',
            width: 120,
            type: 'number',
            align: 'center',
            headerAlign: 'center',
            renderCell: (params) => (
                <Paper sx={{
                    px: 1.5,
                    py: 0.5,
                    borderRadius: '8px',
                    bgcolor: alpha(theme.palette.info.main, 0.08),
                    color: 'info.main',
                    fontWeight: 800,
                    fontSize: '0.75rem',
                    border: '1px solid',
                    borderColor: alpha(theme.palette.info.main, 0.2)
                }}>
                    P{params.value}
                </Paper>
            )
        },
        {
            field: 'actions',
            headerName: 'Actions',
            width: 140,
            sortable: false,
            align: 'right',
            headerAlign: 'right',
            renderCell: (params) => (
                <Stack direction="row" spacing={1} justifyContent="flex-end" width="100%">
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleEdit(params.row); }} sx={{ color: 'primary.main' }}>
                        <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); handleDelete(params.row.id); }}>
                        <TrashIcon fontSize="small" />
                    </IconButton>
                </Stack>
            )
        }
    ];

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
                    <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -1 }}>Assignment Rules</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Configure dynamic logic for routing leads and opportunities based on criteria
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleCreate}
                    sx={{ borderRadius: '12px', px: 3, py: 1 }}
                >
                    Create Rule
                </Button>
            </Stack>

            <Paper
                elevation={0}
                sx={{
                    borderRadius: '24px',
                    overflow: 'hidden',
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper'
                }}
            >
                <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
                    <Paper sx={{ p: 1, borderRadius: '10px', bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main', display: 'flex' }}>
                        <RuleIcon fontSize="small" />
                    </Paper>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Routing Logic</Typography>
                </Box>
                <Divider />
                <StandardDataGrid
                    rows={rules}
                    columns={columns}
                    loading={loading}
                    disableRowSelectionOnClick
                    sx={{
                        border: 'none',
                        '& .MuiDataGrid-row:hover': {
                            bgcolor: alpha(theme.palette.primary.main, 0.02),
                        }
                    }}
                />
            </Paper>

            <RuleBuilder
                open={isBuilderOpen}
                setOpen={setIsBuilderOpen}
                rule={selectedRule}
                onSave={handleSave}
            />
        </Box>
    );
}
