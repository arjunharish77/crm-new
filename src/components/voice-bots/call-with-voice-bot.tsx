"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AudioLines } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { useModuleEnabled } from "@/components/auth/feature-gate";
import { canBulkCallWithVoiceBots, voiceBotAccess } from "@/lib/voice-bot-access-level";
import { WEEKDAYS, type VoiceBotConfig } from "@/lib/voice-bot-config";
import { plural } from "@/lib/bulk-selection";
import { StandardDialog } from "@/components/common/standard-dialog";
import { SelectField } from "@/components/voice-bots/builder/select-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

// "Call with voice bot" (voice bot plan wave F): from a lead or opportunity, or a selection of
// them (up to 5,000). The bot calls within its calling hours and daily limit; records it can't
// call (no phone, asked for no bot calls, already waiting) are listed with the reason.

export type VoiceBotTarget = { leadId?: string | null; opportunityId?: string | null };
type CallableBot = { id: string; name: string; description: string; calling: VoiceBotConfig["calling"]; dailyLimit: number; retries: number };
type QueueResult = { queued: number; blocked: Array<{ reason: string }>; callIds: string[] };

const BATCH = 500;

// Whether this person may start bot calls here: the module (and the phone system it needs) is on,
// and their role's Voice bots level is Use or Manage. Several at once also needs the bulk switch.
export function useVoiceBotCalling() {
    const { user } = useAuth();
    const voiceBotsOn = useModuleEnabled("VOICE_BOT");
    const telephonyOn = useModuleEnabled("TELEPHONY");
    const enabled = voiceBotsOn && telephonyOn;
    const access = voiceBotAccess(user as any);
    const canCall = enabled && (access === "use" || access === "manage");
    return { canCall, canBulkCall: canCall && canBulkCallWithVoiceBots(user as any), canManage: enabled && access === "manage" };
}

export function callingHoursText(bot: Pick<CallableBot, "calling" | "dailyLimit" | "retries">) {
    const days = WEEKDAYS.filter((day) => bot.calling.days.includes(day.value)).map((day) => day.label);
    const everyDay = days.length === 7;
    return `${everyDay ? "Every day" : days.join(", ")}, ${bot.calling.start}–${bot.calling.end} · up to ${bot.dailyLimit} calls a day · ${plural(bot.retries, "attempt", "attempts")}`;
}

