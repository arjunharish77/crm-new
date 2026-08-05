const APPROVAL_ICONS: Array<[match: string, icon: string]> = [
  ["UGC", "/approvals/ugc.svg"],
  ["NAAC", "/approvals/naac.svg"],
  ["AICTE", "/approvals/aicte.svg"],
  ["WES", "/approvals/wes.svg"],
  ["AIU", "/approvals/aiu.svg"],
];

export function getApprovalIcon(label: string): string | null {
  const match = APPROVAL_ICONS.find(([needle]) => label.toUpperCase().includes(needle));
  return match ? match[1] : null;
}
