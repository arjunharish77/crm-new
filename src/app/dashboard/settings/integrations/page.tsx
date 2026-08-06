'use client';

import { useState, useEffect } from 'react';
import {
    Webhook as WebhookIcon,
    Upload,
    Download,
    Plus,
    Trash2,
    CheckCircle2,
    Ban,
    Copy,
    Info,
    AlertTriangle,
    Phone,
    Loader2,
    Mail,
    MessageSquareText,
    Send,
    Share2,
    Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
} from '@/components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from '@/components/ui/accordion';
import { StandardDialog } from '@/components/common/standard-dialog';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { formatWorkspaceDateTime } from '@/lib/date-format';
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

type CommunicationChannel = 'EMAIL' | 'WHATSAPP' | 'SMS';

interface CommunicationProvider {
    id?: string;
    name: string;
    channel: CommunicationChannel;
    providerType: string;
    isActive: boolean;
    defaultFromName?: string;
    defaultFromAddress?: string;
    publicConfig?: Record<string, any>;
    secretConfig?: Record<string, any>;
    rateLimitPerMinute?: number;
}

interface CommunicationTemplate {
    id?: string;
    name: string;
    channel: CommunicationChannel;
    category: string;
    subject?: string;
    body: string;
    tokens?: string[];
    isActive: boolean;
}

interface CommunicationOutboxItem {
    id: string;
    channel: CommunicationChannel;
    recipientAddress: string;
    subject?: string;
    status: string;
    attempts: number;
    error?: string;
    createdAt: string;
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

interface ExternalIntegration {
    id?: string;
    name: string;
    targetSystem: string;
    endpointUrl: string;
    httpMethod: string;
    authType: 'NONE' | 'API_KEY_HEADER' | 'API_KEY_QUERY' | 'BEARER' | 'BASIC';
    config: {
        payloadTemplate: string;
        apiKeyHeaderName?: string;
        apiKeyQueryParamName?: string;
    };
    secretConfig?: {
        apiKey?: string;
        bearerToken?: string;
        basicUsername?: string;
        basicPassword?: string;
    };
    isActive: boolean;
}

const DEFAULT_EXTERNAL_INTEGRATION: ExternalIntegration = {
    name: '',
    targetSystem: '',
    endpointUrl: '',
    httpMethod: 'POST',
    authType: 'NONE',
    config: { payloadTemplate: '{\n  "name": "{{lead.name}}",\n  "email": "{{lead.email}}",\n  "phone": "{{lead.phone}}"\n}' },
    secretConfig: {},
    isActive: true,
};

// Radix Select rejects an empty-string item value, so "no selection" is
// represented with this sentinel and translated back to '' at the call site.
const NONE_VALUE = '__none__';
const CHANNELS: { value: CommunicationChannel; label: string; icon: typeof Mail }[] = [
    { value: 'EMAIL', label: 'Email', icon: Mail },
    { value: 'WHATSAPP', label: 'WhatsApp', icon: MessageSquareText },
    { value: 'SMS', label: 'SMS', icon: Send },
];

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
        <div className="flex items-center justify-between gap-2 rounded-md bg-muted p-3">
            <span className="break-all font-mono text-[0.8rem]">{value}</span>
            <Button variant="ghost" size="icon" onClick={() => onCopy(value)}>
                <Copy className="size-4" />
            </Button>
        </div>
    );
}

function FieldInput({
    label,
    value,
    onChange,
    type = 'text',
    disabled = false,
    className,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    type?: string;
    disabled?: boolean;
    className?: string;
}) {
    return (
        <div className={cn('space-y-1.5', className)}>
            <Label>{label}</Label>
            <Input type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
        </div>
    );
}

function FieldTextarea({
    label,
    value,
    onChange,
    rows = 4,
    className,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    rows?: number;
    className?: string;
}) {
    return (
        <div className={cn('space-y-1.5', className)}>
            <Label>{label}</Label>
            <Textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} className="font-mono text-sm" />
        </div>
    );
}

