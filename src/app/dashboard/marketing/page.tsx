"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CheckCircle2, Eye, Mail, Megaphone, MessageSquareText, Pause, Play, Plus, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDateTime } from "@/lib/date-format";

type Channel = "EMAIL" | "WHATSAPP" | "SMS";
type AudienceType = "LEAD_LIST" | "SAVED_VIEW" | "MANUAL";

type Campaign = {
    id: string;
    name: string;
    description?: string | null;
    channel: Channel;
    campaignType: "BROADCAST" | "DRIP";
    status: string;
    audienceType: AudienceType;
    audienceConfig: Record<string, any>;
    subject?: string | null;
    body: string;
    templateId?: string | null;
    providerConfigId?: string | null;
    senderIdentityId?: string | null;
    throttlePerMinute?: number;
    quietHours?: Record<string, any>;
    updatedAt?: string;
    stats?: Record<string, number>;
};

const CHANNELS: { value: Channel; label: string; icon: typeof Mail }[] = [
    { value: "EMAIL", label: "Email", icon: Mail },
    { value: "WHATSAPP", label: "WhatsApp", icon: MessageSquareText },
    { value: "SMS", label: "SMS", icon: Send },
];

const emptyCampaign = {
    name: "",
    description: "",
    channel: "EMAIL" as Channel,
    campaignType: "BROADCAST" as const,
    audienceType: "LEAD_LIST" as AudienceType,
    audienceConfig: {},
    subject: "",
    body: "Hi {{name}},\n\nHere is an update from our admissions team.",
    throttlePerMinute: 60,
    quietHours: { enabled: true, start: "21:00", end: "09:00" },
};

function statusClassName(status: string) {
    if (status === "COMPLETED" || status === "APPROVED" || status === "SENT") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700";
    if (status === "RUNNING" || status === "SCHEDULED" || status === "QUEUED") return "border-sky-500/20 bg-sky-500/10 text-sky-700";
    if (status === "PAUSED" || status === "PENDING_APPROVAL") return "border-amber-500/20 bg-amber-500/10 text-amber-700";
    if (status === "CANCELLED" || status === "FAILED") return "border-destructive/20 bg-destructive/10 text-destructive";
    return "";
}

