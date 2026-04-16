'use client';

import React from "react";
import { Box, Container } from "@mui/material";
import { DashboardManager } from "@/components/dashboard/dashboard-manager";

export default function DashboardPage() {
    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            <Box sx={{ flexGrow: 1 }}>
                <DashboardManager />
            </Box>
        </Container>
    );
}
