"use client";

import { Activity } from "@/types/activities";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import * as LucideIcons from "lucide-react";
import { FileText } from "lucide-react";
import {
    alpha,
    Avatar,
    Box,
    Chip,
    Paper,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";

interface TimelineProps {
    activities: Activity[];
}

function getDayLabel(date: Date) {
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "dd MMM yyyy");
}

export function Timeline({ activities }: TimelineProps) {
    const theme = useTheme();

    if (activities.length === 0) {
        return (
            <Box
                sx={{
                    textAlign: "center",
                    py: 6,
                    border: "1px dashed",
                    borderColor: "divider",
                    borderRadius: 4,
                    color: "text.secondary",
                    bgcolor: "surfaceContainerLowest",
                }}
            >
                <FileText size={40} style={{ opacity: 0.18, marginBottom: 12 }} />
                <Typography variant="subtitle1" fontWeight={700}>
                    No activity yet
                </Typography>
                <Typography variant="body2">Activity history will appear here.</Typography>
            </Box>
        );
    }

    const grouped = activities.reduce<Record<string, Activity[]>>((acc, activity) => {
        const key = getDayLabel(new Date(activity.createdAt));
        acc[key] = acc[key] || [];
        acc[key].push(activity);
        return acc;
    }, {});

    return (
        <Stack spacing={3}>
            {Object.entries(grouped).map(([label, items]) => (
                <Box key={label}>
                    <Typography
                        variant="caption"
                        sx={{
                            display: "inline-flex",
                            mb: 1.5,
                            px: 1.25,
                            py: 0.5,
                            borderRadius: 99,
                            bgcolor: alpha(theme.palette.primary.main, 0.08),
                            color: "primary.main",
                            fontWeight: 800,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                        }}
                    >
                        {label}
                    </Typography>

                    <Stack spacing={1.25}>
                        {items.map((activity) => {
                            const type = activity.type;
                            const IconComponent = type?.icon
                                ? (LucideIcons as any)[type.icon]
                                : LucideIcons.FileText;
                            const Icon = IconComponent || LucideIcons.FileText;
                            const accent = type?.color || theme.palette.primary.main;
                            const activityDate = new Date(activity.createdAt);

                            return (
                                <Paper
                                    key={activity.id}
                                    elevation={0}
                                    sx={{
                                        p: 1.5,
                                        borderRadius: 3,
                                        border: "1px solid",
                                        borderColor: alpha(accent, 0.18),
                                        bgcolor: "background.paper",
                                    }}
                                >
                                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                                        <Box
                                            sx={{
                                                width: 52,
                                                minWidth: 52,
                                                textAlign: "center",
                                                pt: 0.25,
                                            }}
                                        >
                                            <Avatar
                                                sx={{
                                                    width: 32,
                                                    height: 32,
                                                    mx: "auto",
                                                    mb: 0.5,
                                                    bgcolor: alpha(accent, 0.1),
                                                    color: accent,
                                                    border: "1px solid",
                                                    borderColor: alpha(accent, 0.18),
                                                }}
                                            >
                                                <Icon size={14} />
                                            </Avatar>
                                            <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }}>
                                                {format(activityDate, "hh:mm a")}
                                            </Typography>
                                        </Box>

                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Stack
                                                direction={{ xs: "column", sm: "row" }}
                                                spacing={1}
                                                justifyContent="space-between"
                                                alignItems={{ xs: "flex-start", sm: "center" }}
                                                sx={{ mb: 0.75 }}
                                            >
                                                <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                                                    <Typography variant="body2" fontWeight={800}>
                                                        {activity.type?.name || "Activity"}
                                                    </Typography>
                                                    {activity.outcome && (
                                                        <Chip
                                                            label={activity.outcome}
                                                            size="small"
                                                            sx={{
                                                                height: 20,
                                                                fontSize: "0.65rem",
                                                                fontWeight: 700,
                                                                borderRadius: 1.5,
                                                                bgcolor: "surfaceContainerHighest",
                                                            }}
                                                        />
                                                    )}
                                                    {activity.slaStatus && activity.slaStatus !== "PENDING" && (
                                                        <Chip
                                                            label={activity.slaStatus}
                                                            size="small"
                                                            color={activity.slaStatus === "MET" ? "success" : "error"}
                                                            variant="outlined"
                                                            sx={{
                                                                height: 20,
                                                                fontSize: "0.65rem",
                                                                fontWeight: 700,
                                                                borderRadius: 1.5,
                                                            }}
                                                        />
                                                    )}
                                                </Stack>

                                                <Typography variant="caption" color="text.secondary">
                                                    {formatDistanceToNow(activityDate, { addSuffix: true })}
                                                </Typography>
                                            </Stack>

                                            {activity.notes ? (
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: "text.primary",
                                                        mb: 0.75,
                                                        whiteSpace: "pre-wrap",
                                                        lineHeight: 1.45,
                                                    }}
                                                >
                                                    {activity.notes}
                                                </Typography>
                                            ) : (
                                                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
                                                    No notes were added for this activity.
                                                </Typography>
                                            )}

                                            <Stack direction="row" spacing={1.25} flexWrap="wrap">
                                                {activity.lead && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        Lead: <strong>{activity.lead.name}</strong>
                                                    </Typography>
                                                )}
                                                {activity.opportunity && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        Opportunity: <strong>{activity.opportunity.title}</strong>
                                                    </Typography>
                                                )}
                                                {activity.user && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        by {activity.user.name || activity.user.email}
                                                    </Typography>
                                                )}
                                            </Stack>
                                        </Box>
                                    </Stack>
                                </Paper>
                            );
                        })}
                    </Stack>
                </Box>
            ))}
        </Stack>
    );
}
