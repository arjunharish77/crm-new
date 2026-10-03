"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, MessageSquareText, Send } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState } from "@/components/common/error-state";
import { StandardDialog } from "@/components/common/standard-dialog";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { humanizeEnum } from "@/lib/display/status";

type Channel = "EMAIL" | "SMS" | "WHATSAPP";
type ConsentStatus = "OPTED_IN" | "OPTED_OUT";
type LawfulBasis = "CONSENT" | "CONTRACT" | "LEGITIMATE_INTEREST" | "LEGAL_OBLIGATION";

type HistoryEntry = {
    id: string;
    channel: string;
    status: ConsentStatus;
    lawfulBasis: LawfulBasis | null;
    source: string | null;
    changedBy: string | null;
    createdAt: string;
};

const CHANNELS: Array<{ value: Channel; label: string; icon: typeof Mail }> = [
    { value: "EMAIL", label: "Email", icon: Mail },
    { value: "SMS", label: "SMS", icon: Send },
    { value: "WHATSAPP", label: "WhatsApp", icon: MessageSquareText },
];

const LAWFUL_BASES: Array<{ value: LawfulBasis; label: string }> = [
    { value: "CONSENT", label: "Consent" },
    { value: "CONTRACT", label: "Contract" },
    { value: "LEGITIMATE_INTEREST", label: "Legitimate interest" },
    { value: "LEGAL_OBLIGATION", label: "Legal obligation" },
];

const SOURCES: Array<{ value: string; label: string }> = [
    { value: "MANUAL", label: "Updated by staff" },
    { value: "VERBAL", label: "Told us by phone or in person" },
    { value: "WRITTEN", label: "Asked in writing" },
    { value: "FORM", label: "Web form" },
];

const SOURCE_LABELS: Record<string, string> = {
    ...Object.fromEntries(SOURCES.map((source) => [source.value, source.label])),
    UNSUBSCRIBE_LINK: "Unsubscribe link",
};

function channelLabel(channel: string) {
    return CHANNELS.find((item) => item.value === channel)?.label ?? humanizeEnum(channel);
}

function sourceLabel(source: string | null) {
    if (!source) return null;
    return SOURCE_LABELS[source] ?? humanizeEnum(source);
}

