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
    Paper,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Switch,
    FormControlLabel,
    Checkbox,
    Accordion,
    AccordionSummary,
    AccordionDetails
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
    Info as InfoIcon,
    ExpandMore as ExpandMoreIcon,
    Phone as PhoneIcon
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
    stats: { total: number; processed: number; created: number; updated: number; skipped: number; failed: number };
    errors?: { row: number; message: string }[];
    createdAt: string;
}

interface CallLog {
    id: string;
    provider: string;
    direction: string;
    fromNumber?: string;
    toNumber?: string;
    status: string;
    duration?: number;
    recordingUrl?: string;
    startedAt: string;
}

const IMPORT_FIELDS = {
    LEAD: [
        { key: 'name', label: 'Lead Name', required: true },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'company', label: 'Company' },
        { key: 'source', label: 'Source' },
        { key: 'status', label: 'Status' },
    ],
    OPPORTUNITY: [
        { key: 'title', label: 'Opportunity Title', required: true },
        { key: 'leadId', label: 'Lead ID', required: true },
        { key: 'opportunityTypeId', label: 'Opportunity Type ID', required: true },
        { key: 'stageId', label: 'Stage ID' },
        { key: 'amount', label: 'Amount' },
        { key: 'expectedCloseDate', label: 'Expected Close Date' },
        { key: 'priority', label: 'Priority' },
    ],
    ACTIVITY: [
        { key: 'typeId', label: 'Activity Type ID', required: true },
        { key: 'leadId', label: 'Lead ID' },
        { key: 'opportunityId', label: 'Opportunity ID' },
        { key: 'outcome', label: 'Outcome' },
        { key: 'notes', label: 'Notes' },
        { key: 'dueAt', label: 'Due At' },
    ],
};

function parseCsv(text: string) {
    const rows: string[][] = [];
    let current = '';
    let row: string[] = [];
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        const next = text[i + 1];
        if (char === '"' && quoted && next === '"') {
            current += '"';
            i += 1;
        } else if (char === '"') {
            quoted = !quoted;
        } else if (char === ',' && !quoted) {
            row.push(current.trim());
            current = '';
        } else if ((char === '\n' || char === '\r') && !quoted) {
            if (char === '\r' && next === '\n') i += 1;
            row.push(current.trim());
            if (row.some(Boolean)) rows.push(row);
            row = [];
            current = '';
        } else {
            current += char;
        }
    }

    row.push(current.trim());
    if (row.some(Boolean)) rows.push(row);
    const headers = rows[0] ?? [];
    return {
        headers,
        rows: rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))),
    };
}

