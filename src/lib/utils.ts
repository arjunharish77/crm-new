import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const DISPLAY_SETTINGS_STORAGE_KEY = "unnatify.generalSettings";

export function getWorkspaceCurrency() {
  if (typeof window === "undefined") return "USD";
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DISPLAY_SETTINGS_STORAGE_KEY) || "{}");
    return typeof parsed.currency === "string" && parsed.currency ? parsed.currency : "USD";
  } catch {
    return "USD";
  }
}

export function formatCurrency(amount: number, currency: string = getWorkspaceCurrency(), options: Intl.NumberFormatOptions = {}) {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    ...options,
  }).format(amount);
}
