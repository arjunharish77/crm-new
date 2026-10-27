"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A browser test call with a voice bot (voice bot plan wave C): the microphone goes to the bot
// service as 16 kHz PCM over a WebSocket; the bot's voice comes back as PCM and plays in order;
// JSON messages carry the transcript, reply times and events. {"type":"clear"} (the caller
// interrupted) drops the bot audio still queued.

export type TestCallLine = { role: "bot" | "caller"; text: string; language: "hi" | "en" | null; at: number; interrupted?: boolean };
export type TestCallEvent = { event: string; detail: Record<string, any>; at: number };
export type TestCallTurn = { replyMs: number; ai: string | null; language: string | null };
export type TestCallState = "idle" | "connecting" | "live" | "ended" | "failed";

export function useTestCall() {
    const [state, setState] = useState<TestCallState>("idle");
    const [lines, setLines] = useState<TestCallLine[]>([]);
    const [events, setEvents] = useState<TestCallEvent[]>([]);
    const [turns, setTurns] = useState<TestCallTurn[]>([]);
    const [botSpeaking, setBotSpeaking] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const resources = useRef<{ socket?: WebSocket; context?: AudioContext; stream?: MediaStream; node?: AudioWorkletNode; sources: Set<AudioBufferSourceNode>; nextTime: number; speakingTimer?: ReturnType<typeof setTimeout> }>({ sources: new Set(), nextTime: 0 });

    const stopAudio = useCallback(() => {
        for (const source of resources.current.sources) {
            try { source.stop(); } catch { /* already stopped */ }
        }
        resources.current.sources.clear();
        resources.current.nextTime = 0;
        setBotSpeaking(false);
    }, []);

    const teardown = useCallback(() => {
        const current = resources.current;
        stopAudio();
        current.node?.port.close();
        current.node?.disconnect();
        current.stream?.getTracks().forEach((track) => track.stop());
        if (current.socket && current.socket.readyState <= WebSocket.OPEN) current.socket.close(1000, "done");
        current.context?.close().catch(() => undefined);
        resources.current = { sources: new Set(), nextTime: 0 };
    }, [stopAudio]);

    useEffect(() => teardown, [teardown]);

    const play = useCallback((data: ArrayBuffer, sampleRate: number) => {
        const context = resources.current.context;
        if (!context || data.byteLength < 2) return;
        const samples = new Int16Array(data, 0, Math.floor(data.byteLength / 2));
        const buffer = context.createBuffer(1, samples.length, sampleRate);
        const channel = buffer.getChannelData(0);
        for (let index = 0; index < samples.length; index++) channel[index] = samples[index] / 0x8000;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        const startAt = Math.max(resources.current.nextTime, context.currentTime + 0.03);
        source.start(startAt);
        resources.current.nextTime = startAt + buffer.duration;
        resources.current.sources.add(source);
        source.onended = () => resources.current.sources.delete(source);
        setBotSpeaking(true);
        clearTimeout(resources.current.speakingTimer);
        resources.current.speakingTimer = setTimeout(() => setBotSpeaking(false), Math.max(0, (resources.current.nextTime - context.currentTime) * 1000) + 150);
    }, []);

    const start = useCallback(async (url: string, sampleRate: number) => {
        teardown();
        setLines([]); setEvents([]); setTurns([]); setProblem(null);
        setState("connecting");
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
        } catch (error) {
            setProblem(error instanceof DOMException && error.name === "NotAllowedError"
                ? "The browser blocked the microphone. Allow it for this site in the browser's site settings, then try again."
                : "No microphone was found. Connect one, then try again.");
            setState("failed");
            return;
        }
        const context = new AudioContext();
        await context.resume().catch(() => undefined);
        await context.audioWorklet.addModule("/voice-bot-mic-worklet.js");
        const node = new AudioWorkletNode(context, "voice-bot-mic-capture");
        context.createMediaStreamSource(stream).connect(node);
        const socket = new WebSocket(url);
        socket.binaryType = "arraybuffer";
        resources.current = { socket, context, stream, node, sources: new Set(), nextTime: 0 };

        node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
            if (socket.readyState === WebSocket.OPEN) socket.send(event.data);
        };
        socket.onopen = () => setState("live");
        socket.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                play(event.data, sampleRate);
                return;
            }
            let message: any;
            try { message = JSON.parse(String(event.data)); } catch { return; }
            if (message.type === "clear") stopAudio();
            else if (message.type === "transcript") setLines((current) => [...current, message as TestCallLine]);
            else if (message.type === "turn") setTurns((current) => [...current, message as TestCallTurn]);
            else if (message.type === "event") setEvents((current) => [...current, { event: message.event, detail: message.detail ?? {}, at: message.at }]);
            else if (message.type === "error") setProblem(String(message.message ?? "The test call couldn't start."));
        };
        socket.onerror = () => setProblem((current) => current ?? "The connection to the voice bot service failed.");
        socket.onclose = () => {
            // Let the bot finish what it was saying before releasing the speakers.
            const remaining = Math.max(0, (resources.current.nextTime - (resources.current.context?.currentTime ?? 0)) * 1000);
            setTimeout(() => {
                teardown();
                setState((current) => (current === "live" || current === "connecting" ? "ended" : current));
            }, Math.min(remaining, 8000));
        };
    }, [play, stopAudio, teardown]);

    const hangUp = useCallback(() => {
        const socket = resources.current.socket;
        if (socket && socket.readyState <= WebSocket.OPEN) socket.close(1000, "hung up");
        stopAudio();
    }, [stopAudio]);

    const reset = useCallback(() => {
        teardown();
        setState("idle");
        setLines([]); setEvents([]); setTurns([]); setProblem(null);
    }, [teardown]);

    return { state, lines, events, turns, botSpeaking, problem, start, hangUp, reset };
}