function ApiBox({ value, onCopy }: { value: string; onCopy: (text: string) => void }) {
    return (
        <Box sx={{ bgcolor: 'action.hover', p: 1.5, borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography sx={{ fontSize: '0.8rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>{value}</Typography>
            <IconButton onClick={() => onCopy(value)}><CopyIcon fontSize="small" /></IconButton>
        </Box>
    );
}

export default function IntegrationsSettingsPage() {
    const [activeTab, setActiveTab] = useState(0);
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [imports, setImports] = useState<ImportJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddingWebhook, setIsAddingWebhook] = useState(false);
    const [newWebhook, setNewWebhook] = useState({ name: '', url: '', events: ['LEAD.CREATED'], secret: '' });
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [importModule, setImportModule] = useState<'LEAD' | 'OPPORTUNITY' | 'ACTIVITY'>('LEAD');
    const [duplicateMode, setDuplicateMode] = useState<'SKIP' | 'UPDATE' | 'CREATE'>('SKIP');
    const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
    const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
    const [mappings, setMappings] = useState<Record<string, string>>({});
    const [importing, setImporting] = useState(false);
    const [telephony, setTelephony] = useState<any>({
        provider: '',
        agentPopupUrl: '',
        clickToCallUrl: '',
        clickToCallMethod: 'POST',
        clickToCallRequestType: 'JSON',
        clickToCallResponseKeyword: 'success',
        clickToCallTemplate: '{ "agent": "@AgentNumberWithoutCC", "customer": "@leadPhone", "leadId": "@LeadId" }',
        clickToCallMode: 'SERVER',
        clickToCallHeaders: [],
        webhookSecret: '',
        inboundNumber: '',
        outboundCallerId: '',
        defaultAgentNumber: '',
        callDispositionUrl: '',
        callDispositionTemplate: '{ "sessionId": "@callSessionId", "disposition": "@disposition" }',
        agentPanelUrl: '',
        agentPanelTitle: 'Phone',
        agentPanelWidth: '420',
        agentPanelHeight: '620',
        agentPanelPermissions: 'microphone; autoplay',
        enableAgentPopup: true,
        hideAgentPopupClose: false,
        useExternalAgentPopupUrl: false,
        enableTeamAssignment: false,
        userAgentMappings: [],
        callStatusMappings: { answered: 'Answered', missed: 'Missed', failed: 'Failed' },
        isActive: false,
    });
    const [telephonySection, setTelephonySection] = useState('click2call');
    const [callLogs, setCallLogs] = useState<CallLog[]>([]);
    const [testCall, setTestCall] = useState({ phoneNumber: '', leadId: '' });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [whData, impData] = await Promise.all([
                apiFetch('/integrations/webhooks'),
                apiFetch('/integrations/csv/jobs'),
            ]);
            setWebhooks(whData || []);
            setImports(impData || []);
            apiFetch('/integrations/telephony')
                .then((data) => setTelephony({
                    provider: data?.config?.provider ?? '',
                    agentPopupUrl: data?.config?.agentPopupUrl ?? '',
                    clickToCallUrl: data?.config?.clickToCallUrl ?? '',
                    clickToCallMethod: data?.config?.clickToCallMethod ?? 'POST',
                    clickToCallRequestType: data?.config?.clickToCallRequestType ?? 'JSON',
                    clickToCallResponseKeyword: data?.config?.clickToCallResponseKeyword ?? 'success',
                    clickToCallTemplate: data?.config?.clickToCallTemplate ?? '{ "agent": "@AgentNumberWithoutCC", "customer": "@leadPhone", "leadId": "@LeadId" }',
                    clickToCallMode: data?.config?.clickToCallMode ?? 'SERVER',
                    clickToCallHeaders: data?.config?.clickToCallHeaders ?? [],
                    webhookSecret: data?.config?.webhookSecret ?? '',
                    inboundNumber: data?.config?.inboundNumber ?? '',
                    outboundCallerId: data?.config?.outboundCallerId ?? '',
                    defaultAgentNumber: data?.config?.defaultAgentNumber ?? '',
                    callDispositionUrl: data?.config?.callDispositionUrl ?? '',
                    callDispositionTemplate: data?.config?.callDispositionTemplate ?? '{ "sessionId": "@callSessionId", "disposition": "@disposition" }',
                    agentPanelUrl: data?.config?.agentPanelUrl ?? '',
                    agentPanelTitle: data?.config?.agentPanelTitle ?? 'Phone',
                    agentPanelWidth: data?.config?.agentPanelWidth ?? '420',
                    agentPanelHeight: data?.config?.agentPanelHeight ?? '620',
                    agentPanelPermissions: data?.config?.agentPanelPermissions ?? 'microphone; autoplay',
                    enableAgentPopup: Boolean(data?.config?.enableAgentPopup ?? true),
                    hideAgentPopupClose: Boolean(data?.config?.hideAgentPopupClose ?? false),
                    useExternalAgentPopupUrl: Boolean(data?.config?.useExternalAgentPopupUrl ?? false),
                    enableTeamAssignment: Boolean(data?.config?.enableTeamAssignment ?? false),
                    userAgentMappings: data?.config?.userAgentMappings ?? [],
                    callStatusMappings: data?.config?.callStatusMappings ?? { answered: 'Answered', missed: 'Missed', failed: 'Failed' },
                    isActive: Boolean(data?.isActive)
                }))
                .catch(() => undefined);
            apiFetch('/integrations/telephony/call-logs')
                .then((data) => setCallLogs(Array.isArray(data) ? data : []))
                .catch(() => undefined);
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

    const handleCsvFile = async (file: File | null) => {
        if (!file) return;
        const parsed = parseCsv(await file.text());
        if (parsed.headers.length === 0 || parsed.rows.length === 0) {
            toast.error('CSV must include a header row and at least one data row');
            return;
        }
        const autoMappings = Object.fromEntries(
            parsed.headers.map((header) => {
                const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '');
                const match = IMPORT_FIELDS[importModule].find((field) => field.key.toLowerCase() === normalized || field.label.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized);
                return [header, match?.key ?? ''];
            })
        );
        setCsvHeaders(parsed.headers);
        setCsvRows(parsed.rows);
        setMappings(autoMappings);
    };

    const handleRunImport = async () => {
        const mappedTargets = Object.values(mappings).filter(Boolean);
        const missingRequired = IMPORT_FIELDS[importModule].filter((field) => field.required && !mappedTargets.includes(field.key));
        if (missingRequired.length > 0) {
            toast.error(`Map required fields: ${missingRequired.map((field) => field.label).join(', ')}`);
            return;
        }
        setImporting(true);
        try {
            await apiFetch('/integrations/csv/jobs', {
                method: 'POST',
                body: JSON.stringify({
                    module: importModule,
                    duplicateMode,
                    rows: csvRows,
                    mappings: Object.entries(mappings)
                        .filter(([, target]) => target)
                        .map(([source, target]) => ({ source, target })),
                }),
            });
            toast.success('Import completed');
            setIsImportOpen(false);
            setCsvHeaders([]);
            setCsvRows([]);
            setMappings({});
            fetchData();
        } catch {
            toast.error('Import failed');
        } finally {
            setImporting(false);
        }
    };

    const downloadTemplate = () => {
        const headers = IMPORT_FIELDS[importModule].map((field) => field.key);
        const sample = IMPORT_FIELDS[importModule].map((field) => field.required ? `sample_${field.key}` : '');
        const blob = new Blob([`${headers.join(',')}\n${sample.join(',')}\n`], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${importModule.toLowerCase()}_import_template.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleSaveTelephony = async () => {
        try {
            await apiFetch('/integrations/telephony', {
                method: 'POST',
                body: JSON.stringify(telephony),
            });
            toast.success('Telephony settings saved');
        } catch {
            toast.error('Failed to save telephony settings');
        }
    };

    const handleTestClickToCall = async () => {
        try {
            const payload = await apiFetch('/integrations/telephony/click-to-call', {
                method: 'POST',
                body: JSON.stringify(testCall),
            });
            toast.success('Click-to-call payload generated');
            copyToClipboard(JSON.stringify(payload, null, 2));
        } catch {
            toast.error('Failed to generate click-to-call payload');
        }
    };

    return (
        <Box sx={{ p: 4 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
                Integrations
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
                Connect your CRM to external tools via Webhooks and CSV imports.
            </Typography>

            <Paper sx={{ mb: 2 }}>
                <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
                    <Tab label="Webhooks (Outbound)" icon={<WebhookIcon />} iconPosition="start" />
                    <Tab label="Inbound Capture" icon={<InfoIcon />} iconPosition="start" />
                    <Tab label="CSV Imports" icon={<ImportIcon />} iconPosition="start" />
                    <Tab label="Telephony" icon={<ExportIcon />} iconPosition="start" />
                </Tabs>
            </Paper>

            {activeTab === 0 && (
                <Stack spacing={2}>
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
                <Stack spacing={2}>
                    <Card variant="outlined">
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Lead Capture Webhook</Typography>
                            <Typography variant="body2" color="text.secondary" paragraph>
                                Use this endpoint to push leads into your CRM from external web forms (e.g., Elementor, Typeform).
                            </Typography>

                            <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 1, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Typography sx={{ fontSize: '0.875rem', fontFamily: 'monospace' }}>
                                    /api/integrations/inbound/leads/YOUR_TENANT_ID
                                </Typography>
                                <IconButton onClick={() => copyToClipboard('/api/integrations/inbound/leads/YOUR_TENANT_ID')}>
                                    <CopyIcon fontSize="small" />
                                </IconButton>
                            </Box>

                            <Alert severity="warning">
                                Send a POST body with at least <code>name</code>. Email, phone, company, source, and status are also accepted.
                            </Alert>
                        </CardContent>
                    </Card>
                </Stack>
            )}

            {activeTab === 2 && (
                <Stack spacing={2}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6">Recent Imports</Typography>
                        <Button variant="outlined" startIcon={<ImportIcon />} onClick={() => setIsImportOpen(true)}>
                            Import CSV
                        </Button>
                    </Box>

                    {imports.length === 0 ? (
                        <Alert severity="info">No recent imports found.</Alert>
                    ) : (
                        <Card variant="outlined">
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Module</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Created</TableCell>
                                        <TableCell>Updated</TableCell>
                                        <TableCell>Skipped</TableCell>
                                            <TableCell>Failed</TableCell>
                                            <TableCell>Errors</TableCell>
                                        </TableRow>
                                </TableHead>
                                <TableBody>
                                    {imports.map((job) => (
                                        <TableRow key={job.id}>
                                            <TableCell>{job.module}</TableCell>
                                            <TableCell><Chip size="small" label={job.status} /></TableCell>
                                            <TableCell>{job.stats?.created ?? 0}</TableCell>
                                            <TableCell>{job.stats?.updated ?? 0}</TableCell>
                                            <TableCell>{job.stats?.skipped ?? 0}</TableCell>
                                            <TableCell>{job.stats?.failed ?? 0}</TableCell>
                                            <TableCell>{job.errors?.slice(0, 2).map((error) => `Row ${error.row}: ${error.message}`).join(' | ') || '-'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </Card>
                    )}
                </Stack>
            )}

            {activeTab === 3 && (
                <Stack spacing={2}>
                    <Paper variant="outlined" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '260px 1fr' }, overflow: 'hidden' }}>
                        <Box sx={{ borderRight: { md: '1px solid' }, borderColor: 'divider', bgcolor: 'action.hover' }}>
                            {[
                                ['virtual', 'Virtual Numbers'],
                                ['route', 'Call Route API'],
                                ['agentPopup', 'Agent Popup API'],
                                ['callLog', 'Call Log API'],
                                ['click2call', 'Click 2 Call'],
                                ['disposition', 'Call Disposition'],
                                ['panel', 'Agent Panel'],
                                ['team', 'Team Assignment'],
                                ['mapping', 'User-Agent Mapping'],
                                ['status', 'Call Status Mapping'],
                            ].map(([key, label]) => (
                                <Button
                                    key={key}
                                    fullWidth
                                    onClick={() => setTelephonySection(key)}
                                    sx={{ justifyContent: 'flex-start', borderRadius: 0, px: 2, py: 1.25, color: telephonySection === key ? 'primary.main' : 'text.primary', bgcolor: telephonySection === key ? 'background.paper' : 'transparent', fontWeight: telephonySection === key ? 800 : 500 }}
                                >
                                    {label}
                                </Button>
                            ))}
                        </Box>
                        <Box sx={{ p: 2 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                                <Box>
                                    <Typography variant="h6" sx={{ fontWeight: 800 }}>Universal Telephony Connector</Typography>
                                    <Typography variant="body2" color="text.secondary">Configure call routing, click-to-call, logs, popups, dispositions, and provider mappings.</Typography>
                                </Box>
                                <FormControlLabel control={<Switch checked={telephony.isActive} onChange={(event) => setTelephony({ ...telephony, isActive: event.target.checked })} />} label="Enabled" />
                            </Stack>

                            {telephonySection === 'virtual' && (
                                <Stack spacing={1.5}>
                                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                                        <TextField size="small" label="Provider / Instance" value={telephony.provider} onChange={(event) => setTelephony({ ...telephony, provider: event.target.value })} fullWidth />
                                        <TextField size="small" label="Inbound Number" value={telephony.inboundNumber} onChange={(event) => setTelephony({ ...telephony, inboundNumber: event.target.value })} fullWidth />
                                        <TextField size="small" label="Outbound Caller ID" value={telephony.outboundCallerId} onChange={(event) => setTelephony({ ...telephony, outboundCallerId: event.target.value })} fullWidth />
                                    </Stack>
                                    <TextField size="small" label="Default Agent Number" value={telephony.defaultAgentNumber} onChange={(event) => setTelephony({ ...telephony, defaultAgentNumber: event.target.value })} />
                                    <TextField size="small" label="Webhook Secret" value={telephony.webhookSecret} onChange={(event) => setTelephony({ ...telephony, webhookSecret: event.target.value })} type="password" />
                                </Stack>
                            )}

                            {telephonySection === 'route' && (
                                <Stack spacing={1.5}>
                                    <Alert severity="info">Call Route API gives your telephony provider the lead or opportunity owner for inbound routing.</Alert>
                                    <ApiBox value="/api/integrations/telephony/agent-popup?phoneNumber=@IncomingPhone" onCopy={copyToClipboard} />
                                </Stack>
                            )}

                            {telephonySection === 'agentPopup' && (
                                <Stack spacing={1.5}>
                                    <ApiBox value="/api/integrations/telephony/agent-popup?phoneNumber=@IncomingPhone" onCopy={copyToClipboard} />
                                    <FormControlLabel control={<Checkbox checked={telephony.enableAgentPopup} onChange={(event) => setTelephony({ ...telephony, enableAgentPopup: event.target.checked })} />} label="Enable phone call popup for users" />
                                    <FormControlLabel control={<Checkbox checked={telephony.hideAgentPopupClose} onChange={(event) => setTelephony({ ...telephony, hideAgentPopupClose: event.target.checked })} />} label="Hide close option on popup" />
                                    <FormControlLabel control={<Checkbox checked={telephony.useExternalAgentPopupUrl} onChange={(event) => setTelephony({ ...telephony, useExternalAgentPopupUrl: event.target.checked })} />} label="Use external popup URL" />
                                    <TextField size="small" label="External Agent Popup URL" value={telephony.agentPopupUrl} onChange={(event) => setTelephony({ ...telephony, agentPopupUrl: event.target.value })} />
                                </Stack>
                            )}

                            {telephonySection === 'callLog' && (
                                <Stack spacing={1.5}>
                                    <Alert severity="info">Providers can POST completed inbound/outbound calls here. Calls are logged as Call activities when lead or opportunity ids are supplied.</Alert>
                                    <ApiBox value="/api/integrations/telephony/webhook" onCopy={copyToClipboard} />
                                </Stack>
                            )}

                            {telephonySection === 'click2call' && (
                                <Stack spacing={1.5}>
                                    <Alert severity="info">Use mail-merge tokens like @AgentNumberWithoutCC, @agentEmail, @leadPhone, @LeadId, and @LeadName in URL, headers, or body.</Alert>
                                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                                        <FormControl size="small" fullWidth>
                                            <InputLabel>Method</InputLabel>
                                            <Select label="Method" value={telephony.clickToCallMode} onChange={(event) => setTelephony({ ...telephony, clickToCallMode: event.target.value })}>
                                                <MenuItem value="SERVER">Server Side API</MenuItem>
                                                <MenuItem value="CLIENT">Client Side Script</MenuItem>
                                            </Select>
                                        </FormControl>
                                        <FormControl size="small" fullWidth>
                                            <InputLabel>HTTP Method</InputLabel>
                                            <Select label="HTTP Method" value={telephony.clickToCallMethod} onChange={(event) => setTelephony({ ...telephony, clickToCallMethod: event.target.value })}>
                                                <MenuItem value="GET">GET</MenuItem>
                                                <MenuItem value="POST">POST</MenuItem>
                                            </Select>
                                        </FormControl>
                                        <TextField size="small" label="Response Keyword" value={telephony.clickToCallResponseKeyword} onChange={(event) => setTelephony({ ...telephony, clickToCallResponseKeyword: event.target.value })} fullWidth />
                                    </Stack>
                                    <TextField size="small" label="Click-to-call URL" value={telephony.clickToCallUrl} onChange={(event) => setTelephony({ ...telephony, clickToCallUrl: event.target.value })} />
                                    <TextField size="small" label="Data Template" value={telephony.clickToCallTemplate} onChange={(event) => setTelephony({ ...telephony, clickToCallTemplate: event.target.value })} multiline minRows={4} />
                                </Stack>
                            )}

                            {telephonySection === 'disposition' && (
                                <Stack spacing={1.5}>
                                    <Alert severity="info">Disposition can send one lead-field value to your provider after the call ends.</Alert>
                                    <TextField size="small" label="Disposition URL" value={telephony.callDispositionUrl} onChange={(event) => setTelephony({ ...telephony, callDispositionUrl: event.target.value })} />
                                    <TextField size="small" label="Disposition Template" value={telephony.callDispositionTemplate} onChange={(event) => setTelephony({ ...telephony, callDispositionTemplate: event.target.value })} multiline minRows={3} />
                                </Stack>
                            )}

                            {telephonySection === 'panel' && (
                                <Stack spacing={1.5}>
                                    <TextField size="small" label="Agent Panel URL" value={telephony.agentPanelUrl} onChange={(event) => setTelephony({ ...telephony, agentPanelUrl: event.target.value })} />
                                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                                        <TextField size="small" label="Panel Title" value={telephony.agentPanelTitle} onChange={(event) => setTelephony({ ...telephony, agentPanelTitle: event.target.value })} fullWidth />
                                        <TextField size="small" label="Width" value={telephony.agentPanelWidth} onChange={(event) => setTelephony({ ...telephony, agentPanelWidth: event.target.value })} fullWidth />
                                        <TextField size="small" label="Height" value={telephony.agentPanelHeight} onChange={(event) => setTelephony({ ...telephony, agentPanelHeight: event.target.value })} fullWidth />
                                    </Stack>
                                    <TextField size="small" label="iFrame Permissions" value={telephony.agentPanelPermissions} onChange={(event) => setTelephony({ ...telephony, agentPanelPermissions: event.target.value })} />
                                </Stack>
                            )}

                            {telephonySection === 'team' && (
                                <Stack spacing={1.5}>
                                    <FormControlLabel control={<Switch checked={telephony.enableTeamAssignment} onChange={(event) => setTelephony({ ...telephony, enableTeamAssignment: event.target.checked })} />} label="Enable team-based telephony assignment" />
                                    <Alert severity="info">When enabled, agent panels and provider mappings can be scoped by team assignment.</Alert>
                                </Stack>
                            )}

                            {telephonySection === 'mapping' && (
                                <Stack spacing={1}>
                                    <Typography variant="body2" color="text.secondary">Map CRM users to provider agent identifiers used in Call Log and Agent Popup payloads.</Typography>
                                    <TextField size="small" label="Mappings JSON" value={JSON.stringify(telephony.userAgentMappings ?? [], null, 2)} onChange={(event) => {
                                        try { setTelephony({ ...telephony, userAgentMappings: JSON.parse(event.target.value || '[]') }); } catch { setTelephony({ ...telephony, userAgentMappingsRaw: event.target.value }); }
                                    }} multiline minRows={6} />
                                </Stack>
                            )}

                            {telephonySection === 'status' && (
                                <Stack spacing={1}>
                                    <Typography variant="body2" color="text.secondary">Map provider raw statuses to CRM statuses.</Typography>
                                    {Object.entries(telephony.callStatusMappings ?? {}).map(([key, value]) => (
                                        <Stack key={key} direction="row" spacing={1}>
                                            <TextField size="small" label="Provider Status" value={key} disabled fullWidth />
                                            <TextField size="small" label="CRM Status" value={String(value)} onChange={(event) => setTelephony({ ...telephony, callStatusMappings: { ...(telephony.callStatusMappings ?? {}), [key]: event.target.value } })} fullWidth />
                                        </Stack>
                                    ))}
                                </Stack>
                            )}

                            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
                                <Button variant="contained" onClick={handleSaveTelephony}>Save Telephony</Button>
                            </Stack>
                        </Box>
                    </Paper>

                    <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <PhoneIcon fontSize="small" />
                                <Typography fontWeight={700}>Click-to-call test</Typography>
                            </Stack>
                        </AccordionSummary>
                        <AccordionDetails>
                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                                <TextField size="small" label="Phone Number" value={testCall.phoneNumber} onChange={(event) => setTestCall({ ...testCall, phoneNumber: event.target.value })} fullWidth />
                                <TextField size="small" label="Lead ID" value={testCall.leadId} onChange={(event) => setTestCall({ ...testCall, leadId: event.target.value })} fullWidth />
                                <Button variant="outlined" onClick={handleTestClickToCall} sx={{ whiteSpace: 'nowrap' }}>Generate Payload</Button>
                            </Stack>
                        </AccordionDetails>
                    </Accordion>

                    <Card variant="outlined">
                        <CardContent>
                            <Typography variant="h6" sx={{ mb: 1 }}>Recent Call Logs</Typography>
                            {callLogs.length === 0 ? <Alert severity="info">No call logs yet.</Alert> : (
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Direction</TableCell>
                                            <TableCell>From</TableCell>
                                            <TableCell>To</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell>Duration</TableCell>
                                            <TableCell>Started</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {callLogs.map((call) => (
                                            <TableRow key={call.id}>
                                                <TableCell>{call.direction}</TableCell>
                                                <TableCell>{call.fromNumber || '-'}</TableCell>
                                                <TableCell>{call.toNumber || '-'}</TableCell>
                                                <TableCell><Chip size="small" label={call.status} /></TableCell>
                                                <TableCell>{call.duration ? `${call.duration}s` : '-'}</TableCell>
                                                <TableCell>{call.startedAt ? new Date(call.startedAt).toLocaleString() : '-'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </Stack>
            )}

            {/* Add Webhook Dialog */}
            <Dialog open={isAddingWebhook} onClose={() => setIsAddingWebhook(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Add Webhook Subscription</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
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

            <Dialog open={isImportOpen} onClose={() => setIsImportOpen(false)} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
                <DialogTitle>Import CSV</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr auto auto' }, gap: 1.5, alignItems: 'center' }}>
                            <FormControl size="small" fullWidth>
                                <InputLabel>Module</InputLabel>
                                <Select value={importModule} label="Module" onChange={(event) => { setImportModule(event.target.value as any); setCsvHeaders([]); setCsvRows([]); setMappings({}); }}>
                                    <MenuItem value="LEAD">Leads</MenuItem>
                                    <MenuItem value="OPPORTUNITY">Opportunities</MenuItem>
                                    <MenuItem value="ACTIVITY">Activities</MenuItem>
                                </Select>
                            </FormControl>
                            <FormControl size="small" fullWidth>
                                <InputLabel>Duplicates</InputLabel>
                                <Select value={duplicateMode} label="Duplicates" onChange={(event) => setDuplicateMode(event.target.value as any)}>
                                    <MenuItem value="SKIP">Skip matching records</MenuItem>
                                    <MenuItem value="UPDATE">Update matching records</MenuItem>
                                    <MenuItem value="CREATE">Always create</MenuItem>
                                </Select>
                            </FormControl>
                            <Button component="label" variant="outlined" startIcon={<ImportIcon />} sx={{ whiteSpace: 'nowrap' }}>
                                Choose CSV
                                <input hidden type="file" accept=".csv,text/csv" onChange={(event) => handleCsvFile(event.target.files?.[0] ?? null)} />
                            </Button>
                            <Button variant="text" startIcon={<ExportIcon />} onClick={downloadTemplate} sx={{ whiteSpace: 'nowrap' }}>
                                Template
                            </Button>
                        </Box>

                        {csvHeaders.length > 0 && (
                            <>
                                <Alert severity="info" variant="outlined">
                                    {csvRows.length} rows detected. Map each CSV column to a {importModule.toLowerCase()} field before importing.
                                </Alert>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>CSV Column</TableCell>
                                            <TableCell>CRM Field</TableCell>
                                            <TableCell>Sample Value</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {csvHeaders.map((header) => (
                                            <TableRow key={header}>
                                                <TableCell>{header}</TableCell>
                                                <TableCell sx={{ minWidth: 220 }}>
                                                    <FormControl size="small" fullWidth>
                                                        <Select value={mappings[header] ?? ''} onChange={(event) => setMappings({ ...mappings, [header]: event.target.value })} displayEmpty>
                                                            <MenuItem value="">Do not import</MenuItem>
                                                            {IMPORT_FIELDS[importModule].map((field) => (
                                                                <MenuItem key={field.key} value={field.key}>
                                                                    {field.label}{field.required ? ' *' : ''}
                                                                </MenuItem>
                                                            ))}
                                                        </Select>
                                                    </FormControl>
                                                </TableCell>
                                                <TableCell>{csvRows[0]?.[header]}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsImportOpen(false)}>Cancel</Button>
                    <Button variant="contained" disabled={importing || csvRows.length === 0} onClick={handleRunImport}>
                        {importing ? 'Importing...' : 'Run Import'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
