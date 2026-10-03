"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BarChart3, CheckCircle2, Columns2, Eye, Maximize2, Megaphone, Pause, Play, Plus, RefreshCw, Send, ShieldCheck, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageTabs, type PageTab } from "@/components/common/page-tabs";
import { useUrlState } from "@/hooks/use-url-state";
import { useAuth } from "@/providers/auth-provider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { JourneysPanel } from "@/components/marketing/journeys-panel";
import { useModuleEnabled } from "@/components/auth/feature-gate";
import { getFavoriteRecords, recordRecentView, toggleFavoriteRecord } from "@/lib/recent-records";
import { getSavedLayoutMode, saveLayoutMode } from "@/lib/workspace-layout";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/common/confirm-dialog";
import { useConfirm } from "@/components/common/dialogs-provider";
import { StandardDialog } from "@/components/common/standard-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { formatCount, formatMoney, formatPercent, workspaceCurrency } from "@/lib/display/format";

import { CHANNELS, statusClassName, type Campaign, type Channel } from "@/components/marketing/campaign-shared";

export default function MarketingPage() {
    const router = useRouter();
    const marketingEnabled = useModuleEnabled("MARKETING");
    const journeysEnabled = useModuleEnabled("JOURNEY_ORCHESTRATION");
    const { user } = useAuth();
    const isAdmin = Boolean(user?.isTenantAdmin || user?.isPlatformAdmin);
    const [confirmDialog, askConfirm] = useConfirmDialog();
    const [launching, setLaunching] = useState(false);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);
    const [providers, setProviders] = useState<any[]>([]);
    const [senders, setSenders] = useState<any[]>([]);
    const [lists, setLists] = useState<any[]>([]);
    const [views, setViews] = useState<any[]>([]);
    const [outbox, setOutbox] = useState<any[]>([]);
    const [suppressions, setSuppressions] = useState<any[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [favoriteCampaignIds, setFavoriteCampaignIds] = useState<string[]>([]);
    // Gap checklist Module 10's "saved workspace layouts" item, "split view vs full view" --
    // this page's list+detail grid is the only real split-layout candidate in the app today, so
    // "full" here means the selected campaign's detail panel takes the whole width (with a way
    // back to the list) rather than a fixed side-by-side grid.
    const [layoutMode, setLayoutModeState] = useState<"split" | "full">(() => getSavedLayoutMode("marketing") ?? "split");
    const setLayoutMode = (mode: "split" | "full") => {
        setLayoutModeState(mode);
        saveLayoutMode("marketing", mode);
    };

    useEffect(() => {
        setFavoriteCampaignIds(getFavoriteRecords().filter((record) => record.type === "campaign").map((record) => record.id));
    }, []);

    const toggleFavoriteCampaign = (campaign: Campaign) => {
        const updated = toggleFavoriteRecord("campaign", campaign.id, campaign.name);
        setFavoriteCampaignIds(updated.filter((record) => record.type === "campaign").map((record) => record.id));
    };
    const [testRecipient, setTestRecipient] = useState("");
    const [suppressAddress, setSuppressAddress] = useState("");
    const [suppressChannel, setSuppressChannel] = useState<Channel>("EMAIL");
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    // The tab is in the URL (?tab=analytics etc.), so a link can open a tab directly. The composer has its own page.
    const sectionTabs: PageTab<string>[] = marketingEnabled
        ? [
            { value: "campaigns", label: "Campaigns" },
            { value: "compliance", label: "Senders and compliance" },
            { value: "analytics", label: "Delivery" },
            ...(journeysEnabled ? [{ value: "journeys", label: "Journeys" }] : []),
            // Cost entries and ROI are admin-only in the API.
            ...(isAdmin ? [{ value: "costs", label: "Costs & ROI" }] : []),
        ]
        : [{ value: "journeys", label: "Journeys" }];
    const [activeSection, setActiveSection] = useUrlState<string>("tab", marketingEnabled ? "campaigns" : "journeys", { allowed: sectionTabs.map((tab) => tab.value) });
    const [journeysVisited, setJourneysVisited] = useState(false);
    const [costsVisited, setCostsVisited] = useState(false);
    const initialized = useRef(false);
    useEffect(() => {
        if (activeSection === "journeys") setJourneysVisited(true);
        if (activeSection === "costs") setCostsVisited(true);
    }, [activeSection]);

    const selected = useMemo(() => campaigns.find((campaign) => campaign.id === selectedId) ?? null, [campaigns, selectedId]);

    const selectCampaign = useCallback((campaign: Campaign) => {
        recordRecentView("campaign", campaign.id, campaign.name);
        setSelectedId(campaign.id);
    }, []);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
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
            // "Quick-open from command palette" / recent-records deep link (gap checklist's
            // "recent/favorite records" item) -- read via window.location, matching this app's
            // existing convention (views/page.tsx, tasks/page.tsx) since this page isn't wrapped
            // in a Suspense boundary.
            const deepLinkCampaignId = new URLSearchParams(window.location.search).get("campaignId");
            const deepLinkCampaign = deepLinkCampaignId && Array.isArray(campaignData) ? campaignData.find((c: Campaign) => c.id === deepLinkCampaignId) : null;
            if (!initialized.current) {
            initialized.current = true;
            if (deepLinkCampaign) {
                selectCampaign(deepLinkCampaign);
            } else if (Array.isArray(campaignData) && campaignData[0]) {
                selectCampaign(campaignData[0]);
            }
            }
        } catch {
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [selectCampaign]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    // The composer has its own page (UI/UX plan deferred item).
    const startNew = () => router.push("/dashboard/marketing/campaigns/new");

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

    // Launch sends real messages to the whole audience, so it always confirms first with the
    // saved campaign's recipient count (UI/UX plan B2). If the count can't be loaded, nothing is sent.
    const launchCampaign = async () => {
        if (!selectedId || !selected || launching) return;
        setLaunching(true);
        try {
            let count: number;
            try {
                const preview = await apiFetch<{ count: number }>("/marketing/audience/preview", {
                    method: "POST",
                    body: JSON.stringify({ audienceType: selected.audienceType, audienceConfig: selected.audienceConfig, channel: selected.channel }),
                });
                count = Number(preview.count ?? 0);
            } catch {
                toast.error("Couldn't count the audience, so nothing was sent. Try again.");
                return;
            }
            if (count === 0) {
                toast.error("This campaign's audience has no recipients");
                return;
            }
            const channelLabel = CHANNELS.find((item) => item.value === selected.channel)?.label ?? selected.channel;
            const steps = Array.isArray((selected as any).steps) && selected.campaignType === "DRIP" ? (selected as any).steps.length : 1;
            const recipients = `${count.toLocaleString()} recipient${count === 1 ? "" : "s"}`;
            const confirmed = await askConfirm({
                title: "Launch campaign?",
                description: "Messages are sent now and can't be recalled.",
                confirmLabel: `Send to ${recipients}`,
                body: (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                        <dt className="text-muted-foreground">Campaign</dt><dd className="min-w-0 break-words font-medium">{selected.name}</dd>
                        <dt className="text-muted-foreground">Channel</dt><dd>{channelLabel}</dd>
                        <dt className="text-muted-foreground">Recipients</dt><dd>{recipients}{count > 1000 ? " (large audiences are queued in batches; the campaign shows Completed when everyone is queued)" : ""}</dd>
                        {steps > 1 && <><dt className="text-muted-foreground">Messages</dt><dd>{steps} per recipient</dd></>}
                        <dt className="text-muted-foreground">Content</dt><dd>The last saved version</dd>
                    </dl>
                ),
            });
            if (!confirmed) return;
            const result: any = await apiFetch(`/marketing/campaigns/${selectedId}/launch`, { method: "POST" });
            // A large audience is queued in batches; the rest carries on in the background (§8 #24).
            toast.success(result.inProgress
                ? `Queued ${Number(result.queued ?? 0).toLocaleString()} messages so far; the rest are being queued in the background`
                : `Queued ${Number(result.queued ?? 0).toLocaleString()} messages`);
            fetchAll();
        } catch {
            toast.error("Approve the campaign before launch and confirm the audience has recipients");
        } finally {
            setLaunching(false);
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
                body: JSON.stringify({ channel: suppressChannel, address: suppressAddress, reason: "Manual suppression" }),
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
        <div className="@container/marketing min-w-0 space-y-4">
            {confirmDialog}
            <PageHeader title={marketingEnabled ? "Campaigns" : "Journeys"} description={marketingEnabled ? "Email, WhatsApp and SMS campaigns: audiences, sending and delivery." : "Multi-step journeys that move people along over time."} actions={<>
                <Button variant="outline" onClick={fetchAll} disabled={loading}><RefreshCw className="size-4" />Refresh</Button>
                {marketingEnabled && <Button onClick={startNew} disabled={loading || loadError}><Plus className="size-4" />New campaign</Button>}
            </>} />
            {loadError && <ErrorState description="Marketing data could not be loaded. Your draft has been kept." onRetry={fetchAll} />}
            {marketingEnabled && (activeSection === "campaigns" || activeSection === "analytics") && <div className="grid grid-cols-2 gap-3 @min-[900px]/marketing:grid-cols-4">
                {([
                    ["Campaigns", campaigns.length, Megaphone],
                    ["Audience", stats.recipients, Eye],
                    ["Sent", stats.sent, CheckCircle2],
                    ["Clicks", stats.clicked, BarChart3],
                ] as const).map(([label, value, Icon]) => (
                    <Card key={String(label)} className="rounded-xl">
                        <CardContent className="flex min-w-0 flex-wrap items-center justify-between p-4">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.04em] text-muted-foreground">{String(label)}</p>
                                <p className="text-2xl font-semibold">{Number(value).toLocaleString()}</p>
                            </div>
                            <Icon className="size-5 text-primary" />
                        </CardContent>
                    </Card>
                ))}
            </div>}

            <div className="min-w-0 space-y-3">
                {sectionTabs.length > 1 ? <PageTabs label="Campaigns" tabs={sectionTabs} value={activeSection} onChange={setActiveSection} /> : null}

                {!marketingEnabled && (
                    <p className="text-sm text-muted-foreground">
                        Email, WhatsApp and SMS campaigns aren&apos;t turned on for your workspace; journeys work on their own.
                        {user?.isTenantAdmin ? <> <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/dashboard/settings/workspace/modules">Turn on campaigns</Link></> : " Ask an admin if you need them."}
                    </p>
                )}

                {marketingEnabled && (
                <>
                <div role="tabpanel" aria-label="Campaigns" hidden={activeSection !== "campaigns"} className={layoutMode === "split" ? "grid gap-3 @min-[1100px]/marketing:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" : "grid gap-3"}>
                    {(layoutMode === "split" || !selectedId) && (
                    <Card className="rounded-xl">
                        <CardHeader className="min-w-0 flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                            <CardTitle className="text-base">Campaign List</CardTitle>
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <Badge variant="outline">{loading ? "Loading" : `${campaigns.length} total`}</Badge>
                                <div className="flex min-w-0 flex-wrap items-center gap-1 rounded-md border p-0.5">
                                    <Button
                                        type="button"
                                        size="icon-sm"
                                        variant={layoutMode === "split" ? "secondary" : "ghost"}
                                        onClick={() => setLayoutMode("split")}
                                        aria-pressed={layoutMode === "split"}
                                        aria-label="Split view"
                                    >
                                        <Columns2 className="size-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        size="icon-sm"
                                        variant={layoutMode === "full" ? "secondary" : "ghost"}
                                        onClick={() => setLayoutMode("full")}
                                        aria-pressed={layoutMode === "full"}
                                        aria-label="Full view"
                                    >
                                        <Maximize2 className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {campaigns.map((campaign) => (
                                <div
                                    key={campaign.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => selectCampaign(campaign)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            selectCampaign(campaign);
                                        }
                                    }}
                                    className={`w-full cursor-pointer rounded-lg border p-3 text-left transition-colors hover:bg-accent ${selectedId === campaign.id ? "border-primary bg-primary/5" : "border-border"}`}
                                >
                                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1 basis-40">
                                            <div className="min-w-0 break-words font-semibold">{campaign.name}</div>
                                            <div className="text-xs text-muted-foreground">{campaign.channel} · {campaign.campaignType}</div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                            <Badge variant="outline" className={statusClassName(campaign.status)}>{campaign.status.replaceAll("_", " ")}</Badge>
                                            <Button
                                                size="icon-sm"
                                                variant="ghost"
                                                onClick={(event) => { event.stopPropagation(); toggleFavoriteCampaign(campaign); }}
                                                aria-label={favoriteCampaignIds.includes(campaign.id) ? `Unfavorite ${campaign.name}` : `Favorite ${campaign.name}`}
                                            >
                                                <Star className={cn("size-4", favoriteCampaignIds.includes(campaign.id) ? "fill-amber-500 text-amber-500" : "text-muted-foreground")} />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                                        <span>{campaign.stats?.recipients ?? 0} audience</span>
                                        <span>{campaign.stats?.sent ?? 0} sent</span>
                                        <span>{campaign.stats?.failed ?? 0} failed</span>
                                        <span>{campaign.updatedAt ? formatWorkspaceDateTime(campaign.updatedAt) : "-"}</span>
                                    </div>
                                </div>
                            ))}
                            {!campaigns.length && !loading && !loadError ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No campaigns yet.</div> : null}
                        </CardContent>
                    </Card>
                    )}

                    {(layoutMode === "split" || selectedId) && (
                    <Card className="rounded-xl">
                        <CardHeader className="min-w-0 flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                            <div className="min-w-0 flex-1 basis-40">
                                {layoutMode === "full" && selectedId ? (
                                    <Button size="sm" variant="ghost" className="mb-1 -ml-2" onClick={() => setSelectedId(null)}>
                                        <ArrowLeft className="size-4" />
                                        Back to list
                                    </Button>
                                ) : null}
                                <CardTitle className="min-w-0 break-words text-base">{selected ? selected.name : "Campaign Actions"}</CardTitle>
                                <p className="text-sm text-muted-foreground">Approval, testing, and launch controls.</p>
                            </div>
                            {selected ? (
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className={statusClassName(selected.status)}>{selected.status.replaceAll("_", " ")}</Badge>
                                    <Button asChild size="sm" variant="outline"><Link href={`/dashboard/marketing/campaigns/${selected.id}`}>Edit campaign</Link></Button>
                                </div>
                            ) : null}
                        </CardHeader>
                        <CardContent className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-lg border p-3">
                                <Label htmlFor="campaign-field-1">Test recipient</Label>
                                <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                                    <Input id="campaign-field-1" value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder={selected?.channel === "EMAIL" ? "person@example.com" : "+919999999999"} />
                                    <Button disabled={!selectedId || loading || loadError} onClick={sendTest}>Test</Button>
                                </div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <Label>Launch workflow</Label>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <Button disabled={!selectedId || loading || loadError} variant="outline" onClick={() => updateStatus("PENDING_APPROVAL")}>Request approval</Button>
                                    <Button disabled={!selectedId || loading || loadError} variant="outline" onClick={() => updateStatus("APPROVED")}>Approve</Button>
                                    <Button disabled={!selectedId || loading || loadError || launching} onClick={launchCampaign}>
                                        <Play className="size-4" />
                                        Launch
                                    </Button>
                                    <Button disabled={!selectedId || loading || loadError} variant="outline" onClick={() => updateStatus("PAUSED")}>
                                        <Pause className="size-4" />
                                        Pause
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    )}
                </div>

                <div role="tabpanel" aria-label="Senders and compliance" hidden={activeSection !== "compliance"} className="grid gap-3 lg:grid-cols-2">
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
                        <CardContent className="min-w-0 space-y-3">
                            <div className="flex min-w-0 flex-wrap gap-2">
                                <Select value={suppressChannel} onValueChange={(value) => setSuppressChannel(value as Channel)}>
                                    <SelectTrigger className="w-36" aria-label="Channel to suppress"><SelectValue /></SelectTrigger>
                                    <SelectContent>{CHANNELS.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                                </Select>
                                <Input aria-label="Address to suppress" value={suppressAddress} onChange={(event) => setSuppressAddress(event.target.value)} placeholder="Email or phone" />
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
                </div>

                {isAdmin ? (
                    <div role="tabpanel" aria-label="Costs & ROI" hidden={activeSection !== "costs"}>
                        {(costsVisited || activeSection === "costs") && <CostsPanel campaigns={campaigns} journeysEnabled={journeysEnabled} />}
                    </div>
                ) : null}

                <div role="tabpanel" aria-label="Delivery" hidden={activeSection !== "analytics"}>
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
                </div>
                </>
                )}

                <div role="tabpanel" aria-label="Journeys" hidden={activeSection !== "journeys"}>
                    {(journeysVisited || activeSection === "journeys" || !marketingEnabled) && <JourneysPanel />}
                </div>
            </div>
        </div>
    );
}

