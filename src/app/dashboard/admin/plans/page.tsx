"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
    Typography,
    Divider,
    IconButton,
    Chip,
    Grid,
    Stack,
    CircularProgress,
    TextField,
    Switch,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Table,
    TableBody,
    TableCell,
    TableHead,

    TableRow,
    TableContainer,
    Paper,
    useTheme,
    alpha
} from "@mui/material";
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    TrendingUp as TrendingUpIcon,
    People as UsersIcon,
    Storage as DatabaseIcon,
    Check as CheckIcon,
    Close as CloseIcon
} from "@mui/icons-material";
import { toast } from "sonner";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

interface Plan {
    id: string;
    name: string;
    description?: string;
    price: number;
    billingCycle: "MONTHLY" | "YEARLY";
    features: string[];
    limits: {
        users: number;
        storage: number; // GB
        apiCalls: number; // per day
    };
    isActive: boolean;
}

const planSchema = z.object({
    name: z.string().min(2, "Name is required"),
    description: z.string().optional(),
    price: z.number().min(0, "Price must be positive"),
    billingCycle: z.enum(["MONTHLY", "YEARLY"]),
    limits: z.object({
        users: z.number().min(1, "At least 1 user"),
        storage: z.number().min(1, "At least 1 GB"),
        apiCalls: z.number().min(100, "At least 100 calls"),
    }),
});

