import { createHmac, timingSafeEqual } from "crypto";

// The voice bot service (voice bot plan §2, §7; wave C): a separate container that holds the
// conversation. The CRM and the service trust each other through one shared secret,
// VOICE_BOT_SERVICE_SECRET. Every request either way carries an HMAC of the timestamp, method,
// path and body; anything older than a minute is refused, so a captured request can't be
// replayed later. Caddy also keeps /api/internal/ off the public internet.

export const SIGNATURE_HEADER = "x-voice-bot-signature";
const MAX_SKEW_SECONDS = 60;

export function voiceBotServiceConfig() {
    const url = (process.env.VOICE_BOT_SERVICE_URL ?? "").trim().replace(/\/$/, "");
    const secret = (process.env.VOICE_BOT_SERVICE_SECRET ?? "").trim();
    return { url, secret, configured: !!url && secret.length >= 32 };
}

// Where browsers and Plivo reach the service: VOICE_BOT_PUBLIC_URL when set (local development),
// otherwise the CRM's own origin, where Caddy forwards /voice-bot/ to the service.
export function voiceBotPublicUrl() {
    const explicit = (process.env.VOICE_BOT_PUBLIC_URL ?? "").trim().replace(/\/$/, "");
    if (explicit) return explicit;
    const app = new URL(process.env.APP_URL || "http://localhost:3000");
    return `${app.protocol === "https:" ? "wss" : "ws"}://${app.host}/voice-bot`;
}

export function signVoiceBotRequest(secret: string, method: string, path: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
    const digest = createHmac("sha256", secret).update(`${timestamp}.${method.toUpperCase()}.${path}.${body}`).digest("hex");
    return `t=${timestamp},v1=${digest}`;
}

// True when `header` is a fresh, valid signature of this request.
export function verifyVoiceBotSignature(secret: string, header: string | null, method: string, path: string, body: string, now = Math.floor(Date.now() / 1000)) {
    if (!secret || !header) return false;
    const parts = Object.fromEntries(header.split(",").map((part) => part.trim().split("=", 2) as [string, string]));
    const timestamp = Number(parts.t);
    if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > MAX_SKEW_SECONDS || !/^[0-9a-f]{64}$/.test(parts.v1 ?? "")) return false;
    const expected = signVoiceBotRequest(secret, method, path, body, timestamp).split("v1=")[1];
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(parts.v1, "hex"));
}

let healthCache: { at: number; ok: boolean } | null = null;

// Whether the service answers its health check (cached for 30 seconds).
export async function voiceBotServiceHealthy() {
    const { url, configured } = voiceBotServiceConfig();
    if (!configured) return false;
    if (healthCache && Date.now() - healthCache.at < 30_000) return healthCache.ok;
    let ok = false;
    try {
        const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) });
        ok = response.ok;
    } catch {
        ok = false;
    }
    healthCache = { at: Date.now(), ok };
    return ok;
}

export function resetVoiceBotHealthCache() {
    healthCache = null;
}

// A signed call from the CRM to the bot service's internal API (wave D: knowledge). Throws
// VOICE_BOT_SERVICE_NOT_SET_UP, VOICE_BOT_SERVICE_DOWN, or the service's own message.
export async function callVoiceBotService<T>(path: string, payload: Record<string, unknown>, timeoutMs = 60_000): Promise<T> {
    const { url, secret, configured } = voiceBotServiceConfig();
    if (!configured) throw new Error("VOICE_BOT_SERVICE_NOT_SET_UP");
    const body = JSON.stringify(payload);
    let response: Response;
    try {
        response = await fetch(`${url}${path}`, {
            method: "POST",
            headers: { "content-type": "application/json", [SIGNATURE_HEADER]: signVoiceBotRequest(secret, "POST", path, body) },
            body,
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch {
        throw new Error("VOICE_BOT_SERVICE_DOWN");
    }
    const result = await response.json().catch(() => null);
    if (!response.ok) {
        const error = new Error(response.status === 404 ? "VOICE_BOT_SERVICE_REFUSED" : "VOICE_BOT_SERVICE_FAILED");
        (error as any).detail = typeof result?.message === "string" ? result.message : null;
        throw error;
    }
    return result as T;
}
