"use client";

import React from "react";
import { Box, Typography, Button, useTheme, alpha } from "@mui/material";
import { motion } from "framer-motion";
import { fadeInUp, spring } from "@/lib/motion";
import {
    SearchOff as DefaultIcon,
} from "@mui/icons-material";

export interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
    const theme = useTheme();

    return (
        <motion.div
            variants={fadeInUp}
            initial="initial"
            animate="animate"
        >
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    py: 8,
                    px: 4,
                    textAlign: "center",
                }}
            >
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={spring.expressive}
                >
                    <Box
                        sx={{
                            width: 80,
                            height: 80,
                            borderRadius: "50%",
                            bgcolor: alpha(theme.palette.primary.main, 0.08),
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            mb: 3,
                        }}
                    >
                        {icon || (
                            <DefaultIcon
                                sx={{ fontSize: 40, color: theme.palette.primary.main, opacity: 0.6 }}
                            />
                        )}
                    </Box>
                </motion.div>

                <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
                    {title}
                </Typography>
                {description && (
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ maxWidth: 400, mb: action ? 3 : 0 }}
                    >
                        {description}
                    </Typography>
                )}
                {action}
            </Box>
        </motion.div>
    );
}
