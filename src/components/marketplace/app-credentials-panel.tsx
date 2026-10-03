"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, RotateCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { useConfirm } from "@/components/common/dialogs-provider";
import { formatWorkspaceDateTime } from "@/lib/date-format";

// One row of GET /api/marketplace/secrets. The endpoint never returns secret values -- only when
// the credential was created and last rotated, and whether the previous secret still works.
type MaskedAppSecret = {
    appId: string;
    lastRotatedAt: string | null;
    rotatedBy: string | null;
    createdAt: string;
    hasActiveGraceSecret: boolean;
    signingSecretRotatedAt: string | null;
    previousSigningSecretValidUntil: string | null;
};

// A newly rotated secret: the API secret (rotate-secret) or the webhook signing secret
// (rotate-signing-secret). Kept by the parent dialog only until it closes, and shown once.
export type RevealedAppSecret = { secret?: string; signingSecret?: string; previousValidUntil?: string };

const MASK = "••••••••••••••••";

function SecretValue({ label, value }: { label: string; value: string }) {
    return (
        <div className="space-y-1.5">
            <Label>{label}</Label>
            <div className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1.5 text-xs">{value}</code>
                <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Copy ${label.toLowerCase()}`}
                    onClick={() => navigator.clipboard.writeText(value).then(() => toast.success(`${label} copied`), () => toast.error("Couldn't copy to the clipboard"))}
                >
                    <Copy className="size-3.5" />
                </Button>
            </div>
        </div>
    );
}

export function AppCredentialsPanel({
    appId,
    appName,
    canRotate,
    revealed,
    onRevealed,
}: {
    appId: string;
    appName: string;
    canRotate: boolean;
    revealed: RevealedAppSecret | null;
    onRevealed: (value: RevealedAppSecret | null) => void;
}) {
    const confirm = useConfirm();
    const [secret, setSecret] = useState<MaskedAppSecret | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [rotating, setRotating] = useState(false);
    const [rotatingSigning, setRotatingSigning] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        setLoadError(null);
        apiFetch<MaskedAppSecret[]>("/marketplace/secrets")
            .then((data) => setSecret((Array.isArray(data) ? data : []).find((row) => row.appId === appId) ?? null))
            .catch((error: { message?: string }) => setLoadError(error?.message || "The credentials couldn't be loaded."))
            .finally(() => setLoading(false));
    }, [appId]);

    useEffect(() => { load(); }, [load]);

    const rotate = async () => {
        const ok = await confirm({
            title: `Rotate the API secret for ${appName}?`,
            description: "A new API secret is created and shown once. The previous one keeps working for 24 hours. The webhook signing secret doesn't change.",
            confirmLabel: "Rotate API secret",
        });
        if (!ok) return;
        setRotating(true);
        try {
            const result = await apiFetch<{ secret: string }>(`/marketplace/apps/${appId}/rotate-secret`, { method: "POST" });
            onRevealed({ secret: result.secret });
            toast.success("API secret rotated");
            load();
        } catch (error: any) {
            toast.error(error?.message || "The API secret couldn't be rotated");
        } finally {
            setRotating(false);
        }
    };

    const rotateSigning = async () => {
        const ok = await confirm({
            title: `Rotate the webhook signing secret for ${appName}?`,
            description: "A new signing secret is created and shown once. For 24 hours each delivery is also signed with the old one (x-app-signature-previous), so update the receiving app within that time.",
            confirmLabel: "Rotate signing secret",
        });
        if (!ok) return;
        setRotatingSigning(true);
        try {
            const result = await apiFetch<{ signingSecret: string; previousValidUntil: string }>(`/marketplace/apps/${appId}/rotate-signing-secret`, { method: "POST" });
            onRevealed({ signingSecret: result.signingSecret, previousValidUntil: result.previousValidUntil });
            toast.success("Signing secret rotated");
            load();
        } catch (error: any) {
            toast.error(error?.message || "The signing secret couldn't be rotated");
        } finally {
            setRotatingSigning(false);
        }
    };

    return (
        <div className="space-y-4">
            {revealed && (
                <div className="space-y-3 rounded-lg border p-3">
                    <Alert variant="destructive">
                        <TriangleAlert />
                        <AlertDescription>Copy it now. It&apos;s shown once and can&apos;t be retrieved again, only rotated.</AlertDescription>
                    </Alert>
                    {revealed.secret ? <SecretValue label="API secret" value={revealed.secret} /> : null}
                    {revealed.signingSecret ? <SecretValue label="Webhook signing secret" value={revealed.signingSecret} /> : null}
                    {revealed.previousValidUntil ? <p className="text-xs text-muted-foreground">The old signing secret also signs deliveries until {formatWorkspaceDateTime(revealed.previousValidUntil)}.</p> : null}
                    <div className="flex justify-end">
                        <Button size="sm" onClick={() => onRevealed(null)}>I&apos;ve copied it</Button>
                    </div>
                </div>
            )}

            {loading ? (
                <p role="status" className="py-6 text-sm text-muted-foreground">Loading credentials…</p>
            ) : loadError ? (
                <ErrorState variant="inline" description={loadError} onRetry={load} />
            ) : !secret ? (
                <EmptyState
                    variant="inline"
                    icon={<KeyRound />}
                    title="No credentials for this app"
                    description="Credentials are created when the app is registered or installed, and deleted when it's uninstalled."
                />
            ) : (
                <div className="space-y-3">
                    <ul className="divide-y rounded-lg border">
                        <li className="flex min-w-0 flex-wrap items-center gap-2 p-3">
                            <span className="text-sm font-medium">API secret</span>
                            <code className="text-xs text-muted-foreground" aria-label="Hidden value">{MASK}</code>
                            {secret.hasActiveGraceSecret && <Badge tone="warning">Previous secret still works</Badge>}
                        </li>
                        <li className="flex min-w-0 flex-wrap items-center gap-2 p-3">
                            <span className="text-sm font-medium">Webhook signing secret</span>
                            <code className="text-xs text-muted-foreground" aria-label="Hidden value">{MASK}</code>
                            {secret.previousSigningSecretValidUntil && <Badge tone="warning">Old one also signs until {formatWorkspaceDateTime(secret.previousSigningSecretValidUntil)}</Badge>}
                        </li>
                    </ul>
                    <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                        <div>
                            <dt className="text-xs text-muted-foreground">Created</dt>
                            <dd>{formatWorkspaceDateTime(secret.createdAt)}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">Last rotated</dt>
                            <dd>{secret.lastRotatedAt ? formatWorkspaceDateTime(secret.lastRotatedAt) : "Never"}</dd>
                        </div>
                    </dl>
                    <p className="text-xs text-muted-foreground">
                        Values are never shown after they&apos;re created. Rotate a secret to get a new one. Credentials are deleted when the app is uninstalled.
                    </p>
                    {canRotate && (
                        <div className="flex flex-wrap justify-end gap-2">
                            <Button variant="outline" isLoading={rotatingSigning} onClick={rotateSigning}>
                                <RotateCw className="size-4" />
                                Rotate signing secret
                            </Button>
                            <Button variant="outline" isLoading={rotating} onClick={rotate}>
                                <RotateCw className="size-4" />
                                Rotate API secret
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
