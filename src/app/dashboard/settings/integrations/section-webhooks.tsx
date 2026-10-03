"use client";

import { Plus, Trash2, CheckCircle2, Ban, Info, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Webhook } from "./integrations-shared";
import type { IntegrationsSettings } from "./use-integrations-settings";

// The "webhooks" section of Settings › Integrations, moved here from page.tsx unchanged.
export function WebhooksSection({ s }: { s: IntegrationsSettings }) {
    const { webhooks, loading, setIsAddingWebhook, togglingWebhookId, testingWebhookId, handleDeleteWebhook, handleToggleWebhookActive, handleTestWebhook, openWebhookDeliveries } = s;
    return (
        <div className="min-w-0 space-y-4">
                    <div className="flex min-w-0 flex-wrap items-center justify-between">
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
                                    <div key={wh.id} className="flex min-w-0 flex-wrap items-start justify-between gap-3 p-4">
                                        <div className="flex min-w-0 flex-wrap items-start gap-3">
                                            {wh.isActive ? (
                                                <CheckCircle2 className="mt-0.5 size-5 text-status-success-foreground" />
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
                                        <div className="flex min-w-0 flex-wrap items-center gap-1">
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
                </div>
    );
}
