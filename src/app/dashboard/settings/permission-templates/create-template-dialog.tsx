"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
    Button,
    TextField,
    Stack,
    FormControlLabel,
    Checkbox,
    FormHelperText,
    Typography,
    Box,
    Paper,
    Divider,
} from "@mui/material";
import { Security as SecurityIcon } from "@mui/icons-material";
import { StandardDialog } from "@/components/common/standard-dialog";

interface CreatePermissionTemplateDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

const formSchema = z.object({
    name: z.string().min(2, "Template name is required"),
    description: z.string().optional(),
    permissions: z.array(z.string()).min(1, "At least one permission must be selected"),
});

const AVAILABLE_PERMISSIONS = [
    {
        category: "Leads", permissions: [
            { id: "leads.view", label: "View Leads" },
            { id: "leads.create", label: "Create Leads" },
            { id: "leads.edit", label: "Edit Leads" },
            { id: "leads.delete", label: "Delete Leads" },
        ]
    },
    {
        category: "Opportunities", permissions: [
            { id: "opportunities.view", label: "View Opportunities" },
            { id: "opportunities.create", label: "Create Opportunities" },
            { id: "opportunities.edit", label: "Edit Opportunities" },
        ]
    },
    {
        category: "Users", permissions: [
            { id: "users.view", label: "View Users" },
            { id: "users.manage", label: "Manage Users" },
        ]
    },
];

export function CreatePermissionTemplateDialog({
    open,
    onOpenChange,
    onSuccess,
}: CreatePermissionTemplateDialogProps) {
    const [loading, setLoading] = useState(false);

    const { control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            description: "",
            permissions: [] as string[],
        },
    });

    const selectedPermissions = watch("permissions");

    const handleClose = () => {
        onOpenChange(false);
        reset();
    };

    const handlePermissionToggle = (permissionId: string) => {
        const current = selectedPermissions;
        if (current.includes(permissionId)) {
            setValue("permissions", current.filter(id => id !== permissionId));
        } else {
            setValue("permissions", [...current, permissionId]);
        }
    };

    async function onSubmit(values: any) {
        setLoading(true);
        try {
            // Mock API call
            await new Promise(resolve => setTimeout(resolve, 1000));

            toast.success("Permission template created");
            handleClose();
            onSuccess();
        } catch (error: any) {
            toast.error(error.message || "Failed to create template");
        } finally {
            setLoading(false);
        }
    }

    return (
        <StandardDialog
            open={open}
            onClose={handleClose}
            title="Create Permission Template"
            subtitle="Define a set of permissions that can be assigned to roles."
            icon={<SecurityIcon />}
            maxWidth="md"
            actions={
                <>
                    <Button onClick={handleClose} sx={{ color: 'text.secondary' }}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form="create-template-form"
                        variant="contained"
                        disabled={loading}
                    >
                        {loading ? "Creating..." : "Create Template"}
                    </Button>
                </>
            }
        >
            <form id="create-template-form" onSubmit={handleSubmit(onSubmit)}>
                <Stack spacing={3}>
                    <Controller
                        name="name"
                        control={control}
                        render={({ field }) => (
                            <TextField
                                {...field}
                                label="Template Name"
                                placeholder="e.g. Sales Manager Standard"
                                fullWidth
                                error={!!errors.name}
                                helperText={errors.name?.message as string}
                                autoFocus
                            />
                        )}
                    />

                    <Controller
                        name="description"
                        control={control}
                        render={({ field }) => (
                            <TextField
                                {...field}
                                label="Description"
                                placeholder="Describe who this template is for"
                                fullWidth
                                multiline
                                rows={2}
                                error={!!errors.description}
                                helperText={errors.description?.message as string}
                            />
                        )}
                    />

                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                            Permissions
                        </Typography>
                        {errors.permissions && (
                            <FormHelperText error sx={{ mb: 1 }}>
                                {errors.permissions.message as string}
                            </FormHelperText>
                        )}
                        <Paper variant="outlined" sx={{ maxHeight: 300, overflow: "auto", borderRadius: 2 }}>
                            {AVAILABLE_PERMISSIONS.map((group, index) => (
                                <Box key={group.category}>
                                    {index > 0 && <Divider />}
                                    <Box sx={{ p: 2 }}>
                                        <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.5 }}>
                                            {group.category}
                                        </Typography>
                                        <Stack spacing={0.5} sx={{ mt: 1 }}>
                                            {group.permissions.map((perm) => (
                                                <FormControlLabel
                                                    key={perm.id}
                                                    control={
                                                        <Checkbox
                                                            checked={selectedPermissions.includes(perm.id)}
                                                            onChange={() => handlePermissionToggle(perm.id)}
                                                            size="small"
                                                        />
                                                    }
                                                    label={<Typography variant="body2">{perm.label}</Typography>}
                                                />
                                            ))}
                                        </Stack>
                                    </Box>
                                </Box>
                            ))}
                        </Paper>
                    </Box>
                </Stack>
            </form>
        </StandardDialog>
    );
}
