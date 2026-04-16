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
    IconButton,
    Tooltip,
    useTheme,
    alpha,
} from "@mui/material";
import {
    DataGrid,
    GridColDef,
    GridRowSelectionModel,
    GridRowId
} from "@mui/x-data-grid";
import {
    MoreVert as MoreIcon,
    Add as AddIcon,
    Block as BlockIcon,
    CheckCircle as CheckCircleIcon,
    Delete as DeleteIcon
} from "@mui/icons-material";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { CreateTenantDialog } from "./create-tenant-dialog";
import { BulkActionsToolbar } from "@/components/bulk-actions/bulk-toolbar";
import { useRouter } from "next/navigation";

export default function TenantsPage() {
    const theme = useTheme();
    const router = useRouter();
    const [tenants, setTenants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRows, setSelectedRows] = useState<any>([]);
    const [isAllSelected, setIsAllSelected] = useState(false);
    const [totalItems, setTotalItems] = useState(0);

    const fetchTenants = useCallback(() => {
        setLoading(true);
        apiFetch('/platform-admin/tenants')
            .then((data) => {
                const safeData = Array.isArray(data) ? data : [];
                setTenants(safeData);
                setTotalItems(safeData.length);
            })
            .catch(() => toast.error("Failed to load tenants"))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchTenants();
    }, [fetchTenants]);

    const handleSuspend = async (tenantId: string, currentStatus: string) => {
        const isSuspended = currentStatus === 'SUSPENDED';
        const action = isSuspended ? 'unsuspend' : 'suspend';

        if (!confirm(`Are you sure you want to ${action} this tenant?`)) return;

        try {
            await apiFetch(`/platform-admin/tenants/${tenantId}/${action}`, {
                method: 'POST',
                body: isSuspended ? undefined : JSON.stringify({ reason: 'Admin Action' })
            });
            toast.success(`Tenant ${action}ed`);
            fetchTenants();
        } catch (error) {
            toast.error(`Failed to ${action} tenant`);
        }
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Are you sure you want to delete ${selectedRows.length} tenants?`)) return;
        // Mock bulk delete
        toast.success("Tenants deleted (mock)");
        setTenants(prev => prev.filter(t => !selectedRows.includes(t.id)));
        setSelectedRows([]);
        setIsAllSelected(false);
    };

    const handleSelectionChange = (newSelection: any) => {
        setSelectedRows(newSelection);
        if (isAllSelected && newSelection.length !== totalItems) {
            setIsAllSelected(false);
        }
    };

    const handleSelectAllFiltered = () => {
        setIsAllSelected(true);
        toast.success(`All ${totalItems} tenants selected`);
    };

    const clearSelection = () => {
        setSelectedRows([]);
        setIsAllSelected(false);
    };

    const columns: GridColDef[] = [
        {
            field: 'name',
            headerName: 'Name',
            flex: 1.5,
            minWidth: 200,
            renderCell: (params) => (
                <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                        {params.value}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {params.row.id.substring(0, 8)}...
                    </Typography>
                </Box>
            ),
        },
        {
            field: 'status',
            headerName: 'Status',
            width: 120,
            renderCell: (params) => {
                const isSuspended = params.value === 'SUSPENDED';
                return (
                    <Chip
                        label={params.value}
                        size="small"
                        color={isSuspended ? 'error' : 'success'}
                        variant={isSuspended ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 600, borderRadius: '6px' }}
                    />
                );
            },
        },
        {
            field: 'plan',
            headerName: 'Plan',
            width: 120,
            renderCell: (params) => (
                <Chip
                    label={params.value}
                    size="small"
                    sx={{
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        color: theme.palette.primary.main,
                        fontWeight: 600,
                        fontSize: '0.75rem'
                    }}
                />
            ),
        },
        {
            field: '_count',
            headerName: 'Users',
            width: 100,
            valueGetter: (params: any) => params?.users || 0,
            renderCell: (params) => (
                <Typography variant="body2" color="text.secondary">
                    {params.value} users
                </Typography>
            )
        },
        {
            field: 'createdAt',
            headerName: 'Created',
            width: 150,
            renderCell: (params) => (
                <Typography variant="caption" color="text.secondary">
                    {formatDistanceToNow(new Date(params.value), { addSuffix: true })}
                </Typography>
            ),
        },
        {
            field: 'actions',
            headerName: '',
            type: 'actions',
            width: 100,
            renderCell: (params) => (
                <Stack direction="row" spacing={1}>
                    <Tooltip title={params.row.status === 'SUSPENDED' ? "Unsuspend" : "Suspend"}>
                        <IconButton
                            size="small"
                            color={params.row.status === 'SUSPENDED' ? "success" : "warning"}
                            onClick={() => handleSuspend(params.row.id, params.row.status)}
                        >
                            {params.row.status === 'SUSPENDED' ? <CheckCircleIcon fontSize="small" /> : <BlockIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                </Stack>
            ),
        },
    ];

    return (
        <Box sx={{ p: 3, maxWidth: 1600, mx: 'auto' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -0.5 }}>Tenants</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Manage workspaces and subscriptions.
                    </Typography>
                </Box>
                <CreateTenantDialog onSuccess={fetchTenants} />
            </Stack>

            <Card sx={{ height: 600, width: '100%', overflow: 'hidden' }}>
                <DataGrid
                    rows={tenants || []}
                    columns={columns}
                    loading={loading}
                    checkboxSelection
                    disableRowSelectionOnClick
                    rowSelectionModel={selectedRows}
                    onRowSelectionModelChange={handleSelectionChange}
                    getRowId={(row) => row?.id || Math.random().toString()}
                    slots={{
                        toolbar: CustomToolbar,
                    }}
                    slotProps={{
                        toolbar: {
                            totalItems: totalItems,
                            selectedCount: selectedRows.length,
                            isAllSelected,
                            onSelectAllFiltered: handleSelectAllFiltered,
                            onClear: clearSelection,
                            currentCount: (tenants || []).length
                        } as any
                    }}
                    sx={{
                        border: 'none',
                        '& .MuiDataGrid-columnHeaders': {
                            bgcolor: alpha(theme.palette.primary.main, 0.02),
                        },
                    }}
                />
            </Card>

            <BulkActionsToolbar
                selectedCount={isAllSelected ? totalItems : selectedRows.length}
                onClearSelection={clearSelection}
                module="tenants"
                onDelete={handleBulkDelete}
            />
        </Box>
    );
}

function CustomToolbar({ totalItems, selectedCount, isAllSelected, onSelectAllFiltered, onClear, currentCount }: any) {
    const showSelectAllOption = selectedCount > 0 && selectedCount === currentCount && totalItems > currentCount && !isAllSelected;

    return (
        <Box sx={{ p: 0, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
            {showSelectAllOption && (
                <Box sx={{
                    p: 1,
                    bgcolor: 'primary.lighter',
                    display: 'flex',
                    justifyContent: 'center',
                    borderTop: '1px solid',
                    borderColor: 'divider'
                }}>
                    <Typography variant="body2">
                        All {currentCount} tenants on this page are selected.
                        <Button
                            size="small"
                            onClick={onSelectAllFiltered}
                            sx={{ ml: 1, textTransform: 'none', fontWeight: 600 }}
                        >
                            Select all {totalItems} tenants
                        </Button>
                    </Typography>
                </Box>
            )}

            {isAllSelected && (
                <Box sx={{
                    p: 1,
                    bgcolor: 'primary.lighter',
                    display: 'flex',
                    justifyContent: 'center',
                    borderTop: '1px solid',
                    borderColor: 'divider'
                }}>
                    <Typography variant="body2" fontWeight={600} color="primary.main">
                        All {totalItems} tenants are selected.
                        <Button
                            size="small"
                            onClick={onClear}
                            sx={{ ml: 1, textTransform: 'none' }}
                        >
                            Clear selection
                        </Button>
                    </Typography>
                </Box>
            )}
        </Box>
    );
}
