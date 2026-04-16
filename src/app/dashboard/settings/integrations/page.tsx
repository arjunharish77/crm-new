'use client';

import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Tabs,
    Tab,
    Card,
    CardContent,
    Button,
    Stack,
    TextField,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Chip,
    IconButton,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    Divider,
    Alert,
    CircularProgress,
    Tooltip,
    Paper
} from '@mui/material';
import {
    Webhook as WebhookIcon,
    UploadFile as ImportIcon,
    GetApp as ExportIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    CheckCircle as ActiveIcon,
    Block as InactiveIcon,
    FileCopy as CopyIcon,
    Info as InfoIcon
} from '@mui/icons-material';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

interface Webhook {
    id: string;
    name: string;
    url: string;
    events: string[];
    isActive: boolean;
    secret?: string;
}

interface ImportJob {
    id: string;
    module: string;
    status: string;
    stats: { total: number; processed: number; failed: number };
    createdAt: string;
}

export default function IntegrationsSettingsPage() {
    const [activeTab, setActiveTab] = useState(0);
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [imports, setImports] = useState<ImportJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddingWebhook, setIsAddingWebhook] = useState(false);
    const [newWebhook, setNewWebhook] = useState({ name: '', url: '', events: ['LEAD.CREATED'], secret: '' });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [whData, impData] = await Promise.all([
                apiFetch('/integrations/webhooks'),
                apiFetch('/integrations/csv/jobs'), // Assuming this endpoint exists or will be added
            ]);
            setWebhooks(whData || []);
            setImports(impData || []);
        } catch (err) {
            console.error('Failed to fetch integrations', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddWebhook = async () => {
        try {
            const created = await apiFetch('/integrations/webhooks', {
                method: 'POST',
                body: JSON.stringify(newWebhook),
            });
            setWebhooks([...webhooks, created]);
            setIsAddingWebhook(false);
            setNewWebhook({ name: '', url: '', events: ['LEAD.CREATED'], secret: '' });
            toast.success('Webhook created successfully');
        } catch (err) {
            toast.error('Failed to create webhook');
        }
    };

    const handleDeleteWebhook = async (id: string) => {
        if (!confirm('Are you sure you want to delete this webhook?')) return;
        try {
            await apiFetch(`/integrations/webhooks/${id}`, { method: 'DELETE' });
            setWebhooks(webhooks.filter(w => w.id !== id));
            toast.success('Webhook deleted');
        } catch (err) {
            toast.error('Failed to delete webhook');
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.info('Copied to clipboard');
    };

    return (
        <Box sx={{ p: 4 }}>
            <Typography variant="h4" fontWeight="bold" gutterBottom>
                Integrations
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 4 }}>
                Connect your CRM to external tools via Webhooks and CSV imports.
            </Typography>

            <Paper sx={{ mb: 4 }}>
                <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
                    <Tab label="Webhooks (Outbound)" icon={<WebhookIcon />} iconPosition="start" />
                    <Tab label="Inbound Capture" icon={<InfoIcon />} iconPosition="start" />
                    <Tab label="CSV Imports" icon={<ImportIcon />} iconPosition="start" />
                </Tabs>
            </Paper>

            {activeTab === 0 && (
                <Stack spacing={3}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6">Webhook Subscriptions</Typography>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => setIsAddingWebhook(true)}
                        >
                            Add Webhook
                        </Button>
                    </Box>

                    {loading ? <CircularProgress /> : webhooks.length === 0 ? (
                        <Alert severity="info" variant="outlined">No webhooks configured. Start by adding one to send events to external systems.</Alert>
                    ) : (
                        <Card variant="outlined">
                            <List disablePadding>
                                {webhooks.map((wh, idx) => (
                                    <React.Fragment key={wh.id}>
                                        <ListItem
                                            secondaryAction={
                                                <IconButton edge="end" color="error" onClick={() => handleDeleteWebhook(wh.id)}>
                                                    <DeleteIcon />
                                                </IconButton>
                                            }
                                        >
                                            <ListItemIcon>
                                                {wh.isActive ? <ActiveIcon color="success" /> : <InactiveIcon color="disabled" />}
                                            </ListItemIcon>
                                            <ListItemText
                                                primary={wh.name}
                                                secondary={
                                                    <Box component="span">
                                                        <Typography variant="caption" display="block">{wh.url}</Typography>
                                                        <Stack direction="row" spacing={0.5} mt={0.5}>
                                                            {wh.events.map(ev => <Chip key={ev} label={ev} size="small" variant="outlined" />)}
                                                        </Stack>
                                                    </Box>
                                                }
                                            />
                                        </ListItem>
                                        {idx < webhooks.length - 1 && <Divider />}
                                    </React.Fragment>
                                ))}
                            </List>
                        </Card>
                    )}
                </Stack>
            )}

            {activeTab === 1 && (
                <Stack spacing={3}>
                    <Card variant="outlined">
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Lead Capture Webhook</Typography>
                            <Typography variant="body2" color="text.secondary" paragraph>
                                Use this endpoint to push leads into your CRM from external web forms (e.g., Elementor, Typeform).
                            </Typography>

                            <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 1, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Typography sx={{ fontSize: '0.875rem', fontFamily: 'monospace' }}>
                                    https://api.crm.io/integrations/inbound/leads/TENANT_KEY
                                </Typography>
                                <IconButton onClick={() => copyToClipboard('https://api.crm.io/integrations/inbound/leads/TENANT_KEY')}>
                                    <CopyIcon fontSize="small" />
                                </IconButton>
                            </Box>

                            <Alert severity="warning">
                                Replace <code>TENANT_KEY</code> with your unique integration key.
                            </Alert>
                        </CardContent>
                    </Card>
                </Stack>
            )}

            {activeTab === 2 && (
                <Stack spacing={3}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6">Recent Imports</Typography>
                        <Button variant="outlined" startIcon={<ImportIcon />}>
                            Import CSV
                        </Button>
                    </Box>

                    {imports.length === 0 ? (
                        <Alert severity="info">No recent imports found.</Alert>
                    ) : (
                        <Card variant="outlined">
                            {/* Import History Table Placeholder */}
                            <CardContent>Import history will appear here.</CardContent>
                        </Card>
                    )}
                </Stack>
            )}

            {/* Add Webhook Dialog */}
            <Dialog open={isAddingWebhook} onClose={() => setIsAddingWebhook(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Add Webhook Subscription</DialogTitle>
                <DialogContent>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <TextField
                            label="Webhook Name"
                            fullWidth
                            value={newWebhook.name}
                            onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })}
                            placeholder="e.g. My Zapier Lead Webhook"
                        />
                        <TextField
                            label="Destination URL"
                            fullWidth
                            value={newWebhook.url}
                            onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
                            placeholder="https://hooks.zapier.com/..."
                        />
                        <TextField
                            label="Secret (Optional)"
                            fullWidth
                            value={newWebhook.secret}
                            onChange={(e) => setNewWebhook({ ...newWebhook, secret: e.target.value })}
                            placeholder="HMAC Signing Secret"
                            type="password"
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsAddingWebhook(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleAddWebhook}>Create Webhook</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
