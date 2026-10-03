"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatWorkspaceDateTime } from "@/lib/date-format";

// A case's due time with "Overdue" as text and an icon, not red text alone (UI/UX plan §5.15).
export function SlaBadge({ due, resolvedAt, label = "Due" }: { due: string | null | undefined; resolvedAt?: string | null; label?: string }) {
    const [now] = useState(() => Date.now());
    if (!due) return <span className="text-xs text-muted-foreground">—</span>;
    if (resolvedAt) return <span className="text-xs text-muted-foreground">{formatWorkspaceDateTime(due)}</span>;
    return new Date(due).getTime() < now
        ? <Badge tone="danger"><AlertTriangle className="size-3" aria-hidden />Overdue · {formatWorkspaceDateTime(due)}</Badge>
        : <span className="text-xs text-muted-foreground">{label} {formatWorkspaceDateTime(due)}</span>;
}