type CostScopeType = "CAMPAIGN" | "JOURNEY" | "CHANNEL";
type CostType = "PLANNED_BUDGET" | "ACTUAL_SPEND" | "PER_SEND_RATE";
type CostEntry = {
    id: string;
    scopeType: CostScopeType;
    scopeId: string | null;
    channel: Channel | null;
    costType: CostType;
    amount: number | string;
    currency: string;
    periodStart: string | null;
    periodEnd: string | null;
    notes: string | null;
    createdAt: string;
};
type RoiSummary = {
    scopeType: "CAMPAIGN" | "JOURNEY";
    actualSpend: number;
    plannedBudget: number;
    costBasis: number;
    sent: number;
    failed: number;
    attributedRevenue: number | null;
    wonOpportunities: number | null;
    costPerSend: number | null;
    roi: number | null;
};

const COST_TYPES: Array<{ value: CostType; label: string }> = [
    { value: "ACTUAL_SPEND", label: "Actual spend" },
    { value: "PLANNED_BUDGET", label: "Planned budget" },
    { value: "PER_SEND_RATE", label: "Cost per message" },
];

const emptyCostDraft = { scopeType: "CAMPAIGN" as CostScopeType, scopeId: "", channel: "EMAIL" as Channel, costType: "ACTUAL_SPEND" as CostType, amount: "", currency: "", periodStart: "", periodEnd: "", notes: "" };

