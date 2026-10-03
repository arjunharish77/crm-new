"use client";

import { Edge, Node } from "reactflow";
import { ExpressiveNode } from "@/components/automation/expressive-node";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Play, Zap, GitBranch, GitCompare, Clock, Hourglass, Split, Mail, Database, Webhook, User, MinusCircle, Square, Bell, Coins, Sparkles, Award, Tag, ListPlus, ListMinus, Star, Users, MessageSquare, Blocks, LifeBuoy, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerLabel } from "@/components/automations/trigger-types";

// Node types palette
export const NODE_TYPES = [
    { type: 'trigger', label: 'Trigger', icon: Zap },
    { type: 'condition', label: 'If/Else', icon: GitBranch },
    { type: 'multi_if_else', label: 'Multi If/Else', icon: GitBranch },
    { type: 'compare', label: 'Compare', icon: GitCompare },
    { type: 'wait', label: 'Wait', icon: Clock },
    { type: 'wait_until_activity', label: 'Wait Until Activity', icon: Hourglass },
    { type: 'split_test', label: 'Split Test', icon: Split },
    { type: 'update_lead', label: 'Update Lead', icon: Database },
    { type: 'update_opportunity', label: 'Update Opportunity', icon: Database },
    { type: 'update_activity', label: 'Update Activity', icon: Database },
    { type: 'add_activity', label: 'Add Activity', icon: Play },
    { type: 'add_opportunity', label: 'Add Opportunity', icon: Play },
    { type: 'distribute_lead', label: 'Distribute Lead', icon: GitBranch },
    { type: 'distribute_opportunity', label: 'Distribute Opportunity', icon: GitBranch },
    { type: 'assign_owner', label: 'Assign Owner', icon: User },
    { type: 'change_stage', label: 'Change Stage', icon: Database },
    { type: 'share_opportunity', label: 'Share Opportunity', icon: Users },
    { type: 'stop_share_opportunity', label: 'Stop Sharing Opportunity', icon: Users },
    { type: 'calculate_commission', label: 'Calculate Partner Commission', icon: Coins },
    { type: 'award_points', label: 'Award Gamification Points', icon: Sparkles },
    { type: 'evaluate_badges', label: 'Evaluate Badges', icon: Award },
    { type: 'tag_lead', label: 'Tag Lead', icon: Tag },
    { type: 'remove_tag', label: 'Remove Tag', icon: MinusCircle },
    { type: 'add_to_list', label: 'Add to List', icon: ListPlus },
    { type: 'remove_from_list', label: 'Remove from List', icon: ListMinus },
    { type: 'star_lead', label: 'Star Lead', icon: Star },
    { type: 'increment_score', label: 'Change Lead Score', icon: Database },
    { type: 'create_task', label: 'Create Task', icon: ListPlus },
    { type: 'apply_task_playbook', label: 'Apply Task Playbook', icon: ListPlus },
    { type: 'update_task', label: 'Update Task', icon: Database },
    { type: 'assign_task', label: 'Assign Task', icon: User },
    { type: 'reschedule_task', label: 'Reschedule Task', icon: Clock },
    { type: 'complete_task', label: 'Complete Task', icon: Square },
    { type: 'clear_field', label: 'Clear Field', icon: MinusCircle },
    { type: 'notify_user', label: 'Notify User', icon: Bell },
    { type: 'stop', label: 'Stop Automation', icon: Square },
    { type: 'send_email', label: 'Send Email / Notify', icon: Mail },
    { type: 'webhook', label: 'Webhook', icon: Webhook },
    { type: 'run_automation', label: 'Run Another Automation', icon: Zap },
    { type: 'call_app_action', label: 'Call App Action', icon: Blocks },
    { type: 'assign_case', label: 'Assign Case', icon: User },
    { type: 'add_case_comment', label: 'Add Case Comment', icon: MessageSquare },
    { type: 'create_case', label: 'Create Case', icon: LifeBuoy },
    { type: 'update_case', label: 'Update Case', icon: Database },
    { type: 'escalate_case', label: 'Escalate Case', icon: TrendingUp },
    { type: 'send_case_acknowledgement', label: 'Send Case Acknowledgement', icon: Mail },
    { type: 'send_case_response', label: 'Send Case Response', icon: Mail },
    { type: 'pause_case_sla', label: 'Pause Case SLA', icon: Clock },
    { type: 'resume_case_sla', label: 'Resume Case SLA', icon: Clock },
    { type: 'apply_case_macro', label: 'Apply Case Macro', icon: MessageSquare },
    { type: 'add_case_to_queue', label: 'Add Case to Queue', icon: ListPlus },
    { type: 'close_case', label: 'Close Case', icon: Square },
    { type: 'reopen_case', label: 'Reopen Case', icon: Square },
];

