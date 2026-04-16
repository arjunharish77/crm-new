"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

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
    Checkbox,
    FormControlLabel,
    Grid,
    Stack,
    Typography,
    Box,
    Alert,
    AlertTitle,
    IconButton,
    FormHelperText
} from "@mui/material";
import { ContentCopy as ContentCopyIcon } from "@mui/icons-material";

const formSchema = z.object({
    name: z.string().min(2, "Tenant name must be at least 2 characters"),
    plan: z.enum(["BASIC", "PRO", "ENTERPRISE"]),
    adminEmail: z.string().email("Invalid email address"),
    adminName: z.string().min(2, "Admin name must be at least 2 characters"),
    features: z.object({
        opportunityEnabled: z.boolean().default(true),
        automationEnabled: z.boolean().default(true),
        salesGroupsEnabled: z.boolean().default(true),
        formBuilderEnabled: z.boolean().default(true),
        advancedReporting: z.boolean().default(false),
        apiAccessEnabled: z.boolean().default(false),
    }),
});

type CreateTenantDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
};

export function CreateTenantDialog({ open, onOpenChange, onSuccess }: CreateTenantDialogProps) {
    const [loading, setLoading] = useState(false);
    const [credentials, setCredentials] = useState<{
        email: string;
        password: string;
    } | null>(null);

    const { control, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            name: "",
            plan: "BASIC",
            adminEmail: "",
            adminName: "",
            features: {
                opportunityEnabled: true,
                automationEnabled: true,
                salesGroupsEnabled: true,
                formBuilderEnabled: true,
                advancedReporting: false,
                apiAccessEnabled: false,
            },
        },
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setLoading(true);
        try {
            const res = await apiFetch("/platform-admin/tenants", {
                method: "POST",
                body: JSON.stringify(values),
            });

            setCredentials({
                email: res.admin.email,
                password: res.admin.temporaryPassword,
            });

            toast.success("Tenant created successfully!");
            onSuccess();
        } catch (error: any) {
            toast.error(error.message || "Failed to create tenant");
        } finally {
            setLoading(false);
        }
    }

    function handleClose() {
        if (credentials) {
            setCredentials(null);
            reset();
        }
        onOpenChange(false);
    }

    function copyPassword() {
        if (credentials) {
            navigator.clipboard.writeText(credentials.password);
            toast.success("Password copied to clipboard!");
        }
    }

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: { borderRadius: 3 }
            }}
        >
            <DialogTitle sx={{ pb: 1 }}>
                {credentials ? "Tenant Created" : "Create New Tenant"}
            </DialogTitle>
            <DialogContent>
                <DialogContentText sx={{ mb: 3 }}>
                    {credentials
                        ? "Save these credentials securely. The password will only be shown once."
                        : "Enter the details below to provision a new tenant environment."}
                </DialogContentText>

                {credentials ? (
                    <Stack spacing={3}>
                        <Alert severity="warning" icon={false} sx={{ borderRadius: 2 }}>
                            <AlertTitle>Credentials</AlertTitle>
                            Please copy these now.
                        </Alert>

                        <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                            <Stack spacing={2}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" fontWeight={600}>EMAIL</Typography>
                                    <Typography variant="body2" fontFamily="monospace">{credentials.email}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" fontWeight={600}>TEMPORARY PASSWORD</Typography>
                                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                                        <Typography variant="body2" fontFamily="monospace">{credentials.password}</Typography>
                                        <IconButton size="small" onClick={copyPassword}>
                                            <ContentCopyIcon fontSize="small" />
                                        </IconButton>
                                    </Stack>
                                </Box>
                            </Stack>
                        </Box>
                    </Stack>
                ) : (
                    <form id="create-tenant-form" onSubmit={handleSubmit(onSubmit)}>
                        <Stack spacing={3} sx={{ mt: 1 }}>
                            <Controller
                                name="name"
                                control={control}
                                render={({ field }) => (
                                    <TextField
                                        {...field}
                                        label="Tenant Name"
                                        placeholder="Acme Corp"
                                        fullWidth
                                        error={!!errors.name}
                                        helperText={errors.name?.message}
                                    />
                                )}
                            />

                            <Controller
                                name="plan"
                                control={control}
                                render={({ field }) => (
                                    <FormControl fullWidth error={!!errors.plan}>
                                        <InputLabel>Plan</InputLabel>
                                        <Select
                                            {...field}
                                            label="Plan"
                                        >
                                            <MenuItem value="BASIC">Basic</MenuItem>
                                            <MenuItem value="PRO">Pro</MenuItem>
                                            <MenuItem value="ENTERPRISE">Enterprise</MenuItem>
                                        </Select>
                                        <FormHelperText>{errors.plan?.message}</FormHelperText>
                                    </FormControl>
                                )}
                            />

                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                <Controller
                                    name="adminName"
                                    control={control}
                                    render={({ field }) => (
                                        <TextField
                                            {...field}
                                            label="Admin Name"
                                            placeholder="John Doe"
                                            fullWidth
                                            error={!!errors.adminName}
                                            helperText={errors.adminName?.message}
                                        />
                                    )}
                                />
                                <Controller
                                    name="adminEmail"
                                    control={control}
                                    render={({ field }) => (
                                        <TextField
                                            {...field}
                                            label="Admin Email"
                                            placeholder="admin@example.com"
                                            fullWidth
                                            error={!!errors.adminEmail}
                                            helperText={errors.adminEmail?.message}
                                        />
                                    )}
                                />
                            </Stack>

                            <Box>
                                <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>Feature Flags</Typography>
                                <Grid container spacing={1}>
                                    {[
                                        { name: 'features.opportunityEnabled', label: 'Opportunities' },
                                        { name: 'features.automationEnabled', label: 'Automation' },
                                        { name: 'features.salesGroupsEnabled', label: 'Sales Groups' },
                                        { name: 'features.formBuilderEnabled', label: 'Form Builder' },
                                        { name: 'features.advancedReporting', label: 'Advanced Reporting' },
                                        { name: 'features.apiAccessEnabled', label: 'API Access' },
                                    ].map((feature) => (
                                        <Grid size={{ xs: 6 }} key={feature.name}>
                                            <Controller
                                                name={feature.name as any}
                                                control={control}
                                                render={({ field }) => (
                                                    <FormControlLabel
                                                        control={
                                                            <Checkbox
                                                                checked={field.value}
                                                                onChange={field.onChange}
                                                            />
                                                        }
                                                        label={<Typography variant="body2">{feature.label}</Typography>}
                                                    />
                                                )}
                                            />
                                        </Grid>
                                    ))}
                                </Grid>
                            </Box>
                        </Stack>
                    </form>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3 }}>
                {credentials ? (
                    <Button onClick={handleClose} variant="contained" fullWidth sx={{ borderRadius: 20 }}>
                        Done
                    </Button>
                ) : (
                    <>
                        <Button onClick={handleClose} sx={{ borderRadius: 20, color: 'text.secondary' }}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            form="create-tenant-form"
                            disabled={loading}
                            sx={{ borderRadius: 20 }}
                        >
                            {loading ? "Creating..." : "Create Tenant"}
                        </Button>
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
}
