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
    HeartPulse,
    RefreshCw,
    XCircle,
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

interface InboundWebhookSettings {
    currentSecret: string;
    hasPreviousSecret: boolean;
    previousSecretExpiresAt: string | null;
    isActive: boolean;
}

interface InboundWebhookEvent {
    id: string;
    idempotencyKey: string | null;
    status: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED' | 'FAILED';
    payload: any;
    leadId: string | null;
    errorMessage: string | null;
    createdAt: string;
}

const INBOUND_EVENT_STATUS_CLASSNAMES: Record<string, string> = {
    ACCEPTED: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    DUPLICATE: 'border-muted bg-muted text-muted-foreground',
    REJECTED: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    FAILED: 'border-destructive/30 bg-destructive/10 text-destructive',
};

interface ConnectorHealthCheck {
    key: string;
    label: string;
    status: 'ok' | 'degraded' | 'error' | 'not_configured';
    detail?: string;
    latencyMs?: number;
}

interface Webhook {
    id: string;
    name: string;
    url: string;
    events: string[];
    isActive: boolean;
    secret?: string;
    rateLimitPerMinute?: number;
}

interface WebhookDelivery {
    id: string;
    eventType: string;
    status: 'PENDING' | 'SENDING' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
    retryCount: number;
    httpStatus: number | null;
    responseBody: string | null;
    error: string | null;
    createdAt: string;
    processedAt: string | null;
}

const WEBHOOK_EVENT_OPTIONS = [
    'LEAD_CREATED', 'LEAD_UPDATED', 'OPPORTUNITY_CREATED', 'OPPORTUNITY_UPDATED', 'STAGE_CHANGED', 'ACTIVITY_CREATED', 'ACTIVITY_UPDATED',
    'TASK_CREATED', 'TASK_UPDATED',
    'CASE_CREATED', 'CASE_ASSIGNED', 'CASE_UPDATED', 'CASE_COMMENTED', 'CASE_RESOLVED', 'CASE_REOPENED', 'CASE_STATUS_CHANGED', 'CASE_SLA_WARNING', 'CASE_SLA_BREACHED',
    'COMMUNICATION_SENT', 'COMMUNICATION_FAILED',
];

const WEBHOOK_DELIVERY_STATUS_CLASSNAMES: Record<string, string> = {
    DELIVERED: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    PENDING: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
    SENDING: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
    FAILED: 'border-destructive/30 bg-destructive/10 text-destructive',
    CANCELLED: 'border-muted bg-muted text-muted-foreground',
};

interface ImportJob {
    id: string;
    module: string;
    status: string;
    stats: { total: number; processed: number; created: number; updated: number; skipped: number; failed: number };
    errors?: { row: number; message: string }[];
    createdAt: string;
}

interface ImportTemplate {
    id: string;
    name: string;
    module: string;
    mapping: { fields?: { source: string; target: string }[] };
    duplicateMode: 'SKIP' | 'UPDATE' | 'CREATE';
}

interface ImportPreview {
    total: number;
    wouldCreate: number;
    wouldUpdate: number;
    wouldSkip: number;
    wouldFail: number;
    isDestructive: boolean;
    sampleErrors: { row: number; message: string }[];
}

const ACTIVE_IMPORT_STATUSES = new Set(['QUEUED', 'PROCESSING', 'PENDING_APPROVAL']);

