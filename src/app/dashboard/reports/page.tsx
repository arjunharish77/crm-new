"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
    Box,
    Typography,
    Button,
    Grid,
    Card,
    CardContent,
    Stack,
    alpha,
    useTheme,
    Skeleton,
    LinearProgress
} from "@mui/material";
import {
    Download as DownloadIcon,
    TrendingUp as TrendingUpIcon,
    Group as UsersIcon,
    AttachMoney as DollarSignIcon,
    History as ActivityIcon
} from "@mui/icons-material";
import { toast } from "sonner";

export default function ReportsPage() {
    const theme = useTheme();
    const [leadsData, setLeadsData] = useState<any>(null);
    const [oppsData, setOppsData] = useState<any>(null);
    const [activitiesData, setActivitiesData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [l, o, a] = await Promise.all([
                    apiFetch("/reports/leads"),
                    apiFetch("/reports/opportunities"),
                    apiFetch("/reports/activities")
                ]);
                setLeadsData(l);
                setOppsData(o);
                setActivitiesData(a);
            } catch (error) {
                toast.error("Failed to load reports");
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    const handleExport = () => {
        const sections = [
            ["Summary", [
                ["metric", "value"],
                ["total_leads", String(leadsData?.total || 0)],
                ["pipeline_revenue", String(oppsData?.totalRevenue || 0)],
                ["total_activities", String(activitiesData?.total || 0)],
            ]],
            ["Leads By Source", [
                ["source", "count"],
                ...((leadsData?.bySource || []).map((item: any) => [item.source || "Unknown", String(item.count || 0)]))
            ]],
            ["Opportunities By Stage", [
                ["stage", "count", "value"],
                ...((oppsData?.byStage || []).map((item: any) => [
                    item.stage || "Unknown",
                    String(item.count || 0),
                    String(item.value || 0),
                ]))
            ]],
            ["Activities By Type", [
                ["type", "count"],
                ...((activitiesData?.byType || []).map((item: any) => [item.type || "Unknown", String(item.count || 0)]))
            ]],
        ];

        const csv = sections
            .map(([title, rows]) => {
                const safeRows = rows as string[][];
                return [
                    `"${title}"`,
                    ...safeRows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")),
                ].join("\n");
            })
            .join("\n\n");

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `crm-report-snapshot-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success("Report snapshot exported");
    };

    if (loading) {
        return (
            <Box sx={{ p: { xs: 2, md: 4 }, spaceY: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 4 }}>
                    <Box>
                        <Skeleton width={300} height={40} />
                        <Skeleton width={200} height={20} />
                    </Box>
                    <Skeleton width={150} height={48} variant="rounded" sx={{ borderRadius: 10 }} />
                </Box>
                <Grid container spacing={3}>
                    {[1, 2, 3].map((i) => (
                        <Grid size={{ xs: 12, md: 4 }} key={i}>
                            <Skeleton variant="rounded" height={160} sx={{ borderRadius: 4 }} />
                        </Grid>
                    ))}
                    <Grid size={{ xs: 12, md: 8 }}>
                        <Skeleton variant="rounded" height={400} sx={{ borderRadius: 4 }} />
                    </Grid>
                    <Grid size={{ xs: 12, md: 4 }}>
                        <Skeleton variant="rounded" height={400} sx={{ borderRadius: 4 }} />
                    </Grid>
                </Grid>
            </Box>
        );
    }

    const revenue = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(oppsData?.totalRevenue || 0);

    return (
        <Box sx={{ p: { xs: 0, sm: 2 }, pb: 8 }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', mb: 4, gap: 2 }}>
                <Box>
                    <Typography variant="h3" sx={{ fontWeight: 800, letterSpacing: -1, color: 'text.primary' }}>
                        Reports & Analytics
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Overview of your sales performance across all modules.
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    color="primary"
                    startIcon={<DownloadIcon />}
                    onClick={handleExport}
                    sx={{ borderRadius: 10, px: 3, height: 48 }}
                >
                    Export Data
                </Button>
            </Box>

            {/* Top Metrics */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <MetricCard
                        title="Total Leads"
                        value={leadsData?.total || 0}
                        subtitle="Across all sources"
                        icon={<UsersIcon />}
                        color={theme.palette.primary.main}
                    />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <MetricCard
                        title="Pipeline Revenue"
                        value={revenue}
                        subtitle="Potential value in open deals"
                        icon={<DollarSignIcon />}
                        color={theme.palette.secondary.main}
                    />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <MetricCard
                        title="Total Activities"
                        value={activitiesData?.total || 0}
                        subtitle="Events & tasks completed"
                        icon={<ActivityIcon />}
                        color={theme.palette.tertiary.main}
                    />
                </Grid>
            </Grid>

            {/* Custom Reports Section */}
            <CustomReportsSection />

            {/* Charts Area */}
            <Grid container spacing={3} sx={{ mt: 1 }}>
                <Grid size={{ xs: 12, lg: 7 }}>
                    <Card sx={{ borderRadius: 4, border: '1px solid', borderColor: 'divider', height: '100%' }}>
                        <CardContent sx={{ p: 3 }}>
                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Pipeline by Stage</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>Value breakdown per opportunity stage</Typography>

                            <Stack spacing={4}>
                                {oppsData?.byStage?.map((item: any) => (
                                    <Box key={item.stage}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.stage}</Typography>
                                            <Typography variant="body2" color="text.secondary">{item.count} Deals</Typography>
                                        </Box>
                                        <LinearProgress
                                            variant="determinate"
                                            value={(item.count / (oppsData.total || 1)) * 100}
                                            sx={{
                                                height: 8,
                                                borderRadius: 4,
                                                bgcolor: alpha(theme.palette.primary.main, 0.08),
                                                '& .MuiLinearProgress-bar': { borderRadius: 4 }
                                            }}
                                        />
                                        <Typography variant="caption" sx={{ display: 'block', textAlign: 'right', mt: 0.5, fontWeight: 700 }}>
                                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(item.value)}
                                        </Typography>
                                    </Box>
                                ))}
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid size={{ xs: 12, lg: 5 }}>
                    <Card sx={{ borderRadius: 4, border: '1px solid', borderColor: 'divider', height: '100%' }}>
                        <CardContent sx={{ p: 3 }}>
                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Leads by Source</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Distribution of incoming leads</Typography>

                            <Stack spacing={2}>
                                {leadsData?.bySource?.map((item: any) => (
                                    <Box
                                        key={item.source}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            p: 2,
                                            borderRadius: 3,
                                            bgcolor: 'surfaceContainerLow',
                                            transition: 'transform 0.2s',
                                            '&:hover': { transform: 'translateX(4px)' }
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main' }} />
                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.source}</Typography>
                                        </Box>
                                        <Typography variant="body2" sx={{ fontWeight: 800 }}>{item.count}</Typography>
                                    </Box>
                                ))}
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
}

interface MetricCardProps {
    title: string;
    value: string | number;
    subtitle: string;
    icon: React.ReactNode;
    color: string;
}

function MetricCard({ title, value, subtitle, icon, color }: MetricCardProps) {
    return (
        <Card sx={{
            borderRadius: 5,
            border: '1px solid',
            borderColor: 'divider',
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: `0 12px 24px ${alpha(color, 0.1)}`,
                borderColor: alpha(color, 0.4)
            }
        }}>
            <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Box sx={{
                        p: 1.5,
                        borderRadius: 3,
                        bgcolor: alpha(color, 0.08),
                        color: color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        {icon}
                    </Box>
                </Box>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -1 }}>
                        {value}
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', mt: 1 }}>
                        {title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {subtitle}
                    </Typography>
                </Box>
            </CardContent>
        </Card>
    );
}

function CustomReportsSection() {
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        apiFetch("/reports/custom")
            .then(setReports)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const handleExport = async (id: string, name: string) => {
        try {
            toast.promise(
                apiFetch(`/reports/custom/${id}/export`).then(csv => {
                    const blob = new Blob([csv as any], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.setAttribute('hidden', '');
                    a.setAttribute('href', url);
                    a.setAttribute('download', `${name}.csv`);
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                }),
                {
                    loading: 'Generating CSV...',
                    success: 'Report exported successfully',
                    error: 'Failed to export report'
                }
            );
        } catch (error) {
            console.error(error);
        }
    };

    if (loading) return <Skeleton variant="rectangular" height={100} sx={{ borderRadius: 4, mb: 4 }} />;

    return (
        <Card sx={{ borderRadius: 4, mb: 4, border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Custom Reports</Typography>
                {reports.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">No custom reports created yet.</Typography>
                ) : (
                    <Stack spacing={2}>
                        {reports.map((report) => (
                            <Box key={report.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                                <Box>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{report.name}</Typography>
                                    <Typography variant="caption" color="text.secondary">{report.module} • Created {new Date(report.createdAt).toLocaleDateString()}</Typography>
                                </Box>
                                <Button size="small" startIcon={<DownloadIcon />} onClick={() => handleExport(report.id, report.name)}>
                                    Export CSV
                                </Button>
                            </Box>
                        ))}
                    </Stack>
                )}
            </CardContent>
        </Card>
    );
}
