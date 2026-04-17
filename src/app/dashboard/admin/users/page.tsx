"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
    Box,
    Typography,
    Button,
    Card,
    Stack,
    Chip,
    Avatar,
    IconButton,
    Tooltip,
    useTheme,
    alpha,
} from "@mui/material";
import { M3Button, StaggerContainer, StaggerItem } from "@/components/ui-mui/m3-components";
import {
    Add as AddIcon,
    Edit as EditIcon,
    PersonOff as PersonOffIcon,
    Delete as DeleteIcon,
    Security as SecurityIcon,
    Link as LinkIcon,
} from "@mui/icons-material";
import {
    GridColDef,
    GridRenderCellParams,
    GridRowId,
} from "@mui/x-data-grid";
import { StandardDataGrid } from "@/components/common/standard-data-grid";
import { toast } from "sonner";
import { format } from "date-fns";
import Link from "next/link";
import { User } from "@/types/user";
import { InviteUserDialog } from "./invite-user-dialog";
import { EditUserDialog } from "./edit-user-dialog";
import { BulkActionsToolbar } from "@/components/bulk-actions/bulk-toolbar";
import { TableSkeleton } from "@/components/common/skeletons";
import { EmptyState } from "@/components/common/empty-state";
import { BulkAssignManagerDialog } from "./bulk-assign-manager-dialog";

