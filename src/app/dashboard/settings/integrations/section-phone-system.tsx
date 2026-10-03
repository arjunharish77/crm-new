"use client";

import { Plus, Trash2, CheckCircle2, Ban, Copy, Info, Phone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { toast } from "sonner";
import { ApiBox, FieldInput, FieldTextarea, Webhook } from "./integrations-shared";
import type { IntegrationsSettings } from "./use-integrations-settings";

// The "phone-system" section of Settings › Integrations, moved here from page.tsx unchanged.
export function PhoneSystemSection({ s }: { s: IntegrationsSettings }) {
    const { loading, sectionState, mappings, telephony, setTelephony, telephonySection, setTelephonySection, rotatingTelephonySecret, doNotCallList, teams, newDoNotCallNumber, setNewDoNotCallNumber, showTelephonySecret, setShowTelephonySecret, callLogs, testCall, setTestCall, fetchTelephony, copyToClipboard, handleSaveTelephony, handleRotateTelephonySecret, handleAddDoNotCallNumber, handleRemoveDoNotCallNumber, handleTestClickToCall } = s;
    return (
        <div className="min-w-0 space-y-4">{sectionState.telephony === 'loading' ? <p role="status" className="py-4 text-sm text-muted-foreground">Loading telephony…</p> : sectionState.telephony === 'error' ? <div role="alert" className="rounded-lg border p-4 text-sm">Unable to load telephony. <Button variant="outline" size="sm" onClick={fetchTelephony}>Retry</Button></div> : <>
                    <Card className="overflow-hidden py-0">
                        <div className="grid min-w-0">
                            <label className="grid gap-2 border-b p-4 text-sm font-medium">
                                Telephony section
                                <select value={telephonySection} onChange={event => setTelephonySection(event.target.value)} className="h-10 w-full min-w-0 rounded-md border bg-background px-3">
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
                                ].map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                                </select>
                            </label>
                            <div className="p-4">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-lg font-semibold">Universal Telephony Connector</h3>
                                        <p className="text-sm text-muted-foreground">
                                            Configure call routing, click-to-call, logs, popups, dispositions, and provider mappings.
                                        </p>
                                    </div>
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <Switch
                                            checked={telephony.isActive}
                                            onCheckedChange={(checked) => setTelephony({ ...telephony, isActive: checked })}
                                        />
                                        <Label>Enabled</Label>
                                    </div>
                                </div>

                                {telephonySection === 'virtual' && (
                                    <div className="space-y-3">
                                        <div className="grid min-w-0 gap-3 2xl:grid-cols-2">
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
                                            <Label htmlFor="integrations-webhook-signing-secret-1">Webhook Signing Secret</Label>
                                            {telephony.webhookSecret ? (
                                                <>
                                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                        <Input id="integrations-webhook-signing-secret-1"
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
                                                            Previous secret still valid until {telephony.previousWebhookSecretExpiresAt ? formatWorkspaceDateTime(telephony.previousWebhookSecretExpiresAt) : '—'}.
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
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <Checkbox
                                                checked={telephony.enableAgentPopup}
                                                onCheckedChange={(checked) => setTelephony({ ...telephony, enableAgentPopup: checked === true })}
                                            />
                                            <Label>Enable phone call popup for users</Label>
                                        </div>
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <Checkbox
                                                checked={telephony.hideAgentPopupClose}
                                                onCheckedChange={(checked) => setTelephony({ ...telephony, hideAgentPopupClose: checked === true })}
                                            />
                                            <Label>Hide close option on popup</Label>
                                        </div>
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
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
                                        <div className="grid min-w-0 gap-3 2xl:grid-cols-2">
                                            <div className="w-full space-y-1.5">
                                                <Label htmlFor="integrations-method-1">Method</Label>
                                                <Select
                                                    value={telephony.clickToCallMode}
                                                    onValueChange={(value) => setTelephony({ ...telephony, clickToCallMode: value })}
                                                >
                                                    <SelectTrigger id="integrations-method-1" className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="SERVER">Server Side API</SelectItem>
                                                        <SelectItem value="CLIENT">Client Side Script</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="w-full space-y-1.5">
                                                <Label htmlFor="integrations-http-method-1">HTTP Method</Label>
                                                <Select
                                                    value={telephony.clickToCallMethod}
                                                    onValueChange={(value) => setTelephony({ ...telephony, clickToCallMethod: value })}
                                                >
                                                    <SelectTrigger id="integrations-http-method-1" className="w-full">
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
                                        <div className="grid min-w-0 gap-3 2xl:grid-cols-2">
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
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
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
                                            <div key={key} className="flex min-w-0 flex-wrap gap-2">
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
                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
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
                                            <div className="grid min-w-0 gap-3 2xl:grid-cols-2">
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
                                            <div className="flex min-w-0 flex-wrap gap-2">
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
                                                        <div key={entry.id} className="flex min-w-0 flex-wrap items-center justify-between rounded-md border px-3 py-2">
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
                                            <Label htmlFor="integrations-recording-retention-days-1">Recording Retention (days)</Label>
                                            <Input id="integrations-recording-retention-days-1"
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
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
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
                </>}</div>
    );
}
