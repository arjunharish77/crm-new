'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Avatar,
    Box,
    Button,
    Card,
    CircularProgress,
    Chip,
    Grid,
    Stack,
    Tab,
    Tabs,
    Typography,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    OpenInNew as OpenInNewIcon,
    AutoGraph as AutoGraphIcon,
    Code as CodeIcon,
    ViewKanban as ViewKanbanIcon,
} from '@mui/icons-material';
import { apiFetch } from '@/lib/api';
import { FormEditor } from '@/components/forms/form-editor';
import { SubmissionsTable } from '@/components/forms/submissions-table';
import { AnalyticsDashboard } from '@/components/forms/form-analytics';

type BuilderTab = 'editor' | 'submissions' | 'analytics';

export default function FormBuilderPage() {
    const params = useParams();
    const router = useRouter();
    const formId = params.formId as string;
    const [form, setForm] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<BuilderTab>('editor');

    useEffect(() => {
        if (!formId) return;

        apiFetch(`/forms/${formId}`)
            .then(setForm)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [formId]);

    if (loading) {
        return (
            <Box sx={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress />
            </Box>
        );
    }

    if (!form) {
        return (
            <Box sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                    Form not found
                </Typography>
                <Button onClick={() => router.push('/dashboard/forms')} variant="outlined" sx={{ borderRadius: '10px' }}>
                    Back to Forms
                </Button>
            </Box>
        );
    }

    return (
        <Box sx={{ px: { xs: 2, md: 3 }, py: { xs: 2, md: 2.5 }, maxWidth: 1700, mx: 'auto' }}>
            <Stack spacing={2}>
                <Box>
                    <Button
                        startIcon={<ArrowBackIcon />}
                        onClick={() => router.push('/dashboard/forms')}
                        sx={{ mb: 1, borderRadius: '10px', color: 'text.secondary', minHeight: 34 }}
                    >
                        Back
                    </Button>
                    <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        justifyContent="space-between"
                        alignItems={{ xs: 'flex-start', md: 'center' }}
                        spacing={1.5}
                    >
                        <Box>
                            <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.6 }}>
                                {form.name}
                            </Typography>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                                <Typography variant="body2" color="text.secondary">
                                    {form.isActive ? 'Active' : 'Draft'}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">•</Typography>
                                <Typography
                                    component={Link}
                                    href={`/public-form/${form.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    variant="body2"
                                    sx={{
                                        color: 'primary.main',
                                        textDecoration: 'none',
                                        fontWeight: 600,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 0.5,
                                        '&:hover': { textDecoration: 'underline' },
                                    }}
                                >
                                    View Public Page
                                    <OpenInNewIcon sx={{ fontSize: 16 }} />
                                </Typography>
                            </Stack>
                        </Box>
                        <Chip
                            label={form.isActive ? 'Live Form' : 'Draft Form'}
                            color={form.isActive ? 'success' : 'default'}
                            sx={{ borderRadius: '8px', fontWeight: 700 }}
                        />
                    </Stack>
                </Box>

                <Grid container spacing={1.5}>
                    <Grid size={{ xs: 12, md: 4 }}>
                        <Card sx={{ p: 2, borderRadius: '14px', border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
                            <Stack direction="row" spacing={1.25} alignItems="center">
                                <Avatar sx={{ width: 38, height: 38, bgcolor: 'primaryContainer', color: 'onPrimaryContainer' }}>
                                    <ViewKanbanIcon fontSize="small" />
                                </Avatar>
                                <Box>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                                        Builder Workspace
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Structure fields, layout, and embed behaviour in one compact studio.
                                    </Typography>
                                </Box>
                            </Stack>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 12, md: 4 }}>
                        <Card sx={{ p: 2, borderRadius: '14px', border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
                            <Stack direction="row" spacing={1.25} alignItems="center">
                                <Avatar sx={{ width: 38, height: 38, bgcolor: 'secondaryContainer', color: 'onSecondaryContainer' }}>
                                    <CodeIcon fontSize="small" />
                                </Avatar>
                                <Box>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                                        Embed Ready
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Publish the public page or export the embed snippet when the layout is ready.
                                    </Typography>
                                </Box>
                            </Stack>
                        </Card>
                    </Grid>
                    <Grid size={{ xs: 12, md: 4 }}>
                        <Card sx={{ p: 2, borderRadius: '14px', border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
                            <Stack direction="row" spacing={1.25} alignItems="center">
                                <Avatar sx={{ width: 38, height: 38, bgcolor: 'tertiaryContainer', color: 'onTertiaryContainer' }}>
                                    <AutoGraphIcon fontSize="small" />
                                </Avatar>
                                <Box>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                                        Funnel Visibility
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Review submissions and analytics in the same workspace without leaving the form.
                                    </Typography>
                                </Box>
                            </Stack>
                        </Card>
                    </Grid>
                </Grid>

                <Card sx={{ borderRadius: '14px', border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                    <Box sx={{ px: 1, py: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'surfaceContainerLowest' }}>
                        <Tabs
                            value={activeTab}
                            onChange={(_, value) => setActiveTab(value)}
                            sx={{
                                minHeight: 36,
                                '& .MuiTabs-flexContainer': { gap: 0.5 },
                            }}
                        >
                            <Tab value="editor" label="Builder" sx={{ minHeight: 36, borderRadius: '8px' }} />
                            <Tab value="submissions" label="Submissions" sx={{ minHeight: 36, borderRadius: '8px' }} />
                            <Tab value="analytics" label="Analytics" sx={{ minHeight: 36, borderRadius: '8px' }} />
                        </Tabs>
                    </Box>

                    <Box sx={{ bgcolor: 'background.default' }}>
                        {activeTab === 'editor' && (
                            <Box sx={{ minHeight: 'calc(100vh - 240px)' }}>
                                <FormEditor initialForm={form} />
                            </Box>
                        )}

                        {activeTab === 'submissions' && (
                            <Box sx={{ p: { xs: 1.5, md: 2 } }}>
                                <SubmissionsTable formId={formId} />
                            </Box>
                        )}

                        {activeTab === 'analytics' && (
                            <Box sx={{ p: { xs: 1.5, md: 2 } }}>
                                <AnalyticsDashboard formId={formId} />
                            </Box>
                        )}
                    </Box>
                </Card>
            </Stack>
        </Box>
    );
}
