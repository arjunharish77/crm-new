"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, CheckCircle2, XCircle, Loader2, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatWorkspaceDateTime } from "@/lib/date-format";

type AiSettings = {
    enabled: boolean;
    providerMode: "DISABLED" | "EXTERNAL_API" | "SELF_HOSTED";
    endpointUrl: string | null;
    model: string | null;
    secretConfig: Record<string, string>;
    maxTokensPerRequest: number;
    timeoutMs: number;
    dailySpendLimitUsd: number | null;
    monthlySpendLimitUsd: number | null;
    allowedModules: string[];
    approvalRequiredForExternalSends: boolean;
};

// Gap checklist Module 7: tenant AI settings (provider connector, spend guardrails, approval
// requirements), prompt governance, and the usage/cost dashboard -- all 3 in one settings page,
// matching this codebase's existing tabbed-settings-page convention (e.g. Integrations).
export default function AiAssistantSettingsPage() {
    const [settings, setSettings] = useState<AiSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
    const [apiKeyInput, setApiKeyInput] = useState("");

    const [templates, setTemplates] = useState<any[]>([]);
    const [editingTemplate, setEditingTemplate] = useState<{ key: string; name: string; template: string } | null>(null);

    const [usage, setUsage] = useState<any>(null);

    const loadSettings = () => apiFetch<AiSettings>("/ai/settings").then(setSettings).catch(() => toast.error("Failed to load AI settings"));
    const loadTemplates = () => apiFetch<any[]>("/ai/prompt-templates").then(setTemplates).catch(() => setTemplates([]));
    const loadUsage = () => apiFetch<any>("/ai/usage").then(setUsage).catch(() => setUsage(null));

    useEffect(() => {
        loadSettings();
        loadTemplates();
        loadUsage();
    }, []);

    const saveSettings = async () => {
        if (!settings) return;
        setSaving(true);
        try {
            const payload = { ...settings, secretConfig: apiKeyInput ? { apiKey: apiKeyInput } : {} };
            const updated = await apiFetch<AiSettings>("/ai/settings", { method: "PATCH", body: JSON.stringify(payload) });
            setSettings(updated);
            setApiKeyInput("");
            toast.success("AI settings saved");
        } catch (error: any) {
            toast.error(error?.message || "Failed to save AI settings");
        } finally {
            setSaving(false);
        }
    };

    const testConnection = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            setTestResult(await apiFetch("/ai/settings/test", { method: "POST" }));
        } catch (error: any) {
            setTestResult({ ok: false, message: error?.message || "Connection test failed" });
        } finally {
            setTesting(false);
        }
    };

    const saveTemplate = async () => {
        if (!editingTemplate?.key || !editingTemplate.template) return;
        try {
            await apiFetch("/ai/prompt-templates", { method: "POST", body: JSON.stringify(editingTemplate) });
            toast.success("New template version saved");
            setEditingTemplate(null);
            loadTemplates();
        } catch (error: any) {
            toast.error(error?.message || "Failed to save template");
        }
    };

    const toggleTemplateActive = async (id: string, isActive: boolean) => {
        try {
            await apiFetch(`/ai/prompt-templates/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) });
            loadTemplates();
        } catch {
            toast.error("Failed to update template");
        }
    };

    if (!settings) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;

    return (
        <div className="mx-auto max-w-[1000px] space-y-6 p-3 md:p-4">
            <div>
                <h1 className="flex items-center gap-2 text-lg font-extrabold">
                    <Sparkles className="size-5" />
                    AI Assistant
                </h1>
                <p className="mt-1 text-xs text-muted-foreground">
                    Optional generative AI add-on. Disabled by default -- core CRM workflows never depend on this. Every action here is human-initiated
                    and requires explicit confirmation before anything is sent or saved.
                </p>
            </div>

            <Tabs defaultValue="provider">
                <TabsList className="mb-4">
                    <TabsTrigger value="provider">Provider &amp; Guardrails</TabsTrigger>
                    <TabsTrigger value="templates">Prompt Templates</TabsTrigger>
                    <TabsTrigger value="usage">Usage &amp; Cost</TabsTrigger>
                </TabsList>

                <TabsContent value="provider" className="space-y-4">
                    <Card className="space-y-4 p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold">Enable AI Assistant</p>
                                <p className="text-xs text-muted-foreground">Off by default. No AI call is ever made while this is off, regardless of provider mode below.</p>
                            </div>
                            <Switch checked={settings.enabled} onCheckedChange={(checked) => setSettings({ ...settings, enabled: checked })} />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Provider mode</Label>
                                <Select value={settings.providerMode} onValueChange={(value) => setSettings({ ...settings, providerMode: value as AiSettings["providerMode"] })}>
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="DISABLED">Disabled</SelectItem>
                                        <SelectItem value="EXTERNAL_API">External API (e.g. OpenAI-compatible)</SelectItem>
                                        <SelectItem value="SELF_HOSTED">Self-hosted (your own inference server)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Model name</Label>
                                <Input value={settings.model ?? ""} onChange={(e) => setSettings({ ...settings, model: e.target.value || null })} placeholder="e.g. gpt-4o-mini" />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label>Endpoint URL</Label>
                                <Input
                                    value={settings.endpointUrl ?? ""}
                                    onChange={(e) => setSettings({ ...settings, endpointUrl: e.target.value || null })}
                                    placeholder="https://api.openai.com/v1 or your self-hosted server's URL"
                                />
                                <p className="text-xs text-muted-foreground">
                                    A Chat Completions-compatible endpoint (<code>POST {"{endpoint}"}/chat/completions</code>) -- supported by OpenAI, Azure OpenAI,
                                    and most self-hosted inference servers (vLLM, Ollama, LM Studio, LocalAI). Same code path for both provider modes; only the endpoint differs.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>API key {settings.secretConfig?.apiKey ? "(configured)" : ""}</Label>
                                <Input type="password" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder={settings.secretConfig?.apiKey || "Leave blank to keep existing"} />
                            </div>
                            <div className="space-y-2">
                                <Label>Max tokens per request</Label>
                                <Input type="number" value={settings.maxTokensPerRequest} onChange={(e) => setSettings({ ...settings, maxTokensPerRequest: Number(e.target.value) || 1024 })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Timeout (ms)</Label>
                                <Input type="number" value={settings.timeoutMs} onChange={(e) => setSettings({ ...settings, timeoutMs: Number(e.target.value) || 30000 })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Daily spend limit (USD, blank = no limit)</Label>
                                <Input
                                    type="number"
                                    value={settings.dailySpendLimitUsd ?? ""}
                                    onChange={(e) => setSettings({ ...settings, dailySpendLimitUsd: e.target.value ? Number(e.target.value) : null })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Monthly spend limit (USD, blank = no limit)</Label>
                                <Input
                                    type="number"
                                    value={settings.monthlySpendLimitUsd ?? ""}
                                    onChange={(e) => setSettings({ ...settings, monthlySpendLimitUsd: e.target.value ? Number(e.target.value) : null })}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Allowed modules</Label>
                            <div className="flex flex-wrap gap-2">
                                {["LEAD", "OPPORTUNITY", "REPORTS"].map((moduleKey) => {
                                    const active = settings.allowedModules.includes(moduleKey);
                                    return (
                                        <Badge
                                            key={moduleKey}
                                            variant={active ? "default" : "outline"}
                                            className="cursor-pointer select-none rounded-md"
                                            onClick={() =>
                                                setSettings({
                                                    ...settings,
                                                    allowedModules: active ? settings.allowedModules.filter((m) => m !== moduleKey) : [...settings.allowedModules, moduleKey],
                                                })
                                            }
                                        >
                                            {moduleKey}
                                        </Badge>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex items-center justify-between border-t pt-4">
                            <div>
                                <p className="text-sm font-semibold">Require a second admin&apos;s approval for AI-drafted sends</p>
                                <p className="text-xs text-muted-foreground">Every send still requires the drafting user&apos;s own confirmation regardless of this setting -- this adds a distinct second approver on top, mirroring the reassignment-approval control.</p>
                            </div>
                            <Switch
                                checked={settings.approvalRequiredForExternalSends}
                                onCheckedChange={(checked) => setSettings({ ...settings, approvalRequiredForExternalSends: checked })}
                            />
                        </div>

                        <div className="flex items-center justify-between border-t pt-4">
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={testConnection} disabled={testing}>
                                    {testing ? <Loader2 className="size-4 animate-spin" /> : null}
                                    Test connection
                                </Button>
                                <Button onClick={saveSettings} disabled={saving}>{saving ? "Saving..." : "Save settings"}</Button>
                            </div>
                        </div>
                        {testResult && (
                            <Alert variant={testResult.ok ? "default" : "destructive"}>
                                {testResult.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                                <AlertDescription>{testResult.message}</AlertDescription>
                            </Alert>
                        )}
                    </Card>
                </TabsContent>

                <TabsContent value="templates" className="space-y-4">
                    <Card className="p-5">
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-semibold">Prompt templates</p>
                            <Button size="sm" variant="outline" onClick={() => setEditingTemplate({ key: "", name: "", template: "" })}>
                                <Plus className="size-4" />
                                New / edit template
                            </Button>
                        </div>
                        {editingTemplate && (
                            <div className="mb-4 space-y-2 rounded-lg border p-3">
                                <div className="grid gap-2 md:grid-cols-2">
                                    <Input placeholder="key (e.g. summarize_record)" value={editingTemplate.key} onChange={(e) => setEditingTemplate({ ...editingTemplate, key: e.target.value })} />
                                    <Input placeholder="Display name" value={editingTemplate.name} onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })} />
                                </div>
                                <Textarea rows={5} placeholder="Template text, {{tokens}} allowed" value={editingTemplate.template} onChange={(e) => setEditingTemplate({ ...editingTemplate, template: e.target.value })} />
                                <div className="flex justify-end gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setEditingTemplate(null)}>Cancel</Button>
                                    <Button size="sm" onClick={saveTemplate}>Save as new version</Button>
                                </div>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            {templates.length === 0 && <p className="text-xs text-muted-foreground">No custom template versions yet -- built-in defaults are used until you edit one.</p>}
                            {templates.map((template) => (
                                <div key={template.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                                    <div>
                                        <span className="font-semibold">{template.name}</span>{" "}
                                        <span className="text-xs text-muted-foreground">{template.key} v{template.version}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant={template.isActive ? "secondary" : "outline"}>{template.isActive ? "Active" : "Inactive"}</Badge>
                                        <Switch checked={template.isActive} onCheckedChange={(checked) => toggleTemplateActive(template.id, checked)} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </TabsContent>

                <TabsContent value="usage" className="space-y-4">
                    {usage ? (
                        <>
                            <div className="grid gap-3 md:grid-cols-4">
                                <Card className="p-4"><p className="text-xs text-muted-foreground">Requests</p><p className="text-xl font-extrabold">{usage.totals?.requests ?? 0}</p></Card>
                                <Card className="p-4"><p className="text-xs text-muted-foreground">Failures</p><p className="text-xl font-extrabold">{usage.totals?.failures ?? 0}</p></Card>
                                <Card className="p-4"><p className="text-xs text-muted-foreground">Est. cost (all time)</p><p className="text-xl font-extrabold">${Number(usage.totals?.cost ?? 0).toFixed(2)}</p></Card>
                                <Card className="p-4"><p className="text-xs text-muted-foreground">Avg latency</p><p className="text-xl font-extrabold">{Math.round(Number(usage.totals?.avgLatencyMs ?? 0))}ms</p></Card>
                            </div>
                            {(usage.budget?.dailyAlert || usage.budget?.monthlyAlert) && (
                                <Alert variant="destructive">
                                    <AlertDescription>
                                        {usage.budget.dailyAlert && `Today's spend ($${Number(usage.budget.spendToday).toFixed(2)}) has reached the daily limit. `}
                                        {usage.budget.monthlyAlert && `This month's spend ($${Number(usage.budget.spendThisMonth).toFixed(2)}) has reached the monthly limit.`}
                                    </AlertDescription>
                                </Alert>
                            )}
                            <Card className="p-4">
                                <p className="mb-2 text-sm font-semibold">By module</p>
                                <div className="space-y-1 text-sm">
                                    {(usage.byModule ?? []).map((row: any) => (
                                        <div key={row.module} className="flex justify-between border-b py-1 last:border-0">
                                            <span>{row.module}</span>
                                            <span className="text-muted-foreground">{row.requests} requests · ${Number(row.cost).toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                            <Card className="p-4">
                                <p className="mb-2 text-sm font-semibold">Recent requests</p>
                                <div className="space-y-1 text-xs">
                                    {(usage.recent ?? []).map((row: any) => (
                                        <div key={row.id} className="flex items-center justify-between border-b py-1 last:border-0">
                                            <span>{row.module} — {formatWorkspaceDateTime(row.createdAt)}</span>
                                            <Badge variant={row.status === "SUCCESS" ? "secondary" : "destructive"}>{row.status}</Badge>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">Loading usage...</p>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
