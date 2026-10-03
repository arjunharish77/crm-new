"use client";

import { PageHeader } from "@/components/layout/page-header";
import { SettingsSections } from "@/components/layout/settings-sections";
import { Upload, Download, Trash2, Info, AlertTriangle, Phone, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArchivedItemsSection } from "@/components/common/archived-items-section";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StandardDialog } from "@/components/common/standard-dialog";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { IMPORT_FIELDS, NONE_VALUE, WEBHOOK_DELIVERY_STATUS_CLASSNAMES, WEBHOOK_EVENT_OPTIONS, Webhook } from "./integrations-shared";
import { useIntegrationsSettings } from "./use-integrations-settings";
import { WebhooksSection } from "./section-webhooks";
import { LeadCaptureSection } from "./section-lead-capture";
import { ImportsSection } from "./section-imports";
import { PhoneSystemSection } from "./section-phone-system";
import { MessagingSection } from "./section-messaging";
import { ExternalPushSection } from "./section-external-push";
import { ConnectionHealthSection } from "./section-health";

export default function IntegrationsSettingsPage() {
    // State and handlers live in useIntegrationsSettings; each section is its own component.
    const s = useIntegrationsSettings();
    const { templateArchiveToken, reloadImportTemplates, dataPlatformEnabled, telephonyEnabled, webhooks, imports, loadError, isAddingWebhook, setIsAddingWebhook, newWebhook, setNewWebhook, viewingDeliveriesForWebhook, setViewingDeliveriesForWebhook, webhookDeliveries, loadingDeliveries, isImportOpen, setIsImportOpen, importModule, setImportModule, duplicateMode, setDuplicateMode, csvHeaders, setCsvHeaders, csvRows, setCsvRows, mappings, setMappings, importing, importTemplates, selectedTemplateId, saveAsTemplateName, setSaveAsTemplateName, importPreview, previewing, connectorHealthCheckedAt, inboundSettings, fetchData, fetchConnectorHealth, fetchInboundWebhookData, handleAddWebhook, handleCsvFile, handlePreviewImport, handleRunImport, handleLoadImportTemplate, handleDeleteImportTemplate, downloadTemplate } = s;

    return (
        <div className="min-w-0">
            <PageHeader title="Integrations" description="Webhooks, lead capture, imports, the phone system, messaging channels, external push and connection health." />

            {loadError && <div role="alert" className="rounded-lg border p-4 text-sm">Unable to load integrations. <Button variant="outline" size="sm" onClick={fetchData}>Retry</Button></div>}
            <div hidden={loadError}>
            <SettingsSections label="Integration section" onValueChange={(value) => {
                if (value === 'health' && !connectorHealthCheckedAt) fetchConnectorHealth();
                if (value === 'lead-capture' && !inboundSettings && dataPlatformEnabled) fetchInboundWebhookData();
            }} sections={[
                { id: "webhooks", label: "Webhooks", content: <WebhooksSection s={s} /> },
                { id: "lead-capture", label: "Lead capture", content: <LeadCaptureSection s={s} /> },
                { id: "imports", label: "Imports", content: <ImportsSection s={s} /> },
                { id: "phone-system", label: "Phone system", content: <PhoneSystemSection s={s} /> },
                { id: "messaging", label: "Email, SMS & WhatsApp", content: <MessagingSection s={s} /> },
                { id: "external-push", label: "External push", content: <ExternalPushSection s={s} /> },
                { id: "health", label: "Connection health", content: <ConnectionHealthSection s={s} /> },
            ].filter((section) => {
                // Data Platform: outbound webhooks, inbound capture, external push. CSV imports,
                // messaging and connector health stay available (see src/lib/module-dependencies.ts
                // and 2026-09-29 scope decision in LEADSQUARED_GAP_CHECKLIST.md Module 21).
                if (["0", "1", "5"].includes(section.id)) return dataPlatformEnabled;
                if (section.id === "3") return telephonyEnabled;
                return true;
            })} />
            </div>

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
                        <Label htmlFor="integrations-webhook-name-1">Webhook Name</Label>
                        <Input id="integrations-webhook-name-1"
                            value={newWebhook.name}
                            onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })}
                            placeholder="e.g. My Zapier Lead Webhook"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="integrations-destination-url-1">Destination URL</Label>
                        <Input id="integrations-destination-url-1"
                            value={newWebhook.url}
                            onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
                            placeholder="https://hooks.zapier.com/..."
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="integrations-secret-optional-1">Secret (Optional)</Label>
                        <Input id="integrations-secret-optional-1"
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
                                <label key={event} className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
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
                        <Label htmlFor="integrations-rate-limit-deliveries-per-minute-1">Rate Limit (deliveries per minute)</Label>
                        <Input id="integrations-rate-limit-deliveries-per-minute-1"
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
                                    <TableCell className="whitespace-nowrap text-xs">{formatWorkspaceDateTime(delivery.createdAt)}</TableCell>
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
                            <Label htmlFor="integrations-load-saved-mapping-1">Load saved mapping</Label>
                            <div className="flex min-w-0 flex-wrap gap-2">
                                <Select value={selectedTemplateId || NONE_VALUE} onValueChange={(value) => value !== NONE_VALUE && handleLoadImportTemplate(value)}>
                                    <SelectTrigger id="integrations-load-saved-mapping-1" className="w-full">
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
                                    <Button variant="ghost" size="icon" aria-label="Archive this saved mapping" onClick={() => handleDeleteImportTemplate(selectedTemplateId)}>
                                        <Trash2 className="size-4 text-destructive" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                    <ArchivedItemsSection kind="import-template" basePath="/integrations/csv/templates" noun="import template" title="Archived mappings" refreshToken={templateArchiveToken} onChange={reloadImportTemplates} />
                    <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] 2xl:items-end">
                        <div className="space-y-1.5">
                            <Label htmlFor="integrations-module-1">Module</Label>
                            <Select
                                value={importModule}
                                onValueChange={(value) => { setImportModule(value as any); setCsvHeaders([]); setCsvRows([]); setMappings({}); }}
                            >
                                <SelectTrigger id="integrations-module-1" className="w-full">
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
                            <Label htmlFor="integrations-duplicates-1">Duplicates</Label>
                            <Select value={duplicateMode} onValueChange={(value) => setDuplicateMode(value as any)}>
                                <SelectTrigger id="integrations-duplicates-1" className="w-full">
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
                                <Label htmlFor="integrations-save-this-mapping-as-a-reusable-template-optional-1">Save this mapping as a reusable template (optional)</Label>
                                <Input id="integrations-save-this-mapping-as-a-reusable-template-optional-1"
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