export const LEAD_FIELDS = [
    { key: "name", label: "Lead Name" },
    { key: "email", label: "Email", type: "EMAIL" },
    { key: "phone", label: "Phone" },
    { key: "company", label: "Company" },
    { key: "source", label: "Source", type: "SELECT", options: ["FORM", "WEBSITE", "REFERRAL", "IMPORT", "MANUAL", "CAMPAIGN"] },
    { key: "status", label: "Status", type: "SELECT", options: ["NEW", "CONTACTED", "QUALIFIED", "LOST"] },
    { key: "ownerId", label: "Owner" },
    { key: "score", label: "Score", type: "NUMBER" },
    { key: "predictiveScore.scoreBand", label: "Score Band", type: "SELECT", options: ["HOT", "WARM", "COLD", "RISK"] },
    { key: "predictiveScore.conversionProbability", label: "Conversion Probability", type: "NUMBER" },
    { key: "predictiveScore.confidence", label: "Score Confidence", type: "NUMBER" },
    { key: "predictiveScore.stallRisk", label: "Stall Risk", type: "NUMBER" },
    { key: "predictiveScore.expectedResponseLikelihood", label: "Response Likelihood", type: "NUMBER" },
    { key: "predictiveScore.duplicateRisk", label: "Duplicate Risk", type: "NUMBER" },
    { key: "predictiveScore.staleRisk", label: "Stale Risk", type: "NUMBER" },
];

