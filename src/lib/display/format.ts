import { storageGet } from "@/lib/storage";
// Number and money formatting from the workspace settings (UI/UX plan decision 4): the tenant's
// currency, default ₹ INR with Indian digit grouping (₹1,10,000). Whole amounts have no decimals.

// Same storage as lib/date-format's display settings, read directly so this file stays safe to
// import from server code (date-format is a client module). On the server it is always INR.
const DISPLAY_SETTINGS_STORAGE_KEY = "unnatify.generalSettings";

export function workspaceCurrency(): string {
  if (typeof window === "undefined") return "INR";
  try {
    const parsed = JSON.parse(storageGet(DISPLAY_SETTINGS_STORAGE_KEY) || "{}");
    return typeof parsed.currency === "string" && parsed.currency ? parsed.currency : "INR";
  } catch {
    return "INR";
  }
}

function localeFor(currency: string) {
  return currency === "INR" ? "en-IN" : "en-US";
}

export function formatMoney(amount: number | string | null | undefined, options: Intl.NumberFormatOptions & { currency?: string } = {}) {
  if (amount === null || amount === undefined || amount === "") return "—";
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) return "—";
  const { currency = workspaceCurrency(), ...rest } = options;
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat(localeFor(currency), {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
    ...rest,
  }).format(value);
}

// ₹1.2L / ₹3.4Cr for INR, $1.2K / $3.4M otherwise -- for stat tiles and kanban column totals.
export function formatMoneyCompact(amount: number | string | null | undefined, currency = workspaceCurrency()) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";
  if (currency === "INR") {
    const abs = Math.abs(value);
    const symbol = new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(0).replace(/[\d\s.,]/g, "");
    const sign = value < 0 ? "-" : "";
    if (abs >= 1e7) return `${sign}${symbol}${trim(abs / 1e7)}Cr`;
    if (abs >= 1e5) return `${sign}${symbol}${trim(abs / 1e5)}L`;
    return formatMoney(value, { currency });
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function trim(value: number) {
  return value.toFixed(value >= 100 ? 0 : 1).replace(/\.0$/, "");
}

export function formatCount(value: number | string | null | undefined) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat(localeFor(workspaceCurrency())).format(number);
}

// 0.123 -> "12%" (fraction) or 12.3 -> "12%" with { fromPercent: true }.
export function formatPercent(value: number | string | null | undefined, options: { fromPercent?: boolean; digits?: number } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const fraction = options.fromPercent ? number / 100 : number;
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: options.digits ?? 0 }).format(fraction);
}
