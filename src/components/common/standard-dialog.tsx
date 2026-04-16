"use client";

import React from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    IconButton,
    Typography,
    Box,
    useTheme,
    alpha,
    Breakpoint,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { motion, AnimatePresence } from "framer-motion";
import { spring, easing } from "@/lib/motion";

interface StandardDialogProps {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
    actions?: React.ReactNode;
    maxWidth?: Breakpoint;
    fullWidth?: boolean;
}

const MotionPaper = motion.div;

export function StandardDialog({
    open,
    onClose,
    title,
    subtitle,
    icon,
    children,
    actions,
    maxWidth = "sm",
    fullWidth = true,
}: StandardDialogProps) {
    const theme = useTheme();

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth={maxWidth}
            fullWidth={fullWidth}
            TransitionProps={{
                timeout: { enter: 350, exit: 200 },
            }}
        >
            <DialogTitle
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    p: '24px 24px 16px',
                }}
            >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    {icon && (
                        <Box
                            sx={{
                                width: 40,
                                height: 40,
                                borderRadius: '12px',
                                bgcolor: alpha(theme.palette.primary.main, 0.08),
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: theme.palette.primary.main,
                            }}
                        >
                            {icon}
                        </Box>
                    )}
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '20px' }}>
                            {title}
                        </Typography>
                        {subtitle && (
                            <Typography variant="body2" color="text.secondary">
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                </Box>
                <IconButton
                    onClick={onClose}
                    size="small"
                    sx={{
                        color: "text.secondary",
                        "&:hover": { bgcolor: alpha(theme.palette.onSurface, 0.08) },
                    }}
                >
                    <CloseIcon fontSize="small" />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ px: 3, pb: actions ? 1 : 3, pt: 1 }}>
                {children}
            </DialogContent>

            {actions && (
                <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
                    {actions}
                </DialogActions>
            )}
        </Dialog>
    );
}
