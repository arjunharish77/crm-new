"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Megaphone, Plus, Pencil, Trash2, Users, BarChart3 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StandardDialog } from "@/components/common/standard-dialog";

type CallCampaign = {
    id: string;
    name: string;
    description: string | null;
    module: "LEAD" | "OPPORTUNITY";
    audienceType: "MANUAL" | "LEAD_LIST" | "SAVED_VIEW";
    audienceConfig: Record<string, any>;
    callScriptId: string | null;
    dispositionGroupId: string | null;
    assignedTeamId: string | null;
    retryPolicy: { maxAttempts: number; retryDelayMinutes: number };
    status: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED";
    memberCounts: Record<string, number>;
};

type Option = { id: string; name: string };

function emptyCampaign(): Partial<CallCampaign> {
    return {
        name: "",
        description: "",
        module: "LEAD",
        audienceType: "MANUAL",
        audienceConfig: {},
        retryPolicy: { maxAttempts: 3, retryDelayMinutes: 60 },
    };
}

function totalMembers(counts: Record<string, number>) {
    return Object.values(counts ?? {}).reduce((sum, value) => sum + value, 0);
}

export default function CallCampaignsSettingsPage() {
    const [campaigns, setCampaigns] = useState<CallCampaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialog, setDialog] = useState<{ open: boolean; campaign: Partial<CallCampaign> | null }>({ open: false, campaign: null });

    const load = () => {
        setLoading(true);
        apiFetch<CallCampaign[]>("/call-campaigns")
            .then((data) => setCampaigns(Array.isArray(data) ? data : []))
            .catch(() => toast.error("Failed to load call campaigns"))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const addAudience = async (campaign: CallCampaign) => {
        try {
            const result = await apiFetch<{ requested: number; added: number }>(`/call-campaigns/${campaign.id}/audience`, { method: "POST" });
            toast.success(`Added ${result.added} of ${result.requested} matched record(s)`);
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to add audience");
        }
    };

    const setStatus = async (campaign: CallCampaign, status: CallCampaign["status"]) => {
        try {
            await apiFetch(`/call-campaigns/${campaign.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
            setCampaigns((current) => current.map((c) => (c.id === campaign.id ? { ...c, status } : c)));
        } catch (error: any) {
            toast.error(error?.message || "Failed to update campaign status");
        }
    };

    const remove = async (campaign: CallCampaign) => {
        if (!confirm(`Delete call campaign "${campaign.name}"?`)) return;
        try {
            await apiFetch(`/call-campaigns/${campaign.id}`, { method: "DELETE" });
            setCampaigns((current) => current.filter((c) => c.id !== campaign.id));
            toast.success("Call campaign deleted");
        } catch (error: any) {
            toast.error(error?.message || "Failed to delete call campaign");
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold">Call Campaigns</h1>
                    <p className="text-sm text-muted-foreground">
                        Build an audience from a List, a saved View, or a manual selection; assign a script, disposition set, retry
                        policy, and a team to work it.
                    </p>
                </div>
                <Button onClick={() => setDialog({ open: true, campaign: emptyCampaign() })}>
                    <Plus className="size-4" />
                    Add Campaign
                </Button>
            </div>

            {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
            ) : campaigns.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">No call campaigns yet.</Card>
            ) : (
                <div className="space-y-2">
                    {campaigns.map((campaign) => {
                        const total = totalMembers(campaign.memberCounts);
                        const completed = campaign.memberCounts?.COMPLETED ?? 0;
                        return (
                            <Card key={campaign.id} className="p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <Megaphone className="size-4 text-primary" />
                                        <span className="font-bold">{campaign.name}</span>
                                        <Badge variant={campaign.status === "ACTIVE" ? "default" : "outline"}>{campaign.status}</Badge>
                                        <span className="text-xs text-muted-foreground">
                                            {completed}/{total} completed
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {campaign.status !== "ACTIVE" ? (
                                            <Button size="sm" variant="outline" onClick={() => setStatus(campaign, "ACTIVE")}>
                                                Activate
                                            </Button>
                                        ) : (
                                            <Button size="sm" variant="outline" onClick={() => setStatus(campaign, "PAUSED")}>
                                                Pause
                                            </Button>
                                        )}
                                        <Button size="sm" variant="outline" onClick={() => addAudience(campaign)}>
                                            <Users className="size-3.5" />
                                            Add Audience
                                        </Button>
                                        {campaign.status === "ACTIVE" && (
                                            <Link href={`/dashboard/call-center/campaigns/${campaign.id}`}>
                                                <Button size="sm">Work Campaign</Button>
                                            </Link>
                                        )}
                                        <Button variant="ghost" size="icon" onClick={() => setDialog({ open: true, campaign })}>
                                            <Pencil className="size-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => remove(campaign)}>
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                </div>
                                {total > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                                        {Object.entries(campaign.memberCounts).map(([status, count]) => (
                                            <Badge key={status} variant="outline">
                                                {status}: {count}
                                            </Badge>
                                        ))}
                                        <Link href={`/dashboard/settings/call-campaigns/${campaign.id}/analytics`} className="inline-flex items-center gap-1 text-primary hover:underline">
                                            <BarChart3 className="size-3.5" />
                                            Analytics
                                        </Link>
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}

            {dialog.open && dialog.campaign && (
                <CampaignDialog
                    campaign={dialog.campaign}
                    onClose={() => setDialog({ open: false, campaign: null })}
                    onSaved={(saved) => {
                        setCampaigns((current) => {
                            const exists = current.some((c) => c.id === saved.id);
                            return exists ? current.map((c) => (c.id === saved.id ? { ...c, ...saved } : c)) : [...current, { ...saved, memberCounts: {} }];
                        });
                        setDialog({ open: false, campaign: null });
                    }}
                />
            )}
        </div>
    );
}

function CampaignDialog({
    campaign,
    onClose,
    onSaved,
}: {
    campaign: Partial<CallCampaign>;
    onClose: () => void;
    onSaved: (campaign: CallCampaign) => void;
}) {
    const [name, setName] = useState(campaign.name ?? "");
    const [description, setDescription] = useState(campaign.description ?? "");
    const [module, setModule] = useState<"LEAD" | "OPPORTUNITY">(campaign.module ?? "LEAD");
    const [audienceType, setAudienceType] = useState<CallCampaign["audienceType"]>(campaign.audienceType ?? "MANUAL");
    const [leadListId, setLeadListId] = useState(campaign.audienceConfig?.leadListId ?? "");
    const [savedViewId, setSavedViewId] = useState(campaign.audienceConfig?.savedViewId ?? "");
    const [manualIds, setManualIds] = useState((campaign.audienceConfig?.recordIds ?? []).join("\n"));
    const [maxAttempts, setMaxAttempts] = useState(String(campaign.retryPolicy?.maxAttempts ?? 3));
    const [retryDelayMinutes, setRetryDelayMinutes] = useState(String(campaign.retryPolicy?.retryDelayMinutes ?? 60));
    const [leadLists, setLeadLists] = useState<Option[]>([]);
    const [savedViews, setSavedViews] = useState<Option[]>([]);
    const [scripts, setScripts] = useState<Option[]>([]);
    const [dispositionGroups, setDispositionGroups] = useState<Option[]>([]);
    const [teams, setTeams] = useState<Option[]>([]);
    const [callScriptId, setCallScriptId] = useState(campaign.callScriptId ?? "");
    const [dispositionGroupId, setDispositionGroupId] = useState(campaign.dispositionGroupId ?? "");
    const [assignedTeamId, setAssignedTeamId] = useState(campaign.assignedTeamId ?? "");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        apiFetch<any[]>("/lead-lists").then((data) => setLeadLists((data ?? []).map((l) => ({ id: l.id, name: l.name })))).catch(() => undefined);
        apiFetch<any[]>(`/saved-views?module=${module === "OPPORTUNITY" ? "OPPORTUNITIES" : "LEADS"}`)
            .then((data) => setSavedViews((data ?? []).map((v) => ({ id: v.id, name: v.name }))))
            .catch(() => undefined);
        apiFetch<any[]>("/call-scripts").then((data) => setScripts((data ?? []).map((s) => ({ id: s.id, name: s.name })))).catch(() => undefined);
        apiFetch<any[]>("/disposition-groups").then((data) => setDispositionGroups((data ?? []).map((g) => ({ id: g.id, name: g.name })))).catch(() => undefined);
        apiFetch<any[]>("/teams").then((data) => setTeams((data ?? []).map((t) => ({ id: t.id, name: t.name })))).catch(() => undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [module]);

    const save = async () => {
        if (!name.trim()) {
            toast.error("Name is required");
            return;
        }
        setSaving(true);
        try {
            const audienceConfig =
                audienceType === "LEAD_LIST"
                    ? { leadListId }
                    : audienceType === "SAVED_VIEW"
                        ? { savedViewId }
                        : { recordIds: manualIds.split("\n").map((id: string) => id.trim()).filter(Boolean) };
            const payload = {
                name,
                description,
                module,
                audienceType,
                audienceConfig,
                callScriptId: callScriptId || null,
                dispositionGroupId: dispositionGroupId || null,
                assignedTeamId: assignedTeamId || null,
                retryPolicy: { maxAttempts: Number(maxAttempts) || 3, retryDelayMinutes: Number(retryDelayMinutes) || 60 },
            };
            const saved = campaign.id
                ? await apiFetch<CallCampaign>(`/call-campaigns/${campaign.id}`, { method: "PATCH", body: JSON.stringify(payload) })
                : await apiFetch<CallCampaign>("/call-campaigns", { method: "POST", body: JSON.stringify(payload) });
            onSaved(saved);
            toast.success(campaign.id ? "Call campaign updated" : "Call campaign created");
        } catch (error: any) {
            toast.error(error?.message || "Failed to save call campaign");
        } finally {
            setSaving(false);
        }
    };

    return (
        <StandardDialog
            open
            onClose={onClose}
            title={campaign.id ? "Edit Call Campaign" : "Add Call Campaign"}
            maxWidth="lg"
            actions={
                <>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button disabled={saving} onClick={save}>
                        {saving ? "Saving..." : "Save"}
                    </Button>
                </>
            }
        >
            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-[18px] pt-1">
                <div className="space-y-1.5">
                    <Label>Name</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                    <Label>Description</Label>
                    <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                    <Label>Module</Label>
                    <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={module} onChange={(e) => setModule(e.target.value as any)}>
                        <option value="LEAD">Lead</option>
                        <option value="OPPORTUNITY">Opportunity</option>
                    </select>
                </div>

                <div className="space-y-1.5">
                    <Label>Audience Source</Label>
                    <select
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={audienceType}
                        onChange={(e) => setAudienceType(e.target.value as any)}
                    >
                        <option value="MANUAL">Manual selection</option>
                        <option value="LEAD_LIST">List</option>
                        <option value="SAVED_VIEW">Saved View</option>
                    </select>
                </div>

                {audienceType === "LEAD_LIST" && (
                    <div className="space-y-1.5">
                        <Label>List</Label>
                        <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={leadListId} onChange={(e) => setLeadListId(e.target.value)}>
                            <option value="">Select a list</option>
                            {leadLists.map((option) => (
                                <option key={option.id} value={option.id}>
                                    {option.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {audienceType === "SAVED_VIEW" && (
                    <div className="space-y-1.5">
                        <Label>Saved View</Label>
                        <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={savedViewId} onChange={(e) => setSavedViewId(e.target.value)}>
                            <option value="">Select a view</option>
                            {savedViews.map((option) => (
                                <option key={option.id} value={option.id}>
                                    {option.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {audienceType === "MANUAL" && (
                    <div className="space-y-1.5">
                        <Label>Record Ids (one per line)</Label>
                        <Textarea rows={4} value={manualIds} onChange={(e) => setManualIds(e.target.value)} placeholder="lead-id-1&#10;lead-id-2" />
                    </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1.5">
                        <Label>Call Script</Label>
                        <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={callScriptId} onChange={(e) => setCallScriptId(e.target.value)}>
                            <option value="">None</option>
                            {scripts.map((option) => (
                                <option key={option.id} value={option.id}>
                                    {option.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Disposition Set</Label>
                        <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={dispositionGroupId} onChange={(e) => setDispositionGroupId(e.target.value)}>
                            <option value="">None</option>
                            {dispositionGroups.map((option) => (
                                <option key={option.id} value={option.id}>
                                    {option.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Assigned Team</Label>
                        <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={assignedTeamId} onChange={(e) => setAssignedTeamId(e.target.value)}>
                            <option value="">Any team</option>
                            {teams.map((option) => (
                                <option key={option.id} value={option.id}>
                                    {option.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                        <Label>Max Attempts</Label>
                        <Input type="number" min={1} value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Retry Delay (minutes)</Label>
                        <Input type="number" min={1} value={retryDelayMinutes} onChange={(e) => setRetryDelayMinutes(e.target.value)} />
                    </div>
                </div>
            </div>
        </StandardDialog>
    );
}
