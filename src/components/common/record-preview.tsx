'use client';

import React, { useEffect, useState } from 'react';
import {
    Drawer,
    Box,
    Typography,
    IconButton,
    Tabs,
    Tab,
    Divider,
    Stack,
    Button as MuiButton,
    alpha,
    useTheme
} from "@mui/material";
import {
    Close as CloseIcon,
    OpenInNew as OpenInNewIcon,
    Edit as EditIcon
} from "@mui/icons-material";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { Lead } from "@/types/leads";
import { Activity } from "@/types/activities";
import { LeadContactCard } from "@/components/leads/lead-contact-card";
import { Timeline } from "@/components/timeline/timeline";

interface RecordPreviewProps {
    isOpen: boolean;
    onClose: () => void;
    entityType: 'lead' | 'opportunity' | 'activity';
    entityId: string | null;
}

const RESOURCE_PATHS: Record<RecordPreviewProps["entityType"], string> = {
    lead: "/dashboard/leads",
    opportunity: "/dashboard/opportunities",
    activity: "/dashboard/activities",
};

export function RecordPreview({ isOpen, onClose, entityType, entityId }: RecordPreviewProps) {
    const theme = useTheme();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [tabValue, setTabValue] = useState(0);

    useEffect(() => {
        if (isOpen && entityId) {
            loadData();
        } else {
            setData(null);
            setActivities([]);
            setTabValue(0);
        }
    }, [isOpen, entityId]);

    const loadData = async () => {
        if (!entityId) return;
        setLoading(true);
        try {
            if (entityType === 'lead') {
                const leadData = await apiFetch(`/leads/${entityId}`);
                setData(leadData);
                const filter = { logic: 'AND', conditions: [{ field: 'leadId', operator: 'equals', value: entityId }] };
                const acts: any = await apiFetch(`/activities?filters=${JSON.stringify(filter)}&limit=100`);
                setActivities(acts.data || []);
            }
        } catch (error) {
            toast.error("Failed to load details");
        } finally {
            setLoading(false);
        }
    };

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    return (
        <Drawer
            anchor="right"
            open={isOpen}
            onClose={onClose}
            PaperProps={{
                sx: { width: { xs: '100%', sm: 500, md: 600 }, border: 'none' }
            }}
        >
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
                {/* Header */}
                <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            {loading ? 'Loading...' : data?.name || 'Record Preview'}
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                        {data && (
                            <IconButton
                                size="small"
                                component={Link}
                                href={`${RESOURCE_PATHS[entityType]}/${data.id}`}
                                title="Open Full View"
                            >
                                <OpenInNewIcon fontSize="small" />
                            </IconButton>
                        )}
                        <IconButton onClick={onClose} size="small">
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                </Box>

                {/* Content */}
                <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                    {loading ? (
                        <Box p={4} textAlign="center">
                            <Typography color="text.secondary">Loading record details...</Typography>
                        </Box>
                    ) : data ? (
                        <Box>
                            <Tabs
                                value={tabValue}
                                onChange={handleTabChange}
                                sx={{
                                    borderBottom: '1px solid',
                                    borderColor: 'divider',
                                    px: 2,
                                    '& .MuiTab-root': {
                                        fontWeight: 600,
                                        fontSize: '0.875rem',
                                        minHeight: 48,
                                        textTransform: 'none'
                                    }
                                }}
                            >
                                <Tab label="Details" />
                                <Tab label="Timeline" />
                            </Tabs>

                            <Box p={3}>
                                {tabValue === 0 && (
                                    <Stack spacing={3}>
                                        <Box>
                                            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.1em' }}>
                                                Primary Contact
                                            </Typography>
                                            <LeadContactCard lead={data} />
                                        </Box>

                                        {data.company && (
                                            <Box sx={{
                                                p: 2,
                                                borderRadius: 4,
                                                bgcolor: 'surfaceContainerLow', // M3 Surface
                                                border: '1px solid',
                                                borderColor: 'divider'
                                            }}>
                                                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Company</Typography>
                                                <Typography variant="body1" sx={{ fontWeight: 600, mt: 0.5 }}>{data.company}</Typography>
                                            </Box>
                                        )}

                                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                                            <MuiButton
                                                variant="outlined"
                                                startIcon={<EditIcon />}
                                                sx={{ borderRadius: 10 }}
                                            >
                                                Edit
                                            </MuiButton>
                                            <Link href={`${RESOURCE_PATHS[entityType]}/${data.id}`} passHref legacyBehavior>
                                                <MuiButton
                                                    component="a"
                                                    variant="contained"
                                                    color="primary"
                                                    startIcon={<OpenInNewIcon />}
                                                    sx={{ borderRadius: 10 }}
                                                >
                                                    Full Details
                                                </MuiButton>
                                            </Link>
                                        </Box>
                                    </Stack>
                                )}
                                {tabValue === 1 && (
                                    <Timeline activities={activities} />
                                )}
                            </Box>
                        </Box>
                    ) : (
                        <Box p={4} textAlign="center">
                            <Typography color="text.secondary">No data found</Typography>
                        </Box>
                    )}
                </Box>
            </Box>
        </Drawer>
    );
}
