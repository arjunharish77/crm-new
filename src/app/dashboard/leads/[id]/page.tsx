'use client';

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    alpha,
    Avatar,
    Box,
    Button,
    Card,
    Chip,
    CircularProgress,
    Divider,
    Grid,
    IconButton,
    MenuItem,
    Paper,
    Select,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";
import {
    Add as AddIcon,
    ArrowBack as ArrowBackIcon,
    Business as BusinessIcon,
    Edit as EditIcon,
    Email as EmailIcon,
    FilterList as FilterListIcon,
    Link as LinkIcon,
    LocalFireDepartment as ScoreIcon,
    Phone as PhoneIcon,
    Source as SourceIcon,
    Today as TodayIcon,
} from "@mui/icons-material";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Lead } from "@/types/leads";
import { Activity } from "@/types/activities";
import { Opportunity } from "@/types/opportunities";
import { PaginatedResponse } from "@/types/common";
import { CreateActivityDialog } from "@/app/dashboard/activities/create-activity-dialog";
import { CreateOpportunityDialog } from "@/app/dashboard/opportunities/create-opportunity-dialog";
import { EditLeadDialog } from "../edit-lead-dialog";
import { Timeline } from "@/components/timeline/timeline";
import { NotesPanel } from "@/components/common/notes-panel";
import { RecordHistory } from "@/components/governance/record-history";
import { formatCurrency } from "@/lib/utils";
import { fadeInUp } from "@/lib/motion";
import { useAuth } from "@/providers/auth-provider";

type ActivityTimeFilter = "ALL" | "TODAY" | "7D" | "30D";

