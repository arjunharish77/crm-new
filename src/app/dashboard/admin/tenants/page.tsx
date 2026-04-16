"use client";

import { useEffect, useState, useCallback } from "react";
import {
    Box,
    Typography,
    Button,
    Chip,
    IconButton,
    Menu,
    MenuItem,
    Stack,
    alpha,
    useTheme,
    ListItemIcon,
    ListItemText,
    Avatar,
    Tooltip
} from "@mui/material";
import {
    Add as AddIcon,
    MoreVert as MoreVertIcon,
    Settings as SettingsIcon,
    Block as BlockIcon,
    CheckCircle as CheckCircleIcon,
    Business as BusinessIcon
} from "@mui/icons-material";
import { GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import { StandardDataGrid } from "@/components/common/standard-data-grid";
import { useAuth } from "@/providers/auth-provider";
import { toast } from "sonner";
import { FeaturesDialog } from "@/components/admin/features-dialog";
import { CreateTenantDialog } from "@/components/admin/create-tenant-dialog";
import { apiFetch } from "@/lib/api";
import { format } from "date-fns";

interface Tenant {
    id: string;
    name: string;
    plan: string;
    status: string;
    createdAt: string;
    _count: {
        users: number;
        leads: number;
        opportunities: number;
    };
}

export default function TenantsPage() {
    const theme = useTheme();
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const { token, user } = useAuth();

    // Menu State
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
    const menuOpen = Boolean(anchorEl);

    const fetchTenants = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/platform-admin/tenants`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setTenants(data);
            } else {
                toast.error("Failed to fetch tenants");
            }
        } catch (error) {
            toast.error("Failed to load tenants");
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchTenants();
    }, [fetchTenants]);

    const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, tenant: Tenant) => {
        setAnchorEl(event.currentTarget);
        setSelectedTenant(tenant);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
        setSelectedTenant(null);
    };

    const updateTenantStatus = async (status: string) => {
        if (!selectedTenant) return;
        try {
            await apiFetch(`/platform-admin/tenants/${selectedTenant.id}/status`, {
                method: "PATCH",
                body: JSON.stringify({ status }),
            });
            toast.success(`Tenant ${status.toLowerCase()}d successfully`);
            fetchTenants();
            handleMenuClose();
        } catch (error: any) {
            toast.error(error.message || "Failed to update tenant status");
        }
    };

    const columns: GridColDef[] = [
        {
            field: 'name',
            headerName: 'Organization',
            flex: 1.5,
            minWidth: 250,
            renderCell: (params: GridRenderCellParams<Tenant>) => (
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ height: '100%' }}>
                    <Avatar
                        sx={{
                            width: 36,
                            height: 36,
                            bgcolor: alpha(theme.palette.primary.main, 0.1),
                            color: theme.palette.primary.main,
                            borderRadius: '8px'
                        }}
                    >
                        <BusinessIcon sx={{ fontSize: 20 }} />
                    </Avatar>
                    <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                            {params.row.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', opacity: 0.7 }}>
                            ID: {params.row.id.substring(0, 8)}...
                        </Typography>
                    </Box>
                </Stack>
            )
        },
        {
            field: 'plan',
            headerName: 'Plan',
            width: 140,
            renderCell: (params: GridRenderCellParams<Tenant>) => (
                <Chip
                    label={params.value}
                    size="small"
                    sx={{
                        fontWeight: 700,
                        fontSize: '0.625rem',
                        textTransform: 'uppercase',
                        borderRadius: '6px',
                        bgcolor: alpha(theme.palette.secondary.main, 0.08),
                        color: theme.palette.secondary.main,
                        border: '1px solid',
                        borderColor: alpha(theme.palette.secondary.main, 0.2)
                    }}
                />
            )
        },
        {
            field: 'status',
            headerName: 'Status',
            width: 140,
            renderCell: (params: GridRenderCellParams<Tenant>) => {
                const status = params.value as string;
                const isActive = status === 'ACTIVE';
                const color = status === 'SUSPENDED' ? theme.palette.error.main :
                    status === 'TRIAL' ? theme.palette.warning.main :
                        status === 'ACTIVE' ? theme.palette.success.main :
                            theme.palette.text.disabled;

                return (
                    <Chip
                        label={status}
                        size="small"
                        sx={{
                            fontWeight: 700,
                            fontSize: '0.625rem',
                            textTransform: 'uppercase',
                            borderRadius: '6px',
                            bgcolor: alpha(color, 0.08),
                            color: color,
                            border: '1px solid',
                            borderColor: alpha(color, 0.2)
                        }}
                    />
                );
            }
        },
        {
            field: 'users',
            headerName: 'Users',
            width: 100,
            valueGetter: (params, row: Tenant) => row._count.users,
            renderCell: (params) => (
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{params.value}</Typography>
            )
        },
        {
            field: 'data',
            headerName: 'Data Usage',
            width: 180,
            renderCell: (params: GridRenderCellParams<Tenant>) => (
                <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{params.row._count.leads} Leads</Typography>
                    <Typography variant="caption" color="text.secondary">{params.row._count.opportunities} Opportunities</Typography>
                </Box>
            )
        },
        {
            field: 'createdAt',
            headerName: 'Created',
            width: 140,
            renderCell: (params) => (
                <Typography variant="caption" color="text.secondary">
                    {format(new Date(params.value as string), 'MMM d, yyyy')}
                </Typography>
            )
        },
        {
            field: 'actions',
            headerName: '',
            type: 'actions',
            width: 140,
            renderCell: (params: GridRenderCellParams<Tenant>) => (
                <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                    <FeaturesDialog
                        tenantId={params.row.id}
                        tenantName={params.row.name}
                        trigger={
                            <Tooltip title="Manage Features">
                                <IconButton size="small">
                                    <SettingsIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                            </Tooltip>
                        }
                    />
                    <IconButton
                        size="small"
                        onClick={(e) => handleMenuOpen(e, params.row)}
                    >
                        <MoreVertIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Stack>
            )
        }
    ];

    if (!user?.isPlatformAdmin) {
        return (
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>Access Denied</Typography>
                <Typography color="text.secondary">You do not have platform administrator privileges.</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto' }}>
            {/* Header */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -0.5 }}>Tenants</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Platform administration and multi-tenant management
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setCreateDialogOpen(true)}
                    sx={{ borderRadius: '12px', px: 3, py: 1 }}
                >
                    Create Tenant
                </Button>
            </Stack>

            <Box sx={{ height: 'calc(100vh - 250px)', minHeight: 600 }}>
                <StandardDataGrid
                    rows={tenants}
                    columns={columns}
                    loading={loading}
                    rowHeight={72}
                />
            </Box>

            <Menu
                anchorEl={anchorEl}
                open={menuOpen}
                onClose={handleMenuClose}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                PaperProps={{
                    sx: { minWidth: 200, borderRadius: '12px', mt: 1 }
                }}
            >
                {selectedTenant?.status === 'ACTIVE' ? (
                    <MenuItem onClick={() => updateTenantStatus('SUSPENDED')} sx={{ color: 'error.main' }}>
                        <ListItemIcon><BlockIcon fontSize="small" sx={{ color: 'inherit' }} /></ListItemIcon>
                        <ListItemText>Suspend Tenant</ListItemText>
                    </MenuItem>
                ) : (
                    <MenuItem onClick={() => updateTenantStatus('ACTIVE')} sx={{ color: 'success.main' }}>
                        <ListItemIcon><CheckCircleIcon fontSize="small" sx={{ color: 'inherit' }} /></ListItemIcon>
                        <ListItemText>Activate Tenant</ListItemText>
                    </MenuItem>
                )}
            </Menu>

            <CreateTenantDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                onSuccess={fetchTenants}
            />
        </Box>
    );
}
