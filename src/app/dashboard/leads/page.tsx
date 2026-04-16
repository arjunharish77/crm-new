'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Lead } from "@/types/leads";
import { PaginatedResponse } from "@/types/common";
import { apiFetch } from "@/lib/api";
import {
    Box,
    Typography,
    Button,
    Card,
    CardContent,
    Stack,
    IconButton,
    Tooltip,
    Chip,
    Avatar,
    Paper,
    useTheme,
    alpha,
} from "@mui/material";
import { M3Button, StaggerContainer, StaggerItem } from "@/components/ui-mui/m3-components";
import {
    GridColDef,
    GridPaginationModel,
    GridRowId,
} from "@mui/x-data-grid";
import { StandardDataGrid } from "@/components/common/standard-data-grid";
import {
    FilterAlt as FilterIcon,
    Visibility as ViewIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    Link as LinkIcon,
} from "@mui/icons-material";
import { format } from "date-fns";
import { toast } from "sonner";
import Link from "next/link";
import { CreateLeadDialog } from "./create-lead-dialog";
import { RecordPreview } from "@/components/common/record-preview";
import { BulkActionsToolbar } from "@/components/bulk-actions/bulk-toolbar";
import { EmptyState } from "@/components/common/empty-state";
import { EditLeadDialog } from "./edit-lead-dialog";
import { AdvancedFilterModal, FilterGroup } from "@/components/filters/advanced-filter-modal";

