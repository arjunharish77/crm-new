"use client";

import { useId } from "react";
import { Copy, Phone, Mail, MessageSquareText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface InboundWebhookSettings {
    currentSecret: string;
    hasPreviousSecret: boolean;
    previousSecretExpiresAt: string | null;
    isActive: boolean;
}


export interface InboundWebhookEvent {
    id: string;
    idempotencyKey: string | null;
    status: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED' | 'FAILED';
    payload: any;
    leadId: string | null;
    errorMessage: string | null;
    createdAt: string;
}


export const INBOUND_EVENT_STATUS_CLASSNAMES: Record<string, string> = {
    ACCEPTED: 'border-status-success bg-status-success text-status-success-foreground',
    DUPLICATE: 'border-muted bg-muted text-muted-foreground',
    REJECTED: 'border-status-warning bg-status-warning text-status-warning-foreground',
    FAILED: 'border-destructive/30 bg-destructive/10 text-destructive',
};


export interface ConnectorHealthCheck {
    key: string;
    label: string;
    status: 'ok' | 'degraded' | 'error' | 'not_configured';
    detail?: string;
    latencyMs?: number;
}


export interface Webhook {
    id: string;
    name: string;
    url: string;
    events: string[];
    isActive: boolean;
    secret?: string;
    rateLimitPerMinute?: number;
}


export interface WebhookDelivery {
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


export const WEBHOOK_EVENT_OPTIONS = [
    'LEAD_CREATED', 'LEAD_UPDATED', 'OPPORTUNITY_CREATED', 'OPPORTUNITY_UPDATED', 'STAGE_CHANGED', 'ACTIVITY_CREATED', 'ACTIVITY_UPDATED',
    'TASK_CREATED', 'TASK_UPDATED',
    'CASE_CREATED', 'CASE_ASSIGNED', 'CASE_UPDATED', 'CASE_COMMENTED', 'CASE_RESOLVED', 'CASE_REOPENED', 'CASE_STATUS_CHANGED', 'CASE_SLA_WARNING', 'CASE_SLA_BREACHED',
    'COMMUNICATION_SENT', 'COMMUNICATION_FAILED',
];


export const WEBHOOK_DELIVERY_STATUS_CLASSNAMES: Record<string, string> = {
    DELIVERED: 'border-status-success bg-status-success text-status-success-foreground',
    PENDING: 'border-status-info bg-status-info text-status-info-foreground',
    SENDING: 'border-status-info bg-status-info text-status-info-foreground',
    FAILED: 'border-destructive/30 bg-destructive/10 text-destructive',
    CANCELLED: 'border-muted bg-muted text-muted-foreground',
};


export interface ImportJob {
    id: string;
    module: string;
    status: string;
    stats: { total: number; processed: number; created: number; updated: number; skipped: number; failed: number };
    errors?: { row: number; message: string }[];
    createdAt: string;
}


export interface ImportTemplate {
    id: string;
    name: string;
    module: string;
    mapping: { fields?: { source: string; target: string }[] };
    duplicateMode: 'SKIP' | 'UPDATE' | 'CREATE';
}


export interface ImportPreview {
    total: number;
    wouldCreate: number;
    wouldUpdate: number;
    wouldSkip: number;
    wouldFail: number;
    isDestructive: boolean;
    sampleErrors: { row: number; message: string }[];
}


export const ACTIVE_IMPORT_STATUSES = new Set(['QUEUED', 'PROCESSING', 'PENDING_APPROVAL']);


export const IMPORT_STATUS_CLASSNAMES: Record<string, string> = {
    COMPLETED: 'border-status-success bg-status-success text-status-success-foreground',
    QUEUED: 'border-status-info bg-status-info text-status-info-foreground',
    PROCESSING: 'border-status-info bg-status-info text-status-info-foreground',
    PENDING_APPROVAL: 'border-status-warning bg-status-warning text-status-warning-foreground',
    COMPLETED_WITH_ERRORS: 'border-status-warning bg-status-warning text-status-warning-foreground',
    FAILED: 'border-destructive/30 bg-destructive/10 text-destructive',
    CANCELLED: 'border-muted bg-muted text-muted-foreground',
    REJECTED: 'border-destructive/30 bg-destructive/10 text-destructive',
};


export interface CallLog {
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


export type CommunicationChannel = 'EMAIL' | 'WHATSAPP' | 'SMS';


export interface CommunicationProvider {
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


export interface CommunicationTemplate {
    id?: string;
    name: string;
    channel: CommunicationChannel;
    category: string;
    subject?: string;
    body: string;
    tokens?: string[];
    isActive: boolean;
    version?: number;
    locale?: string;
    approvalStatus?: TemplateApprovalStatus;
    approvedAt?: string | null;
    createdBy?: string | null;
    createdAt?: string;
    updatedAt?: string;
}


export type TemplateApprovalStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';


export interface CommunicationOutboxItem {
    id: string;
    channel: CommunicationChannel;
    recipientAddress: string;
    subject?: string;
    status: string;
    attempts: number;
    error?: string;
    createdAt: string;
}


export const IMPORT_FIELDS = {
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


export interface ExternalIntegration {
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


export const DEFAULT_EXTERNAL_INTEGRATION: ExternalIntegration = {
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
export const NONE_VALUE = '__none__';

export const CHANNELS: { value: CommunicationChannel; label: string; icon: typeof Mail }[] = [
    { value: 'EMAIL', label: 'Email', icon: Mail },
    { value: 'WHATSAPP', label: 'WhatsApp', icon: MessageSquareText },
    { value: 'SMS', label: 'SMS', icon: Send },
];


export function parseCsv(text: string) {
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


export function ApiBox({ value, onCopy }: { value: string; onCopy: (text: string) => void }) {
    return (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md bg-muted p-3">
            <span className="break-all font-mono text-[0.8rem]">{value}</span>
            <Button variant="ghost" size="icon" onClick={() => onCopy(value)}>
                <Copy className="size-4" />
            </Button>
        </div>
    );
}


export function FieldInput({
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
    const id = useId();
    return (
        <div className={cn('space-y-1.5', className)}>
            <Label htmlFor={id}>{label}</Label>
            <Input id={id} type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
        </div>
    );
}


export function FieldTextarea({
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
    const id = useId();
    return (
        <div className={cn('space-y-1.5', className)}>
            <Label htmlFor={id}>{label}</Label>
            <Textarea id={id} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} className="font-mono text-sm" />
        </div>
    );
}
