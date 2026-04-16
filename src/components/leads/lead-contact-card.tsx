'use client';

import { motion } from 'framer-motion';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Stack,
    IconButton,
    Button,
    Chip,
    alpha,
    useTheme,
    Tooltip,
    Divider
} from '@mui/material';
import {
    Phone as PhoneIcon,
    Mail as MailIcon,
    ContentCopy as CopyIcon,
    Add as AddIcon,
    History as ActivityIcon,
    Business as BusinessIcon
} from '@mui/icons-material';
import { toast } from 'sonner';
import { fadeInUp } from '@/lib/motion';

interface LeadContactCardProps {
    lead: {
        id: string;
        name: string;
        email?: string | null;
        phone?: string | null;
        company?: string | null;
        status: string;
    };
    onCreateActivity?: () => void;
    onCreateOpportunity?: () => void;
}

export function LeadContactCard({ lead, onCreateActivity, onCreateOpportunity }: LeadContactCardProps) {
    const theme = useTheme();

    const copyToClipboard = async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(`${label} copied to clipboard!`);
        } catch (error) {
            toast.error('Failed to copy to clipboard');
        }
    };

    const getStatusColor = (status: string) => {
        const s = status.toLowerCase();
        if (s === 'new') return { color: theme.palette.primary.main, bgcolor: 'primaryContainer' };
        if (s === 'qualified' || s === 'contacted') return { color: theme.palette.success.main, bgcolor: alpha(theme.palette.success.main, 0.1) };
        return { color: theme.palette.text.secondary, bgcolor: 'surfaceContainerHigh' };
    };

    const statusStyle = getStatusColor(lead.status);

    return (
        <Box
            component={motion.div}
            initial="initial"
            animate="animate"
            variants={fadeInUp}
        >
            <Card
                elevation={0}
                sx={{
                    borderRadius: '24px',
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'surfaceContainerLowest',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                        borderColor: alpha(theme.palette.primary.main, 0.3),
                        boxShadow: '0 8px 32px rgba(0,0,0,0.06)'
                    }
                }}
            >
                {/* Header */}
                <Box sx={{ p: 3, borderBottom: '1px solid', borderColor: alpha(theme.palette.divider, 0.5) }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Box>
                            <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5, letterSpacing: '-0.5px' }}>
                                {lead.name}
                            </Typography>
                            {lead.company && (
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary' }}>
                                    <BusinessIcon sx={{ fontSize: 16 }} />
                                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{lead.company}</Typography>
                                </Stack>
                            )}
                        </Box>
                        <Chip
                            label={lead.status}
                            sx={{
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                fontSize: '0.625rem',
                                letterSpacing: '0.05em',
                                height: 24,
                                bgcolor: statusStyle.bgcolor,
                                color: statusStyle.color,
                                border: '1px solid',
                                borderColor: alpha(statusStyle.color || theme.palette.divider, 0.2)
                            }}
                        />
                    </Stack>
                </Box>

                {/* Contact Info */}
                <CardContent sx={{ p: 3, spaceY: 2 }}>
                    <Stack spacing={2.5}>
                        {lead.email && (
                            <Stack direction="row" alignItems="center" justifyContent="space-between" className="group">
                                <Stack direction="row" spacing={2} alignItems="center" sx={{ flexGrow: 1 }}>
                                    <Box sx={{ p: 1, borderRadius: '10px', bgcolor: 'surfaceContainerHigh', color: 'text.secondary', display: 'flex' }}>
                                        <MailIcon sx={{ fontSize: 18 }} />
                                    </Box>
                                    <Typography
                                        component="a"
                                        href={`mailto:${lead.email}`}
                                        variant="body2"
                                        sx={{
                                            fontWeight: 600,
                                            color: 'text.primary',
                                            textDecoration: 'none',
                                            '&:hover': { color: 'primary.main' }
                                        }}
                                    >
                                        {lead.email}
                                    </Typography>
                                </Stack>
                                <Tooltip title="Copy Email">
                                    <IconButton
                                        size="small"
                                        onClick={() => copyToClipboard(lead.email!, 'Email')}
                                        sx={{ opacity: 0, '.group:hover &': { opacity: 1 }, transition: 'opacity 0.2s' }}
                                    >
                                        <CopyIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                        )}

                        {lead.phone && (
                            <Stack direction="row" alignItems="center" justifyContent="space-between" className="group">
                                <Stack direction="row" spacing={2} alignItems="center" sx={{ flexGrow: 1 }}>
                                    <Box sx={{ p: 1, borderRadius: '10px', bgcolor: 'surfaceContainerHigh', color: 'text.secondary', display: 'flex' }}>
                                        <PhoneIcon sx={{ fontSize: 18 }} />
                                    </Box>
                                    <Typography
                                        component="a"
                                        href={`tel:${lead.phone}`}
                                        variant="body2"
                                        sx={{
                                            fontWeight: 600,
                                            color: 'text.primary',
                                            textDecoration: 'none',
                                            '&:hover': { color: 'primary.main' }
                                        }}
                                    >
                                        {lead.phone}
                                    </Typography>
                                </Stack>
                                <Tooltip title="Copy Phone">
                                    <IconButton
                                        size="small"
                                        onClick={() => copyToClipboard(lead.phone!, 'Phone')}
                                        sx={{ opacity: 0, '.group:hover &': { opacity: 1 }, transition: 'opacity 0.2s' }}
                                    >
                                        <CopyIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                        )}
                    </Stack>
                </CardContent>

                <Divider sx={{ mx: 3, opacity: 0.5 }} />

                {/* Actions */}
                <Box sx={{ p: 2 }}>
                    <Stack spacing={1}>
                        <Button
                            onClick={onCreateActivity}
                            variant="contained"
                            fullWidth
                            startIcon={<ActivityIcon />}
                            sx={{
                                borderRadius: '14px',
                                py: 1.25,
                                fontWeight: 700,
                                textTransform: 'none',
                                boxShadow: 'none',
                                '&:hover': { boxShadow: 'none' }
                            }}
                        >
                            Log Activity
                        </Button>
                        <Button
                            onClick={onCreateOpportunity}
                            variant="outlined"
                            fullWidth
                            startIcon={<AddIcon />}
                            sx={{
                                borderRadius: '14px',
                                py: 1.25,
                                fontWeight: 700,
                                textTransform: 'none'
                            }}
                        >
                            Create Opportunity
                        </Button>
                    </Stack>
                </Box>
            </Card>
        </Box>
    );
}
