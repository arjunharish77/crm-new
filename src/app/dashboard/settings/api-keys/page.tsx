"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Plus, RotateCw, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StandardDialog } from "@/components/common/standard-dialog";
import { formatWorkspaceDateTime, formatWorkspaceRelativeTime } from "@/lib/date-format";
import { useFeature } from "@/components/auth/feature-gate";

type ModuleScope = "none" | "read" | "full";

type ApiKeyRow = {
    id: string;
    name: string;
    permissions: Record<string, "full" | Record<string, boolean>>;
    ipAllowlist: string[] | null;
    rateLimitPerMinute: number;
    expiresAt: string | null;
    lastUsedAt: string | null;
    lastUsedIp: string | null;
    isActive: boolean;
    revokedAt: string | null;
    createdAt: string;
};

const SCOPED_MODULES = [
    { key: "leads", label: "Leads" },
    { key: "opportunities", label: "Opportunities" },
    { key: "users", label: "Users (SCIM provisioning)" },
] as const;

function scopeFor(permissions: ApiKeyRow["permissions"] | undefined, moduleKey: string): ModuleScope {
    const value = permissions?.[moduleKey];
    if (value === "full") return "full";
    if (value && typeof value === "object" && value.read) return "read";
    return "none";
}

function buildPermissions(scopes: Record<string, ModuleScope>) {
    const permissions: Record<string, "full" | Record<string, boolean>> = {};
    for (const [key, scope] of Object.entries(scopes)) {
        if (scope === "full") permissions[key] = "full";
        else if (scope === "read") permissions[key] = { read: true };
    }
    return permissions;
}

function emptyScopes(): Record<string, ModuleScope> {
    return Object.fromEntries(SCOPED_MODULES.map((m) => [m.key, "none" as ModuleScope]));
}