export default function IntegrationsSettingsPage() {
    const [activeTab, setActiveTab] = useState(0);
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [imports, setImports] = useState<ImportJob[]>([]);
    const [communicationProviders, setCommunicationProviders] = useState<CommunicationProvider[]>([]);
    const [communicationTemplates, setCommunicationTemplates] = useState<CommunicationTemplate[]>([]);
    const [communicationOutbox, setCommunicationOutbox] = useState<CommunicationOutboxItem[]>([]);
    const [communicationChannel, setCommunicationChannel] = useState<CommunicationChannel>('EMAIL');
    const [communicationProvider, setCommunicationProvider] = useState<CommunicationProvider>({
        name: 'Primary Email',
        channel: 'EMAIL',
        providerType: 'SMTP',
        isActive: true,
        defaultFromName: '',
        defaultFromAddress: '',
        publicConfig: { host: '', port: 587, secure: false },
        secretConfig: { username: '', password: '' },
        rateLimitPerMinute: 60,
    });
    const [communicationTemplate, setCommunicationTemplate] = useState<CommunicationTemplate>({
        name: 'Lead Follow-up',
        channel: 'EMAIL',
        category: 'NURTURE',
        subject: 'Next steps for {{leadName}}',
        body: 'Hi {{leadName}},\n\nThanks for your interest. Our team will help you with the next step.',
        tokens: ['leadName'],
        isActive: true,
    });
    const [savingCommunication, setSavingCommunication] = useState(false);
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
    const [externalIntegrations, setExternalIntegrations] = useState<ExternalIntegration[]>([]);
    const [externalIntegrationDraft, setExternalIntegrationDraft] = useState<ExternalIntegration>(DEFAULT_EXTERNAL_INTEGRATION);
    const [editingExternalIntegrationId, setEditingExternalIntegrationId] = useState<string | null>(null);
    const [savingExternalIntegration, setSavingExternalIntegration] = useState(false);

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
            Promise.all([
                apiFetch('/communications/providers'),
                apiFetch('/communications/templates'),
                apiFetch('/communications/outbox'),
            ])
                .then(([providers, templates, outbox]) => {
                    setCommunicationProviders(Array.isArray(providers) ? providers : []);
                    setCommunicationTemplates(Array.isArray(templates) ? templates : []);
                    setCommunicationOutbox(Array.isArray(outbox) ? outbox : []);
                })
                .catch(() => undefined);
            apiFetch('/settings/integrations/external')
                .then((data) => setExternalIntegrations(Array.isArray(data) ? data : []))
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
        const mappedTargets = Object.values(mappings).filter((value) => typeof value === "string" && value.length > 0);
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

    const selectCommunicationChannel = (channel: CommunicationChannel) => {
        setCommunicationChannel(channel);
        const existingProvider = communicationProviders.find((provider) => provider.channel === channel);
        const existingTemplate = communicationTemplates.find((template) => template.channel === channel);
        setCommunicationProvider(existingProvider ?? {
            name: channel === 'EMAIL' ? 'Primary Email' : channel === 'WHATSAPP' ? 'Primary WhatsApp' : 'Primary SMS',
            channel,
            providerType: channel === 'EMAIL' ? 'SMTP' : 'HTTP',
            isActive: true,
            defaultFromName: '',
            defaultFromAddress: '',
            publicConfig: channel === 'EMAIL'
                ? { host: '', port: 587, secure: false }
                : { url: '', method: 'POST', headers: {}, bodyTemplate: '{ "to": "{{to}}", "message": "{{body}}" }' },
            secretConfig: channel === 'EMAIL' ? { username: '', password: '' } : { token: '' },
            rateLimitPerMinute: channel === 'EMAIL' ? 60 : 30,
        });
        setCommunicationTemplate(existingTemplate ?? {
            name: channel === 'EMAIL' ? 'Lead Follow-up' : channel === 'WHATSAPP' ? 'WhatsApp Nurture' : 'SMS Nurture',
            channel,
            category: 'NURTURE',
            subject: channel === 'EMAIL' ? 'Next steps for {{leadName}}' : '',
            body: channel === 'SMS'
                ? 'Hi {{leadName}}, thanks for your interest. Our team will call you soon.'
                : 'Hi {{leadName}},\n\nThanks for your interest. Our team will help you with the next step.',
            tokens: ['leadName'],
            isActive: true,
        });
    };

    const updateCommunicationJson = (
        key: 'publicConfig' | 'secretConfig',
        value: string,
        fallback: Record<string, any> = {},
    ) => {
        try {
            setCommunicationProvider({ ...communicationProvider, [key]: JSON.parse(value || '{}') });
        } catch {
            setCommunicationProvider({ ...communicationProvider, [key]: fallback, [`${key}Raw`]: value } as any);
        }
    };

    const handleSaveCommunicationProvider = async () => {
        setSavingCommunication(true);
        try {
            const saved = await apiFetch('/communications/providers', {
                method: 'PUT',
                body: JSON.stringify(communicationProvider),
            });
            setCommunicationProviders((current) => [
                saved,
                ...current.filter((provider) => provider.id !== saved.id && !(provider.channel === saved.channel && provider.name === saved.name)),
            ]);
            setCommunicationProvider(saved);
            toast.success('Messaging connector saved');
        } catch {
            toast.error('Failed to save messaging connector');
        } finally {
            setSavingCommunication(false);
        }
    };

    const startEditingExternalIntegration = (integration: ExternalIntegration) => {
        setEditingExternalIntegrationId(integration.id ?? null);
        setExternalIntegrationDraft({
            ...integration,
            targetSystem: integration.targetSystem ?? '',
            config: integration.config ?? { payloadTemplate: '{}' },
            secretConfig: {},
        });
    };

    const startNewExternalIntegration = () => {
        setEditingExternalIntegrationId(null);
        setExternalIntegrationDraft(DEFAULT_EXTERNAL_INTEGRATION);
    };

    const handleSaveExternalIntegration = async () => {
        if (!externalIntegrationDraft.name.trim() || !externalIntegrationDraft.endpointUrl.trim()) {
            toast.error('Name and endpoint URL are required');
            return;
        }
        setSavingExternalIntegration(true);
        try {
            const saved = editingExternalIntegrationId
                ? await apiFetch(`/settings/integrations/external/${editingExternalIntegrationId}`, {
                    method: 'PATCH',
                    body: JSON.stringify(externalIntegrationDraft),
                })
                : await apiFetch('/settings/integrations/external', {
                    method: 'POST',
                    body: JSON.stringify(externalIntegrationDraft),
                });
            setExternalIntegrations((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
            startEditingExternalIntegration(saved);
            toast.success('Integration saved');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to save integration');
        } finally {
            setSavingExternalIntegration(false);
        }
    };

    const handleDeleteExternalIntegration = async (id: string) => {
        if (!confirm('Delete this integration? Past push history is kept for audit purposes.')) return;
        try {
            await apiFetch(`/settings/integrations/external/${id}`, { method: 'DELETE' });
            setExternalIntegrations((current) => current.filter((item) => item.id !== id));
            if (editingExternalIntegrationId === id) startNewExternalIntegration();
            toast.success('Integration deleted');
        } catch {
            toast.error('Failed to delete integration');
        }
    };

    const handleSaveCommunicationTemplate = async () => {
        setSavingCommunication(true);
        try {
            const saved = await apiFetch('/communications/templates', {
                method: 'PUT',
                body: JSON.stringify(communicationTemplate),
            });
            setCommunicationTemplates((current) => [
                saved,
                ...current.filter((template) => template.id !== saved.id && !(template.channel === saved.channel && template.name === saved.name)),
            ]);
            setCommunicationTemplate(saved);
            toast.success('Messaging template saved');
        } catch {
            toast.error('Failed to save messaging template');
        } finally {
            setSavingCommunication(false);
        }
    };

    return (
        <div className="p-8">
            <h1 className="text-lg font-bold">Integrations</h1>
            <p className="mb-4 text-muted-foreground">
                Connect your CRM to external tools via Webhooks and CSV imports.
            </p>

            <Tabs value={String(activeTab)} onValueChange={(value) => setActiveTab(Number(value))}>
                <TabsList className="mb-4">
                    <TabsTrigger value="0">
                        <WebhookIcon className="size-4" />
                        Webhooks (Outbound)
                    </TabsTrigger>
                    <TabsTrigger value="1">
                        <Info className="size-4" />
                        Inbound Capture
                    </TabsTrigger>
                    <TabsTrigger value="2">
                        <Upload className="size-4" />
                        CSV Imports
                    </TabsTrigger>
                    <TabsTrigger value="3">
                        <Download className="size-4" />
                        Telephony
                    </TabsTrigger>
                    <TabsTrigger value="4">
                        <MessageSquareText className="size-4" />
                        Messaging
                    </TabsTrigger>
                    <TabsTrigger value="5">
                        <Share2 className="size-4" />
                        External Push
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="0" className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Webhook Subscriptions</h2>
                        <Button onClick={() => setIsAddingWebhook(true)}>
                            <Plus className="size-4" />
                            Add Webhook
                        </Button>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="size-6 animate-spin text-primary" />
                        </div>
                    ) : webhooks.length === 0 ? (
                        <Alert variant="info">
                            <Info />
                            <AlertDescription>No webhooks configured. Start by adding one to send events to external systems.</AlertDescription>
                        </Alert>
                    ) : (
                        <Card className="overflow-hidden py-0">
                            <div className="divide-y">
                                {webhooks.map((wh) => (
                                    <div key={wh.id} className="flex items-start justify-between gap-3 p-4">
                                        <div className="flex items-start gap-3">
                                            {wh.isActive ? (
                                                <CheckCircle2 className="mt-0.5 size-5 text-green-600" />
                                            ) : (
                                                <Ban className="mt-0.5 size-5 text-muted-foreground" />
                                            )}
                                            <div>
                                                <div className="font-medium">{wh.name}</div>
                                                <div className="text-xs text-muted-foreground">{wh.url}</div>
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    {wh.events.map((ev) => (
                                                        <Badge key={ev} variant="outline">{ev}</Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={() => handleDeleteWebhook(wh.id)}>
                                            <Trash2 className="size-4 text-destructive" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="1" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Lead Capture Webhook</CardTitle>
                            <CardDescription>
                                Use this endpoint to push leads into your CRM from external web forms (e.g., Elementor, Typeform).
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <ApiBox value="/api/integrations/inbound/leads/YOUR_TENANT_ID" onCopy={copyToClipboard} />

                            <Alert>
                                <AlertTriangle className="text-amber-600" />
                                <AlertDescription>
                                    Send a POST body with at least <code>name</code>. Email, phone, company, source, and status are also accepted.
                                </AlertDescription>
                            </Alert>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="2" className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Recent Imports</h2>
                        <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                            <Upload className="size-4" />
                            Import CSV
                        </Button>
                    </div>

                    {imports.length === 0 ? (
                        <Alert variant="info">
                            <Info />
                            <AlertDescription>No recent imports found.</AlertDescription>
                        </Alert>
                    ) : (
                        <Card className="overflow-hidden py-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Module</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Created</TableHead>
                                        <TableHead>Updated</TableHead>
                                        <TableHead>Skipped</TableHead>
                                        <TableHead>Failed</TableHead>
                                        <TableHead>Errors</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {imports.map((job) => (
                                        <TableRow key={job.id}>
                                            <TableCell>{job.module}</TableCell>
                                            <TableCell><Badge variant="secondary">{job.status}</Badge></TableCell>
                                            <TableCell>{job.stats?.created ?? 0}</TableCell>
                                            <TableCell>{job.stats?.updated ?? 0}</TableCell>
                                            <TableCell>{job.stats?.skipped ?? 0}</TableCell>
                                            <TableCell>{job.stats?.failed ?? 0}</TableCell>
                                            <TableCell className="whitespace-normal">
                                                {job.errors?.slice(0, 2).map((error) => `Row ${error.row}: ${error.message}`).join(' | ') || '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="3" className="space-y-4">
                    <Card className="overflow-hidden py-0">
                        <div className="grid md:grid-cols-[260px_1fr]">
                            <div className="border-b bg-muted/40 md:border-b-0 md:border-r">
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
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setTelephonySection(key)}
                                        className={cn(
                                            'block w-full px-4 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                            telephonySection === key
                                                ? 'bg-secondary font-bold text-secondary-foreground'
                                                : 'text-muted-foreground hover:bg-accent'
                                        )}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <div className="p-4">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-lg font-extrabold">Universal Telephony Connector</h3>
                                        <p className="text-sm text-muted-foreground">
                                            Configure call routing, click-to-call, logs, popups, dispositions, and provider mappings.
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={telephony.isActive}
                                            onCheckedChange={(checked) => setTelephony({ ...telephony, isActive: checked })}
                                        />
                                        <Label>Enabled</Label>
                                    </div>
                                </div>

                                {telephonySection === 'virtual' && (
                                    <div className="space-y-3">
                                        <div className="flex flex-col gap-3 md:flex-row">
                                            <FieldInput
                                                className="w-full"
                                                label="Provider / Instance"
                                                value={telephony.provider}
                                                onChange={(value) => setTelephony({ ...telephony, provider: value })}
                                            />
                                            <FieldInput
                                                className="w-full"
                                                label="Inbound Number"
                                                value={telephony.inboundNumber}
                                                onChange={(value) => setTelephony({ ...telephony, inboundNumber: value })}
                                            />
                                            <FieldInput
                                                className="w-full"
                                                label="Outbound Caller ID"
                                                value={telephony.outboundCallerId}
                                                onChange={(value) => setTelephony({ ...telephony, outboundCallerId: value })}
                                            />
                                        </div>
                                        <FieldInput
                                            label="Default Agent Number"
                                            value={telephony.defaultAgentNumber}
                                            onChange={(value) => setTelephony({ ...telephony, defaultAgentNumber: value })}
                                        />
                                        <FieldInput
                                            label="Webhook Secret"
                                            type="password"
                                            value={telephony.webhookSecret}
                                            onChange={(value) => setTelephony({ ...telephony, webhookSecret: value })}
                                        />
                                    </div>
                                )}

                                {telephonySection === 'route' && (
                                    <div className="space-y-3">
                                        <Alert variant="info">
                                            <Info />
                                            <AlertDescription>Call Route API gives your telephony provider the lead or opportunity owner for inbound routing.</AlertDescription>
                                        </Alert>
                                        <ApiBox value="/api/integrations/telephony/agent-popup?phoneNumber=@IncomingPhone" onCopy={copyToClipboard} />
                                    </div>
                                )}

                                {telephonySection === 'agentPopup' && (
                                    <div className="space-y-3">
                                        <ApiBox value="/api/integrations/telephony/agent-popup?phoneNumber=@IncomingPhone" onCopy={copyToClipboard} />
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                checked={telephony.enableAgentPopup}
                                                onCheckedChange={(checked) => setTelephony({ ...telephony, enableAgentPopup: checked === true })}
                                            />
                                            <Label>Enable phone call popup for users</Label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                checked={telephony.hideAgentPopupClose}
                                                onCheckedChange={(checked) => setTelephony({ ...telephony, hideAgentPopupClose: checked === true })}
                                            />
                                            <Label>Hide close option on popup</Label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                checked={telephony.useExternalAgentPopupUrl}
                                                onCheckedChange={(checked) => setTelephony({ ...telephony, useExternalAgentPopupUrl: checked === true })}
                                            />
                                            <Label>Use external popup URL</Label>
                                        </div>
                                        <FieldInput
                                            label="External Agent Popup URL"
                                            value={telephony.agentPopupUrl}
                                            onChange={(value) => setTelephony({ ...telephony, agentPopupUrl: value })}
                                        />
                                    </div>
                                )}

                                {telephonySection === 'callLog' && (
                                    <div className="space-y-3">
                                        <Alert variant="info">
                                            <Info />
                                            <AlertDescription>Providers can POST completed inbound/outbound calls here. Calls are logged as Call activities when lead or opportunity ids are supplied.</AlertDescription>
                                        </Alert>
                                        <ApiBox value="/api/integrations/telephony/webhook" onCopy={copyToClipboard} />
                                    </div>
                                )}

                                {telephonySection === 'click2call' && (
                                    <div className="space-y-3">
                                        <Alert variant="info">
                                            <Info />
                                            <AlertDescription>Use mail-merge tokens like @AgentNumberWithoutCC, @agentEmail, @leadPhone, @LeadId, and @LeadName in URL, headers, or body.</AlertDescription>
                                        </Alert>
                                        <div className="flex flex-col gap-3 md:flex-row">
                                            <div className="w-full space-y-1.5">
                                                <Label>Method</Label>
                                                <Select
                                                    value={telephony.clickToCallMode}
                                                    onValueChange={(value) => setTelephony({ ...telephony, clickToCallMode: value })}
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="SERVER">Server Side API</SelectItem>
                                                        <SelectItem value="CLIENT">Client Side Script</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="w-full space-y-1.5">
                                                <Label>HTTP Method</Label>
                                                <Select
                                                    value={telephony.clickToCallMethod}
                                                    onValueChange={(value) => setTelephony({ ...telephony, clickToCallMethod: value })}
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="GET">GET</SelectItem>
                                                        <SelectItem value="POST">POST</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <FieldInput
                                                className="w-full"
                                                label="Response Keyword"
                                                value={telephony.clickToCallResponseKeyword}
                                                onChange={(value) => setTelephony({ ...telephony, clickToCallResponseKeyword: value })}
                                            />
                                        </div>
                                        <FieldInput
                                            label="Click-to-call URL"
                                            value={telephony.clickToCallUrl}
                                            onChange={(value) => setTelephony({ ...telephony, clickToCallUrl: value })}
                                        />
                                        <FieldTextarea
                                            label="Data Template"
                                            rows={4}
                                            value={telephony.clickToCallTemplate}
                                            onChange={(value) => setTelephony({ ...telephony, clickToCallTemplate: value })}
                                        />
                                    </div>
                                )}

                                {telephonySection === 'disposition' && (
                                    <div className="space-y-3">
                                        <Alert variant="info">
                                            <Info />
                                            <AlertDescription>Disposition can send one lead-field value to your provider after the call ends.</AlertDescription>
                                        </Alert>
                                        <FieldInput
                                            label="Disposition URL"
                                            value={telephony.callDispositionUrl}
                                            onChange={(value) => setTelephony({ ...telephony, callDispositionUrl: value })}
                                        />
                                        <FieldTextarea
                                            label="Disposition Template"
                                            rows={3}
                                            value={telephony.callDispositionTemplate}
                                            onChange={(value) => setTelephony({ ...telephony, callDispositionTemplate: value })}
                                        />
                                    </div>
                                )}

                                {telephonySection === 'panel' && (
                                    <div className="space-y-3">
                                        <FieldInput
                                            label="Agent Panel URL"
                                            value={telephony.agentPanelUrl}
                                            onChange={(value) => setTelephony({ ...telephony, agentPanelUrl: value })}
                                        />
                                        <div className="flex flex-col gap-3 md:flex-row">
                                            <FieldInput
                                                className="w-full"
                                                label="Panel Title"
                                                value={telephony.agentPanelTitle}
                                                onChange={(value) => setTelephony({ ...telephony, agentPanelTitle: value })}
                                            />
                                            <FieldInput
                                                className="w-full"
                                                label="Width"
                                                value={telephony.agentPanelWidth}
                                                onChange={(value) => setTelephony({ ...telephony, agentPanelWidth: value })}
                                            />
                                            <FieldInput
                                                className="w-full"
                                                label="Height"
                                                value={telephony.agentPanelHeight}
                                                onChange={(value) => setTelephony({ ...telephony, agentPanelHeight: value })}
                                            />
                                        </div>
                                        <FieldInput
                                            label="iFrame Permissions"
                                            value={telephony.agentPanelPermissions}
                                            onChange={(value) => setTelephony({ ...telephony, agentPanelPermissions: value })}
                                        />
                                    </div>
                                )}

                                {telephonySection === 'team' && (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                checked={telephony.enableTeamAssignment}
                                                onCheckedChange={(checked) => setTelephony({ ...telephony, enableTeamAssignment: checked })}
                                            />
                                            <Label>Enable team-based telephony assignment</Label>
                                        </div>
                                        <Alert variant="info">
                                            <Info />
                                            <AlertDescription>When enabled, agent panels and provider mappings can be scoped by team assignment.</AlertDescription>
                                        </Alert>
                                    </div>
                                )}

                                {telephonySection === 'mapping' && (
                                    <div className="space-y-2">
                                        <p className="text-sm text-muted-foreground">Map CRM users to provider agent identifiers used in Call Log and Agent Popup payloads.</p>
                                        <FieldTextarea
                                            label="Mappings JSON"
                                            rows={6}
                                            value={JSON.stringify(telephony.userAgentMappings ?? [], null, 2)}
                                            onChange={(value) => {
                                                try { setTelephony({ ...telephony, userAgentMappings: JSON.parse(value || '[]') }); } catch { setTelephony({ ...telephony, userAgentMappingsRaw: value }); }
                                            }}
                                        />
                                    </div>
                                )}

                                {telephonySection === 'status' && (
                                    <div className="space-y-2">
                                        <p className="text-sm text-muted-foreground">Map provider raw statuses to CRM statuses.</p>
                                        {Object.entries(telephony.callStatusMappings ?? {}).map(([key, value]) => (
                                            <div key={key} className="flex gap-2">
                                                <FieldInput className="w-full" label="Provider Status" value={key} disabled onChange={() => undefined} />
                                                <FieldInput
                                                    className="w-full"
                                                    label="CRM Status"
                                                    value={String(value)}
                                                    onChange={(next) => setTelephony({ ...telephony, callStatusMappings: { ...(telephony.callStatusMappings ?? {}), [key]: next } })}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="mt-4 flex justify-end">
                                    <Button onClick={handleSaveTelephony}>Save Telephony</Button>
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Accordion type="single" collapsible>
                        <AccordionItem value="click-to-call-test" className="rounded-lg border px-4">
                            <AccordionTrigger>
                                <div className="flex items-center gap-2">
                                    <Phone className="size-4" />
                                    <span className="font-bold">Click-to-call test</span>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent>
                                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                                    <FieldInput
                                        className="w-full"
                                        label="Phone Number"
                                        value={testCall.phoneNumber}
                                        onChange={(value) => setTestCall({ ...testCall, phoneNumber: value })}
                                    />
                                    <FieldInput
                                        className="w-full"
                                        label="Lead ID"
                                        value={testCall.leadId}
                                        onChange={(value) => setTestCall({ ...testCall, leadId: value })}
                                    />
                                    <Button variant="outline" className="whitespace-nowrap" onClick={handleTestClickToCall}>
                                        Generate Payload
                                    </Button>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>

                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Call Logs</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {callLogs.length === 0 ? (
                                <Alert variant="info">
                                    <Info />
                                    <AlertDescription>No call logs yet.</AlertDescription>
                                </Alert>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Direction</TableHead>
                                            <TableHead>From</TableHead>
                                            <TableHead>To</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Duration</TableHead>
                                            <TableHead>Started</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {callLogs.map((call) => (
                                            <TableRow key={call.id}>
                                                <TableCell>{call.direction}</TableCell>
                                                <TableCell>{call.fromNumber || '-'}</TableCell>
                                                <TableCell>{call.toNumber || '-'}</TableCell>
                                                <TableCell><Badge variant="secondary">{call.status}</Badge></TableCell>
                                                <TableCell>{call.duration ? `${call.duration}s` : '-'}</TableCell>
                                                <TableCell>{formatWorkspaceDateTime(call.startedAt)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="4" className="space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">Messaging Connectors</h2>
                            <p className="text-sm text-muted-foreground">
                                Configure Email, WhatsApp, and SMS providers for nurturing, report schedules, and workflow sends.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {CHANNELS.map(({ value, label, icon: Icon }) => (
                                <Button
                                    key={value}
                                    type="button"
                                    variant={communicationChannel === value ? 'default' : 'outline'}
                                    onClick={() => selectCommunicationChannel(value)}
                                >
                                    <Icon className="size-4" />
                                    {label}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
                        <Card>
                            <CardHeader>
                                <CardTitle>{communicationChannel} Provider</CardTitle>
                                <CardDescription>
                                    Secrets are write-only. Leave secret JSON empty when updating non-secret settings.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-3 md:grid-cols-2">
                                    <FieldInput
                                        label="Connector Name"
                                        value={communicationProvider.name}
                                        onChange={(value) => setCommunicationProvider({ ...communicationProvider, name: value })}
                                    />
                                    <div className="space-y-1.5">
                                        <Label>Provider Type</Label>
                                        <Select
                                            value={communicationProvider.providerType}
                                            onValueChange={(value) => setCommunicationProvider({ ...communicationProvider, providerType: value })}
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {communicationChannel === 'EMAIL' && <SelectItem value="SMTP">SMTP</SelectItem>}
                                                <SelectItem value="HTTP">Generic HTTP API</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <FieldInput
                                        label="Default From Name"
                                        value={communicationProvider.defaultFromName ?? ''}
                                        onChange={(value) => setCommunicationProvider({ ...communicationProvider, defaultFromName: value })}
                                    />
                                    <FieldInput
                                        label={communicationChannel === 'EMAIL' ? 'From Email' : 'Sender / Number'}
                                        value={communicationProvider.defaultFromAddress ?? ''}
                                        onChange={(value) => setCommunicationProvider({ ...communicationProvider, defaultFromAddress: value })}
                                    />
                                    <FieldInput
                                        label="Rate Limit / Minute"
                                        type="number"
                                        value={String(communicationProvider.rateLimitPerMinute ?? '')}
                                        onChange={(value) => setCommunicationProvider({ ...communicationProvider, rateLimitPerMinute: Number(value || 0) })}
                                    />
                                    <div className="flex items-center gap-2 pt-7">
                                        <Switch
                                            checked={communicationProvider.isActive}
                                            onCheckedChange={(checked) => setCommunicationProvider({ ...communicationProvider, isActive: checked })}
                                        />
                                        <Label>Connector enabled</Label>
                                    </div>
                                </div>

                                <div className="grid gap-3 lg:grid-cols-2">
                                    <FieldTextarea
                                        label="Public Config JSON"
                                        rows={8}
                                        value={JSON.stringify(communicationProvider.publicConfig ?? {}, null, 2)}
                                        onChange={(value) => updateCommunicationJson('publicConfig', value, communicationProvider.publicConfig)}
                                    />
                                    <FieldTextarea
                                        label="Secret Config JSON"
                                        rows={8}
                                        value={JSON.stringify(communicationProvider.secretConfig ?? {}, null, 2)}
                                        onChange={(value) => updateCommunicationJson('secretConfig', value, communicationProvider.secretConfig)}
                                    />
                                </div>

                                <div className="flex justify-end">
                                    <Button disabled={savingCommunication} onClick={handleSaveCommunicationProvider}>
                                        {savingCommunication ? 'Saving...' : 'Save Connector'}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Saved Connectors</CardTitle>
                                <CardDescription>Active connectors are used by queues, workflows, and report schedules.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {communicationProviders.length === 0 ? (
                                    <Alert variant="info">
                                        <Info />
                                        <AlertDescription>No messaging connectors configured yet.</AlertDescription>
                                    </Alert>
                                ) : (
                                    communicationProviders.map((provider) => {
                                        const channel = CHANNELS.find((item) => item.value === provider.channel);
                                        const Icon = channel?.icon ?? MessageSquareText;
                                        return (
                                            <button
                                                key={provider.id ?? `${provider.channel}-${provider.name}`}
                                                type="button"
                                                onClick={() => {
                                                    setCommunicationChannel(provider.channel);
                                                    setCommunicationProvider({
                                                        ...provider,
                                                        secretConfig: {},
                                                    });
                                                }}
                                                className="flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors hover:bg-accent"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Icon className="size-4 text-primary" />
                                                    <div>
                                                        <div className="font-medium">{provider.name}</div>
                                                        <div className="text-xs text-muted-foreground">{provider.channel} / {provider.providerType}</div>
                                                    </div>
                                                </div>
                                                <Badge variant={provider.isActive ? 'default' : 'outline'}>
                                                    {provider.isActive ? 'Active' : 'Off'}
                                                </Badge>
                                            </button>
                                        );
                                    })
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
                        <Card>
                            <CardHeader>
                                <CardTitle>{communicationChannel} Template</CardTitle>
                                <CardDescription>Use double-brace tokens such as {'{{leadName}}'}, {'{{course}}'}, and {'{{ownerName}}'}.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-3 md:grid-cols-2">
                                    <FieldInput
                                        label="Template Name"
                                        value={communicationTemplate.name}
                                        onChange={(value) => setCommunicationTemplate({ ...communicationTemplate, name: value })}
                                    />
                                    <div className="space-y-1.5">
                                        <Label>Category</Label>
                                        <Select
                                            value={communicationTemplate.category}
                                            onValueChange={(value) => setCommunicationTemplate({ ...communicationTemplate, category: value })}
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="NURTURE">Nurture</SelectItem>
                                                <SelectItem value="TRANSACTIONAL">Transactional</SelectItem>
                                                <SelectItem value="REPORT">Report</SelectItem>
                                                <SelectItem value="AUTOMATION">Automation</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                {communicationChannel === 'EMAIL' && (
                                    <FieldInput
                                        label="Subject"
                                        value={communicationTemplate.subject ?? ''}
                                        onChange={(value) => setCommunicationTemplate({ ...communicationTemplate, subject: value })}
                                    />
                                )}
                                <FieldTextarea
                                    label="Message Body"
                                    rows={8}
                                    value={communicationTemplate.body}
                                    onChange={(value) => setCommunicationTemplate({ ...communicationTemplate, body: value })}
                                />
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex flex-wrap gap-1">
                                        {(communicationTemplate.tokens ?? []).map((token) => (
                                            <Badge key={token} variant="outline">{token}</Badge>
                                        ))}
                                    </div>
                                    <Button disabled={savingCommunication} onClick={handleSaveCommunicationTemplate}>
                                        {savingCommunication ? 'Saving...' : 'Save Template'}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Recent Deliveries</CardTitle>
                                <CardDescription>Queued report emails and workflow messages land here before provider delivery.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {communicationOutbox.length === 0 ? (
                                    <Alert variant="info">
                                        <Info />
                                        <AlertDescription>No delivery attempts yet.</AlertDescription>
                                    </Alert>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Channel</TableHead>
                                                <TableHead>Recipient</TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {communicationOutbox.slice(0, 8).map((item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell>{item.channel}</TableCell>
                                                    <TableCell className="max-w-[180px] truncate">{item.recipientAddress}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={item.status === 'FAILED' ? 'destructive' : item.status === 'SENT' ? 'default' : 'secondary'}>
                                                            {item.status}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="5" className="space-y-4">
                    <div>
                        <h2 className="text-lg font-semibold">External System Push</h2>
                        <p className="text-sm text-muted-foreground">
                            Push a Lead/Opportunity&apos;s data to an external system (e.g. LeadSquared) from its detail page.
                        </p>
                    </div>

                    <Alert variant="info">
                        <Info />
                        <AlertDescription>
                            Secret keys/tokens below are stored in plaintext -- there is no secret encryption anywhere
                            in this app today. Treat this tab like any other place credentials are typed in.
                        </AlertDescription>
                    </Alert>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                        <Card>
                            <CardHeader>
                                <CardTitle>{editingExternalIntegrationId ? 'Edit Integration' : 'New Integration'}</CardTitle>
                                <CardDescription>
                                    Use {'{{lead.field}}'} / {'{{opportunity.field}}'} tokens in the payload template -- they&apos;re
                                    substituted with real, typed values (e.g. {'{{lead.name}}'}, {'{{opportunity.amount}}'}).
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-3 md:grid-cols-2">
                                    <FieldInput
                                        label="Integration Name"
                                        value={externalIntegrationDraft.name}
                                        onChange={(value) => setExternalIntegrationDraft({ ...externalIntegrationDraft, name: value })}
                                    />
                                    <FieldInput
                                        label="Target System (optional)"
                                        value={externalIntegrationDraft.targetSystem}
                                        onChange={(value) => setExternalIntegrationDraft({ ...externalIntegrationDraft, targetSystem: value })}
                                    />
                                    <FieldInput
                                        label="Endpoint URL"
                                        className="md:col-span-2"
                                        value={externalIntegrationDraft.endpointUrl}
                                        onChange={(value) => setExternalIntegrationDraft({ ...externalIntegrationDraft, endpointUrl: value })}
                                    />
                                    <div className="space-y-1.5">
                                        <Label>HTTP Method</Label>
                                        <Select
                                            value={externalIntegrationDraft.httpMethod}
                                            onValueChange={(value) => setExternalIntegrationDraft({ ...externalIntegrationDraft, httpMethod: value })}
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="POST">POST</SelectItem>
                                                <SelectItem value="PUT">PUT</SelectItem>
                                                <SelectItem value="PATCH">PATCH</SelectItem>
                                                <SelectItem value="GET">GET</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Auth Type</Label>
                                        <Select
                                            value={externalIntegrationDraft.authType}
                                            onValueChange={(value) => setExternalIntegrationDraft({ ...externalIntegrationDraft, authType: value as ExternalIntegration['authType'] })}
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="NONE">None</SelectItem>
                                                <SelectItem value="API_KEY_HEADER">API Key (Header)</SelectItem>
                                                <SelectItem value="API_KEY_QUERY">API Key (Query Param)</SelectItem>
                                                <SelectItem value="BEARER">Bearer Token</SelectItem>
                                                <SelectItem value="BASIC">Basic Auth</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {externalIntegrationDraft.authType === 'API_KEY_HEADER' && (
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <FieldInput
                                            label="Header Name"
                                            value={externalIntegrationDraft.config.apiKeyHeaderName ?? 'X-API-Key'}
                                            onChange={(value) => setExternalIntegrationDraft({ ...externalIntegrationDraft, config: { ...externalIntegrationDraft.config, apiKeyHeaderName: value } })}
                                        />
                                        <FieldInput
                                            label="API Key"
                                            type="password"
                                            value={externalIntegrationDraft.secretConfig?.apiKey ?? ''}
                                            onChange={(value) => setExternalIntegrationDraft({ ...externalIntegrationDraft, secretConfig: { ...externalIntegrationDraft.secretConfig, apiKey: value } })}
                                        />
                                    </div>
                                )}
                                {externalIntegrationDraft.authType === 'API_KEY_QUERY' && (
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <FieldInput
                                            label="Query Param Name"
                                            value={externalIntegrationDraft.config.apiKeyQueryParamName ?? 'api_key'}
                                            onChange={(value) => setExternalIntegrationDraft({ ...externalIntegrationDraft, config: { ...externalIntegrationDraft.config, apiKeyQueryParamName: value } })}
                                        />
                                        <FieldInput
                                            label="API Key"
                                            type="password"
                                            value={externalIntegrationDraft.secretConfig?.apiKey ?? ''}
                                            onChange={(value) => setExternalIntegrationDraft({ ...externalIntegrationDraft, secretConfig: { ...externalIntegrationDraft.secretConfig, apiKey: value } })}
                                        />
                                    </div>
                                )}
                                {externalIntegrationDraft.authType === 'BEARER' && (
                                    <FieldInput
                                        label="Bearer Token"
                                        type="password"
                                        value={externalIntegrationDraft.secretConfig?.bearerToken ?? ''}
                                        onChange={(value) => setExternalIntegrationDraft({ ...externalIntegrationDraft, secretConfig: { ...externalIntegrationDraft.secretConfig, bearerToken: value } })}
                                    />
                                )}
                                {externalIntegrationDraft.authType === 'BASIC' && (
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <FieldInput
                                            label="Username"
                                            value={externalIntegrationDraft.secretConfig?.basicUsername ?? ''}
                                            onChange={(value) => setExternalIntegrationDraft({ ...externalIntegrationDraft, secretConfig: { ...externalIntegrationDraft.secretConfig, basicUsername: value } })}
                                        />
                                        <FieldInput
                                            label="Password"
                                            type="password"
                                            value={externalIntegrationDraft.secretConfig?.basicPassword ?? ''}
                                            onChange={(value) => setExternalIntegrationDraft({ ...externalIntegrationDraft, secretConfig: { ...externalIntegrationDraft.secretConfig, basicPassword: value } })}
                                        />
                                    </div>
                                )}
                                {editingExternalIntegrationId && (
                                    <p className="text-xs text-muted-foreground">
                                        Secret fields are write-only and shown blank here -- leave blank to keep the saved value.
                                    </p>
                                )}

                                <FieldTextarea
                                    label="Payload Template (JSON)"
                                    rows={8}
                                    value={externalIntegrationDraft.config.payloadTemplate}
                                    onChange={(value) => setExternalIntegrationDraft({ ...externalIntegrationDraft, config: { ...externalIntegrationDraft.config, payloadTemplate: value } })}
                                />

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={externalIntegrationDraft.isActive}
                                            onCheckedChange={(checked) => setExternalIntegrationDraft({ ...externalIntegrationDraft, isActive: checked })}
                                        />
                                        <Label>Integration enabled</Label>
                                    </div>
                                    <div className="flex gap-2">
                                        {editingExternalIntegrationId && (
                                            <Button variant="outline" onClick={startNewExternalIntegration}>New</Button>
                                        )}
                                        <Button disabled={savingExternalIntegration} onClick={handleSaveExternalIntegration}>
                                            {savingExternalIntegration ? 'Saving...' : editingExternalIntegrationId ? 'Update Integration' : 'Create Integration'}
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Configured Integrations</CardTitle>
                                <CardDescription>Shown as a &quot;Push to...&quot; action on Lead and Opportunity detail pages.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {externalIntegrations.length === 0 ? (
                                    <Alert variant="info">
                                        <Info />
                                        <AlertDescription>No external integrations configured yet.</AlertDescription>
                                    </Alert>
                                ) : (
                                    externalIntegrations.map((integration) => (
                                        <div key={integration.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                                            <div>
                                                <div className="font-medium">{integration.name}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {integration.httpMethod} {integration.endpointUrl}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Badge variant={integration.isActive ? 'default' : 'outline'}>
                                                    {integration.isActive ? 'Active' : 'Off'}
                                                </Badge>
                                                <Button variant="ghost" size="icon" onClick={() => startEditingExternalIntegration(integration)}>
                                                    <Pencil className="size-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDeleteExternalIntegration(integration.id!)}>
                                                    <Trash2 className="size-4 text-destructive" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>

            {/* Add Webhook Dialog */}
            <StandardDialog
                open={isAddingWebhook}
                onClose={() => setIsAddingWebhook(false)}
                title="Add Webhook Subscription"
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="outline" onClick={() => setIsAddingWebhook(false)}>Cancel</Button>
                        <Button onClick={handleAddWebhook}>Create Webhook</Button>
                    </>
                }
            >
                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label>Webhook Name</Label>
                        <Input
                            value={newWebhook.name}
                            onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })}
                            placeholder="e.g. My Zapier Lead Webhook"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Destination URL</Label>
                        <Input
                            value={newWebhook.url}
                            onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
                            placeholder="https://hooks.zapier.com/..."
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Secret (Optional)</Label>
                        <Input
                            type="password"
                            value={newWebhook.secret}
                            onChange={(e) => setNewWebhook({ ...newWebhook, secret: e.target.value })}
                            placeholder="HMAC Signing Secret"
                        />
                    </div>
                </div>
            </StandardDialog>

            {/* Import CSV Dialog */}
            <StandardDialog
                open={isImportOpen}
                onClose={() => setIsImportOpen(false)}
                title="Import CSV"
                maxWidth="lg"
                actions={
                    <>
                        <Button variant="outline" onClick={() => setIsImportOpen(false)}>Cancel</Button>
                        <Button disabled={importing || csvRows.length === 0} onClick={handleRunImport}>
                            {importing ? 'Importing...' : 'Run Import'}
                        </Button>
                    </>
                }
            >
                <div className="space-y-4 py-2">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
                        <div className="space-y-1.5">
                            <Label>Module</Label>
                            <Select
                                value={importModule}
                                onValueChange={(value) => { setImportModule(value as any); setCsvHeaders([]); setCsvRows([]); setMappings({}); }}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="LEAD">Leads</SelectItem>
                                    <SelectItem value="OPPORTUNITY">Opportunities</SelectItem>
                                    <SelectItem value="ACTIVITY">Activities</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Duplicates</Label>
                            <Select value={duplicateMode} onValueChange={(value) => setDuplicateMode(value as any)}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="SKIP">Skip matching records</SelectItem>
                                    <SelectItem value="UPDATE">Update matching records</SelectItem>
                                    <SelectItem value="CREATE">Always create</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button asChild variant="outline" className="whitespace-nowrap">
                            <label className="cursor-pointer">
                                <Upload className="size-4" />
                                Choose CSV
                                <input
                                    type="file"
                                    accept=".csv,text/csv"
                                    className="hidden"
                                    onChange={(event) => handleCsvFile(event.target.files?.[0] ?? null)}
                                />
                            </label>
                        </Button>
                        <Button variant="ghost" className="whitespace-nowrap" onClick={downloadTemplate}>
                            <Download className="size-4" />
                            Template
                        </Button>
                    </div>

                    {csvHeaders.length > 0 && (
                        <>
                            <Alert variant="info">
                                <Info />
                                <AlertDescription>
                                    {csvRows.length} rows detected. Map each CSV column to a {importModule.toLowerCase()} field before importing.
                                </AlertDescription>
                            </Alert>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>CSV Column</TableHead>
                                        <TableHead>CRM Field</TableHead>
                                        <TableHead>Sample Value</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {csvHeaders.map((header) => (
                                        <TableRow key={header}>
                                            <TableCell>{header}</TableCell>
                                            <TableCell className="min-w-[220px]">
                                                <Select
                                                    value={mappings[header] ? mappings[header] : NONE_VALUE}
                                                    onValueChange={(value) => setMappings({ ...mappings, [header]: value === NONE_VALUE ? '' : value })}
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value={NONE_VALUE}>Do not import</SelectItem>
                                                        {IMPORT_FIELDS[importModule].map((field) => (
                                                            <SelectItem key={field.key} value={field.key}>
                                                                {field.label}{field.required ? ' *' : ''}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell>{csvRows[0]?.[header]}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </>
                    )}
                </div>
            </StandardDialog>
        </div>
    );
}
