"use client";

import React from "react";
import { Box, Typography, Button, useTheme, alpha } from "@mui/material";
import { motion } from "framer-motion";
import { fadeInUp, spring } from "@/lib/motion";
import { ErrorOutline as ErrorIcon } from "@mui/icons-material";

export interface ErrorStateProps {
    title?: string;
    description?: string;
    onRetry?: () => void;
}

export function ErrorState({
    title = "Something went wrong",
    description = "An unexpected error occurred. Please try again.",
    onRetry,
}: ErrorStateProps) {
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
                    initial={{ scale: 0.8, opacity: 0, rotate: -10 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    transition={spring.expressive}
                >
                    <Box
                        sx={{
                            width: 80,
                            height: 80,
                            borderRadius: "50%",
                            bgcolor: alpha(theme.palette.error.main, 0.08),
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            mb: 3,
                        }}
                    >
                        <ErrorIcon
                            sx={{ fontSize: 40, color: theme.palette.error.main, opacity: 0.8 }}
                        />
                    </Box>
                </motion.div>

                <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
                    {title}
                </Typography>
                <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ maxWidth: 400, mb: onRetry ? 3 : 0 }}
                >
                    {description}
                </Typography>
                {onRetry && (
                    <Button variant="outlined" onClick={onRetry}>
                        Try Again
                    </Button>
                )}
            </Box>
        </motion.div>
    );
}
