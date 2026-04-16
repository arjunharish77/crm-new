'use client';

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
    Box,
    Typography,
    Button,
    Card,
    CardContent,
    Stack,
    IconButton,
    Tooltip,
    Tabs,
    Tab,
    Divider,
    Chip,
    alpha,
    useTheme,
    Breadcrumbs,
    Link as MuiLink,
    Avatar,
    Grid,
    Paper
} from "@mui/material";
import {
    ArrowBack as ArrowBackIcon,
    Edit as EditIcon,
    Add as AddIcon,
    Event as EventIcon,
    AttachMoney as MoneyIcon,
    Person as PersonIcon,
    Schedule as TimeIcon,
    Flag as PriorityIcon,
    ChevronRight as ChevronRightIcon
} from "@mui/icons-material";
import { toast } from "sonner";
import Link from "next/link";
import { Opportunity, StageDefinition } from "@/types/opportunities";
import { PaginatedResponse } from "@/types/common";
import { Activity } from "@/types/activities";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";
import { Timeline } from "@/components/timeline/timeline";
import { RecordHistory } from "@/components/governance/record-history";
import { EditOpportunityDialog } from "../edit-opportunity-dialog";
import { CreateActivityDialog } from "../../activities/create-activity-dialog";
import { formatCurrency } from "@/lib/utils";
import { OpportunityStageHistoryList } from "@/components/opportunities/opportunity-stage-history";
import { OpportunityStageHistory } from "@/types/opportunities";
import { NotesPanel } from "@/components/common/notes-panel";
import { useAuth } from "@/providers/auth-provider";

