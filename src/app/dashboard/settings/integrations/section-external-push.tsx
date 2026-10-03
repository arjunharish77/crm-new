"use client";

import { Trash2, Info, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalIntegration, FieldInput, FieldTextarea } from "./integrations-shared";
import type { IntegrationsSettings } from "./use-integrations-settings";

// The "external-push" section of Settings › Integrations, moved here from page.tsx unchanged.
export function ExternalPushSection({ s }: { s: IntegrationsSettings }) {
    const { loading, sectionState, externalIntegrations, externalIntegrationDraft, setExternalIntegrationDraft, editingExternalIntegrationId, savingExternalIntegration, fetchExternal, startEditingExternalIntegration, startNewExternalIntegration, handleSaveExternalIntegration, handleDeleteExternalIntegration } = s;
    return (
        <div className="min-w-0 space-y-4">{sectionState.external === 'loading' ? <p role="status" className="py-4 text-sm text-muted-foreground">Loading external integrations…</p> : sectionState.external === 'error' ? <div role="alert" className="rounded-lg border p-4 text-sm">Unable to load external integrations. <Button variant="outline" size="sm" onClick={fetchExternal}>Retry</Button></div> : <>
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

                    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
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
                                        <Label htmlFor="integrations-http-method-2">HTTP Method</Label>
                                        <Select
                                            value={externalIntegrationDraft.httpMethod}
                                            onValueChange={(value) => setExternalIntegrationDraft({ ...externalIntegrationDraft, httpMethod: value })}
                                        >
                                            <SelectTrigger id="integrations-http-method-2" className="w-full">
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
                                        <Label htmlFor="integrations-auth-type-1">Auth Type</Label>
                                        <Select
                                            value={externalIntegrationDraft.authType}
                                            onValueChange={(value) => setExternalIntegrationDraft({ ...externalIntegrationDraft, authType: value as ExternalIntegration['authType'] })}
                                        >
                                            <SelectTrigger id="integrations-auth-type-1" className="w-full">
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

                                <div className="flex min-w-0 flex-wrap items-center justify-between">
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <Switch
                                            checked={externalIntegrationDraft.isActive}
                                            onCheckedChange={(checked) => setExternalIntegrationDraft({ ...externalIntegrationDraft, isActive: checked })}
                                        />
                                        <Label>Integration enabled</Label>
                                    </div>
                                    <div className="flex min-w-0 flex-wrap gap-2">
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
                                        <div key={integration.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                                            <div>
                                                <div className="font-medium">{integration.name}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {integration.httpMethod} {integration.endpointUrl}
                                                </div>
                                            </div>
                                            <div className="flex min-w-0 flex-wrap items-center gap-1">
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
                </>}</div>
    );
}
