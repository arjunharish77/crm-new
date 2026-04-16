"use client";

import { useEffect, useState } from "react";
import {
    Button,
    Dialog,
    DialogContent,

    DialogTitle,
    DialogContentText,
    Stack,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Box,
    Avatar,
    Typography,
    IconButton,
    Paper,
    List,
    ListItem,
    ListItemAvatar,
    ListItemText,
    ListItemSecondaryAction,
    Chip,
    CircularProgress,
    Divider
} from "@mui/material";
import {
    PersonAdd as PersonAddIcon,
    Delete as DeleteIcon,
    Close as CloseIcon
} from "@mui/icons-material";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

interface ManageMembersDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    group: any;
    onSuccess: () => void;
}

export function ManageMembersDialog({ open, onOpenChange, group, onSuccess }: ManageMembersDialogProps) {
    const [users, setUsers] = useState<any[]>([]); // All users in tenant
    const [selectedUser, setSelectedUser] = useState("");
    const [selectedRole, setSelectedRole] = useState("MEMBER");
    const [loading, setLoading] = useState(false);
    const [adding, setAdding] = useState(false);

    // Fetch all tenant users to populate dropdown
    useEffect(() => {
        if (open) {
            apiFetch("/users").then(setUsers).catch(() => toast.error("Failed to load users"));
        }
    }, [open]);

    const handleAddMember = async () => {
        if (!selectedUser) return;
        setAdding(true);
        try {
            await apiFetch(`/sales-groups/${group.id}/members`, {
                method: "POST",
                body: JSON.stringify({ userId: selectedUser, role: selectedRole }),
            });
            toast.success("Member added");
            onSuccess(); // Refresh parent to get updated group
            setSelectedUser("");
        } catch (error) {
            toast.error("Failed to add member");
        } finally {
            setAdding(false);
        }
    };

    const handleRemoveMember = async (userId: string) => {
        try {
            await apiFetch(`/sales-groups/${group.id}/members/${userId}`, {
                method: "DELETE",
            });
            toast.success("Member removed");
            onSuccess();
        } catch (error) {
            toast.error("Failed to remove member");
        }
    };

    const handleClose = () => {
        onOpenChange(false);
    };

    // Filter out users who are already members
    const availableUsers = users.filter(
        (u) => !group.members?.some((m: any) => m.user.id === u.id)
    );

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                Manage Members: {group.name}
            </DialogTitle>
            <DialogContent>
                <DialogContentText sx={{ mb: 3 }}>
                    Add or remove users from this sales group.
                </DialogContentText>

                <Stack direction="row" spacing={2} alignItems="flex-end" sx={{ mb: 4 }}>
                    <FormControl fullWidth size="small">
                        <InputLabel>Add User</InputLabel>
                        <Select
                            value={selectedUser}
                            label="Add User"
                            onChange={(e) => setSelectedUser(e.target.value)}
                        >
                            {availableUsers.map((u) => (
                                <MenuItem key={u.id} value={u.id}>
                                    {u.name} ({u.email})
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl sx={{ minWidth: 120 }} size="small">
                        <InputLabel>Role</InputLabel>
                        <Select
                            value={selectedRole}
                            label="Role"
                            onChange={(e) => setSelectedRole(e.target.value)}
                        >
                            <MenuItem value="MEMBER">Member</MenuItem>
                            <MenuItem value="MANAGER">Manager</MenuItem>
                        </Select>
                    </FormControl>
                    <Button
                        variant="contained"
                        onClick={handleAddMember}
                        disabled={!selectedUser || adding}
                        sx={{ minWidth: 40, height: 40, borderRadius: 2 }}
                    >
                        {adding ? <CircularProgress size={20} color="inherit" /> : <PersonAddIcon />}
                    </Button>
                </Stack>

                <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto' }}>
                    <List dense>
                        {group.members?.length === 0 && (
                            <ListItem>
                                <ListItemText
                                    primary="No members yet."
                                    primaryTypographyProps={{ align: 'center', color: 'text.secondary' }}
                                />
                            </ListItem>
                        )}
                        {group.members?.map((member: any) => (
                            <ListItem key={member.id} divider>
                                <ListItemAvatar>
                                    <Avatar sx={{ width: 32, height: 32, fontSize: '0.875rem' }}>
                                        {member.user.name?.charAt(0)}
                                    </Avatar>
                                </ListItemAvatar>
                                <ListItemText
                                    primary={member.user.name}
                                    secondary={member.user.email}
                                    primaryTypographyProps={{ fontWeight: 500 }}
                                />
                                <ListItemSecondaryAction>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Chip
                                            label={member.role}
                                            size="small"
                                            variant="outlined"
                                            sx={{ borderRadius: 1, height: 20, fontSize: '0.625rem' }}
                                        />
                                        <IconButton edge="end" size="small" onClick={() => handleRemoveMember(member.user.id)}>
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Stack>
                                </ListItemSecondaryAction>
                            </ListItem>
                        ))}
                    </List>
                </Paper>
            </DialogContent>
            <Stack direction="row" justifyContent="flex-end" sx={{ p: 2 }}>
                <Button onClick={handleClose}>
                    Close
                </Button>
            </Stack>
        </Dialog>
    );
}
