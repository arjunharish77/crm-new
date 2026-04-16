'use client';

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Lead } from "@/types/leads";
import { Activity } from "@/types/activities";
import { Opportunity } from "@/types/opportunities";
import { PaginatedResponse } from "@/types/common";
import {
    Box,
    Typography,
    Button,
    Card,
    CardContent,
    Stack,
    IconButton,
    Tabs,
    Tab,
    Chip,
    alpha,
    useTheme,
    Grid,
    Avatar,
    Divider,
    Paper,
    CircularProgress,
    Tooltip
} from "@mui/material";

import {
    ArrowBack as ArrowBackIcon,
    Edit as EditIcon,
    Add as AddIcon,
    Mail as MailIcon,
    Phone as PhoneIcon,
    Business as BusinessIcon,
    Link as LinkIcon,
    MoreVert as MoreVertIcon,
    Person as PersonIcon,
} from "@mui/icons-material";
import { toast } from "sonner";
import Link from "next/link";
import { CreateActivityDialog } from "@/app/dashboard/activities/create-activity-dialog";
import { EditLeadDialog } from "../edit-lead-dialog";
import { CreateOpportunityDialog } from "@/app/dashboard/opportunities/create-opportunity-dialog";
import { Timeline } from "@/components/timeline/timeline";
import { RecordHistory } from "@/components/governance/record-history";
import { LeadContactCard } from "@/components/leads/lead-contact-card";
import { CustomFieldsCard } from "@/components/leads/custom-fields-card";
import { NotesPanel } from "@/components/common/notes-panel";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";
import { useAuth } from "@/providers/auth-provider";