export default function ApiKeysSettingsPage() {
    const apiAccessEnabled = useFeature("apiAccessEnabled");
    const [keys, setKeys] = useState<ApiKeyRow[]>([]);
    const [loadError, setLoadError] = useState(false);
    const [createError, setCreateError] = useState("");
    const [actionError, setActionError] = useState("");
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [name, setName] = useState("");
    const [scopes, setScopes] = useState<Record<string, ModuleScope>>(emptyScopes());
    const [ipAllowlistText, setIpAllowlistText] = useState("");
    const [rateLimitPerMinute, setRateLimitPerMinute] = useState("60");
    const [expiresAt, setExpiresAt] = useState("");
    const [saving, setSaving] = useState(false);
    const [revealedSecret, setRevealedSecret] = useState<{ keyId: string; secret: string } | null>(null);
    const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);

    const load = () => {
        if (!apiAccessEnabled) {
            setLoading(false);
            return;
        }
        setLoadError(false);
        setLoading(true);
        apiFetch<ApiKeyRow[]>("/settings/api-keys")
            .then((data) => setKeys(Array.isArray(data) ? data : []))
            .catch(() => setLoadError(true))
            .finally(() => setLoading(false));
    };

    useEffect(load, [apiAccessEnabled]);

    const resetCreateForm = () => {
        setName("");
        setScopes(emptyScopes());
        setIpAllowlistText("");
        setRateLimitPerMinute("60");
        setExpiresAt("");
    };

    const handleCreate = async () => {
        if (saving) return;
        setCreateError("");
        const rate = Number(rateLimitPerMinute);
        if (!Number.isInteger(rate) || rate < 1) { setCreateError("Rate limit must be a positive whole number."); return; }
        setSaving(true);
        try {
            const ipAllowlist = ipAllowlistText
                .split(/[\n,]/)
                .map((v) => v.trim())
                .filter(Boolean);
            const created = await apiFetch<ApiKeyRow & { secret: string }>("/settings/api-keys", {
                method: "POST",
                body: JSON.stringify({
                    name,
                    permissions: buildPermissions(scopes),
                    ipAllowlist,
                    rateLimitPerMinute: rate,
                    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
                }),
            });
            toast.success("API key created");
            setIsCreating(false);
            resetCreateForm();
            setRevealedSecret({ keyId: created.id, secret: created.secret });
            load();
        } catch (error: any) {
            setCreateError(error?.message || "Failed to create API key");
        } finally {
            setSaving(false);
        }
    };

    const handleRotate = async (key: ApiKeyRow) => {
        if (busy) return;
        setBusy(true);
        setActionError("");
        try {
            const rotated = await apiFetch<(ApiKeyRow & { secret: string }) | { pendingApproval: true; requestId: string }>(`/settings/api-keys/${key.id}/rotate`, { method: "POST" });
            if ("pendingApproval" in rotated) {
                toast.success("Rotation request submitted -- a different admin must approve it before the key is rotated.");
                return;
            }
            toast.success("API key rotated -- the previous secret keeps working for 24 hours");
            setRevealedSecret({ keyId: rotated.id, secret: rotated.secret });
            load();
        } catch (error: any) {
            setActionError(error?.message || "Failed to rotate API key");
        } finally { setBusy(false); }
    };

    const handleRevoke = async () => {
        if (!revokeTarget || busy) return;
        setBusy(true);
        setActionError("");
        try {
            await apiFetch(`/settings/api-keys/${revokeTarget.id}`, { method: "DELETE" });
            toast.success("API key revoked");
            setRevokeTarget(null);
            load();
        } catch (error: any) {
            setActionError(error?.message || "Failed to revoke API key");
        } finally { setBusy(false); }
    };

    if (!apiAccessEnabled) {
        return (
            <div className="min-w-0 space-y-4">
                <div>
                    <h1 className="text-lg font-bold">API Keys</h1>
                    <p className="text-sm text-muted-foreground">Manage credentials for external systems to call this workspace&apos;s API.</p>
                </div>
                <Alert variant="info">
                    <KeyRound />
                    <AlertDescription>API Access is not enabled for this workspace. Ask a platform admin to enable it under tenant features.</AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="min-w-0 space-y-4">
            <PageHeader title="API Keys" description="Manage scoped credentials for external systems, including access, rate limits and expiry." actions={
                <Button disabled={loading || loadError || busy} onClick={() => { setCreateError(""); setIsCreating(true); }}><Plus className="size-4" />New API Key</Button>
            } />
            {actionError && !revokeTarget && <p role="alert" className="break-words text-sm text-destructive">{actionError}</p>}

            {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
            ) : loadError ? <ErrorState description="API keys could not be loaded." onRetry={load} /> : keys.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">No API keys yet.</Card>
            ) : (
                <Card className="overflow-hidden py-0">
                    <div className="divide-y">
                        {keys.map((key) => (
                            <div key={key.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                                <div className="min-w-0 max-w-full flex-1 basis-48 break-all">
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <p className="min-w-0 max-w-full break-all text-sm font-medium">{key.name}</p>
                                        <Badge variant={key.isActive ? "outline" : "secondary"}>{key.isActive ? "Active" : "Revoked"}</Badge>
                                        {key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now() && (
                                            <Badge variant="destructive">Expired</Badge>
                                        )}
                                    </div>
                                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{key.id}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {SCOPED_MODULES.filter((m) => scopeFor(key.permissions, m.key) !== "none")
                                            .map((m) => `${m.label} (${scopeFor(key.permissions, m.key)})`)
                                            .join(", ") || "No module scopes granted"}
                                    </p>
                                </div>

                                <div className="text-xs text-muted-foreground">
                                    <div>{key.rateLimitPerMinute} req/min</div>
                                    <div>{key.ipAllowlist?.length ? `${key.ipAllowlist.length} IP(s) allowed` : "Any IP"}</div>
                                </div>

                                <div className="text-xs text-muted-foreground">
                                    <div>{key.lastUsedAt ? `Last used ${formatWorkspaceRelativeTime(key.lastUsedAt)}` : "Never used"}</div>
                                    <div>{key.expiresAt ? `Expires ${formatWorkspaceDateTime(key.expiresAt)}` : "No expiry"}</div>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <Button variant="outline" size="sm" onClick={() => handleRotate(key)} disabled={busy || !key.isActive}>
                                        <RotateCw className="size-3.5" />
                                        Rotate
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => { setActionError(""); setRevokeTarget(key); }}
                                        disabled={busy || !key.isActive}
                                    >
                                        <Trash2 className="size-3.5" />
                                        Revoke
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            <StandardDialog
                open={isCreating}
                onClose={() => { if (!saving) setIsCreating(false); }}
                title="New API Key"
                maxWidth="sm"
                actions={
                    <>
                        <Button disabled={saving} variant="outline" onClick={() => setIsCreating(false)}>Cancel</Button>
                        <Button onClick={handleCreate} disabled={!name.trim() || saving}>{saving ? "Creating..." : "Create Key"}</Button>
                    </>
                }
            >
                <div className="min-w-0 space-y-4 py-2">
                    {createError && <p role="alert" className="break-words text-sm text-destructive">{createError}</p>}
                    <div className="space-y-1.5">
                        <Label htmlFor="key-name">Name</Label>
                        <Input id="key-name" disabled={saving} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marketing automation script" />
                    </div>

                    <div className="space-y-1.5">
                        <Label>Module Access</Label>
                        {SCOPED_MODULES.map((m) => (
                            <div key={m.key} className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                                <span className="text-sm">{m.label}</span>
                                <Select disabled={saving}
                                    value={scopes[m.key]}
                                    onValueChange={(value) => setScopes((current) => ({ ...current, [m.key]: value as ModuleScope }))}
                                >
                                    <SelectTrigger aria-label={`${m.label} access`} className="w-full min-w-0 sm:w-40"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No access</SelectItem>
                                        <SelectItem value="read">Read only</SelectItem>
                                        <SelectItem value="full">Read &amp; create</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="key-ips">IP Allowlist (optional)</Label>
                        <Textarea id="key-ips" disabled={saving}
                            value={ipAllowlistText}
                            onChange={(e) => setIpAllowlistText(e.target.value)}
                            placeholder="One IP per line -- leave blank to allow any IP"
                            rows={2}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="key-rate">Rate Limit (per minute)</Label>
                            <Input id="key-rate" disabled={saving} type="number" min={1} value={rateLimitPerMinute} onChange={(e) => setRateLimitPerMinute(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="key-expiry">Expires (optional)</Label>
                            <Input id="key-expiry" disabled={saving} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                        </div>
                    </div>
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!revealedSecret}
                onClose={() => setRevealedSecret(null)}
                title="API Key Secret"
                maxWidth="sm"
                actions={<Button onClick={() => setRevealedSecret(null)}>Done</Button>}
            >
                <div className="space-y-3 py-2">
                    <Alert variant="destructive">
                        <KeyRound />
                        <AlertDescription>This secret is shown once. Copy it now -- it can&apos;t be retrieved again (only rotated).</AlertDescription>
                    </Alert>
                    <div className="space-y-1.5">
                        <Label>Key ID</Label>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <code className="min-w-0 flex-1 break-all rounded-md border bg-muted px-2 py-1.5 text-xs">{revealedSecret?.keyId}</code>
                            <Button aria-label="Copy key ID" variant="outline" size="icon-sm" onClick={() => revealedSecret && navigator.clipboard.writeText(revealedSecret.keyId).catch(() => toast.error("Copy failed. Select and copy the key ID manually."))}>
                                <Copy className="size-3.5" />
                            </Button>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Secret</Label>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <code className="min-w-0 flex-1 break-all rounded-md border bg-muted px-2 py-1.5 text-xs">{revealedSecret?.secret}</code>
                            <Button aria-label="Copy secret" variant="outline" size="icon-sm" onClick={() => revealedSecret && navigator.clipboard.writeText(revealedSecret.secret).catch(() => toast.error("Copy failed. Select and copy the secret manually."))}>
                                <Copy className="size-3.5" />
                            </Button>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Example request</Label>
                        <code className="block whitespace-pre-wrap break-all rounded-md border bg-muted px-2 py-1.5 text-xs">
                            {`curl -H "Authorization: Bearer ${revealedSecret?.keyId}.${revealedSecret?.secret}" \\\n  ${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/leads`}
                        </code>
                    </div>
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!revokeTarget}
                onClose={() => { if (!busy) setRevokeTarget(null); }}
                title="Revoke API Key"
                maxWidth="sm"
                actions={
                    <>
                        <Button disabled={busy} variant="outline" onClick={() => setRevokeTarget(null)}>Cancel</Button>
                        <Button disabled={busy} variant="destructive" onClick={handleRevoke}>{busy ? "Revoking…" : "Revoke"}</Button>
                    </>
                }
            >
                {actionError && <p role="alert" className="break-words text-sm text-destructive">{actionError}</p>}
                <p className="break-words py-2 text-sm text-muted-foreground">
                    Revoking &quot;{revokeTarget?.name}&quot; immediately blocks any further requests using it. This can&apos;t be undone --
                    a new key would need to be created instead.
                </p>
            </StandardDialog>
        </div>
    );
}