export default function LeadsPage() {
    const theme = useTheme();
    const [data, setData] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalItems, setTotalItems] = useState(0);
    const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
        page: 0,
        pageSize: 10,
    });
    const [isAllSelected, setIsAllSelected] = useState(false);
    const [selectedRows, setSelectedRows] = useState<GridRowId[]>([]);
    const [quickViewLeadId, setQuickViewLeadId] = useState<string | null>(null);
    const [editLeadOpen, setEditLeadOpen] = useState(false);
    const [leadToEdit, setLeadToEdit] = useState<Lead | null>(null);
    const [filterOpen, setFilterOpen] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('page', (paginationModel.page + 1).toString());
            params.set('limit', paginationModel.pageSize.toString());

            const response = await apiFetch<PaginatedResponse<Lead> | Lead[]>(`/leads?${params.toString()}`);

            if ('meta' in response && response.data) {
                setData(response.data);
                setTotalItems(response.meta.total);
            } else if (Array.isArray(response)) {
                // Fallback for non-paginated endpoints
                setData(response);
                setTotalItems(response.length);
            }
        } catch (error) {
            console.error("Fetch error:", error);
            toast.error("Failed to fetch leads");
        } finally {
            setLoading(false);
        }
    }, [paginationModel]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleEdit = (lead: Lead) => {
        setLeadToEdit(lead);
        setEditLeadOpen(true);
    };

    const columns: GridColDef[] = [
        {
            field: 'name',
            headerName: 'Lead Name',
            flex: 1,
            minWidth: 220,
            renderCell: (params) => (
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ height: '100%' }}>
                    <Avatar
                        sx={{
                            width: 32,
                            height: 32,
                            fontSize: '0.875rem',
                            bgcolor: alpha(theme.palette.primary.main, 0.1),
                            color: theme.palette.primary.main,
                            fontWeight: 700
                        }}
                    >
                        {(params.value as string)?.[0] || 'L'}
                    </Avatar>
                    <Box component={Link} href={`/dashboard/leads/${params.row.id}`} sx={{
                        color: 'primary.main',
                        textDecoration: 'none',
                        fontWeight: 700,
                        '&:hover': { textDecoration: 'underline' }
                    }}>
                        {params.value}
                    </Box>
                </Stack>
            ),
        },
        {
            field: 'email',
            headerName: 'Email',
            flex: 1,
            minWidth: 200,
            renderCell: (params) => (
                <Typography variant="body2" color="text.secondary">
                    {params.value}
                </Typography>
            )
        },
        {
            field: 'status',
            headerName: 'Status',
            width: 140,
            renderCell: (params) => {
                const status = params.value as string;
                const getStatusColor = (s: string) => {
                    switch (s) {
                        case 'NEW': return theme.palette.primary;
                        case 'QUALIFIED': return theme.palette.success;
                        case 'LOST': return theme.palette.error;
                        case 'CONVERTED': return theme.palette.secondary;
                        default: return theme.palette.info;
                    }
                };
                const color = getStatusColor(status);
                return (
                    <Chip
                        label={status}
                        size="small"
                        sx={{
                            fontWeight: 700,
                            fontSize: '0.625rem',
                            borderRadius: '6px',
                            textTransform: 'uppercase',
                            bgcolor: alpha(color.main, 0.08),
                            color: color.main,
                            border: '1px solid',
                            borderColor: alpha(color.main, 0.2)
                        }}
                    />
                );
            }
        },
        {
            field: 'source',
            headerName: 'Source',
            width: 130,
            renderCell: (params) => (
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    {params.value}
                </Typography>
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
            width: 80,
            renderCell: (params) => (
                <Stack direction="row" spacing={0.5}>
                    <Tooltip title="View Preview">
                        <IconButton size="small" onClick={() => setQuickViewLeadId(params.row.id as string)}>
                            <ViewIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Open Detail">
                        <IconButton size="small" component={Link} href={`/dashboard/leads/${params.row.id}`}>
                            <LinkIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => handleEdit(params.row as Lead)}>
                            <EditIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                </Stack>
            )
        }
    ];


    const handleSelectAllFiltered = () => {
        const visibleLeadIds = data.map((lead) => lead.id);
        setSelectedRows(visibleLeadIds);
        setIsAllSelected(false);
        toast.success(`${visibleLeadIds.length} leads on this page selected`);
    };

    const clearSelection = () => {
        setSelectedRows([]);
        setIsAllSelected(false);
    };

    const handleDelete = async () => {
        const count = isAllSelected ? totalItems : selectedRows.length;
        if (!confirm(`Are you sure you want to delete ${count} leads?`)) return;

        try {
            await apiFetch('/leads/bulk', {
                method: 'DELETE',
                body: JSON.stringify({
                    ids: isAllSelected ? [] : selectedRows,
                    all: isAllSelected,
                })
            });

            toast.success('Leads deleted');
            fetchData();
            clearSelection();
        } catch (e) {
            toast.error('Failed to delete leads');
        }
    };

    return (
        <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -0.5 }}>Leads</Typography>
                    <Typography variant="body2" color="text.secondary">Manage and track your sales prospects</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <M3Button
                        variant="outlined"
                        startIcon={<FilterIcon />}
                        onClick={() => setFilterOpen(true)}
                    >
                        Filters
                    </M3Button>
                    <CreateLeadDialog onSuccess={fetchData} />
                </Box>
            </Box>

            <AdvancedFilterModal
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                fields={[
                    { label: 'Name', key: 'name', type: 'text' },
                    { label: 'Email', key: 'email', type: 'text' },
                    {
                        label: 'Status', key: 'status', type: 'select', options: [
                            { label: 'New', value: 'NEW' },
                            { label: 'Qualified', value: 'QUALIFIED' },
                            { label: 'Contacted', value: 'CONTACTED' },
                            { label: 'Lost', value: 'LOST' },
                            { label: 'Converted', value: 'CONVERTED' }
                        ]
                    },
                    { label: 'Source', key: 'source', type: 'text' },
                ]}
                onApply={(filters: FilterGroup[]) => {
                    // Refresh data with new filters (serialized as JSON for header/query)
                    const params = new URLSearchParams();
                    params.set('page', '1');
                    params.set('limit', paginationModel.pageSize.toString());
                    params.set('filters', JSON.stringify(filters));

                    setLoading(true);
                    apiFetch(`/leads?${params.toString()}`)
                        .then((res: any) => {
                            if (res.data) {
                                setData(res.data);
                                setTotalItems(res.meta?.total || res.data.length);
                            }
                        })
                        .catch(() => toast.error("Failed to filter leads"))
                        .finally(() => setLoading(false));
                }}
            />

            <Card sx={{
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                borderRadius: '24px',
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'surfaceContainerLow',
                overflow: 'hidden'
            }}>
                {data.length === 0 && !loading ? (
                    <EmptyState
                        icon={<FilterIcon sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.5 }} />}
                        title="No leads found"
                        description="Get started by adding your first lead."
                        action={<CreateLeadDialog onSuccess={fetchData} />}
                    />
                ) : (
                    <Box sx={{ width: '100%', overflowX: 'auto' }}>
                        <Box sx={{ minWidth: 800, height: '100%' }}>
                            <StandardDataGrid
                                rows={data}
                                columns={columns}
                                loading={loading}
                                paginationMode="server"
                                rowCount={totalItems}
                                paginationModel={paginationModel}
                                onPaginationModelChange={setPaginationModel}
                                checkboxSelection
                                disableRowSelectionOnClick
                                rowSelectionModel={selectedRows}
                                onRowSelectionModelChange={(rows) => {
                                    setSelectedRows(rows);
                                    if (isAllSelected) {
                                        setIsAllSelected(false);
                                    }
                                }}
                                getRowId={(row: any) => row.id}
                                onRowClick={(params) => setQuickViewLeadId(params.row.id as string)}
                                totalItems={totalItems}
                                selectedCount={selectedRows.length}
                                isAllSelected={isAllSelected}
                                onSelectAllFiltered={handleSelectAllFiltered}
                                onClearSelection={clearSelection}
                                currentCount={data.length}
                            />
                        </Box>
                    </Box>
                )}
            </Card>

            <BulkActionsToolbar
                selectedCount={isAllSelected ? totalItems : selectedRows.length}
                onClearSelection={clearSelection}
                module="leads"
                onDelete={handleDelete}
            />

            <RecordPreview
                entityType="lead"
                entityId={quickViewLeadId}
                isOpen={!!quickViewLeadId}
                onClose={() => setQuickViewLeadId(null)}
            />

            {leadToEdit && (
                <EditLeadDialog
                    open={editLeadOpen}
                    onOpenChange={setEditLeadOpen}
                    lead={leadToEdit}
                    onSuccess={fetchData}
                />
            )}
        </Box>
    );
}