export default function LeadDetailPage() {
    const theme = useTheme();
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const leadId = params.id as string;

    const [lead, setLead] = useState<Lead | null>(null);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    const [loading, setLoading] = useState(true);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [tabValue, setTabValue] = useState<"activity" | "details" | "opportunities" | "notes" | "audit">("activity");
    const [activityTypeFilter, setActivityTypeFilter] = useState<string>("ALL");
    const [activityTimeFilter, setActivityTimeFilter] = useState<ActivityTimeFilter>("ALL");

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

            const filter = { logic: "AND", conditions: [{ field: "leadId", operator: "equals", value: leadId }] };
            const actResponse = await apiFetch<PaginatedResponse<Activity> | Activity[]>(
                `/activities?filters=${JSON.stringify(filter)}&limit=100`
            );

            if ("data" in actResponse) {
                setActivities(actResponse.data);
            } else if (Array.isArray(actResponse)) {
                setActivities(actResponse);
            }
        } catch {
            toast.error("Failed to fetch lead details");
        } finally {
            setLoading(false);
        }
    }, [leadId]);

    useEffect(() => {
        if (leadId) loadData();
    }, [leadId, loadData]);

    const activityTypes = useMemo(
        () =>
            Array.from(
                new Map(
                    activities
                        .filter((activity) => activity.type?.id)
                        .map((activity) => [activity.type!.id, activity.type!])
                ).values()
            ),
        [activities]
    );

    const filteredActivities = useMemo(() => {
        const now = Date.now();

        return activities.filter((activity) => {
            if (activityTypeFilter !== "ALL" && activity.typeId !== activityTypeFilter) {
                return false;
            }

            if (activityTimeFilter === "ALL") {
                return true;
            }

            const createdAt = new Date(activity.createdAt).getTime();
            if (activityTimeFilter === "TODAY") {
                return new Date(activity.createdAt).toDateString() === new Date().toDateString();
            }
            if (activityTimeFilter === "7D") {
                return createdAt >= now - 7 * 24 * 60 * 60 * 1000;
            }
            if (activityTimeFilter === "30D") {
                return createdAt >= now - 30 * 24 * 60 * 60 * 1000;
            }
            return true;
        });
    }, [activities, activityTimeFilter, activityTypeFilter]);

    const lastActivity = activities[0];
    const openOpportunityValue = opportunities.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const statusTone = getStatusTone(theme, lead?.status || "NEW");

    if (loading) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
                <CircularProgress size={44} />
            </Box>
        );
    }

    if (!lead) {
        return (
            <Box sx={{ p: 4, textAlign: "center" }}>
                <Typography variant="h5">Lead not found</Typography>
                <Button onClick={() => router.push("/dashboard/leads")} sx={{ mt: 2 }}>
                    Back to Leads
                </Button>
            </Box>
        );
    }

    return (
        <Box
            component={motion.div}
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            sx={{ maxWidth: 1440, mx: "auto", p: { xs: 1.25, md: 2 } }}
        >
            <Stack
                direction={{ xs: "column", md: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", md: "center" }}
                spacing={2}
                sx={{ mb: 2 }}
            >
                <Box>
                    <Button
                        startIcon={<ArrowBackIcon />}
                        onClick={() => router.back()}
                        sx={{ mb: 0.75, borderRadius: "10px", color: "text.secondary", minHeight: 34 }}
                    >
                        Back
                    </Button>
                    <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.8 }}>
                        Lead Workspace
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Compact lead profile, live activity history, and deal context in one place.
                    </Typography>
                </Box>

                <Stack direction="row" spacing={1} flexWrap="wrap">
                    <CreateActivityDialog
                        defaultLeadId={lead.id}
                        onSuccess={loadData}
                        trigger={
                            <Button
                                color="secondary"
                                startIcon={<AddIcon />}
                                sx={{
                                    borderRadius: "10px",
                                    px: 1.75,
                                    bgcolor: "secondaryContainer",
                                    color: "onSecondaryContainer",
                                    minHeight: 36,
                                }}
                            >
                                Activity
                            </Button>
                        }
                    />
                    <CreateOpportunityDialog
                        defaultLeadId={lead.id}
                        onSuccess={loadData}
                        trigger={
                            <Button variant="outlined" startIcon={<AddIcon />} sx={{ borderRadius: "10px", px: 1.75, minHeight: 36 }}>
                                Opportunity
                            </Button>
                        }
                    />
                    <Button
                        variant="contained"
                        startIcon={<EditIcon />}
                        onClick={() => setShowEditDialog(true)}
                        sx={{ borderRadius: "10px", px: 2, minHeight: 36 }}
                    >
                        Edit
                    </Button>
                </Stack>
            </Stack>

            <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, lg: 3.8 }}>
                    <Stack spacing={1.5} sx={{ position: { lg: "sticky" }, top: { lg: 16 } }}>
                        <Card
                            sx={{
                                borderRadius: "14px",
                                overflow: "hidden",
                                border: "1px solid",
                                borderColor: alpha(theme.palette.primary.dark, 0.22),
                                bgcolor: "transparent",
                            }}
                        >
                            <Box
                                sx={{
                                    px: 2.5,
                                    py: 2.25,
                                    color: "common.white",
                                    background: `linear-gradient(180deg, ${alpha(theme.palette.primary.dark, 0.96)} 0%, ${alpha(
                                        theme.palette.primary.main,
                                        0.92
                                    )} 100%)`,
                                }}
                            >
                                <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.25 }}>
                                    <Avatar
                                        sx={{
                                            width: 48,
                                            height: 48,
                                            bgcolor: alpha("#ffffff", 0.14),
                                            color: "common.white",
                                            fontWeight: 800,
                                            fontSize: "1.2rem",
                                        }}
                                    >
                                        {lead.name?.charAt(0) || "L"}
                                    </Avatar>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                                            {lead.name}
                                        </Typography>
                                        <Typography variant="body2" sx={{ opacity: 0.82, fontStyle: "italic" }}>
                                            {lead.status}
                                        </Typography>
                                    </Box>
                                </Stack>

                                <Stack spacing={0.875}>
                                    <CompactContactRow icon={<EmailIcon sx={{ fontSize: 15 }} />} value={lead.email || "No email"} />
                                    <CompactContactRow icon={<PhoneIcon sx={{ fontSize: 15 }} />} value={lead.phone || "No phone"} />
                                    <CompactContactRow icon={<BusinessIcon sx={{ fontSize: 15 }} />} value={lead.company || "No company"} />
                                    <CompactContactRow icon={<SourceIcon sx={{ fontSize: 15 }} />} value={lead.source || "Unknown source"} />
                                </Stack>
                            </Box>

                            <Grid container>
                                <MetricCell label="Lead Score" value={String(lead.score ?? 0)} />
                                <MetricCell label="Activities" value={String(activities.length)} />
                                <MetricCell label="Deals" value={String(opportunities.length)} />
                            </Grid>
                        </Card>

                        <Card sx={{ borderRadius: "12px", border: "1px solid", borderColor: "divider" }}>
                            <Box sx={{ px: 1.5, py: 1.125, borderBottom: "1px solid", borderColor: "divider" }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                    Lead Properties
                                </Typography>
                            </Box>
                            <Stack divider={<Divider flexItem />}>
                                <PropertyRow label="Status">
                                    <Chip
                                        label={lead.status}
                                        size="small"
                                        sx={{
                                            height: 24,
                                            fontWeight: 800,
                                            fontSize: "0.68rem",
                                            textTransform: "uppercase",
                                            bgcolor: statusTone.bg,
                                            color: statusTone.fg,
                                        }}
                                    />
                                </PropertyRow>
                                <PropertyRow label="Email">{lead.email || "—"}</PropertyRow>
                                <PropertyRow label="Phone">{lead.phone || "—"}</PropertyRow>
                                <PropertyRow label="Company">{lead.company || "—"}</PropertyRow>
                                <PropertyRow label="Source">{lead.source || "—"}</PropertyRow>
                                <PropertyRow label="Created">{new Date(lead.createdAt).toLocaleDateString()}</PropertyRow>
                                <PropertyRow label="Updated">{new Date(lead.updatedAt).toLocaleDateString()}</PropertyRow>
                            </Stack>
                        </Card>

                        <Card sx={{ borderRadius: "12px", border: "1px solid", borderColor: "divider", p: 1.5 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1.125 }}>
                                Quick Snapshot
                            </Typography>
                            <Grid container spacing={1}>
                                <Grid size={{ xs: 4 }}>
                                    <SnapshotCard icon={<ScoreIcon sx={{ fontSize: 16 }} />} label="Score" value={String(lead.score ?? 0)} />
                                </Grid>
                                <Grid size={{ xs: 4 }}>
                                    <SnapshotCard icon={<TodayIcon sx={{ fontSize: 16 }} />} label="Last Touch" value={lastActivity ? relativeDay(lastActivity.createdAt) : "None"} />
                                </Grid>
                                <Grid size={{ xs: 4 }}>
                                    <SnapshotCard icon={<LinkIcon sx={{ fontSize: 16 }} />} label="Pipeline" value={formatCurrency(openOpportunityValue)} />
                                </Grid>
                            </Grid>
                        </Card>
                    </Stack>
                </Grid>

                <Grid size={{ xs: 12, lg: 8.2 }}>
                    <Card sx={{ borderRadius: "14px", border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
                        <Box
                            sx={{
                                px: 1,
                                py: 1,
                                borderBottom: "1px solid",
                                borderColor: "divider",
                                bgcolor: "surfaceContainerLowest",
                            }}
                        >
                            <Stack
                                direction={{ xs: "column", md: "row" }}
                                justifyContent="space-between"
                                alignItems={{ xs: "stretch", md: "center" }}
                                spacing={1}
                            >
                                <Stack direction="row" spacing={0.75} sx={{ overflowX: "auto", pb: { xs: 0.25, md: 0 } }}>
                                    <WorkspaceTab label={`Activity History (${filteredActivities.length})`} active={tabValue === "activity"} onClick={() => setTabValue("activity")} />
                                    <WorkspaceTab label="Lead Details" active={tabValue === "details"} onClick={() => setTabValue("details")} />
                                    <WorkspaceTab label={`Opportunities (${opportunities.length})`} active={tabValue === "opportunities"} onClick={() => setTabValue("opportunities")} />
                                    <WorkspaceTab label="Notes" active={tabValue === "notes"} onClick={() => setTabValue("notes")} />
                                    <WorkspaceTab label="Audit" active={tabValue === "audit"} onClick={() => setTabValue("audit")} />
                                </Stack>

                                {tabValue === "activity" && (
                                    <Stack direction="row" spacing={0.75} flexWrap="wrap">
                                        <Select
                                            size="small"
                                            value={activityTypeFilter}
                                            onChange={(e) => setActivityTypeFilter(String(e.target.value))}
                                            sx={{ minWidth: 156, borderRadius: "8px", bgcolor: "background.paper" }}
                                        >
                                            <MenuItem value="ALL">All Activity Types</MenuItem>
                                            {activityTypes.map((type) => (
                                                <MenuItem key={type.id} value={type.id}>
                                                    {type.name}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                        <Select
                                            size="small"
                                            value={activityTimeFilter}
                                            onChange={(e) => setActivityTimeFilter(e.target.value as ActivityTimeFilter)}
                                            sx={{ minWidth: 132, borderRadius: "8px", bgcolor: "background.paper" }}
                                        >
                                            <MenuItem value="ALL">All Time</MenuItem>
                                            <MenuItem value="TODAY">Today</MenuItem>
                                            <MenuItem value="7D">Last 7 days</MenuItem>
                                            <MenuItem value="30D">Last 30 days</MenuItem>
                                        </Select>
                                    </Stack>
                                )}
                            </Stack>
                        </Box>

                        <Box sx={{ p: { xs: 1.25, md: 1.5 } }}>
                            {tabValue === "activity" && <Timeline activities={filteredActivities} />}

                            {tabValue === "details" && (
                                <Grid container spacing={1.25}>
                                    <Grid size={{ xs: 12, md: 6 }}>
                                        <DetailPanel title="Identity">
                                            <PropertyRow label="Lead Name">{lead.name}</PropertyRow>
                                            <PropertyRow label="Status">{lead.status}</PropertyRow>
                                            <PropertyRow label="Company">{lead.company || "—"}</PropertyRow>
                                            <PropertyRow label="Source">{lead.source || "—"}</PropertyRow>
                                        </DetailPanel>
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 6 }}>
                                        <DetailPanel title="Contact">
                                            <PropertyRow label="Email">{lead.email || "—"}</PropertyRow>
                                            <PropertyRow label="Phone">{lead.phone || "—"}</PropertyRow>
                                            <PropertyRow label="Created">{new Date(lead.createdAt).toLocaleString()}</PropertyRow>
                                            <PropertyRow label="Updated">{new Date(lead.updatedAt).toLocaleString()}</PropertyRow>
                                        </DetailPanel>
                                    </Grid>
                                </Grid>
                            )}

                            {tabValue === "opportunities" && (
                                <Stack spacing={1.25}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                            Linked Opportunities
                                        </Typography>
                                        <CreateOpportunityDialog
                                            defaultLeadId={lead.id}
                                            onSuccess={loadData}
                                            trigger={
                                                <Button variant="outlined" startIcon={<AddIcon />} sx={{ borderRadius: "10px", minHeight: 34 }}>
                                                    New Opportunity
                                                </Button>
                                            }
                                        />
                                    </Stack>

                                    {opportunities.length === 0 ? (
                                        <Paper sx={{ p: 3.5, textAlign: "center", borderRadius: "10px", border: "1px dashed", borderColor: "divider" }}>
                                            <Typography variant="body2" color="text.secondary">No opportunities associated with this lead yet.</Typography>
                                        </Paper>
                                    ) : (
                                        <Stack spacing={1}>
                                            {opportunities.map((opp) => (
                                                <Paper
                                                    key={opp.id}
                                                    sx={{
                                                        p: 1.25,
                                                        borderRadius: "10px",
                                                        border: "1px solid",
                                                        borderColor: "divider",
                                                        bgcolor: "surfaceContainerLowest",
                                                    }}
                                                >
                                                    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
                                                        <Box sx={{ minWidth: 0 }}>
                                                            <Typography variant="body1" sx={{ fontWeight: 800 }}>
                                                                {opp.title}
                                                            </Typography>
                                                            <Typography variant="body2" color="text.secondary">
                                                                {opp.stage?.name || "Unassigned"} • {formatCurrency(opp.amount || 0)}
                                                            </Typography>
                                                        </Box>
                                                        <Button component={Link} href={`/dashboard/opportunities/${opp.id}`} variant="text" sx={{ whiteSpace: "nowrap", minHeight: 32 }}>
                                                            Open
                                                        </Button>
                                                    </Stack>
                                                </Paper>
                                            ))}
                                        </Stack>
                                    )}
                                </Stack>
                            )}

                            {tabValue === "notes" && (
                                <Paper sx={{ p: 1.25, borderRadius: "10px", bgcolor: "surfaceContainerLowest" }}>
                                    <NotesPanel entityType="lead" entityId={lead.id} currentUserId={user?.id} />
                                </Paper>
                            )}

                            {tabValue === "audit" && (
                                <Paper sx={{ p: 1.125, borderRadius: "10px", bgcolor: "surfaceContainerLowest" }}>
                                    <RecordHistory entityType="LEAD" entityId={lead.id} />
                                </Paper>
                            )}
                        </Box>
                    </Card>
                </Grid>
            </Grid>

            <EditLeadDialog lead={lead} open={showEditDialog} onOpenChange={setShowEditDialog} onSuccess={loadData} />
        </Box>
    );
}

function CompactContactRow({ icon, value }: { icon: React.ReactNode; value: string }) {
    return (
        <Stack direction="row" spacing={1} alignItems="center">
            <Box sx={{ opacity: 0.9, display: "flex", alignItems: "center" }}>{icon}</Box>
            <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.35 }}>
                {value}
            </Typography>
        </Stack>
    );
}

