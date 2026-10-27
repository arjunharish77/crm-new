"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CircleAlert, Pause, PhoneCall, Play } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { VoiceBotConfig } from "@/lib/voice-bot-config";
import { voiceBotAccess } from "@/lib/voice-bot-access-level";
import { useAuth } from "@/providers/auth-provider";
import { PageHeader } from "@/components/layout/page-header";
import { PageTabs, usePageTab } from "@/components/common/page-tabs";
import { ModuleGate } from "@/components/common/module-gate";
import { SaveBar } from "@/components/common/save-bar";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { EmptyState } from "@/components/common/empty-state";
import { useConfirm } from "@/components/common/dialogs-provider";
import { useRecordTitle } from "@/components/app-states/page-title";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BasicsPanel } from "@/components/voice-bots/builder/basics-panel";
import { ConversationPanel } from "@/components/voice-bots/builder/conversation-panel";
import { FieldsPanel } from "@/components/voice-bots/builder/fields-panel";
import { MappingPanel } from "@/components/voice-bots/builder/mapping-panel";
import { CallingPanel } from "@/components/voice-bots/builder/calling-panel";
import { TestCallDialog } from "@/components/voice-bots/builder/test-call-dialog";
import { KnowledgePanel } from "@/components/voice-bots/builder/knowledge-panel";
import { CallsPanel } from "@/components/voice-bots/builder/calls-panel";
import { DashboardPanel } from "@/components/voice-bots/dashboard-panel";
import { BOT_STATUS, type FieldCatalog, type ProviderSettings, type VoiceBotDetail } from "@/components/voice-bots/types";

const TABS = [
    { value: "basics", label: "Basics" },
    { value: "conversation", label: "Conversation" },
    { value: "fields", label: "Fields" },
    { value: "mapping", label: "Mapping" },
    { value: "knowledge", label: "Knowledge" },
    { value: "calling", label: "Calling" },
    { value: "calls", label: "Calls" },
    { value: "results", label: "Results" },
] as const;
type Tab = (typeof TABS)[number]["value"];

// Field questions are edited (and saved) in the Fields tab, so the form leaves them out.
type Draft = { name: string; config: Omit<VoiceBotConfig, "fieldQuestions"> };
const draftOf = (bot: VoiceBotDetail): Draft => {
    const { fieldQuestions: _questions, ...config } = bot.config;
    void _questions;
    return { name: bot.name, config };
};

