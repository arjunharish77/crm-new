import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { forbidden, notFound, serverError, unauthorized, userMessage } from "@/lib/server/http";
import { requireVoiceBotAccess, type VoiceBotAccess } from "@/lib/server/voice-bot-access";

// Shared by the /api/voice-bots routes: the signed-in user, the module and access check, and
// plain-language refusals (code USER_MESSAGE, shown as written by apiFetch).
const MESSAGES: Record<string, string> = {
    VOICE_BOT_NAME_INVALID: "Give the bot a name of 2 to 80 characters.",
    VOICE_BOT_NAME_TAKEN: "Another bot already has this name.",
    VOICE_BOT_CONFIG_INVALID: "Some settings aren't valid. Check the highlighted fields.",
    VOICE_BOT_STATUS_INVALID: "That status isn't recognised.",
    VOICE_BOT_NOT_READY: "The bot isn't ready to go live yet. Finish the items listed at the top of the page.",
    VOICE_BOT_FIELD_LABEL_INVALID: "Give the field a name of up to 80 characters.",
    VOICE_BOT_FIELD_TYPE_INVALID: "Choose a field type.",
    VOICE_BOT_FIELD_OPTIONS_REQUIRED: "A list field needs at least two choices.",
    VOICE_BOT_FIELD_LIMIT: "A bot can have up to 40 fields.",
    VOICE_BOT_RECORD_NOT_FOUND: "That lead or opportunity wasn't found, or you can't see it.",
    VOICE_BOT_NUMBER_INVALID: "That isn't a valid phone number.",
    VOICE_BOT_NUMBER_MODE_INVALID: "Choose who answers this number.",
    VOICE_BOT_NUMBER_BOT_REQUIRED: "Choose the bot that answers this number.",
    VOICE_BOT_HOLIDAY_INVALID: "Choose a valid date.",
    VOICE_BOT_DRAFT_DESCRIPTION_INVALID: "Describe the bot in 10 to 2,000 characters.",
    VOICE_PROVIDER_KEY_INVALID: "That key is too long to be valid.",
    VOICE_PROVIDER_REGION_INVALID: "Enter an Azure region such as centralindia.",
    VOICE_PROVIDER_CAP_INVALID: "Set a monthly Claude budget between $1 and $100,000.",
    VOICE_PROVIDER_NOT_CONFIGURED: "Add this provider's key in Providers first.",
    VOICE_PROVIDER_FAILED: "The provider didn't accept the request. Check its key in Providers.",
    VOICE_SAMPLE_INVALID: "Choose a voice and write some text to play.",
    VOICE_BOT_SERVICE_NOT_SET_UP: "The voice bot service isn't set up on the server yet. See VOICE_BOT_SETUP.md, section 7.",
    VOICE_BOT_SERVICE_DOWN: "The voice bot service isn't answering. Check that it's running on the server, then try again.",
    VOICE_BOT_TEST_NEEDS_GROQ: "Add a Groq key in Providers first: the bot needs it to hear you.",
    VOICE_BOT_TEST_NEEDS_OPENING: "Write the opening line first (Conversation tab).",
    VOICE_BOT_TEST_NEEDS_VOICES: "Choose a voice for each language first (Basics tab).",
    VOICE_BOT_TEST_NEEDS_VOICE_KEY: "Add the Google or Azure key for the bot's voice in Providers first.",
    VOICE_BOT_TEST_VOICE_FAILED: "The voice provider didn't accept the request. Test its key in Providers.",
    VOICE_BOT_KNOWLEDGE_NOT_FOUND: "That knowledge source wasn't found. It may have been removed.",
    VOICE_BOT_KNOWLEDGE_LIMIT: "A bot can have up to 200 knowledge sources. Remove some first.",
    VOICE_BOT_KNOWLEDGE_QA_INVALID: "Write a question of at least 3 characters and its answer.",
    VOICE_BOT_KNOWLEDGE_URL_INVALID: "Enter a web address such as https://example.com/admissions.",
    VOICE_BOT_KNOWLEDGE_URL_NOT_FOUND: "That website couldn't be found. Check the address.",
    VOICE_BOT_KNOWLEDGE_URL_UNSAFE: "That address can't be fetched: it isn't a public website.",
    VOICE_BOT_KNOWLEDGE_FILE_TYPE: "Upload a PDF, Word (.docx) or text file.",
    VOICE_BOT_KNOWLEDGE_FILE_SIZE: "The file must be under 10 MB.",
    VOICE_BOT_KNOWLEDGE_CATALOG_OFF: "The product catalogue isn't switched on for this workspace.",
    VOICE_BOT_KNOWLEDGE_QUESTION_INVALID: "Type a question to test.",
    VOICE_BOT_KNOWLEDGE_KIND_INVALID: "Choose what kind of knowledge to add.",
    VOICE_BOT_SERVICE_REFUSED: "The voice bot service refused the request. Check VOICE_BOT_SERVICE_SECRET on the server.",
    VOICE_BOT_SERVICE_FAILED: "The voice bot service couldn't do that. Try again.",
    VOICE_BOT_CALL_NO_TARGETS: "Choose who the bot should call.",
    VOICE_BOT_BULK_NOT_ALLOWED: "Your role can't start bot calls for several records at once.",
    VOICE_BOT_CALL_NOT_LIVE: "The bot isn't live. Make it live first (or use Call my phone to test it).",
    VOICE_BOT_CALL_PLIVO_OFF: "Turn on the Plivo connector in Settings › Phone system first.",
    VOICE_BOT_CALL_PHONE_INVALID: "Enter your phone number, or add one to your profile.",
    VOICE_BOT_CALL_TEST_RUNNING: "A test call to your phone is already on its way. Wait for it to finish.",
    VOICE_BOT_CALL_NOT_FOUND: "That call wasn't found.",
    VOICE_BOT_CALL_NOT_CANCELLABLE: "Only a call still waiting in the queue can be cancelled.",
    CLAUDE_NOT_CONFIGURED: "Add a Claude key in Voice bots › Providers first.",
    CLAUDE_CAP_REACHED: "This month's Claude budget is used up. Raise it in Providers or wait for next month.",
    CLAUDE_ACCOUNT_LIMIT: "Claude's spend limit in the Anthropic Console has been reached. Raise it there, or wait for next month.",
    CLAUDE_KEY_REFUSED: "Anthropic refused the Claude key. Check it in Providers.",
    CLAUDE_BUSY: "Claude is busy right now. Try again in a minute.",
    CLAUDE_FAILED: "Claude couldn't draft the bot. Try again, or write it yourself.",
};

