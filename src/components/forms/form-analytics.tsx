"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Alert,
    Box,
    CircularProgress,
    Grid,
    LinearProgress,
    Paper,
    Stack,
    Typography,
    alpha,
    useTheme,
} from "@mui/material";
import {
    DescriptionOutlined as DescriptionOutlinedIcon,
    GroupOutlined as GroupOutlinedIcon,
    ReportGmailerrorredOutlined as ReportGmailerrorredOutlinedIcon,
    CopyAllOutlined as CopyAllOutlinedIcon,
    TrendingUpOutlined as TrendingUpOutlinedIcon,
} from "@mui/icons-material";
import { apiFetch } from "@/lib/api";

interface FormStats {
    total: number;
    processed: number;
    spam: number;
    duplicate: number;
    errors: number;
    conversionRate: number;
    spamRate: number;
    duplicateRate: number;
    recentTrend: number;
}

interface AnalyticsDashboardProps {
    formId: string;
}

function MetricCard({
    title,
    value,
    subtitle,
    icon,
    tint,
}: {
    title: string;
    value: string | number;
    subtitle: string;
    icon: React.ReactNode;
    tint: string;
}) {
    return (
        <Paper
            variant="outlined"
            sx={{
                p: 2,
                borderRadius: "14px",
                height: "100%",
            }}
        >
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
                <Box>
                    <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary" }}>
                        {title}
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.7, mt: 0.75 }}>
                        {value}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                        {subtitle}
                    </Typography>
                </Box>
                <Box
                    sx={{
                        width: 40,
                        height: 40,
                        borderRadius: "12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        bgcolor: tint,
                        color: "primary.main",
                        flexShrink: 0,
                    }}
                >
                    {icon}
                </Box>
            </Stack>
        </Paper>
    );
}

export function AnalyticsDashboard({ formId }: AnalyticsDashboardProps) {
    const theme = useTheme();
    const [stats, setStats] = useState<FormStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await apiFetch(`/forms/${formId}/stats`);
                setStats(data);
            } catch (fetchError) {
                console.error("Failed to load stats:", fetchError);
                setError("Failed to load analytics");
            } finally {
                setLoading(false);
            }
        };

        if (formId) fetchStats();
    }, [formId]);

    const conversionPercent = useMemo(() => Math.round((stats?.conversionRate ?? 0) * 100), [stats]);
    const spamPercent = useMemo(() => Math.round((stats?.spamRate ?? 0) * 100), [stats]);
    const duplicatePercent = useMemo(() => Math.round((stats?.duplicateRate ?? 0) * 100), [stats]);

    if (loading) {
        return (
            <Box sx={{ minHeight: 280, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Stack alignItems="center" spacing={1}>
                    <CircularProgress size={24} />
                    <Typography variant="body2" color="text.secondary">
                        Loading analytics...
                    </Typography>
                </Stack>
            </Box>
        );
    }

    if (error || !stats) {
        return <Alert severity="error">{error ?? "No analytics available"}</Alert>;
    }

    return (
        <Stack spacing={2.5}>
            <Box>
                <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: -0.3 }}>
                    Performance Snapshot
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Form capture health, lead conversion quality, and recent submission momentum.
                </Typography>
            </Box>

            <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, md: 6, xl: 3 }}>
                    <MetricCard
                        title="Total Submissions"
                        value={stats.total}
                        subtitle="All-time responses collected"
                        icon={<DescriptionOutlinedIcon fontSize="small" />}
                        tint={alpha(theme.palette.primary.main, 0.08)}
                    />
                </Grid>
                <Grid size={{ xs: 12, md: 6, xl: 3 }}>
                    <MetricCard
                        title="Processed Leads"
                        value={stats.processed}
                        subtitle={`${conversionPercent}% converted successfully`}
                        icon={<GroupOutlinedIcon fontSize="small" />}
                        tint={alpha(theme.palette.success.main, 0.08)}
                    />
                </Grid>
                <Grid size={{ xs: 12, md: 6, xl: 3 }}>
                    <MetricCard
                        title="Spam Detected"
                        value={stats.spam}
                        subtitle={`${spamPercent}% blocked or flagged`}
                        icon={<ReportGmailerrorredOutlinedIcon fontSize="small" />}
                        tint={alpha(theme.palette.error.main, 0.08)}
                    />
                </Grid>
                <Grid size={{ xs: 12, md: 6, xl: 3 }}>
                    <MetricCard
                        title="Duplicates"
                        value={stats.duplicate}
                        subtitle={`${duplicatePercent}% merged or skipped`}
                        icon={<CopyAllOutlinedIcon fontSize="small" />}
                        tint={alpha(theme.palette.warning.main, 0.08)}
                    />
                </Grid>
            </Grid>

            <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, lg: 7 }}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: "14px", height: "100%" }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1.5 }}>
                            Conversion Health
                        </Typography>
                        <Stack spacing={2}>
                            <Box>
                                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Lead Conversion</Typography>
                                    <Typography variant="body2" color="text.secondary">{conversionPercent}%</Typography>
                                </Stack>
                                <LinearProgress
                                    variant="determinate"
                                    value={conversionPercent}
                                    sx={{
                                        height: 8,
                                        borderRadius: "999px",
                                        bgcolor: alpha(theme.palette.primary.main, 0.08),
                                    }}
                                />
                            </Box>
                            <Box>
                                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Spam Rate</Typography>
                                    <Typography variant="body2" color="text.secondary">{spamPercent}%</Typography>
                                </Stack>
                                <LinearProgress
                                    variant="determinate"
                                    color="error"
                                    value={spamPercent}
                                    sx={{
                                        height: 8,
                                        borderRadius: "999px",
                                        bgcolor: alpha(theme.palette.error.main, 0.08),
                                    }}
                                />
                            </Box>
                            <Box>
                                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Duplicate Rate</Typography>
                                    <Typography variant="body2" color="text.secondary">{duplicatePercent}%</Typography>
                                </Stack>
                                <LinearProgress
                                    variant="determinate"
                                    color="warning"
                                    value={duplicatePercent}
                                    sx={{
                                        height: 8,
                                        borderRadius: "999px",
                                        bgcolor: alpha(theme.palette.warning.main, 0.08),
                                    }}
                                />
                            </Box>
                        </Stack>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 12, lg: 5 }}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: "14px", height: "100%" }}>
                        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.25 }}>
                            <Box
                                sx={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: "12px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                                    color: "primary.main",
                                }}
                            >
                                <TrendingUpOutlinedIcon fontSize="small" />
                            </Box>
                            <Box>
                                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                    Recent Activity
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Last 30 days of submissions
                                </Typography>
                            </Box>
                        </Stack>
                        <Box
                            sx={{
                                p: 2,
                                borderRadius: "12px",
                                bgcolor: alpha(theme.palette.primary.main, 0.03),
                                border: "1px dashed",
                                borderColor: alpha(theme.palette.primary.main, 0.16),
                            }}
                        >
                            <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: -1 }}>
                                {stats.recentTrend}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                                submissions captured in the last 30 days
                            </Typography>
                            <Typography variant="caption" sx={{ display: "block", mt: 1.5, color: "text.secondary" }}>
                                Errors: {stats.errors} submissions need manual review
                            </Typography>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>
        </Stack>
    );
}
