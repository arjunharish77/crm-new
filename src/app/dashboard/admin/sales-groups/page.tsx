"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import {
    Box,
    Button,
    Typography,
    Divider,
    IconButton,
    Paper,
    useTheme,
    alpha,
    Stack,
    Avatar,
    AvatarGroup,
    Tooltip,
    FormControl,
    Select,
    MenuItem
} from "@mui/material";
import {
    People as UsersIcon,
    Settings as SettingsIcon,
    Delete as TrashIcon,
    Groups as GroupsIcon,
    Add as AddIcon
} from "@mui/icons-material";
import { toast } from "sonner";
import { SalesGroupDialog } from "./sales-group-dialog";
import { ManageMembersDialog } from "./manage-members-dialog";
import { StandardDataGrid } from "@/components/common/standard-data-grid";
import { GridColDef } from "@mui/x-data-grid";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";

export default function SalesGroupsPage() {
    const theme = useTheme();
    const [groups, setGroups] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedGroup, setSelectedGroup] = useState<any>(null);
    const [templates, setTemplates] = useState<any[]>([]);
    const [manageMembersOpen, setManageMembersOpen] = useState(false);

    const fetchGroups = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/sales-groups");
            setGroups(data);
            if (selectedGroup?.id) {
                const refreshed = (Array.isArray(data) ? data : []).find((group: any) => group.id === selectedGroup.id);
                if (refreshed) {
                    setSelectedGroup(refreshed);
                }
            }
        } catch (error) {
            toast.error("Failed to load sales groups");
        } finally {
            setLoading(false);
        }
    }, [selectedGroup?.id]);

    useEffect(() => {
        fetchGroups();
        apiFetch("/permission-templates").then((data) => setTemplates(Array.isArray(data) ? data : [])).catch(() => setTemplates([]));
    }, [fetchGroups]);

    const updateGroupTemplate = async (group: any, permissionTemplateId: string) => {
        try {
            await apiFetch(`/sales-groups/${group.id}`, {
                method: "PATCH",
                body: JSON.stringify({ permissionTemplateId: permissionTemplateId || null }),
            });
            toast.success("Permission template updated");
            fetchGroups();
        } catch (error: any) {
            toast.error(error.message || "Failed to update permission template");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure? This will remove all members from the group.")) return;
        try {
            await apiFetch(`/sales-groups/${id}`, { method: "DELETE" });
            toast.success("Sales group deleted");
            fetchGroups();
        } catch (error) {
            toast.error("Failed to delete group");
        }
    };

    const handleManageMembers = (group: any) => {
        setSelectedGroup(group);
        setManageMembersOpen(true);
    };

    const columns: GridColDef[] = [
        {
            field: 'name',
            headerName: 'Group Name',
            flex: 1,
            minWidth: 250,
            renderCell: (params) => (
                <Stack spacing={0.5} sx={{ py: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{params.value}</Typography>
                    {params.row.description && (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 300 }}>
                            {params.row.description}
                        </Typography>
                    )}
                </Stack>
            )
        },
        {
            field: 'members',
            headerName: 'Members',
            width: 180,
            renderCell: (params) => {
                const members = params.row.members || [];
                const count = params.row._count?.members || 0;
                return (
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <AvatarGroup max={4} sx={{
                            '& .MuiAvatar-root': { width: 28, height: 28, fontSize: '0.75rem', border: '2px solid', borderColor: 'background.paper' }
                        }}>
                            {members.map((m: any) => (
                                <Tooltip key={m.id} title={m.user.name}>
                                    <Avatar sx={{ bgcolor: alpha(theme.palette.primary.main, 0.2), color: 'primary.main' }}>
                                        {m.user.name?.charAt(0)}
                                    </Avatar>
                                </Tooltip>
                            ))}
                        </AvatarGroup>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                            {count} total
                        </Typography>
                    </Stack>
                )
            }
        },
        {
            field: 'permissionTemplateId',
            headerName: 'Permission Template',
            minWidth: 220,
            flex: 1,
            renderCell: (params) => (
                <FormControl size="small" fullWidth>
                    <Select
                        value={params.row.permissionTemplateId ?? ""}
                        displayEmpty
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => updateGroupTemplate(params.row, String(event.target.value))}
                    >
                        <MenuItem value=""><em>No template</em></MenuItem>
                        {templates.map((template) => (
                            <MenuItem key={template.id} value={template.id}>{template.name}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
            )
        },
        {
            field: 'createdAt',
            headerName: 'Created',
            width: 150,
            renderCell: (params) => (
                <Typography variant="body2" color="text.secondary">
                    {formatDistanceToNow(new Date(params.value), { addSuffix: true })}
                </Typography>
            )
        },
        {
            field: 'actions',
            headerName: 'Actions',
            width: 160,
            sortable: false,
            align: 'right',
            headerAlign: 'right',
            renderCell: (params) => (
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<SettingsIcon sx={{ fontSize: 16 }} />}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleManageMembers(params.row);
                        }}
                        sx={{ borderRadius: '12px', borderStyle: 'dashed', py: 0.5 }}
                    >
                        Members
                    </Button>
                    <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(params.row.id);
                        }}
                    >
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
            sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 1.5, md: 2 } }}
        >
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Box>
                    <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: -1 }}>Sales Groups</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Organize your sales team into units for intelligent routing and reporting
                    </Typography>
                </Box>
                <SalesGroupDialog onSuccess={fetchGroups} />
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
                        <GroupsIcon fontSize="small" />
                    </Paper>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Sales Organization</Typography>
                </Box>
                <Divider />
                <StandardDataGrid
                    rows={groups}
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

            {selectedGroup && (
                <ManageMembersDialog
                    open={manageMembersOpen}
                    onOpenChange={setManageMembersOpen}
                    group={selectedGroup}
                    onSuccess={fetchGroups}
                />
            )}
        </Box>
    );
}
