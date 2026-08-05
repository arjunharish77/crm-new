import Image from "next/image";
import type { CSSProperties } from "react";
import { getApprovalIcon } from "@/lib/approval-icons";

export function ApprovalBadge({ label, className, style }: { label: string; className?: string; style?: CSSProperties }) {
  const icon = getApprovalIcon(label);
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 4, ...style }}>
      {icon ? <Image src={icon} alt="" width={13} height={13} aria-hidden="true" /> : null}
      {label}
    </span>
  );
}
