"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Plus, RotateCw, Trash2 } from "lucide-react";
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
        setLoading(true);
        apiFetch<ApiKeyRow[]>("/settings/api-keys")
            .then((data) => setKeys(Array.isArray(data) ? data : []))
            .catch(() => toast.error("Failed to load API keys"))
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
                    rateLimitPerMinute: Number(rateLimitPerMinute) || 60,
                    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
                }),
            });
            toast.success("API key created");
            setIsCreating(false);
            resetCreateForm();
            setRevealedSecret({ keyId: created.id, secret: created.secret });
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to create API key");
        } finally {
            setSaving(false);
        }
    };

    const handleRotate = async (key: ApiKeyRow) => {
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
            toast.error(error?.message || "Failed to rotate API key");
        }
    };

    const handleRevoke = async () => {
        if (!revokeTarget) return;
        try {
            await apiFetch(`/settings/api-keys/${revokeTarget.id}`, { method: "DELETE" });
            toast.success("API key revoked");
            setRevokeTarget(null);
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to revoke API key");
        }
    };

    if (!apiAccessEnabled) {
        return (
            <div className="space-y-4">
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
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-lg font-bold">API Keys</h1>
                    <p className="text-sm text-muted-foreground">
                        Credentials external systems use to call <code>/api/v1/*</code>. Each key is scoped to specific modules, can be
                        IP-restricted and rate-limited, and can be rotated or revoked at any time.
                    </p>
                </div>
                <Button onClick={() => setIsCreating(true)}>
                    <Plus className="size-4" />
                    New API Key
                </Button>
            </div>

            {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
            ) : keys.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">No API keys yet.</Card>
            ) : (
                <Card className="overflow-hidden py-0">
                    <div className="divide-y">
                        {keys.map((key) => (
                            <div key={key.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                                <div className="min-w-[12rem]">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium">{key.name}</p>
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
                                    <Button variant="outline" size="sm" onClick={() => handleRotate(key)} disabled={!key.isActive}>
                                        <RotateCw className="size-3.5" />
                                        Rotate
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => setRevokeTarget(key)}
                                        disabled={!key.isActive}
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
                onClose={() => setIsCreating(false)}
                title="New API Key"
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="outline" onClick={() => setIsCreating(false)}>Cancel</Button>
                        <Button onClick={handleCreate} disabled={!name.trim() || saving}>{saving ? "Creating..." : "Create Key"}</Button>
                    </>
                }
            >
                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label>Name</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marketing automation script" />
                    </div>

                    <div className="space-y-1.5">
                        <Label>Module Access</Label>
                        {SCOPED_MODULES.map((m) => (
                            <div key={m.key} className="flex items-center justify-between gap-2">
                                <span className="text-sm">{m.label}</span>
                                <Select
                                    value={scopes[m.key]}
                                    onValueChange={(value) => setScopes((current) => ({ ...current, [m.key]: value as ModuleScope }))}
                                >
                                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
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
                        <Label>IP Allowlist (optional)</Label>
                        <Textarea
                            value={ipAllowlistText}
                            onChange={(e) => setIpAllowlistText(e.target.value)}
                            placeholder="One IP per line -- leave blank to allow any IP"
                            rows={2}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Rate Limit (per minute)</Label>
                            <Input type="number" min={1} value={rateLimitPerMinute} onChange={(e) => setRateLimitPerMinute(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Expires (optional)</Label>
                            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                        </div>
                    </div>
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!revealedSecret}
                onClose={() => setRevealedSecret(null)}
                title="API Key Created"
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
                        <div className="flex items-center gap-2">
                            <code className="flex-1 truncate rounded-md border bg-muted px-2 py-1.5 text-xs">{revealedSecret?.keyId}</code>
                            <Button variant="outline" size="icon-sm" onClick={() => revealedSecret && navigator.clipboard.writeText(revealedSecret.keyId)}>
                                <Copy className="size-3.5" />
                            </Button>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Secret</Label>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 truncate rounded-md border bg-muted px-2 py-1.5 text-xs">{revealedSecret?.secret}</code>
                            <Button variant="outline" size="icon-sm" onClick={() => revealedSecret && navigator.clipboard.writeText(revealedSecret.secret)}>
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
                onClose={() => setRevokeTarget(null)}
                title="Revoke API Key"
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="outline" onClick={() => setRevokeTarget(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleRevoke}>Revoke</Button>
                    </>
                }
            >
                <p className="py-2 text-sm text-muted-foreground">
                    Revoking &quot;{revokeTarget?.name}&quot; immediately blocks any further requests using it. This can&apos;t be undone --
                    a new key would need to be created instead.
                </p>
            </StandardDialog>
        </div>
    );
}
