"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronRight, Eye, TextQuote } from "lucide-react";
import { toast } from "sonner";
import { SettingsSections } from "@/components/layout/settings-sections";
import { ErrorState } from "@/components/common/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useConfirmDialog } from "@/components/common/confirm-dialog";
import { useModuleEnabled } from "@/components/auth/feature-gate";
import { NextBestActionPanel } from "@/components/next-best-action/nba-panel";
import { NbaCountChip } from "@/components/next-best-action/nba-count-chip";
import { useAuth } from "@/providers/auth-provider";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { apiFetch } from "@/lib/api";
import { recordRecentView } from "@/lib/recent-records";
import { CHANNELS, emptyCampaign, statusClassName, type AudienceType, type Campaign, type Channel } from "@/components/marketing/campaign-shared";

// The campaign composer on its own page (UI/UX plan deferred item): /dashboard/marketing/campaigns/new
// and /dashboard/marketing/campaigns/<id>. Approval, test sends and launch stay on the Marketing
// page's campaign list.
export function CampaignComposer({ campaignId }: { campaignId: string | null }) {
    const { user } = useAuth();
    const isAdmin = Boolean(user?.isTenantAdmin || user?.isPlatformAdmin);
    const nbaEnabled = useModuleEnabled("NEXT_BEST_ACTION");
    const [confirmDialog, askConfirm] = useConfirmDialog();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const selected = campaign;
    const selectedId = campaign?.id ?? null;
    const [templates, setTemplates] = useState<any[]>([]);
    const [providers, setProviders] = useState<any[]>([]);
    const [senders, setSenders] = useState<any[]>([]);
    const [lists, setLists] = useState<any[]>([]);
    const [views, setViews] = useState<any[]>([]);
    const [draft, setDraft] = useState<any>(emptyCampaign);
    // JSON of the campaign as last loaded or saved (null for a new, unsaved one).
    const [savedKey, setSavedKey] = useState<string | null>(null);
    const [manualRecipients, setManualRecipients] = useState("");
    const [audiencePreview, setAudiencePreview] = useState<{ count: number; sample: any[]; recipientsWithPendingNba?: number; sampledLeadCount?: number } | null>(null);
    const [expandedRecipientKey, setExpandedRecipientKey] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // "Insert snippet" (UI/UX plan decision 33). The snippet's text is pasted in, so what you see is
    // what's sent; typing a {{snippet:key}} placeholder works too (it's filled in when sending).
    const messageRef = useRef<HTMLTextAreaElement>(null);
    // Where the cursor was in the message; null until it has been used, so a snippet is added at the end.
    const messageSelection = useRef<[number, number] | null>(null);
    const [snippets, setSnippets] = useState<Array<{ id: string; key: string; body: string }> | null>(null);
    const [snippetsFailed, setSnippetsFailed] = useState(false);
    const loadSnippets = async () => {
        setSnippetsFailed(false);
        try {
            const data = await apiFetch<Array<{ id: string; key: string; body: string }>>("/communications/snippets");
            setSnippets(Array.isArray(data) ? data : []);
        } catch {
            setSnippetsFailed(true);
        }
    };
    const insertSnippet = (snippetText: string) => {
        let text = snippetText;
        const element = messageRef.current;
        const body = String(draft.body ?? "");
        const [start, end] = messageSelection.current ?? [body.length, body.length];
        // Added at the end (the cursor was never placed): start it on a new paragraph.
        if (!messageSelection.current && body.trim()) text = (body.endsWith("\n") ? "\n" : "\n\n") + text;
        setDraft({ ...draft, body: body.slice(0, start) + text + body.slice(end) });
        messageSelection.current = [start + text.length, start + text.length];
        requestAnimationFrame(() => {
            element?.focus();
            element?.setSelectionRange(start + text.length, start + text.length);
        });
    };


    const channelTemplates = templates.filter((template) => template.channel === draft.channel);
    const channelProviders = providers.filter((provider) => provider.channel === draft.channel);
    const channelSenders = senders.filter((sender) => sender.channel === draft.channel);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const [campaignData, templateData, providerData, senderData, listData, viewData] = await Promise.all([
                campaignId ? apiFetch<Campaign>(`/marketing/campaigns/${campaignId}`) : Promise.resolve(null),
                apiFetch<any[]>("/communications/templates"),
                apiFetch<any[]>("/communications/providers"),
                apiFetch<any[]>("/communications/senders"),
                apiFetch<any[]>("/lead-lists"),
                apiFetch<any[]>("/saved-views?module=ALL"),
            ]);
            setTemplates(Array.isArray(templateData) ? templateData : []);
            setProviders(Array.isArray(providerData) ? providerData : []);
            setSenders(Array.isArray(senderData) ? senderData : []);
            setLists(Array.isArray(listData) ? listData : []);
            setViews(Array.isArray(viewData) ? viewData : []);
            if (campaignData) {
                recordRecentView("campaign", campaignData.id, campaignData.name);
                setCampaign(campaignData);
                setManualRecipients((campaignData.audienceConfig?.recipients ?? []).join("\n"));
                const loaded = {
                    ...emptyCampaign,
                    ...campaignData,
                    subject: campaignData.subject ?? "",
                    audienceConfig: campaignData.audienceConfig ?? {},
                    quietHours: campaignData.quietHours ?? emptyCampaign.quietHours,
                };
                setDraft(loaded);
                setSavedKey(JSON.stringify(loaded));
            }
        } catch (error: any) {
            setLoadError(error?.status === 404 ? "This campaign doesn't exist, or you can't see it." : "The campaign couldn't be loaded.");
        } finally {
            setLoading(false);
        }
    }, [campaignId]);

    useEffect(() => {
        load();
    }, [load]);

    // Save model (decision 29): a Draft campaign saves itself as you work -- nothing is sent until
    // it's approved and launched. Changing what an approved campaign sends puts it back in Draft
    // for approval again (the server does this), and once a campaign has started it can't change.
    const isLocked = !!selected && ["RUNNING", "PAUSED", "COMPLETED", "CANCELLED"].includes(selected.status);
    const needsReapproval = !!selected && ["PENDING_APPROVAL", "APPROVED", "SCHEDULED"].includes(selected.status);
    const dirty = savedKey === null ? false : savedKey !== JSON.stringify(draft);
    const saveCampaign = async (quiet = false) => {
        if (saving || isLocked) return;
        if (needsReapproval && !quiet && !(await askConfirm({
            title: "Save changes and send for approval again?",
            description: "This campaign is approved for what it sent before. Changing its audience or message puts it back in Draft, and it needs approval again before it can launch.",
            confirmLabel: "Save changes",
        }))) return;
        setSaving(true);
        const savingKey = JSON.stringify(draft);
        try {
            const saved = await apiFetch<Campaign & { approvalReset?: boolean }>(selectedId ? `/marketing/campaigns/${selectedId}` : "/marketing/campaigns", {
                method: selectedId ? "PUT" : "POST",
                body: JSON.stringify(draft),
            });
            if (saved.approvalReset) toast.warning("Saved. The campaign is back in Draft and needs approval again.");
            else if (!quiet) toast.success(selectedId ? "Campaign saved" : "Campaign created as a draft");
            const created = !campaign;
            setCampaign(saved);
            const next = { ...emptyCampaign, ...saved, subject: saved.subject ?? "" };
            // Keep anything typed while this save was in flight.
            if (JSON.stringify(draft) === savingKey) {
                setDraft(next);
                setSavedKey(JSON.stringify(next));
            } else {
                setSavedKey(savingKey);
            }
            // A new campaign gets its own address once it's saved -- without reloading the page, so
            // the composer stays on the section you're working in.
            if (created) window.history.replaceState(null, "", `/dashboard/marketing/campaigns/${saved.id}`);
        } catch (error: any) {
            if (!quiet) toast.error(error?.message || "Failed to save campaign");
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        if (!selectedId || selected?.status !== "DRAFT" || !dirty || saving) return;
        const timer = window.setTimeout(() => { saveCampaign(true); }, 1500);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft, selectedId, selected?.status, dirty, saving]);

    const saveStatus = isLocked ? "This campaign has started, so what it sends can't change."
        : saving ? "Saving…"
        : !selectedId ? "Not saved yet"
        : selected?.status === "DRAFT" ? (dirty ? "Unsaved changes" : "All changes saved")
        : needsReapproval ? (dirty ? "Unsaved changes · saving sends it back for approval" : "Approved content · changing it needs approval again")
        : "";

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


    // Leaving with changes that haven't saved yet asks first.
    useUnsavedChangesGuard(dirty || (!selectedId && JSON.stringify(draft) !== JSON.stringify(emptyCampaign)));

    if (loadError) return <ErrorState title="Can't open this campaign" description={loadError} onRetry={load} />;
    if (loading) return <Skeleton className="h-[480px] rounded-xl" />;

    return (
        <div className="min-w-0 space-y-3">
            {confirmDialog}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Button asChild variant="ghost" size="sm" className="-ml-2">
                    <Link href={selectedId ? `/dashboard/marketing?campaignId=${selectedId}` : "/dashboard/marketing"}><ArrowLeft className="size-4" />Campaigns</Link>
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                    {selected ? <Badge variant="outline" className={statusClassName(selected.status)}>{selected.status.replaceAll("_", " ")}</Badge> : <Badge variant="outline">New</Badge>}
                    {selectedId ? (
                        <Button asChild size="sm" variant="outline">
                            <Link href={`/dashboard/marketing?campaignId=${selectedId}`}>Approval, test and launch</Link>
                        </Button>
                    ) : null}
                </div>
            </div>
<Card className="rounded-xl">
                        <CardHeader>
                            <CardTitle className="text-base">{selected ? selected.name : "New campaign"}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <SettingsSections label="Composer section" urlKey={null} sections={[
                                { id: "audience", label: "1. Audience", content: (
                            <div className="min-w-0 space-y-3">
                                <div className="min-w-0 space-y-1">
                                    <Label htmlFor="campaign-field-2">Name</Label>
                                    <Input id="campaign-field-2" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                                </div>
                                <div className="min-w-0 space-y-1">
                                    <Label htmlFor="campaign-field-3">Channel</Label>
                                    <Select value={draft.channel} onValueChange={(value) => setDraft({ ...draft, channel: value as Channel, templateId: null, providerConfigId: null, senderIdentityId: null })}>
                                        <SelectTrigger className="w-full" id="campaign-field-3"><SelectValue /></SelectTrigger>
                                        <SelectContent>{CHANNELS.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="min-w-0 space-y-1">
                                    <Label htmlFor="campaign-field-4">Campaign type</Label>
                                    <Select value={draft.campaignType} onValueChange={(value) => setDraft({ ...draft, campaignType: value })}>
                                        <SelectTrigger className="w-full" id="campaign-field-4"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="BROADCAST">One-time broadcast</SelectItem>
                                            <SelectItem value="DRIP">Drip / nurture journey</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="min-w-0 space-y-1">
                                    <Label htmlFor="campaign-field-5">Audience</Label>
                                    <Select value={draft.audienceType} onValueChange={(value) => { setManualRecipients(""); setDraft({ ...draft, audienceType: value as AudienceType, audienceConfig: {} }); }}>
                                        <SelectTrigger className="w-full" id="campaign-field-5"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="LEAD_LIST">Lead list</SelectItem>
                                            <SelectItem value="SAVED_VIEW">View</SelectItem>
                                            <SelectItem value="MANUAL">Manual recipients</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {draft.audienceType === "LEAD_LIST" ? (
                                    <Select value={draft.audienceConfig?.leadListId ?? ""} onValueChange={(value) => setDraft({ ...draft, audienceConfig: { leadListId: value } })}>
                                        <SelectTrigger className="w-full" aria-label="Audience lead list"><SelectValue placeholder="Select list" /></SelectTrigger>
                                        <SelectContent>{lists.map((list) => <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                ) : null}
                                {draft.audienceType === "SAVED_VIEW" ? (
                                    <Select value={draft.audienceConfig?.savedViewId ?? ""} onValueChange={(value) => setDraft({ ...draft, audienceConfig: { savedViewId: value } })}>
                                        <SelectTrigger className="w-full" aria-label="Audience saved view"><SelectValue placeholder="Select view" /></SelectTrigger>
                                        <SelectContent>{views.map((view) => <SelectItem key={view.id} value={view.id}>{view.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                ) : null}
                                {draft.audienceType === "MANUAL" ? (
                                    <Textarea
                                        aria-label="Manual recipients"
                                        value={manualRecipients}
                                        onChange={(event) => { setManualRecipients(event.target.value); setDraft({ ...draft, audienceConfig: { recipients: event.target.value.split(/\n|,/).map((item) => item.trim()).filter(Boolean) } }); }}
                                        placeholder="One email or phone per line"
                                    />
                                ) : null}
                                <Button variant="outline" onClick={previewAudience}>
                                    <Eye className="size-4" />
                                    Preview audience
                                </Button>
                            </div>

                                ) },
                                { id: "message", label: "2. Message", content: (
                            <div className="min-w-0 space-y-3">
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="min-w-0 space-y-1">
                                        <Label htmlFor="campaign-field-6">Template</Label>
                                        <Select value={draft.templateId || "NONE"} onValueChange={(value) => setDraft({ ...draft, templateId: value === "NONE" ? null : value })}>
                                            <SelectTrigger className="w-full" id="campaign-field-6"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="NONE">No template</SelectItem>
                                                {channelTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="min-w-0 space-y-1">
                                        <Label htmlFor="campaign-field-7">Provider</Label>
                                        <Select value={draft.providerConfigId || "AUTO"} onValueChange={(value) => setDraft({ ...draft, providerConfigId: value === "AUTO" ? null : value })}>
                                            <SelectTrigger className="w-full" id="campaign-field-7"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="AUTO">Auto select active provider</SelectItem>
                                                {channelProviders.map((provider) => <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="min-w-0 space-y-1">
                                    <Label htmlFor="campaign-field-8">Sender</Label>
                                    <Select value={draft.senderIdentityId || "AUTO"} onValueChange={(value) => setDraft({ ...draft, senderIdentityId: value === "AUTO" ? null : value })}>
                                        <SelectTrigger className="w-full" id="campaign-field-8"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="AUTO">Default sender</SelectItem>
                                            {channelSenders.map((sender) => <SelectItem key={sender.id} value={sender.id}>{sender.name} · {sender.address}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {draft.channel === "EMAIL" ? (
                                    <div className="min-w-0 space-y-1">
                                        <Label htmlFor="campaign-field-9">Subject</Label>
                                        <Input id="campaign-field-9" value={draft.subject ?? ""} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} />
                                    </div>
                                ) : null}
                                <div className="min-w-0 space-y-1">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <Label htmlFor="campaign-field-10">Message</Label>
                                        {isAdmin ? (
                                            <DropdownMenu onOpenChange={(open) => { if (open && (snippets === null || snippetsFailed)) loadSnippets(); }}>
                                                <DropdownMenuTrigger asChild>
                                                    <Button type="button" size="xs" variant="ghost"><TextQuote className="size-4" />Insert snippet</Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-72">
                                                    <DropdownMenuLabel>Snippets</DropdownMenuLabel>
                                                    {snippetsFailed ? (
                                                        <DropdownMenuItem onSelect={(event) => { event.preventDefault(); loadSnippets(); }}>Couldn&apos;t load snippets. Try again</DropdownMenuItem>
                                                    ) : snippets === null ? (
                                                        <p role="status" className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</p>
                                                    ) : snippets.length === 0 ? (
                                                        <p className="px-2 py-1.5 text-sm text-muted-foreground">No snippets yet.</p>
                                                    ) : (
                                                        snippets.map((snippet) => (
                                                            <DropdownMenuItem key={snippet.id} onSelect={() => insertSnippet(snippet.body)} className="flex-col items-start gap-0.5">
                                                                <span className="font-mono text-xs font-medium">{snippet.key}</span>
                                                                <span className="line-clamp-2 text-xs text-muted-foreground">{snippet.body}</span>
                                                            </DropdownMenuItem>
                                                        ))
                                                    )}
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem asChild><Link href="/dashboard/settings/messaging/snippets">Manage snippets</Link></DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        ) : null}
                                    </div>
                                    <Textarea ref={messageRef} id="campaign-field-10" className="min-h-[220px]" value={draft.body} onSelect={(event) => { messageSelection.current = [event.currentTarget.selectionStart, event.currentTarget.selectionEnd]; }} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
                                    <p className="mt-1 text-xs text-muted-foreground">Available tokens: {"{{name}}, {{email}}, {{phone}}, {{source}}, {{status}}, {{score}}"}</p>
                                </div>
                                <div className="grid gap-3 md:grid-cols-3">
                                    <div className="min-w-0 space-y-1">
                                        <Label htmlFor="campaign-field-11">Throttle / minute</Label>
                                        <Input id="campaign-field-11" type="number" value={draft.throttlePerMinute ?? 60} onChange={(event) => setDraft({ ...draft, throttlePerMinute: Number(event.target.value || 0) })} />
                                    </div>
                                    <div className="min-w-0 space-y-1">
                                        <Label htmlFor="campaign-field-12">Quiet start</Label>
                                        <Input id="campaign-field-12" value={draft.quietHours?.start ?? "21:00"} onChange={(event) => setDraft({ ...draft, quietHours: { ...draft.quietHours, start: event.target.value } })} />
                                    </div>
                                    <div className="min-w-0 space-y-1">
                                        <Label htmlFor="campaign-field-13">Quiet end</Label>
                                        <Input id="campaign-field-13" value={draft.quietHours?.end ?? "09:00"} onChange={(event) => setDraft({ ...draft, quietHours: { ...draft.quietHours, end: event.target.value } })} />
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <Button disabled={saving || loading || !!loadError || isLocked || (!!selectedId && !dirty)} onClick={() => saveCampaign(false)}>{saving ? "Saving..." : selectedId ? "Save changes" : "Save as draft"}</Button>
                                    <p role="status" aria-live="polite" className="text-xs text-muted-foreground">{saveStatus}</p>
                                </div>
                            </div>

                                ) },
                                { id: "preview", label: "3. Preview", content: (
                            <div className="min-w-0 space-y-3">
                                <div className="rounded-lg border p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <div className="font-semibold">Audience Preview</div>
                                        <Badge variant="outline">{audiencePreview?.count ?? 0} records</Badge>
                                    </div>
                                    {nbaEnabled && audiencePreview && (audiencePreview.sampledLeadCount ?? 0) > 0 && (
                                        <p className="mb-2 text-xs text-muted-foreground">
                                            {audiencePreview.recipientsWithPendingNba ?? 0} of {audiencePreview.sampledLeadCount} sampled recipients have a pending next-best-action recommendation.
                                        </p>
                                    )}
                                    <div className="space-y-2">
                                        {(audiencePreview?.sample ?? []).map((item) => {
                                            const recipientKey = `${item.entityId}-${item.recipient}`;
                                            const isLead = item.entityType === "LEAD";
                                            const isExpanded = expandedRecipientKey === recipientKey;
                                            return (
                                                <div key={recipientKey} className="rounded-md bg-muted/50 text-sm">
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center gap-2 p-2 text-left disabled:cursor-default"
                                                        disabled={!isLead}
                                                        onClick={() => isLead && setExpandedRecipientKey(isExpanded ? null : recipientKey)}
                                                    >
                                                        {isLead ? (isExpanded ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />) : <span className="size-3.5 shrink-0" />}
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                                                <span className="min-w-0 break-words font-bold">{item.record?.name ?? item.recipient}</span>
                                                                {nbaEnabled && isLead && <NbaCountChip count={item.pendingNbaCount} />}
                                                            </div>
                                                            <div className="break-words text-xs text-muted-foreground">{item.recipient}</div>
                                                        </div>
                                                    </button>
                                                    {/* Real per-record NBA surface, not just a summary -- the same panel every
                                                        other surface uses, expanded per-recipient since this screen has no
                                                        persistent detail view to host it in permanently. */}
                                                    {isExpanded && isLead && (
                                                        <div className="border-t px-2 pb-2 pt-1">
                                                            <NextBestActionPanel recordType="LEAD" recordId={String(item.entityId)} title="Recommended Next Actions" />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {audiencePreview && audiencePreview.sample.length === 0 ? <div className="text-sm text-muted-foreground">No reachable recipients for this channel.</div> : null}
                                    </div>
                                </div>
                                <div className="rounded-lg border p-3">
                                    <div className="mb-2 font-semibold">Rendered Preview</div>
                                    <div className="rounded-md bg-muted/50 p-3 text-sm">
                                        {draft.channel === "EMAIL" ? <div className="mb-2 font-bold">{draft.subject || "No subject"}</div> : null}
                                        <pre className="whitespace-pre-wrap break-words font-sans">{draft.body || "No message body"}</pre>
                                    </div>
                                </div>
                            </div>
                                ) },
                            ]} />
                        </CardContent>
                    </Card>
        </div>
    );
}
