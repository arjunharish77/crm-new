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
                    p: '18px 18px 10px',
                }}
            >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    {icon && (
                        <Box
                            sx={{
                                width: 34,
                                height: 34,
                                borderRadius: '10px',
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
                        <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '18px', lineHeight: 1.2 }}>
                            {title}
                        </Typography>
                        {subtitle && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
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

            <DialogContent sx={{ px: 2.25, pb: actions ? 0.75 : 2.25, pt: 0.75 }}>
                {children}
            </DialogContent>

            {actions && (
                <DialogActions sx={{ px: 2.25, pb: 2.25, gap: 0.75 }}>
                    {actions}
                </DialogActions>
            )}
        </Dialog>
    );
}
