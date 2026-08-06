"use client";

import { useEffect, useMemo, useState } from "react";
import { Share2, Send, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { apiFetch } from "@/lib/api";

const LEAD_ONLY_VALUE = "__lead_only__";

interface ExternalPushDialogProps {
    open: boolean;
    onClose: () => void;
    leadId?: string | null;
    opportunityId?: string | null;
    /** Other Opportunities linked to this Lead (Lead-page trigger only) -- shown as a picker when there's more than one. */
    linkedOpportunities?: Array<{ id: string; title?: string; name?: string }>;
    onPushed?: () => void;
}

interface PreviewState {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: unknown;
    unresolvedTokens: string[];
    authType: string;
}

export function ExternalPushDialog({ open, onClose, leadId, opportunityId, linkedOpportunities, onPushed }: ExternalPushDialogProps) {
    const [integrations, setIntegrations] = useState<any[]>([]);
    const [integrationId, setIntegrationId] = useState("");
    const [selectedOpportunityId, setSelectedOpportunityId] = useState<string>("");
    const [preview, setPreview] = useState<PreviewState | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<any>(null);

    const showOpportunityPicker = Boolean(leadId) && !opportunityId && (linkedOpportunities?.length ?? 0) > 1;
    const effectiveOpportunityId = opportunityId || (showOpportunityPicker
        ? (selectedOpportunityId === LEAD_ONLY_VALUE ? null : selectedOpportunityId || null)
        : linkedOpportunities?.[0]?.id ?? null);

    useEffect(() => {
        if (!open) return;
        apiFetch("/settings/integrations/external")
            .then((data) => {
                const active = Array.isArray(data) ? data.filter((item: any) => item.isActive) : [];
                setIntegrations(active);
                setIntegrationId((current) => current || active[0]?.id || "");
            })
            .catch(() => setIntegrations([]));
    }, [open]);

    useEffect(() => {
        if (!open) {
            setResult(null);
            setPreview(null);
            setSelectedOpportunityId("");
        }
    }, [open]);

    useEffect(() => {
        if (!open || !integrationId || result) return;
        if (showOpportunityPicker && !selectedOpportunityId) {
            setPreview(null);
            return;
        }
        setLoadingPreview(true);
        apiFetch(`/external-integrations/${integrationId}/push`, {
            method: "POST",
            body: JSON.stringify({ leadId, opportunityId: effectiveOpportunityId, dryRun: true }),
        })
            .then((data) => setPreview(data))
            .catch(() => setPreview(null))
            .finally(() => setLoadingPreview(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, integrationId, effectiveOpportunityId, showOpportunityPicker, selectedOpportunityId, result]);

    const handleSend = async () => {
        if (!integrationId) return;
        setSending(true);
        try {
            const data = await apiFetch(`/external-integrations/${integrationId}/push`, {
                method: "POST",
                body: JSON.stringify({ leadId, opportunityId: effectiveOpportunityId }),
            });
            setResult(data);
            onPushed?.();
        } catch (error: any) {
            setResult({ status: "FAILED", errorMessage: error?.message || "Failed to push" });
        } finally {
            setSending(false);
        }
    };

    const handleClose = () => {
        onClose();
        setResult(null);
    };

    const opportunityOptions = useMemo(() => linkedOpportunities ?? [], [linkedOpportunities]);
    const canSend = Boolean(integrationId) && !(showOpportunityPicker && !selectedOpportunityId);

    return (
        <StandardDialog
            open={open}
            onClose={handleClose}
            title="Push to External System"
            icon={<Share2 className="size-5" />}
            maxWidth="sm"
        >
            {integrations.length === 0 ? (
                <Alert>
                    <AlertDescription>
                        No active external integrations are configured. Set one up under Settings &gt; Integrations &gt; External Push.
                    </AlertDescription>
                </Alert>
            ) : (
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label>Integration</Label>
                        <Select value={integrationId} onValueChange={(value) => { setIntegrationId(value); setResult(null); }}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {integrations.map((integration) => (
                                    <SelectItem key={integration.id} value={integration.id}>{integration.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {showOpportunityPicker && (
                        <div className="space-y-1.5">
                            <Label>Opportunity</Label>
                            <Select value={selectedOpportunityId || undefined} onValueChange={(value) => { setSelectedOpportunityId(value); setResult(null); }}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Choose which Opportunity to include" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={LEAD_ONLY_VALUE}>Lead only (no Opportunity)</SelectItem>
                                    {opportunityOptions.map((opportunity) => (
                                        <SelectItem key={opportunity.id} value={opportunity.id}>
                                            {opportunity.title || opportunity.name || "Untitled opportunity"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {!result && (
                        <div className="space-y-1.5">
                            <Label>Request Preview</Label>
                            {loadingPreview ? (
                                <div className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground">
                                    <Loader2 className="size-4 animate-spin" />
                                    Building preview...
                                </div>
                            ) : preview ? (
                                <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs">
                                    <div className="font-mono">
                                        <span className="font-bold">{preview.method}</span> {preview.url}
                                    </div>
                                    <div className="font-mono text-muted-foreground">
                                        Auth: {preview.authType}
                                    </div>
                                    {Object.keys(preview.headers ?? {}).length > 0 && (
                                        <pre className="max-h-24 overflow-auto whitespace-pre-wrap font-mono">{JSON.stringify(preview.headers, null, 2)}</pre>
                                    )}
                                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono">{JSON.stringify(preview.body, null, 2)}</pre>
                                    {preview.unresolvedTokens?.length > 0 && (
                                        <p className="text-amber-600">
                                            Unresolved tokens (will send empty): {preview.unresolvedTokens.join(", ")}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">Select an integration to preview the request.</p>
                            )}
                        </div>
                    )}

                    {result && (
                        <Alert variant={result.status === "SUCCESS" ? "default" : "destructive"}>
                            {result.status === "SUCCESS" ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                            <AlertTitle>{result.status === "SUCCESS" ? "Pushed successfully" : "Push failed"}</AlertTitle>
                            <AlertDescription>
                                {result.status === "SUCCESS"
                                    ? result.externalRecordId
                                        ? `External record ID: ${result.externalRecordId}`
                                        : "The external system accepted the request."
                                    : result.errorMessage || `Request failed with status ${result.responseStatusCode ?? "unknown"}`}
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="flex justify-end gap-2">
                        {result ? (
                            <Button variant="outline" onClick={() => setResult(null)}>Push again</Button>
                        ) : (
                            <Button onClick={handleSend} disabled={!canSend || sending}>
                                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                                {sending ? "Sending..." : "Send"}
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </StandardDialog>
    );
}
