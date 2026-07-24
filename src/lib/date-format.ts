"use client";

import { formatDistanceToNow } from "date-fns";

type GeneralDisplaySettings = {
    timezone: string;
    dateFormat: string;
    language: string;
    currency: string;
};

const STORAGE_KEY = "unnatify.generalSettings";
export const DEFAULT_WORKSPACE_TIME_ZONE = "Asia/Kolkata";
const WORKSPACE_DATE_FORMAT = "dd/MM/yyyy";

const DEFAULT_SETTINGS: GeneralDisplaySettings = {
    timezone: DEFAULT_WORKSPACE_TIME_ZONE,
    dateFormat: WORKSPACE_DATE_FORMAT,
    language: "en",
    currency: "INR",
};

export function saveDisplaySettings(settings: Partial<GeneralDisplaySettings>) {
    if (typeof window === "undefined") return;
    const current = getDisplaySettings();
    const next = { ...current, ...settings, dateFormat: WORKSPACE_DATE_FORMAT };
    // Skip the write + event dispatch when nothing actually changed. Listeners (e.g.
    // GeneralSettingsProvider) remount the app tree on this event, and several callers
    // re-fetch and re-save these settings on every mount — without this guard, a
    // no-op save still fires the event, which remounts those same callers, which save
    // again, forever. See: exports page infinite-remount bug (ERR_INSUFFICIENT_RESOURCES).
    if (
        current.timezone === next.timezone &&
        current.dateFormat === next.dateFormat &&
        current.language === next.language &&
        current.currency === next.currency
    ) {
        return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("unnatify:display-settings", { detail: next }));
}

function normalizeTimeZone(value: unknown) {
    if (typeof value !== "string" || !value.trim()) return DEFAULT_SETTINGS.timezone;
    try {
        new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date());
        return value;
    } catch {
        return DEFAULT_SETTINGS.timezone;
    }
}

export function getDisplaySettings(): GeneralDisplaySettings {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
        return {
            timezone: normalizeTimeZone(parsed.timezone),
            dateFormat: WORKSPACE_DATE_FORMAT,
            language: typeof parsed.language === "string" ? parsed.language : DEFAULT_SETTINGS.language,
            currency: typeof parsed.currency === "string" ? parsed.currency : DEFAULT_SETTINGS.currency,
        };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

function partsForTimeZone(value: string | number | Date, options: Intl.DateTimeFormatOptions = {}) {
    const date = parseWorkspaceDate(value);
    if (!date) return null;
    const { timezone } = getDisplaySettings();
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        ...options,
    }).formatToParts(date);
    return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function formatWorkspaceDateInput(value: string | number | Date | null | undefined) {
    if (!value) return "";
    const parts = partsForTimeZone(value);
    if (!parts) return "";
    return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatWorkspaceDateTimeInput(value: string | number | Date | null | undefined) {
    if (!value) return "";
    const parts = partsForTimeZone(value);
    if (!parts) return "";
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function timezoneOffsetMs(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const asUtc = Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day),
        Number(values.hour),
        Number(values.minute),
        Number(values.second),
    );
    return asUtc - date.getTime();
}

function zonedInputToIso(year: number, month: number, day: number, hour = 0, minute = 0) {
    const timeZone = getDisplaySettings().timezone;
    const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const firstOffset = timezoneOffsetMs(new Date(utcGuess), timeZone);
    let corrected = utcGuess - firstOffset;
    const secondOffset = timezoneOffsetMs(new Date(corrected), timeZone);
    if (secondOffset !== firstOffset) corrected = utcGuess - secondOffset;
    return new Date(corrected).toISOString();
}

export function workspaceDateInputToIso(value: string | null | undefined) {
    if (!value) return null;
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return null;
    return zonedInputToIso(year, month, day);
}

export function workspaceDateTimeInputToIso(value: string | null | undefined) {
    if (!value) return null;
    const [datePart, timePart = "00:00"] = value.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return zonedInputToIso(year, month, day, hour, minute);
}

function normalizeTimestamp(value: string) {
    const trimmed = value.trim();
    const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
    const isDateTime = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(trimmed);
    return isDateTime && !hasTimezone ? `${trimmed.replace(" ", "T")}Z` : trimmed;
}

export function parseWorkspaceDate(value: string | number | Date | null | undefined) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(typeof value === "string" ? normalizeTimestamp(value) : value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function formatWorkspaceDate(value: string | number | Date | null | undefined) {
    const date = parseWorkspaceDate(value);
    if (!date) return "-";
    const { timezone } = getDisplaySettings();
    const parts = new Intl.DateTimeFormat("en-IN", {
        timeZone: timezone,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.day}/${values.month}/${values.year}`;
}

export function formatWorkspaceDateTime(value: string | number | Date | null | undefined, options?: { seconds?: boolean }) {
    const date = parseWorkspaceDate(value);
    if (!date) return "-";
    const { timezone } = getDisplaySettings();
    const parts = new Intl.DateTimeFormat("en-IN", {
        timeZone: timezone,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: options?.seconds ? "2-digit" : undefined,
        hour12: true,
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const dayPeriod = values.dayPeriod?.toUpperCase() ?? "";
    const time = options?.seconds ? `${values.hour}:${values.minute}:${values.second}` : `${values.hour}:${values.minute}`;
    return `${values.day}/${values.month}/${values.year}, ${time} ${dayPeriod}`.trim();
}

export function formatWorkspaceTime(value: string | number | Date | null | undefined, options?: { seconds?: boolean }) {
    const date = parseWorkspaceDate(value);
    if (!date) return "-";
    const { timezone } = getDisplaySettings();
    return new Intl.DateTimeFormat("en-IN", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        second: options?.seconds ? "2-digit" : undefined,
        hour12: true,
    }).format(date);
}

export function formatWorkspaceRelativeTime(value: string | number | Date | null | undefined) {
    const date = parseWorkspaceDate(value);
    return date ? formatDistanceToNow(date, { addSuffix: true }) : "-";
}
