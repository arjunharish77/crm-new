"use client";

import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useModuleEnabled } from "@/components/auth/feature-gate";

export function NbaCountChip({ count }: { count?: number | null }) {
    const moduleEnabled = useModuleEnabled("NEXT_BEST_ACTION");
    if (!moduleEnabled) return null;
    if (!count) return null;
    return (
        <Badge
            variant="outline"
            className="gap-1 border-primary/25 bg-primary/8 text-primary"
            title={`${count} recommended action${count === 1 ? "" : "s"} pending`}
        >
            <Sparkles className="size-3" />
            {count}
        </Badge>
    );
}