export default function MarketingPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);
    const [providers, setProviders] = useState<any[]>([]);
    const [senders, setSenders] = useState<any[]>([]);
    const [lists, setLists] = useState<any[]>([]);
    const [views, setViews] = useState<any[]>([]);
    const [outbox, setOutbox] = useState<any[]>([]);
    const [suppressions, setSuppressions] = useState<any[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [draft, setDraft] = useState<any>(emptyCampaign);
    const [audiencePreview, setAudiencePreview] = useState<{ count: number; sample: any[] } | null>(null);
    const [testRecipient, setTestRecipient] = useState("");
    const [suppressAddress, setSuppressAddress] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const selected = useMemo(() => campaigns.find((campaign) => campaign.id === selectedId) ?? null, [campaigns, selectedId]);
    const channelTemplates = templates.filter((template) => template.channel === draft.channel);
    const channelProviders = providers.filter((provider) => provider.channel === draft.channel);
    const channelSenders = senders.filter((sender) => sender.channel === draft.channel);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [campaignData, templateData, providerData, senderData, listData, viewData, outboxData, suppressionData] = await Promise.all([
                apiFetch<Campaign[]>("/marketing/campaigns"),
                apiFetch<any[]>("/communications/templates"),
                apiFetch<any[]>("/communications/providers"),
                apiFetch<any[]>("/communications/senders"),
                apiFetch<any[]>("/lead-lists"),
                apiFetch<any[]>("/saved-views?module=ALL"),
                apiFetch<any[]>("/communications/outbox?limit=50"),
                apiFetch<any[]>("/communications/suppressions"),
            ]);
            setCampaigns(Array.isArray(campaignData) ? campaignData : []);
            setTemplates(Array.isArray(templateData) ? templateData : []);
            setProviders(Array.isArray(providerData) ? providerData : []);
            setSenders(Array.isArray(senderData) ? senderData : []);
            setLists(Array.isArray(listData) ? listData : []);
            setViews(Array.isArray(viewData) ? viewData : []);
            setOutbox(Array.isArray(outboxData) ? outboxData : []);
            setSuppressions(Array.isArray(suppressionData) ? suppressionData : []);
            if (!selectedId && Array.isArray(campaignData) && campaignData[0]) {
                selectCampaign(campaignData[0]);
            }
        } catch {
            toast.error("Failed to load marketing communications");
        } finally {
            setLoading(false);
        }
    }, [selectedId]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    const selectCampaign = (campaign: Campaign) => {
        setSelectedId(campaign.id);
        setDraft({
            ...emptyCampaign,
            ...campaign,
            subject: campaign.subject ?? "",
            audienceConfig: campaign.audienceConfig ?? {},
            quietHours: campaign.quietHours ?? emptyCampaign.quietHours,
        });
        setAudiencePreview(null);
    };

    const startNew = () => {
        setSelectedId(null);
        setDraft(emptyCampaign);
        setAudiencePreview(null);
    };

    const saveCampaign = async () => {
        setSaving(true);
        try {
            const saved = await apiFetch<Campaign>(selectedId ? `/marketing/campaigns/${selectedId}` : "/marketing/campaigns", {
                method: selectedId ? "PUT" : "POST",
                body: JSON.stringify(draft),
            });
            toast.success("Campaign saved");
            setSelectedId(saved.id);
            setDraft({ ...emptyCampaign, ...saved, subject: saved.subject ?? "" });
            fetchAll();
        } catch {
            toast.error("Failed to save campaign");
        } finally {
            setSaving(false);
        }
    };

    const previewAudience = async () => {
        try {
            const preview = await apiFetch<{ count: number; sample: any[] }>("/marketing/audience/preview", {
                method: "POST",
                body: JSON.stringify({ audienceType: draft.audienceType, audienceConfig: draft.audienceConfig, channel: draft.channel }),
            });
            setAudiencePreview(preview);
        } catch {
            toast.error("Failed to preview audience");
        }
    };

    const updateStatus = async (status: string) => {
        if (!selectedId) return;
        try {
            await apiFetch(`/marketing/campaigns/${selectedId}/status`, {
                method: "PATCH",
                body: JSON.stringify({ status }),
            });
            toast.success("Campaign status updated");
            fetchAll();
        } catch {
            toast.error("Failed to update campaign status");
        }
    };

    const launchCampaign = async () => {
        if (!selectedId) return;
        try {
            const result: any = await apiFetch(`/marketing/campaigns/${selectedId}/launch`, { method: "POST" });
            toast.success(`Queued ${result.queued ?? 0} messages`);
            fetchAll();
        } catch {
            toast.error("Approve the campaign before launch and confirm the audience has recipients");
        }
    };

    const sendTest = async () => {
        if (!selectedId || !testRecipient.trim()) return;
        try {
            await apiFetch(`/marketing/campaigns/${selectedId}/test-send`, {
                method: "POST",
                body: JSON.stringify({ recipient: testRecipient }),
            });
            toast.success("Test send queued");
            setTestRecipient("");
            fetchAll();
        } catch {
            toast.error("Failed to queue test send");
        }
    };

    const suppressRecipient = async () => {
        if (!suppressAddress.trim()) return;
        try {
            await apiFetch("/communications/suppressions", {
                method: "POST",
                body: JSON.stringify({ channel: draft.channel, address: suppressAddress, reason: "Manual suppression" }),
            });
            toast.success("Address suppressed");
            setSuppressAddress("");
            fetchAll();
        } catch {
            toast.error("Failed to suppress address");
        }
    };

    const stats = campaigns.reduce(
        (acc, campaign) => {
            acc.recipients += Number(campaign.stats?.recipients ?? 0);
            acc.sent += Number(campaign.stats?.sent ?? 0);
            acc.clicked += Number(campaign.stats?.clicked ?? 0);
            acc.failed += Number(campaign.stats?.failed ?? 0);
            return acc;
        },
        { recipients: 0, sent: 0, clicked: 0, failed: 0 },
    );

    return (
        <div className="mx-auto flex max-w-[1480px] flex-col gap-4 px-3 py-3 md:px-4 md:py-4">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                    <h1 className="text-lg font-extrabold">Marketing Communications</h1>
                    <p className="text-sm text-muted-foreground">
                        Build nurture campaigns, approve messages, queue delivery, and track engagement across Email, WhatsApp, and SMS.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={fetchAll}>
                        <RefreshCw className="size-4" />
                        Refresh
                    </Button>
                    <Button onClick={startNew}>
                        <Plus className="size-4" />
                        New Campaign
                    </Button>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
                {([
                    ["Campaigns", campaigns.length, Megaphone],
                    ["Audience", stats.recipients, Eye],
                    ["Sent", stats.sent, CheckCircle2],
                    ["Clicks", stats.clicked, BarChart3],
                ] as const).map(([label, value, Icon]) => (
                    <Card key={String(label)} className="rounded-xl">
                        <CardContent className="flex items-center justify-between p-4">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.04em] text-muted-foreground">{String(label)}</p>
                                <p className="text-2xl font-extrabold">{Number(value).toLocaleString()}</p>
                            </div>
                            <Icon className="size-5 text-primary" />
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Tabs defaultValue="campaigns" className="space-y-3">
                <TabsList className="h-auto flex-wrap justify-start">
                    <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
                    <TabsTrigger value="composer">Composer</TabsTrigger>
                    <TabsTrigger value="compliance">Senders & Compliance</TabsTrigger>
                    <TabsTrigger value="analytics">Delivery Analytics</TabsTrigger>
                </TabsList>

                <TabsContent value="campaigns" className="grid gap-3 lg:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]">
                    <Card className="rounded-xl">
                        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                            <CardTitle className="text-base">Campaign List</CardTitle>
                            <Badge variant="outline">{loading ? "Loading" : `${campaigns.length} total`}</Badge>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {campaigns.map((campaign) => (
                                <button
                                    key={campaign.id}
                                    type="button"
                                    onClick={() => selectCampaign(campaign)}
                                    className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent ${selectedId === campaign.id ? "border-primary bg-primary/5" : "border-border"}`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="font-extrabold">{campaign.name}</div>
                                            <div className="text-xs text-muted-foreground">{campaign.channel} · {campaign.campaignType}</div>
                                        </div>
                                        <Badge variant="outline" className={statusClassName(campaign.status)}>{campaign.status.replaceAll("_", " ")}</Badge>
                                    </div>
                                    <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                                        <span>{campaign.stats?.recipients ?? 0} audience</span>
                                        <span>{campaign.stats?.sent ?? 0} sent</span>
                                        <span>{campaign.stats?.failed ?? 0} failed</span>
                                        <span>{campaign.updatedAt ? formatWorkspaceDateTime(campaign.updatedAt) : "-"}</span>
                                    </div>
                                </button>
                            ))}
                            {!campaigns.length && !loading ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No campaigns yet.</div> : null}
                        </CardContent>
                    </Card>

                    <Card className="rounded-xl">
                        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                            <div>
                                <CardTitle className="text-base">{selected ? selected.name : "Campaign Actions"}</CardTitle>
                                <p className="text-sm text-muted-foreground">Approval, testing, and launch controls.</p>
                            </div>
                            {selected ? <Badge variant="outline" className={statusClassName(selected.status)}>{selected.status.replaceAll("_", " ")}</Badge> : null}
                        </CardHeader>
                        <CardContent className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-lg border p-3">
                                <Label>Test recipient</Label>
                                <div className="mt-2 flex gap-2">
                                    <Input value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder={draft.channel === "EMAIL" ? "person@example.com" : "+919999999999"} />
                                    <Button disabled={!selectedId} onClick={sendTest}>Test</Button>
                                </div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <Label>Launch workflow</Label>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <Button disabled={!selectedId} variant="outline" onClick={() => updateStatus("PENDING_APPROVAL")}>Request approval</Button>
                                    <Button disabled={!selectedId} variant="outline" onClick={() => updateStatus("APPROVED")}>Approve</Button>
                                    <Button disabled={!selectedId} onClick={launchCampaign}>
                                        <Play className="size-4" />
                                        Launch
                                    </Button>
                                    <Button disabled={!selectedId} variant="outline" onClick={() => updateStatus("PAUSED")}>
                                        <Pause className="size-4" />
                                        Pause
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="composer">
                    <Card className="rounded-xl">
                        <CardHeader>
                            <CardTitle className="text-base">Campaign Builder</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
                            <div className="space-y-3">
                                <div>
                                    <Label>Name</Label>
                                    <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                                </div>
                                <div>
                                    <Label>Channel</Label>
                                    <Select value={draft.channel} onValueChange={(value) => setDraft({ ...draft, channel: value as Channel, templateId: null, providerConfigId: null, senderIdentityId: null })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>{CHANNELS.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>Campaign type</Label>
                                    <Select value={draft.campaignType} onValueChange={(value) => setDraft({ ...draft, campaignType: value })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="BROADCAST">One-time broadcast</SelectItem>
                                            <SelectItem value="DRIP">Drip / nurture journey</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>Audience</Label>
                                    <Select value={draft.audienceType} onValueChange={(value) => setDraft({ ...draft, audienceType: value as AudienceType, audienceConfig: {} })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="LEAD_LIST">Lead list</SelectItem>
                                            <SelectItem value="SAVED_VIEW">View</SelectItem>
                                            <SelectItem value="MANUAL">Manual recipients</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {draft.audienceType === "LEAD_LIST" ? (
                                    <Select value={draft.audienceConfig?.leadListId ?? ""} onValueChange={(value) => setDraft({ ...draft, audienceConfig: { leadListId: value } })}>
                                        <SelectTrigger><SelectValue placeholder="Select list" /></SelectTrigger>
                                        <SelectContent>{lists.map((list) => <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                ) : null}
                                {draft.audienceType === "SAVED_VIEW" ? (
                                    <Select value={draft.audienceConfig?.savedViewId ?? ""} onValueChange={(value) => setDraft({ ...draft, audienceConfig: { savedViewId: value } })}>
                                        <SelectTrigger><SelectValue placeholder="Select view" /></SelectTrigger>
                                        <SelectContent>{views.map((view) => <SelectItem key={view.id} value={view.id}>{view.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                ) : null}
                                {draft.audienceType === "MANUAL" ? (
                                    <Textarea
                                        value={(draft.audienceConfig?.recipients ?? []).join("\n")}
                                        onChange={(event) => setDraft({ ...draft, audienceConfig: { recipients: event.target.value.split(/\n|,/).map((item) => item.trim()).filter(Boolean) } })}
                                        placeholder="One email or phone per line"
                                    />
                                ) : null}
                                <Button variant="outline" onClick={previewAudience}>
                                    <Eye className="size-4" />
                                    Preview audience
                                </Button>
                            </div>

                            <div className="space-y-3">
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div>
                                        <Label>Template</Label>
                                        <Select value={draft.templateId || "NONE"} onValueChange={(value) => setDraft({ ...draft, templateId: value === "NONE" ? null : value })}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="NONE">No template</SelectItem>
                                                {channelTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>Provider</Label>
                                        <Select value={draft.providerConfigId || "AUTO"} onValueChange={(value) => setDraft({ ...draft, providerConfigId: value === "AUTO" ? null : value })}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="AUTO">Auto select active provider</SelectItem>
                                                {channelProviders.map((provider) => <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div>
                                    <Label>Sender</Label>
                                    <Select value={draft.senderIdentityId || "AUTO"} onValueChange={(value) => setDraft({ ...draft, senderIdentityId: value === "AUTO" ? null : value })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="AUTO">Default sender</SelectItem>
                                            {channelSenders.map((sender) => <SelectItem key={sender.id} value={sender.id}>{sender.name} · {sender.address}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {draft.channel === "EMAIL" ? (
                                    <div>
                                        <Label>Subject</Label>
                                        <Input value={draft.subject ?? ""} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} />
                                    </div>
                                ) : null}
                                <div>
                                    <Label>Message</Label>
                                    <Textarea className="min-h-[220px]" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
                                    <p className="mt-1 text-xs text-muted-foreground">Available tokens: {"{{name}}, {{email}}, {{phone}}, {{source}}, {{status}}, {{score}}"}</p>
                                </div>
                                <div className="grid gap-3 md:grid-cols-3">
                                    <div>
                                        <Label>Throttle / minute</Label>
                                        <Input type="number" value={draft.throttlePerMinute ?? 60} onChange={(event) => setDraft({ ...draft, throttlePerMinute: Number(event.target.value || 0) })} />
                                    </div>
                                    <div>
                                        <Label>Quiet start</Label>
                                        <Input value={draft.quietHours?.start ?? "21:00"} onChange={(event) => setDraft({ ...draft, quietHours: { ...draft.quietHours, start: event.target.value } })} />
                                    </div>
                                    <div>
                                        <Label>Quiet end</Label>
                                        <Input value={draft.quietHours?.end ?? "09:00"} onChange={(event) => setDraft({ ...draft, quietHours: { ...draft.quietHours, end: event.target.value } })} />
                                    </div>
                                </div>
                                <Button disabled={saving} onClick={saveCampaign}>{saving ? "Saving..." : "Save Campaign"}</Button>
                            </div>

                            <div className="space-y-3">
                                <div className="rounded-lg border p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <div className="font-extrabold">Audience Preview</div>
                                        <Badge variant="outline">{audiencePreview?.count ?? 0} records</Badge>
                                    </div>
                                    <div className="space-y-2">
                                        {(audiencePreview?.sample ?? []).map((item) => (
                                            <div key={`${item.entityId}-${item.recipient}`} className="rounded-md bg-muted/50 p-2 text-sm">
                                                <div className="font-bold">{item.record?.name ?? item.recipient}</div>
                                                <div className="text-xs text-muted-foreground">{item.recipient}</div>
                                            </div>
                                        ))}
                                        {audiencePreview && audiencePreview.sample.length === 0 ? <div className="text-sm text-muted-foreground">No reachable recipients for this channel.</div> : null}
                                    </div>
                                </div>
                                <div className="rounded-lg border p-3">
                                    <div className="mb-2 font-extrabold">Rendered Preview</div>
                                    <div className="rounded-md bg-muted/50 p-3 text-sm">
                                        {draft.channel === "EMAIL" ? <div className="mb-2 font-bold">{draft.subject || "No subject"}</div> : null}
                                        <pre className="whitespace-pre-wrap font-sans">{draft.body || "No message body"}</pre>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="compliance" className="grid gap-3 lg:grid-cols-2">
                    <Card className="rounded-xl">
                        <CardHeader><CardTitle className="text-base">Sender Identities</CardTitle></CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader><TableRow><TableHead>Channel</TableHead><TableHead>Name</TableHead><TableHead>Address</TableHead><TableHead>State</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {senders.map((sender) => (
                                        <TableRow key={sender.id}>
                                            <TableCell>{sender.channel}</TableCell>
                                            <TableCell>{sender.name}</TableCell>
                                            <TableCell>{sender.address}</TableCell>
                                            <TableCell><Badge variant="outline" className={sender.isVerified ? statusClassName("APPROVED") : statusClassName("PENDING_APPROVAL")}>{sender.isVerified ? "Verified" : "Pending"}</Badge></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                    <Card className="rounded-xl">
                        <CardHeader><CardTitle className="text-base">Suppression List</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex gap-2">
                                <Input value={suppressAddress} onChange={(event) => setSuppressAddress(event.target.value)} placeholder="Email or phone" />
                                <Button onClick={suppressRecipient}>
                                    <ShieldCheck className="size-4" />
                                    Suppress
                                </Button>
                            </div>
                            <Table>
                                <TableHeader><TableRow><TableHead>Channel</TableHead><TableHead>Address</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {suppressions.slice(0, 10).map((item) => (
                                        <TableRow key={item.id}><TableCell>{item.channel}</TableCell><TableCell>{item.address}</TableCell><TableCell>{item.reason ?? "-"}</TableCell></TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="analytics">
                    <Card className="rounded-xl">
                        <CardHeader><CardTitle className="text-base">Recent Delivery Queue</CardTitle></CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader><TableRow><TableHead>Channel</TableHead><TableHead>Recipient</TableHead><TableHead>Status</TableHead><TableHead>Source</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {outbox.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.channel}</TableCell>
                                            <TableCell>{item.recipient}</TableCell>
                                            <TableCell><Badge variant="outline" className={statusClassName(item.status)}>{item.status}</Badge></TableCell>
                                            <TableCell>{item.sourceType ?? "-"}</TableCell>
                                            <TableCell>{item.updatedAt ? formatWorkspaceDateTime(item.updatedAt) : "-"}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
