'use client';

import React from 'react';
import {
    Box,
    Typography,
    Stack,
    Avatar,
    Paper,
    useTheme,
    alpha
} from '@mui/material';
import {
    History as HistoryIcon,
    ArrowForward as ArrowIcon,
    Person as PersonIcon
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import { OpportunityStageHistory } from '@/types/opportunities';

interface OpportunityStageHistoryProps {
    history: OpportunityStageHistory[];
}

export function OpportunityStageHistoryList({ history }: OpportunityStageHistoryProps) {
    const theme = useTheme();

    if (history.length === 0) {
        return (
            <Box sx={{
                textAlign: 'center',
                py: 4,
                bgcolor: 'surfaceContainerLowest',
                borderRadius: 4,
                border: '1px dashed',
                borderColor: 'divider',
                color: 'text.secondary'
            }}>
                <HistoryIcon sx={{ fontSize: 40, opacity: 0.2, mb: 1 }} />
                <Typography variant="body2">No stage transitions recorded yet</Typography>
            </Box>
        );
    }

    return (
        <Stack spacing={2}>
            {history.map((item) => (
                <Paper
                    key={item.id}
                    elevation={0}
                    sx={{
                        p: 2,
                        borderRadius: 3,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'surfaceContainerLowest',
                        '&:hover': {
                            bgcolor: alpha(theme.palette.primary.main, 0.02),
                            borderColor: alpha(theme.palette.primary.main, 0.1)
                        }
                    }}
                >
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Avatar sx={{
                            width: 32,
                            height: 32,
                            bgcolor: 'secondaryContainer',
                            color: 'onSecondaryContainer'
                        }}>
                            <HistoryIcon sx={{ fontSize: 18 }} />
                        </Avatar>

                        <Box sx={{ flexGrow: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                                {item.fromStage ? (
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                                        {item.fromStage.name}
                                    </Typography>
                                ) : (
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.disabled' }}>
                                        Initial
                                    </Typography>
                                )}

                                <ArrowIcon sx={{ fontSize: 14, color: 'text.disabled' }} />

                                <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                                    {item.toStage.name}
                                </Typography>
                            </Box>

                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <PersonIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
                                    <Typography variant="caption" color="text.secondary">
                                        {item.changedBy.name}
                                    </Typography>
                                </Box>
                                <Typography variant="caption" color="text.disabled">•</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {formatDistanceToNow(new Date(item.changedAt), { addSuffix: true })}
                                </Typography>
                            </Box>
                        </Box>
                    </Stack>

                    {item.notes && (
                        <Box sx={{ mt: 1.5, pl: 6.5 }}>
                            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                "{item.notes}"
                            </Typography>
                        </Box>
                    )}
                </Paper>
            ))}
        </Stack>
    );
}
