"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { requiredModules } from "@/lib/module-dependencies";
import { TenantUsageLimits } from "@/components/admin/tenant-usage-limits";
import { ModuleHealthBadge, ModuleHealthIssues, healthWorthShowing, type ModuleHealth } from "@/components/admin/module-health";
import { formatWorkspaceDate } from "@/lib/date-format";

type TenantModule = {
    key: string;
    name: string;
    description: string | null;
    category: string;
    isCore: boolean;
    status: "ENABLED" | "DISABLED" | "SUSPENDED" | "TRIAL";
    trialEndsAt: string | null;
    pendingRequest: { id: string; createdAt: string } | null;
};

const STATUS_LABEL: Record<TenantModule["status"], string> = { ENABLED: "Enabled", TRIAL: "Trial", SUSPENDED: "Suspended", DISABLED: "Not included" };

// Tenant admins (decision 2026-09-29): see this workspace's modules and ask for access. Only
// platform admins change what is enabled; approvals and declines arrive as notifications.
export default function WorkspaceModulesPage() {
    const [modules, setModules] = useState<TenantModule[] | null>(null);
    const [loadError, setLoadError] = useState("");
    const [requesting, setRequesting] = useState<TenantModule | null>(null);
    const [message, setMessage] = useState("");
    const [saving, setSaving] = useState(false);
    const [requestError, setRequestError] = useState("");
    const [health, setHealth] = useState<Record<string, ModuleHealth>>({});
    const [healthError, setHealthError] = useState("");

    const load = useCallback(async () => {
        setLoadError("");
        try {
            setModules(await apiFetch<TenantModule[]>("/settings/modules"));
        } catch (error: any) {
            setLoadError(error.status === 403 ? "Only workspace administrators can view modules." : error.originalMessage || error.message || "Unable to load modules");
        }
    }, []);
    // Health is computed live and loads on its own, so a slow or failed check never hides the modules.
    const loadHealth = useCallback(async () => {
        setHealthError("");
        try {
            const rows = await apiFetch<unknown>("/settings/modules/health");
            if (!Array.isArray(rows)) throw new Error("Module health is not available right now.");
            setHealth(Object.fromEntries((rows as ModuleHealth[]).map((row) => [row.moduleKey, row])));
        } catch (error: any) {
            setHealthError(error.originalMessage || error.message || "Module health is not available right now.");
        }
    }, []);
    useEffect(() => { void load(); void loadHealth(); }, [load, loadHealth]);

    const names = Object.fromEntries((modules ?? []).map((module) => [module.key, module.name]));

    const submitRequest = async () => {
        if (!requesting) return;
        setSaving(true);
        setRequestError("");
        try {
            await apiFetch("/settings/modules/requests", { method: "POST", body: JSON.stringify({ moduleKey: requesting.key, message: message.trim() || null }) });
            toast.success(`Request for ${requesting.name} sent to your platform administrator`);
            setRequesting(null);
            await load();
        } catch (error: any) {
            setRequestError(error.message || "Unable to send the request");
        } finally {
            setSaving(false);
        }
    };

    const withdraw = async (module: TenantModule) => {
        if (!module.pendingRequest) return;
        try {
            await apiFetch(`/settings/modules/requests/${module.pendingRequest.id}`, { method: "DELETE" });
            toast.success("Request withdrawn");
            await load();
        } catch (error: any) {
            toast.error(error.message || "Unable to withdraw the request");
        }
    };

    if (loadError) return <ErrorState title="Modules unavailable" description={loadError} onRetry={load} />;
    if (!modules) return <p role="status" className="p-4 text-sm">Loading modules…</p>;

    const optional = modules.filter((module) => !module.isCore);
    const core = modules.filter((module) => module.isCore);

    return (
        <div className="min-w-0 space-y-4">
            <PageHeader title="Modules" description="What your workspace includes. Your platform administrator enables modules; you can request access here." />
            {healthError && (
                <div role="alert" className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-destructive">
                    <span className="min-w-0 break-words">Module health: {healthError}</span>
                    <Button size="sm" variant="outline" onClick={loadHealth}>Retry</Button>
                </div>
            )}
            <section aria-label="Optional modules" className="grid min-w-0 gap-3 md:grid-cols-2">
                {optional.map((module) => (
                    <div key={module.key} className="flex min-w-0 flex-col gap-2 rounded-xl border p-4">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <h2 className="min-w-0 break-words font-medium">{module.name}</h2>
                            <Badge variant="outline">{STATUS_LABEL[module.status]}</Badge>
                            {healthWorthShowing(health[module.key]) && <ModuleHealthBadge health={health[module.key]} />}
                        </div>
                        {health[module.key] && <ModuleHealthIssues health={health[module.key]} links />}
                        {module.description && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{module.description}</p>}
                        {module.status === "TRIAL" && module.trialEndsAt && <p className="text-sm">Trial ends {formatWorkspaceDate(module.trialEndsAt)}. After that it is suspended (your data is kept) unless it is enabled.</p>}
                        {module.status === "SUSPENDED" && <p className="text-sm">Suspended: your data is kept and scheduled work is paused until it is enabled again.</p>}
                        {requiredModules(module.key).length > 0 && <p className="text-xs text-muted-foreground">Requires {requiredModules(module.key).map((key) => names[key] ?? key).join(" and ")}.</p>}
                        {module.status !== "ENABLED" && (
                            module.pendingRequest ? (
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                    <span>Request pending since {formatWorkspaceDate(module.pendingRequest.createdAt)}.</span>
                                    <Button size="sm" variant="outline" className="h-auto min-h-9 max-w-full whitespace-normal break-words" onClick={() => withdraw(module)}>Withdraw request</Button>
                                </div>
                            ) : (
                                <Button size="sm" className="h-auto min-h-9 max-w-full self-start whitespace-normal break-words text-left" onClick={() => { setRequesting(module); setMessage(""); setRequestError(""); }}>
                                    {module.status === "TRIAL" ? `Request to keep ${module.name}` : `Request ${module.name}`}
                                </Button>
                            )
                        )}
                    </div>
                ))}
            </section>
            <p className="text-sm text-muted-foreground">Always included: {core.map((module) => module.name).join(", ")}.</p>
            <section aria-label="Usage and limits" className="min-w-0 space-y-2">
                <h2 className="font-medium">Usage and limits</h2>
                <TenantUsageLimits endpoint="/settings/usage" editable={false} />
            </section>

            <StandardDialog
                open={!!requesting}
                onClose={() => { if (!saving) setRequesting(null); }}
                title={requesting ? `Request ${requesting.name}` : ""}
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="outline" onClick={() => setRequesting(null)} disabled={saving}>Cancel</Button>
                        <Button onClick={submitRequest} disabled={saving}>{saving ? "Sending…" : "Send request"}</Button>
                    </>
                }
            >
                <div className="min-w-0 space-y-2 text-sm">
                    <p>Your platform administrator is notified and decides; you are notified of the outcome.</p>
                    <Label htmlFor="module-request-message">Message (optional)</Label>
                    <Textarea id="module-request-message" value={message} maxLength={1000} onChange={(event) => setMessage(event.target.value)} placeholder="What you need it for, how many users…" />
                    {requestError && <p role="alert" className="break-words text-destructive">{requestError}</p>}
                </div>
            </StandardDialog>
        </div>
    );
}
