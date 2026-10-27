import { effectiveModuleLevels } from "@/lib/module-access";

// Who can do what with voice bots (decision 18), shared by the server and the screens: a role's
// "Voice bots" level is none, view (read), use (write) or manage (full). Unlike most modules,
// "not set" means use: building bots, numbers and provider keys needs Manage or a workspace admin.
export type VoiceBotAccess = "none" | "view" | "use" | "manage";

type UserLike = Parameters<typeof effectiveModuleLevels>[0];

export function voiceBotAccess(user: UserLike): VoiceBotAccess {
    if (!user) return "none";
    if (user.isTenantAdmin || user.isPlatformAdmin) return "manage";
    const level = effectiveModuleLevels(user).voiceBots;
    if (level === "full") return "manage";
    if (level === "none") return "none";
    if (level === "read") return "view";
    return "use";
}

// Bulk bot calls also need the role's "bulk calls" switch (admins always may).
export function canBulkCallWithVoiceBots(user: UserLike) {
    if (!user) return false;
    if (user.isTenantAdmin || user.isPlatformAdmin) return true;
    const access = voiceBotAccess(user);
    if (access !== "use" && access !== "manage") return false;
    const role = user.role && typeof user.role === "object" ? user.role : null;
    const templates = Array.isArray(user.permissionTemplates) ? user.permissionTemplates : [];
    return role?.permissions?.voiceBotBulkCalls === true || templates.some((template) => template?.permissions?.voiceBotBulkCalls === true);
}

export const VOICE_BOT_ACCESS_RANK: Record<VoiceBotAccess, number> = { none: 0, view: 1, use: 2, manage: 3 };
