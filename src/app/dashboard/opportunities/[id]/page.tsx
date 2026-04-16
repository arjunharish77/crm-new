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
    AttachMoney as MoneyIcon,
    CalendarToday as CalendarIcon,
    Edit as EditIcon,
    Flag as PriorityIcon,
    Link as LinkIcon,
    Person as PersonIcon,
    Sell as PipelineIcon,
    TrendingUp as ProbabilityIcon,
} from "@mui/icons-material";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Opportunity, OpportunityStageHistory, StageDefinition } from "@/types/opportunities";
import { Activity } from "@/types/activities";
import { PaginatedResponse } from "@/types/common";
import { Timeline } from "@/components/timeline/timeline";
import { RecordHistory } from "@/components/governance/record-history";
import { EditOpportunityDialog } from "../edit-opportunity-dialog";
import { CreateActivityDialog } from "../../activities/create-activity-dialog";
import { OpportunityStageHistoryList } from "@/components/opportunities/opportunity-stage-history";
import { NotesPanel } from "@/components/common/notes-panel";
import { formatCurrency } from "@/lib/utils";
import { fadeInUp } from "@/lib/motion";
import { useAuth } from "@/providers/auth-provider";

type ActivityTimeFilter = "ALL" | "TODAY" | "7D" | "30D";

