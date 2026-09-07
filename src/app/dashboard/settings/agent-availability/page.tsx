"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Circle, Coffee, CircleOff } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

type AgentRow = {
    userId: string;
    name: string;
    email: string;
    status: "ONLINE" | "OFFLINE" | "BREAK";
    workingHours: { enabled?: boolean; start?: string; end?: string };
    dailyCallCap: number | null;
    maxSimultaneousAssignments: number | null;
    callsToday: number;
    openTaskWorkload: number;
    isOverCallCap: boolean;
    isOverAssignmentCap: boolean;
    isWithinWorkingHours: boolean;
};

const STATUS_META = {
    ONLINE: { label: "Online", icon: Circle, className: "text-emerald-600" },
    BREAK: { label: "On Break", icon: Coffee, className: "text-amber-600" },
    OFFLINE: { label: "Offline", icon: CircleOff, className: "text-muted-foreground" },
} as const;

export default function AgentAvailabilitySettingsPage() {
    const [agents, setAgents] = useState<AgentRow[]>([]);
    const [loading, setLoading] = useState(true);

    const load = () => {
        setLoading(true);
        apiFetch<AgentRow[]>("/agent-availability")
            .then((data) => setAgents(Array.isArray(data) ? data : []))
            .catch(() => toast.error("Failed to load agent availability"))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const updateAgent = async (userId: string, patch: Record<string, unknown>) => {
        try {
            await apiFetch(`/agent-availability/${userId}`, { method: "PATCH", body: JSON.stringify(patch) });
            setAgents((current) => current.map((a) => (a.userId === userId ? { ...a, ...patch } as AgentRow : a)));
            toast.success("Availability updated");
        } catch (error: any) {
            toast.error(error?.message || "Failed to update availability");
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-bold">Agent Availability</h1>
                <p className="text-sm text-muted-foreground">
                    See who&apos;s online, on break, or offline, their working hours, and how close they are to their daily call and
                    assignment caps. Overriding a status or cap here applies immediately.
                </p>
            </div>

            {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
            ) : agents.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">No agents found.</Card>
            ) : (
                <Card className="overflow-hidden py-0">
                    <div className="divide-y">
                        {agents.map((agent) => {
                            const Meta = STATUS_META[agent.status];
                            const Icon = Meta.icon;
                            return (
                                <div key={agent.userId} className="flex flex-wrap items-center gap-3 p-3">
                                    <div className="min-w-[10rem]">
                                        <p className="text-sm font-medium">{agent.name}</p>
                                        <p className="text-xs text-muted-foreground">{agent.email}</p>
                                    </div>

                                    <Select value={agent.status} onValueChange={(value) => updateAgent(agent.userId, { status: value })}>
                                        <SelectTrigger className="w-36">
                                            <SelectValue>
                                                <span className="flex items-center gap-1.5">
                                                    <Icon className={`size-3 fill-current ${Meta.className}`} />
                                                    {Meta.label}
                                                </span>
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(Object.keys(STATUS_META) as Array<keyof typeof STATUS_META>).map((key) => (
                                                <SelectItem key={key} value={key}>
                                                    {STATUS_META[key].label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    <div className="space-y-1">
                                        <Label className="text-xs">Working Hours</Label>
                                        <div className="flex items-center gap-1.5">
                                            <Switch
                                                checked={agent.workingHours?.enabled ?? false}
                                                onCheckedChange={(checked) =>
                                                    updateAgent(agent.userId, { workingHours: { ...agent.workingHours, enabled: checked } })
                                                }
                                            />
                                            <Input
                                                type="time"
                                                className="w-28"
                                                disabled={!agent.workingHours?.enabled}
                                                defaultValue={agent.workingHours?.start ?? "09:00"}
                                                onBlur={(e) =>
                                                    updateAgent(agent.userId, { workingHours: { ...agent.workingHours, start: e.target.value } })
                                                }
                                            />
                                            <Input
                                                type="time"
                                                className="w-28"
                                                disabled={!agent.workingHours?.enabled}
                                                defaultValue={agent.workingHours?.end ?? "18:00"}
                                                onBlur={(e) =>
                                                    updateAgent(agent.userId, { workingHours: { ...agent.workingHours, end: e.target.value } })
                                                }
                                            />
                                            {agent.workingHours?.enabled && (
                                                <Badge variant={agent.isWithinWorkingHours ? "outline" : "secondary"}>
                                                    {agent.isWithinWorkingHours ? "In hours" : "Outside hours"}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-xs">Daily Call Cap</Label>
                                        <div className="flex items-center gap-1.5">
                                            <Input
                                                type="number"
                                                min={0}
                                                className="w-20"
                                                placeholder="None"
                                                defaultValue={agent.dailyCallCap ?? ""}
                                                onBlur={(e) => updateAgent(agent.userId, { dailyCallCap: e.target.value })}
                                            />
                                            <Badge variant={agent.isOverCallCap ? "destructive" : "outline"}>{agent.callsToday} today</Badge>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-xs">Max Simultaneous Assignments</Label>
                                        <div className="flex items-center gap-1.5">
                                            <Input
                                                type="number"
                                                min={0}
                                                className="w-20"
                                                placeholder="None"
                                                defaultValue={agent.maxSimultaneousAssignments ?? ""}
                                                onBlur={(e) => updateAgent(agent.userId, { maxSimultaneousAssignments: e.target.value })}
                                            />
                                            <Badge variant={agent.isOverAssignmentCap ? "destructive" : "outline"}>{agent.openTaskWorkload} open</Badge>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}
        </div>
    );
}