const IMPORT_STATUS_CLASSNAMES: Record<string, string> = {
    COMPLETED: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    QUEUED: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
    PROCESSING: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
    PENDING_APPROVAL: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    COMPLETED_WITH_ERRORS: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    FAILED: 'border-destructive/30 bg-destructive/10 text-destructive',
    CANCELLED: 'border-muted bg-muted text-muted-foreground',
    REJECTED: 'border-destructive/30 bg-destructive/10 text-destructive',
};

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
    const [newWebhook, setNewWebhook] = useState({ name: '', url: '', events: ['LEAD_CREATED'] as string[], secret: '', rateLimitPerMinute: 60 });
    const [togglingWebhookId, setTogglingWebhookId] = useState<string | null>(null);
    const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);
    const [webhookTestResult, setWebhookTestResult] = useState<Record<string, any>>({});
    const [viewingDeliveriesForWebhook, setViewingDeliveriesForWebhook] = useState<Webhook | null>(null);
    const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDelivery[]>([]);
    const [loadingDeliveries, setLoadingDeliveries] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [importModule, setImportModule] = useState<'LEAD' | 'OPPORTUNITY' | 'ACTIVITY'>('LEAD');
    const [duplicateMode, setDuplicateMode] = useState<'SKIP' | 'UPDATE' | 'CREATE'>('SKIP');
    const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
    const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
    const [mappings, setMappings] = useState<Record<string, string>>({});
    const [importing, setImporting] = useState(false);
    const [importTemplates, setImportTemplates] = useState<ImportTemplate[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [saveAsTemplateName, setSaveAsTemplateName] = useState('');
    const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
    const [previewing, setPreviewing] = useState(false);
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
        previousWebhookSecret: '' as string | null,
        previousWebhookSecretExpiresAt: null as string | null,
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
        callingQuietHours: { enabled: false, start: '21:00', end: '09:00' },
        recordingRetentionDays: '',
        defaultCallQueueTeamId: '',
        isActive: false,
    });
    const [telephonySection, setTelephonySection] = useState('click2call');
    const [rotatingTelephonySecret, setRotatingTelephonySecret] = useState(false);
    const [doNotCallList, setDoNotCallList] = useState<Array<{ id: string; address: string; reason: string | null; createdAt: string }>>([]);
    const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
    const [newDoNotCallNumber, setNewDoNotCallNumber] = useState('');
    const [showTelephonySecret, setShowTelephonySecret] = useState(false);
    const [callLogs, setCallLogs] = useState<CallLog[]>([]);
    const [testCall, setTestCall] = useState({ phoneNumber: '', leadId: '' });
    const [externalIntegrations, setExternalIntegrations] = useState<ExternalIntegration[]>([]);
    const [externalIntegrationDraft, setExternalIntegrationDraft] = useState<ExternalIntegration>(DEFAULT_EXTERNAL_INTEGRATION);
    const [editingExternalIntegrationId, setEditingExternalIntegrationId] = useState<string | null>(null);
    const [savingExternalIntegration, setSavingExternalIntegration] = useState(false);
    const [connectorHealth, setConnectorHealth] = useState<ConnectorHealthCheck[]>([]);
    const [connectorHealthCheckedAt, setConnectorHealthCheckedAt] = useState<string | null>(null);
    const [loadingHealth, setLoadingHealth] = useState(false);
    const [inboundSettings, setInboundSettings] = useState<InboundWebhookSettings | null>(null);
    const [inboundEvents, setInboundEvents] = useState<InboundWebhookEvent[]>([]);
    const [rotatingInboundSecret, setRotatingInboundSecret] = useState(false);
    const [showInboundSecret, setShowInboundSecret] = useState(false);
    const [testPayload, setTestPayload] = useState('{\n  "name": "Test Lead",\n  "email": "test@example.com"\n}');
    const [testingInbound, setTestingInbound] = useState(false);
    const [testResult, setTestResult] = useState<any>(null);

    useEffect(() => {
        fetchData();
    }, []);

    // Imports run async now (worker-backed) -- poll while any job is still in flight so the
    // status column reflects real progress without a manual refresh.
    useEffect(() => {
        if (!imports.some((job) => ACTIVE_IMPORT_STATUSES.has(job.status))) return;
        const timer = setInterval(() => {
            apiFetch('/integrations/csv/jobs').then((data) => setImports(data || [])).catch(() => undefined);
        }, 4000);
        return () => clearInterval(timer);
    }, [imports]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [whData, impData, templateData] = await Promise.all([
                apiFetch('/integrations/webhooks'),
                apiFetch('/integrations/csv/jobs'),
                apiFetch('/integrations/csv/templates'),
            ]);
            setWebhooks(whData || []);
            setImports(impData || []);
            setImportTemplates(templateData || []);
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
                    previousWebhookSecret: data?.config?.previousWebhookSecret ?? null,
                    previousWebhookSecretExpiresAt: data?.config?.previousWebhookSecretExpiresAt ?? null,
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
                    callingQuietHours: data?.config?.callingQuietHours ?? { enabled: false, start: '21:00', end: '09:00' },
                    recordingRetentionDays: data?.config?.recordingRetentionDays != null ? String(data.config.recordingRetentionDays) : '',
                    defaultCallQueueTeamId: data?.config?.defaultCallQueueTeamId ?? '',
                    isActive: Boolean(data?.isActive)
                }))
                .catch(() => undefined);
            apiFetch('/integrations/telephony/call-logs')
                .then((data) => setCallLogs(Array.isArray(data) ? data : []))
                .catch(() => undefined);
            apiFetch('/integrations/telephony/suppress')
                .then((data) => setDoNotCallList(Array.isArray(data) ? data : []))
                .catch(() => undefined);
            apiFetch('/teams')
                .then((data) => setTeams(Array.isArray(data) ? data : []))
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

    const fetchConnectorHealth = async () => {
        setLoadingHealth(true);
        try {
            const data = await apiFetch<{ checks: ConnectorHealthCheck[]; checkedAt: string }>('/settings/integrations/health');
            setConnectorHealth(data.checks);
            setConnectorHealthCheckedAt(data.checkedAt);
        } catch (err) {
            toast.error('Failed to check connector health');
        } finally {
            setLoadingHealth(false);
        }
    };

    const fetchInboundWebhookData = async () => {
        try {
            const [settings, events] = await Promise.all([
                apiFetch<InboundWebhookSettings>('/integrations/inbound/settings'),
                apiFetch<InboundWebhookEvent[]>('/integrations/inbound/events'),
            ]);
            setInboundSettings(settings);
            setInboundEvents(events || []);
        } catch {
            toast.error('Failed to load inbound webhook settings');
        }
    };

    const handleRotateInboundSecret = async () => {
        if (!confirm('Rotate the inbound webhook secret? The previous secret keeps working for 24 hours so you can update callers.')) return;
        setRotatingInboundSecret(true);
        try {
            const settings = await apiFetch<InboundWebhookSettings>('/integrations/inbound/settings/rotate', { method: 'POST' });
            setInboundSettings(settings);
            setShowInboundSecret(true);
            toast.success('Secret rotated');
        } catch {
            toast.error('Failed to rotate secret');
        } finally {
            setRotatingInboundSecret(false);
        }
    };

    const handleSendTestPayload = async () => {
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(testPayload);
        } catch {
            toast.error('Test payload must be valid JSON');
            return;
        }
        setTestingInbound(true);
        setTestResult(null);
        try {
            const result = await apiFetch('/integrations/inbound/settings/test', { method: 'POST', body: JSON.stringify(parsed) });
            setTestResult(result);
            fetchInboundWebhookData();
        } catch {
            toast.error('Failed to send test payload');
        } finally {
            setTestingInbound(false);
        }
    };

    const handleRetryInboundEvent = async (eventId: string) => {
        try {
            await apiFetch(`/integrations/inbound/events/${eventId}/retry`, { method: 'POST' });
            toast.success('Retry attempted');
            fetchInboundWebhookData();
        } catch {
            toast.error('Retry failed');
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
            setNewWebhook({ name: '', url: '', events: ['LEAD_CREATED'], secret: '', rateLimitPerMinute: 60 });
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

    const handleToggleWebhookActive = async (webhook: Webhook) => {
        setTogglingWebhookId(webhook.id);
        try {
            const updated = await apiFetch<Webhook>(`/integrations/webhooks/${webhook.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ isActive: !webhook.isActive }),
            });
            setWebhooks(webhooks.map((wh) => (wh.id === webhook.id ? updated : wh)));
            toast.success(updated.isActive ? 'Webhook resumed' : 'Webhook paused');
        } catch {
            toast.error('Failed to update webhook');
        } finally {
            setTogglingWebhookId(null);
        }
    };

    const handleTestWebhook = async (webhookId: string) => {
        setTestingWebhookId(webhookId);
        try {
            const result = await apiFetch(`/integrations/webhooks/${webhookId}/test`, { method: 'POST' });
            setWebhookTestResult({ ...webhookTestResult, [webhookId]: result });
            toast[result.error ? 'error' : 'success'](result.error ? `Test failed: ${result.error}` : `Test delivered (HTTP ${result.httpStatus})`);
        } catch {
            toast.error('Failed to send test delivery');
        } finally {
            setTestingWebhookId(null);
        }
    };

    const openWebhookDeliveries = async (webhook: Webhook) => {
        setViewingDeliveriesForWebhook(webhook);
        setLoadingDeliveries(true);
        try {
            const deliveries = await apiFetch<WebhookDelivery[]>(`/integrations/webhooks/${webhook.id}/deliveries`);
            setWebhookDeliveries(deliveries || []);
        } catch {
            toast.error('Failed to load delivery log');
        } finally {
            setLoadingDeliveries(false);
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

    const currentImportMappings = () => Object.entries(mappings).filter(([, target]) => target).map(([source, target]) => ({ source, target }));

    const validateImportMapping = () => {
        const mappedTargets = Object.values(mappings).filter((value) => typeof value === "string" && value.length > 0);
        const missingRequired = IMPORT_FIELDS[importModule].filter((field) => field.required && !mappedTargets.includes(field.key));
        if (missingRequired.length > 0) {
            toast.error(`Map required fields: ${missingRequired.map((field) => field.label).join(', ')}`);
            return false;
        }
        return true;
    };

    const handlePreviewImport = async () => {
        if (!validateImportMapping()) return;
        setPreviewing(true);
        try {
            const preview = await apiFetch<ImportPreview>('/integrations/csv/preview', {
                method: 'POST',
                body: JSON.stringify({ module: importModule, duplicateMode, rows: csvRows, mappings: currentImportMappings() }),
            });
            setImportPreview(preview);
        } catch {
            toast.error('Failed to preview import');
        } finally {
            setPreviewing(false);
        }
    };

    const handleRunImport = async () => {
        if (!validateImportMapping()) return;
        setImporting(true);
        try {
            if (saveAsTemplateName.trim()) {
                await apiFetch('/integrations/csv/templates', {
                    method: 'POST',
                    body: JSON.stringify({ name: saveAsTemplateName.trim(), module: importModule, duplicateMode, mappings: currentImportMappings() }),
                }).catch(() => toast.error('Import will proceed, but saving the template failed'));
            }
            const job = await apiFetch<ImportJob>('/integrations/csv/jobs', {
                method: 'POST',
                body: JSON.stringify({ module: importModule, duplicateMode, rows: csvRows, mappings: currentImportMappings() }),
            });
            toast.success(job.status === 'PENDING_APPROVAL' ? 'Import queued -- awaiting approval (overwrites existing records)' : 'Import queued');
            setIsImportOpen(false);
            setCsvHeaders([]);
            setCsvRows([]);
            setMappings({});
            setImportPreview(null);
            setSaveAsTemplateName('');
            setSelectedTemplateId('');
            fetchData();
        } catch {
            toast.error('Failed to queue import');
        } finally {
            setImporting(false);
        }
    };

    const handleLoadImportTemplate = (templateId: string) => {
        setSelectedTemplateId(templateId);
        const template = importTemplates.find((item) => item.id === templateId);
        if (!template) return;
        setImportModule(template.module as 'LEAD' | 'OPPORTUNITY' | 'ACTIVITY');
        setDuplicateMode(template.duplicateMode);
        setMappings(Object.fromEntries((template.mapping?.fields ?? []).map((field) => [field.source, field.target])));
    };

    const handleDeleteImportTemplate = async (templateId: string) => {
        try {
            await apiFetch(`/integrations/csv/templates/${templateId}`, { method: 'DELETE' });
            setImportTemplates(importTemplates.filter((item) => item.id !== templateId));
            toast.success('Template deleted');
        } catch {
            toast.error('Failed to delete template');
        }
    };

    const handleCancelImportJob = async (jobId: string) => {
        try {
            await apiFetch(`/integrations/csv/jobs/${jobId}/cancel`, { method: 'POST' });
            toast.success('Cancel requested');
            fetchData();
        } catch {
            toast.error('Failed to cancel import');
        }
    };

    const handleApproveImportJob = async (jobId: string) => {
        try {
            await apiFetch(`/integrations/csv/jobs/${jobId}/approve`, { method: 'POST' });
            toast.success('Import approved and queued');
            fetchData();
        } catch {
            toast.error('Failed to approve import');
        }
    };

    const handleRejectImportJob = async (jobId: string) => {
        if (!confirm('Reject this import? It will not run.')) return;
        try {
            await apiFetch(`/integrations/csv/jobs/${jobId}/reject`, { method: 'POST' });
            toast.success('Import rejected');
            fetchData();
        } catch {
            toast.error('Failed to reject import');
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
            // webhookSecret/previousWebhookSecret* are managed exclusively via the dedicated
            // rotate endpoint below -- excluded here so a general settings save (e.g. changing
            // the Provider field) can never silently overwrite the live secret with whatever
            // stale value happens to be sitting in this form's local state.
            const { webhookSecret, previousWebhookSecret, previousWebhookSecretExpiresAt, ...rest } = telephony;
            await apiFetch('/integrations/telephony', {
                method: 'POST',
                body: JSON.stringify(rest),
            });
            toast.success('Telephony settings saved');
        } catch {
            toast.error('Failed to save telephony settings');
        }
    };

    const handleRotateTelephonySecret = async () => {
        if (!confirm('Rotate the telephony webhook secret? The previous secret keeps working for 24 hours so you can update your provider.')) return;
        setRotatingTelephonySecret(true);
        try {
            const result = await apiFetch<{ webhookSecret: string; hasPreviousSecret: boolean; previousWebhookSecretExpiresAt: string | null }>(
                '/integrations/telephony/webhook-secret/rotate',
                { method: 'POST' },
            );
            setTelephony({
                ...telephony,
                webhookSecret: result.webhookSecret,
                previousWebhookSecret: result.hasPreviousSecret ? 'set' : null,
                previousWebhookSecretExpiresAt: result.previousWebhookSecretExpiresAt,
            });
            setShowTelephonySecret(true);
            toast.success('Webhook secret rotated');
        } catch {
            toast.error('Failed to rotate webhook secret -- save telephony settings once first if this is the first time');
        } finally {
            setRotatingTelephonySecret(false);
        }
    };

    const handleAddDoNotCallNumber = async () => {
        if (!newDoNotCallNumber.trim()) {
            toast.error('Enter a phone number');
            return;
        }
        try {
            const created = await apiFetch<{ id: string; address: string; reason: string | null; createdAt: string }>('/integrations/telephony/suppress', {
                method: 'POST',
                body: JSON.stringify({ phoneNumber: newDoNotCallNumber.trim(), reason: 'MANUAL' }),
            });
            setDoNotCallList([created, ...doNotCallList.filter((entry) => entry.address !== created.address)]);
            setNewDoNotCallNumber('');
            toast.success('Number added to do-not-call list');
        } catch {
            toast.error('Failed to add number');
        }
    };

    const handleRemoveDoNotCallNumber = async (id: string) => {
        try {
            await apiFetch(`/integrations/telephony/suppress/${id}`, { method: 'DELETE' });
            setDoNotCallList(doNotCallList.filter((entry) => entry.id !== id));
        } catch {
            toast.error('Failed to remove number');
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

            <Tabs
                value={String(activeTab)}
                onValueChange={(value) => {
                    setActiveTab(Number(value));
                    if (value === '6' && !connectorHealthCheckedAt) fetchConnectorHealth();
                    if (value === '1' && !inboundSettings) fetchInboundWebhookData();
                }}
            >
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
                    <TabsTrigger value="6">
                        <HeartPulse className="size-4" />
                        Health
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
                                                    <Badge variant="outline">{wh.rateLimitPerMinute ?? 60}/min</Badge>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button variant="ghost" size="sm" disabled={togglingWebhookId === wh.id} onClick={() => handleToggleWebhookActive(wh)}>
                                                {wh.isActive ? 'Pause' : 'Resume'}
                                            </Button>
                                            <Button variant="ghost" size="sm" disabled={testingWebhookId === wh.id} onClick={() => handleTestWebhook(wh.id)}>
                                                <Send className="size-4" />
                                                {testingWebhookId === wh.id ? 'Sending...' : 'Test'}
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => openWebhookDeliveries(wh)}>
                                                Deliveries
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteWebhook(wh.id)}>
                                                <Trash2 className="size-4 text-destructive" />
                                            </Button>
                                        </div>
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
                                    Sign requests with <code>X-Webhook-Timestamp</code> (unix seconds) and <code>X-Webhook-Signature</code>
                                    (hex HMAC-SHA256 of <code>{'{timestamp}.{rawBody}'}</code> using the secret below). Requests older than 5 minutes are rejected.
                                    An optional <code>X-Idempotency-Key</code> header prevents duplicate leads on retry.
                                </AlertDescription>
                            </Alert>

                            {inboundSettings && (
                                <div className="space-y-2 rounded-lg border p-3">
                                    <Label>Signing secret</Label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            readOnly
                                            type={showInboundSecret ? 'text' : 'password'}
                                            value={inboundSettings.currentSecret}
                                            className="font-mono text-xs"
                                        />
                                        <Button variant="ghost" size="icon" onClick={() => setShowInboundSecret(!showInboundSecret)}>
                                            {showInboundSecret ? <Ban className="size-4" /> : <CheckCircle2 className="size-4" />}
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => copyToClipboard(inboundSettings.currentSecret)}>
                                            <Copy className="size-4" />
                                        </Button>
                                    </div>
                                    {inboundSettings.hasPreviousSecret && (
                                        <p className="text-xs text-muted-foreground">
                                            Previous secret still valid until {inboundSettings.previousSecretExpiresAt ? new Date(inboundSettings.previousSecretExpiresAt).toLocaleString() : '—'}.
                                        </p>
                                    )}
                                    <Button variant="outline" size="sm" disabled={rotatingInboundSecret} onClick={handleRotateInboundSecret}>
                                        <RefreshCw className={rotatingInboundSecret ? 'size-4 animate-spin' : 'size-4'} />
                                        Rotate Secret
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Test Payload Console</CardTitle>
                            <CardDescription>Send a real signed test request through the exact same path an external caller hits.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Textarea
                                rows={5}
                                className="font-mono text-xs"
                                value={testPayload}
                                onChange={(event) => setTestPayload(event.target.value)}
                            />
                            <Button variant="outline" disabled={testingInbound} onClick={handleSendTestPayload}>
                                <Send className="size-4" />
                                {testingInbound ? 'Sending...' : 'Send Test Payload'}
                            </Button>
                            {testResult && (
                                <Alert variant={testResult.error ? "destructive" : "info"}>
                                    {testResult.error ? <AlertTriangle /> : <CheckCircle2 />}
                                    <AlertDescription>
                                        {testResult.error ? `Failed: ${testResult.error}` : `Succeeded${testResult.result?.duplicate ? ' (duplicate, no new lead created)' : ` -- leadId ${testResult.result?.leadId}`}`}
                                        <pre className="mt-2 overflow-auto rounded bg-muted/40 p-2 text-xs">{JSON.stringify(testResult.request, null, 2)}</pre>
                                    </AlertDescription>
                                </Alert>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Events</CardTitle>
                            <CardDescription>Every inbound request, including rejected and failed ones (dead-letter view).</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {inboundEvents.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No inbound events yet.</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Time</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Detail</TableHead>
                                            <TableHead></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {inboundEvents.map((event) => (
                                            <TableRow key={event.id}>
                                                <TableCell className="whitespace-nowrap text-xs">{new Date(event.createdAt).toLocaleString()}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={INBOUND_EVENT_STATUS_CLASSNAMES[event.status]}>{event.status}</Badge>
                                                </TableCell>
                                                <TableCell className="whitespace-normal text-xs">
                                                    {event.errorMessage || (event.leadId ? `Lead ${event.leadId}` : '-')}
                                                </TableCell>
                                                <TableCell>
                                                    {event.status === 'FAILED' && (
                                                        <Button size="sm" variant="ghost" onClick={() => handleRetryInboundEvent(event.id)}>Retry</Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
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
                                        <TableHead></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {imports.map((job) => (
                                        <TableRow key={job.id}>
                                            <TableCell>{job.module}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={IMPORT_STATUS_CLASSNAMES[job.status]}>{job.status.replace(/_/g, ' ')}</Badge>
                                            </TableCell>
                                            <TableCell>{job.stats?.created ?? 0}</TableCell>
                                            <TableCell>{job.stats?.updated ?? 0}</TableCell>
                                            <TableCell>{job.stats?.skipped ?? 0}</TableCell>
                                            <TableCell>{job.stats?.failed ?? 0}</TableCell>
                                            <TableCell className="whitespace-normal">
                                                {job.errors?.slice(0, 2).map((error) => `Row ${error.row}: ${error.message}`).join(' | ') || '-'}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                {job.status === 'PENDING_APPROVAL' && (
                                                    <div className="flex gap-1">
                                                        <Button size="sm" variant="outline" onClick={() => handleApproveImportJob(job.id)}>Approve</Button>
                                                        <Button size="sm" variant="ghost" onClick={() => handleRejectImportJob(job.id)}>Reject</Button>
                                                    </div>
                                                )}
                                                {(job.status === 'QUEUED' || job.status === 'PROCESSING') && (
                                                    <Button size="sm" variant="ghost" onClick={() => handleCancelImportJob(job.id)}>Cancel</Button>
                                                )}
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
                                    ['compliance', 'Compliance & Consent'],
                                    ['queueRouting', 'Queue Routing'],
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
                                        <div className="space-y-1.5">
                                            <Label>Webhook Signing Secret</Label>
                                            {telephony.webhookSecret ? (
                                                <>
                                                    <div className="flex items-center gap-2">
                                                        <Input
                                                            readOnly
                                                            type={showTelephonySecret ? 'text' : 'password'}
                                                            value={telephony.webhookSecret}
                                                            className="font-mono text-xs"
                                                        />
                                                        <Button variant="ghost" size="icon" onClick={() => setShowTelephonySecret(!showTelephonySecret)}>
                                                            {showTelephonySecret ? <Ban className="size-4" /> : <CheckCircle2 className="size-4" />}
                                                        </Button>
                                                        <Button variant="ghost" size="icon" onClick={() => copyToClipboard(telephony.webhookSecret)}>
                                                            <Copy className="size-4" />
                                                        </Button>
                                                    </div>
                                                    {telephony.previousWebhookSecret && (
                                                        <p className="text-xs text-muted-foreground">
                                                            Previous secret still valid until {telephony.previousWebhookSecretExpiresAt ? new Date(telephony.previousWebhookSecretExpiresAt).toLocaleString() : '—'}.
                                                        </p>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="text-xs text-muted-foreground">No secret generated yet -- rotate to create one.</p>
                                            )}
                                            <Button variant="outline" size="sm" disabled={rotatingTelephonySecret} onClick={handleRotateTelephonySecret}>
                                                <RefreshCw className={rotatingTelephonySecret ? 'size-4 animate-spin' : 'size-4'} />
                                                Rotate Secret
                                            </Button>
                                            <p className="text-xs text-muted-foreground">
                                                Sign webhook requests with X-Webhook-Timestamp and X-Webhook-Signature (hex HMAC-SHA256 of timestamp.rawBody) using this secret.
                                                A legacy shared-secret header is still accepted for backward compatibility but is deprecated.
                                            </p>
                                        </div>
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

                                {telephonySection === 'compliance' && (
                                    <div className="space-y-6">
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    checked={telephony.callingQuietHours?.enabled ?? false}
                                                    onCheckedChange={(checked) => setTelephony({ ...telephony, callingQuietHours: { ...(telephony.callingQuietHours ?? { start: '21:00', end: '09:00' }), enabled: checked } })}
                                                />
                                                <Label>Block click-to-call during quiet hours</Label>
                                            </div>
                                            <Alert variant="info">
                                                <Info />
                                                <AlertDescription>Calls attempted inside this window are blocked before dialing (server local time).</AlertDescription>
                                            </Alert>
                                            <div className="flex flex-col gap-3 md:flex-row">
                                                <FieldInput
                                                    className="w-full"
                                                    label="Quiet Hours Start"
                                                    type="time"
                                                    value={telephony.callingQuietHours?.start ?? '21:00'}
                                                    onChange={(value) => setTelephony({ ...telephony, callingQuietHours: { ...(telephony.callingQuietHours ?? { enabled: false, end: '09:00' }), start: value } })}
                                                />
                                                <FieldInput
                                                    className="w-full"
                                                    label="Quiet Hours End"
                                                    type="time"
                                                    value={telephony.callingQuietHours?.end ?? '09:00'}
                                                    onChange={(value) => setTelephony({ ...telephony, callingQuietHours: { ...(telephony.callingQuietHours ?? { enabled: false, start: '21:00' }), end: value } })}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <div>
                                                <p className="text-sm font-medium">Do-Not-Call List</p>
                                                <p className="text-sm text-muted-foreground">Numbers on this list are blocked from click-to-call, with the same explanation surfaced to the agent.</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <FieldInput
                                                    className="w-full"
                                                    label="Phone Number"
                                                    value={newDoNotCallNumber}
                                                    onChange={setNewDoNotCallNumber}
                                                />
                                                <Button className="self-end" onClick={handleAddDoNotCallNumber}>
                                                    <Plus className="size-4" />
                                                    Add
                                                </Button>
                                            </div>
                                            {doNotCallList.length === 0 ? (
                                                <p className="text-sm text-muted-foreground">No numbers suppressed yet.</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {doNotCallList.map((entry) => (
                                                        <div key={entry.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                                                            <div>
                                                                <p className="text-sm font-medium">{entry.address}</p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {entry.reason ?? 'MANUAL'} · added {formatWorkspaceDateTime(entry.createdAt)}
                                                                </p>
                                                            </div>
                                                            <Button variant="ghost" size="icon" onClick={() => handleRemoveDoNotCallNumber(entry.id)}>
                                                                <Trash2 className="size-4" />
                                                            </Button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <Alert variant="info">
                                            <Info />
                                            <AlertDescription>
                                                Calling consent and opt-out capture reuse the same suppression/consent records as email, WhatsApp, and SMS -- a contact who has opted out of phone
                                                contact on their record is blocked here too. Blocked calls surface the specific reason (do-not-call, opted out, or quiet hours) in the click-to-call
                                                toast so agents know why a call didn&apos;t go through.
                                            </AlertDescription>
                                        </Alert>

                                        <div className="space-y-1.5">
                                            <Label>Recording Retention (days)</Label>
                                            <Input
                                                type="number"
                                                min={0}
                                                className="w-40"
                                                placeholder="Keep indefinitely"
                                                value={telephony.recordingRetentionDays}
                                                onChange={(e) => setTelephony({ ...telephony, recordingRetentionDays: e.target.value })}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Applies to new recordings captured after this is set. Leave blank or 0 to keep recordings indefinitely. Expired
                                                recordings are cleared automatically; the call log entry and its metadata are kept.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {telephonySection === 'queueRouting' && (
                                    <div className="space-y-3">
                                        <Alert variant="info">
                                            <Info />
                                            <AlertDescription>
                                                Missed calls and inbound calls with no matching Lead/Opportunity are routed into this team&apos;s queue for
                                                triage. Leave blank to disable auto-routing.
                                            </AlertDescription>
                                        </Alert>
                                        <div className="space-y-1.5">
                                            <Label>Default Call Queue Team</Label>
                                            <select
                                                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                                value={telephony.defaultCallQueueTeamId}
                                                onChange={(e) => setTelephony({ ...telephony, defaultCallQueueTeamId: e.target.value })}
                                            >
                                                <option value="">Auto-routing disabled</option>
                                                {teams.map((team) => (
                                                    <option key={team.id} value={team.id}>
                                                        {team.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Queued calls, claiming, and per-team backlog are managed from the Call Center workspace.
                                        </p>
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

                <TabsContent value="6" className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">Connector Health</h2>
                            <p className="text-sm text-muted-foreground">
                                {connectorHealthCheckedAt
                                    ? `Last checked ${new Date(connectorHealthCheckedAt).toLocaleTimeString()}`
                                    : 'Live status for the systems this CRM depends on.'}
                            </p>
                        </div>
                        <Button variant="outline" onClick={fetchConnectorHealth} disabled={loadingHealth}>
                            <RefreshCw className={loadingHealth ? 'size-4 animate-spin' : 'size-4'} />
                            Refresh
                        </Button>
                    </div>

                    {loadingHealth && connectorHealth.length === 0 ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="size-6 animate-spin text-primary" />
                        </div>
                    ) : connectorHealth.length === 0 ? (
                        <Alert variant="info">
                            <Info />
                            <AlertDescription>Click Refresh to check connector health.</AlertDescription>
                        </Alert>
                    ) : (
                        <Card className="overflow-hidden py-0">
                            <div className="divide-y">
                                {connectorHealth.map((check) => (
                                    <div key={check.key} className="flex items-center justify-between gap-3 p-4">
                                        <div className="flex items-center gap-3">
                                            {check.status === 'ok' && <CheckCircle2 className="size-5 text-green-600" />}
                                            {check.status === 'degraded' && <AlertTriangle className="size-5 text-amber-500" />}
                                            {check.status === 'error' && <XCircle className="size-5 text-destructive" />}
                                            {check.status === 'not_configured' && <Ban className="size-5 text-muted-foreground" />}
                                            <div>
                                                <div className="font-medium">{check.label}</div>
                                                {check.detail && <div className="text-xs text-muted-foreground">{check.detail}</div>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {typeof check.latencyMs === 'number' && (
                                                <span className="text-xs text-muted-foreground">{check.latencyMs}ms</span>
                                            )}
                                            <Badge
                                                variant="outline"
                                                className={
                                                    check.status === 'ok'
                                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                                        : check.status === 'degraded'
                                                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                                                          : check.status === 'error'
                                                            ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                                            : 'border-muted bg-muted text-muted-foreground'
                                                }
                                            >
                                                {check.status.replace('_', ' ')}
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
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
                        <p className="text-xs text-muted-foreground">
                            If set, deliveries are signed with X-Webhook-Signature (HMAC-SHA256 of timestamp.body) and X-Webhook-Timestamp.
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Events</Label>
                        <div className="flex flex-wrap gap-3">
                            {WEBHOOK_EVENT_OPTIONS.map((event) => (
                                <label key={event} className="flex items-center gap-1.5 text-sm">
                                    <Checkbox
                                        checked={newWebhook.events.includes(event)}
                                        onCheckedChange={(checked) => setNewWebhook({
                                            ...newWebhook,
                                            events: checked ? [...newWebhook.events, event] : newWebhook.events.filter((ev) => ev !== event),
                                        })}
                                    />
                                    {event}
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Rate Limit (deliveries per minute)</Label>
                        <Input
                            type="number"
                            min={1}
                            value={newWebhook.rateLimitPerMinute}
                            onChange={(e) => setNewWebhook({ ...newWebhook, rateLimitPerMinute: Math.max(1, Number(e.target.value) || 60) })}
                        />
                        <p className="text-xs text-muted-foreground">
                            A burst past this limit is delayed a few seconds and retried, not dropped or counted as a failed attempt.
                        </p>
                    </div>
                </div>
            </StandardDialog>

            {/* Webhook Deliveries Dialog */}
            <StandardDialog
                open={!!viewingDeliveriesForWebhook}
                onClose={() => setViewingDeliveriesForWebhook(null)}
                title={`Deliveries -- ${viewingDeliveriesForWebhook?.name ?? ''}`}
                maxWidth="lg"
                actions={<Button variant="outline" onClick={() => setViewingDeliveriesForWebhook(null)}>Close</Button>}
            >
                {loadingDeliveries ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="size-6 animate-spin text-primary" />
                    </div>
                ) : webhookDeliveries.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">No deliveries yet.</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Time</TableHead>
                                <TableHead>Event</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Attempts</TableHead>
                                <TableHead>HTTP</TableHead>
                                <TableHead>Error</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {webhookDeliveries.map((delivery) => (
                                <TableRow key={delivery.id}>
                                    <TableCell className="whitespace-nowrap text-xs">{new Date(delivery.createdAt).toLocaleString()}</TableCell>
                                    <TableCell className="text-xs">{delivery.eventType}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={WEBHOOK_DELIVERY_STATUS_CLASSNAMES[delivery.status]}>{delivery.status}</Badge>
                                    </TableCell>
                                    <TableCell>{delivery.retryCount}</TableCell>
                                    <TableCell>{delivery.httpStatus ?? '-'}</TableCell>
                                    <TableCell className="whitespace-normal text-xs">{delivery.error ?? '-'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
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
                        <Button variant="outline" disabled={previewing || csvRows.length === 0} onClick={handlePreviewImport}>
                            {previewing ? 'Checking...' : 'Preview'}
                        </Button>
                        <Button disabled={importing || csvRows.length === 0} onClick={handleRunImport}>
                            {importing ? 'Queuing...' : 'Run Import'}
                        </Button>
                    </>
                }
            >
                <div className="space-y-4 py-2">
                    {importTemplates.length > 0 && (
                        <div className="space-y-1.5">
                            <Label>Load saved mapping</Label>
                            <div className="flex gap-2">
                                <Select value={selectedTemplateId || NONE_VALUE} onValueChange={(value) => value !== NONE_VALUE && handleLoadImportTemplate(value)}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Choose a template" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE_VALUE}>None</SelectItem>
                                        {importTemplates.map((template) => (
                                            <SelectItem key={template.id} value={template.id}>{template.name} ({template.module})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {selectedTemplateId && (
                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteImportTemplate(selectedTemplateId)}>
                                        <Trash2 className="size-4 text-destructive" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
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

                            {importPreview && (
                                <Alert variant={importPreview.isDestructive ? "destructive" : "info"}>
                                    {importPreview.isDestructive ? <AlertTriangle /> : <Info />}
                                    <AlertDescription>
                                        {importPreview.wouldCreate} to create, {importPreview.wouldUpdate} to update, {importPreview.wouldSkip} to skip, {importPreview.wouldFail} would fail.
                                        {importPreview.isDestructive && ' This import updates existing records and will require approval before it runs.'}
                                        {importPreview.sampleErrors.length > 0 && (
                                            <div className="mt-1 text-xs">
                                                {importPreview.sampleErrors.slice(0, 3).map((error) => `Row ${error.row}: ${error.message}`).join(' | ')}
                                            </div>
                                        )}
                                    </AlertDescription>
                                </Alert>
                            )}

                            <div className="space-y-1.5">
                                <Label>Save this mapping as a reusable template (optional)</Label>
                                <Input
                                    placeholder="Template name"
                                    value={saveAsTemplateName}
                                    onChange={(event) => setSaveAsTemplateName(event.target.value)}
                                />
                            </div>
                        </>
                    )}
                </div>
            </StandardDialog>
        </div>
    );
}