// Campaigns › Costs & ROI (UI/UX plan decision 33): what campaigns and journeys cost, and the
// return on that spend. The API can add and delete cost entries but not edit them, so a wrong
// entry is deleted and added again.
function CostsPanel({ campaigns, journeysEnabled }: { campaigns: Campaign[]; journeysEnabled: boolean }) {
    const confirm = useConfirm();
    const [entries, setEntries] = useState<CostEntry[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [journeys, setJourneys] = useState<Array<{ id: string; name: string }>>([]);
    const [roiScope, setRoiScope] = useState("");
    const [roi, setRoi] = useState<RoiSummary | null>(null);
    const [roiState, setRoiState] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [draft, setDraft] = useState(emptyCostDraft);
    const [errors, setErrors] = useState<Partial<Record<"scopeId" | "amount" | "currency" | "period", string>>>({});
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setFailed(false);
        try {
            const data = await apiFetch<CostEntry[]>("/marketing/cost-entries");
            setEntries(Array.isArray(data) ? data : []);
        } catch {
            setFailed(true);
        }
    }, []);

    useEffect(() => {
        load();
        if (journeysEnabled) apiFetch<any[]>("/marketing/journeys").then((data) => setJourneys(Array.isArray(data) ? data.map((item) => ({ id: item.id, name: item.name })) : [])).catch(() => setJourneys([]));
    }, [load, journeysEnabled]);

    const loadRoi = useCallback(async (scope: string) => {
        const [scopeType, scopeId] = scope.split(":");
        if (!scopeType || !scopeId) { setRoiState("idle"); return; }
        setRoiState("loading");
        try {
            const data = await apiFetch<RoiSummary>(`/marketing/cost-entries/roi?scopeType=${scopeType}&scopeId=${encodeURIComponent(scopeId)}`);
            setRoi(data);
            setRoiState("ready");
        } catch {
            setRoiState("error");
        }
    }, []);

    // Default the summary to the first campaign once there is one.
    const defaultScope = campaigns[0] ? `CAMPAIGN:${campaigns[0].id}` : journeys[0] ? `JOURNEY:${journeys[0].id}` : "";
    const activeScope = roiScope || defaultScope;
    useEffect(() => { loadRoi(activeScope); }, [activeScope, loadRoi]);

    const scopeName = (entry: Pick<CostEntry, "scopeType" | "scopeId" | "channel">) => {
        if (entry.scopeType === "CAMPAIGN") return campaigns.find((item) => item.id === entry.scopeId)?.name ?? "Deleted campaign";
        if (entry.scopeType === "JOURNEY") return journeys.find((item) => item.id === entry.scopeId)?.name ?? "Journey";
        return `${CHANNELS.find((item) => item.value === entry.channel)?.label ?? "All"} channel`;
    };

    const openAdd = () => {
        const [scopeType, scopeId] = activeScope.split(":");
        setDraft({ ...emptyCostDraft, scopeType: (scopeType as CostScopeType) || "CAMPAIGN", scopeId: scopeId ?? "", currency: workspaceCurrency() });
        setErrors({});
        setDialogOpen(true);
    };

    const save = async () => {
        const next: typeof errors = {};
        if (draft.scopeType !== "CHANNEL" && !draft.scopeId) next.scopeId = `Choose a ${draft.scopeType === "JOURNEY" ? "journey" : "campaign"}.`;
        const amount = Number(draft.amount);
        if (!draft.amount.trim() || !Number.isFinite(amount) || amount <= 0) next.amount = "Enter an amount above 0.";
        if (!/^[A-Za-z]{3}$/.test(draft.currency.trim())) next.currency = "Use a 3-letter currency code, such as INR.";
        if (draft.periodStart && draft.periodEnd && draft.periodEnd < draft.periodStart) next.period = "The end date must be on or after the start date.";
        setErrors(next);
        if (Object.keys(next).length) return;
        setSaving(true);
        try {
            const created = await apiFetch<CostEntry>("/marketing/cost-entries", {
                method: "POST",
                body: JSON.stringify({
                    scopeType: draft.scopeType,
                    scopeId: draft.scopeType === "CHANNEL" ? null : draft.scopeId,
                    channel: draft.scopeType === "CHANNEL" ? draft.channel : null,
                    costType: draft.costType,
                    amount,
                    currency: draft.currency.trim().toUpperCase(),
                    periodStart: draft.periodStart || null,
                    periodEnd: draft.periodEnd || null,
                    notes: draft.notes.trim() || null,
                }),
            });
            setEntries((current) => [created, ...(current ?? [])]);
            setDialogOpen(false);
            toast.success("Cost added");
            loadRoi(activeScope);
        } catch (error: any) {
            toast.error(error?.message || "The cost couldn't be added");
        } finally {
            setSaving(false);
        }
    };

    const remove = async (entry: CostEntry) => {
        const label = COST_TYPES.find((item) => item.value === entry.costType)?.label.toLowerCase() ?? "cost";
        const ok = await confirm({
            title: `Delete the ${formatMoney(entry.amount, { currency: entry.currency })} ${label} for ${scopeName(entry)}?`,
            description: "Spend and return figures are worked out again without it.",
            confirmLabel: "Delete cost",
            destructive: true,
        });
        if (!ok) return;
        try {
            await apiFetch(`/marketing/cost-entries/${entry.id}`, { method: "DELETE" });
            setEntries((current) => (current ?? []).filter((item) => item.id !== entry.id));
            toast.success("Cost deleted");
            loadRoi(activeScope);
        } catch (error: any) {
            toast.error(error?.message || "The cost couldn't be deleted");
        }
    };

    const period = (entry: CostEntry) => {
        if (!entry.periodStart && !entry.periodEnd) return "—";
        const day = (value: string | null) => (value ? String(value).slice(0, 10) : "…");
        return `${day(entry.periodStart)} to ${day(entry.periodEnd)}`;
    };

    const stat = (label: string, value: string, hint?: string) => (
        <div className="min-w-0 rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold tabular-nums">{value}</p>
            {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
    );

    return (
        <div className="min-w-0 space-y-3">
            <Card className="rounded-xl">
                <CardHeader className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <CardTitle className="text-base">Return on spend</CardTitle>
                        <p className="text-sm text-muted-foreground">Uses actual spend, or the planned budget when no spend is logged yet.</p>
                    </div>
                    <Select value={activeScope} onValueChange={setRoiScope} disabled={!campaigns.length && !journeys.length}>
                        <SelectTrigger className="w-64 max-w-full" aria-label="Campaign or journey"><SelectValue placeholder="Choose a campaign or journey" /></SelectTrigger>
                        <SelectContent>
                            {campaigns.map((campaign) => <SelectItem key={campaign.id} value={`CAMPAIGN:${campaign.id}`}>Campaign: {campaign.name}</SelectItem>)}
                            {journeys.map((journey) => <SelectItem key={journey.id} value={`JOURNEY:${journey.id}`}>Journey: {journey.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent>
                    {roiState === "idle" ? (
                        <p className="text-sm text-muted-foreground">Create a campaign or journey to see its return on spend.</p>
                    ) : roiState === "error" ? (
                        <ErrorState variant="inline" description="The return on spend couldn't be worked out." onRetry={() => loadRoi(activeScope)} />
                    ) : roiState === "loading" || !roi ? (
                        <p role="status" className="text-sm text-muted-foreground">Loading…</p>
                    ) : (
                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-3 @min-[900px]/marketing:grid-cols-4">
                                {stat("Actual spend", formatMoney(roi.actualSpend))}
                                {stat("Planned budget", formatMoney(roi.plannedBudget))}
                                {roi.scopeType === "CAMPAIGN" ? <>
                                    {stat("Messages sent", formatCount(roi.sent), roi.failed ? `${formatCount(roi.failed)} failed` : undefined)}
                                    {stat("Cost per message sent", roi.costPerSend === null ? "—" : formatMoney(roi.costPerSend))}
                                </> : <>
                                    {stat("Revenue from won opportunities", formatMoney(roi.attributedRevenue ?? 0), `${formatCount(roi.wonOpportunities ?? 0)} won`)}
                                    {stat("Return on spend", roi.roi === null ? "—" : formatPercent(roi.roi), roi.roi === null ? "Needs spend or a budget" : undefined)}
                                </>}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {roi.scopeType === "CAMPAIGN"
                                    ? "Revenue isn't credited to campaigns yet, because won opportunities aren't linked back to the campaign that reached them. Journeys show revenue."
                                    : "Revenue is the value of won opportunities the journey touched. Message counts aren't tracked per journey."}
                                {" "}Amounts in different currencies are added together as entered.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="rounded-xl">
                <CardHeader className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <CardTitle className="text-base">Costs</CardTitle>
                        <p className="text-sm text-muted-foreground">Budgets and spend for each campaign, journey or channel. To correct a cost, delete it and add it again.</p>
                    </div>
                    <Button size="sm" onClick={openAdd} disabled={entries === null}><Plus className="size-4" />Add cost</Button>
                </CardHeader>
                <CardContent>
                    {failed ? (
                        <ErrorState variant="inline" description="The costs couldn't be loaded." onRetry={load} />
                    ) : entries === null ? (
                        <p role="status" className="text-sm text-muted-foreground">Loading…</p>
                    ) : entries.length === 0 ? (
                        <EmptyState variant="inline" title="No costs yet" description="Add a budget or what you've spent to see the return on it." action={<Button size="sm" variant="outline" onClick={openAdd}><Plus className="size-4" />Add cost</Button>} />
                    ) : (
                        <Table>
                            <TableHeader><TableRow><TableHead>For</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Period</TableHead><TableHead>Notes</TableHead><TableHead>Added</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
                            <TableBody>
                                {entries.map((entry) => (
                                    <TableRow key={entry.id}>
                                        <TableCell className="max-w-56 whitespace-normal break-words">{scopeName(entry)}</TableCell>
                                        <TableCell>{COST_TYPES.find((item) => item.value === entry.costType)?.label ?? entry.costType}</TableCell>
                                        <TableCell className="text-right tabular-nums">{formatMoney(entry.amount, { currency: entry.currency })}</TableCell>
                                        <TableCell className="whitespace-nowrap">{period(entry)}</TableCell>
                                        <TableCell className="max-w-56 whitespace-normal break-words text-muted-foreground">{entry.notes || "—"}</TableCell>
                                        <TableCell className="whitespace-nowrap">{formatWorkspaceDateTime(entry.createdAt)}</TableCell>
                                        <TableCell className="text-right">
                                            <Button size="icon-sm" variant="ghost" aria-label={`Delete the ${formatMoney(entry.amount, { currency: entry.currency })} cost for ${scopeName(entry)}`} onClick={() => remove(entry)}><Trash2 className="size-4" /></Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <StandardDialog
                open={dialogOpen}
                onClose={() => { if (!saving) setDialogOpen(false); }}
                title="Add cost"
                maxWidth="sm"
                actions={<>
                    <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
                    <Button onClick={save} isLoading={saving}>Add cost</Button>
                </>}
            >
                <form className="space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); save(); }}>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="min-w-0 space-y-1.5">
                            <Label htmlFor="cost-scope-type">For</Label>
                            <Select value={draft.scopeType} onValueChange={(value) => { setDraft({ ...draft, scopeType: value as CostScopeType, scopeId: "" }); setErrors({ ...errors, scopeId: undefined }); }}>
                                <SelectTrigger id="cost-scope-type" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="CAMPAIGN">A campaign</SelectItem>
                                    {journeysEnabled ? <SelectItem value="JOURNEY">A journey</SelectItem> : null}
                                    <SelectItem value="CHANNEL">A whole channel</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {draft.scopeType === "CHANNEL" ? (
                            <div className="min-w-0 space-y-1.5">
                                <Label htmlFor="cost-channel">Channel</Label>
                                <Select value={draft.channel} onValueChange={(value) => setDraft({ ...draft, channel: value as Channel })}>
                                    <SelectTrigger id="cost-channel" className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>{CHANNELS.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        ) : (
                            <div className="min-w-0 space-y-1.5">
                                <Label htmlFor="cost-scope">{draft.scopeType === "JOURNEY" ? "Journey" : "Campaign"}</Label>
                                <Select value={draft.scopeId} onValueChange={(value) => { setDraft({ ...draft, scopeId: value }); setErrors({ ...errors, scopeId: undefined }); }}>
                                    <SelectTrigger id="cost-scope" className="w-full" aria-invalid={!!errors.scopeId || undefined} aria-describedby={errors.scopeId ? "cost-scope-error" : undefined}>
                                        <SelectValue placeholder={draft.scopeType === "JOURNEY" ? "Choose a journey" : "Choose a campaign"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(draft.scopeType === "JOURNEY" ? journeys : campaigns).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                {errors.scopeId ? <p id="cost-scope-error" className="text-sm text-destructive">{errors.scopeId}</p> : null}
                            </div>
                        )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="min-w-0 space-y-1.5">
                            <Label htmlFor="cost-type">Type</Label>
                            <Select value={draft.costType} onValueChange={(value) => setDraft({ ...draft, costType: value as CostType })}>
                                <SelectTrigger id="cost-type" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>{COST_TYPES.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="min-w-0 space-y-1.5">
                            <Label htmlFor="cost-amount">Amount</Label>
                            <Input id="cost-amount" type="number" inputMode="decimal" min={0} step="0.01" value={draft.amount} onChange={(event) => { setDraft({ ...draft, amount: event.target.value }); setErrors({ ...errors, amount: undefined }); }} aria-invalid={!!errors.amount || undefined} aria-describedby={errors.amount ? "cost-amount-error" : undefined} />
                            {errors.amount ? <p id="cost-amount-error" className="text-sm text-destructive">{errors.amount}</p> : null}
                        </div>
                        <div className="min-w-0 space-y-1.5">
                            <Label htmlFor="cost-currency">Currency</Label>
                            <Input id="cost-currency" maxLength={3} className="uppercase" value={draft.currency} onChange={(event) => { setDraft({ ...draft, currency: event.target.value }); setErrors({ ...errors, currency: undefined }); }} aria-invalid={!!errors.currency || undefined} aria-describedby={errors.currency ? "cost-currency-error" : undefined} />
                            {errors.currency ? <p id="cost-currency-error" className="text-sm text-destructive">{errors.currency}</p> : null}
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="min-w-0 space-y-1.5">
                                <Label htmlFor="cost-period-start">From (optional)</Label>
                                <Input id="cost-period-start" type="date" value={draft.periodStart} onChange={(event) => { setDraft({ ...draft, periodStart: event.target.value }); setErrors({ ...errors, period: undefined }); }} aria-invalid={!!errors.period || undefined} aria-describedby={errors.period ? "cost-period-error" : undefined} />
                            </div>
                            <div className="min-w-0 space-y-1.5">
                                <Label htmlFor="cost-period-end">To (optional)</Label>
                                <Input id="cost-period-end" type="date" value={draft.periodEnd} onChange={(event) => { setDraft({ ...draft, periodEnd: event.target.value }); setErrors({ ...errors, period: undefined }); }} aria-invalid={!!errors.period || undefined} aria-describedby={errors.period ? "cost-period-error" : undefined} />
                            </div>
                        </div>
                        {errors.period ? <p id="cost-period-error" className="text-sm text-destructive">{errors.period}</p> : null}
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="cost-notes">Notes (optional)</Label>
                        <Textarea id="cost-notes" rows={2} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
                    </div>
                </form>
            </StandardDialog>
        </div>
    );
}
