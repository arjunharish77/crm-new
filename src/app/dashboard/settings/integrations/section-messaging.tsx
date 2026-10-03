"use client";

import { Info, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CHANNELS, FieldInput, FieldTextarea } from "./integrations-shared";
import { TemplateApprovalCard } from "./template-approval-card";
import type { IntegrationsSettings } from "./use-integrations-settings";

// The "messaging" section of Settings › Integrations, moved here from page.tsx unchanged.
export function MessagingSection({ s }: { s: IntegrationsSettings }) {
    const { communicationProviders, communicationTemplates, setCommunicationTemplates, communicationOutbox, communicationChannel, setCommunicationChannel, communicationProvider, setCommunicationProvider, communicationTemplate, setCommunicationTemplate, savingCommunication, loading, sectionState, fetchMessaging, selectCommunicationChannel, updateCommunicationJson, handleSaveCommunicationProvider, handleSaveCommunicationTemplate } = s;
    return (
        <div className="min-w-0 space-y-4">{sectionState.messaging === 'loading' ? <p role="status" className="py-4 text-sm text-muted-foreground">Loading messaging…</p> : sectionState.messaging === 'error' ? <div role="alert" className="rounded-lg border p-4 text-sm">Unable to load messaging. <Button variant="outline" size="sm" onClick={fetchMessaging}>Retry</Button></div> : <>
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

                    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
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
                                        <Label htmlFor="integrations-provider-type-1">Provider Type</Label>
                                        <Select
                                            value={communicationProvider.providerType}
                                            onValueChange={(value) => setCommunicationProvider({ ...communicationProvider, providerType: value })}
                                        >
                                            <SelectTrigger id="integrations-provider-type-1" className="w-full">
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
                                    <div className="flex min-w-0 flex-wrap items-center gap-2 pt-7">
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
                                                <div className="flex min-w-0 flex-wrap items-center gap-3">
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

                    <TemplateApprovalCard
                        templates={communicationTemplates}
                        onUpdated={(updated) => setCommunicationTemplates((current) => current.map((template) => (template.id === updated.id ? { ...template, ...updated } : template)))}
                        onEdit={(template) => { selectCommunicationChannel(template.channel); setCommunicationTemplate(template); toast.info(`${template.name} is open in the template editor below`); }}
                    />

                    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
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
                                        <Label htmlFor="integrations-category-1">Category</Label>
                                        <Select
                                            value={communicationTemplate.category}
                                            onValueChange={(value) => setCommunicationTemplate({ ...communicationTemplate, category: value })}
                                        >
                                            <SelectTrigger id="integrations-category-1" className="w-full">
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
                                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
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
                </>}</div>
    );
}
