"use client";

import React, { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import {
    FlashOn as ZapIcon,
    CallSplit as GitBranchIcon,
    Storage as DatabaseIcon,
    PlayArrow as PlayIcon,
    Email as MailIcon,
    Webhook as WebhookIcon,
    AccessTime as ClockIcon,
    MoreHoriz as MoreHorizIcon,
    Add as AddIcon,
    DeleteOutline as DeleteIcon,
    ContentCopy as CopyIcon,
    Person as PersonIcon,
    RemoveCircleOutline as RemoveIcon,
    StopCircle as StopIcon,
    Notifications as NotificationIcon
} from "@mui/icons-material";
import { Box, IconButton, Paper, Tooltip, Typography, useTheme, alpha } from "@mui/material";
// import { motion } from "framer-motion"; // Optional: could use MUI transitions or keep framer if desired. Let's use simple CSS/MUI for now to be safe.

const ICONS: Record<string, any> = {
    trigger: ZapIcon,
    condition: GitBranchIcon,
    update_field: DatabaseIcon,
    create_activity: PlayIcon,
    send_email: MailIcon,
    webhook: WebhookIcon,
    delay: ClockIcon,
    wait: ClockIcon,
    if_else: GitBranchIcon,
    update_lead: DatabaseIcon,
    update_opportunity: DatabaseIcon,
    add_activity: PlayIcon,
    distribute_lead: GitBranchIcon,
    distribute_opportunity: GitBranchIcon,
    assign_owner: PersonIcon,
    change_stage: DatabaseIcon,
    notify_user: NotificationIcon,
    remove_tag: RemoveIcon,
    increment_score: DatabaseIcon,
    clear_field: RemoveIcon,
    stop: StopIcon,
    branch: GitBranchIcon,
};

// Start copying colors from page.tsx for consistency
const COLORS: Record<string, string> = {
    trigger: '#2196f3',      // Blue
    condition: '#ff9800',    // Orange
    update_field: '#4caf50', // Green
    create_activity: '#9c27b0', // Purple
    send_email: '#ff5722',   // Deep Orange
    webhook: '#e91e63',      // Pink
    delay: '#607d8b',        // Blue Grey
    wait: '#607d8b',
    if_else: '#ff9800',
    update_lead: '#4caf50',
    update_opportunity: '#4caf50',
    add_activity: '#9c27b0',
    distribute_lead: '#0288d1',
    distribute_opportunity: '#0288d1',
    assign_owner: '#5c6bc0',
    change_stage: '#43a047',
    notify_user: '#ff7043',
    remove_tag: '#00897b',
    increment_score: '#7cb342',
    clear_field: '#78909c',
    stop: '#d32f2f',
    branch: '#78909c',
};

export const ExpressiveNode = memo(({ data, selected }: NodeProps) => {
    const theme = useTheme();
    const Icon = ICONS[data.type] || ZapIcon;
    const color = COLORS[data.type] || theme.palette.primary.main;

    return (
        <Paper
            elevation={selected ? 4 : 1}
            sx={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                p: 1.5,
                minWidth: 180,
                borderRadius: '24px',
                border: '2px solid',
                borderColor: selected ? 'primary.main' : 'divider',
                bgcolor: 'background.paper',
                transition: 'all 0.3s ease',
                '&:hover': {
                    borderColor: selected ? 'primary.main' : alpha(theme.palette.primary.main, 0.5),
                    boxShadow: selected ? 6 : 2,
                }
            }}
        >
            {/* Input Handle */}
            <Handle
                type="target"
                position={Position.Top}
                style={{
                    background: theme.palette.primary.main,
                    width: 10,
                    height: 10,
                    border: `2px solid ${theme.palette.background.paper}`,
                }}
            />

            {/* Icon Box */}
            <Box
                sx={{
                    p: 1,
                    borderRadius: '50%',
                    bgcolor: color,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: `0 4px 12px ${alpha(color, 0.3)}`
                }}
            >
                <Icon sx={{ fontSize: 20 }} />
            </Box>

            {/* Content */}
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                <Typography
                    variant="caption"
                    sx={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        color: 'text.secondary',
                        mb: 0.25
                    }}
                >
                    {data.type !== 'trigger' ? data.type.replace(/_/g, ' ') : 'Trigger'}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                    {data.label}
                </Typography>
            </Box>

            <Box sx={{ ml: 'auto', display: 'flex', gap: 0.25, opacity: selected ? 1 : 0, transition: 'opacity 0.2s', '.MuiPaper-root:hover &': { opacity: 1 } }}>
                <Tooltip title="Clone node">
                    <IconButton
                        size="small"
                        onClick={(event) => {
                            event.stopPropagation();
                            data.onCloneNode?.(data.nodeId);
                        }}
                        sx={{ width: 24, height: 24 }}
                    >
                        <CopyIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Delete node">
                    <IconButton
                        size="small"
                        onClick={(event) => {
                            event.stopPropagation();
                            data.onDeleteNode?.(data.nodeId);
                        }}
                        sx={{ width: 24, height: 24 }}
                    >
                        <DeleteIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                </Tooltip>
                <MoreHorizIcon fontSize="small" color="disabled" sx={{ alignSelf: 'center' }} />
            </Box>

            {/* Output Handle */}
            <Handle
                type="source"
                position={Position.Bottom}
                style={{
                    background: theme.palette.primary.main,
                    width: 10,
                    height: 10,
                    border: `2px solid ${theme.palette.background.paper}`,
                }}
            />
            <Tooltip title="Add next step">
                <IconButton
                    size="small"
                    onClick={(event) => {
                        event.stopPropagation();
                        data.onAddChild?.(data.nodeId);
                    }}
                    sx={{
                        position: 'absolute',
                        left: '50%',
                        bottom: -18,
                        transform: 'translateX(-50%)',
                        width: 28,
                        height: 28,
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        boxShadow: 2,
                        '&:hover': { bgcolor: 'primary.dark' },
                    }}
                >
                    <AddIcon sx={{ fontSize: 17 }} />
                </IconButton>
            </Tooltip>
        </Paper>
    );
});

ExpressiveNode.displayName = "ExpressiveNode";
