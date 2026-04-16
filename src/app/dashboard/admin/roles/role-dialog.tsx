"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Stack,
    FormHelperText,
    Typography,
    Divider,
    Grid,
    Box
} from "@mui/material";

interface Role {
    id: string;
    name: string;
    description?: string;
    permissions: {
        modules: Record<string, string>;
        recordAccess: string;
    };
}

interface RoleDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    role: Role | null;
    onSuccess: () => void;
}

const formSchema = z.object({
    name: z.string().min(2, "Name is required"),
    description: z.string().optional(),
    recordAccess: z.enum(["OWN", "TEAM", "ALL"]),
    leadsPermission: z.enum(["none", "read", "write", "full"]),
    opportunitiesPermission: z.enum(["none", "read", "write", "full"]),
    activitiesPermission: z.enum(["none", "read", "write", "full"]),
    adminPermission: z.enum(["none", "read", "write", "full"]),
});

const modules = [
    { key: "leadsPermission", label: "Leads", module: "leads" },
    { key: "opportunitiesPermission", label: "Opportunities", module: "opportunities" },
    { key: "activitiesPermission", label: "Activities", module: "activities" },
    { key: "adminPermission", label: "Admin & Settings", module: "admin" },
];

const permissionLevels = [
    { value: "none", label: "None - No Access", description: "Cannot view or interact" },
    { value: "read", label: "Read - View Only", description: "Can view but not edit" },
    { value: "write", label: "Write - Create & Edit", description: "Can create and edit own records" },
    { value: "full", label: "Full - All Access", description: "Complete control including delete" },
];

const recordAccessLevels = [
    { value: "OWN", label: "Own Records Only", description: "Can only see their own data" },
    { value: "TEAM", label: "Team Records", description: "Can see team members' data" },
    { value: "ALL", label: "All Records", description: "Can see all organization data" },
];

export function RoleDialog({
    open,
    onOpenChange,
    role,
    onSuccess,
}: RoleDialogProps) {
    const [loading, setLoading] = useState(false);

    const { control, handleSubmit, reset, formState: { errors } } = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            description: "",
            recordAccess: "OWN" as const,
            leadsPermission: "none" as const,
            opportunitiesPermission: "none" as const,
            activitiesPermission: "none" as const,
            adminPermission: "none" as const,
        },
    });

    useEffect(() => {
        if (role) {
            reset({
                name: role.name,
                description: role.description || "",
                recordAccess: role.permissions.recordAccess as any,
                leadsPermission: role.permissions.modules.leads as any || "none",
                opportunitiesPermission: role.permissions.modules.opportunities as any || "none",
                activitiesPermission: role.permissions.modules.activities as any || "none",
                adminPermission: role.permissions.modules.admin as any || "none",
            });
        } else {
            reset({
                name: "",
                description: "",
                recordAccess: "OWN",
                leadsPermission: "none",
                opportunitiesPermission: "none",
                activitiesPermission: "none",
                adminPermission: "none",
            });
        }
    }, [role, open, reset]);

    const handleClose = () => {
        onOpenChange(false);
    };

    async function onSubmit(values: any) {
        setLoading(true);
        try {
            const payload = {
                name: values.name,
                description: values.description || undefined,
                permissions: {
                    modules: {
                        leads: values.leadsPermission,
                        opportunities: values.opportunitiesPermission,
                        activities: values.activitiesPermission,
                        admin: values.adminPermission,
                    },
                    recordAccess: values.recordAccess,
                },
            };

            if (role) {
                await apiFetch(`/roles/${role.id}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                toast.success("Role updated");
            } else {
                await apiFetch("/roles", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast.success("Role created");
            }

            onSuccess();
        } catch (error: any) {
            toast.error(error.message || "Failed to save role");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: { borderRadius: 3, maxHeight: '90vh' }
            }}
        >
            <DialogTitle>{role ? "Edit Role" : "Create Role"}</DialogTitle>
            <DialogContent>
                <DialogContentText sx={{ mb: 3 }}>
                    Define role permissions for module access and data visibility
                </DialogContentText>

                <form id="role-form" onSubmit={handleSubmit(onSubmit)}>
                    <Stack spacing={3}>
                        <Controller
                            name="name"
                            control={control}
                            render={({ field }) => (
                                <TextField
                                    {...field}
                                    label="Role Name"
                                    placeholder="Sales Manager"
                                    fullWidth
                                    error={!!errors.name}
                                    helperText={errors.name?.message as string}
                                />
                            )}
                        />

                        <Controller
                            name="description"
                            control={control}
                            render={({ field }) => (
                                <TextField
                                    {...field}
                                    label="Description (Optional)"
                                    placeholder="Brief description of this role..."
                                    fullWidth
                                    multiline
                                    rows={2}
                                />
                            )}
                        />

                        <Divider />

                        <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Module Permissions</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Set access levels for each module</Typography>

                            <Grid container spacing={3}>
                                {modules.map((module) => (
                                    <Grid size={{ xs: 12, sm: 6 }} key={module.key}>
                                        <Controller
                                            name={module.key as any}
                                            control={control}
                                            render={({ field }) => (
                                                <FormControl fullWidth>
                                                    <InputLabel>{module.label}</InputLabel>
                                                    <Select
                                                        {...field}
                                                        label={module.label}
                                                    >
                                                        {permissionLevels.map((level) => (
                                                            <MenuItem key={level.value} value={level.value}>
                                                                <Box>
                                                                    <Typography variant="subtitle2">{level.label}</Typography>
                                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                                        {level.description}
                                                                    </Typography>
                                                                </Box>
                                                            </MenuItem>
                                                        ))}
                                                    </Select>
                                                </FormControl>
                                            )}
                                        />
                                    </Grid>
                                ))}
                            </Grid>
                        </Box>

                        <Divider />

                        <Controller
                            name="recordAccess"
                            control={control}
                            render={({ field }) => (
                                <FormControl fullWidth>
                                    <InputLabel>Record Access Scope</InputLabel>
                                    <Select
                                        {...field}
                                        label="Record Access Scope"
                                    >
                                        {recordAccessLevels.map((level) => (
                                            <MenuItem key={level.value} value={level.value}>
                                                <Box>
                                                    <Typography variant="subtitle2">{level.label}</Typography>
                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                        {level.description}
                                                    </Typography>
                                                </Box>
                                            </MenuItem>
                                        ))}
                                    </Select>
                                    <FormHelperText>Controls which records users with this role can access</FormHelperText>
                                </FormControl>
                            )}
                        />
                    </Stack>
                </form>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3 }}>
                <Button onClick={handleClose} sx={{ borderRadius: 20, color: 'text.secondary' }}>
                    Cancel
                </Button>
                <Button
                    type="submit"
                    form="role-form"
                    variant="contained"
                    disabled={loading}
                    sx={{ borderRadius: 20 }}
                >
                    {loading ? "Saving..." : role ? "Update Role" : "Create Role"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
