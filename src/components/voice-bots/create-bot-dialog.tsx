"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { StandardDialog } from "@/components/common/standard-dialog";
import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ProviderSettings } from "./types";

// Create a bot: a name and what it's for. With a Claude key, Claude drafts the conversation and
// fields from the description (decision 30); the bot opens as a draft either way.
export function CreateBotDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const router = useRouter();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [useClaude, setUseClaude] = useState(true);
    const [claudeReady, setClaudeReady] = useState<boolean | null>(null);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<{ name?: string; description?: string }>({});

    useEffect(() => {
        if (!open) return;
        setName(""); setDescription(""); setErrors({}); setUseClaude(true);
        apiFetch<ProviderSettings>("/voice-bots/providers")
            .then((settings) => setClaudeReady(settings.claude.configured && settings.claude.spentThisMonthUsd < settings.claude.monthlyCapUsd))
            .catch(() => setClaudeReady(false));
    }, [open]);

    const drafting = useClaude && !!claudeReady && description.trim().length >= 10;
    const submit = async () => {
        const next: typeof errors = {};
        if (name.trim().length < 2) next.name = "Give the bot a name of at least 2 characters.";
        if (useClaude && claudeReady && description.trim().length > 0 && description.trim().length < 10) next.description = "Describe the bot in at least 10 characters for Claude to draft it.";
        setErrors(next);
        if (Object.keys(next).length) return;
        setSaving(true);
        try {
            const bot = await apiFetch<{ id: string }>("/voice-bots", {
                method: "POST",
                body: JSON.stringify({ name: name.trim(), description: description.trim(), draftWithClaude: drafting }),
            });
            toast.success(drafting ? "Bot created and drafted by Claude. Review it before going live." : "Bot created");
            onClose();
            router.push(`/dashboard/voice-bots/${bot.id}`);
        } catch (error: any) {
            if (error?.status === 409) setErrors({ name: error.message });
            else toast.error(error?.message || "The bot couldn't be created");
        } finally {
            setSaving(false);
        }
    };

    return (
        <StandardDialog
            open={open}
            onClose={saving ? () => undefined : onClose}
            title="Create voice bot"
            subtitle="It starts as a draft. Nothing calls anyone until you make it live."
            maxWidth="sm"
            actions={
                <>
                    <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button onClick={submit} isLoading={saving} disabled={saving}>{saving && drafting ? "Drafting with Claude…" : drafting ? "Create and draft" : "Create bot"}</Button>
                </>
            }
        >
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
                <FormField id="voice-bot-name" label="Name" required error={errors.name} help="Also the name of its calls on lead timelines, e.g. Voice bot: Admission follow-up.">
                    <Input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Admission follow-up" autoFocus />
                </FormField>
                <FormField id="voice-bot-description" label="What should this bot do?" error={errors.description} help="Who it calls, what it finds out, and when it hands over to a counsellor.">
                    <Textarea rows={4} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Call leads who enquired about MBA programmes in the last week, find out their preferred intake and budget, answer fee questions, and transfer interested callers to a counsellor." />
                </FormField>
                <div className="flex items-start gap-2">
                    <Checkbox id="voice-bot-claude" checked={useClaude && !!claudeReady} disabled={!claudeReady} onCheckedChange={(checked) => setUseClaude(checked === true)} className="mt-0.5" />
                    <div className="space-y-0.5">
                        <Label htmlFor="voice-bot-claude" className="flex items-center gap-1.5"><Sparkles className="size-3.5 text-muted-foreground" aria-hidden />Draft the conversation and fields with Claude</Label>
                        <p className="text-xs text-muted-foreground">
                            {claudeReady === false ? "Add a Claude key in the Providers tab to use this." : "Uses Claude Sonnet 5.5, about $0.02. You review everything before it goes live."}
                        </p>
                    </div>
                </div>
            </form>
        </StandardDialog>
    );
}
