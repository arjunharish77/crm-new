import { Mail, MessageSquareText, Send } from "lucide-react";

// Shared by the Marketing page and the campaign composer page.
export type Channel = "EMAIL" | "WHATSAPP" | "SMS";
export type AudienceType = "LEAD_LIST" | "SAVED_VIEW" | "MANUAL";

export type Campaign = {
    id: string;
    name: string;
    description?: string | null;
    channel: Channel;
    campaignType: "BROADCAST" | "DRIP";
    status: string;
    audienceType: AudienceType;
    audienceConfig: Record<string, any>;
    subject?: string | null;
    body: string;
    templateId?: string | null;
    providerConfigId?: string | null;
    senderIdentityId?: string | null;
    throttlePerMinute?: number;
    quietHours?: Record<string, any>;
    updatedAt?: string;
    stats?: Record<string, number>;
};

export const CHANNELS: { value: Channel; label: string; icon: typeof Mail }[] = [
    { value: "EMAIL", label: "Email", icon: Mail },
    { value: "WHATSAPP", label: "WhatsApp", icon: MessageSquareText },
    { value: "SMS", label: "SMS", icon: Send },
];

export const emptyCampaign = {
    name: "",
    description: "",
    channel: "EMAIL" as Channel,
    campaignType: "BROADCAST" as const,
    audienceType: "LEAD_LIST" as AudienceType,
    audienceConfig: {},
    subject: "",
    body: "Hi {{name}},\n\nHere is an update from our admissions team.",
    throttlePerMinute: 60,
    quietHours: { enabled: true, start: "21:00", end: "09:00" },
};

export function statusClassName(status: string) {
    if (status === "COMPLETED" || status === "APPROVED" || status === "SENT") return "border-status-success bg-status-success text-status-success-foreground";
    if (status === "RUNNING" || status === "SCHEDULED" || status === "QUEUED") return "border-status-info bg-status-info text-status-info-foreground";
    if (status === "PAUSED" || status === "PENDING_APPROVAL") return "border-status-warning bg-status-warning text-status-warning-foreground";
    if (status === "CANCELLED" || status === "FAILED") return "border-destructive/20 bg-destructive/10 text-destructive";
    return "";
}
