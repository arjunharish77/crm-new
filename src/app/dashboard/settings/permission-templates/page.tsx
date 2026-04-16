"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Box,
    Typography,
    Button,
    Card,
    Stack,
    IconButton,
    Tooltip,
    useTheme,
    alpha,
    Chip,
} from "@mui/material";
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Security as PermissionsIcon,
} from "@mui/icons-material";
import {
    GridColDef,
    GridRenderCellParams,
    GridRowId,
} from "@mui/x-data-grid";
import { StandardDataGrid } from "@/components/common/standard-data-grid";
import { toast } from "sonner";
import { Role } from "@/types/user";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/skeletons";
import { RoleEditorDialog } from "@/components/roles/role-editor-dialog";
import { apiFetch } from "@/lib/api";

export default function RolesSettingsPage() {
    const theme = useTheme();
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRows, setSelectedRows] = useState<GridRowId[]>([]);
    const [editorOpen, setEditorOpen] = useState(false);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);

    const fetchRoles = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch('/roles');
            setRoles(data);
        } catch (error: any) {
            toast.error("Failed to load roles");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRoles();
    }, [fetchRoles]);

    const handleCreate = () => {
        setSelectedRole(null);
        setEditorOpen(true);
    };

    const handleEdit = (role: Role) => {
        setSelectedRole(role);
        setEditorOpen(true);
    };

    const handleDelete = async (role: Role) => {
        if (!confirm(`Are you sure you want to delete the role "${role.name}"?`)) return;

        try {
            await apiFetch(`/roles/${role.id}`, { method: 'DELETE' });
            toast.success("Role deleted successfully");
            fetchRoles();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete role");
        }
    };

    const columns: GridColDef[] = [
        {
            field: 'name',
            headerName: 'Role Name',
            flex: 1.5,
            minWidth: 240,
            renderCell: (params: GridRenderCellParams<Role>) => (
                <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {params.row.name}
                    </Typography>
                    {params.row.description && (
                        <Typography variant="caption" color="text.secondary">
                            {params.row.description}
                        </Typography>
                    )}
                </Box>
            ),
        },
        {
            field: 'recordAccess',
            headerName: 'Record Access',
            width: 150,
            renderCell: (params: GridRenderCellParams<Role>) => (
                <Chip
                    label={params.row.permissions?.recordAccess || 'OWN'}
                    size="small"
                    color={
                        params.row.permissions?.recordAccess === 'ALL' ? 'error' :
                            params.row.permissions?.recordAccess === 'TEAM' ? 'primary' : 'default'
                    }
                    variant="outlined"
                    sx={{ fontWeight: 600, borderRadius: '6px' }}
                />
            ),
        },
        {
            field: 'modules',
            headerName: 'Module Permissions',
            flex: 2,
            minWidth: 300,
            renderCell: (params: GridRenderCellParams<Role>) => {
                const modules = params.row.permissions?.modules || {};
                const activeModules = Object.entries(modules)
                    .filter(([_, perms]) => perms === 'full' || (typeof perms === 'object' && Object.values(perms).some(v => v)))
                    .map(([name]) => name);

                return (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>
                        {activeModules.slice(0, 4).map((mod: string) => (
                            <Chip
                                key={mod}
                                label={mod}
                                size="small"
                                sx={{ borderRadius: '4px', fontSize: '0.7rem', height: 20, textTransform: 'capitalize' }}
                            />
                        ))}
                        {activeModules.length > 4 && (
                            <Typography variant="caption" color="text.secondary">
                                +{activeModules.length - 4} more
                            </Typography>
                        )}
                        {activeModules.length === 0 && (
                            <Typography variant="caption" color="text.disabled">No access</Typography>
                        )}
                    </Stack>
                );
            },
        },
        {
            field: 'actions',
            headerName: '',
            type: 'actions',
            width: 100,
            renderCell: (params: GridRenderCellParams<Role>) => (
                <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Edit Role">
                        <IconButton size="small" onClick={() => handleEdit(params.row)}>
                            <EditIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => handleDelete(params.row)}>
                            <DeleteIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                </Stack>
            ),
        },
    ];

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -0.5 }}>Roles & Permissions</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Define granular access levels and record visibility for your team.
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleCreate}
                    sx={{ borderRadius: 28, px: 3 }}
                >
                    Create Custom Role
                </Button>
            </Stack>

            <Card sx={{ height: 600, width: '100%', overflow: 'hidden' }}>
                {loading ? (
                    <TableSkeleton rows={6} columns={4} />
                ) : roles.length === 0 ? (
                    <EmptyState
                        title="No custom roles defined"
                        description="Create roles to manage how different users interact with your CRM data."
                        action={
                            <Button variant="outlined" startIcon={<AddIcon />} onClick={handleCreate}>
                                Create First Role
                            </Button>
                        }
                    />
                ) : (
                    <StandardDataGrid
                        rows={roles}
                        columns={columns}
                        checkboxSelection
                        disableRowSelectionOnClick
                        rowSelectionModel={selectedRows}
                        onRowSelectionModelChange={setSelectedRows}
                    />
                )}
            </Card>

            <RoleEditorDialog
                open={editorOpen}
                onClose={() => setEditorOpen(false)}
                onSuccess={fetchRoles}
                role={selectedRole}
            />
        </Box>
    );
}
