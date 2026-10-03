"use client";

import { useModuleEnabled } from "@/components/auth/feature-gate";
import { useState, useEffect } from "react";
import { Phone } from "lucide-react";
import { useArchiveActions } from "@/hooks/use-archive-actions";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { useConfirm } from "@/components/common/dialogs-provider";
import { ACTIVE_IMPORT_STATUSES, CallLog, CommunicationChannel, CommunicationOutboxItem, CommunicationProvider, CommunicationTemplate, ConnectorHealthCheck, DEFAULT_EXTERNAL_INTEGRATION, ExternalIntegration, IMPORT_FIELDS, ImportJob, ImportPreview, ImportTemplate, InboundWebhookEvent, InboundWebhookSettings, Webhook, WebhookDelivery, parseCsv } from "./integrations-shared";

// The Integrations settings page's state and handlers, moved here from page.tsx unchanged so the
// page and its sections (section-*.tsx) can share them.
export function useIntegrationsSettings() {
    const confirm = useConfirm();
    const [templateArchiveToken, setTemplateArchiveToken] = useState(0);
    const reloadImportTemplates = () => apiFetch<any[]>('/integrations/csv/templates').then((data) => setImportTemplates(Array.isArray(data) ? data : [])).catch(() => undefined);
    const { archive: archiveImportTemplate } = useArchiveActions({ basePath: '/integrations/csv/templates', archiveKind: 'import-template', noun: 'import template', onChange: () => { reloadImportTemplates(); setTemplateArchiveToken((token) => token + 1); } });
    const dataPlatformEnabled = useModuleEnabled("DATA_PLATFORM");
    const telephonyEnabled = useModuleEnabled("TELEPHONY");
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
    const [loadError, setLoadError] = useState(false);
    const [sectionState, setSectionState] = useState<Record<string, 'loading' | 'ready' | 'error'>>({ telephony: 'loading', messaging: 'loading', external: 'loading', inbound: 'loading', health: 'loading' });

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

    const fetchTelephony = () => {
        setSectionState(current => ({ ...current, telephony: 'loading' }));
        return apiFetch('/integrations/telephony')
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
                .then(() => setSectionState(current => ({ ...current, telephony: 'ready' })))
                .catch(() => setSectionState(current => ({ ...current, telephony: 'error' })));
    };

    const fetchMessaging = () => {
        setSectionState(current => ({ ...current, messaging: 'loading' }));
        return Promise.all([
                apiFetch('/communications/providers'),
                apiFetch('/communications/templates'),
                apiFetch('/communications/outbox'),
            ])
                .then(([providers, templates, outbox]) => {
                    setCommunicationProviders(Array.isArray(providers) ? providers : []);
                    setCommunicationTemplates(Array.isArray(templates) ? templates : []);
                    setCommunicationOutbox(Array.isArray(outbox) ? outbox : []);
                })
                .then(() => setSectionState(current => ({ ...current, messaging: 'ready' })))
                .catch(() => setSectionState(current => ({ ...current, messaging: 'error' })));
    };

    const fetchExternal = () => {
        setSectionState(current => ({ ...current, external: 'loading' }));
        return apiFetch('/settings/integrations/external')
                .then((data) => setExternalIntegrations(Array.isArray(data) ? data : []))
                .then(() => setSectionState(current => ({ ...current, external: 'ready' })))
                .catch(() => setSectionState(current => ({ ...current, external: 'error' })));
    };

    const fetchData = async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const [whData, impData, templateData] = await Promise.all([
                // Tolerate a disabled Data Platform module (e.g. before the session's module
                // statuses are known) so it cannot take the whole page -- CSV imports included --
                // down with it.
                dataPlatformEnabled
                    ? apiFetch('/integrations/webhooks').catch((error: any) => (error?.body?.code === 'MODULE_DISABLED' ? [] : Promise.reject(error)))
                    : Promise.resolve([]),
                apiFetch('/integrations/csv/jobs'),
                apiFetch('/integrations/csv/templates'),
            ]);
            setWebhooks(whData || []);
            setImports(impData || []);
            setImportTemplates(templateData || []);
            if (telephonyEnabled) {
                fetchTelephony();
                apiFetch('/integrations/telephony/call-logs')
                    .then((data) => setCallLogs(Array.isArray(data) ? data : []))
                    .catch(() => undefined);
            }
            apiFetch('/integrations/telephony/suppress')
                .then((data) => setDoNotCallList(Array.isArray(data) ? data : []))
                .catch(() => undefined);
            apiFetch('/teams')
                .then((data) => setTeams(Array.isArray(data) ? data : []))
                .catch(() => undefined);
            fetchMessaging();
            if (dataPlatformEnabled) fetchExternal();
        } catch (err) {
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    };

    const fetchConnectorHealth = async () => {
        setSectionState(current => ({ ...current, health: 'loading' }));
        setLoadingHealth(true);
        try {
            const data = await apiFetch<{ checks: ConnectorHealthCheck[]; checkedAt: string }>('/settings/integrations/health');
            setConnectorHealth(data.checks);
            setConnectorHealthCheckedAt(data.checkedAt);
            setSectionState(current => ({ ...current, health: 'ready' }));
        } catch (err) {
            setSectionState(current => ({ ...current, health: 'error' }));
        } finally {
            setLoadingHealth(false);
        }
    };

    const fetchInboundWebhookData = async () => {
        setSectionState(current => ({ ...current, inbound: 'loading' }));
        try {
            const [settings, events] = await Promise.all([
                apiFetch<InboundWebhookSettings>('/integrations/inbound/settings'),
                apiFetch<InboundWebhookEvent[]>('/integrations/inbound/events'),
            ]);
            setInboundSettings(settings);
            setInboundEvents(events || []);
            setSectionState(current => ({ ...current, inbound: 'ready' }));
        } catch {
            setSectionState(current => ({ ...current, inbound: 'error' }));
        }
    };

    const handleRotateInboundSecret = async () => {
        if (!(await confirm({ title: "Rotate the inbound webhook secret?", description: "The old secret keeps working for 24 hours so you can update callers.", confirmLabel: "Rotate secret" }))) return;
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
        if (!(await confirm({ title: "Delete this webhook?", description: "It stops receiving events.", confirmLabel: "Delete webhook", destructive: true }))) return;
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

    // Delete archives the template (decision 31): Undo in the toast, restore for 30 days.
    const handleDeleteImportTemplate = async (templateId: string) => {
        const template = importTemplates.find((item) => item.id === templateId);
        if (!template) return;
        if (selectedTemplateId === templateId) setSelectedTemplateId('');
        await archiveImportTemplate({ id: templateId, name: template.name });
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
        if (!(await confirm({ title: "Reject this import?", description: "It won't run.", confirmLabel: "Reject import", destructive: true }))) return;
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
        if (!(await confirm({ title: "Rotate the phone system webhook secret?", description: "The old secret keeps working for 24 hours so you can update your provider.", confirmLabel: "Rotate secret" }))) return;
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
        if (!(await confirm({ title: "Delete this integration?", description: "Its push history is kept for auditing.", confirmLabel: "Delete integration", destructive: true }))) return;
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

    return {
        confirm,
        templateArchiveToken,
        setTemplateArchiveToken,
        reloadImportTemplates,
        archiveImportTemplate,
        dataPlatformEnabled,
        telephonyEnabled,
        webhooks,
        setWebhooks,
        imports,
        setImports,
        communicationProviders,
        setCommunicationProviders,
        communicationTemplates,
        setCommunicationTemplates,
        communicationOutbox,
        setCommunicationOutbox,
        communicationChannel,
        setCommunicationChannel,
        communicationProvider,
        setCommunicationProvider,
        communicationTemplate,
        setCommunicationTemplate,
        savingCommunication,
        setSavingCommunication,
        loading,
        setLoading,
        loadError,
        setLoadError,
        sectionState,
        setSectionState,
        isAddingWebhook,
        setIsAddingWebhook,
        newWebhook,
        setNewWebhook,
        togglingWebhookId,
        setTogglingWebhookId,
        testingWebhookId,
        setTestingWebhookId,
        webhookTestResult,
        setWebhookTestResult,
        viewingDeliveriesForWebhook,
        setViewingDeliveriesForWebhook,
        webhookDeliveries,
        setWebhookDeliveries,
        loadingDeliveries,
        setLoadingDeliveries,
        isImportOpen,
        setIsImportOpen,
        importModule,
        setImportModule,
        duplicateMode,
        setDuplicateMode,
        csvHeaders,
        setCsvHeaders,
        csvRows,
        setCsvRows,
        mappings,
        setMappings,
        importing,
        setImporting,
        importTemplates,
        setImportTemplates,
        selectedTemplateId,
        setSelectedTemplateId,
        saveAsTemplateName,
        setSaveAsTemplateName,
        importPreview,
        setImportPreview,
        previewing,
        setPreviewing,
        telephony,
        setTelephony,
        telephonySection,
        setTelephonySection,
        rotatingTelephonySecret,
        setRotatingTelephonySecret,
        doNotCallList,
        setDoNotCallList,
        teams,
        setTeams,
        newDoNotCallNumber,
        setNewDoNotCallNumber,
        showTelephonySecret,
        setShowTelephonySecret,
        callLogs,
        setCallLogs,
        testCall,
        setTestCall,
        externalIntegrations,
        setExternalIntegrations,
        externalIntegrationDraft,
        setExternalIntegrationDraft,
        editingExternalIntegrationId,
        setEditingExternalIntegrationId,
        savingExternalIntegration,
        setSavingExternalIntegration,
        connectorHealth,
        setConnectorHealth,
        connectorHealthCheckedAt,
        setConnectorHealthCheckedAt,
        loadingHealth,
        setLoadingHealth,
        inboundSettings,
        setInboundSettings,
        inboundEvents,
        setInboundEvents,
        rotatingInboundSecret,
        setRotatingInboundSecret,
        showInboundSecret,
        setShowInboundSecret,
        testPayload,
        setTestPayload,
        testingInbound,
        setTestingInbound,
        testResult,
        setTestResult,
        fetchTelephony,
        fetchMessaging,
        fetchExternal,
        fetchData,
        fetchConnectorHealth,
        fetchInboundWebhookData,
        handleRotateInboundSecret,
        handleSendTestPayload,
        handleRetryInboundEvent,
        handleAddWebhook,
        handleDeleteWebhook,
        handleToggleWebhookActive,
        handleTestWebhook,
        openWebhookDeliveries,
        copyToClipboard,
        handleCsvFile,
        currentImportMappings,
        validateImportMapping,
        handlePreviewImport,
        handleRunImport,
        handleLoadImportTemplate,
        handleDeleteImportTemplate,
        handleCancelImportJob,
        handleApproveImportJob,
        handleRejectImportJob,
        downloadTemplate,
        handleSaveTelephony,
        handleRotateTelephonySecret,
        handleAddDoNotCallNumber,
        handleRemoveDoNotCallNumber,
        handleTestClickToCall,
        selectCommunicationChannel,
        updateCommunicationJson,
        handleSaveCommunicationProvider,
        startEditingExternalIntegration,
        startNewExternalIntegration,
        handleSaveExternalIntegration,
        handleDeleteExternalIntegration,
        handleSaveCommunicationTemplate,
    };
}

export type IntegrationsSettings = ReturnType<typeof useIntegrationsSettings>;
