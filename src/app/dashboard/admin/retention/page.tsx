"use client";

import { useEffect, useState } from "react";
import {
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
    Typography,
    Divider,
    TextField,
    Grid,
    CircularProgress,
    Stack,
    IconButton,
    Paper,
    FormControl
} from "@mui/material";
import {
    PlayArrow as PlayIcon,
    Save as SaveIcon,
    Edit as EditIcon,
    Close as CloseIcon,
    History as HistoryIcon
} from "@mui/icons-material";
import { useAuth } from "@/providers/auth-provider";
import { toast } from "sonner";

interface RetentionPolicy {
    id: string;
    tenantId: string | null;
    leadRetentionDays: number;
    opportunityRetentionDays: number;
    activityRetentionDays: number;
    auditLogRetentionDays: number;
    deletedRecordsRetentionDays: number;
    lastEnforcedAt: string | null;
    tenant?: {
        id: string;
        name: string;
    } | null;
}

export default function RetentionPage() {
    const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
    const [loading, setLoading] = useState(true);
    const [enforcing, setEnforcing] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState<RetentionPolicy | null>(null);
    const { token, user } = useAuth();
    const isPlatformAdmin = user?.isPlatformAdmin;

    useEffect(() => {
        if (token && isPlatformAdmin) {
            fetchPolicies();
        }
    }, [token, isPlatformAdmin]);

    const fetchPolicies = async () => {
        setLoading(true);
        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/platform-admin/retention/policies`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            if (res.ok) {
                const data = await res.json();
                setPolicies(data);
            } else {
                toast.error("Failed to fetch retention policies");
            }
        } catch (error) {
            toast.error("Failed to load retention policies");
        } finally {
            setLoading(false);
        }
    };

    const updatePolicy = async (tenantId: string | null, values: Partial<RetentionPolicy>) => {
        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/platform-admin/retention/policy/${tenantId || 'global'}`,
                {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(values),
                }
            );

            if (res.ok) {
                toast.success("Retention policy updated");
                fetchPolicies();
                setEditingPolicy(null);
            } else {
                toast.error("Failed to update policy");
            }
        } catch (error) {
            toast.error("Failed to update policy");
        }
    };

    const enforceNow = async () => {
        setEnforcing(true);
        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/platform-admin/retention/enforce`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            if (res.ok) {
                const results = await res.json();
                toast.success(
                    `Enforcement complete! Deleted: ${results.leadsDeleted} leads, ${results.opportunitiesDeleted} opps, ${results.activitiesDeleted} activities, ${results.auditLogsDeleted} logs`
                );
                fetchPolicies();
            } else {
                toast.error("Failed to enforce policies");
            }
        } catch (error) {
            toast.error("Failed to enforce policies");
        } finally {
            setEnforcing(false);
        }
    };

    if (!isPlatformAdmin) {
        return (
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="error">You do not have permission to view this page.</Typography>
            </Box>
        );
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>Data Retention Policies</Typography>
                    <Typography variant="body1" color="text.secondary">
                        Configure automatic deletion rules for data compliance.
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={enforceNow}
                    disabled={enforcing}
                    startIcon={enforcing ? <CircularProgress size={20} color="inherit" /> : <PlayIcon />}
                    sx={{ borderRadius: 20 }}
                >
                    {enforcing ? "Enforcing..." : "Enforce Now"}
                </Button>
            </Box>
            <Divider sx={{ mb: 4 }} />

            <Card variant="outlined" sx={{ borderRadius: 2 }}>
                <CardHeader
                    title={<Typography variant="h6" sx={{ fontWeight: 600 }}>Retention Periods</Typography>}
                    subheader="Configure how long data is retained (in days). Set to 0 to disable deletion."
                />
                <Divider />
                <CardContent sx={{ p: 0 }}>
                    {policies.length === 0 ? (
                        <Box sx={{ p: 4, textAlign: 'center' }}>
                            <Typography color="text.secondary">
                                No retention policies configured. Create one to get started.
                            </Typography>
                        </Box>
                    ) : (
                        <Stack divider={<Divider />}>
                            {policies.map((policy) => (
                                <Box key={policy.id} sx={{ p: 3 }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="start" sx={{ mb: 3 }}>
                                        <Box>
                                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                                {policy.tenant ? policy.tenant.name : "Global Default Policy"}
                                            </Typography>
                                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }}>
                                                <HistoryIcon fontSize="small" color="action" />
                                                <Typography variant="caption" color="text.secondary">
                                                    {policy.lastEnforcedAt
                                                        ? `Last enforced: ${new Date(policy.lastEnforcedAt).toLocaleString()}`
                                                        : "Never enforced"}
                                                </Typography>
                                            </Stack>
                                        </Box>
                                        <Button
                                            variant={editingPolicy?.id === policy.id ? "outlined" : "text"}
                                            size="small"
                                            onClick={() => setEditingPolicy(editingPolicy?.id === policy.id ? null : policy)}
                                            startIcon={editingPolicy?.id === policy.id ? <CloseIcon /> : <EditIcon />}
                                            sx={{ borderRadius: 20 }}
                                        >
                                            {editingPolicy?.id === policy.id ? "Cancel" : "Edit"}
                                        </Button>
                                    </Stack>

                                    {editingPolicy?.id === policy.id ? (
                                        <Box component="form">
                                            <Grid container spacing={3}>
                                                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                                    <TextField
                                                        label="Leads (days)"
                                                        type="number"
                                                        fullWidth
                                                        size="small"
                                                        value={editingPolicy.leadRetentionDays}
                                                        onChange={(e) => setEditingPolicy({
                                                            ...editingPolicy,
                                                            leadRetentionDays: parseInt(e.target.value) || 0
                                                        })}
                                                    />
                                                </Grid>
                                                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                                    <TextField
                                                        label="Opportunities (days)"
                                                        type="number"
                                                        fullWidth
                                                        size="small"
                                                        value={editingPolicy.opportunityRetentionDays}
                                                        onChange={(e) => setEditingPolicy({
                                                            ...editingPolicy,
                                                            opportunityRetentionDays: parseInt(e.target.value) || 0
                                                        })}
                                                    />
                                                </Grid>
                                                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                                    <TextField
                                                        label="Activities (days)"
                                                        type="number"
                                                        fullWidth
                                                        size="small"
                                                        value={editingPolicy.activityRetentionDays}
                                                        onChange={(e) => setEditingPolicy({
                                                            ...editingPolicy,
                                                            activityRetentionDays: parseInt(e.target.value) || 0
                                                        })}
                                                    />
                                                </Grid>
                                                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                                    <TextField
                                                        label="Audit Logs (days)"
                                                        type="number"
                                                        fullWidth
                                                        size="small"
                                                        value={editingPolicy.auditLogRetentionDays}
                                                        onChange={(e) => setEditingPolicy({
                                                            ...editingPolicy,
                                                            auditLogRetentionDays: parseInt(e.target.value) || 0
                                                        })}
                                                    />
                                                </Grid>
                                                <Grid size={{ xs: 12 }} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                    <Button
                                                        variant="contained"
                                                        onClick={() => updatePolicy(policy.tenantId, {
                                                            leadRetentionDays: editingPolicy.leadRetentionDays,
                                                            opportunityRetentionDays: editingPolicy.opportunityRetentionDays,
                                                            activityRetentionDays: editingPolicy.activityRetentionDays,
                                                            auditLogRetentionDays: editingPolicy.auditLogRetentionDays,
                                                        })}
                                                        startIcon={<SaveIcon />}
                                                        sx={{ borderRadius: 20 }}
                                                    >
                                                        Save Changes
                                                    </Button>
                                                </Grid>
                                            </Grid>
                                        </Box>
                                    ) : (
                                        <Grid container spacing={2}>
                                            <Grid size={{ xs: 6, sm: 3 }}>
                                                <Typography variant="body2" color="text.secondary">Leads</Typography>
                                                <Typography variant="body1" fontWeight={500}>{policy.leadRetentionDays} days</Typography>
                                            </Grid>
                                            <Grid size={{ xs: 6, sm: 3 }}>
                                                <Typography variant="body2" color="text.secondary">Opportunities</Typography>
                                                <Typography variant="body1" fontWeight={500}>{policy.opportunityRetentionDays} days</Typography>
                                            </Grid>
                                            <Grid size={{ xs: 6, sm: 3 }}>
                                                <Typography variant="body2" color="text.secondary">Activities</Typography>
                                                <Typography variant="body1" fontWeight={500}>{policy.activityRetentionDays} days</Typography>
                                            </Grid>
                                            <Grid size={{ xs: 6, sm: 3 }}>
                                                <Typography variant="body2" color="text.secondary">Audit Logs</Typography>
                                                <Typography variant="body1" fontWeight={500}>{policy.auditLogRetentionDays} days</Typography>
                                            </Grid>
                                        </Grid>
                                    )}
                                </Box>
                            ))}
                        </Stack>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
}