// A voice bot's builder (UI/UX plan builder template): back to the list, the bot's name and
// status, Go live / Pause, what's missing before it can go live, five tabs and one save bar.
function VoiceBotBuilder() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const confirm = useConfirm();
    const [tab, setTab] = usePageTab<Tab>(TABS, "basics");
    // ?call=<id> (from the dashboard's "Calls to listen to") opens that call on the Calls tab.
    const callFromLink = useSearchParams().get("call");
    const [bot, setBot] = useState<VoiceBotDetail | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [saving, setSaving] = useState(false);
    const [statusChanging, setStatusChanging] = useState(false);
    const [showErrors, setShowErrors] = useState(false);
    const [catalog, setCatalog] = useState<FieldCatalog | null>(null);
    const [providers, setProviders] = useState<ProviderSettings | null>(null);
    const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
    const [opportunityTypes, setOpportunityTypes] = useState<Array<{ id: string; name: string }>>([]);
    const [numbers, setNumbers] = useState<Array<{ number: string; alias: string | null }>>([]);
    const [testOpen, setTestOpen] = useState(false);
    useRecordTitle(bot?.name);

    const loadBot = useCallback(async () => {
        const next = await apiFetch<VoiceBotDetail>(`/voice-bots/${id}`);
        setBot(next);
        return next;
    }, [id]);

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            const next = await loadBot();
            setDraft(draftOf(next));
        } catch (error: any) {
            if (error?.status === 404) setNotFound(true);
            else setLoadError(error?.message || "The bot couldn't be loaded.");
        }
    }, [loadBot]);

    useEffect(() => {
        load();
        const list = (value: any) => (Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : []);
        apiFetch<FieldCatalog>("/voice-bots/catalog").then(setCatalog).catch(() => setCatalog({ callerDetails: [], mappingTargets: [] }));
        apiFetch<ProviderSettings>("/voice-bots/providers").then(setProviders).catch(() => setProviders(null));
        apiFetch<any>("/teams").then((rows) => setTeams(list(rows).map((team: any) => ({ id: String(team.id), name: String(team.name) })))).catch(() => setTeams([]));
        apiFetch<any>("/opportunity-types").then((rows) => setOpportunityTypes(list(rows).map((type: any) => ({ id: String(type.id), name: String(type.name) })))).catch(() => setOpportunityTypes([]));
        apiFetch<any>("/voice-bots/numbers").then((data) => setNumbers(Array.isArray(data?.numbers) ? data.numbers : [])).catch(() => setNumbers([]));
    }, [load]);

    const baseline = useMemo(() => (bot ? draftOf(bot) : null), [bot]);
    const dirty = !!draft && !!baseline && JSON.stringify(draft) !== JSON.stringify(baseline);

    // Leaving with unsaved changes asks first.
    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    if (notFound) return <EmptyState title="Voice bot not found" description="It may have been archived." action={<Button variant="outline" asChild><Link href="/dashboard/voice-bots?tab=bots">Back to voice bots</Link></Button>} />;
    if (loadError) return <ErrorState description={loadError} onRetry={load} />;
    if (!bot || !draft) return <div className="space-y-3" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-9" /><Skeleton className="h-64" /></div>;

    const update = (patch: Partial<VoiceBotConfig>) => setDraft((current) => (current ? { ...current, config: { ...current.config, ...patch } } : current));
    const config = { ...draft.config, fieldQuestions: bot.config.fieldQuestions } as VoiceBotConfig;
    const nameError = showErrors && draft.name.trim().length < 2 ? "Give the bot a name of at least 2 characters." : null;
    const timeError = draft.config.calling.start >= draft.config.calling.end ? "The start must be before the end." : null;
    const typeError = draft.config.opportunityChoice.mode === "LATEST_OF_TYPE" && !draft.config.opportunityChoice.typeId;

    const save = async () => {
        if (draft.name.trim().length < 2 || timeError || typeError) {
            setShowErrors(true);
            setTab(draft.name.trim().length < 2 || typeError ? "basics" : "calling");
            toast.error("Fix the highlighted settings before saving");
            return false;
        }
        setSaving(true);
        try {
            const next = await apiFetch<VoiceBotDetail>(`/voice-bots/${bot.id}`, { method: "PATCH", body: JSON.stringify({ name: draft.name.trim(), config: draft.config }) });
            setBot(next);
            setDraft(draftOf(next));
            setShowErrors(false);
            toast.success("Bot saved. New calls use these settings.");
            return true;
        } catch (error: any) {
            toast.error(error?.message || "The bot couldn't be saved");
            return false;
        } finally {
            setSaving(false);
        }
    };

    // A test call uses the saved settings, so unsaved changes are saved first.
    const openTestCall = async () => {
        if (dirty) {
            const ok = await confirm({
                title: "Save your changes first?",
                description: "The test call uses the bot's saved settings.",
                confirmLabel: "Save and test",
            });
            if (!ok || !(await save())) return;
        }
        setTestOpen(true);
    };

    const setStatus = async (status: "LIVE" | "PAUSED") => {
        if (dirty) { toast.error("Save or discard your changes first."); return; }
        if (status === "LIVE") {
            const ok = await confirm({
                title: `Make ${bot.name} live?`,
                description: "It can then place calls when started from records, lists, automations or enquiries, and answer the numbers set to it.",
                confirmLabel: "Go live",
            });
            if (!ok) return;
        }
        setStatusChanging(true);
        try {
            const next = await apiFetch<VoiceBotDetail>(`/voice-bots/${bot.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
            setBot(next);
            toast.success(status === "LIVE" ? `${bot.name} is live` : `${bot.name} is paused. It takes no new calls.`);
        } catch (error: any) {
            toast.error(error?.message || "The status couldn't be changed");
            loadBot().catch(() => undefined);
        } finally {
            setStatusChanging(false);
        }
    };

    const archive = async () => {
        const ok = await confirm({
            title: `Archive ${bot.name}?`,
            description: "It stops taking calls, and numbers it answered go back to people. Its past calls stay on records. You can restore it from the archived list.",
            confirmLabel: "Archive bot",
            destructive: true,
        });
        if (!ok) return;
        try {
            await apiFetch(`/voice-bots/${bot.id}`, { method: "DELETE" });
            toast.success(`${bot.name} archived`);
            router.push("/dashboard/voice-bots?tab=bots");
        } catch (error: any) {
            toast.error(error?.message || "The bot couldn't be archived");
        }
    };

    // After a field change: the server's questions, and links to a deleted field dropped from the form too.
    const fieldsChanged = async (removedKey?: string) => {
        const next = await loadBot();
        setDraft((current) => {
            if (!current) return current;
            if (!removedKey) return current;
            const unlink = (steps: VoiceBotConfig["fixedSteps"]["before"]) => steps.map((step) => (step.fieldKey === removedKey ? { ...step, fieldKey: null } : step));
            return { ...current, config: { ...current.config, mappings: current.config.mappings.filter((mapping) => mapping.fieldKey !== removedKey), fixedSteps: { before: unlink(current.config.fixedSteps.before), after: unlink(current.config.fixedSteps.after) } } };
        });
        void next;
    };

    const status = BOT_STATUS[bot.status];
    const showReadiness = bot.status !== "LIVE" && bot.readiness.length > 0;
    return (
        <div className="min-w-0 pb-20">
            <PageHeader
                title={bot.name}
                backHref="/dashboard/voice-bots?tab=bots"
                backLabel="Voice bots"
                meta={<StatusBadge tone={status.tone} label={status.label} />}
                secondaryActions={<Button variant="outline" onClick={openTestCall} disabled={saving}><PhoneCall className="size-4" />Test call</Button>}
                primaryAction={bot.status === "LIVE"
                    ? <Button variant="outline" onClick={() => setStatus("PAUSED")} isLoading={statusChanging} disabled={statusChanging}><Pause className="size-4" />Pause</Button>
                    : <Button onClick={() => setStatus("LIVE")} isLoading={statusChanging} disabled={statusChanging || showReadiness}><Play className="size-4" />{bot.status === "PAUSED" ? "Resume" : "Go live"}</Button>}
                menuItems={[{ label: "Archive bot", onSelect: archive, destructive: true }]}
            />
            {showReadiness ? (
                <section aria-labelledby="readiness-heading" className="mb-4 rounded-lg border border-status-warning bg-status-warning/40 px-4 py-3">
                    <h2 id="readiness-heading" className="flex items-center gap-2 text-sm font-medium"><CircleAlert className="size-4" aria-hidden />Before this bot can go live</h2>
                    <ul className="mt-1.5 space-y-1 text-sm">
                        {bot.readiness.map((issue, index) => (
                            <li key={index} className="flex flex-wrap items-baseline gap-x-2">
                                <span>{issue.message}</span>
                                {issue.tab === "providers"
                                    ? <Link href="/dashboard/voice-bots?tab=providers" className="text-xs font-medium text-primary hover:underline">Open Providers</Link>
                                    : issue.tab === "phone-system"
                                    ? <Link href="/dashboard/settings/integrations?section=phone-system" className="text-xs font-medium text-primary hover:underline">Open Phone system</Link>
                                    : TABS.some((item) => item.value === issue.tab)
                                    ? <button type="button" onClick={() => setTab(issue.tab as Tab)} className="text-xs font-medium text-primary hover:underline">Go to {TABS.find((item) => item.value === issue.tab)?.label}</button>
                                    : null}
                            </li>
                        ))}
                    </ul>
                    {dirty ? <p className="mt-1.5 text-xs text-muted-foreground">This list updates when you save.</p> : null}
                </section>
            ) : null}
            <PageTabs tabs={TABS} value={tab} onChange={setTab} label="Bot settings" />
            <div role="tabpanel" aria-labelledby={`tab-${tab}`} className="max-w-5xl">
                {tab === "basics" ? <BasicsPanel name={draft.name} onNameChange={(name) => setDraft({ ...draft, name })} nameError={nameError} config={config} update={update} providers={providers} catalog={catalog} opportunityTypes={opportunityTypes} /> : null}
                {tab === "conversation" ? <ConversationPanel config={config} update={update} catalog={catalog} fields={bot.fields} teams={teams} providers={providers} showErrors={showErrors} /> : null}
                {tab === "fields" ? <FieldsPanel botId={bot.id} fields={bot.fields} onChanged={fieldsChanged} /> : null}
                {tab === "mapping" ? <MappingPanel config={config} update={update} fields={bot.fields} catalog={catalog} /> : null}
                {tab === "knowledge" ? <KnowledgePanel botId={bot.id} /> : null}
                {tab === "calling" ? <CallingPanel config={config} update={update} numbers={numbers} timeError={timeError} /> : null}
                {tab === "calls" ? <CallsPanel botId={bot.id} canManage initialCallId={callFromLink} /> : null}
                {tab === "results" ? <DashboardPanel botId={bot.id} /> : null}
            </div>
            <SaveBar dirty={dirty} saving={saving} onSave={() => { void save(); }} onDiscard={() => { setDraft(draftOf(bot)); setShowErrors(false); }} />
            <TestCallDialog botId={bot.id} open={testOpen} onClose={() => setTestOpen(false)} />
        </div>
    );
}

function Gate() {
    const { user } = useAuth();
    if (voiceBotAccess(user as any) !== "manage") return <EmptyState title="You can't manage voice bots" description="Building voice bots needs the Manage level for Voice bots on your role. Ask a workspace admin." />;
    return <VoiceBotBuilder />;
}

export default function VoiceBotBuilderRoute() {
    return (
        <ModuleGate moduleKey="TELEPHONY" name="Telephony">
            <ModuleGate moduleKey="VOICE_BOT" name="Voice bots">
                <Gate />
            </ModuleGate>
        </ModuleGate>
    );
}
