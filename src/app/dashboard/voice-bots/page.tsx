"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageTabs, usePageTab } from "@/components/common/page-tabs";
import { ModuleGate } from "@/components/common/module-gate";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { voiceBotAccess } from "@/lib/voice-bot-access-level";
import { BotsPanel } from "@/components/voice-bots/bots-panel";
import { NumbersPanel } from "@/components/voice-bots/numbers-panel";
import { HolidaysPanel } from "@/components/voice-bots/holidays-panel";
import { ProvidersPanel } from "@/components/voice-bots/providers-panel";
import { CreateBotDialog } from "@/components/voice-bots/create-bot-dialog";
import { DashboardPanel } from "@/components/voice-bots/dashboard-panel";

const TABS = [
    { value: "overview", label: "Overview" },
    { value: "bots", label: "Bots" },
    { value: "numbers", label: "Numbers" },
    { value: "holidays", label: "Holidays" },
    { value: "providers", label: "Providers" },
] as const;
type Tab = (typeof TABS)[number]["value"];

// Voice bots (voice bot plan §4.3, wave B): the bots, which Plivo numbers they answer, days they
// don't call, and the AI and voice providers. For people with the Manage level (decision 18).
function VoiceBotsPage() {
    const { user } = useAuth();
    const [tab, setTab] = usePageTab<Tab>(TABS, "overview");
    const [createOpen, setCreateOpen] = useState(false);
    if (voiceBotAccess(user as any) !== "manage") {
        return (
            <>
                <PageHeader title="Voice bots" />
                <EmptyState title="You can't manage voice bots" description="Building voice bots needs the Manage level for Voice bots on your role. Ask a workspace admin." />
            </>
        );
    }
    return (
        <div className="min-w-0">
            <PageHeader
                title="Voice bots"
                description="AI voice bots that call leads who enquired and answer calls, in Hindi and English."
                primaryAction={tab === "bots" ? <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" />Create bot</Button> : undefined}
            />
            <PageTabs tabs={TABS} value={tab} onChange={setTab} label="Voice bot sections" className="mb-4" />
            <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
                {tab === "overview" ? <DashboardPanel /> : null}
                {tab === "bots" ? <BotsPanel onCreate={() => setCreateOpen(true)} /> : null}
                {tab === "numbers" ? <NumbersPanel /> : null}
                {tab === "holidays" ? <HolidaysPanel /> : null}
                {tab === "providers" ? <ProvidersPanel /> : null}
            </div>
            <CreateBotDialog open={createOpen} onClose={() => setCreateOpen(false)} />
        </div>
    );
}

export default function VoiceBotsRoute() {
    return (
        <ModuleGate moduleKey="TELEPHONY" name="Telephony">
            <ModuleGate moduleKey="VOICE_BOT" name="Voice bots">
                <VoiceBotsPage />
            </ModuleGate>
        </ModuleGate>
    );
}
