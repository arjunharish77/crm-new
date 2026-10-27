import { assertTenantModule } from "@/lib/server/module-entitlements";
import { VOICE_BOT_ACCESS_RANK, voiceBotAccess, type VoiceBotAccess } from "@/lib/voice-bot-access-level";

export { canBulkCallWithVoiceBots, voiceBotAccess, type VoiceBotAccess } from "@/lib/voice-bot-access-level";

// Throws MODULE_DISABLED:VOICE_BOT when the module is off, FORBIDDEN when the user's level is too low.
export async function requireVoiceBotAccess(user: Parameters<typeof voiceBotAccess>[0] & { id: string; tenantId: string | null }, need: Exclude<VoiceBotAccess, "none">) {
    await assertTenantModule(user as any, "VOICE_BOT");
    if (VOICE_BOT_ACCESS_RANK[voiceBotAccess(user)] < VOICE_BOT_ACCESS_RANK[need]) throw new Error("FORBIDDEN");
}
