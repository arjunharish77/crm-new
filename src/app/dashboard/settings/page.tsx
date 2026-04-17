"use client";

import { useEffect, useState } from "react";
import {
    Box,
    Typography,
    TextField,
    Button,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Divider,
    Alert,
    Stack,
} from "@mui/material";
import { Save as SaveIcon, Settings as GeneralIcon } from "@mui/icons-material";
import { toast } from "sonner";
import { useTheme, alpha, Grid } from "@mui/material";
import { apiFetch } from "@/lib/api";

export default function GeneralSettingsPage() {
    const theme = useTheme();
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState({
        companyName: "",
        timezone: "America/New_York",
        currency: "USD",
        language: "en",
        dateFormat: "MM/dd/yyyy",
    });

    useEffect(() => {
        let mounted = true;

        const fetchSettings = async () => {
            try {
                const data = await apiFetch("/settings/general");
                if (!mounted || !data) return;
                setSettings((current) => ({
                    ...current,
                    companyName: data.companyName ?? "",
                    timezone: data.timezone ?? current.timezone,
                    currency: data.currency ?? current.currency,
                    language: data.language ?? current.language,
                    dateFormat: data.dateFormat ?? current.dateFormat,
                }));
            } catch {
                toast.error("Failed to load settings");
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchSettings();
        return () => {
            mounted = false;
        };
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await apiFetch("/settings/general", {
                method: "PATCH",
                body: JSON.stringify(settings),
            });
            toast.success("Settings saved successfully");
        } catch {
            toast.error("Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Box>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                <Box sx={{ p: 1, borderRadius: '10px', bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main', display: 'flex' }}>
                    <GeneralIcon fontSize="small" />
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: -1 }}>
                    General Settings
                </Typography>
            </Stack>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, opacity: 0.8 }}>
                Configure your organization's core profile, localization, and display preferences.
            </Typography>

            <Stack spacing={4} sx={{ maxWidth: 560 }}>
                <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: 0.5, color: 'text.disabled' }}>
                        ORGANIZATION PROFILE
                    </Typography>
                    <TextField
                        label="Company Name"
                        placeholder="Acme Corp"
                        value={settings.companyName}
                        onChange={(e) => setSettings((s) => ({ ...s, companyName: e.target.value }))}
                        disabled={loading}
                        fullWidth
                        variant="outlined"
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                    />
                </Box>

                <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: 0.5, color: 'text.disabled' }}>
                        LOCALIZATION
                    </Typography>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormControl fullWidth>
                                <InputLabel>Timezone</InputLabel>
                                <Select
                                    value={settings.timezone}
                                    label="Timezone"
                                    onChange={(e) => setSettings((s) => ({ ...s, timezone: e.target.value }))}
                                    disabled={loading}
                                    sx={{ borderRadius: '12px' }}
                                >
                                    <MenuItem value="America/New_York">Eastern (US & Canada)</MenuItem>
                                    <MenuItem value="America/Chicago">Central (US & Canada)</MenuItem>
                                    <MenuItem value="America/Denver">Mountain (US & Canada)</MenuItem>
                                    <MenuItem value="America/Los_Angeles">Pacific (US & Canada)</MenuItem>
                                    <MenuItem value="Europe/London">London (GMT)</MenuItem>
                                    <MenuItem value="Europe/Paris">Paris (CET)</MenuItem>
                                    <MenuItem value="Asia/Tokyo">Tokyo (JST)</MenuItem>
                                    <MenuItem value="Asia/Kolkata">Kolkata (IST)</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormControl fullWidth>
                                <InputLabel>Currency</InputLabel>
                                <Select
                                    value={settings.currency}
                                    label="Currency"
                                    onChange={(e) => setSettings((s) => ({ ...s, currency: e.target.value }))}
                                    disabled={loading}
                                    sx={{ borderRadius: '12px' }}
                                >
                                    <MenuItem value="USD">USD — US Dollar</MenuItem>
                                    <MenuItem value="EUR">EUR — Euro</MenuItem>
                                    <MenuItem value="GBP">GBP — British Pound</MenuItem>
                                    <MenuItem value="JPY">JPY — Japanese Yen</MenuItem>
                                    <MenuItem value="INR">INR — Indian Rupee</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormControl fullWidth>
                                <InputLabel>Language</InputLabel>
                                <Select
                                    value={settings.language}
                                    label="Language"
                                    onChange={(e) => setSettings((s) => ({ ...s, language: e.target.value }))}
                                    disabled={loading}
                                    sx={{ borderRadius: '12px' }}
                                >
                                    <MenuItem value="en">English</MenuItem>
                                    <MenuItem value="hi">Hindi</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <FormControl fullWidth>
                                <InputLabel>Date Format</InputLabel>
                                <Select
                                    value={settings.dateFormat}
                                    label="Date Format"
                                    onChange={(e) => setSettings((s) => ({ ...s, dateFormat: e.target.value }))}
                                    disabled={loading}
                                    sx={{ borderRadius: '12px' }}
                                >
                                    <MenuItem value="MM/dd/yyyy">MM/dd/yyyy</MenuItem>
                                    <MenuItem value="dd/MM/yyyy">dd/MM/yyyy</MenuItem>
                                    <MenuItem value="yyyy-MM-dd">yyyy-MM-dd</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                    </Grid>
                </Box>
            </Stack>

            <Box sx={{ mt: 6 }}>
                <Button
                    variant="contained"
                    size="large"
                    startIcon={<SaveIcon />}
                    onClick={handleSave}
                    disabled={saving || loading}
                    sx={{
                        borderRadius: '12px',
                        px: 4,
                        py: 1.5,
                        boxShadow: `0 8px 16px ${alpha(theme.palette.primary.main, 0.15)}`,
                        '&:hover': {
                            boxShadow: `0 12px 24px ${alpha(theme.palette.primary.main, 0.2)}`,
                        }
                    }}
                >
                    {saving ? "Saving Changes..." : loading ? "Loading..." : "Save Settings"}
                </Button>
            </Box>
        </Box>
    );
}
