"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Opportunity, OpportunityType } from "@/types/opportunities";
import { PaginatedResponse } from "@/types/common";
import { apiFetch } from "@/lib/api";
import {
    Box,
    Typography,
    Button,
    Card,
    Stack,
    IconButton,
    Tooltip,
    Tabs,
    Tab,
    ToggleButtonGroup,
    ToggleButton,
    Divider,
    Select,
    MenuItem,
    Chip,
    alpha,
    useTheme
} from "@mui/material";
import { M3Button, StaggerContainer, StaggerItem } from "@/components/ui-mui/m3-components";
import {
    List as ListIcon,
    ViewKanban as KanbanIcon,
    BarChart as AnalyticsIcon,
    Add as AddIcon,
    FilterAlt as FilterIcon,
    Edit as EditIcon,
    Visibility as ViewIcon,
    Link as LinkIcon
} from "@mui/icons-material";
import {
    GridColDef,
    GridPaginationModel,
    GridRowId,
} from "@mui/x-data-grid";
import { StandardDataGrid } from "@/components/common/standard-data-grid";
import { toast } from "sonner";
import Link from "next/link";
import { CreateOpportunityDialog } from "./create-opportunity-dialog";
import { EditOpportunityDialog } from "./edit-opportunity-dialog";
import { KanbanBoard } from "@/components/opportunities/kanban-board";
import { PipelineAnalytics } from "@/components/opportunities/pipeline-analytics";
import { BulkActionsToolbar } from "@/components/bulk-actions/bulk-toolbar";
import { formatCurrency } from "@/lib/utils";
import { FeatureGate } from "@/components/auth/feature-gate";
import { TableSkeleton } from "@/components/common/skeletons";
import { EmptyState } from "@/components/common/empty-state";