export async function voiceBotRoute(request: Request, need: Exclude<VoiceBotAccess, "none">, handler: (user: any) => Promise<Response>) {
    try {
        const user = await requireCurrentUser(request);
        await requireVoiceBotAccess(user as any, need);
        return await handler(user);
    } catch (error) {
        const code = error instanceof Error ? error.message : "";
        if (code === "UNAUTHORIZED") return unauthorized();
        if (code === "FORBIDDEN") return forbidden(need === "manage" ? "Building voice bots needs the Manage level for Voice bots on your role." : "Your role doesn't allow this.");
        if (code === "VOICE_BOT_NOT_FOUND" || code === "VOICE_BOT_FIELD_NOT_FOUND") return notFound("Not found. It may have been archived.");
        if (code === "VOICE_BOT_KNOWLEDGE_NOT_FOUND" || code === "VOICE_BOT_CALL_NOT_FOUND") return notFound(MESSAGES[code]);
        if (code === "VOICE_BOT_CONFIG_INVALID" && (error as any).issues) return NextResponse.json({ code: "USER_MESSAGE", message: MESSAGES.VOICE_BOT_CONFIG_INVALID, issues: (error as any).issues }, { status: 400 });
        if (MESSAGES[code]) return userMessage(MESSAGES[code], code === "VOICE_BOT_NAME_TAKEN" ? 409 : 400);
        return serverError("The voice bot request failed", error);
    }
}

export async function readJson(request: Request) {
    const body = await request.json().catch(() => null);
    return body && typeof body === "object" ? body as Record<string, any> : {};
}

// The bot service's calls into the CRM (/api/internal/voice-bot). Anything without a fresh, valid
// signature gets the same 404 as an unknown path.
export async function voiceBotServiceRoute(request: Request, handler: (body: Record<string, any>) => Promise<Response>) {
    const { voiceBotServiceConfig, verifyVoiceBotSignature, SIGNATURE_HEADER } = await import("@/lib/server/voice-bot-service");
    const { secret, configured } = voiceBotServiceConfig();
    const raw = await request.text();
    const path = new URL(request.url).pathname;
    if (!configured || raw.length > 2_000_000 || !verifyVoiceBotSignature(secret, request.headers.get(SIGNATURE_HEADER), request.method, path, raw)) return notFound();
    let body: Record<string, any> = {};
    try {
        const parsed = raw ? JSON.parse(raw) : {};
        body = parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }
    try {
        return await handler(body);
    } catch (error) {
        if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ message: "Invalid report", issues: (error as any).issues?.slice(0, 5) }, { status: 400 });
        return serverError("The voice bot service request failed", error);
    }
}