export function CallWithVoiceBotDialog({ open, onClose, count, noun, recordName, resolveTargets, onQueued }: {
    open: boolean;
    onClose: () => void;
    count: number;
    noun: [string, string];
    // For one record: its name, for the messages.
    recordName?: string | null;
    resolveTargets: () => Promise<VoiceBotTarget[]>;
    onQueued?: () => void;
}) {
    const { canManage } = useVoiceBotCalling();
    const [bots, setBots] = useState<CallableBot[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [botId, setBotId] = useState<string>("");
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

    useEffect(() => {
        if (!open) return;
        setBots(null);
        setLoadError(null);
        setProgress(null);
        let stop = false;
        apiFetch<{ bots: CallableBot[] }>("/voice-bots/callable")
            .then((result) => {
                if (stop) return;
                setBots(result.bots);
                setBotId((current) => (result.bots.some((bot) => bot.id === current) ? current : result.bots[0]?.id ?? ""));
            })
            .catch((error: any) => { if (!stop) setLoadError(error?.message || "The bots couldn't be loaded."); });
        return () => { stop = true; };
    }, [open]);

    const bot = bots?.find((item) => item.id === botId) ?? null;
    const busy = progress !== null;
    const days = bot && count > bot.dailyLimit ? Math.ceil(count / bot.dailyLimit) : 0;

    const start = async () => {
        if (!bot) return;
        let targets: VoiceBotTarget[];
        setProgress({ done: 0, total: count });
        try {
            targets = await resolveTargets();
        } catch (error: any) {
            setProgress(null);
            toast.error(error?.message || `Couldn't work out which ${noun[1]} are selected`);
            return;
        }
        if (!targets.length) {
            setProgress(null);
            return;
        }
        const total: QueueResult = { queued: 0, blocked: [], callIds: [] };
        setProgress({ done: 0, total: targets.length });
        try {
            for (let offset = 0; offset < targets.length; offset += BATCH) {
                const result = await apiFetch<QueueResult>(`/voice-bots/${bot.id}/calls`, { method: "POST", body: JSON.stringify({ targets: targets.slice(offset, offset + BATCH) }) });
                total.queued += result.queued;
                total.blocked.push(...result.blocked);
                setProgress({ done: Math.min(targets.length, offset + BATCH), total: targets.length });
            }
        } catch (error: any) {
            setProgress(null);
            const partly = total.queued ? ` ${plural(total.queued, "call was", "calls were")} queued before this.` : "";
            toast.error(`${error?.message || "The calls couldn't be queued."}${partly}`);
            if (total.queued) onQueued?.();
            return;
        }
        setProgress(null);
        report(bot.name, targets.length, total, recordName ?? null, noun);
        if (total.queued) onQueued?.();
        onClose();
    };

    const subject = recordName ? recordName : plural(count, noun[0], noun[1]);
    return (
        <StandardDialog
            open={open}
            onClose={busy ? () => undefined : onClose}
            title="Call with voice bot"
            subtitle={`The bot calls ${subject} within its calling hours. You'll find the summary and answers on the ${count === 1 ? noun[0] : noun[1]}'s timeline afterwards.`}
            icon={<AudioLines className="size-5" />}
            maxWidth="sm"
            actions={<>
                <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
                <Button onClick={start} isLoading={busy} disabled={busy || !bot}>
                    {busy && progress && progress.total > BATCH ? `Queuing ${progress.done.toLocaleString()} of ${progress.total.toLocaleString()}…` : count === 1 ? "Start the call" : `Start ${plural(count, "call", "calls")}`}
                </Button>
            </>}
        >
            {loadError ? (
                <p className="text-sm text-destructive" role="alert">{loadError}</p>
            ) : !bots ? (
                <div className="space-y-2" role="status" aria-label="Loading bots"><Skeleton className="h-4 w-24" /><Skeleton className="h-9 w-full" /></div>
            ) : !bots.length ? (
                <div className="space-y-2 text-sm">
                    <p>No voice bot is live yet.</p>
                    <p className="text-muted-foreground">
                        {canManage ? <>Build one and make it live in <Link href="/dashboard/voice-bots" className="text-primary hover:underline">Voice bots</Link>.</> : "Ask whoever manages voice bots in your workspace to make one live."}
                    </p>
                </div>
            ) : (
                <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); start(); }}>
                    <SelectField id="voice-bot-call-bot" label="Bot" required value={botId} onValueChange={setBotId} disabled={busy}
                        help={bot ? <>{bot.description ? <span className="block">{bot.description}</span> : null}<span className="block">{callingHoursText(bot)}</span></> : undefined}>
                        {bots.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                    </SelectField>
                    {days > 1 ? (
                        <Alert variant="info"><AlertDescription>
                            At up to {bot!.dailyLimit} calls a day, calling {plural(count, noun[0], noun[1])} takes about {days} working days. Raise the bot&apos;s daily limit to go faster.
                        </AlertDescription></Alert>
                    ) : null}
                </form>
            )}
        </StandardDialog>
    );
}

function report(botName: string, requested: number, result: QueueResult, recordName: string | null, noun: [string, string]) {
    if (requested === 1) {
        if (result.queued) toast.success(`${botName} will call ${recordName ?? `the ${noun[0]}`} shortly`, { description: "Within the bot's calling hours." });
        else toast.error(`${botName} can't call ${recordName ?? `this ${noun[0]}`}`, { description: result.blocked[0]?.reason });
        return;
    }
    const reasons = new Map<string, number>();
    for (const item of result.blocked) reasons.set(item.reason, (reasons.get(item.reason) ?? 0) + 1);
    const message = `${plural(result.queued, "call", "calls")} queued for ${botName}${result.blocked.length ? `, ${result.blocked.length.toLocaleString()} skipped` : ""}`;
    if (!result.blocked.length) {
        toast.success(message, { description: "Within the bot's calling hours." });
        return;
    }
    const description = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([reason, number]) => `${number.toLocaleString()}: ${reason}`).join(" ");
    (result.queued ? toast.warning : toast.error)(message, { description, duration: 12000 });
}
