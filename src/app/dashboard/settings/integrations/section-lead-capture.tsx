"use client";

import { CheckCircle2, Ban, Copy, AlertTriangle, Send, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { ApiBox, INBOUND_EVENT_STATUS_CLASSNAMES, Webhook } from "./integrations-shared";
import type { IntegrationsSettings } from "./use-integrations-settings";

// The "lead-capture" section of Settings › Integrations, moved here from page.tsx unchanged.
export function LeadCaptureSection({ s }: { s: IntegrationsSettings }) {
    const { loading, sectionState, inboundSettings, inboundEvents, rotatingInboundSecret, showInboundSecret, setShowInboundSecret, testPayload, setTestPayload, testingInbound, testResult, fetchInboundWebhookData, handleRotateInboundSecret, handleSendTestPayload, handleRetryInboundEvent, copyToClipboard } = s;
    return (
        <div className="min-w-0 space-y-4">{sectionState.inbound === 'loading' ? <p role="status" className="py-4 text-sm text-muted-foreground">Loading inbound capture…</p> : sectionState.inbound === 'error' ? <div role="alert" className="rounded-lg border p-4 text-sm">Unable to load inbound capture. <Button variant="outline" size="sm" onClick={fetchInboundWebhookData}>Retry</Button></div> : <>
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
                                <AlertTriangle className="text-status-warning-foreground" />
                                <AlertDescription>
                                    Send a POST body with at least <code>name</code>. Email, phone, company, source, and status are also accepted.
                                    Sign requests with <code>X-Webhook-Timestamp</code> (unix seconds) and <code>X-Webhook-Signature</code>
                                    (hex HMAC-SHA256 of <code>{'{timestamp}.{rawBody}'}</code> using the secret below). Requests older than 5 minutes are rejected.
                                    An optional <code>X-Idempotency-Key</code> header prevents duplicate leads on retry.
                                </AlertDescription>
                            </Alert>

                            {inboundSettings && (
                                <div className="space-y-2 rounded-lg border p-3">
                                    <Label htmlFor="integrations-signing-secret-1">Signing secret</Label>
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <Input id="integrations-signing-secret-1"
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
                                            Previous secret still valid until {inboundSettings.previousSecretExpiresAt ? formatWorkspaceDateTime(inboundSettings.previousSecretExpiresAt) : '—'}.
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
                                                <TableCell className="whitespace-nowrap text-xs">{formatWorkspaceDateTime(event.createdAt)}</TableCell>
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
                </>}</div>
    );
}