export const OPPORTUNITY_FIELDS = [
    { key: "title", label: "Title" },
    { key: "amount", label: "Amount", type: "NUMBER" },
    { key: "expectedCloseDate", label: "Expected Close Date", type: "DATE" },
    { key: "priority", label: "Priority", type: "SELECT", options: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
    { key: "stageId", label: "Stage", type: "SELECT" },
    { key: "ownerId", label: "Owner" },
    { key: "predictiveScore.scoreBand", label: "Score Band", type: "SELECT", options: ["HOT", "WARM", "COLD", "RISK"] },
    { key: "predictiveScore.winProbability", label: "Win Probability", type: "NUMBER" },
    { key: "predictiveScore.confidence", label: "Score Confidence", type: "NUMBER" },
    { key: "predictiveScore.stallRisk", label: "Stall Risk", type: "NUMBER" },
    { key: "predictiveScore.expectedCloseRisk", label: "Expected Close Risk", type: "NUMBER" },
];

export const ACTIVITY_FIELDS = [
    { key: "typeId", label: "Activity Type", type: "SELECT" },
    { key: "outcome", label: "Outcome", type: "SELECT", options: ["SUCCESS", "FOLLOW_UP_NEEDED", "NO_ANSWER", "VOICEMAIL", "NOT_INTERESTED"] },
    { key: "notes", label: "Notes" },
    { key: "dueAt", label: "Due Date", type: "DATE" },
    { key: "completedAt", label: "Completed At", type: "DATE" },
];

export const TASK_FIELDS = [
    { key: "title", label: "Title" },
    { key: "description", label: "Description" },
    { key: "status", label: "Status", type: "SELECT", options: ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"] },
    { key: "priority", label: "Priority", type: "SELECT", options: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
    { key: "ownerId", label: "Owner", type: "SELECT" },
    { key: "dueAt", label: "Due Date", type: "DATE" },
    { key: "reminderAt", label: "Reminder", type: "DATE" },
];

export const COMMUNICATION_FIELDS = [
    { key: "channel", label: "Channel", type: "SELECT", options: ["EMAIL", "WHATSAPP", "SMS"] },
    { key: "eventType", label: "Event Type", type: "SELECT", options: ["SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED", "BOUNCED", "FAILED", "UNSUBSCRIBED", "SUPPRESSED"] },
    { key: "providerMessageId", label: "Provider Message ID" },
    { key: "entityType", label: "Related Module", type: "SELECT", options: ["LEAD", "OPPORTUNITY"] },
    { key: "entityId", label: "Related Record" },
];


export const APP_EVENT_FIELDS = [
    { key: "eventName", label: "Event Name" },
];

export const LEAD_NODE_TYPES = new Set([
    "update_lead",
    "add_activity",
    "add_opportunity",
    "distribute_lead",
    "assign_owner",
    "tag_lead",
    "remove_tag",
    "add_to_list",
    "remove_from_list",
    "star_lead",
    "increment_score",
    "clear_field",
]);

export const OPPORTUNITY_NODE_TYPES = new Set([
    "update_opportunity",
    "add_activity",
    "distribute_opportunity",
    "assign_owner",
    "change_stage",
    "calculate_commission",
    "clear_field",
    "share_opportunity",
    "stop_share_opportunity",
]);

export const ACTIVITY_NODE_TYPES = new Set([
    "update_activity",
    "add_activity",
]);

export const TASK_NODE_TYPES = new Set([
    "create_task",
    "apply_task_playbook",
    "update_task",
    "assign_task",
    "reschedule_task",
    "complete_task",
]);

export const GENERIC_NODE_TYPES = new Set([
    "condition",
    "multi_if_else",
    "compare",
    "wait",
    "wait_until_activity",
    "split_test",
    "notify_user",
    "send_email",
    "webhook",
    "stop",
    "award_points",
    "evaluate_badges",
    "run_automation",
    "call_app_action",
    // Usable from any trigger scope, not just "case" -- e.g. a Lead automation opening a
    // support case for that lead. Every other case-related node still acts on the triggering
    // Case itself, so those stay in CASE_NODE_TYPES below.
    "create_case",
]);

export const CASE_NODE_TYPES = new Set([
    "assign_case",
    "add_case_comment",
    "update_case",
    "escalate_case",
    "send_case_acknowledgement",
    "send_case_response",
    "pause_case_sla",
    "resume_case_sla",
    "apply_case_macro",
    "add_case_to_queue",
    "close_case",
    "reopen_case",
]);

export function contextForTriggerScope(scope: string) {
    return {
        lead: scope === "lead" || scope === "activity_lead" || scope === "task_lead" || scope === "opportunity" || scope === "activity_opportunity" || scope === "task_opportunity",
        opportunity: scope === "opportunity" || scope === "activity_opportunity" || scope === "task_opportunity",
        activity: scope === "activity_lead" || scope === "activity_opportunity" || scope === "activity_activity",
        task: scope === "task_lead" || scope === "task_opportunity",
        case: scope === "case",
    };
}

export function nodeAllowedForScope(nodeType: string, scope: string) {
    if (nodeType === "trigger") return true;
    if (GENERIC_NODE_TYPES.has(nodeType)) return true;
    const context = contextForTriggerScope(scope);
    if (LEAD_NODE_TYPES.has(nodeType)) return context.lead;
    if (OPPORTUNITY_NODE_TYPES.has(nodeType)) return context.opportunity;
    if (ACTIVITY_NODE_TYPES.has(nodeType)) return context.activity;
    if (TASK_NODE_TYPES.has(nodeType)) return nodeType === "create_task" || nodeType === "apply_task_playbook" ? context.lead || context.opportunity || context.activity || context.task : context.task;
    if (CASE_NODE_TYPES.has(nodeType)) return context.case;
    return true;
}

export function branchIdForLabel(parentId: string, label: string) {
    return `${parentId}-${label.toLowerCase().replace(/\s+/g, "-")}`;
}

export function multiIfLabels(branchCount: number) {
    return ["If 1", ...Array.from({ length: branchCount }, (_, index) => `Else If ${index + 1}`), "Else"];
}

export const initialNodes: Node[] = [];
export const initialEdges: Edge[] = [];

export function optionListLabel(options: Array<{ label: string; value: string }>, value: unknown) {
    const values = Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
    if (values.length === 0) return "Select values";
    if (values.length === 1) return options.find((option) => option.value === values[0])?.label ?? "1 selected";
    return `${values.length} selected`;
}

export function MultiValueDropdown({
    options,
    value,
    onChange,
    placeholder = "Select values",
    className,
}: {
    options: Array<{ label: string; value: string }>;
    value: unknown;
    onChange: (value: string[]) => void;
    placeholder?: string;
    className?: string;
}) {
    const values = Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className={cn("justify-between", className)}>
                    {values.length === 0 ? placeholder : optionListLabel(options, values)}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 w-72 overflow-y-auto">
                {options.map((option) => (
                    <DropdownMenuCheckboxItem
                        key={option.value}
                        checked={values.includes(option.value)}
                        onCheckedChange={(checked) => {
                            const nextValues = checked
                                ? [...new Set([...values, option.value])]
                                : values.filter((item) => item !== option.value);
                            onChange(nextValues);
                        }}
                        onSelect={(event) => event.preventDefault()}
                    >
                        {option.label}
                    </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export const nodeTypes = {
    expressive: ExpressiveNode,
};

export function samePosition(a: Node["position"], b: Node["position"]) {
    return Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y);
}

export function layoutWorkflow(nodes: Node[], edges: Edge[]): Node[] {
    if (nodes.length === 0) return nodes;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, Edge[]>();

    for (const edge of edges) {
        incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
        outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    }

    const root = nodes.find((node) => node.data?.type === "trigger")
        ?? nodes.find((node) => !incoming.has(node.id))
        ?? nodes[0];
    const levels = new Map<string, number>([[root.id, 0]]);
    const visited = new Set<string>([root.id]);
    const queue = [root.id];

    while (queue.length) {
        const currentId = queue.shift()!;
        const level = levels.get(currentId) ?? 0;
        for (const edge of outgoing.get(currentId) ?? []) {
            if (!byId.has(edge.target) || visited.has(edge.target)) continue;
            visited.add(edge.target);
            levels.set(edge.target, level + 1);
            queue.push(edge.target);
        }
    }

    const grouped = new Map<number, Node[]>();
    for (const node of nodes) {
        const level = levels.get(node.id) ?? Math.max(0, grouped.size);
        grouped.set(level, [...(grouped.get(level) ?? []), node]);
    }

    const positioned = nodes.map((node) => {
        const level = levels.get(node.id) ?? 0;
        const group = grouped.get(level) ?? [node];
        const index = group.findIndex((item) => item.id === node.id);
        const width = Math.max(1, group.length);
        const nextPosition = {
            x: 420 + (index - (width - 1) / 2) * 280,
            y: 70 + level * 170,
        };
        return samePosition(node.position, nextPosition) ? node : { ...node, position: nextPosition };
    });

    return positioned;
}

export function normalizeMultiIfElseBranches(nodes: Node[], edges: Edge[]) {
    const removableNodeIds = new Set<string>();
    const branchNodeIds = new Set(nodes.filter((node) => node.data?.type === "branch").map((node) => node.id));

    for (const node of nodes) {
        if (node.data?.type !== "multi_if_else") continue;
        let branches: Array<Record<string, unknown>> = [];
        if (Array.isArray(node.data.branches)) {
            branches = node.data.branches as Array<Record<string, unknown>>;
        } else if (typeof node.data.branchesJson === "string" && node.data.branchesJson.trim()) {
            try {
                const parsed = JSON.parse(node.data.branchesJson);
                branches = Array.isArray(parsed) ? parsed : [];
            } catch {
                branches = [];
            }
        }
        const desiredLabels = new Set(multiIfLabels(branches.length).map((label) => label.toLowerCase()));
        for (const edge of edges.filter((item) => item.source === node.id)) {
            const label = String(edge.label ?? "").toLowerCase();
            const targetHasChildren = edges.some((item) => item.source === edge.target);
            if (label.startsWith("else if") && !desiredLabels.has(label) && branchNodeIds.has(edge.target) && !targetHasChildren) {
                removableNodeIds.add(edge.target);
            }
        }
    }

    if (removableNodeIds.size === 0) return { nodes, edges };
    return {
        nodes: nodes.filter((node) => !removableNodeIds.has(node.id)),
        edges: edges.filter((edge) => !removableNodeIds.has(edge.target)),
    };
}

// Steps with nothing to set up say what they do when they run.
export const STEP_EXPLANATIONS: Record<string, string> = {
    calculate_commission: "Nothing to set up. If the opportunity's owner is a partner, this finds the highest-priority matching commission rule (Settings › Rewards & payouts › Commission rules) and records the commission. Otherwise it does nothing.",
    award_points: "Nothing to set up. This awards points to the record's owner (for an activity, whoever logged it) for every active gamification rule that matches this trigger and includes them. Points from several rules add up.",
    evaluate_badges: "Nothing to set up. This awards any badge whose threshold is now met. Put it after Award points on the same trigger, since badges count the points that step records.",
};

export const OPPORTUNITY_TRIGGER_SCOPES = ["opportunity", "activity_opportunity", "task_opportunity"];

// Wrap with ReactFlowProvider
// The editable copy of a step's settings, as the step panel and dialog show it. Used to open a
// step, to revert unapplied edits, and to tell whether there are any (UI/UX plan B6).
export function configForNode(node: Node, triggerType: string) {
    // Special handling for trigger node to sync with main trigger type if needed
    const config = { ...(node.data || {}) };
    if (node.data?.type === 'trigger') {
        config.triggerType = triggerType;
    }
    if (['condition', 'compare', 'multi_if_else'].includes(node.data?.type) && !Array.isArray(config.conditions)) {
        config.conditions = config.field ? [{ field: config.field, operator: config.operator || 'equals', value: config.value || '' }] : [];
        config.conditionLogic = config.conditionLogic || 'AND';
    }
    if (node.data?.type === 'multi_if_else' && !Array.isArray(config.branches)) {
        try {
            config.branches = config.branchesJson ? JSON.parse(config.branchesJson) : [];
        } catch {
            config.branches = [];
        }
    }
    if (node.data?.type === 'split_test' && !Array.isArray(config.splits)) {
        config.splits = [
            { label: "Variant A", percentage: 50 },
            { label: "Variant B", percentage: 50 },
        ];
    }
    if (['update_field', 'update_lead', 'update_opportunity', 'update_activity'].includes(node.data?.type) && !Array.isArray(config.updates)) {
        config.updates = config.field ? [{ field: config.field, value: config.value || '' }] : [];
    }
    return config;
}

export function sameConfig(a: unknown, b: unknown): boolean {
    const stable = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(stable);
        if (value && typeof value === "object") {
            return Object.fromEntries(Object.keys(value as object).sort()
                .filter((key) => typeof (value as any)[key] !== "function")
                .map((key) => [key, stable((value as any)[key])]));
        }
        return value;
    };
    return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

// What publishing changes, compared with what runs now (decision 29: Publish shows a summary).
export function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value as Record<string, unknown>).filter((key) => key !== "nodeId" && (value as Record<string, unknown>)[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
    return JSON.stringify(value ?? null);
}

export function summarizeAutomationChanges(live: any, publishedVersion: number, draft: any): string[] {
    const steps = (definition: any): any[] => (Array.isArray(definition?.workflow?.nodes) ? definition.workflow.nodes : []).filter((node: any) => node?.data?.type !== "trigger");
    const stepLabel = (node: any) => String(node?.data?.label || String(node?.data?.type ?? "step").replaceAll("_", " "));
    if (!live || publishedVersion === 0) {
        const count = steps(draft).length;
        return [`First version: starts when ${triggerLabel(draft?.trigger?.type).toLowerCase()}, with ${count} step${count === 1 ? "" : "s"}`];
    }
    const items: string[] = [];
    if ((live.name ?? "") !== (draft.name ?? "")) items.push(`Name: "${live.name}" → "${draft.name}"`);
    if ((live.description ?? "") !== (draft.description ?? "")) items.push("Description changed");
    if (live.trigger?.type !== draft.trigger?.type) items.push(`Starts when: ${triggerLabel(live.trigger?.type)} → ${triggerLabel(draft.trigger?.type)}`);
    else if (canonicalJson(live.trigger) !== canonicalJson(draft.trigger)) items.push("Trigger settings changed");
    const liveSteps = new Map(steps(live).map((node: any) => [node.id, node]));
    const draftSteps = new Map(steps(draft).map((node: any) => [node.id, node]));
    const added = [...draftSteps.values()].filter((node: any) => !liveSteps.has(node.id)).map(stepLabel);
    const removed = [...liveSteps.values()].filter((node: any) => !draftSteps.has(node.id)).map(stepLabel);
    const changed = [...draftSteps.values()].filter((node: any) => liveSteps.has(node.id) && canonicalJson(node.data) !== canonicalJson(liveSteps.get(node.id).data)).map(stepLabel);
    if (added.length) items.push(`Added ${added.length === 1 ? "a step" : `${added.length} steps`}: ${added.join(", ")}`);
    if (removed.length) items.push(`Removed ${removed.length === 1 ? "a step" : `${removed.length} steps`}: ${removed.join(", ")}`);
    if (changed.length) items.push(`Changed ${changed.length === 1 ? "a step" : `${changed.length} steps`}: ${changed.join(", ")}`);
    const edgeKey = (definition: any) => (Array.isArray(definition?.workflow?.edges) ? definition.workflow.edges : []).map((edge: any) => `${edge.source}>${edge.target}:${edge.sourceHandle ?? ""}`).sort().join("|");
    if (edgeKey(live) !== edgeKey(draft)) items.push("Step connections changed");
    if (canonicalJson(live.workflow?.config ?? {}) !== canonicalJson(draft.workflow?.config ?? {})) items.push("Safety guards or exit conditions changed");
    return items.length ? items : ["No changes from what runs now"];
}
