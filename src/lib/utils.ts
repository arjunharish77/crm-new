import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatMoney, workspaceCurrency } from "@/lib/display/format"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Kept for existing callers; new code uses lib/display/format.ts. Defaults to ₹ INR when the
// workspace hasn't set a currency (UI/UX plan decision 4; this used to fall back to USD).
export function getWorkspaceCurrency() {
  return workspaceCurrency()
}

export function formatCurrency(amount: number, currency: string = getWorkspaceCurrency(), options: Intl.NumberFormatOptions = {}) {
  return formatMoney(amount, { currency, ...options })
}
