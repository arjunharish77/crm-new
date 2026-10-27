import type { VoiceBotConfig, VoiceBotStatus } from "@/lib/voice-bot-config";
import type { StatusTone } from "@/lib/display/status";

export type VoiceBotSummary = {
    id: string;
    name: string;
    status: VoiceBotStatus;
    config: VoiceBotConfig;
    updatedAt: string;
    archivedAt: string | null;
    numberCount: number;
};

export type VoiceBotField = {
    id: string; key: string; label: string; type: string; options: string[];
    question: string; mustAsk: boolean; confirm: boolean;
};

export type VoiceBotDetail = VoiceBotSummary & {
    activityTypeId: string | null;
    fields: VoiceBotField[];
    readiness: Array<{ tab: string; message: string }>;
    placeholderWarnings: string[];
};

export type ProviderSettings = {
    groq: { configured: boolean; keyHint: string | null };
    claude: { configured: boolean; keyHint: string | null; monthlyCapUsd: number; spentThisMonthUsd: number; month: string; alertLevels: number[] };
    google: { configured: boolean; keyHint: string | null };
    azure: { configured: boolean; keyHint: string | null; region: string };
    updatedAt: string | null;
};

export type FieldCatalog = {
    callerDetails: Array<{ key: string; label: string; group: string }>;
    mappingTargets: Array<{ key: string; label: string; group: string }>;
};

export const BOT_STATUS: Record<VoiceBotStatus, { label: string; tone: StatusTone }> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    LIVE: { label: "Live", tone: "success" },
    PAUSED: { label: "Paused", tone: "warning" },
};

export const FIELD_TYPE_OPTIONS = [
    { value: "TEXT", label: "Text" },
    { value: "TEXTAREA", label: "Long text" },
    { value: "NUMBER", label: "Number" },
    { value: "DROPDOWN", label: "One of a list" },
    { value: "MULTI_SELECT", label: "Several from a list" },
    { value: "BOOLEAN", label: "Yes / no" },
    { value: "DATE", label: "Date" },
] as const;

export function fieldTypeLabel(type: string) {
    return FIELD_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? "Text";
}