// Custom Tab Panel
function CustomTabPanel(props: { children?: React.ReactNode; index: number; value: number }) {
    const { children, value, index, ...other } = props;
    return (
        <div role="tabpanel" hidden={value !== index} {...other} style={{ width: '100%' }}>
            {value === index && (
                <Box sx={{ py: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

export default function LeadDetailPage() {
    const theme = useTheme();
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const [lead, setLead] = useState<Lead | null>(null);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    const [loading, setLoading] = useState(true);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [tabValue, setTabValue] = useState(0);

    const leadId = params.id as string;

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [leadData, oppsData] = await Promise.all([
                apiFetch(`/leads/${leadId}`),
                apiFetch("/opportunities"),
            ]);
            setLead(leadData as Lead);

            const allOpps = (oppsData as any).data || [];
            if (Array.isArray(allOpps)) {
                setOpportunities(allOpps.filter((o: Opportunity) => o.leadId === leadId));
            }

            try {
                const filter = { logic: 'AND', conditions: [{ field: 'leadId', operator: 'equals', value: leadId }] };
                const actResponse = await apiFetch<PaginatedResponse<Activity> | Activity[]>(`/activities?filters=${JSON.stringify(filter)}&limit=100`);
                if ('data' in actResponse) {
                    setActivities(actResponse.data);
                } else if (Array.isArray(actResponse)) {
                    setActivities(actResponse);
                }
            } catch (e) { console.error(e); }

        } catch (error) {
            toast.error("Failed to fetch lead details");
        } finally {
            setLoading(false);
        }
    }, [leadId]);

    useEffect(() => {
        if (leadId) loadData();
    }, [leadId, loadData]);

    if (loading) return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
            <CircularProgress size={48} thickness={4} />
        </Box>
    );

    if (!lead) return (
        <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h5">Lead not found</Typography>
            <Button onClick={() => router.push('/dashboard/leads')} sx={{ mt: 2 }}>Back to Leads</Button>
        </Box>
    );

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
                <Button
                    startIcon={<ArrowBackIcon />}
                    onClick={() => router.back()}
                    sx={{ mb: 3, borderRadius: 10, color: 'text.secondary', '&:hover': { bgcolor: 'action.hover' } }}
                >
                    Back to Leads
                </Button>

                <Box sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', md: 'row' },
                    alignItems: { xs: 'flex-start', md: 'center' },
                    gap: 4
                }}>
                    <Avatar
                        sx={{
                            width: 88,
                            height: 88,
                            bgcolor: 'primaryContainer', // M3 Role
                            color: 'onPrimaryContainer', // M3 Role
                            fontSize: '2.5rem',
                            fontWeight: 700,
                            boxShadow: '0 8px 16px rgba(0,0,0,0.08)'
                        }}
                    >
                        {lead?.name?.charAt(0) || 'L'}
                    </Avatar>

                    <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="h3" sx={{ fontWeight: 800, letterSpacing: -1 }}>
                            {lead.name}
                        </Typography>
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <BusinessIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                                <Typography variant="body1" sx={{ fontWeight: 600 }}>{lead.company}</Typography>
                            </Box>
                            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
                            <Chip
                                label={lead.status}
                                size="small"
                                color="primary"
                                sx={{
                                    fontWeight: 700,
                                    borderRadius: '8px',
                                    height: 28,
                                    fontSize: '0.75rem',
                                    textTransform: 'uppercase'
                                }}
                            />
                        </Stack>
                    </Box>

                    {/* Header Actions */}
                    <Stack direction="row" spacing={2} sx={{ width: { xs: '100%', md: 'auto' }, justifyContent: 'flex-end' }}>
                        <CreateActivityDialog
                            defaultLeadId={lead.id}
                            onSuccess={loadData}
                            trigger={
                                <Button
                                    color="secondary"
                                    startIcon={<AddIcon />}
                                    sx={{
                                        borderRadius: 10,
                                        height: 48,
                                        bgcolor: 'secondaryContainer',
                                        color: 'onSecondaryContainer',
                                        '&:hover': { bgcolor: alpha(theme.palette.secondary.main, 0.12) }
                                    }}
                                >
                                    Log Activity
                                </Button>
                            }
                        />
                        <Button
                            variant="contained"
                            color="primary"
                            startIcon={<EditIcon />}
                            onClick={() => setShowEditDialog(true)}
                            sx={{ borderRadius: 10, height: 48, px: 3 }}
                        >
                            Edit Profile
                        </Button>
                        <IconButton sx={{ bgcolor: 'surfaceContainerLow' }}>
                            <MoreVertIcon />
                        </IconButton>
                    </Stack>
                </Box>
            </Box>

            <Grid container spacing={4}>
                {/* Information Card (Left) */}
                <Grid size={{ xs: 12, md: 4, lg: 3.5 }}>
                    <Stack spacing={4}>
                        <LeadContactCard
                            lead={lead}
                            onCreateActivity={loadData}
                            onCreateOpportunity={() => setTabValue(1)}
                        />
                        <CustomFieldsCard
                            fields={[]} // TODO: wire up to actual custom fields
                            onAdd={() => toast.info('Add Custom Field dialog implementation required')}
                        />
                    </Stack>
                </Grid>

                {/* Main Content (Right) */}
                <Grid size={{ xs: 12, md: 8, lg: 8.5 }}>
                    <Box sx={{
                        bgcolor: 'surfaceContainerLow',
                        borderRadius: 6,
                        p: 1,
                        mb: 3,
                        display: 'flex',
                        gap: 1
                    }}>
                        <M3Tab label="Timeline" active={tabValue === 0} onClick={() => setTabValue(0)} />
                        <M3Tab label="Opportunities" active={tabValue === 1} onClick={() => setTabValue(1)} />
                        <M3Tab label="History" active={tabValue === 3} onClick={() => setTabValue(3)} />
                        <M3Tab label="Notes" active={tabValue === 2} onClick={() => setTabValue(2)} />
                    </Box>

                    <Box sx={{ px: { xs: 1, md: 2 } }}>
                        {tabValue === 0 && <Timeline activities={activities} />}

                        {tabValue === 1 && (
                            <Stack spacing={3}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="h6" sx={{ fontWeight: 700 }}>Active Opportunities</Typography>
                                    <CreateOpportunityDialog
                                        defaultLeadId={lead.id}
                                        onSuccess={loadData}
                                        trigger={
                                            <Button variant="outlined" startIcon={<AddIcon />} sx={{ borderRadius: 10 }}>
                                                New Opportunity
                                            </Button>
                                        }
                                    />
                                </Box>

                                {opportunities.length === 0 ? (
                                    <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 5, border: '1px dashed', borderColor: 'divider', bgcolor: 'transparent' }}>
                                        <Typography color="text.secondary">No opportunities associated with this lead.</Typography>
                                    </Paper>
                                ) : (
                                    <Grid container spacing={2}>
                                        {opportunities.map(opp => (
                                            <Grid key={opp.id} size={{ xs: 12 }}>
                                                <Card sx={{
                                                    borderRadius: 4,
                                                    p: 1,
                                                    bgcolor: 'surfaceContainerLowest',
                                                    '&:hover': { bgcolor: 'action.hover' }
                                                }}>
                                                    <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, '&:last-child': { pb: 2 } }}>
                                                        <Box>
                                                            <Typography variant="subtitle1" fontWeight="700">{opp.title}</Typography>
                                                            <Typography variant="body2" color="text.secondary">
                                                                {formatCurrency(opp.amount || 0)} • {opp.stage?.name}
                                                            </Typography>
                                                        </Box>
                                                        <Link href={`/dashboard/opportunities/${opp.id}`} passHref legacyBehavior>
                                                            <Button component="a" variant="text" size="small" sx={{ fontWeight: 700 }}>
                                                                View Details
                                                            </Button>
                                                        </Link>
                                                    </CardContent>
                                                </Card>
                                            </Grid>
                                        ))}
                                    </Grid>
                                )}
                            </Stack>
                        )}

                        {tabValue === 2 && (
                            <Box sx={{ bgcolor: 'surfaceContainerLow', borderRadius: 5, p: 3 }}>
                                <NotesPanel entityType="lead" entityId={lead.id} currentUserId={user?.id} />
                            </Box>
                        )}

                        {tabValue === 3 && (
                            <Box sx={{ bgcolor: 'surfaceContainerLow', borderRadius: 5, p: 2 }}>
                                <RecordHistory entityType="LEAD" entityId={lead.id} />
                            </Box>
                        )}
                    </Box>
                </Grid>
            </Grid>

            <EditLeadDialog
                lead={lead}
                open={showEditDialog}
                onOpenChange={setShowEditDialog}
                onSuccess={loadData}
            />
        </Box>
    );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode, label: string, value?: string | null }) {
    return (
        <Box>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ color: 'text.secondary', mb: 0.5 }}>
                {React.isValidElement(icon) ? React.cloneElement(icon as React.DetailedReactHTMLElement<any, any>, { sx: { fontSize: 20, opacity: 0.7 } }) : icon}
                <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: '0.05em' }}>{label}</Typography>
            </Stack>
            <Typography variant="body1" sx={{ fontWeight: 500 }}>{value || '—'}</Typography>
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
