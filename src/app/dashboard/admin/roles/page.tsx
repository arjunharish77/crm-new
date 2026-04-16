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
    IconButton,
    Chip,
    Grid,
    Stack,
    CircularProgress,
    useTheme,
    alpha,
    Paper
} from "@mui/material";
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Security as SecurityIcon,
    Fingerprint as RecordAccessIcon
} from "@mui/icons-material";
import { toast } from "sonner";
import { RoleDialog } from "./role-dialog";

interface Role {
    id: string;
    name: string;
    description?: string;
    permissions: {
        modules: Record<string, string>;
        recordAccess: string;
    };
    _count?: {
        users: number;
    };
}

export default function RolesPage() {
    const theme = useTheme();
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

    const fetchRoles = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/roles");
            setRoles(data);
        } catch (error) {
            toast.error("Failed to fetch roles");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRoles();
    }, [fetchRoles]);

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this role? Users with this role will need to be reassigned.")) {
            return;
        }

        try {
            await apiFetch(`/roles/${id}`, { method: "DELETE" });
            toast.success("Role deleted");
            fetchRoles();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete role");
        }
    };

    const handleEdit = (role: Role) => {
        setEditingRole(role);
        setDialogOpen(true);
    };

    const handleCreate = () => {
        setEditingRole(null);
        setDialogOpen(true);
    };

    const getPermissionStyle = (level: string) => {
        const styles: Record<string, { color: string; bgcolor: string }> = {
            full: {
                color: theme.palette.success.main,
                bgcolor: alpha(theme.palette.success.main, 0.08)
            },
            write: {
                color: theme.palette.primary.main,
                bgcolor: alpha(theme.palette.primary.main, 0.08)
            },
            read: {
                color: theme.palette.info.main,
                bgcolor: alpha(theme.palette.info.main, 0.08)
            },
            none: {
                color: theme.palette.text.disabled,
                bgcolor: alpha(theme.palette.text.disabled, 0.08)
            },
        };
        return styles[level] || { color: theme.palette.text.secondary, bgcolor: theme.palette.action.hover };
    };

    return (
        <Box sx={{ maxWidth: 1400, mx: 'auto', p: { xs: 2, md: 3 } }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -0.5 }}>Roles & Permissions</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Define and manage access policies for team members and modules
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleCreate}
                    sx={{ borderRadius: '12px', px: 3, py: 1 }}
                >
                    Create Role
                </Button>
            </Stack>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <Grid container spacing={3}>
                    {roles.length === 0 ? (
                        <Grid size={{ xs: 12 }}>
                            <Paper variant="outlined" sx={{ p: 8, textAlign: 'center', borderRadius: '24px', borderStyle: 'dashed' }}>
                                <SecurityIcon sx={{ fontSize: 64, color: 'text.disabled', opacity: 0.3, mb: 2 }} />
                                <Typography variant="h6" color="text.secondary">No roles found</Typography>
                                <Button variant="text" onClick={handleCreate} sx={{ mt: 1 }}>Add your first role</Button>
                            </Paper>
                        </Grid>
                    ) : (
                        roles.map((role) => (
                            <Grid size={{ xs: 12, lg: 6 }} key={role.id}>
                                <Card
                                    elevation={0}
                                    sx={{
                                        borderRadius: '24px',
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        transition: 'all 0.2s',
                                        '&:hover': {
                                            boxShadow: theme.shadows[2],
                                            borderColor: alpha(theme.palette.primary.main, 0.3)
                                        }
                                    }}
                                >
                                    <CardHeader
                                        avatar={
                                            <Paper sx={{ p: 1, borderRadius: '12px', bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main' }}>
                                                <SecurityIcon fontSize="small" />
                                            </Paper>
                                        }
                                        title={
                                            <Typography variant="h6" sx={{ fontWeight: 700 }}>{role.name}</Typography>
                                        }
                                        subheader={
                                            <Typography variant="caption" color="text.secondary">
                                                {role._count?.users || 0} users assigned
                                            </Typography>
                                        }
                                        action={
                                            <Stack direction="row" spacing={1}>
                                                <IconButton size="small" onClick={() => handleEdit(role)}>
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                                <IconButton size="small" color="error" onClick={() => handleDelete(role.id)}>
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Stack>
                                        }
                                    />
                                    <Divider sx={{ mx: 2, opacity: 0.5 }} />
                                    <CardContent sx={{ pt: 2 }}>
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                            {role.description || "No description provided for this role."}
                                        </Typography>

                                        <Box sx={{ mb: 3 }}>
                                            <Typography variant="overline" sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: 1 }}>
                                                Module Access
                                            </Typography>
                                            <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
                                                {Object.entries(role.permissions.modules).map(([module, level]) => {
                                                    const style = getPermissionStyle(level);
                                                    return (
                                                        <Chip
                                                            key={module}
                                                            label={`${module.charAt(0).toUpperCase() + module.slice(1)}: ${level}`}
                                                            size="small"
                                                            sx={{
                                                                borderRadius: '8px',
                                                                fontWeight: 700,
                                                                fontSize: '0.625rem',
                                                                textTransform: 'uppercase',
                                                                bgcolor: style.bgcolor,
                                                                color: style.color,
                                                                border: '1px solid',
                                                                borderColor: alpha(style.color, 0.2)
                                                            }}
                                                        />
                                                    );
                                                })}
                                            </Stack>
                                        </Box>

                                        <Box>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <RecordAccessIcon sx={{ fontSize: 16, color: 'secondary.main' }} />
                                                <Typography variant="overline" sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: 1 }}>
                                                    Record Data Access
                                                </Typography>
                                            </Stack>
                                            <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5, color: 'secondary.main' }}>
                                                {role.permissions.recordAccess.replace('_', ' ')}
                                            </Typography>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))
                    )}
                </Grid>
            )}

            <RoleDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                role={editingRole}
                onSuccess={() => {
                    setDialogOpen(false);
                    fetchRoles();
                }}
            />
        </Box>
    );
}
