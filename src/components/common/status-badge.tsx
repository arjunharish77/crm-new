import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { statusDisplay, type StatusKind, type StatusTone } from "@/lib/display/status";

// Status as a tinted, sentence-case pill (UI/UX plan decision 25, §3.2). Pass a `kind` and the
// stored `value` to get the mapped label and tone, or a `tone` and children for anything else.
// `dotColor` is for admin-chosen colours (pipeline stages): shown only as a dot next to the
// label, never as the text or fill colour, since a chosen hex can't be relied on for contrast.
export function StatusBadge({
  kind,
  value,
  tone,
  label,
  dotColor,
  className,
  children,
}: {
  kind?: StatusKind;
  value?: unknown;
  tone?: StatusTone;
  label?: React.ReactNode;
  dotColor?: string | null;
  className?: string;
  children?: React.ReactNode;
}) {
  const mapped = kind ? statusDisplay(kind, value) : null;
  const content = label ?? children ?? mapped?.label ?? "—";
  return (
    <Badge tone={tone ?? mapped?.tone ?? "neutral"} className={className}>
      {dotColor ? <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} /> : null}
      <span className="truncate">{content}</span>
    </Badge>
  );
}