function MetricCell({ label, value }: { label: string; value: string }) {
    return (
        <Grid size={{ xs: 4 }}>
            <Box
                sx={{
                    py: 1.125,
                    px: 0.875,
                    textAlign: "center",
                    bgcolor: alpha("#000", 0.18),
                    borderTop: "1px solid",
                    borderColor: alpha("#fff", 0.08),
                }}
            >
                <Typography variant="subtitle1" sx={{ color: "common.white", fontWeight: 800, lineHeight: 1.1 }}>
                    {value}
                </Typography>
                <Typography variant="caption" sx={{ color: alpha("#fff", 0.8) }}>
                    {label}
                </Typography>
            </Box>
        </Grid>
    );
}

function SnapshotCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <Paper sx={{ p: 1, borderRadius: "10px", bgcolor: "surfaceContainerLowest", border: "1px solid", borderColor: "divider" }}>
            <Stack spacing={0.375}>
                <Box sx={{ color: "primary.main", display: "flex", alignItems: "center" }}>{icon}</Box>
                <Typography variant="caption" color="text.secondary">
                    {label}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                    {value}
                </Typography>
            </Stack>
        </Paper>
    );
}

function DetailPanel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Card sx={{ borderRadius: "10px", border: "1px solid", borderColor: "divider" }}>
            <Box sx={{ px: 1.5, py: 1.125, borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                    {title}
                </Typography>
            </Box>
            <Stack divider={<Divider flexItem />}>{children}</Stack>
        </Card>
    );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ px: 1.5, py: 1.05 }}>
            <Typography variant="body2" color="text.secondary">
                {label}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, textAlign: "right" }}>
                {children}
            </Typography>
        </Stack>
    );
}

function WorkspaceTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <Button
            onClick={onClick}
            sx={{
                borderRadius: "8px",
                px: 1.25,
                py: 0.7,
                minHeight: 34,
                whiteSpace: "nowrap",
                bgcolor: active ? "primary.main" : "transparent",
                color: active ? "primary.contrastText" : "text.secondary",
                fontWeight: active ? 800 : 600,
                fontSize: "0.82rem",
                "&:hover": {
                    bgcolor: active ? "primary.main" : "action.hover",
                },
            }}
        >
            {label}
        </Button>
    );
}

function getStatusTone(theme: any, status: string) {
    const normalized = status.toLowerCase();
    if (normalized.includes("qualified") || normalized.includes("contact")) {
        return { bg: alpha(theme.palette.success.main, 0.12), fg: theme.palette.success.main };
    }
    if (normalized.includes("lost") || normalized.includes("dead")) {
        return { bg: alpha(theme.palette.error.main, 0.12), fg: theme.palette.error.main };
    }
    return { bg: alpha(theme.palette.primary.main, 0.1), fg: theme.palette.primary.main };
}

function relativeDay(value: string) {
    const diff = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24)));
    return diff === 0 ? "Today" : `${diff}d ago`;
}
