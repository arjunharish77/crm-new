"use client";

import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Stack,
    Box,
    Divider,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
} from "@mui/material";
import { PermissionMatrix } from "./permission-matrix";
import { Role, ModulePermissions, RecordAccess } from "@/types/user";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

interface RoleEditorDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    role: Role | null;
}

const DEFAULT_PERMISSIONS: ModulePermissions = {
    leads: { read: true, create: true, update: true, delete: false, export: false },
    opportunities: { read: true, create: true, update: true, delete: false, export: false },
    activities: { read: true, create: true, update: true, delete: false, export: false },
    automations: { read: true },
};

export function RoleEditorDialog({ open, onClose, onSuccess, role }: RoleEditorDialogProps) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [permissions, setPermissions] = useState<ModulePermissions>(DEFAULT_PERMISSIONS);
    const [recordAccess, setRecordAccess] = useState<RecordAccess>("OWN");
    const [permissionTemplateId, setPermissionTemplateId] = useState("");
    const [templates, setTemplates] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            apiFetch("/permission-templates")
                .then((data) => setTemplates(Array.isArray(data) ? data : []))
                .catch(() => setTemplates([]));
        }
        if (role) {
            setName(role.name);
            setDescription(role.description || "");
            setPermissions(role.permissions.modules || DEFAULT_PERMISSIONS);
            setRecordAccess(role.permissions.recordAccess || "OWN");
            setPermissionTemplateId(role.permissionTemplateId ?? "");
        } else {
            setName("");
            setDescription("");
            setPermissions(DEFAULT_PERMISSIONS);
            setRecordAccess("OWN");
            setPermissionTemplateId("");
        }
    }, [role, open]);

    const handleSave = async () => {
        if (!name) {
            toast.error("Role name is required");
            return;
        }

        setSaving(true);
        try {
            const data = {
                name,
                description,
                permissionTemplateId: permissionTemplateId || null,
                permissions: {
                    modules: permissions,
                    recordAccess,
                },
            };

            if (role) {
                await apiFetch(`/roles/${role.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(data),
                });
                toast.success("Role updated successfully");
            } else {
                await apiFetch('/roles', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
                toast.success("Role created successfully");
            }
            onSuccess();
            onClose();
        } catch (error: any) {
            toast.error(error.message || "Failed to save role");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                {role ? "Edit Role" : "Create New Role"}
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={3}>
                    <Box>
                        <TextField
                            label="Role Name"
                            fullWidth
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            size="small"
                            placeholder="e.g. Senior Sales Representative"
                            sx={{ mb: 2 }}
                        />
                        <TextField
                            label="Description"
                            fullWidth
                            multiline
                            rows={2}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            size="small"
                            placeholder="Briefly describe what this role can do"
                        />
                        <FormControl fullWidth size="small" sx={{ mt: 2 }}>
                            <InputLabel>Permission Template</InputLabel>
                            <Select
                                label="Permission Template"
                                value={permissionTemplateId}
                                onChange={(event) => setPermissionTemplateId(event.target.value)}
                            >
                                <MenuItem value="">No template</MenuItem>
                                {templates.map((template) => (
                                    <MenuItem key={template.id} value={template.id}>{template.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>

                    <Divider />

                    <PermissionMatrix
                        permissions={permissions}
                        recordAccess={recordAccess}
                        onChange={(p, r) => {
                            setPermissions(p);
                            setRecordAccess(r);
                        }}
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button onClick={onClose} color="inherit">Cancel</Button>
                <Button
                    onClick={handleSave}
                    variant="contained"
                    loading={saving}
                >
                    {role ? "Update Role" : "Create Role"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