export default function OpportunitiesPage() {
    const theme = useTheme();
    const [data, setData] = useState<Opportunity[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'LIST' | 'KANBAN' | 'ANALYTICS'>('KANBAN');
    const [opportunityTypes, setOpportunityTypes] = useState<OpportunityType[]>([]);
    const [selectedType, setSelectedType] = useState<OpportunityType | null>(null);

    const [selectedRows, setSelectedRows] = useState<any>([]);
    const [isAllSelected, setIsAllSelected] = useState(false);
    const [totalItems, setTotalItems] = useState(0);

    const [editOpportunityOpen, setEditOpportunityOpen] = useState(false);
    const [opportunityToEdit, setOpportunityToEdit] = useState<Opportunity | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const response = await apiFetch<PaginatedResponse<Opportunity> | Opportunity[]>('/opportunities?limit=100');

            if ('meta' in response && response.data) {
                setData(response.data);
                setTotalItems(response.meta.total);
            } else if (Array.isArray(response)) {
                setData(response);
                setTotalItems(response.length);
            }
        } catch (error) {
            toast.error("Failed to fetch opportunities");
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchTypes = useCallback(async () => {
        try {
            const data = await apiFetch<OpportunityType[]>("/opportunity-types");
            const types = Array.isArray(data) ? data : [];
            setOpportunityTypes(types);
            if (types.length > 0 && !selectedType) {
                setSelectedType(types[0]);
            }
        } catch (error) {
            toast.error("Failed to load opportunity types");
        }
    }, [selectedType]);

    useEffect(() => {
        fetchTypes();
        fetchData();
    }, [fetchTypes, fetchData]);

    const handleViewChange = (event: React.MouseEvent<HTMLElement>, nextView: 'LIST' | 'KANBAN' | 'ANALYTICS' | null) => {
        if (nextView !== null) {
            setViewMode(nextView);
        }
    };

    const handleEdit = (opportunity: Opportunity) => {
        setOpportunityToEdit(opportunity);
        setEditOpportunityOpen(true);
    };

    const updateOpportunityStage = async (id: string, stageId: string) => {
        const originalData = [...data];
        // Optimistic update
        setData(data.map(opp =>
            opp.id === id ? { ...opp, stageId } : opp
        ) as Opportunity[]);

        try {
            await apiFetch(`/opportunities/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ stageId }),
            });
            toast.success("Stage updated");
        } catch (error) {
            toast.error("Failed to update stage");
            setData(originalData);
        }
    };

    const handleDelete = async (ids: string[]) => {
        if (!confirm(`Are you sure you want to delete ${ids.length} opportunities?`)) return;
        try {
            await Promise.all(ids.map(id => apiFetch(`/opportunities/${id}`, { method: 'DELETE' })));
            setData(prev => prev.filter(o => !ids.includes(o.id)));
            toast.success(`${ids.length} opportunity${ids.length > 1 ? 'ies' : ''} deleted`);
            setSelectedRows([]);
            setIsAllSelected(false);
        } catch (error) {
            toast.error("Failed to delete opportunities");
        }
    };


    const handleSelectAllFiltered = () => {
        setIsAllSelected(true);
        toast.success(`All ${totalItems} opportunities selected`);
    };

    const clearSelection = () => {
        setSelectedRows([]);
        setIsAllSelected(false);
    };

    const columns: GridColDef[] = [
        {
            field: 'title',
            headerName: 'Opportunity',
            flex: 1,
            minWidth: 220,
            renderCell: (params) => (
                <Box
                    component={Link}
                    href={`/dashboard/opportunities/${params.row.id}`}
                    sx={{
                        color: 'primary.main',
                        textDecoration: 'none',
                        fontWeight: 700,
                        '&:hover': { textDecoration: 'underline' },
                        display: 'flex',
                        alignItems: 'center',
                        height: '100%'
                    }}
                >
                    {params.value}
                </Box>
            )
        },
        {
            field: 'amount',
            headerName: 'Value',
            width: 150,
            renderCell: (params) => (
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    {formatCurrency(params.value as number)}
                </Typography>
            )
        },
        {
            field: 'stage',
            headerName: 'Stage',
            width: 180,
            renderCell: (params) => (
                <Chip
                    label={params.value?.name || 'N/A'}
                    size="small"
                    sx={{
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '0.625rem',
                        textTransform: 'uppercase',
                        bgcolor: params.value?.color ? alpha(params.value.color, 0.08) : 'action.hover',
                        color: params.value?.color || 'text.secondary',
                        border: '1px solid',
                        borderColor: params.value?.color ? alpha(params.value.color, 0.2) : 'divider'
                    }}
                />
            )
        },
        {
            field: 'priority',
            headerName: 'Priority',
            width: 120,
            renderCell: (params) => (
                <Chip
                    label={params.value}
                    size="small"
                    sx={{
                        fontWeight: 700,
                        fontSize: '0.625rem',
                        textTransform: 'uppercase',
                        borderRadius: '6px',
                        bgcolor: params.value === 'HIGH' ? alpha(theme.palette.error.main, 0.08) :
                            params.value === 'MEDIUM' ? alpha(theme.palette.warning.main, 0.08) :
                                alpha(theme.palette.info.main, 0.08),
                        color: params.value === 'HIGH' ? theme.palette.error.main :
                            params.value === 'MEDIUM' ? theme.palette.warning.main :
                                theme.palette.info.main,
                        border: '1px solid',
                        borderColor: params.value === 'HIGH' ? alpha(theme.palette.error.main, 0.2) :
                            params.value === 'MEDIUM' ? alpha(theme.palette.warning.main, 0.2) :
                                alpha(theme.palette.info.main, 0.2),
                    }}
                />
            )
        },
        {
            field: 'actions',
            headerName: '',
            type: 'actions',
            width: 120,
            renderCell: (params) => (
                <Stack direction="row" spacing={0.5}>
                    <Tooltip title="View Preview">
                        <IconButton size="small" onClick={() => {/* Existing logic for preview if any */ }}>
                            <ViewIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Open Detail">
                        <IconButton size="small" component={Link} href={`/dashboard/opportunities/${params.row.id}`}>
                            <LinkIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => handleEdit(params.row as Opportunity)}>
                            <EditIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                </Stack>
            )
        }
    ];

    const kanbanOpportunities = useMemo(() =>
        selectedType ? data.filter(opp => opp.opportunityTypeId === selectedType.id) : data,
        [data, selectedType]
    );

    useEffect(() => {
        clearSelection();
    }, [selectedType?.id, viewMode]);

    return (
        <FeatureGate
            feature="opportunityEnabled"
            fallback={
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <Typography color="text.secondary">The Opportunities module is disabled for your tenant.</Typography>
                </Box>
            }
        >
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Box sx={{ px: 2, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Typography variant="h5" fontWeight={700}>Opportunities</Typography>
                        {/* Opportunity Type selector — switch between types to see their kanban */}
                        {opportunityTypes.length > 1 && (
                            <Select
                                size="small"
                                value={selectedType?.id || ''}
                                onChange={(e) => {
                                    const t = opportunityTypes.find(x => x.id === e.target.value);
                                    setSelectedType(t || null);
                                }}
                                sx={{ minWidth: 180 }}
                            >
                                {opportunityTypes.map(t => (
                                    <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                                ))}
                            </Select>
                        )}
                    </Stack>
                    <Stack direction="row" spacing={1}>
                        <ToggleButtonGroup
                            value={viewMode}
                            exclusive
                            onChange={handleViewChange}
                            size="small"
                            sx={{
                                '& .MuiToggleButton-root': {
                                    borderRadius: '8px',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    px: 1.5,
                                    py: 0.5,
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    color: 'text.secondary',
                                    '&.Mui-selected': {
                                        bgcolor: 'primary.main',
                                        color: 'primary.contrastText',
                                        '&:hover': { bgcolor: 'primary.dark' }
                                    }
                                }
                            }}
                        >
                            <ToggleButton value="KANBAN">
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <KanbanIcon fontSize="small" />
                                    <Typography variant="caption" fontWeight={700}>Board</Typography>
                                </Stack>
                            </ToggleButton>
                            <ToggleButton value="LIST">
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <ListIcon fontSize="small" />
                                    <Typography variant="caption" fontWeight={700}>List</Typography>
                                </Stack>
                            </ToggleButton>
                            <ToggleButton value="ANALYTICS">
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <AnalyticsIcon fontSize="small" />
                                    <Typography variant="caption" fontWeight={700}>Analytics</Typography>
                                </Stack>
                            </ToggleButton>
                        </ToggleButtonGroup>
                        <CreateOpportunityDialog onSuccess={fetchData} />
                    </Stack>
                </Box>

                <Divider />

                <Box sx={{ flexGrow: 1, overflow: 'hidden', px: 2, py: 1.5, bgcolor: 'background.default' }}>
                    <StaggerContainer>
                        {loading ? (
                            <TableSkeleton rows={10} columns={4} />
                        ) : viewMode === 'KANBAN' ? (
                            !selectedType ? (
                                <StaggerItem>
                                    <EmptyState
                                        icon={<KanbanIcon sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.5 }} />}
                                        title="No pipeline selected"
                                        description="Create or enable an opportunity type to view the kanban board."
                                        action={<CreateOpportunityDialog onSuccess={fetchData} />}
                                    />
                                </StaggerItem>
                            ) : kanbanOpportunities.length === 0 ? (
                                <StaggerItem>
                                    <EmptyState
                                        icon={<KanbanIcon sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.5 }} />}
                                        title="No opportunities found"
                                        description="Create an opportunity to get started."
                                        action={<CreateOpportunityDialog onSuccess={fetchData} />}
                                    />
                                </StaggerItem>
                            ) : (
                                <StaggerItem>
                                    <KanbanBoard
                                        opportunities={kanbanOpportunities}
                                        opportunityType={selectedType!}
                                        onDragEnd={updateOpportunityStage}
                                        onEdit={handleEdit}
                                    />
                                </StaggerItem>
                            )
                        ) : viewMode === 'ANALYTICS' ? (
                            <StaggerItem>
                                <PipelineAnalytics />
                            </StaggerItem>
                        ) : (
                            data.length === 0 ? (
                                <StaggerItem>
                                    <EmptyState
                                        icon={<FilterIcon sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.5 }} />}
                                        title="No opportunities found"
                                        description="Get started by adding your first opportunity."
                                        action={<CreateOpportunityDialog onSuccess={fetchData} />}
                                    />
                                </StaggerItem>
                            ) : (
                                <StaggerItem>
                                    <Card sx={{ height: '100%', borderRadius: '12px', overflow: 'hidden' }}>
                                        <StandardDataGrid
                                            rows={kanbanOpportunities}
                                            columns={columns}
                                            checkboxSelection
                                            disableRowSelectionOnClick
                                            rowSelectionModel={selectedRows}
                                            onRowSelectionModelChange={setSelectedRows}
                                            totalItems={kanbanOpportunities.length}
                                            selectedCount={selectedRows.length}
                                            isAllSelected={isAllSelected}
                                            onSelectAllFiltered={handleSelectAllFiltered}
                                            onClearSelection={clearSelection}
                                            currentCount={kanbanOpportunities.length}
                                        />
                                    </Card>
                                </StaggerItem>
                            )
                        )}
                    </StaggerContainer>
                </Box>

                <BulkActionsToolbar
                    selectedCount={Array.isArray(selectedRows) ? selectedRows.length : 0}
                    onClearSelection={clearSelection}
                    module="opportunities"
                    onDelete={() => {
                        if (Array.isArray(selectedRows) && selectedRows.length > 0) {
                            handleDelete(selectedRows.map(id => String(id)));
                        }
                    }}
                />

                {opportunityToEdit && (
                    <EditOpportunityDialog
                        open={editOpportunityOpen}
                        onOpenChange={setEditOpportunityOpen}
                        opportunity={opportunityToEdit}
                        onSuccess={(updated) => {
                            fetchData();
                            // Also update local state to avoid full refetch flicker if possible,
                            // but fetchData is safer.
                        }}
                    />
                )}
            </Box>
        </FeatureGate>
    );
}
