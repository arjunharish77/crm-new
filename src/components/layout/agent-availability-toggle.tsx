"use client";

import { useEffect, useState } from "react";
import { Circle, Coffee, CircleOff } from "lucide-react";
import { toast } from "sonner";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

type Status = "ONLINE" | "OFFLINE" | "BREAK";

const STATUS_META: Record<Status, { label: string; icon: typeof Circle; className: string }> = {
    ONLINE: { label: "Online", icon: Circle, className: "text-emerald-600" },
    BREAK: { label: "On Break", icon: Coffee, className: "text-amber-600" },
    OFFLINE: { label: "Offline", icon: CircleOff, className: "text-muted-foreground" },
};

// Self-service status toggle, deliberately placed in the shared Header (not under
// /dashboard/settings, which is gated to Tenant Admins only) so every rep can set their own
// status regardless of admin permissions -- the supervisor override view lives separately
// under Settings > Agent Availability.
export function AgentAvailabilityToggle() {
    const [status, setStatus] = useState<Status>("OFFLINE");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        apiFetch<{ status: Status }>("/agent-availability/me")
            .then((data) => setStatus(data?.status ?? "OFFLINE"))
            .catch(() => undefined);
    }, []);

    const changeStatus = async (next: Status) => {
        if (next === status || saving) return;
        setSaving(true);
        try {
            await apiFetch("/agent-availability/me", { method: "POST", body: JSON.stringify({ status: next }) });
            setStatus(next);
        } catch (error: any) {
            toast.error(error?.message || "Failed to update status");
        } finally {
            setSaving(false);
        }
    };

    const Meta = STATUS_META[status];
    const Icon = Meta.icon;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="hidden gap-1.5 sm:inline-flex" disabled={saving}>
                    <Icon className={`size-3 fill-current ${Meta.className}`} />
                    {Meta.label}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {(Object.keys(STATUS_META) as Status[]).map((key) => {
                    const option = STATUS_META[key];
                    const OptionIcon = option.icon;
                    return (
                        <DropdownMenuItem key={key} onSelect={() => changeStatus(key)}>
                            <OptionIcon className={`size-3 fill-current ${option.className}`} />
                            {option.label}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
