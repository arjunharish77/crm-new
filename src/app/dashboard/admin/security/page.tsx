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
    TextField,
    Switch,
    Stack,
    CircularProgress,
    FormControlLabel,
    InputAdornment,
    Grid,
    Paper,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Alert
} from "@mui/material";
import {
    Save as SaveIcon,
    Shield as ShieldIcon,
    Lock as LockIcon,
    Edit as EditIcon,
    Close as CloseIcon
} from "@mui/icons-material";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";

interface SecurityPolicy {
    id?: string;
    tenantId?: string | null;
    minPasswordLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    passwordExpiryDays: number;
    preventPasswordReuse: number;
    sessionTimeoutMinutes: number;
    maxConcurrentSessions: number;
    enforceSessionTimeout: boolean;
    maxLoginAttempts: number;
    lockoutDurationMinutes: number;
    enableTwoFactor: boolean;
    enforceIpRestrictions: boolean;
    enforceAuditLogging: boolean;
    logFailedLoginAttempts: boolean;
    requireLoginNotifications: boolean;
    tenant?: {
        id: string;
        name: string;
    };
}

export default function SecurityPolicyPage() {
    const [policies, setPolicies] = useState<SecurityPolicy[]>([]);
    const [selectedPolicy, setSelectedPolicy] = useState<SecurityPolicy | null>(null);
    const [editing, setEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
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
            const data = await apiFetch("/platform-admin/security/policies");
            setPolicies(data);
            if (data.length > 0) {
                setSelectedPolicy(data[0]);
            }
        } catch (error) {
            toast.error("Failed to load policies");
        } finally {
            setLoading(false);
        }
    };

    const savePolicy = async () => {
        if (!selectedPolicy) return;

        setSaving(true);
        try {
            const tenantId = selectedPolicy.tenantId || 'global';
            await apiFetch(`/platform-admin/security/policy/${tenantId}`, {
                method: "PATCH",
                body: JSON.stringify(selectedPolicy),
            });
            toast.success("Security policy updated!");
            fetchPolicies();
            setEditing(false);
        } catch (error) {
            toast.error("Failed to save policy");
        } finally {
            setSaving(false);
        }
    };

    const updateField = (field: keyof SecurityPolicy, value: any) => {
        if (selectedPolicy) {
            setSelectedPolicy({ ...selectedPolicy, [field]: value });
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
                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>Security Policies</Typography>
                    <Typography variant="body1" color="text.secondary">
                        Configure security settings for tenants.
                    </Typography>
                </Box>
                {editing ? (
                    <Stack direction="row" spacing={2}>
                        <Button
                            variant="outlined"
                            onClick={() => setEditing(false)}
                            startIcon={<CloseIcon />}
                            sx={{ borderRadius: 20 }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="contained"
                            onClick={savePolicy}
                            disabled={saving}
                            startIcon={<SaveIcon />}
                            sx={{ borderRadius: 20 }}
                        >
                            {saving ? "Saving..." : "Save Changes"}
                        </Button>
                    </Stack>
                ) : (
                    <Button
                        variant="contained"
                        onClick={() => setEditing(true)}
                        startIcon={<EditIcon />}
                        sx={{ borderRadius: 20 }}
                    >
                        Edit Policy
                    </Button>
                )}
            </Box>
            <Divider sx={{ mb: 4 }} />

            {selectedPolicy && (
                <Grid container spacing={3}>
                    {/* Password Policy */}
                    <Grid size={{ xs: 12, md: 6 }}>
                        <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
                            <CardHeader
                                title={
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <LockIcon color="primary" />
                                        <Typography variant="h6" sx={{ fontWeight: 600 }}>Password Policy</Typography>
                                    </Stack>
                                }
                                subheader="Configure password requirements and security"
                            />
                            <Divider />
                            <CardContent>
                                <Stack spacing={3}>
                                    <Grid container spacing={2}>
                                        <Grid size={{ xs: 12 }}>
                                            <TextField
                                                label="Minimum Password Length"
                                                type="number"
                                                fullWidth
                                                value={selectedPolicy.minPasswordLength}
                                                onChange={(e) => updateField('minPasswordLength', parseInt(e.target.value))}
                                                disabled={!editing}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 12 }}>
                                            <TextField
                                                label="Password Expiry (days, 0=never)"
                                                type="number"
                                                fullWidth
                                                value={selectedPolicy.passwordExpiryDays}
                                                onChange={(e) => updateField('passwordExpiryDays', parseInt(e.target.value))}
                                                disabled={!editing}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 12 }}>
                                            <TextField
                                                label="Prevent Reuse (last N passwords)"
                                                type="number"
                                                fullWidth
                                                value={selectedPolicy.preventPasswordReuse}
                                                onChange={(e) => updateField('preventPasswordReuse', parseInt(e.target.value))}
                                                disabled={!editing}
                                            />
                                        </Grid>
                                    </Grid>

                                    <Stack spacing={1}>
                                        <Divider />
                                        <FormControlLabel
                                            control={<Switch checked={selectedPolicy.requireUppercase} onChange={(e) => updateField('requireUppercase', e.target.checked)} disabled={!editing} />}
                                            label="Require Uppercase Letters"
                                        />
                                        <FormControlLabel
                                            control={<Switch checked={selectedPolicy.requireLowercase} onChange={(e) => updateField('requireLowercase', e.target.checked)} disabled={!editing} />}
                                            label="Require Lowercase Letters"
                                        />
                                        <FormControlLabel
                                            control={<Switch checked={selectedPolicy.requireNumbers} onChange={(e) => updateField('requireNumbers', e.target.checked)} disabled={!editing} />}
                                            label="Require Numbers"
                                        />
                                        <FormControlLabel
                                            control={<Switch checked={selectedPolicy.requireSpecialChars} onChange={(e) => updateField('requireSpecialChars', e.target.checked)} disabled={!editing} />}
                                            label="Require Special Characters"
                                        />
                                    </Stack>
                                </Stack>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Login & Session Policy */}
                    <Grid size={{ xs: 12, md: 6 }}>
                        <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
                            <CardHeader
                                title={
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <ShieldIcon color="primary" />
                                        <Typography variant="h6" sx={{ fontWeight: 600 }}>Login & Session</Typography>
                                    </Stack>
                                }
                                subheader="Manage session timeouts and access controls"
                            />
                            <Divider />
                            <CardContent>
                                <Stack spacing={3}>
                                    <Grid container spacing={2}>
                                        <Grid size={{ xs: 6 }}>
                                            <TextField
                                                label="Session Timeout (min)"
                                                type="number"
                                                fullWidth
                                                value={selectedPolicy.sessionTimeoutMinutes}
                                                onChange={(e) => updateField('sessionTimeoutMinutes', parseInt(e.target.value))}
                                                disabled={!editing}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <TextField
                                                label="Max Concurrent Sessions"
                                                type="number"
                                                fullWidth
                                                value={selectedPolicy.maxConcurrentSessions}
                                                onChange={(e) => updateField('maxConcurrentSessions', parseInt(e.target.value))}
                                                disabled={!editing}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <TextField
                                                label="Max Login Attempts"
                                                type="number"
                                                fullWidth
                                                value={selectedPolicy.maxLoginAttempts}
                                                onChange={(e) => updateField('maxLoginAttempts', parseInt(e.target.value))}
                                                disabled={!editing}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <TextField
                                                label="Lockout Duration (min)"
                                                type="number"
                                                fullWidth
                                                value={selectedPolicy.lockoutDurationMinutes}
                                                onChange={(e) => updateField('lockoutDurationMinutes', parseInt(e.target.value))}
                                                disabled={!editing}
                                            />
                                        </Grid>
                                    </Grid>

                                    <Stack spacing={1}>
                                        <Divider />
                                        <FormControlLabel
                                            control={<Switch checked={selectedPolicy.enforceSessionTimeout} onChange={(e) => updateField('enforceSessionTimeout', e.target.checked)} disabled={!editing} />}
                                            label="Enforce Session Timeout"
                                        />
                                        <FormControlLabel
                                            control={<Switch checked={selectedPolicy.enableTwoFactor} onChange={(e) => updateField('enableTwoFactor', e.target.checked)} disabled={!editing} />}
                                            label="Enable Two-Factor Authentication"
                                        />
                                        <FormControlLabel
                                            control={<Switch checked={selectedPolicy.logFailedLoginAttempts} onChange={(e) => updateField('logFailedLoginAttempts', e.target.checked)} disabled={!editing} />}
                                            label="Log Failed Login Attempts"
                                        />
                                        <FormControlLabel
                                            control={<Switch checked={selectedPolicy.requireLoginNotifications} onChange={(e) => updateField('requireLoginNotifications', e.target.checked)} disabled={!editing} />}
                                            label="Require Login Notifications"
                                        />
                                    </Stack>
                                </Stack>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Audit & Compliance */}
                    <Grid size={{ xs: 12 }}>
                        <Card variant="outlined" sx={{ borderRadius: 2 }}>
                            <CardHeader
                                title={<Typography variant="h6" sx={{ fontWeight: 600 }}>Audit & Compliance</Typography>}
                            />
                            <Divider />
                            <CardContent>
                                <Stack direction={{ xs: 'column', md: 'row' }} spacing={4}>
                                    <FormControlLabel
                                        control={<Switch checked={selectedPolicy.enforceAuditLogging} onChange={(e) => updateField('enforceAuditLogging', e.target.checked)} disabled={!editing} />}
                                        label="Enforce Audit Logging"
                                    />
                                    <FormControlLabel
                                        control={<Switch checked={selectedPolicy.enforceIpRestrictions} onChange={(e) => updateField('enforceIpRestrictions', e.target.checked)} disabled={!editing} />}
                                        label="Enforce IP Restrictions"
                                    />
                                </Stack>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            )}
        </Box>
    );
}
