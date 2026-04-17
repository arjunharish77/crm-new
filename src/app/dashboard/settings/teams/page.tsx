"use client";

import { useEffect, useState, useCallback } from "react";
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
    Avatar,
    Chip,
} from "@mui/material";
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Groups as TeamsIcon,
} from "@mui/icons-material";
import {
    GridColDef,
    GridRenderCellParams,
    GridRowId,
} from "@mui/x-data-grid";
import { StandardDataGrid } from "@/components/common/standard-data-grid";
import { toast } from "sonner";
import { Team } from "@/types/user";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/skeletons";
import { apiFetch } from "@/lib/api";

import { CreateTeamDialog } from "./create-team-dialog";

export default function TeamsPage() {
    const theme = useTheme();
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedRows, setSelectedRows] = useState<GridRowId[]>([]);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

    const fetchTeams = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/sales-groups");
            setTeams(
                (Array.isArray(data) ? data : []).map((group: any) => ({
                    id: group.id,
                    name: group.name,
                    description: group.description,
                    memberCount: group._count?.members ?? group.members?.length ?? 0,
                    createdAt: group.createdAt,
                }))
            );
        } catch (error: any) {
            toast.error(error.message || "Failed to fetch teams");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTeams();
    }, [fetchTeams]);

    const handleCreateSuccess = () => {
        setCreateDialogOpen(false);
        setSelectedTeam(null);
        fetchTeams();
    };

    const handleEdit = (team: Team) => {
        setSelectedTeam(team);
        setCreateDialogOpen(true);
    };

    const handleDelete = async (team: Team) => {
        if (!confirm(`Delete team "${team.name}"?`)) return;

        try {
            await apiFetch(`/sales-groups/${team.id}`, { method: "DELETE" });
            toast.success("Team deleted");
            fetchTeams();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete team");
        }
    };

    const columns: GridColDef[] = [
        {
            field: 'name',
            headerName: 'Team Name',
            flex: 1.5,
            minWidth: 200,
            renderCell: (params: GridRenderCellParams<Team>) => (
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ height: '100%' }}>
                    <Avatar
                        sx={{
                            width: 32,
                            height: 32,
                            bgcolor: alpha(theme.palette.primary.main, 0.1),
                            color: theme.palette.primary.main,
                        }}
                    >
                        <TeamsIcon fontSize="small" />
                    </Avatar>
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
                </Stack>
            ),
        },
        {
            field: 'memberCount',
            headerName: 'Members',
            width: 120,
            renderCell: (params: GridRenderCellParams<Team>) => (
                <Chip
                    label={`${params.row.memberCount} members`}
                    size="small"
                    sx={{ borderRadius: '6px', bgcolor: 'action.hover' }}
                />
            ),
        },
        {
            field: 'actions',
            headerName: '',
            type: 'actions',
            width: 100,
            renderCell: (params: GridRenderCellParams<Team>) => (
                <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Edit">
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
                    <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -0.5 }}>Teams</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Organize users into functional groups for assignment and reporting.
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => {
                        setSelectedTeam(null);
                        setCreateDialogOpen(true);
                    }}
                    sx={{ borderRadius: 28, px: 3 }}
                >
                    Create Team
                </Button>
            </Stack>

            <Card sx={{ height: 600, width: '100%', overflow: 'hidden' }}>
                {loading ? (
                    <TableSkeleton rows={6} columns={3} />
                ) : teams.length === 0 ? (
                    <EmptyState
                        title="No teams defined"
                        description="Create teams to group your users."
                        action={
                            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setCreateDialogOpen(true)}>
                                Create Team
                            </Button>
                        }
                    />
                ) : (
                    <StandardDataGrid
                        rows={teams}
                        columns={columns}
                        checkboxSelection
                        disableRowSelectionOnClick
                        rowSelectionModel={selectedRows}
                        onRowSelectionModelChange={setSelectedRows}
                    />
                )}
            </Card>

            <CreateTeamDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                team={selectedTeam}
                onSuccess={handleCreateSuccess}
            />
        </Box>
    );
}
