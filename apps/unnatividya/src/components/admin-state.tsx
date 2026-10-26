import type { ReactNode } from "react";

// CMS status tag (UI redesign 2026-10, admin.css `.admin-state`). Presentational only: the text is
// passed through unchanged, the tone just picks the success / warning / error / neutral colours.
export type AdminStateTone = "success" | "warning" | "error" | "info" | "neutral";

const CATALOG_TONES: Record<string, AdminStateTone> = {
  PUBLISHED: "success", APPLIED: "success", CONFIRMED: "success",
  NEEDS_REVIEW: "warning", PENDING: "warning",
  REJECTED: "error",
  DRAFT: "neutral", ARCHIVED: "neutral", UNSUBSCRIBED: "neutral",
};

export function statusTone(status: string): AdminStateTone {
  return CATALOG_TONES[status] || "neutral";
}

export function AdminState({ tone, children }: { tone: AdminStateTone; children: ReactNode }) {
  return <span className="admin-state" data-tone={tone}>{children}</span>;
}
