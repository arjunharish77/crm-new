"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import {
    Zap,
    GitBranch,
    Database,
    Play,
    Mail,
    Webhook,
    Clock,
    MoreHorizontal,
    Plus,
    Trash2,
    Copy,
    User,
    MinusCircle,
    Square,
    Bell,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const ICONS: Record<string, any> = {
    trigger: Zap,
    condition: GitBranch,
    update_field: Database,
    create_activity: Play,
    send_email: Mail,
    webhook: Webhook,
    delay: Clock,
    wait: Clock,
    if_else: GitBranch,
    update_lead: Database,
    update_opportunity: Database,
    add_activity: Play,
    distribute_lead: GitBranch,
    distribute_opportunity: GitBranch,
    assign_owner: User,
    change_stage: Database,
    notify_user: Bell,
    remove_tag: MinusCircle,
    increment_score: Database,
    clear_field: MinusCircle,
    stop: Square,
    branch: GitBranch,
};

const COLORS: Record<string, string> = {
    trigger: '#2196f3',      // Blue
    condition: '#ff9800',    // Orange
    update_field: '#4caf50', // Green
    create_activity: '#9c27b0', // Purple
    send_email: '#ff5722',   // Deep Orange
    webhook: '#e91e63',      // Pink
    delay: '#607d8b',        // Blue Grey
    wait: '#607d8b',
    if_else: '#ff9800',
    update_lead: '#4caf50',
    update_opportunity: '#4caf50',
    add_activity: '#9c27b0',
    distribute_lead: '#0288d1',
    distribute_opportunity: '#0288d1',
    assign_owner: '#5c6bc0',
    change_stage: '#43a047',
    notify_user: '#ff7043',
    remove_tag: '#00897b',
    increment_score: '#7cb342',
    clear_field: '#78909c',
    stop: '#d32f2f',
    branch: '#78909c',
};

function fieldText(value: unknown) {
    return String(value || "")
        .replace(/^(lead|opportunity|activity)\./, "")
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .replace(/^./, (letter) => letter.toUpperCase());
}

function operatorText(value: unknown) {
    return String(value || "equals")
        .replace(/_/g, " ")
        .replace(/^./, (letter) => letter.toUpperCase());
}

function valueText(value: unknown) {
    if (value === null || value === undefined || value === "") return "set value";
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return "configured value";
    return String(value);
}

function summarizeNode(data: Record<string, any>) {
    const conditions = Array.isArray(data.conditions) ? data.conditions : data.field ? [data] : [];
    if (["condition", "compare", "multi_if_else"].includes(data.type) && conditions.length > 0) {
        const first = conditions[0];
        const suffix = conditions.length > 1 ? ` +${conditions.length - 1} more` : "";
        return `${fieldText(first.field)} ${operatorText(first.operator).toLowerCase()} ${valueText(first.value)}${suffix}`;
    }

    const updates = Array.isArray(data.updates) ? data.updates : data.field ? [data] : [];
    if (["update_field", "update_lead", "update_opportunity", "update_activity"].includes(data.type) && updates.length > 0) {
        const first = updates[0];
        const suffix = updates.length > 1 ? ` +${updates.length - 1} more` : "";
        return `Set ${fieldText(first.field)} to ${valueText(first.value)}${suffix}`;
    }

    if (data.type === "assign_owner") return data.ownerName ? `Assign to ${data.ownerName}` : "Select owner";
    if (data.type === "change_stage") return data.stageName ? `Move to ${data.stageName}` : "Select stage";
    if (data.type === "wait") return data.duration ? `Wait ${data.duration} ${data.unit || "minutes"}` : "Configure wait time";
    if (data.type === "notify_user") return data.title || "Configure notification";
    if (data.type === "webhook") return data.url || "Configure webhook";
    if (data.type === "stop") return data.reason || "Stop this automation";
    return "";
}

export const ExpressiveNode = memo(({ data, selected }: NodeProps) => {
    const Icon = ICONS[data.type] || Zap;
    const color = COLORS[data.type] || 'var(--primary)';
    const summary = summarizeNode(data);

    return (
        <div
            className={cn(
                "group relative flex min-w-[180px] items-center gap-3 rounded-[24px] border-2 bg-card p-3 transition-all",
                selected ? "border-primary shadow-lg" : "border-border shadow-sm hover:border-primary/50 hover:shadow-md"
            )}
        >
            <Handle
                type="target"
                position={Position.Top}
                style={{
                    background: 'var(--primary)',
                    width: 10,
                    height: 10,
                    border: '2px solid var(--card)',
                }}
            />

            <div
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: color, boxShadow: `0 4px 12px ${color}4d` }}
            >
                <Icon className="size-5" />
            </div>

            <div className="flex flex-col">
                <span className="mb-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
                    {data.type !== 'trigger' ? String(data.type).replace(/_/g, ' ') : 'Trigger'}
                </span>
                <span className="text-sm font-semibold leading-tight">{data.label}</span>
                {summary ? (
                    <span className="mt-1 max-w-[220px] truncate text-xs font-medium text-muted-foreground">
                        {summary}
                    </span>
                ) : null}
            </div>

            <div
                className={cn(
                    "ml-auto flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100",
                    selected && "opacity-100"
                )}
            >
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={(event) => {
                                event.stopPropagation();
                                data.onCloneNode?.(data.nodeId);
                            }}
                        >
                            <Copy className="size-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent>Clone node</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={(event) => {
                                event.stopPropagation();
                                data.onDeleteNode?.(data.nodeId);
                            }}
                        >
                            <Trash2 className="size-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent>Delete node</TooltipContent>
                </Tooltip>
                <MoreHorizontal className="size-3.5 self-center text-muted-foreground/50" />
            </div>

            <Handle
                type="source"
                position={Position.Bottom}
                style={{
                    background: 'var(--primary)',
                    width: 10,
                    height: 10,
                    border: '2px solid var(--card)',
                }}
            />
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        className="absolute -bottom-[18px] left-1/2 flex size-7 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        onClick={(event) => {
                            event.stopPropagation();
                            data.onAddChild?.(data.nodeId);
                        }}
                    >
                        <Plus className="size-4" />
                    </button>
                </TooltipTrigger>
                <TooltipContent>Add next step</TooltipContent>
            </Tooltip>
        </div>
    );
});

ExpressiveNode.displayName = "ExpressiveNode";