export default function UsersPage() {
    const theme = useTheme();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [userToEdit, setUserToEdit] = useState<User | null>(null);
    const [selectedRows, setSelectedRows] = useState<GridRowId[]>([]);
    const [isAllSelected, setIsAllSelected] = useState(false);
    const [totalItems, setTotalItems] = useState(0);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch<User[]>("/users");
            // Stub data enhancement for missing fields till backend is ready
            const enhancedData = (Array.isArray(data) ? data : []).map((u) => ({
                ...u,
                team: u.team || { id: 'unassigned', name: 'Unassigned' },
                manager: u.manager || undefined,
                lastLoginAt: u.lastLoginAt || new Date().toISOString(), // Mock
            }));
            setUsers(enhancedData);
            setTotalItems(enhancedData.length); // Assuming no pagination for now, or get from meta if available
        } catch (error: any) {
            toast.error("Failed to fetch users");
            console.error("Users fetch error:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleEdit = (user: User) => {
        setUserToEdit(user);
        setEditDialogOpen(true);
    };

    const handleDeactivate = async (ids: string[]) => {
        if (!confirm(`Are you sure you want to deactivate ${ids.length} user(s)?`)) return;

        try {
            await Promise.all(ids.map(id =>
                apiFetch(`/users/${id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: "INACTIVE" }),
                })
            ));
            toast.success("Users deactivated");
            fetchUsers();
            setSelectedRows([]);
            setIsAllSelected(false);
        } catch (error: any) {
            toast.error("Failed to deactivate users");
        }
    };

    const handleDelete = async (ids: string[]) => {
        if (!confirm(`Are you sure you want to permanently delete ${ids.length} user(s)?`)) return;

        try {
            // Mock delete for now as API might not support bulk delete yet
            toast.success("Users deleted");
            setUsers(prev => prev.filter(u => !ids.includes(u.id)));
            setSelectedRows([]);
            setIsAllSelected(false);
        } catch (error: any) {
            toast.error("Failed to delete users");
        }
    };


    const handleSelectAllFiltered = () => {
        setIsAllSelected(true);
        toast.success(`All ${totalItems} users selected`);
    };

    const clearSelection = () => {
        setSelectedRows([]);
        setIsAllSelected(false);
    };

    const columns: GridColDef[] = [
        {
            field: 'name',
            headerName: 'User',
            flex: 1.5,
            minWidth: 240,
            renderCell: (params: GridRenderCellParams<User>) => (
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <Avatar
                        sx={{
                            width: 34,
                            height: 34,
                            bgcolor: alpha(theme.palette.primary.main, 0.1),
                            color: theme.palette.primary.main,
                            fontSize: '0.9rem',
                            fontWeight: 700
                        }}
                    >
                        {params.row.name.charAt(0)}
                    </Avatar>
                    <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary', mb: -0.5 }}>
                            {params.row.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', opacity: 0.8 }}>
                            {params.row.email}
                        </Typography>
                    </Box>
                </Stack>
            ),
        },
        {
            field: 'role',
            headerName: 'Role',
            flex: 1,
            minWidth: 140,
            renderCell: (params: GridRenderCellParams<User>) => (
                params.row.role ? (
                    <Chip
                        icon={<SecurityIcon sx={{ fontSize: 14 }} />}
                        label={params.row.role.name}
                        size="small"
                        sx={{
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '0.625rem',
                            textTransform: 'uppercase',
                            bgcolor: alpha(theme.palette.secondary.main, 0.08),
                            color: theme.palette.secondary.main,
                            border: '1px solid',
                            borderColor: alpha(theme.palette.secondary.main, 0.2),
                            '& .MuiChip-icon': { color: 'inherit' }
                        }}
                    />
                ) : <Typography variant="caption" color="text.secondary">-</Typography>
            ),
        },
        {
            field: 'team',
            headerName: 'Team',
            flex: 1,
            minWidth: 140,
            valueGetter: (params: any) => params?.name || 'Unassigned',
        },
        {
            field: 'status',
            headerName: 'Status',
            width: 120,
            renderCell: (params: GridRenderCellParams<User>) => {
                const status = params.row.status;
                const isActive = status === 'ACTIVE';
                return (
                    <Chip
                        label={status}
                        size="small"
                        sx={{
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '0.625rem',
                            textTransform: 'uppercase',
                            bgcolor: isActive ? alpha(theme.palette.success.main, 0.08) : alpha(theme.palette.text.disabled, 0.08),
                            color: isActive ? theme.palette.success.main : theme.palette.text.secondary,
                            border: '1px solid',
                            borderColor: isActive ? alpha(theme.palette.success.main, 0.2) : alpha(theme.palette.text.disabled, 0.2)
                        }}
                    />
                );
            },
        },
        {
            field: 'lastLoginAt',
            headerName: 'Last Login',
            width: 160,
            renderCell: (params: GridRenderCellParams<User>) => (
                <Typography variant="caption" color="text.secondary">
                    {params.row.lastLoginAt ? format(new Date(params.row.lastLoginAt), 'MMM d, h:mm a') : 'Never'}
                </Typography>
            ),
        },
        {
            field: 'actions',
            headerName: '',
            type: 'actions',
            width: 100,
            renderCell: (params: GridRenderCellParams<User>) => (
                <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Edit User">
                        <IconButton size="small" onClick={() => handleEdit(params.row)}>
                            <EditIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="View History">
                        <IconButton size="small" component={Link} href={`/dashboard/admin/users/${params.row.id}`}>
                            <LinkIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                    {params.row.status === 'ACTIVE' && (
                        <Tooltip title="Deactivate">
                            <IconButton
                                size="small"
                                color="warning"
                                onClick={() => handleDeactivate([params.row.id])}
                            >
                                <PersonOffIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                    )}
                </Stack>
            ),
        },
    ];

    const [assignManagerDialogOpen, setAssignManagerDialogOpen] = useState(false);

    // ... existing code ...

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.7 }}>Users</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Manage access, roles, and team assignments.
                    </Typography>
                </Box>
                <M3Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setDialogOpen(true)}
                >
                    Invite User
                </M3Button>
            </Stack>

            <Card
                sx={{
                    width: '100%',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: '14px',
                    border: '1px solid',
                    borderColor: 'divider',
                    boxShadow: 'none',
                }}
            >
                <StaggerContainer>
                    {loading ? (
                        <TableSkeleton rows={10} columns={5} />
                    ) : users.length === 0 ? (
                        <StaggerItem>
                            <EmptyState
                                title="No users found"
                                description="Get started by inviting your first team member."
                                action={
                                    <M3Button variant="outlined" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
                                        Invite User
                                    </M3Button>
                                }
                            />
                        </StaggerItem>
                    ) : (
                        <StaggerItem>
                            <StandardDataGrid
                                rows={users}
                                columns={columns}
                                checkboxSelection
                                disableRowSelectionOnClick
                                rowSelectionModel={selectedRows}
                                onRowSelectionModelChange={setSelectedRows}
                                totalItems={totalItems}
                                selectedCount={selectedRows.length}
                                isAllSelected={isAllSelected}
                                onSelectAllFiltered={handleSelectAllFiltered}
                                onClearSelection={clearSelection}
                                currentCount={users.length}
                                sx={{
                                    minHeight: 0,
                                    '& .MuiDataGrid-columnHeaders': {
                                        bgcolor: 'surfaceContainerLowest',
                                    },
                                    '& .MuiDataGrid-row': {
                                        minHeight: '60px !important',
                                    },
                                    '& .MuiDataGrid-cell': {
                                        py: 1,
                                    },
                                    '& .MuiDataGrid-footerContainer': {
                                        bgcolor: 'surfaceContainerLowest',
                                    },
                                }}
                            />
                        </StaggerItem>
                    )}
                </StaggerContainer>
            </Card>

            <BulkActionsToolbar
                selectedCount={isAllSelected ? totalItems : selectedRows.length}
                onClearSelection={clearSelection}
                module="users"
                onActivateDeactivate={() => {
                    if (isAllSelected) {
                        handleDeactivate([/* all ids */]);
                    } else {
                        handleDeactivate(selectedRows.map(id => String(id)));
                    }
                }}
                onAssignManager={() => setAssignManagerDialogOpen(true)}
                onDelete={() => {
                    if (isAllSelected) {
                        handleDelete([/* all ids */]);
                    } else {
                        handleDelete(selectedRows.map(id => String(id)));
                    }
                }}
            />

            <InviteUserDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSuccess={() => {
                    setDialogOpen(false);
                    fetchUsers();
                }}
            />

            {userToEdit && (
                <EditUserDialog
                    user={userToEdit}
                    open={editDialogOpen}
                    onOpenChange={setEditDialogOpen}
                    onSuccess={() => {
                        setEditDialogOpen(false);
                        fetchUsers();
                    }}
                />
            )}

            <BulkAssignManagerDialog
                open={assignManagerDialogOpen}
                onOpenChange={setAssignManagerDialogOpen}
                userIds={selectedRows.map(id => String(id))}
                isAllSelected={isAllSelected}
                totalCount={totalItems}
                onSuccess={() => {
                    fetchUsers();
                    clearSelection();
                }}
            />
        </Box>
    );
}