export default function OpportunityDetailPage() {
    const theme = useTheme();
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const opportunityId = params.id as string;

    const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
    const [stages, setStages] = useState<StageDefinition[]>([]);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [history, setHistory] = useState<OpportunityStageHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [tabValue, setTabValue] = useState<"activity" | "details" | "stage" | "notes" | "audit">("activity");
    const [activityTypeFilter, setActivityTypeFilter] = useState<string>("ALL");
    const [activityTimeFilter, setActivityTimeFilter] = useState<ActivityTimeFilter>("ALL");

    const loadData = useCallback(async () => {
        try {
            const opp = await apiFetch<Opportunity>(`/opportunities/${opportunityId}`);
            setOpportunity(opp);
            setStages(opp.opportunityType?.stages || []);

            const filter = {
                logic: "AND",
                conditions: [{ field: "opportunityId", operator: "equals", value: opportunityId }],
            };
            const response = await apiFetch<PaginatedResponse<Activity> | Activity[]>(
                `/activities?filters=${JSON.stringify(filter)}&limit=100`
            );

            if ("data" in response) {
                setActivities(response.data);
            } else if (Array.isArray(response)) {
                setActivities(response);
            }

            const histData = await apiFetch(`/opportunities/${opportunityId}/history`);
            setHistory(histData);
        } catch {
            toast.error("Failed to load opportunity details");
        } finally {
            setLoading(false);
        }
    }, [opportunityId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const currentStage = stages.find((stage) => stage.id === opportunity?.stageId);

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

            if (activityTimeFilter === "ALL") return true;
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

    const handleStageChange = async (newStageId: string) => {
        try {
            await apiFetch(`/opportunities/${opportunityId}`, {
                method: "PATCH",
                body: JSON.stringify({ stageId: newStageId }),
            });
            toast.success("Stage updated");
            loadData();
        } catch {
            toast.error("Failed to update stage");
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
                <CircularProgress size={44} />
            </Box>
        );
    }

    if (!opportunity) {
        return (
            <Box sx={{ p: 4, textAlign: "center" }}>
                <Typography variant="h5">Opportunity not found</Typography>
                <Button onClick={() => router.push("/dashboard/opportunities")} sx={{ mt: 2 }}>
                    Back to Opportunities
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
                        sx={{ mb: 0.75, borderRadius: 99, color: "text.secondary", minHeight: 34 }}
                    >
                        Back
                    </Button>
                    <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.8 }}>
                        Opportunity Workspace
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Compact deal summary, stage progression, and activity history in one surface.
                    </Typography>
                </Box>

                <Stack direction="row" spacing={1} flexWrap="wrap">
                    <CreateActivityDialog
                        defaultLeadId={opportunity.leadId || undefined}
                        defaultOpportunityId={opportunity.id}
                        onSuccess={loadData}
                        trigger={
                            <Button
                                color="secondary"
                                startIcon={<AddIcon />}
                                sx={{
                                    borderRadius: 99,
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
                    <Button
                        variant="contained"
                        startIcon={<EditIcon />}
                        onClick={() => setShowEditDialog(true)}
                        sx={{ borderRadius: 99, px: 2, minHeight: 36 }}
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
                                borderRadius: 6,
                                overflow: "hidden",
                                border: "1px solid",
                                borderColor: alpha(theme.palette.secondary.main, 0.22),
                            }}
                        >
                            <Box
                                sx={{
                                    px: 2.5,
                                    py: 2.25,
                                    color: "common.white",
                                    background: `linear-gradient(180deg, ${alpha(theme.palette.secondary.dark, 0.96)} 0%, ${alpha(
                                        theme.palette.secondary.main,
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
                                            fontSize: "1.05rem",
                                        }}
                                    >
                                        {opportunity.title.charAt(0)}
                                    </Avatar>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                                            {opportunity.title}
                                        </Typography>
                                        <Typography variant="body2" sx={{ opacity: 0.82 }}>
                                            {opportunity.opportunityType?.name || "Opportunity"}
                                        </Typography>
                                    </Box>
                                </Stack>

                                <Stack direction="row" spacing={0.75} flexWrap="wrap">
                                    <Chip
                                        label={currentStage?.name || "Unassigned"}
                                        size="small"
                                        sx={{
                                            bgcolor: alpha("#fff", 0.14),
                                            color: "common.white",
                                            fontWeight: 800,
                                            borderRadius: 99,
                                            height: 22,
                                        }}
                                    />
                                    <Chip
                                        label={opportunity.priority || "MEDIUM"}
                                        size="small"
                                        sx={{
                                            bgcolor: alpha("#fff", 0.1),
                                            color: "common.white",
                                            fontWeight: 800,
                                            borderRadius: 99,
                                            height: 22,
                                        }}
                                    />
                                </Stack>
                            </Box>

                            <Grid container>
                                <MetricCell label="Value" value={formatCurrency(opportunity.amount || 0)} />
                                <MetricCell label="Probability" value={`${currentStage?.probability ?? 0}%`} />
                                <MetricCell label="Activities" value={String(activities.length)} />
                            </Grid>
                        </Card>

                        <Card sx={{ borderRadius: 4, border: "1px solid", borderColor: "divider" }}>
                            <Box sx={{ px: 1.5, py: 1.125, borderBottom: "1px solid", borderColor: "divider" }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                    Deal Properties
                                </Typography>
                            </Box>
                            <Stack divider={<Divider flexItem />}>
                                <PropertyRow label="Stage">{currentStage?.name || "—"}</PropertyRow>
                                <PropertyRow label="Type">{opportunity.opportunityType?.name || "—"}</PropertyRow>
                                <PropertyRow label="Value">{formatCurrency(opportunity.amount || 0)}</PropertyRow>
                                <PropertyRow label="Priority">{opportunity.priority || "—"}</PropertyRow>
                                <PropertyRow label="Expected Close">
                                    {opportunity.expectedCloseDate ? new Date(opportunity.expectedCloseDate).toLocaleDateString() : "—"}
                                </PropertyRow>
                                <PropertyRow label="Created">{new Date(opportunity.createdAt).toLocaleDateString()}</PropertyRow>
                            </Stack>
                        </Card>

                        <Card sx={{ borderRadius: 4, border: "1px solid", borderColor: "divider" }}>
                            <Box sx={{ px: 1.5, py: 1.125, borderBottom: "1px solid", borderColor: "divider" }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                    Stage Progression
                                </Typography>
                            </Box>
                            <Stack spacing={0.75} sx={{ p: 1.25 }}>
                                {stages.map((stage) => {
                                    const active = stage.id === opportunity.stageId;
                                    return (
                                        <Button
                                            key={stage.id}
                                            variant={active ? "contained" : "text"}
                                            onClick={() => !active && handleStageChange(stage.id)}
                                            sx={{
                                                justifyContent: "space-between",
                                                borderRadius: 2.5,
                                                px: 1.25,
                                                py: 0.8,
                                                bgcolor: active ? "primary.main" : alpha(theme.palette.primary.main, 0.04),
                                                color: active ? "primary.contrastText" : "text.primary",
                                                minHeight: 36,
                                            }}
                                        >
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <Box
                                                    sx={{
                                                        width: 8,
                                                        height: 8,
                                                        borderRadius: "50%",
                                                        bgcolor: active ? "common.white" : stage.color || "primary.main",
                                                    }}
                                                />
                                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                                    {stage.name}
                                                </Typography>
                                            </Stack>
                                            <Typography variant="caption" sx={{ opacity: active ? 0.9 : 0.7 }}>
                                                {stage.probability}%
                                            </Typography>
                                        </Button>
                                    );
                                })}
                            </Stack>
                        </Card>

                        <Card sx={{ borderRadius: 4, border: "1px solid", borderColor: "divider", p: 1.5 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1.125 }}>
                                Linked Lead
                            </Typography>
                            {opportunity.lead ? (
                                <Stack spacing={1}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Avatar sx={{ width: 38, height: 38, bgcolor: "primaryContainer", color: "onPrimaryContainer" }}>
                                            {opportunity.lead.name.charAt(0)}
                                        </Avatar>
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography variant="body1" sx={{ fontWeight: 800 }}>
                                                {opportunity.lead.name}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {opportunity.lead.email || "No email"}
                                            </Typography>
                                        </Box>
                                    </Stack>
                                    <Button component={Link} href={`/dashboard/leads/${opportunity.leadId}`} variant="outlined" sx={{ borderRadius: 99, minHeight: 34 }}>
                                        Open Lead
                                    </Button>
                                </Stack>
                            ) : (
                                <Typography variant="body2" color="text.secondary">
                                    No linked lead.
                                </Typography>
                            )}
                        </Card>
                    </Stack>
                </Grid>

                <Grid size={{ xs: 12, lg: 8.2 }}>
                    <Card sx={{ borderRadius: 4.5, border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
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
                                    <WorkspaceTab label="Deal Details" active={tabValue === "details"} onClick={() => setTabValue("details")} />
                                    <WorkspaceTab label={`Stage History (${history.length})`} active={tabValue === "stage"} onClick={() => setTabValue("stage")} />
                                    <WorkspaceTab label="Notes" active={tabValue === "notes"} onClick={() => setTabValue("notes")} />
                                    <WorkspaceTab label="Audit" active={tabValue === "audit"} onClick={() => setTabValue("audit")} />
                                </Stack>

                                {tabValue === "activity" && (
                                    <Stack direction="row" spacing={0.75} flexWrap="wrap">
                                        <Select
                                            size="small"
                                            value={activityTypeFilter}
                                            onChange={(e) => setActivityTypeFilter(String(e.target.value))}
                                            sx={{ minWidth: 156, borderRadius: 2.5, bgcolor: "background.paper" }}
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
                                            sx={{ minWidth: 132, borderRadius: 2.5, bgcolor: "background.paper" }}
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
                                        <DetailPanel title="Deal Summary">
                                            <PropertyRow label="Title">{opportunity.title}</PropertyRow>
                                            <PropertyRow label="Type">{opportunity.opportunityType?.name || "—"}</PropertyRow>
                                            <PropertyRow label="Stage">{currentStage?.name || "—"}</PropertyRow>
                                            <PropertyRow label="Value">{formatCurrency(opportunity.amount || 0)}</PropertyRow>
                                        </DetailPanel>
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 6 }}>
                                        <DetailPanel title="Commercials">
                                            <PropertyRow label="Priority">{opportunity.priority || "—"}</PropertyRow>
                                            <PropertyRow label="Probability">{`${currentStage?.probability ?? 0}%`}</PropertyRow>
                                            <PropertyRow label="Expected Close">
                                                {opportunity.expectedCloseDate ? new Date(opportunity.expectedCloseDate).toLocaleString() : "—"}
                                            </PropertyRow>
                                            <PropertyRow label="Created">{new Date(opportunity.createdAt).toLocaleString()}</PropertyRow>
                                        </DetailPanel>
                                    </Grid>
                                </Grid>
                            )}

                            {tabValue === "stage" && <OpportunityStageHistoryList history={history} />}

                            {tabValue === "notes" && (
                                <Paper sx={{ p: 1.25, borderRadius: 3, bgcolor: "surfaceContainerLowest" }}>
                                    <NotesPanel entityType="opportunity" entityId={opportunity.id} currentUserId={user?.id} />
                                </Paper>
                            )}

                            {tabValue === "audit" && (
                                <Paper sx={{ p: 1.125, borderRadius: 3, bgcolor: "surfaceContainerLowest" }}>
                                    <RecordHistory entityType="OPPORTUNITY" entityId={opportunity.id} />
                                </Paper>
                            )}
                        </Box>
                    </Card>
                </Grid>
            </Grid>

            <EditOpportunityDialog opportunity={opportunity} open={showEditDialog} onOpenChange={setShowEditDialog} onSuccess={loadData} />
        </Box>
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

function DetailPanel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Card sx={{ borderRadius: 3.5, border: "1px solid", borderColor: "divider" }}>
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
                borderRadius: 2.5,
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