// "Communication preferences" on a lead or opportunity (UI/UX plan decision 33): the current
// opt-in per channel and the append-only consent history. The consent API is admin-only, so
// the card only shows for admins. Current state comes from the consent record itself; the
// newest history entry is used only for a channel with no record.
export function ConsentCard({ entityType, entityId }: { entityType: "LEAD" | "OPPORTUNITY"; entityId: string }) {
    const { user } = useAuth();
    const isAdmin = Boolean(user?.isTenantAdmin || user?.isPlatformAdmin);
    const [history, setHistory] = useState<HistoryEntry[] | null>(null);
    const [currentRows, setCurrentRows] = useState<Array<Pick<HistoryEntry, "channel" | "status" | "lawfulBasis" | "source"> & { updatedAt: string }>>([]);
    const [failed, setFailed] = useState(false);
    const [userNames, setUserNames] = useState<Record<string, string>>({});
    const [editing, setEditing] = useState<{ channel: Channel; status: ConsentStatus } | null>(null);
    const [lawfulBasis, setLawfulBasis] = useState<LawfulBasis>("CONSENT");
    const [source, setSource] = useState("MANUAL");
    const [saving, setSaving] = useState(false);
    const [showAll, setShowAll] = useState(false);

    const load = useCallback(async () => {
        setFailed(false);
        try {
            const query = `entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`;
            const [data, currentData] = await Promise.all([
                apiFetch<HistoryEntry[]>(`/communications/consent/history?${query}`),
                apiFetch<any[]>(`/communications/consent?${query}`),
            ]);
            setHistory(Array.isArray(data) ? data : []);
            setCurrentRows(Array.isArray(currentData) ? currentData : []);
        } catch {
            setFailed(true);
        }
    }, [entityType, entityId]);

    useEffect(() => {
        if (!isAdmin) return;
        load();
        apiFetch<any>("/users")
            .then((data) => {
                const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
                setUserNames(Object.fromEntries(list.filter((item) => item?.id).map((item) => [item.id, item.name || item.email || ""])));
            })
            .catch(() => setUserNames({}));
    }, [isAdmin, load]);

    const current = useMemo(() => {
        const latest = new Map<string, HistoryEntry>();
        for (const entry of history ?? []) if (!latest.has(entry.channel)) latest.set(entry.channel, entry);
        // The consent record is the truth; history fills in only channels without one.
        for (const row of currentRows) latest.set(row.channel, { ...(latest.get(row.channel) ?? {}), ...row, createdAt: row.updatedAt } as HistoryEntry);
        return latest;
    }, [history, currentRows]);

    if (!isAdmin) return null;

    const openChange = (channel: Channel, status: ConsentStatus) => {
        const previous = current.get(channel);
        setLawfulBasis(previous?.lawfulBasis ?? "CONSENT");
        setSource("MANUAL");
        setEditing({ channel, status });
    };

    const save = async () => {
        if (!editing) return;
        setSaving(true);
        try {
            await apiFetch("/communications/consent", {
                method: "PUT",
                body: JSON.stringify({ entityType, entityId, channel: editing.channel, status: editing.status, lawfulBasis, source }),
            });
            toast.success(`${channelLabel(editing.channel)}: ${editing.status === "OPTED_IN" ? "opted in" : "opted out"}`);
            setEditing(null);
            load();
        } catch (caught: any) {
            toast.error(caught?.message || "The preference couldn't be saved");
        } finally {
            setSaving(false);
        }
    };

    const visibleHistory = showAll ? history ?? [] : (history ?? []).slice(0, 5);

    return (
        <section aria-labelledby={`consent-${entityId}-heading`} className="space-y-3 rounded-lg border p-3">
            <div>
                <h3 id={`consent-${entityId}-heading`} className="text-sm font-semibold">Communication preferences</h3>
                <p className="text-xs text-muted-foreground">Marketing messages aren&apos;t sent on a channel this {entityType === "LEAD" ? "lead" : "opportunity"} has opted out of.</p>
            </div>

            {failed ? (
                <ErrorState variant="inline" description="The communication preferences couldn't be loaded." onRetry={load} />
            ) : history === null ? (
                <p role="status" className="text-sm text-muted-foreground">Loading…</p>
            ) : (
                <>
                    <ul className="divide-y rounded-lg border">
                        {CHANNELS.map(({ value, label, icon: Icon }) => {
                            const entry = current.get(value);
                            const optedOut = entry?.status === "OPTED_OUT";
                            return (
                                <li key={value} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                                        <span className="text-sm font-medium">{label}</span>
                                        {entry ? (
                                            <Badge tone={optedOut ? "danger" : "success"}>{optedOut ? "Opted out" : "Opted in"}</Badge>
                                        ) : (
                                            <Badge tone="neutral">Not recorded</Badge>
                                        )}
                                        {entry ? <span className="text-xs text-muted-foreground">{formatWorkspaceDateTime(entry.createdAt)}</span> : null}
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {optedOut || !entry ? (
                                            <Button size="sm" variant="outline" aria-label={`Record ${label} opt-in`} onClick={() => openChange(value, "OPTED_IN")}>Record opt-in</Button>
                                        ) : null}
                                        {!optedOut ? (
                                            <Button size="sm" variant={entry ? "outline" : "ghost"} aria-label={`Opt out of ${label}`} onClick={() => openChange(value, "OPTED_OUT")}>Opt out</Button>
                                        ) : null}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>

                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground">History</h4>
                        {history.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
                        ) : (
                            <ol className="space-y-2">
                                {visibleHistory.map((entry) => (
                                    <li key={entry.id} className="text-sm">
                                        <div className="flex flex-wrap items-center gap-x-2">
                                            <span className="font-medium">{channelLabel(entry.channel)}</span>
                                            <span>{entry.status === "OPTED_OUT" ? "opted out" : "opted in"}</span>
                                            <span className="text-xs text-muted-foreground">{formatWorkspaceDateTime(entry.createdAt)}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {[
                                                entry.lawfulBasis ? `Basis: ${humanizeEnum(entry.lawfulBasis).toLowerCase()}` : null,
                                                sourceLabel(entry.source),
                                                entry.changedBy ? `By ${userNames[entry.changedBy] || "a team member"}` : null,
                                            ].filter(Boolean).join(" · ")}
                                        </p>
                                    </li>
                                ))}
                            </ol>
                        )}
                        {history.length > 5 ? (
                            <Button size="sm" variant="ghost" onClick={() => setShowAll((value) => !value)}>
                                {showAll ? "Show less" : `Show all ${history.length} changes`}
                            </Button>
                        ) : null}
                    </div>
                </>
            )}

            <StandardDialog
                open={!!editing}
                onClose={() => { if (!saving) setEditing(null); }}
                title={editing ? `${editing.status === "OPTED_IN" ? "Record opt-in" : "Opt out"} for ${channelLabel(editing.channel)}?` : "Change preference"}
                subtitle={editing?.status === "OPTED_OUT" ? "Marketing messages on this channel stop straight away." : "Marketing messages on this channel are allowed."}
                maxWidth="xs"
                actions={<>
                    <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
                    <Button variant={editing?.status === "OPTED_OUT" ? "destructive" : "default"} onClick={save} isLoading={saving}>
                        {editing?.status === "OPTED_OUT" ? "Opt out" : "Record opt-in"}
                    </Button>
                </>}
            >
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor={`consent-${entityId}-basis`}>Lawful basis</Label>
                        <Select value={lawfulBasis} onValueChange={(value) => setLawfulBasis(value as LawfulBasis)}>
                            <SelectTrigger id={`consent-${entityId}-basis`} className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>{LAWFUL_BASES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`consent-${entityId}-source`}>How we heard</Label>
                        <Select value={source} onValueChange={setSource}>
                            <SelectTrigger id={`consent-${entityId}-source`} className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>{SOURCES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                </div>
            </StandardDialog>
        </section>
    );
}
