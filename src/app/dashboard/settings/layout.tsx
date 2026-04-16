"use client";

import { Box, Typography, Divider, Paper } from "@mui/material";
import { SettingsSidebar } from "./components/sidebar-nav";
import { RoleGuard } from "@/components/auth/role-guard";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <RoleGuard requiredRole="Tenant Admin">
            <Box
                component={motion.div}
                variants={fadeInUp}
                initial="initial"
                animate="animate"
                sx={{ py: { xs: 2, md: 4 }, maxWidth: 1400, mx: 'auto' }}
            >
                <Box sx={{ mb: 4 }}>
                    <Typography variant="h3" sx={{ fontWeight: 800, letterSpacing: -2, mb: 1 }}>
                        Settings
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ opacity: 0.8 }}>
                        Configure your organization's workspace, teams, and integration preferences.
                    </Typography>
                </Box>

                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: { xs: 'column', lg: 'row' },
                        gap: 5,
                    }}
                >
                    <Box
                        sx={{
                            width: { xs: '100%', lg: 280 },
                            flexShrink: 0,
                        }}
                    >
                        <SettingsSidebar />
                    </Box>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Paper
                            elevation={0}
                            sx={{
                                p: { xs: 3, md: 4 },
                                borderRadius: '28px',
                                border: '1px solid',
                                borderColor: 'divider',
                                bgcolor: 'background.paper',
                                minHeight: '600px'
                            }}
                        >
                            {children}
                        </Paper>
                    </Box>
                </Box>
            </Box>
        </RoleGuard>
    );
}
