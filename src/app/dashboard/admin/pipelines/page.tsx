'use client';

/**
 * Admin Pipelines page — DEPRECATED
 *
 * The "Pipeline" concept has been removed from this CRM.
 * Opportunity stages are now configured per OpportunityType via:
 *   Admin → Opportunity Types
 *
 * This page is kept as a placeholder to avoid broken nav links.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Button, Alert } from '@mui/material';
import { Settings as SettingsIcon } from '@mui/icons-material';

export default function PipelinesAdminPage() {
    const router = useRouter();

    return (
        <Box sx={{ p: 4, maxWidth: 640, mx: 'auto' }}>
            <Alert
                severity="info"
                icon={<SettingsIcon />}
                sx={{ mb: 3, borderRadius: 3 }}
            >
                The <strong>Pipelines</strong> feature has been replaced by <strong>Opportunity Types</strong>.
                Stages are now configured per-opportunity-type.
            </Alert>

            <Typography variant="h5" fontWeight={700} gutterBottom>
                Pipelines → Opportunity Types
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
                Previously, opportunities were organized into Pipelines with Stages.
                This has been simplified — each <strong>Opportunity Type</strong> (e.g. "B2B Deal", "Renewal")
                has its own configurable list of stages.
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
                You can configure stages for your opportunity types from Admin → Opportunity Types.
            </Typography>

            <Button
                variant="contained"
                startIcon={<SettingsIcon />}
                onClick={() => router.push('/dashboard/admin/opportunity-types')}
                sx={{ mt: 2 }}
            >
                Go to Opportunity Types
            </Button>
        </Box>
    );
}
