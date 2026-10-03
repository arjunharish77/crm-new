"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { DEFAULT_WORKSPACE_TIME_ZONE, saveDisplaySettings } from "@/lib/date-format";
import { PageHeader } from "@/components/layout/page-header";
import { Section } from "@/components/common/section";
import { SaveBar } from "@/components/common/save-bar";
import { ErrorState } from "@/components/common/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type WorkspaceSettings = { companyName: string; timezone: string; currency: string; language: string };

const TIME_ZONES = [
    ["Asia/Kolkata", "Kolkata"],
    ["America/New_York", "Eastern (US & Canada)"],
    ["America/Chicago", "Central (US & Canada)"],
    ["America/Denver", "Mountain (US & Canada)"],
    ["America/Los_Angeles", "Pacific (US & Canada)"],
    ["Europe/London", "London"],
    ["Europe/Paris", "Paris"],
    ["Asia/Tokyo", "Tokyo"],
] as const;
const CURRENCIES = [["INR", "INR — Indian rupee"], ["USD", "USD — US dollar"], ["EUR", "EUR — Euro"], ["GBP", "GBP — British pound"], ["JPY", "JPY — Japanese yen"]] as const;
const LANGUAGES = [["en", "English"], ["hi", "Hindi"]] as const;

const EMPTY: WorkspaceSettings = { companyName: "", timezone: DEFAULT_WORKSPACE_TIME_ZONE, currency: "INR", language: "en" };

// Settings › Workspace › Workspace profile: the company name and the workspace's regional
// settings. The personal tabs that were here (appearance, personal workspace, my activity) are
// in My account.
export default function WorkspaceProfilePage() {
    const [saved, setSaved] = useState<WorkspaceSettings | null>(null);
    const [draft, setDraft] = useState<WorkspaceSettings>(EMPTY);
    const [failed, setFailed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const load = () => {
        setFailed(false);
        apiFetch<any>("/settings/general")
            .then((data) => {
                const next = {
                    companyName: data?.companyName ?? "",
                    timezone: data?.timezone ?? EMPTY.timezone,
                    currency: data?.currency ?? EMPTY.currency,
                    language: data?.language ?? EMPTY.language,
                };
                setSaved(next);
                setDraft(next);
            })
            .catch(() => setFailed(true));
    };
    useEffect(load, []);

    const dirty = !!saved && JSON.stringify(saved) !== JSON.stringify(draft);
    const set = (patch: Partial<WorkspaceSettings>) => { setDraft((current) => ({ ...current, ...patch })); setError(""); };

    const save = async () => {
        if (!draft.companyName.trim()) { setError("Enter your company's name."); return; }
        setSaving(true);
        try {
            const body = { ...draft, companyName: draft.companyName.trim(), dateFormat: "dd/MM/yyyy" };
            await apiFetch("/settings/general", { method: "PATCH", body: JSON.stringify(body) });
            saveDisplaySettings(body);
            setSaved({ ...draft, companyName: body.companyName });
            setDraft((current) => ({ ...current, companyName: body.companyName }));
            toast.success("Workspace settings saved");
        } catch (caught: any) {
            toast.error(caught?.message || "The settings couldn't be saved");
        } finally {
            setSaving(false);
        }
    };

    if (failed) return <><PageHeader title="Workspace profile" /><ErrorState description="The workspace settings couldn't be loaded." onRetry={load} /></>;

    return (
        <div className="min-w-0 max-w-4xl">
            <PageHeader title="Workspace profile" description="Your company's name and the regional settings everyone sees by default." />
            {!saved ? (
                <div className="space-y-3" aria-busy="true"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>
            ) : (
                <>
                    <Section layout="split" id="company" title="Company" description="Shown in the header, emails and exported files.">
                        <div className="max-w-md space-y-1.5">
                            <Label htmlFor="company-name">Company name</Label>
                            <Input id="company-name" value={draft.companyName} onChange={(event) => set({ companyName: event.target.value })} aria-invalid={!!error || undefined} aria-describedby={error ? "company-name-error" : undefined} />
                            {error ? <p id="company-name-error" className="text-sm text-destructive">{error}</p> : null}
                        </div>
                    </Section>
                    <Section layout="split" id="regional" title="Regional settings" description={<>Dates and amounts use these unless someone chooses their own in <Link href="/dashboard/account/preferences" className="text-primary hover:underline">My account</Link>. Dates show as dd/MM/yyyy.</>}>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="workspace-timezone">Time zone</Label>
                                <Select value={draft.timezone} onValueChange={(value) => set({ timezone: value })}>
                                    <SelectTrigger id="workspace-timezone" className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>{TIME_ZONES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="workspace-currency">Currency</Label>
                                <Select value={draft.currency} onValueChange={(value) => set({ currency: value })}>
                                    <SelectTrigger id="workspace-currency" className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>{CURRENCIES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="workspace-language">Language</Label>
                                <Select value={draft.language} onValueChange={(value) => set({ language: value })}>
                                    <SelectTrigger id="workspace-language" className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>{LANGUAGES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        </div>
                    </Section>
                    <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => { if (saved) setDraft(saved); setError(""); }} />
                </>
            )}
        </div>
    );
}
