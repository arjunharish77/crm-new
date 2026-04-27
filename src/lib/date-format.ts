"use client";

type GeneralDisplaySettings = {
    timezone: string;
    dateFormat: string;
    language: string;
};

const STORAGE_KEY = "unnatify.generalSettings";

const DEFAULT_SETTINGS: GeneralDisplaySettings = {
    timezone: "UTC",
    dateFormat: "dd/MM/yyyy",
    language: "en",
};

export function saveDisplaySettings(settings: Partial<GeneralDisplaySettings>) {
    if (typeof window === "undefined") return;
    const next = { ...getDisplaySettings(), ...settings };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("unnatify:display-settings", { detail: next }));
}

export function getDisplaySettings(): GeneralDisplaySettings {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
        return {
            timezone: typeof parsed.timezone === "string" ? parsed.timezone : DEFAULT_SETTINGS.timezone,
            dateFormat: typeof parsed.dateFormat === "string" ? parsed.dateFormat : DEFAULT_SETTINGS.dateFormat,
            language: typeof parsed.language === "string" ? parsed.language : DEFAULT_SETTINGS.language,
        };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

function parseDate(value: string | number | Date | null | undefined) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function dateOrder(format: string): Array<"day" | "month" | "year"> {
    if (format.startsWith("yyyy")) return ["year", "month", "day"];
    if (format.startsWith("dd")) return ["day", "month", "year"];
    return ["month", "day", "year"];
}

function dateSeparator(format: string) {
    return format.includes("-") ? "-" : "/";
}

export function formatWorkspaceDate(value: string | number | Date | null | undefined) {
    const date = parseDate(value);
    if (!date) return "-";
    const { timezone, dateFormat, language } = getDisplaySettings();
    const parts = new Intl.DateTimeFormat(language || "en", {
        timeZone: timezone || "UTC",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return dateOrder(dateFormat).map((part) => values[part]).join(dateSeparator(dateFormat));
}

export function formatWorkspaceDateTime(value: string | number | Date | null | undefined, options?: { seconds?: boolean }) {
    const date = parseDate(value);
    if (!date) return "-";
    const { timezone, language } = getDisplaySettings();
    return new Intl.DateTimeFormat(language || "en", {
        timeZone: timezone || "UTC",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: options?.seconds ? "2-digit" : undefined,
        hour12: true,
    }).format(date);
}

export function formatWorkspaceTime(value: string | number | Date | null | undefined, options?: { seconds?: boolean }) {
    const date = parseDate(value);
    if (!date) return "-";
    const { timezone, language } = getDisplaySettings();
    return new Intl.DateTimeFormat(language || "en", {
        timeZone: timezone || "UTC",
        hour: "numeric",
        minute: "2-digit",
        second: options?.seconds ? "2-digit" : undefined,
        hour12: false,
    }).format(date);
}
