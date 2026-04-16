"use client";

import { Activity } from "@/types/activities";
import { format, formatDistanceToNow } from "date-fns";
import * as LucideIcons from "lucide-react";
import { User, FileText } from "lucide-react";
import {
    Box,
    Typography,
    Paper,
    Stack,
    Avatar,
    Chip,
    Tooltip,
    useTheme,
    alpha
} from "@mui/material";

interface TimelineProps {
    activities: Activity[];
}

export function Timeline({ activities }: TimelineProps) {
    const theme = useTheme();

    if (activities.length === 0) {
        return (
            <Box sx={{
                textAlign: 'center',
                py: 6,
                border: '2px dashed',
                borderColor: 'divider',
                borderRadius: 4,
                color: 'text.secondary'
            }}>
                <FileText size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
                <Typography variant="h6" fontWeight={600}>No activities recorded yet</Typography>
                <Typography variant="body2">Activity history will appear here</Typography>
            </Box>
        );
    }

    const getIconAndStyle = (activity: Activity) => {
        const type = activity.type;
        const IconComponent = type?.icon ? (LucideIcons as any)[type.icon] : LucideIcons.FileText;
        const Icon = IconComponent || LucideIcons.FileText;
        const color = type?.color || theme.palette.grey[500];

        return {
            icon: <Icon size={16} />,
            color: color,
            bgcolor: alpha(color, 0.1)
        };
    };

    return (
        <Stack spacing={0} sx={{ position: 'relative', p: 1 }}>
            {/* Vertical Line */}
            <Box sx={{
                position: 'absolute',
                top: 20,
                bottom: 20,
                left: { xs: 28, md: '50%' },
                width: '2px',
                bgcolor: 'divider',
                transform: { xs: 'none', md: 'translateX(-50%)' },
                zIndex: 0
            }} />

            {activities.map((activity, index) => {
                const { icon, color, bgcolor } = getIconAndStyle(activity);
                const activityDate = new Date(activity.createdAt);

                return (
                    <Box key={activity.id} sx={{
                        display: 'flex',
                        flexDirection: { xs: 'row', md: index % 2 === 0 ? 'row' : 'row-reverse' },
                        mb: 4,
                        position: 'relative',
                        zIndex: 1
                    }}>
                        {/* Timeline Dot/Icon */}
                        <Box sx={{
                            width: { xs: 56, md: '50%' },
                            display: 'flex',
                            justifyContent: { xs: 'flex-start', md: index % 2 === 0 ? 'flex-end' : 'flex-start' },
                            alignItems: 'center',
                            px: { xs: 0, md: 4 }
                        }}>
                            {/* Spacer for desktop alignment */}
                        </Box>

                        {/* Centered Icon */}
                        <Avatar sx={{
                            width: 40,
                            height: 40,
                            bgcolor: 'background.paper',
                            border: '2px solid',
                            borderColor: color,
                            color: color,
                            position: 'absolute',
                            left: { xs: 8, md: '50%' },
                            transform: { xs: 'none', md: 'translateX(-50%)' },
                            zIndex: 2,
                            boxShadow: theme.shadows[1]
                        }}>
                            {icon}
                        </Avatar>

                        {/* Content Card */}
                        <Box sx={{
                            width: { xs: 'calc(100% - 60px)', md: '50%' },
                            pl: { xs: 8, md: index % 2 === 0 ? 0 : 6 },
                            pr: { xs: 0, md: index % 2 === 0 ? 6 : 0 },
                            textAlign: { xs: 'left', md: 'left' } // Always left align text in card
                        }}>
                            <Paper elevation={0} sx={{
                                p: 2,
                                borderRadius: 4,
                                border: '1px solid',
                                borderColor: 'divider',
                                transition: 'all 0.2s',
                                '&:hover': {
                                    boxShadow: theme.shadows[2],
                                    borderColor: 'primary.main'
                                }
                            }}>
                                <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                                    <Typography variant="subtitle2" fontWeight={700}>
                                        {activity.type?.name || 'Activity'}
                                    </Typography>

                                    {activity.isRecurring && (
                                        <Tooltip title={`Recurring: ${activity.recurrenceRule || 'Custom'}`}>
                                            <LucideIcons.Repeat size={14} color={theme.palette.primary.main} />
                                        </Tooltip>
                                    )}

                                    {activity.slaStatus && activity.slaStatus !== 'PENDING' && (
                                        <Chip
                                            label={activity.slaStatus === 'MET' ? 'SLA Met' : 'SLA Breached'}
                                            size="small"
                                            color={activity.slaStatus === 'MET' ? 'success' : 'error'}
                                            variant="outlined"
                                            sx={{
                                                height: 20,
                                                fontSize: '0.625rem',
                                                fontWeight: 700,
                                                borderRadius: 1
                                            }}
                                        />
                                    )}

                                    {activity.outcome && (
                                        <Chip
                                            label={activity.outcome}
                                            size="small"
                                            sx={{
                                                height: 20,
                                                fontSize: '0.625rem',
                                                fontWeight: 700,
                                                borderRadius: 1
                                            }}
                                        />
                                    )}
                                    <Box flexGrow={1} />
                                    <Tooltip title={format(activityDate, 'PPpp')}>
                                        <Typography variant="caption" color="text.secondary">
                                            {formatDistanceToNow(activityDate, { addSuffix: true })}
                                        </Typography>
                                    </Tooltip>
                                </Stack>

                                {activity.notes && (
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1, whiteSpace: 'pre-wrap' }}>
                                        {activity.notes}
                                    </Typography>
                                )}

                                {activity.user && (
                                    <Stack direction="row" alignItems="center" spacing={0.5} mt={1}>
                                        <User size={12} color={theme.palette.text.disabled} />
                                        <Typography variant="caption" color="text.disabled">
                                            by {activity.user.name || activity.user.email}
                                        </Typography>
                                    </Stack>
                                )}
                            </Paper>
                        </Box>
                    </Box>
                );
            })}
        </Stack>
    );
}