export default function PlansPage() {
    const theme = useTheme();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

    const { control, handleSubmit, reset, formState: { errors } } = useForm({
        resolver: zodResolver(planSchema),
        defaultValues: {
            name: "",
            description: "",
            price: 0,
            billingCycle: "MONTHLY" as const,
            limits: {
                users: 5,
                storage: 10,
                apiCalls: 1000
            }
        }
    });

    const fetchPlans = async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/plans");
            setPlans(data);
        } catch (error) {
            toast.error("Failed to fetch plans");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPlans();
    }, []);

    const handleCreate = () => {
        setEditingPlan(null);
        reset({
            name: "",
            description: "",
            price: 0,
            billingCycle: "MONTHLY",
            limits: { users: 5, storage: 10, apiCalls: 1000 }
        });
        setDialogOpen(true);
    };

    const handleEdit = (plan: Plan) => {
        setEditingPlan(plan);
        reset({
            name: plan.name,
            description: plan.description || "",
            price: plan.price,
            billingCycle: plan.billingCycle,
            limits: plan.limits
        });
        setDialogOpen(true);
    };

    const handleSave = async (values: any) => {
        try {
            if (editingPlan) {
                await apiFetch(`/plans/${editingPlan.id}`, {
                    method: "PATCH",
                    body: JSON.stringify(values)
                });
                toast.success("Plan updated");
            } else {
                await apiFetch("/plans", {
                    method: "POST",
                    body: JSON.stringify(values)
                });
                toast.success("Plan created");
            }
            setDialogOpen(false);
            fetchPlans();
        } catch (error) {
            toast.error("Failed to save plan");
        }
    };

    const handleToggleActive = async (plan: Plan) => {
        try {
            await apiFetch(`/plans/${plan.id}`, {
                method: "PATCH",
                body: JSON.stringify({ isActive: !plan.isActive })
            });
            fetchPlans();
        } catch (error) {
            toast.error("Failed to update status");
        }
    }

    return (
        <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>Subscription Plans</Typography>
                    <Typography variant="body1" color="text.secondary">
                        Manage pricing tiers and feature limits.
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleCreate}
                    sx={{ borderRadius: 20 }}
                >
                    Create Plan
                </Button>
            </Box>
            <Divider sx={{ mb: 4 }} />

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <Grid container spacing={3}>
                    {plans.map((plan) => (
                        <Grid size={{ xs: 12, md: 4 }} key={plan.id}>
                            <Card variant="outlined" sx={{ height: '100%', borderRadius: 3, display: 'flex', flexDirection: 'column' }}>
                                <CardHeader
                                    title={
                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            <Typography variant="h6" sx={{ fontWeight: 600 }}>{plan.name}</Typography>
                                            <Switch
                                                size="small"
                                                checked={plan.isActive}
                                                onChange={() => handleToggleActive(plan)}
                                            />
                                        </Stack>
                                    }
                                    subheader={
                                        <Typography variant="h4" color="primary" sx={{ fontWeight: 700, mt: 2 }}>
                                            ${plan.price}<Typography component="span" variant="body2" color="text.secondary">/{plan.billingCycle === 'MONTHLY' ? 'mo' : 'yr'}</Typography>
                                        </Typography>
                                    }
                                />
                                <Divider />
                                <CardContent sx={{ flexGrow: 1 }}>
                                    <Stack spacing={2}>
                                        <Box>
                                            <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <UsersIcon fontSize="small" color="action" /> Users Limit
                                            </Typography>
                                            <Typography variant="body2">{plan.limits.users} users</Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <DatabaseIcon fontSize="small" color="action" /> Storage Limit
                                            </Typography>
                                            <Typography variant="body2">{plan.limits.storage} GB</Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <TrendingUpIcon fontSize="small" color="action" /> API Limit
                                            </Typography>
                                            <Typography variant="body2">{plan.limits.apiCalls.toLocaleString()} calls/day</Typography>
                                        </Box>
                                    </Stack>
                                </CardContent>
                                <Divider />
                                <Box sx={{ p: 2 }}>
                                    <Button
                                        fullWidth
                                        variant="outlined"
                                        startIcon={<EditIcon />}
                                        onClick={() => handleEdit(plan)}
                                        sx={{ borderRadius: 20 }}
                                    >
                                        Edit Plan
                                    </Button>
                                </Box>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{editingPlan ? "Edit Plan" : "Create Plan"}</DialogTitle>
                <DialogContent>
                    <form id="plan-form" onSubmit={handleSubmit(handleSave)}>
                        <Stack spacing={3} sx={{ mt: 1 }}>
                            <Controller
                                name="name"
                                control={control}
                                render={({ field }) => (
                                    <TextField
                                        {...field}
                                        label="Plan Name"
                                        fullWidth
                                        error={!!errors.name}
                                        helperText={errors.name?.message as string}
                                    />
                                )}
                            />
                            <Stack direction="row" spacing={2}>
                                <Controller
                                    name="price"
                                    control={control}
                                    render={({ field }) => (
                                        <TextField
                                            {...field}
                                            type="number"
                                            label="Price"
                                            fullWidth
                                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                            InputProps={{ startAdornment: '$' }}
                                        />
                                    )}
                                />
                                <Controller
                                    name="billingCycle"
                                    control={control}
                                    render={({ field }) => (
                                        <TextField
                                            {...field}
                                            select
                                            label="Billing Cycle"
                                            fullWidth
                                            SelectProps={{ native: true }}
                                        >
                                            <option value="MONTHLY">Monthly</option>
                                            <option value="YEARLY">Yearly</option>
                                        </TextField>
                                    )}
                                />
                            </Stack>

                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Limits</Typography>
                            <Grid container spacing={2}>
                                <Grid size={{ xs: 4 }}>
                                    <Controller
                                        name="limits.users"
                                        control={control}
                                        render={({ field }) => (
                                            <TextField
                                                {...field}
                                                type="number"
                                                label="Users"
                                                fullWidth
                                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                                            />
                                        )}
                                    />
                                </Grid>
                                <Grid size={{ xs: 4 }}>
                                    <Controller
                                        name="limits.storage"
                                        control={control}
                                        render={({ field }) => (
                                            <TextField
                                                {...field}
                                                type="number"
                                                label="Storage (GB)"
                                                fullWidth
                                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                                            />
                                        )}
                                    />
                                </Grid>
                                <Grid size={{ xs: 4 }}>
                                    <Controller
                                        name="limits.apiCalls"
                                        control={control}
                                        render={({ field }) => (
                                            <TextField
                                                {...field}
                                                type="number"
                                                label="API Calls"
                                                fullWidth
                                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                                            />
                                        )}
                                    />
                                </Grid>
                            </Grid>
                        </Stack>
                    </form>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button onClick={() => setDialogOpen(false)} color="inherit" sx={{ borderRadius: 20 }}>Cancel</Button>
                    <Button type="submit" form="plan-form" variant="contained" sx={{ borderRadius: 20 }}>Save Plan</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
