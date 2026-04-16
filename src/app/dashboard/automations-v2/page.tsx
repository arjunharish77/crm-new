'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Button,
    Typography,
    Chip,
    IconButton,
    TextField,
    Stack,
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText,
    useTheme,
    alpha,
    InputAdornment,
} from '@mui/material';
import {
    Add as AddIcon,
    Search as SearchIcon,
    FilterList as FilterListIcon,
    MoreVert as MoreVertIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Bolt as BoltIcon,
    History as HistoryIcon,
    AccountTree as TreeIcon,
} from '@mui/icons-material';
import { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { StandardDataGrid } from '@/components/common/standard-data-grid';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

interface Automation {
    id: string;
    name: string;
    description?: string;
    isActive: boolean;
    trigger: any;
    workflow: any;
    createdAt: string;
    _count?: {
        executions: number;
    };
}

export default function AutomationsV2Page() {
    const router = useRouter();
    const theme = useTheme();
    const [automations, setAutomations] = useState<Automation[]>([]);
    const [loading, setLoading] = useState(true);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchAutomations = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch('/automation-v2');
            setAutomations(data);
        } catch (error) {
            console.error('Failed to fetch automations:', error);
            setAutomations([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAutomations();
    }, [fetchAutomations]);

    const deleteAutomation = async (id: string) => {
        if (!confirm('Are you sure you want to delete this automation?')) return;

        try {
            await apiFetch(`/automation-v2/${id}`, { method: 'DELETE' });
            setAutomations(automations.filter((a) => a.id !== id));
            toast.success("Automation deleted");
        } catch (error) {
            console.error('Failed to delete automation:', error);
            toast.error("Failed to delete automation");
        }
        handleCloseMenu();
    };

    const handleMenuClick = (event: React.MouseEvent<HTMLElement>, id: string) => {
        event.stopPropagation();
        setAnchorEl(event.currentTarget);
        setSelectedId(id);
    };

    const handleCloseMenu = () => {
        setAnchorEl(null);
        setSelectedId(null);
    };

    const filteredAutomations = automations.filter(a =>
        a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.description && a.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const columns: GridColDef[] = [
        {
            field: 'name',
            headerName: 'Automation Name',
            flex: 1.5,
            minWidth: 250,
            renderCell: (params: GridRenderCellParams<Automation>) => (
                <Box sx={{ py: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        {params.row.name}
                    </Typography>
                    <Typography variant="caption" noWrap sx={{ color: 'text.secondary', display: 'block' }}>
                        {params.row.description || "No description"}
                    </Typography>
                </Box>
            )
        },
        {
            field: 'isActive',
            headerName: 'Status',
            width: 120,
            renderCell: (params: GridRenderCellParams<Automation>) => (
                <Chip
                    label={params.value ? 'Active' : 'Inactive'}
                    size="small"
                    sx={{
                        fontWeight: 700,
                        fontSize: '0.625rem',
                        textTransform: 'uppercase',
                        borderRadius: '6px',
                        bgcolor: params.value ? alpha(theme.palette.success.main, 0.08) : alpha(theme.palette.text.disabled, 0.08),
                        color: params.value ? theme.palette.success.main : theme.palette.text.disabled,
                        border: '1px solid',
                        borderColor: params.value ? alpha(theme.palette.success.main, 0.2) : alpha(theme.palette.text.disabled, 0.2),
                    }}
                />
            )
        },
        {
            field: 'trigger',
            headerName: 'Trigger',
            width: 180,
            renderCell: (params: GridRenderCellParams<Automation>) => (
                <Stack direction="row" spacing={1} alignItems="center">
                    <BoltIcon sx={{ fontSize: 16, color: 'secondary.main' }} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {params.value?.type?.replace('_', ' ') || 'Manual'}
                    </Typography>
                </Stack>
            )
        },
        {
            field: 'steps',
            headerName: 'Steps',
            width: 100,
            renderCell: (params: GridRenderCellParams<Automation>) => (
                <Stack direction="row" spacing={1} alignItems="center">
                    <TreeIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {params.row.workflow?.nodes?.length || 0}
                    </Typography>
                </Stack>
            )
        },
        {
            field: 'runs',
            headerName: 'Runs',
            width: 100,
            renderCell: (params: GridRenderCellParams<Automation>) => (
                <Stack direction="row" spacing={1} alignItems="center">
                    <HistoryIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {params.row._count?.executions || 0}
                    </Typography>
                </Stack>
            )
        },
        {
            field: 'actions',
            headerName: '',
            type: 'actions',
            width: 80,
            renderCell: (params: GridRenderCellParams<Automation>) => (
                <IconButton
                    size="small"
                    onClick={(e) => handleMenuClick(e, params.row.id)}
                >
                    <MoreVertIcon sx={{ fontSize: 18 }} />
                </IconButton>
            )
        }
    ];

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto' }}>
            {/* Header */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -0.5 }}>Workflow Automations</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Build and manage visual workflows to automate your sales processes
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => router.push('/dashboard/automations-v2/new')}
                    sx={{ borderRadius: '12px', px: 3, py: 1 }}
                >
                    New Automation
                </Button>
            </Stack>

            {/* Filters Bar */}
            <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
                <TextField
                    placeholder="Search automations..."
                    size="small"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon sx={{ color: 'text.disabled', fontSize: 20 }} />
                            </InputAdornment>
                        ),
                        sx: { borderRadius: '12px', bgcolor: 'background.paper' }
                    }}
                    sx={{ width: 320 }}
                />
                <Button
                    variant="outlined"
                    startIcon={<FilterListIcon />}
                    sx={{ borderRadius: '12px', borderStyle: 'dashed' }}
                >
                    Filters
                </Button>
            </Stack>

            <Box sx={{ height: 'calc(100vh - 280px)', minHeight: 600 }}>
                <StandardDataGrid
                    rows={filteredAutomations}
                    columns={columns}
                    loading={loading}
                    rowHeight={72}
                    onRowClick={(params) => router.push(`/dashboard/automations-v2/${params.id}`)}
                />
            </Box>

            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleCloseMenu}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                PaperProps={{
                    sx: { minWidth: 180, borderRadius: '12px', mt: 1, boxShadow: theme.shadows[4] }
                }}
            >
                <MenuItem onClick={() => {
                    if (selectedId) router.push(`/dashboard/automations-v2/${selectedId}`);
                    handleCloseMenu();
                }}>
                    <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>Edit Designer</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => {
                    if (selectedId) deleteAutomation(selectedId);
                }} sx={{ color: 'error.main' }}>
                    <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
                    <ListItemText>Delete</ListItemText>
                </MenuItem>
            </Menu>
        </Box>
    );
}
