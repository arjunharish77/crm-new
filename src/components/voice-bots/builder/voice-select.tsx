"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Voice = { name: string; label: string; gender: string | null };

const SAMPLES = {
    hi: "नमस्ते! मैं आपकी एडमिशन से जुड़ी जानकारी में मदद के लिए कॉल कर रही हूँ।",
    en: "Hello! I'm calling to help you with your admission enquiry.",
} as const;

// The voice for one language: provider, voice and "Play sample" (decision 7: Google Chirp 3 HD,
// Azure as the backup). Voices are read from the provider, so only ones that exist are offered.
export function VoiceSelect({ language, value, onChange, providers }: {
    language: "hi" | "en";
    value: { provider: "google" | "azure"; voice: string };
    onChange: (value: { provider: "google" | "azure"; voice: string }) => void;
    providers: { google: boolean; azure: boolean };
}) {
    const [voices, setVoices] = useState<Voice[] | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [loadingSample, setLoadingSample] = useState(false);
    const audio = useRef<HTMLAudioElement | null>(null);
    const configured = providers[value.provider];
    const languageLabel = language === "hi" ? "Hindi" : "English";

    useEffect(() => {
        setVoices(null);
        setLoadFailed(false);
        if (!configured) return;
        let active = true;
        apiFetch<Voice[]>(`/voice-bots/providers/voices?provider=${value.provider}&language=${language}`)
            .then((rows) => { if (active) setVoices(Array.isArray(rows) ? rows : []); })
            .catch(() => { if (active) setLoadFailed(true); });
        return () => { active = false; };
    }, [configured, value.provider, language]);

    useEffect(() => () => { audio.current?.pause(); }, []);

    const play = async () => {
        if (playing) { audio.current?.pause(); setPlaying(false); return; }
        setLoadingSample(true);
        try {
            const response = await fetch("/api/voice-bots/providers/sample", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider: value.provider, voice: value.voice, language, text: SAMPLES[language] }),
            });
            if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || "The sample couldn't be played");
            const url = URL.createObjectURL(await response.blob());
            audio.current?.pause();
            audio.current = new Audio(url);
            audio.current.onended = () => { setPlaying(false); URL.revokeObjectURL(url); };
            await audio.current.play();
            setPlaying(true);
        } catch (error: any) {
            toast.error(error?.message || "The sample couldn't be played");
        } finally {
            setLoadingSample(false);
        }
    };

    return (
        <fieldset className="min-w-0 space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">{languageLabel} voice</legend>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] sm:items-end">
                <div className="space-y-1.5">
                    <Label htmlFor={`voice-${language}-provider`}>Provider</Label>
                    <Select value={value.provider} onValueChange={(provider) => onChange({ provider: provider as "google" | "azure", voice: "" })}>
                        <SelectTrigger id={`voice-${language}-provider`} className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="google">Google</SelectItem>
                            <SelectItem value="azure">Azure</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="min-w-0 space-y-1.5">
                    <Label htmlFor={`voice-${language}-voice`}>Voice</Label>
                    <Select value={value.voice || undefined} onValueChange={(voice) => onChange({ ...value, voice })} disabled={!configured || !voices?.length}>
                        <SelectTrigger id={`voice-${language}-voice`} className="w-full">
                            <SelectValue placeholder={!configured ? "Add the key in Providers" : loadFailed ? "Voices couldn't be loaded" : voices === null ? "Loading voices…" : voices.length ? "Choose a voice" : "No Indian voices found"} />
                        </SelectTrigger>
                        <SelectContent>
                            {(voices ?? []).map((voice) => (
                                <SelectItem key={voice.name} value={voice.name}>
                                    {voice.label}{voice.gender ? <span className="text-muted-foreground"> · {voice.gender}</span> : null}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <Button type="button" variant="outline" onClick={play} disabled={!value.voice || loadingSample} isLoading={loadingSample} aria-label={playing ? `Stop the ${languageLabel} sample` : `Play a ${languageLabel} sample`}>
                    {playing ? <Square className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                    {playing ? "Stop" : "Play sample"}
                </Button>
            </div>
        </fieldset>
    );
}
