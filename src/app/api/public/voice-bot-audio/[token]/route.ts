import { signedLineAudio } from "@/lib/server/voice-bot-calls";

// A bot's recorded line for Plivo to play (e.g. "nobody is free" after a hand-over nobody
// answered), in the bot's own voice. The address is signed and lasts 15 minutes.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
    const audio = await signedLineAudio((await params).token);
    if (!audio) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=900" } });
}
