import type { CategoryFees } from "@/data/catalog";

// Wave 5 E2 (decisions V11–V13): which applicant group's fee a visitor sees first. The browser's time
// zone sets the default (India → Indian applicants; anywhere else → NRI, or the university's single
// international fee); a "Showing fees for" switch overrides it and is remembered in this browser.
// Nothing is sent anywhere. Pages render the Indian fee first and switch after loading.

export type FeeGroup = "indian" | "nri" | "foreign";
export const FEE_GROUPS: Array<{ id: FeeGroup; label: string }> = [
  { id: "indian", label: "Indian applicants" },
  { id: "nri", label: "NRI applicants" },
  { id: "foreign", label: "Foreign nationals" },
];
export const FEE_GROUP_STORAGE_KEY = "uv_fee_group";
const INDIA_TIME_ZONES = new Set(["Asia/Kolkata", "Asia/Calcutta"]);

export function groupFromTimeZone(timeZone: string | undefined): FeeGroup {
  return timeZone && INDIA_TIME_ZONES.has(timeZone) ? "indian" : "nri";
}

export function isFeeGroup(value: unknown): value is FeeGroup {
  return value === "indian" || value === "nri" || value === "foreign";
}

type Row = CategoryFees["rows"][number];

// The published category row for a group, or null when the university hasn't published one.
// Indian → the INR row; NRI → an NRI row, else a single "international" row; foreign national → a
// foreign-national row, else a single "international" row. Never converts currencies.
export function categoryRowFor(categoryFees: CategoryFees | undefined, group: FeeGroup): Row | null {
  const rows = categoryFees?.rows || [];
  if (group === "indian") return rows.find(row => row.currency === "INR") || null;
  const abroad = rows.filter(row => row.currency !== "INR" || !/indian/i.test(row.category));
  const nri = abroad.find(row => /\bNRI\b|non-resident/i.test(row.category));
  const foreign = abroad.find(row => /foreign/i.test(row.category));
  const international = abroad.find(row => /international|overseas/i.test(row.category));
  return group === "nri" ? nri || international || null : foreign || international || null;
}

export type GroupFee =
  | { kind: "listed"; currency: "INR"; total: number; perSemester: number | null; semesters: number | null; category: string | null }
  | { kind: "category"; currency: "INR" | "USD"; total: number; perSemester: number; semesters: number; category: string }
  | { kind: "unpublished" };

// What to show for a course: Indian visitors see the listed tuition (with the INR category row's
// schedule when published); visitors abroad see their group's published row, or "unpublished".
export function feeForGroup(course: { fee: number; categoryFees?: CategoryFees }, group: FeeGroup): GroupFee {
  const row = categoryRowFor(course.categoryFees, group);
  if (group === "indian") return { kind: "listed", currency: "INR", total: course.fee, perSemester: row && row.total === course.fee ? row.perSemester : null, semesters: row && row.total === course.fee ? row.semesters : null, category: row?.category || null };
  return row ? { kind: "category", currency: row.currency, total: row.total, perSemester: row.perSemester, semesters: row.semesters, category: row.category } : { kind: "unpublished" };
}

export function formatGroupAmount(currency: "INR" | "USD", amount: number) {
  return currency === "INR" ? `₹${amount.toLocaleString("en-IN")}` : `US$${amount.toLocaleString("en-US")}`;
}

export const UNPUBLISHED_INTERNATIONAL = "Confirm the fee for international applicants with the university";