export default function OpportunityDetailPage() {
    const theme = useTheme();
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
    const [stages, setStages] = useState<StageDefinition[]>([]);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [history, setHistory] = useState<OpportunityStageHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [tabValue, setTabValue] = useState(0);

    const opportunityId = params.id as string;

    const loadData = useCallback(async () => {
        try {
            const opp = await apiFetch<Opportunity>(`/opportunities/${opportunityId}`);
            setOpportunity(opp);
            // Stages come from opportunity.opportunityType.stages — no separate /pipelines call
            setStages(opp.opportunityType?.stages || []);

            // Fetch Activities
            const filter = {
                logic: 'AND',
                conditions: [{ field: 'opportunityId', operator: 'equals', value: opportunityId }]
            };
            const response = await apiFetch<PaginatedResponse<Activity> | Activity[]>(`/activities?filters=${JSON.stringify(filter)}&limit=100`);

            if ('data' in response) {
                setActivities(response.data);
            } else if (Array.isArray(response)) {
                setActivities(response);
            }

            // Fetch Stage History
            const histData = await apiFetch(`/opportunities/${opportunityId}/history`);
            setHistory(histData);

        } catch (error) {
            toast.error("Failed to load opportunity details");
        } finally {
            setLoading(false);
        }
    }, [opportunityId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleStageChange = async (newStageId: string) => {
        try {
            await apiFetch(`/opportunities/${opportunityId}`, {
                method: 'PATCH',
                body: JSON.stringify({ stageId: newStageId })
            });
            setOpportunity(prev => prev ? { ...prev, stageId: newStageId } : null);
            toast.success("Stage updated");
            // Reload history after stage change
            const histData = await apiFetch(`/opportunities/${opportunityId}/history`);
            setHistory(histData);
        } catch (error) {
            toast.error("Failed to update stage");
        }
    };

    if (loading) return <Box sx={{ p: 4 }}><Typography>Loading...</Typography></Box>;
    if (!opportunity) return <Box sx={{ p: 4 }}><Typography>Opportunity not found</Typography></Box>;

    const currentStage = stages.find(s => s.id === opportunity.stageId);

    return (
        <Box
            component={motion.div}
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            sx={{ maxWidth: 1400, mx: 'auto', p: { xs: 2, md: 4 } }}
        >
            {/* Header Section */}
            <Box sx={{ mb: 4 }}>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
                    <Avatar sx={{
                        width: 64,
                        height: 64,
                        bgcolor: 'primary.container',
                        color: 'onPrimaryContainer',
                        fontSize: '1.5rem',
                        fontWeight: 800
                    }}>
                        {opportunity.title.charAt(0)}
                    </Avatar>
                    <Box>
                        <Typography variant="h3" sx={{ fontWeight: 800, letterSpacing: -1, mb: 0.5 }}>
                            {opportunity.title}
                        </Typography>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
                                {opportunity.opportunityType?.name}
                            </Typography>
                            <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'text.disabled' }} />
                            {currentStage && (
                                <Chip
                                    label={currentStage.name}
                                    size="small"
                                    sx={{
                                        height: 24,
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        bgcolor: alpha(currentStage.color || '#000', 0.1),
                                        color: currentStage.color || 'inherit',
                                        borderRadius: '6px'
                                    }}
                                />
                            )}
                        </Stack>
                    </Box>
                    <Box sx={{ flexGrow: 1 }} />
                    <Stack direction="row" spacing={2} sx={{ display: { xs: 'none', md: 'flex' } }}>
                        <Button
                            variant="outlined"
                            startIcon={<EditIcon />}
                            onClick={() => setShowEditDialog(true)}
                            sx={{ borderRadius: 10, height: 48, px: 3 }}
                        >
                            Edit
                        </Button>
                        <CreateActivityDialog
                            defaultLeadId={opportunity.leadId || undefined}
                            defaultOpportunityId={opportunity.id}
                            onSuccess={loadData}
                            trigger={
                                <Button
                                    color="secondary"
                                    startIcon={<AddIcon />}
                                    sx={{
                                        borderRadius: 10,
                                        height: 48,
                                        px: 3,
                                        bgcolor: 'secondaryContainer',
                                        color: 'onSecondaryContainer',
                                        '&:hover': { bgcolor: alpha(theme.palette.secondary.main, 0.12) }
                                    }}
                                >
                                    Log Activity
                                </Button>
                            }
                        />
                    </Stack>
                </Stack>

                {/* Sales Stage Visualizer */}
                <Card sx={{
                    bgcolor: 'surfaceContainerLow',
                    borderRadius: 5,
                    mb: 4,
                    border: '1px solid',
                    borderColor: 'divider',
                    p: 1
                }}>
                    <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: { xs: 1, md: 0 } }}>
                        {stages.map((stage, index) => {
                            const isCurrent = stage.id === opportunity.stageId;
                            const isPast = stages.findIndex(s => s.id === opportunity.stageId) > index;

                            return (
                                <Box
                                    key={stage.id}
                                    onClick={() => !isCurrent && handleStageChange(stage.id)}
                                    sx={{
                                        flex: 1,
                                        minWidth: 140,
                                        p: 1.5,
                                        textAlign: 'center',
                                        cursor: isCurrent ? 'default' : 'pointer',
                                        position: 'relative',
                                        transition: 'all 0.2s',
                                        bgcolor: isCurrent ? 'primary.main' : isPast ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                                        color: isCurrent ? 'onPrimary' : isPast ? 'primary.main' : 'text.secondary',
                                        borderRadius: 4,
                                        '&:hover': !isCurrent ? { bgcolor: alpha(theme.palette.primary.main, 0.15) } : {},
                                        '&::after': index < stages.length - 1 ? {
                                            content: '""',
                                            position: 'absolute',
                                            right: -4,
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            width: 8,
                                            height: 8,
                                            borderRadius: '50%',
                                            bgcolor: 'divider',
                                            zIndex: 1,
                                            display: { xs: 'none', md: 'block' }
                                        } : {}
                                    }}
                                >
                                    <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {stage.name}
                                    </Typography>
                                </Box>
                            );
                        })}
                    </Box>
                </Card>
            </Box>

            {/* Content Section */}
            <Grid container spacing={4}>
                <Grid size={{ xs: 12, md: 8, lg: 8.5 }}>
                    <Box sx={{
                        bgcolor: 'surfaceContainerLow',
                        borderRadius: 6,
                        p: 1,
                        mb: 3,
                        display: 'flex',
                        gap: 1
                    }}>
                        <M3Tab label="Overview" active={tabValue === 0} onClick={() => setTabValue(0)} />
                        <M3Tab label={`Activities (${activities.length})`} active={tabValue === 1} onClick={() => setTabValue(1)} />
                        <M3Tab label={`Stage History (${history.length})`} active={tabValue === 2} onClick={() => setTabValue(2)} />
                        <M3Tab label="Notes" active={tabValue === 3} onClick={() => setTabValue(3)} />
                        <M3Tab label="Files" active={tabValue === 4} onClick={() => setTabValue(4)} />
                        <M3Tab label="Audit" active={tabValue === 5} onClick={() => setTabValue(5)} />
                    </Box>

                    <Box sx={{ px: { xs: 1, md: 2 } }}>
                        {tabValue === 0 && (
                            <Stack spacing={4}>
                                <Box>
                                    <Typography variant="h6" sx={{ mb: 3, fontWeight: 800 }}>Information</Typography>
                                    <Grid container spacing={3}>
                                        <Grid size={{ xs: 12, sm: 4 }}>
                                            <InfoItem
                                                icon={<MoneyIcon />}
                                                label="Value"
                                                value={formatCurrency(opportunity.amount || 0)}
                                                isPrimary
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 12, sm: 4 }}>
                                            <InfoItem
                                                icon={<EventIcon />}
                                                label="Expected Close"
                                                value={opportunity.expectedCloseDate ? new Date(opportunity.expectedCloseDate).toLocaleDateString() : 'Not set'}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 12, sm: 4 }}>
                                            <Box>
                                                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ color: 'text.secondary', mb: 1 }}>
                                                    <PriorityIcon sx={{ fontSize: 20, opacity: 0.7 }} />
                                                    <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: '0.05em' }}>PRIORITY</Typography>
                                                </Stack>
                                                <Chip
                                                    label={opportunity.priority || 'LOW'}
                                                    size="small"
                                                    sx={{
                                                        height: 28,
                                                        px: 1,
                                                        fontSize: '0.75rem',
                                                        fontWeight: 800,
                                                        borderRadius: '8px',
                                                        bgcolor: opportunity.priority === 'HIGH' ? alpha(theme.palette.error.main, 0.1) : 'background.paper',
                                                        color: opportunity.priority === 'HIGH' ? theme.palette.error.main : 'text.secondary',
                                                        border: '1px solid',
                                                        borderColor: opportunity.priority === 'HIGH' ? alpha(theme.palette.error.main, 0.2) : 'divider shadow'
                                                    }}
                                                />
                                            </Box>
                                        </Grid>
                                    </Grid>
                                </Box>

                                {opportunity.tags && opportunity.tags.length > 0 && (
                                    <Box>
                                        <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>Tags</Typography>
                                        <Stack direction="row" spacing={1} flexWrap="wrap">
                                            {opportunity.tags.map(tag => (
                                                <Chip
                                                    key={tag}
                                                    label={tag}
                                                    size="small"
                                                    sx={{
                                                        borderRadius: '6px',
                                                        fontWeight: 600,
                                                        bgcolor: 'surfaceContainerHighest',
                                                        border: 'none'
                                                    }}
                                                />
                                            ))}
                                        </Stack>
                                    </Box>
                                )}
                            </Stack>
                        )}

                        {tabValue === 1 && (
                            <Box>
                                <Timeline activities={activities} />
                            </Box>
                        )}

                        {tabValue === 2 && (
                            <Box>
                                <OpportunityStageHistoryList history={history} />
                            </Box>
                        )}

                        {tabValue === 3 && (
                            <Box sx={{ bgcolor: 'surfaceContainerLow', borderRadius: 5, p: 3 }}>
                                <NotesPanel entityType="opportunity" entityId={opportunity.id} currentUserId={user?.id} />
                            </Box>
                        )}

                        {tabValue === 4 && (
                            <Paper sx={{ p: 8, borderRadius: 5, textAlign: 'center', bgcolor: 'surfaceContainerLowest', border: '1px dashed', borderColor: 'divider' }}>
                                <Typography color="text.secondary" sx={{ fontWeight: 500 }}>Files module is coming soon.</Typography>
                            </Paper>
                        )}

                        {tabValue === 5 && (
                            <Box sx={{ bgcolor: 'surfaceContainerLow', borderRadius: 5, p: 2 }}>
                                <RecordHistory entityType="OPPORTUNITY" entityId={opportunity.id} />
                            </Box>
                        )}
                    </Box>
                </Grid>

                <Grid size={{ xs: 12, md: 4, lg: 3.5 }}>
                    <Stack spacing={3} sx={{ position: 'sticky', top: 24 }}>
                        <Card sx={{
                            borderRadius: 5,
                            border: '1px solid',
                            borderColor: 'divider',
                            bgcolor: 'surfaceContainerLowest',
                            overflow: 'hidden'
                        }}>
                            <Box sx={{ p: 2, bgcolor: alpha(theme.palette.primary.main, 0.04), borderBottom: '1px solid', borderColor: 'divider' }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'primary.main' }}>ASSOCIATED LEAD</Typography>
                            </Box>
                            <CardContent sx={{ p: 3 }}>
                                {opportunity.lead ? (
                                    <Stack spacing={2.5}>
                                        <Stack direction="row" spacing={2} alignItems="center">
                                            <Avatar sx={{
                                                width: 48,
                                                height: 48,
                                                bgcolor: 'secondary.container',
                                                color: 'onSecondaryContainer',
                                                fontWeight: 700
                                            }}>
                                                {opportunity.lead.name.charAt(0)}
                                            </Avatar>
                                            <Box>
                                                <Typography
                                                    component={Link}
                                                    href={`/dashboard/leads/${opportunity.leadId}`}
                                                    sx={{
                                                        display: 'block',
                                                        fontSize: '1.1rem',
                                                        fontWeight: 800,
                                                        color: 'text.primary',
                                                        textDecoration: 'none',
                                                        '&:hover': { color: 'primary.main', textDecoration: 'underline' }
                                                    }}
                                                >
                                                    {opportunity.lead.name}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">{opportunity.lead.email}</Typography>
                                            </Box>
                                        </Stack>

                                        <Divider />

                                        <Stack spacing={2}>
                                            <InfoItem icon={<PersonIcon />} label="Phone" value={opportunity.lead.phone} />
                                            <InfoItem icon={<TimeIcon />} label="Created" value={new Date(opportunity.createdAt).toLocaleDateString()} />
                                        </Stack>

                                        <Button
                                            component={Link}
                                            href={`/dashboard/leads/${opportunity.leadId}`}
                                            fullWidth
                                            variant="outlined"
                                            sx={{ borderRadius: 4, mt: 1 }}
                                        >
                                            View Full Profile
                                        </Button>
                                    </Stack>
                                ) : (
                                    <Typography color="text.secondary">No lead linked</Typography>
                                )}
                            </CardContent>
                        </Card>
                    </Stack>
                </Grid>
            </Grid>

            <EditOpportunityDialog
                opportunity={opportunity}
                open={showEditDialog}
                onOpenChange={setShowEditDialog}
                onSuccess={loadData}
            />
        </Box>
    );
}

