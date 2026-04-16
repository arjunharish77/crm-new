"use client";

import React from "react";
import {
    Box,
    Typography,
    Stack,
    Paper,
    Chip,
    alpha,
    useTheme,
    Divider
} from "@mui/material";
import {
    Zap,
    GitBranch,
    Database,
    Play,
    Mail,
    Webhook,
    Clock,
    CheckCircle2,
    XCircle,
    Info
} from "lucide-react";
import { format } from "date-fns";

const ICONS: Record<string, any> = {
    trigger: Zap,
    condition: GitBranch,
    update_field: Database,
    create_activity: Play,
    send_email: Mail,
    webhook: Webhook,
    delay: Clock,
};

interface ExecutionStep {
    node: string;
    type: string;
    status: string;
    action?: string;
    result?: boolean;
    error?: string;
    timestamp?: string;
}

interface ExecutionLogViewerProps {
    steps: ExecutionStep[];
}

export function ExecutionLogViewer({ steps }: ExecutionLogViewerProps) {
    const theme = useTheme();

    if (!steps || steps.length === 0) {
        return (
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                    No execution steps found.
                </Typography>
            </Box>
        );
    }

    return (
        <Stack spacing={2} sx={{ py: 2 }}>
            {steps.map((step, index) => {
                const Icon = ICONS[step.type] || Info;
                const isSuccess = step.status.includes('SUCCESS') || step.status === 'COMPLETED';
                const isWaiting = step.status === 'WAITING';
                const isFailed = step.status === 'FAILED';

                return (
                    <Box key={index} sx={{ position: 'relative' }}>
                        {index < steps.length - 1 && (
                            <Box
                                sx={{
                                    position: 'absolute',
                                    left: 20,
                                    top: 40,
                                    bottom: -16,
                                    width: 2,
                                    bgcolor: 'divider',
                                    zIndex: 0
                                }}
                            />
                        )}
                        <Paper
                            elevation={0}
                            sx={{
                                p: 2,
                                borderRadius: '16px',
                                border: '1px solid',
                                borderColor: 'divider',
                                position: 'relative',
                                zIndex: 1,
                                bgcolor: isWaiting ? alpha(theme.palette.info.main, 0.02) : 'background.paper',
                            }}
                        >
                            <Stack direction="row" spacing={2} alignItems="flex-start">
                                <Box
                                    sx={{
                                        p: 1,
                                        borderRadius: '12px',
                                        bgcolor: isSuccess ? alpha(theme.palette.success.main, 0.1) :
                                            isFailed ? alpha(theme.palette.error.main, 0.1) :
                                                isWaiting ? alpha(theme.palette.info.main, 0.1) :
                                                    alpha(theme.palette.primary.main, 0.1),
                                        color: isSuccess ? 'success.main' :
                                            isFailed ? 'error.main' :
                                                isWaiting ? 'info.main' :
                                                    'primary.main',
                                    }}
                                >
                                    <Icon size={20} />
                                </Box>
                                <Box sx={{ flex: 1 }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, textTransform: 'capitalize' }}>
                                            {step.type.replace('_', ' ')}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {step.timestamp ? format(new Date(step.timestamp), 'HH:mm:ss') : ''}
                                        </Typography>
                                    </Stack>

                                    <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
                                        {step.action || `Executed ${step.type} step`}
                                    </Typography>

                                    {step.type === 'condition' && step.result !== undefined && (
                                        <Chip
                                            label={step.result ? "Matched" : "No Match"}
                                            size="small"
                                            color={step.result ? "success" : "default"}
                                            sx={{ mt: 1, height: 20, fontSize: '0.625rem' }}
                                        />
                                    )}

                                    {step.error && (
                                        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1, fontWeight: 500 }}>
                                            Error: {step.error}
                                        </Typography>
                                    )}
                                </Box>
                                <Box>
                                    {isSuccess ? (
                                        <CheckCircle2 size={18} className="text-green-500" />
                                    ) : isFailed ? (
                                        <XCircle size={18} className="text-red-500" />
                                    ) : isWaiting ? (
                                        <Clock size={18} className="text-blue-500 animate-pulse" />
                                    ) : null}
                                </Box>
                            </Stack>
                        </Paper>
                    </Box>
                );
            })}
        </Stack>
    );
}
