const APPROVAL_ICONS: Array<[match: string, icon: string]> = [
  ["UGC", "/approvals/ugc.svg"],
  ["NAAC", "/approvals/naac.svg"],
  ["AICTE", "/approvals/aicte.svg"],
  ["WES", "/approvals/wes.svg"],
  ["AIU", "/approvals/aiu.svg"],
];

// Intrinsic width ÷ height of each badge SVG, so next/image gets matching width and height
// attributes for whatever height the CSS sets.
const APPROVAL_ICON_RATIOS: Record<string, number> = {
  "/approvals/ugc.svg": 40 / 43.43,
  "/approvals/naac.svg": 40 / 32.41,
  "/approvals/aicte.svg": 1,
  "/approvals/wes.svg": 59.07 / 40,
  "/approvals/aiu.svg": 40.42 / 40,
};

export function approvalIconWidth(icon: string, height: number): number {
  return Math.round(height * (APPROVAL_ICON_RATIOS[icon] ?? 1));
}

export function getApprovalIcon(label: string): string | null {
  const match = APPROVAL_ICONS.find(([needle]) => label.toUpperCase().includes(needle));
  return match ? match[1] : null;
}