function InfoItem({ icon, label, value, isPrimary }: { icon: React.ReactNode, label: string, value?: string | null, isPrimary?: boolean }) {
    return (
        <Box>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ color: 'text.secondary', mb: 1 }}>
                {React.isValidElement(icon) ? React.cloneElement(icon as React.DetailedReactHTMLElement<any, any>, { sx: { fontSize: 20, opacity: 0.7 } }) : icon}
                <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: '0.05em' }}>{label}</Typography>
            </Stack>
            <Typography variant={isPrimary ? "h5" : "body1"} sx={{ fontWeight: isPrimary ? 800 : 600, color: isPrimary ? 'primary.main' : 'text.primary' }}>
                {value || '—'}
            </Typography>
        </Box>
    );
}

function M3Tab({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
    return (
        <Button
            onClick={onClick}
            sx={{
                flexGrow: 1,
                borderRadius: 5,
                height: 44,
                bgcolor: active ? 'primary.main' : 'transparent',
                color: active ? (theme: any) => theme.palette.primary.contrastText : 'text.secondary',
                fontWeight: active ? 700 : 500,
                transition: 'all 0.2s',
                '&:hover': {
                    bgcolor: active ? 'primary.main' : 'action.hover',
                    transform: active ? 'none' : 'scale(1.02)'
                }
            }}
        >
            {label}
        </Button>
    );
}
