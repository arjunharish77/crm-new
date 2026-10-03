import { queryOne } from "@/lib/db/query";
import { DEFAULT_SERVER_TIME_ZONE } from "@/lib/timezone";
import { resolveRelativeDateRange } from "@/lib/query-filters";

export { DEFAULT_SERVER_TIME_ZONE };

function normalizeTimestamp(value: string) {
  const trimmed = value.trim();
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const isDateTime = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(trimmed);
  return isDateTime && !hasTimezone ? `${trimmed.replace(" ", "T")}Z` : trimmed;
}

function parseDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(typeof value === "string" ? normalizeTimestamp(value) : String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeTenantTimeZone(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_SERVER_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-IN", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return DEFAULT_SERVER_TIME_ZONE;
  }
}

// Wall-clock day-of-week/hour/minute a UTC instant corresponds to in a given IANA zone --
// for time-window comparisons (e.g. "is it currently within this team's working hours"),
// not display formatting like the rest of this file. Also returns year/month/day (WP10/F16)
// so a caller can construct another instant on the correct calendar day in this same zone
// (see zonedWallClockToUTC below) without a second, separate Intl.DateTimeFormat call.
export function zonedWallClockParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTenantTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get("year") || 0),
    month: Number(get("month") || 0),
    day: Number(get("day") || 0),
    dayOfWeek: WEEKDAY_INDEX[get("weekday")] ?? date.getUTCDay(),
    hour: Number(get("hour") || 0),
    minute: Number(get("minute") || 0),
  };
}

// WP10 (F16): the inverse of zonedWallClockParts -- given a Y-M-D-H-M wall-clock reading in
// `timeZone`, returns the concrete UTC instant it represents. Used for scheduling decisions
// (e.g. "the next moment quiet hours end") where a tenant-local wall-clock deadline needs to
// become a real, storable, comparable UTC instant rather than staying implicitly tied to
// whatever timezone the process happens to run under.
export function zonedWallClockToUTC(year: number, month1to12: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const zone = normalizeTenantTimeZone(timeZone);
  const guess = new Date(Date.UTC(year, month1to12 - 1, day, hour, minute, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guess);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wallAsUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offsetMs = wallAsUTC - guess.getTime();
  // `guess` shifted back by the zone's own offset at this instant is the real UTC instant whose
  // wall-clock reading IN `timeZone` is exactly year-month1to12-day hour:minute:00.
  return new Date(guess.getTime() - offsetMs);
}

export function timeZoneFromFeatureFlags(featureFlags: unknown) {
  if (!featureFlags || typeof featureFlags !== "object" || Array.isArray(featureFlags)) return DEFAULT_SERVER_TIME_ZONE;
  const generalSettings = (featureFlags as Record<string, unknown>).generalSettings;
  if (!generalSettings || typeof generalSettings !== "object" || Array.isArray(generalSettings)) return DEFAULT_SERVER_TIME_ZONE;
  return normalizeTenantTimeZone((generalSettings as Record<string, unknown>).timezone);
}

export async function getTenantTimeZone(tenantId: string | null | undefined) {
  if (!tenantId) return DEFAULT_SERVER_TIME_ZONE;
  const config = await queryOne<{ featureFlags: Record<string, unknown> | null }>(
    'select "featureFlags" from "TenantConfig" where "tenantId" = $1 limit 1',
    [tenantId],
  );
  return timeZoneFromFeatureFlags(config?.featureFlags);
}

function dateParts(value: unknown, timeZone = DEFAULT_SERVER_TIME_ZONE, includeSeconds = false) {
  const date = parseDate(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: normalizeTenantTimeZone(timeZone),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: includeSeconds ? "2-digit" : undefined,
    hour12: true,
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function formatTenantDate(value: unknown, timeZone = DEFAULT_SERVER_TIME_ZONE) {
  const parts = dateParts(value, timeZone);
  if (!parts) return "";
  return `${parts.day}/${parts.month}/${parts.year}`;
}

export function formatTenantDateTime(value: unknown, timeZone = DEFAULT_SERVER_TIME_ZONE, options: { seconds?: boolean } = {}) {
  const parts = dateParts(value, timeZone, options.seconds);
  if (!parts) return "";
  const dayPeriod = parts.dayPeriod?.toUpperCase() ?? "";
  const time = options.seconds ? `${parts.hour}:${parts.minute}:${parts.second}` : `${parts.hour}:${parts.minute}`;
  return `${parts.day}/${parts.month}/${parts.year}, ${time} ${dayPeriod}`.trim();
}

export function formatExportDateValue(value: unknown, timeZone = DEFAULT_SERVER_TIME_ZONE) {
  if (value instanceof Date) return formatTenantDateTime(value, timeZone);
  if (typeof value !== "string") return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatTenantDate(value, timeZone);
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) return formatTenantDateTime(value, timeZone);
  return value;
}

// Today in the workspace's time zone, as [start, end) ISO instants -- not the server's midnight
// (the server usually runs in UTC, so "today" used to start at 5:30 am in India).
export async function getTenantTodayRange(tenantId: string | null | undefined, now: Date = new Date()) {
  return resolveRelativeDateRange("@today", await getTenantTimeZone(tenantId), now)!;
}
