'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ReactFlow, {
    MiniMap,
    Controls,
    Background,
    BackgroundVariant,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Node,
    MarkerType,
    ReactFlowInstance,
    ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import { ExpressiveNode } from '@/components/automation/expressive-node';
import { FeatureGate } from '@/components/auth/feature-gate';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeInUp, spring } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StandardDialog } from '@/components/common/standard-dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    ArrowLeft,
    Save,
    Play,
    Zap,
    GitBranch,
    GitCompare,
    Clock,
    Hourglass,
    Split,
    Mail,
    Database,
    Webhook,
    FlaskConical,
    X,
    User,
    MinusCircle,
    Square,
    Bell,
    Plus,
    Trash2,
    ClipboardPaste,
    Coins,
    Sparkles,
    Award,
    Tag,
    ListPlus,
    ListMinus,
    Star,
    Loader2,
    Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExecutionLogViewer } from '@/components/automation/execution-log-viewer';
import { DEFAULT_WORKSPACE_TIME_ZONE, formatWorkspaceDateTime, getDisplaySettings } from '@/lib/date-format';
import { TestWorkflowDialog } from '@/components/automation/TestWorkflowDialog';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { AutomationV2 } from '@/types/automation-v2';

// Node types palette
const NODE_TYPES = [
    { type: 'trigger', label: 'Trigger', icon: Zap, color: '#2196f3' },
    { type: 'condition', label: 'If/Else', icon: GitBranch, color: '#ff9800' },
    { type: 'multi_if_else', label: 'Multi If/Else', icon: GitBranch, color: '#fb8c00' },
    { type: 'compare', label: 'Compare', icon: GitCompare, color: '#f57c00' },
    { type: 'wait', label: 'Wait', icon: Clock, color: '#607d8b' },
    { type: 'wait_until_activity', label: 'Wait Until Activity', icon: Hourglass, color: '#546e7a' },
    { type: 'split_test', label: 'Split Test', icon: Split, color: '#7b1fa2' },
    { type: 'update_lead', label: 'Update Lead', icon: Database, color: '#4caf50' },
    { type: 'update_opportunity', label: 'Update Opportunity', icon: Database, color: '#4caf50' },
    { type: 'update_activity', label: 'Update Activity', icon: Database, color: '#43a047' },
    { type: 'add_activity', label: 'Add Activity', icon: Play, color: '#9c27b0' },
    { type: 'add_opportunity', label: 'Add Opportunity', icon: Play, color: '#8e24aa' },
    { type: 'distribute_lead', label: 'Distribute Lead', icon: GitBranch, color: '#0288d1' },
    { type: 'distribute_opportunity', label: 'Distribute Opportunity', icon: GitBranch, color: '#0288d1' },
    { type: 'assign_owner', label: 'Assign Owner', icon: User, color: '#5c6bc0' },
    { type: 'change_stage', label: 'Change Stage', icon: Database, color: '#43a047' },
    { type: 'calculate_commission', label: 'Calculate Partner Commission', icon: Coins, color: '#2e7d32' },
    { type: 'award_points', label: 'Award Gamification Points', icon: Sparkles, color: '#f9a825' },
    { type: 'evaluate_badges', label: 'Evaluate Badges', icon: Award, color: '#8e24aa' },
    { type: 'tag_lead', label: 'Tag Lead', icon: Tag, color: '#00897b' },
    { type: 'remove_tag', label: 'Remove Tag', icon: MinusCircle, color: '#00897b' },
    { type: 'add_to_list', label: 'Add to List', icon: ListPlus, color: '#00695c' },
    { type: 'remove_from_list', label: 'Remove from List', icon: ListMinus, color: '#00695c' },
    { type: 'star_lead', label: 'Star Lead', icon: Star, color: '#f9a825' },
    { type: 'increment_score', label: 'Change Lead Score', icon: Database, color: '#7cb342' },
    { type: 'create_task', label: 'Create Task', icon: ListPlus, color: '#5c6bc0' },
    { type: 'update_task', label: 'Update Task', icon: Database, color: '#5c6bc0' },
    { type: 'assign_task', label: 'Assign Task', icon: User, color: '#5c6bc0' },
    { type: 'reschedule_task', label: 'Reschedule Task', icon: Clock, color: '#5c6bc0' },
    { type: 'complete_task', label: 'Complete Task', icon: Square, color: '#5c6bc0' },
    { type: 'clear_field', label: 'Clear Field', icon: MinusCircle, color: '#78909c' },
    { type: 'notify_user', label: 'Notify User', icon: Bell, color: '#ff7043' },
    { type: 'stop', label: 'Stop Automation', icon: Square, color: '#d32f2f' },
    { type: 'send_email', label: 'Send Email / Notify', icon: Mail, color: '#ff5722' },
    { type: 'webhook', label: 'Webhook', icon: Webhook, color: '#e91e63' },
];

const LEAD_FIELDS = [
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
];

const OPPORTUNITY_FIELDS = [
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
];

const ACTIVITY_FIELDS = [
    { key: "typeId", label: "Activity Type", type: "SELECT" },
    { key: "outcome", label: "Outcome", type: "SELECT", options: ["SUCCESS", "FOLLOW_UP_NEEDED", "NO_ANSWER", "VOICEMAIL", "NOT_INTERESTED"] },
    { key: "notes", label: "Notes" },
    { key: "dueAt", label: "Due Date", type: "DATE" },
    { key: "completedAt", label: "Completed At", type: "DATE" },
];

const TASK_FIELDS = [
    { key: "title", label: "Title" },
    { key: "description", label: "Description" },
    { key: "status", label: "Status", type: "SELECT", options: ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"] },
    { key: "priority", label: "Priority", type: "SELECT", options: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
    { key: "ownerId", label: "Owner", type: "SELECT" },
    { key: "dueAt", label: "Due Date", type: "DATE" },
    { key: "reminderAt", label: "Reminder", type: "DATE" },
];

const TRIGGER_TYPES = [
    { value: "LEAD_CREATED", label: "New Lead", scope: "lead" },
    { value: "LEAD_UPDATED", label: "Lead Update", scope: "lead" },
    { value: "LEAD_ADDED_TO_LIST", label: "Lead Added to List", scope: "lead" },
    { value: "LEAD_DATE", label: "Lead Specific Date", scope: "lead" },
    { value: "OPPORTUNITY_CREATED", label: "New Opportunity", scope: "opportunity" },
    { value: "OPPORTUNITY_UPDATED", label: "Opportunity Update", scope: "opportunity" },
    { value: "STAGE_CHANGED", label: "Opportunity Stage Changed", scope: "opportunity" },
    { value: "OPPORTUNITY_DATE", label: "Opportunity Specific Date", scope: "opportunity" },
    { value: "ACTIVITY_CREATED", label: "New Activity on Lead", scope: "activity_lead" },
    { value: "ACTIVITY_UPDATED", label: "Activity Update on Lead", scope: "activity_lead" },
    { value: "ACTIVITY_CREATED_ON_OPPORTUNITY", label: "New Activity on Opportunity", scope: "activity_opportunity" },
    { value: "ACTIVITY_UPDATED_ON_OPPORTUNITY", label: "Activity Update on Opportunity", scope: "activity_opportunity" },
    { value: "ACTIVITY_CREATED_ON_ACTIVITY", label: "New Activity on Activity", scope: "activity_activity" },
    { value: "TASK_CREATED_ON_LEAD", label: "Task Created on Lead", scope: "task_lead" },
    { value: "TASK_UPDATED_ON_LEAD", label: "Task Updated on Lead", scope: "task_lead" },
    { value: "TASK_COMPLETED_ON_LEAD", label: "Task Completed on Lead", scope: "task_lead" },
    { value: "TASK_REMINDER_ON_LEAD", label: "Task Reminder on Lead", scope: "task_lead" },
    { value: "TASK_CREATED_ON_OPPORTUNITY", label: "Task Created on Opportunity", scope: "task_opportunity" },
    { value: "TASK_UPDATED_ON_OPPORTUNITY", label: "Task Updated on Opportunity", scope: "task_opportunity" },
    { value: "TASK_COMPLETED_ON_OPPORTUNITY", label: "Task Completed on Opportunity", scope: "task_opportunity" },
    { value: "TASK_REMINDER_ON_OPPORTUNITY", label: "Task Reminder on Opportunity", scope: "task_opportunity" },
    { value: "REGULAR_INTERVAL", label: "At Regular Intervals", scope: "lead" },
    { value: "MANUAL", label: "Manual Trigger", scope: "lead" },
];

const LEAD_NODE_TYPES = new Set([
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

const OPPORTUNITY_NODE_TYPES = new Set([
    "update_opportunity",
    "add_activity",
    "distribute_opportunity",
    "assign_owner",
    "change_stage",
    "calculate_commission",
    "clear_field",
]);

const ACTIVITY_NODE_TYPES = new Set([
    "update_activity",
    "add_activity",
]);

const TASK_NODE_TYPES = new Set([
    "create_task",
    "update_task",
    "assign_task",
    "reschedule_task",
    "complete_task",
]);

const GENERIC_NODE_TYPES = new Set([
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
]);

function contextForTriggerScope(scope: string) {
    return {
        lead: scope === "lead" || scope === "activity_lead" || scope === "task_lead" || scope === "opportunity" || scope === "activity_opportunity" || scope === "task_opportunity",
        opportunity: scope === "opportunity" || scope === "activity_opportunity" || scope === "task_opportunity",
        activity: scope === "activity_lead" || scope === "activity_opportunity" || scope === "activity_activity",
        task: scope === "task_lead" || scope === "task_opportunity",
    };
}

function nodeAllowedForScope(nodeType: string, scope: string) {
    if (nodeType === "trigger") return true;
    if (GENERIC_NODE_TYPES.has(nodeType)) return true;
    const context = contextForTriggerScope(scope);
    if (LEAD_NODE_TYPES.has(nodeType)) return context.lead;
    if (OPPORTUNITY_NODE_TYPES.has(nodeType)) return context.opportunity;
    if (ACTIVITY_NODE_TYPES.has(nodeType)) return context.activity;
    if (TASK_NODE_TYPES.has(nodeType)) return nodeType === "create_task" ? context.lead || context.opportunity || context.activity || context.task : context.task;
    return true;
}

function branchIdForLabel(parentId: string, label: string) {
    return `${parentId}-${label.toLowerCase().replace(/\s+/g, "-")}`;
}

function multiIfLabels(branchCount: number) {
    return ["If 1", ...Array.from({ length: branchCount }, (_, index) => `Else If ${index + 1}`), "Else"];
}

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

function optionListLabel(options: Array<{ label: string; value: string }>, value: unknown) {
    const values = Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
    if (values.length === 0) return "Select values";
    if (values.length === 1) return options.find((option) => option.value === values[0])?.label ?? "1 selected";
    return `${values.length} selected`;
}

function MultiValueDropdown({
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

const nodeTypes = {
    expressive: ExpressiveNode,
};

function samePosition(a: Node["position"], b: Node["position"]) {
    return Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y);
}

function layoutWorkflow(nodes: Node[], edges: Edge[]): Node[] {
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

function normalizeMultiIfElseBranches(nodes: Node[], edges: Edge[]) {
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

function AutomationBuilderContent() {
    const router = useRouter();
    const params = useParams();
    const automationId = params?.id as string;
    const isNew = automationId === 'new';

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [showTestDialog, setShowTestDialog] = useState(false);
    const [configDialogOpen, setConfigDialogOpen] = useState(false);
    const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
    const [addAfterNodeId, setAddAfterNodeId] = useState<string | null>(null);
    const [clonedNodeData, setClonedNodeData] = useState<Record<string, any> | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [triggerType, setTriggerType] = useState('LEAD_CREATED');
    const [tabValue, setTabValue] = useState(0); // 0: Designer, 1: History
    const [designerSection, setDesignerSection] = useState<"workflow" | "step">("workflow");
    const [executions, setExecutions] = useState<any[]>([]);
    const [activityTypes, setActivityTypes] = useState<any[]>([]);
    const [opportunityTypes, setOpportunityTypes] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [leadLists, setLeadLists] = useState<any[]>([]);
    const [triggerOpportunityTypeId, setTriggerOpportunityTypeId] = useState("");
    const [triggerActivityTypeId, setTriggerActivityTypeId] = useState("");
    const [maxExecutionsPerRecord, setMaxExecutionsPerRecord] = useState(10);
    const [maxStepsPerRun, setMaxStepsPerRun] = useState(100);
    const [exitConditionLogic, setExitConditionLogic] = useState<"AND" | "OR">("OR");
    const [exitConditions, setExitConditions] = useState<Array<Record<string, any>>>([]);
    const [leadCustomFields, setLeadCustomFields] = useState<any[]>([]);
    const [opportunityCustomFields, setOpportunityCustomFields] = useState<any[]>([]);
    const [activityCustomFields, setActivityCustomFields] = useState<any[]>([]);
    const [triggerOpportunityCustomFields, setTriggerOpportunityCustomFields] = useState<any[]>([]);
    const [triggerActivityCustomFields, setTriggerActivityCustomFields] = useState<any[]>([]);

    // Node configuration
    const [nodeConfig, setNodeConfig] = useState<Record<string, any>>({});

    useEffect(() => {
        setDesignerSection("workflow");
    }, [selectedNode]);

    useEffect(() => {
        setNodes((current) => {
            const next = layoutWorkflow(current, edges);
            return next.every((node, index) => samePosition(node.position, current[index]?.position)) ? current : next;
        });
    }, [edges, setNodes]);

    useEffect(() => {
        apiFetch("/activity-types").then((data) => setActivityTypes(Array.isArray(data) ? data : [])).catch(() => undefined);
        apiFetch("/opportunity-types").then((data) => {
            const list = Array.isArray(data) ? data : [];
            setOpportunityTypes(list);
            setTriggerOpportunityTypeId((current) => current || list[0]?.id || "");
        }).catch(() => undefined);
        apiFetch("/activity-types").then((data) => {
            const list = Array.isArray(data) ? data : [];
            setActivityTypes(list);
            setTriggerActivityTypeId((current) => current || list[0]?.id || "");
        }).catch(() => undefined);
        apiFetch("/users").then((data) => setUsers(Array.isArray(data) ? data : [])).catch(() => undefined);
        apiFetch("/lead-lists").then((data) => setLeadLists(Array.isArray(data) ? data : [])).catch(() => undefined);
        apiFetch("/custom-fields?objectType=LEAD").then((data) => setLeadCustomFields(Array.isArray(data) ? data : [])).catch(() => setLeadCustomFields([]));
        apiFetch("/custom-fields?objectType=OPPORTUNITY").then((data) => setOpportunityCustomFields(Array.isArray(data) ? data : [])).catch(() => setOpportunityCustomFields([]));
        apiFetch("/custom-fields?objectType=ACTIVITY").then((data) => setActivityCustomFields(Array.isArray(data) ? data : [])).catch(() => setActivityCustomFields([]));
        if (!isNew) {
            fetchAutomation();
            fetchExecutions();
        }
    }, [automationId]);

    const fetchExecutions = async () => {
        try {
            const data = await apiFetch<any[]>(`/automation-v2/${automationId}/executions`);
            setExecutions(data);
        } catch (error) {
            console.error('Failed to fetch executions:', error);
        }
    };

    const fetchAutomation = async () => {
        try {
            const data = await apiFetch<AutomationV2>(`/automation-v2/${automationId}`);
            setName(data.name);
            setDescription(data.description || '');
            setIsActive(data.isActive);
            setTriggerType(data.trigger?.type || 'LEAD_CREATED');
            setTriggerOpportunityTypeId(data.trigger?.opportunityTypeId || "");
            setTriggerActivityTypeId(data.trigger?.activityTypeId || "");
            const workflowConfig = data.workflow?.config ?? {};
            setMaxExecutionsPerRecord(Number(workflowConfig.maxExecutionsPerRecord ?? 10));
            setMaxStepsPerRun(Number(workflowConfig.maxStepsPerRun ?? 100));
            setExitConditionLogic(workflowConfig.exitConditionLogic === "AND" ? "AND" : "OR");
            setExitConditions(Array.isArray(workflowConfig.exitConditions) ? workflowConfig.exitConditions : []);

            // Load workflow
            const loadedNodes = Array.isArray(data.workflow?.nodes)
                ? data.workflow.nodes.map((node) => ({ ...node, data: { ...node.data, nodeId: node.id } }))
                : [];
            const loadedEdges = Array.isArray(data.workflow?.edges) ? data.workflow.edges : [];
            const normalizedWorkflow = normalizeMultiIfElseBranches(loadedNodes, loadedEdges);
            setNodes(normalizedWorkflow.nodes);
            setEdges(normalizedWorkflow.edges);
        } catch (error) {
            console.error('Failed to fetch automation:', error);
            toast.error("Failed to load automation");
        } finally {
            setLoading(false);
        }
    };

    const onConnect = useCallback(
        (params: Connection) => setEdges((eds) => addEdge({
            ...params,
            markerEnd: { type: MarkerType.ArrowClosed },
        }, eds)),
        [setEdges]
    );

    const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        setSelectedNode(node);
        setConfigDialogOpen(true);
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
        setNodeConfig(config);
    }, [triggerType]);

    useEffect(() => {
        if (!triggerOpportunityTypeId) {
            setTriggerOpportunityCustomFields([]);
            return;
        }
        apiFetch(`/type-custom-fields/by-type/OPPORTUNITY_TYPE/${triggerOpportunityTypeId}`)
            .then((fields) => setTriggerOpportunityCustomFields(Array.isArray(fields) ? fields : []))
            .catch(() => setTriggerOpportunityCustomFields([]));
    }, [triggerOpportunityTypeId]);

    useEffect(() => {
        if (!triggerActivityTypeId) {
            setTriggerActivityCustomFields([]);
            return;
        }
        apiFetch(`/type-custom-fields/by-type/ACTIVITY_TYPE/${triggerActivityTypeId}`)
            .then((fields) => setTriggerActivityCustomFields(Array.isArray(fields) ? fields : []))
            .catch(() => setTriggerActivityCustomFields([]));
    }, [triggerActivityTypeId]);

    const addNode = (type: string, afterNodeId?: string | null) => {
        const nodeTypeInfo = availableNodeTypes.find((nt) => nt.type === type) ?? (type === "trigger" ? NODE_TYPES.find((nt) => nt.type === type) : null);
        if (!nodeTypeInfo) return;
        const parent = afterNodeId ? nodes.find((node) => node.id === afterNodeId) : null;

        const newNodeId = `${type}-${Date.now()}`;
        const newNode: Node = {
            id: newNodeId,
            type: 'expressive',
            position: parent ? { x: parent.position.x, y: parent.position.y + 140 } : { x: 250, y: nodes.length * 120 + 50 },
            data: {
                label: nodeTypeInfo.label,
                type,
                nodeId: newNodeId,
            },
        };

        setNodes((nds) => nds.concat(newNode));
        if (afterNodeId) {
            const parentType = parent?.data?.type;
            const branchCount = edges.filter((edge) => edge.source === afterNodeId).length;
            const label = parentType === "condition" || parentType === "compare"
                ? branchCount === 0 ? "Yes" : branchCount === 1 ? "No" : `Else ${branchCount}`
                : parentType === "multi_if_else"
                    ? branchCount === 0 ? "If 1" : branchCount === 1 ? "Else" : `Else If ${branchCount - 1}`
                    : undefined;
            setEdges((eds) => eds.concat({
                id: `${afterNodeId}-${newNode.id}`,
                source: afterNodeId,
                target: newNode.id,
                label,
                type: 'smoothstep',
                markerEnd: { type: MarkerType.ArrowClosed },
            }));
        }
        if (type === "condition") {
            addBranchNodes(newNode, ["Yes", "No"]);
        }
        if (type === "multi_if_else") {
            addBranchNodes(newNode, ["If 1", "Else"]);
        }
        if (type === "split_test") {
            addBranchNodes(newNode, ["Variant A", "Variant B"]);
        }
        setAddAfterNodeId(null);
    };

    const addBranchNodes = (parentNode: Node, labels: string[]) => {
        const existingLabels = new Set(edges.filter((edge) => edge.source === parentNode.id).map((edge) => String(edge.label ?? "").toLowerCase()));
        const existingNodeIds = new Set(nodes.map((node) => node.id));
        const labelsToAdd = labels.filter((label) => !existingLabels.has(label.toLowerCase()) && !existingNodeIds.has(branchIdForLabel(parentNode.id, label)));
        const branchNodes = labelsToAdd.map((label, index) => ({
            id: branchIdForLabel(parentNode.id, label),
            type: "expressive",
            position: {
                x: parentNode.position.x + (index - (labelsToAdd.length - 1) / 2) * 220,
                y: parentNode.position.y + 140,
            },
            data: {
                type: "branch",
                label,
                nodeId: branchIdForLabel(parentNode.id, label),
            },
        }));
        if (branchNodes.length === 0) return;
        const branchEdges = branchNodes.map((branch) => ({
            id: `${parentNode.id}-${branch.id}`,
            source: parentNode.id,
            target: branch.id,
            label: branch.data.label,
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed },
        }));
        setNodes((nds) => nds.concat(branchNodes));
        setEdges((eds) => eds.concat(branchEdges));
    };

    const syncMultiIfBranchNodes = (parentNode: Node, branchCount: number) => {
        const desiredLabels = multiIfLabels(branchCount);
        const desiredLabelKeys = new Set(desiredLabels.map((label) => label.toLowerCase()));
        const outgoingEdges = edges.filter((edge) => edge.source === parentNode.id);
        const missingLabels = desiredLabels.filter((label) => !outgoingEdges.some((edge) => String(edge.label ?? "").toLowerCase() === label.toLowerCase()));
        const removableTargetIds = new Set(
            outgoingEdges
                .filter((edge) => {
                    const label = String(edge.label ?? "").toLowerCase();
                    return label.startsWith("else if") && !desiredLabelKeys.has(label);
                })
                .map((edge) => String(edge.target))
        );
        const removableEmptyTargetIds = new Set(
            [...removableTargetIds].filter((targetId) => !edges.some((edge) => edge.source === targetId))
        );

        if (removableEmptyTargetIds.size > 0) {
            setNodes((current) => current.filter((node) => !removableEmptyTargetIds.has(node.id)));
            setEdges((current) => current.filter((edge) => !(edge.source === parentNode.id && removableEmptyTargetIds.has(edge.target))));
        }
        if (missingLabels.length > 0) {
            addBranchNodes(parentNode, missingLabels);
        }
    };

    const updateNodeConfig = () => {
        if (!selectedNode) return;
        const selectedOwner = nodeConfig.ownerId ? users.find((user) => user.id === nodeConfig.ownerId) : null;
        const selectedStage = nodeConfig.stageId ? stageOptions.find((stage) => stage.id === nodeConfig.stageId) : null;
        const normalizedConfig: Record<string, any> = {
            ...nodeConfig,
            ...(selectedOwner ? { ownerName: selectedOwner.name || selectedOwner.email } : {}),
            ...(selectedStage ? { stageName: `${selectedStage.typeName}: ${selectedStage.name}` } : {}),
            ...(['condition', 'compare', 'multi_if_else'].includes(selectedNode.data?.type)
                ? {
                    field: Array.isArray(nodeConfig.conditions) && nodeConfig.conditions[0]?.field ? nodeConfig.conditions[0].field : nodeConfig.field,
                    operator: Array.isArray(nodeConfig.conditions) && nodeConfig.conditions[0]?.operator ? nodeConfig.conditions[0].operator : nodeConfig.operator,
                    value: Array.isArray(nodeConfig.conditions) && nodeConfig.conditions[0]?.value !== undefined ? nodeConfig.conditions[0].value : nodeConfig.value,
                }
                : {}),
            ...(['update_field', 'update_lead', 'update_opportunity', 'update_activity'].includes(selectedNode.data?.type)
                ? {
                    field: Array.isArray(nodeConfig.updates) && nodeConfig.updates[0]?.field ? nodeConfig.updates[0].field : nodeConfig.field,
                    value: Array.isArray(nodeConfig.updates) && nodeConfig.updates[0]?.value !== undefined ? nodeConfig.updates[0].value : nodeConfig.value,
                }
                : {}),
            ...(selectedNode.data?.type === "multi_if_else"
                ? { branchesJson: JSON.stringify(Array.isArray(nodeConfig.branches) ? nodeConfig.branches : []) }
                : {}),
        };

        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === selectedNode.id) {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            ...normalizedConfig,
                        },
                    };
                }
                return node;
            })
        );

        if (selectedNode.data?.type === 'trigger' && normalizedConfig.triggerType) {
            setTriggerType(normalizedConfig.triggerType);
        }

        if (selectedNode.data?.type === "multi_if_else") {
            const branchCount = Array.isArray(normalizedConfig.branches) ? normalizedConfig.branches.length : 0;
            syncMultiIfBranchNodes(selectedNode, branchCount);
        }

        if (selectedNode.data?.type === "split_test") {
            const splitLabels = (Array.isArray(normalizedConfig.splits) ? normalizedConfig.splits : [])
                .map((split: Record<string, unknown>, index: number) => String(split.label ?? `Variant ${index + 1}`))
                .filter(Boolean);
            addBranchNodes(selectedNode, splitLabels.length > 0 ? splitLabels : ["Variant A", "Variant B"]);
        }

        toast.success("Node configuration updated");
    };

    const removeNodeById = (nodeId: string) => {
        setNodes((nds) => nds.filter((node) => node.id !== nodeId));
        setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
        if (selectedNode?.id === nodeId) setSelectedNode(null);
        toast.success("Node removed");
    };

    const cloneNodeById = (nodeId: string) => {
        const node = nodes.find((item) => item.id === nodeId);
        if (!node) return;
        const config = selectedNode?.id === nodeId ? nodeConfig : {};
        const copyableData = { ...node.data, ...config };
        delete copyableData.onAddChild;
        delete copyableData.onCloneNode;
        delete copyableData.onDeleteNode;
        delete copyableData.nodeId;
        setClonedNodeData(copyableData);
        toast.success("Node copied. Click + elsewhere to paste it.");
    };

    const pasteClonedNode = (afterNodeId?: string | null) => {
        if (!clonedNodeData) return;
        const type = clonedNodeData.type;
        const parent = afterNodeId ? nodes.find((node) => node.id === afterNodeId) : null;
        const newNodeId = `${type}-${Date.now()}`;
        const newNode: Node = {
            id: newNodeId,
            type: 'expressive',
            position: parent ? { x: parent.position.x + 240, y: parent.position.y + 140 } : { x: 280, y: nodes.length * 120 + 80 },
            data: {
                ...clonedNodeData,
                label: clonedNodeData.label || NODE_TYPES.find((item) => item.type === type)?.label || "Step",
                nodeId: newNodeId,
            },
        };
        setNodes((nds) => nds.concat(newNode));
        if (afterNodeId) {
            setEdges((eds) => eds.concat({
                id: `${afterNodeId}-${newNodeId}`,
                source: afterNodeId,
                target: newNodeId,
                type: 'smoothstep',
                markerEnd: { type: MarkerType.ArrowClosed },
            }));
        }
        setAddAfterNodeId(null);
        toast.success("Node pasted");
    };

    const handleSave = async () => {
        if (!name) {
            toast.error('Please provide a name for this automation');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                name,
                description,
                isActive,
                trigger: {
                    type: triggerType,
                    opportunityTypeId: triggerOpportunityTypeId || undefined,
                    activityTypeId: triggerActivityTypeId || undefined,
                },
                workflow: {
                    config: {
                        maxExecutionsPerRecord,
                        maxStepsPerRun,
                        exitConditionLogic,
                        exitConditions,
                    },
                    nodes: nodes.map(n => ({
                        ...n,
                        data: Object.fromEntries(
                            Object.entries(n.id === selectedNode?.id ? { ...n.data, ...nodeConfig } : n.data)
                                .filter(([_, value]) => typeof value !== 'function')
                        )
                    })),
                    edges,
                },
            };

            const url = isNew ? `/automation-v2` : `/automation-v2/${automationId}`;
            const method = isNew ? 'POST' : 'PATCH';

            await apiFetch(url, {
                method,
                body: JSON.stringify(payload),
            });

            toast.success(`Automation ${isNew ? 'created' : 'updated'} successfully`);
            if (isNew) router.push('/dashboard/automations-v2');
        } catch (error) {
            console.error('Failed to save automation:', error);
            toast.error('Failed to save automation');
        } finally {
            setSaving(false);
        }
    };

    const flowNodes = nodes.map((node) => ({
        ...node,
        data: {
            ...node.data,
            nodeId: node.id,
            onAddChild: (nodeId: string) => setAddAfterNodeId(nodeId),
            onCloneNode: cloneNodeById,
            onDeleteNode: removeNodeById,
        },
    }));

    const updateMultiBranch = (index: number, patch: Record<string, any>) => {
        const branches = Array.isArray(nodeConfig.branches) ? [...nodeConfig.branches] : [];
        branches[index] = { ...(branches[index] ?? {}), ...patch };
        setNodeConfig({ ...nodeConfig, branches });
    };

    const addMultiBranch = () => {
        const branches = Array.isArray(nodeConfig.branches) ? [...nodeConfig.branches] : [];
        setNodeConfig({
            ...nodeConfig,
            branches: branches.concat({
                conditionLogic: "AND",
                conditions: [{ field: defaultConditionField, operator: "equals", value: [] }],
            }),
        });
    };

    const removeMultiBranch = (index: number) => {
        const branches = Array.isArray(nodeConfig.branches) ? [...nodeConfig.branches] : [];
        branches.splice(index, 1);
        setNodeConfig({ ...nodeConfig, branches });
    };

    const updateCondition = (index: number, patch: Record<string, any>, key = "conditions") => {
        const conditions = Array.isArray(nodeConfig[key]) ? [...nodeConfig[key]] : [];
        conditions[index] = { ...(conditions[index] ?? {}), ...patch };
        setNodeConfig({ ...nodeConfig, [key]: conditions });
    };

    const addCondition = (key = "conditions") => {
        const conditions = Array.isArray(nodeConfig[key]) ? [...nodeConfig[key]] : [];
        setNodeConfig({ ...nodeConfig, [key]: conditions.concat({ field: defaultConditionField, operator: "equals", value: "" }) });
    };

    const removeCondition = (index: number, key = "conditions") => {
        const conditions = Array.isArray(nodeConfig[key]) ? [...nodeConfig[key]] : [];
        conditions.splice(index, 1);
        setNodeConfig({ ...nodeConfig, [key]: conditions });
    };

    const updateFieldUpdate = (index: number, patch: Record<string, any>) => {
        const updates = Array.isArray(nodeConfig.updates) ? [...nodeConfig.updates] : [];
        updates[index] = { ...(updates[index] ?? {}), ...patch };
        setNodeConfig({ ...nodeConfig, updates });
    };

    const addFieldUpdate = () => {
        const updates = Array.isArray(nodeConfig.updates) ? [...nodeConfig.updates] : [];
        setNodeConfig({ ...nodeConfig, updates: updates.concat({ field: "", value: "" }) });
    };

    const removeFieldUpdate = (index: number) => {
        const updates = Array.isArray(nodeConfig.updates) ? [...nodeConfig.updates] : [];
        updates.splice(index, 1);
        setNodeConfig({ ...nodeConfig, updates });
    };

    const updateSplitVariant = (index: number, patch: Record<string, any>) => {
        const splits = Array.isArray(nodeConfig.splits) ? [...nodeConfig.splits] : [
            { label: "Variant A", percentage: 50 },
            { label: "Variant B", percentage: 50 },
        ];
        splits[index] = { ...(splits[index] ?? {}), ...patch };
        setNodeConfig({ ...nodeConfig, splits });
    };

    const addSplitVariant = () => {
        const splits = Array.isArray(nodeConfig.splits) ? [...nodeConfig.splits] : [
            { label: "Variant A", percentage: 50 },
            { label: "Variant B", percentage: 50 },
        ];
        setNodeConfig({ ...nodeConfig, splits: splits.concat({ label: `Variant ${splits.length + 1}`, percentage: 0 }) });
    };

    const removeSplitVariant = (index: number) => {
        const splits = Array.isArray(nodeConfig.splits) ? [...nodeConfig.splits] : [];
        splits.splice(index, 1);
        setNodeConfig({ ...nodeConfig, splits });
    };

    const updateExitCondition = (index: number, patch: Record<string, any>) => {
        setExitConditions((current) => current.map((condition, conditionIndex) => conditionIndex === index ? { ...condition, ...patch } : condition));
    };

    const addExitCondition = () => {
        setExitConditions((current) => current.concat({ field: "lead.status", operator: "equals", value: "" }));
    };

    const removeExitCondition = (index: number) => {
        setExitConditions((current) => current.filter((_, conditionIndex) => conditionIndex !== index));
    };

    const stageOptions = opportunityTypes.flatMap((type) =>
        (type.stages ?? []).map((stage: any) => ({
            ...stage,
            typeName: type.name,
        }))
    );

    const triggerScope = TRIGGER_TYPES.find((item) => item.value === triggerType)?.scope ?? "lead";
    const triggerScopeLabel = TRIGGER_TYPES.find((item) => item.value === triggerType)?.label ?? "selected trigger";
    const availableNodeTypes = NODE_TYPES.filter((nodeType) => nodeAllowedForScope(nodeType.type, triggerScope));
    const selectedOpportunityType = opportunityTypes.find((type) => type.id === triggerOpportunityTypeId);
    const opportunityStageOptions = (selectedOpportunityType?.stages ?? []).map((stage: any) => ({
        label: stage.name,
        value: stage.id,
    }));
    const selectedActivityType = activityTypes.find((type) => type.id === triggerActivityTypeId);

    const customFieldOptions = (field: any) => {
        const options =
            field.fieldConfig?.options ??
            field.metadata?.options ??
            field.options ??
            [];
        return Array.isArray(options) ? options.map(String) : [];
    };

    const normalizeCustomFieldType = (field: any) => {
        const type = String(field.fieldType ?? field.type ?? "TEXT").toUpperCase();
        if (type === "DROPDOWN") return "SELECT";
        if (type === "MULTI_SELECT") return "MULTI_SELECT";
        return type;
    };

    const customFieldToOption = (field: any, prefix: "lead" | "opportunity" | "activity") => {
        const key = String(field.fieldKey ?? field.key ?? "");
        const label = String(field.fieldLabel ?? field.label ?? key);
        const moduleLabel = prefix === "lead" ? "Lead" : prefix === "opportunity" ? "Opportunity" : "Activity";
        return {
            key: `${prefix}.${key}`,
            label: `${moduleLabel}: ${label}`,
            type: normalizeCustomFieldType(field),
            options: customFieldOptions(field),
            custom: true,
        };
    };

    const mergeFieldOptions = (...groups: Array<any[]>) => {
        const seen = new Set<string>();
        return groups.flat().filter((field) => {
            if (!field?.key || seen.has(field.key)) return false;
            seen.add(field.key);
            return true;
        });
    };

    const leadConditionFields = mergeFieldOptions(
        LEAD_FIELDS.map((field) => ({
            ...field,
            key: `lead.${field.key}`,
            label: `Lead: ${field.label}`,
            type: field.key === "ownerId" ? "SELECT" : field.type,
            options: field.key === "ownerId" ? users.map((user) => ({ label: user.name || user.email, value: user.id })) : field.options,
        })),
        leadCustomFields.filter((field) => field.isActive !== false).map((field) => customFieldToOption(field, "lead"))
    );
    const opportunityConditionFields = mergeFieldOptions(
        OPPORTUNITY_FIELDS.map((field) => ({
            ...field,
            key: `opportunity.${field.key}`,
            label: `Opportunity: ${field.label}`,
            type: field.key === "stageId" || field.key === "ownerId" ? "SELECT" : field.type,
            options: field.key === "stageId"
                ? opportunityStageOptions
                : field.key === "ownerId"
                    ? users.map((user) => ({ label: user.name || user.email, value: user.id }))
                    : field.options,
        })),
        opportunityCustomFields.filter((field) => field.isActive !== false).map((field) => customFieldToOption(field, "opportunity")),
        triggerOpportunityCustomFields.filter((field) => field.isActive !== false).map((field) => customFieldToOption(field, "opportunity"))
    );
    const activityConditionFields = mergeFieldOptions(
        ACTIVITY_FIELDS.map((field) => ({
            ...field,
            key: `activity.${field.key}`,
            label: `Activity: ${field.label}`,
            options: field.key === "typeId" ? activityTypes.map((type) => ({ label: type.name, value: type.id })) : field.options,
        })),
        activityCustomFields.filter((field) => field.isActive !== false).map((field) => customFieldToOption(field, "activity")),
        triggerActivityCustomFields.filter((field) => field.isActive !== false).map((field) => customFieldToOption(field, "activity"))
    );
    const taskConditionFields = TASK_FIELDS.map((field) => ({
        ...field,
        key: `task.${field.key}`,
        label: `Task: ${field.label}`,
        options: field.key === "ownerId" ? users.map((user) => ({ label: user.name || user.email, value: user.id })) : field.options,
    }));

    const isOpportunityScopedTrigger = triggerScope === "opportunity" || triggerScope === "activity_opportunity" || triggerScope === "task_opportunity";
    const isActivityScopedTrigger = triggerScope === "activity_lead" || triggerScope === "activity_opportunity" || triggerScope === "activity_activity";
    const allConditionFields = triggerScope === "opportunity" || triggerScope === "task_opportunity"
        ? [...(triggerScope === "task_opportunity" ? taskConditionFields : []), ...leadConditionFields, ...opportunityConditionFields]
        : triggerScope === "activity_opportunity"
            ? [...activityConditionFields, ...opportunityConditionFields, ...leadConditionFields]
            : triggerScope === "activity_lead" || triggerScope === "activity_activity"
                ? [...activityConditionFields, ...leadConditionFields]
                : triggerScope === "task_lead"
                    ? [...taskConditionFields, ...leadConditionFields]
            : leadConditionFields;
    const defaultConditionField = allConditionFields[0]?.key ?? "lead.source";

    const fieldMetaForValue = (fieldKey: string, source = allConditionFields) => source.find((field) => field.key === fieldKey || field.key.replace(/^(lead|opportunity|activity)\./, "") === fieldKey);
    const fieldOptionsForValue = (fieldKey: string, source = allConditionFields) =>
        (fieldMetaForValue(fieldKey, source)?.options ?? []).map((option: any) =>
            typeof option === "string" ? { label: option, value: option } : { label: option.label ?? option.value, value: option.value ?? option.label }
        );

    const fieldOptionsForNode = selectedNode?.data?.type === "update_opportunity"
            ? opportunityConditionFields.map((field) => ({ ...field, key: field.key.replace(/^opportunity\./, "") }))
        : selectedNode?.data?.type === "update_activity"
            ? activityConditionFields.map((field) => ({ ...field, key: field.key.replace(/^activity\./, "") }))
        : selectedNode?.data?.type === "update_task"
            ? taskConditionFields.map((field) => ({ ...field, key: field.key.replace(/^task\./, "") }))
        : selectedNode?.data?.type === "condition" || selectedNode?.data?.type === "compare" || selectedNode?.data?.type === "multi_if_else"
            ? allConditionFields
                : leadConditionFields.map((field) => ({ ...field, key: field.key.replace(/^lead\./, "") }));

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <motion.div
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            className="flex flex-col"
            style={{ height: 'calc(100vh - 64px)' }}
        >
            {/* Header */}
            <div className="flex items-center gap-4 border-b bg-card px-4 py-2.5">
                <Button variant="ghost" size="icon-sm" onClick={() => router.push('/dashboard/automations-v2')}>
                    <ArrowLeft className="size-4" />
                </Button>
                <div className="min-w-0 flex-1">
                    <h1 className="text-base font-bold tracking-tight">
                        {isNew ? 'New Automation' : 'Edit Workflow'}
                    </h1>
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                            {name || 'Untitled Automation'}
                        </span>
                        <span className="size-1 rounded-full bg-muted-foreground/40" />
                        <span className="text-xs text-muted-foreground">Designer View</span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Switch checked={isActive} onCheckedChange={(checked) => setIsActive(checked)} />
                        <Label className="text-sm font-normal">{isActive ? "Active" : "Inactive"}</Label>
                    </div>
                    {!isNew && (
                        <Button variant="outline" size="sm" onClick={() => setShowTestDialog(true)}>
                            <FlaskConical className="size-4" />
                            Test
                        </Button>
                    )}
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                        <Save className="size-4" />
                        {saving ? 'Saving...' : 'Save'}
                    </Button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar - Node Palette & Config */}
                <div className="z-10 flex w-[380px] shrink-0 flex-col border-r bg-card/70 backdrop-blur-md">
                    <Tabs value={String(tabValue)} onValueChange={(v) => setTabValue(Number(v))}>
                        <TabsList className="h-auto w-full rounded-none border-b bg-transparent p-0">
                            <TabsTrigger
                                value="0"
                                className="flex-1 rounded-none border-b-2 border-transparent py-3 text-xs font-bold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                            >
                                Designer
                            </TabsTrigger>
                            <TabsTrigger
                                value="1"
                                className="flex-1 rounded-none border-b-2 border-transparent py-3 text-xs font-bold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                            >
                                History
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>

                    {tabValue === 0 ? (
                        <div className="flex-1 overflow-y-auto p-3">
                            <Tabs value={designerSection} onValueChange={(value) => setDesignerSection(value as "workflow" | "step")} className="space-y-3">
                                <TabsList className="grid h-9 w-full grid-cols-1">
                                    <TabsTrigger value="workflow" className="text-xs">Workflow</TabsTrigger>
                                </TabsList>

                                <TabsContent value="workflow" className="mt-0 space-y-4">
                            {/* Basic Info */}
                            <div className="mb-4">
                                <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                                    Details
                                </p>
                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="automation-name-input">Name</Label>
                                        <Input
                                            id="automation-name-input"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Trigger</Label>
                                        <Select value={triggerType} onValueChange={(value) => setTriggerType(value)}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {TRIGGER_TYPES.map((trigger) => (
                                                    <SelectItem key={trigger.value} value={trigger.value}>{trigger.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {isOpportunityScopedTrigger && (
                                        <div className="space-y-1.5">
                                            <Label>Opportunity Type</Label>
                                            <Select value={triggerOpportunityTypeId} onValueChange={(value) => setTriggerOpportunityTypeId(String(value))}>
                                                <SelectTrigger className="w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {opportunityTypes.map((type) => (
                                                        <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                    {isActivityScopedTrigger && (
                                        <div className="space-y-1.5">
                                            <Label>Activity Type</Label>
                                            <Select value={triggerActivityTypeId} onValueChange={(value) => setTriggerActivityTypeId(String(value))}>
                                                <SelectTrigger className="w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {activityTypes.map((type) => (
                                                        <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Node Add Guidance */}
                            <div className="mb-4">
                                <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                                    Add Steps
                                </p>
                                <div className="rounded-lg border bg-muted/20 p-3">
                                    <p className="text-xs leading-5 text-muted-foreground">
                                        Use the + button on a node to add the next step. Branch nodes automatically create their paths.
                                    </p>
                                    {nodes.length === 0 && (
                                        <Button className="mt-3" onClick={() => addNode("trigger")}>
                                            Add trigger
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="mb-4">
                                <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                                    Safety Guards
                                </p>
                                <div className="space-y-3 rounded-lg border p-3">
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <div className="space-y-1.5">
                                            <Label>Max runs per record</Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={100}
                                                value={maxExecutionsPerRecord}
                                                onChange={(event) => setMaxExecutionsPerRecord(Math.max(1, Number(event.target.value || 1)))}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>Max steps per run</Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={500}
                                                value={maxStepsPerRun}
                                                onChange={(event) => setMaxStepsPerRun(Math.max(1, Number(event.target.value || 1)))}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2 rounded-md bg-muted/30 p-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <div>
                                                <p className="text-xs font-extrabold">Exit conditions</p>
                                                <p className="text-[11px] text-muted-foreground">Stop before running when these match.</p>
                                            </div>
                                            <Button variant="outline" size="sm" onClick={addExitCondition}>
                                                <Plus className="size-3.5" />
                                                Add
                                            </Button>
                                        </div>
                                        {exitConditions.length > 0 ? (
                                            <Select value={exitConditionLogic} onValueChange={(value) => setExitConditionLogic(value as "AND" | "OR")}>
                                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="OR">Exit when any condition matches</SelectItem>
                                                    <SelectItem value="AND">Exit when all conditions match</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        ) : null}
                                        <div className="space-y-2">
                                            {exitConditions.map((condition, index) => {
                                                const options = fieldOptionsForValue(condition.field);
                                                const valueDisabled = ['contains_data', 'not_contains_data'].includes(condition.operator || 'equals');
                                                return (
                                                    <div key={index} className="grid gap-2 rounded-md border bg-background p-2">
                                                        <Select value={condition.field || ""} onValueChange={(value) => updateExitCondition(index, { field: value, value: "" })}>
                                                            <SelectTrigger className="h-9"><SelectValue placeholder="Field" /></SelectTrigger>
                                                            <SelectContent>
                                                                {allConditionFields.map((field) => (
                                                                    <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <div className="grid gap-2 sm:grid-cols-[130px_1fr_auto]">
                                                            <Select value={condition.operator || "equals"} onValueChange={(value) => updateExitCondition(index, { operator: value })}>
                                                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="equals">Is</SelectItem>
                                                                    <SelectItem value="not_equals">Is not</SelectItem>
                                                                    <SelectItem value="in">Is one of</SelectItem>
                                                                    <SelectItem value="not_in">Is not one of</SelectItem>
                                                                    <SelectItem value="contains">Contains</SelectItem>
                                                                    <SelectItem value="contains_data">Has value</SelectItem>
                                                                    <SelectItem value="not_contains_data">No value</SelectItem>
                                                                    <SelectItem value="greater_than">Greater than</SelectItem>
                                                                    <SelectItem value="less_than">Less than</SelectItem>
                                                                    <SelectItem value="before">Before</SelectItem>
                                                                    <SelectItem value="after">After</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            {options.length > 0 && !valueDisabled ? (
                                                                <MultiValueDropdown
                                                                    options={options}
                                                                    value={condition.value}
                                                                    onChange={(value) => updateExitCondition(index, { value })}
                                                                    className="h-9 w-full"
                                                                />
                                                            ) : (
                                                                <Input
                                                                    className="h-9"
                                                                    value={valueDisabled ? "" : condition.value || ""}
                                                                    disabled={valueDisabled}
                                                                    placeholder={valueDisabled ? "Not required" : "Value"}
                                                                    onChange={(event) => updateExitCondition(index, { value: event.target.value })}
                                                                />
                                                            )}
                                                            <Button variant="ghost" size="icon-sm" onClick={() => removeExitCondition(index)} aria-label="Remove exit condition">
                                                                <Trash2 className="size-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                                </TabsContent>

                                <TabsContent value="step" className="mt-0">
                            {/* Node Configuration */}
                            {selectedNode ? (
                                <div className="mb-4 rounded-[24px] border-2 border-primary bg-primary/5 p-3">
                                    <div className="mb-3 flex items-center justify-between">
                                        <div>
                                            <p className="text-[11px] font-extrabold uppercase tracking-wide text-primary">
                                                Step Configuration
                                            </p>
                                            <p className="text-sm font-semibold">
                                                {selectedNode.data?.label}
                                            </p>
                                        </div>
                                        <Button variant="ghost" size="icon-sm" className="bg-card" onClick={() => setSelectedNode(null)}>
                                            <X className="size-4" />
                                        </Button>
                                    </div>
                                    <div className="space-y-3">
                                        {selectedNode.data?.type === 'trigger' && (
                                            <div className="space-y-1.5">
                                                <Label>Trigger Event</Label>
                                                <Select
                                                    value={nodeConfig.triggerType || triggerType}
                                                    onValueChange={(value) => setNodeConfig({ ...nodeConfig, triggerType: value })}
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {TRIGGER_TYPES.map((trigger) => (
                                                            <SelectItem key={trigger.value} value={trigger.value}>{trigger.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}

                                        {['condition', 'multi_if_else', 'compare'].includes(selectedNode.data?.type) && (
                                            <>
                                                <div className="space-y-3 rounded-lg border p-3">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-extrabold text-muted-foreground">
                                                            {selectedNode.data?.type === 'multi_if_else' ? 'If 1 conditions' : 'Conditions'}
                                                        </span>
                                                        <Button variant="ghost" size="sm" onClick={() => addCondition()}>
                                                            <Plus className="size-3.5" />
                                                            Add
                                                        </Button>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label>Match</Label>
                                                        <Select
                                                            value={nodeConfig.conditionLogic || 'AND'}
                                                            onValueChange={(value) => setNodeConfig({ ...nodeConfig, conditionLogic: value })}
                                                        >
                                                            <SelectTrigger className="w-full">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="AND">All conditions</SelectItem>
                                                                <SelectItem value="OR">Any condition</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    {(Array.isArray(nodeConfig.conditions) && nodeConfig.conditions.length > 0 ? nodeConfig.conditions : [{ field: '', operator: 'equals', value: '' }]).map((condition: any, index: number) => (
                                                        <div key={index} className="space-y-2 rounded-md border p-2">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-xs font-bold">
                                                                    Condition {index + 1}
                                                                </span>
                                                                <Button variant="ghost" size="icon-xs" onClick={() => removeCondition(index)} disabled={(nodeConfig.conditions ?? []).length <= 1}>
                                                                    <Trash2 className="size-3.5" />
                                                                </Button>
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <Label>Field</Label>
                                                                <Select value={condition.field || ''} onValueChange={(value) => updateCondition(index, { field: value })}>
                                                                    <SelectTrigger className="w-full">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {allConditionFields.map((field) => (
                                                                            <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <Label>Operator</Label>
                                                                <Select value={condition.operator || 'equals'} onValueChange={(value) => updateCondition(index, { operator: value })}>
                                                                    <SelectTrigger className="w-full">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {fieldOptionsForValue(condition.field).length > 0 ? (
                                                                            <>
                                                                                <SelectItem value="equals">Is</SelectItem>
                                                                                <SelectItem value="not_equals">Is Not</SelectItem>
                                                                                <SelectItem value="in">Is one of</SelectItem>
                                                                                <SelectItem value="not_in">Is not one of</SelectItem>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <SelectItem value="equals">Equals</SelectItem>
                                                                                <SelectItem value="not_equals">Not Equals</SelectItem>
                                                                            </>
                                                                        )}
                                                                        <SelectItem value="contains">Contains</SelectItem>
                                                                        <SelectItem value="contains_data">Contains Data</SelectItem>
                                                                        <SelectItem value="not_contains_data">Does Not Contain Data</SelectItem>
                                                                        <SelectItem value="greater_than">Greater Than</SelectItem>
                                                                        <SelectItem value="less_than">Less Than</SelectItem>
                                                                        <SelectItem value="before">Before</SelectItem>
                                                                        <SelectItem value="after">After</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                            {!['contains_data', 'not_contains_data'].includes(condition.operator || 'equals') && (
                                                                fieldOptionsForValue(condition.field).length > 0 ? (
                                                                    <div className="space-y-1.5">
                                                                        <Label>Value</Label>
                                                                        <MultiValueDropdown
                                                                            options={fieldOptionsForValue(condition.field)}
                                                                            value={condition.value}
                                                                            onChange={(value) => updateCondition(index, { value })}
                                                                            className="h-10 w-full"
                                                                        />
                                                                    </div>
                                                                ) : (
                                                                    <div className="space-y-1.5">
                                                                        <Label>Value</Label>
                                                                        <Input value={condition.value || ''} onChange={(e) => updateCondition(index, { value: e.target.value })} />
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                                {selectedNode.data?.type === 'multi_if_else' && (
                                                    <div className="space-y-3 rounded-lg border p-3">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-xs font-extrabold text-muted-foreground">
                                                                Else-if branches
                                                            </span>
                                                            <Button variant="ghost" size="sm" onClick={addMultiBranch}>
                                                                <Plus className="size-3.5" />
                                                                Add
                                                            </Button>
                                                        </div>
                                                        {(Array.isArray(nodeConfig.branches) ? nodeConfig.branches : []).map((branch: any, index: number) => (
                                                            <div key={index} className="space-y-2 rounded-md border p-2">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-xs font-bold">
                                                                        Else If {index + 1}
                                                                    </span>
                                                                    <Button variant="ghost" size="icon-xs" onClick={() => removeMultiBranch(index)}>
                                                                        <Trash2 className="size-3.5" />
                                                                    </Button>
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    <Label>Match</Label>
                                                                    <Select
                                                                        value={branch.conditionLogic || 'AND'}
                                                                        onValueChange={(value) => updateMultiBranch(index, { conditionLogic: value })}
                                                                    >
                                                                        <SelectTrigger className="w-full">
                                                                            <SelectValue />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            <SelectItem value="AND">All conditions</SelectItem>
                                                                            <SelectItem value="OR">Any condition</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                </div>
                                                                {(Array.isArray(branch.conditions) && branch.conditions.length > 0 ? branch.conditions : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }]).map((condition: any, conditionIndex: number) => (
                                                                    <div key={conditionIndex} className="space-y-2 rounded-md border p-2">
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-xs font-bold">Condition {conditionIndex + 1}</span>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon-xs"
                                                                                onClick={() => {
                                                                                    const conditions = Array.isArray(branch.conditions) ? [...branch.conditions] : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }];
                                                                                    conditions.splice(conditionIndex, 1);
                                                                                    updateMultiBranch(index, { conditions });
                                                                                }}
                                                                                disabled={(branch.conditions ?? []).length <= 1}
                                                                            >
                                                                                <Trash2 className="size-3.5" />
                                                                            </Button>
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <Label>Field</Label>
                                                                            <Select
                                                                                value={condition.field || ''}
                                                                                onValueChange={(value) => {
                                                                                    const conditions = Array.isArray(branch.conditions) ? [...branch.conditions] : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }];
                                                                                    conditions[conditionIndex] = { ...(conditions[conditionIndex] ?? {}), field: value };
                                                                                    updateMultiBranch(index, { conditions, field: conditions[0]?.field, operator: conditions[0]?.operator, value: conditions[0]?.value });
                                                                                }}
                                                                            >
                                                                                <SelectTrigger className="w-full">
                                                                                    <SelectValue />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    {allConditionFields.map((field) => (
                                                                                        <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                                                                                    ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <Label>Operator</Label>
                                                                            <Select
                                                                                value={condition.operator || 'equals'}
                                                                                onValueChange={(value) => {
                                                                                    const conditions = Array.isArray(branch.conditions) ? [...branch.conditions] : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }];
                                                                                    conditions[conditionIndex] = { ...(conditions[conditionIndex] ?? {}), operator: value };
                                                                                    updateMultiBranch(index, { conditions, field: conditions[0]?.field, operator: conditions[0]?.operator, value: conditions[0]?.value });
                                                                                }}
                                                                            >
                                                                                <SelectTrigger className="w-full">
                                                                                    <SelectValue />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    {fieldOptionsForValue(condition.field).length > 0 ? (
                                                                                        <>
                                                                                            <SelectItem value="equals">Is</SelectItem>
                                                                                            <SelectItem value="not_equals">Is Not</SelectItem>
                                                                                            <SelectItem value="in">Is one of</SelectItem>
                                                                                            <SelectItem value="not_in">Is not one of</SelectItem>
                                                                                        </>
                                                                                    ) : (
                                                                                        <>
                                                                                            <SelectItem value="equals">Equals</SelectItem>
                                                                                            <SelectItem value="not_equals">Not Equals</SelectItem>
                                                                                        </>
                                                                                    )}
                                                                                    <SelectItem value="contains">Contains</SelectItem>
                                                                                    <SelectItem value="contains_data">Contains Data</SelectItem>
                                                                                    <SelectItem value="not_contains_data">Does Not Contain Data</SelectItem>
                                                                                    <SelectItem value="greater_than">Greater Than</SelectItem>
                                                                                    <SelectItem value="less_than">Less Than</SelectItem>
                                                                                    <SelectItem value="before">Before</SelectItem>
                                                                                    <SelectItem value="after">After</SelectItem>
                                                                                </SelectContent>
                                                                            </Select>
                                                                        </div>
                                                                        {!['contains_data', 'not_contains_data'].includes(condition.operator || 'equals') && (
                                                                            fieldOptionsForValue(condition.field).length > 0 ? (
                                                                                <div className="space-y-1.5">
                                                                                    <Label>Value</Label>
                                                                                    <MultiValueDropdown
                                                                                        options={fieldOptionsForValue(condition.field)}
                                                                                        value={condition.value}
                                                                                        onChange={(value) => {
                                                                                            const conditions = Array.isArray(branch.conditions) ? [...branch.conditions] : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }];
                                                                                            conditions[conditionIndex] = { ...(conditions[conditionIndex] ?? {}), value };
                                                                                            updateMultiBranch(index, { conditions, field: conditions[0]?.field, operator: conditions[0]?.operator, value: conditions[0]?.value });
                                                                                        }}
                                                                                        className="h-10 w-full"
                                                                                    />
                                                                                </div>
                                                                            ) : (
                                                                                <div className="space-y-1.5">
                                                                                    <Label>Value</Label>
                                                                                    <Input
                                                                                        value={condition.value || ''}
                                                                                        onChange={(e) => {
                                                                                            const conditions = Array.isArray(branch.conditions) ? [...branch.conditions] : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }];
                                                                                            conditions[conditionIndex] = { ...(conditions[conditionIndex] ?? {}), value: e.target.value };
                                                                                            updateMultiBranch(index, { conditions, field: conditions[0]?.field, operator: conditions[0]?.operator, value: conditions[0]?.value });
                                                                                        }}
                                                                                    />
                                                                                </div>
                                                                            )
                                                                        )}
                                                                    </div>
                                                                ))}
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        const conditions = Array.isArray(branch.conditions) ? [...branch.conditions] : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }];
                                                                        updateMultiBranch(index, { conditions: conditions.concat({ field: defaultConditionField, operator: "equals", value: "" }) });
                                                                    }}
                                                                >
                                                                    <Plus className="size-3.5" />
                                                                    Add condition
                                                                </Button>
                                                            </div>
                                                        ))}
                                                        <p className="text-xs text-muted-foreground">
                                                            The final Else branch is used when no condition matches.
                                                        </p>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {['update_field', 'update_lead', 'update_opportunity', 'update_activity'].includes(selectedNode.data?.type) && (
                                            <div className="space-y-3 rounded-lg border p-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-extrabold text-muted-foreground">
                                                        Field updates
                                                    </span>
                                                    <Button variant="ghost" size="sm" onClick={addFieldUpdate}>
                                                        <Plus className="size-3.5" />
                                                        Add
                                                    </Button>
                                                </div>
                                                {(Array.isArray(nodeConfig.updates) && nodeConfig.updates.length > 0 ? nodeConfig.updates : [{ field: '', value: '' }]).map((update: any, index: number) => (
                                                    <div key={index} className="space-y-2 rounded-md border p-2">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-xs font-bold">Update {index + 1}</span>
                                                            <Button variant="ghost" size="icon-xs" onClick={() => removeFieldUpdate(index)} disabled={(nodeConfig.updates ?? []).length <= 1}>
                                                                <Trash2 className="size-3.5" />
                                                            </Button>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <Label>Field</Label>
                                                            <Select value={update.field || ''} onValueChange={(value) => updateFieldUpdate(index, { field: value })}>
                                                                <SelectTrigger className="w-full">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {fieldOptionsForNode.map((field) => (
                                                                        <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        {fieldOptionsForValue(update.field, fieldOptionsForNode).length > 0 ? (
                                                            <div className="space-y-1.5">
                                                                <Label>New Value</Label>
                                                                <Select value={update.value || ''} onValueChange={(value) => updateFieldUpdate(index, { value })}>
                                                                    <SelectTrigger className="w-full">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {fieldOptionsForValue(update.field, fieldOptionsForNode).map((option: { label: string; value: string }) => (
                                                                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-1.5">
                                                                <Label>New Value</Label>
                                                                <Input value={update.value || ''} onChange={(e) => updateFieldUpdate(index, { value: e.target.value })} />
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {selectedNode.data?.type === 'send_email' && (
                                            <>
                                                <div className="space-y-1.5">
                                                    <Label>To</Label>
                                                    <Input value={nodeConfig.to || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, to: e.target.value })} />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>Subject</Label>
                                                    <Input value={nodeConfig.subject || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, subject: e.target.value })} />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>Body</Label>
                                                    <Textarea rows={3} value={nodeConfig.body || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, body: e.target.value })} />
                                                </div>
                                            </>
                                        )}

                                        {['create_activity', 'add_activity'].includes(selectedNode.data?.type) && (
                                            <>
                                                <div className="space-y-1.5">
                                                    <Label>Activity Type</Label>
                                                    <Select value={nodeConfig.activityTypeId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, activityTypeId: value, typeId: value })}>
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {activityTypes.map((type) => (
                                                                <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>Subject</Label>
                                                    <Input value={nodeConfig.subject || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, subject: e.target.value })} />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>Notes</Label>
                                                    <Textarea rows={2} value={nodeConfig.notes || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, notes: e.target.value })} />
                                                </div>
                                            </>
                                        )}

                                        {selectedNode.data?.type === 'add_opportunity' && (
                                            <>
                                                <div className="space-y-1.5">
                                                    <Label>Opportunity Type</Label>
                                                    <Select value={nodeConfig.opportunityTypeId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, opportunityTypeId: value })}>
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {opportunityTypes.map((type) => (
                                                                <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>Title</Label>
                                                    <Input value={nodeConfig.title || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, title: e.target.value })} />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>Amount</Label>
                                                    <Input type="number" value={nodeConfig.amount || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, amount: e.target.value })} />
                                                </div>
                                            </>
                                        )}

                                        {['delay', 'wait', 'wait_until_activity', 'split_test'].includes(selectedNode.data?.type) && (
                                            <div className="flex gap-2">
                                                <div className="flex-1 space-y-1.5">
                                                    <Label>Duration</Label>
                                                    <Input type="number" value={nodeConfig.duration || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, duration: e.target.value })} />
                                                </div>
                                                <div className="flex-1 space-y-1.5">
                                                    <Label>Unit</Label>
                                                    <Select value={nodeConfig.unit || 'hours'} onValueChange={(value) => setNodeConfig({ ...nodeConfig, unit: value })}>
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="minutes">Minutes</SelectItem>
                                                            <SelectItem value="hours">Hours</SelectItem>
                                                            <SelectItem value="days">Days</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        )}

                                        {['tag_lead', 'star_lead'].includes(selectedNode.data?.type) && (
                                            <div className="space-y-1.5">
                                                <Label>{selectedNode.data?.type === 'tag_lead' ? "Tags" : "Star Reason"}</Label>
                                                <Input value={nodeConfig.value || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, value: e.target.value })} />
                                            </div>
                                        )}

                                        {selectedNode.data?.type === 'remove_tag' && (
                                            <div className="space-y-1.5">
                                                <Label>Tag to remove</Label>
                                                <Input value={nodeConfig.value || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, value: e.target.value })} />
                                            </div>
                                        )}

                                        {['add_to_list', 'remove_from_list'].includes(selectedNode.data?.type) && (
                                            <div className="space-y-1.5">
                                                <Label>Lead List</Label>
                                                <Select value={nodeConfig.listId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, listId: value })}>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {leadLists.filter((list) => list.type === 'STATIC').map((list) => (
                                                            <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}

                                        {selectedNode.data?.type === 'increment_score' && (
                                            <div className="space-y-1.5">
                                                <Label>Score change</Label>
                                                <Input type="number" value={nodeConfig.value || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, value: e.target.value })} />
                                            </div>
                                        )}

                                        {selectedNode.data?.type === 'clear_field' && (
                                            <div className="space-y-1.5">
                                                <Label>Field to clear</Label>
                                                <Select value={nodeConfig.field || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, field: value })}>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {fieldOptionsForNode.map((field) => (
                                                            <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}

                                        {selectedNode.data?.type === 'assign_owner' && (
                                            <>
                                                <div className="space-y-1.5">
                                                    <Label>Record</Label>
                                                    <Select value={nodeConfig.target || 'current'} onValueChange={(value) => setNodeConfig({ ...nodeConfig, target: value })}>
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="current">Current record</SelectItem>
                                                            <SelectItem value="lead">Lead</SelectItem>
                                                            <SelectItem value="opportunity">Opportunity</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>Owner</Label>
                                                    <Select value={nodeConfig.ownerId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, ownerId: value })}>
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {users.map((user) => (
                                                                <SelectItem key={user.id} value={user.id}>{user.name || user.email}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </>
                                        )}

                                        {selectedNode.data?.type === 'change_stage' && (
                                            <div className="space-y-1.5">
                                                <Label>Stage</Label>
                                                <Select value={nodeConfig.stageId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, stageId: value })}>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {stageOptions.map((stage) => (
                                                            <SelectItem key={stage.id} value={stage.id}>{stage.typeName}: {stage.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}

                                        {selectedNode.data?.type === 'calculate_commission' && (
                                            <Alert variant="info" className="text-[13px]">
                                                <Info className="size-4" />
                                                <AlertDescription>
                                                    No configuration needed here. When this step runs, it looks up the
                                                    opportunity&apos;s owner — if they&apos;re a partner, it resolves the
                                                    highest-priority matching Commission Rule (Settings → Commission Rules)
                                                    and writes an immutable commission ledger entry. If the owner isn&apos;t
                                                    a partner, or no rule matches, this step is a no-op.
                                                </AlertDescription>
                                            </Alert>
                                        )}

                                        {selectedNode.data?.type === 'award_points' && (
                                            <Alert variant="info" className="text-[13px]">
                                                <Info className="size-4" />
                                                <AlertDescription>
                                                    No configuration needed here. When this step runs, it resolves the
                                                    record&apos;s owner (or, for an activity, whoever logged it) and awards
                                                    points for every active Gamification Rule (Settings → Gamification
                                                    Rules) whose trigger matches this automation&apos;s trigger and whose
                                                    audience scope includes them. Unlike commission, every matching rule
                                                    fires — points from multiple rules stack rather than picking one winner.
                                                </AlertDescription>
                                            </Alert>
                                        )}

                                        {selectedNode.data?.type === 'evaluate_badges' && (
                                            <Alert variant="info" className="text-[13px]">
                                                <Info className="size-4" />
                                                <AlertDescription>
                                                    No configuration needed here. Counts EARNED entries in the gamification
                                                    points ledger for this trigger event and awards any Badge (Settings →
                                                    Badges) whose threshold is met within its configured window. Usually
                                                    added right after &quot;Award Gamification Points&quot; on the same
                                                    trigger, since badges count ledger entries that step writes — add a
                                                    Gamification Rule for this event first, or a badge tracking it will
                                                    never accumulate.
                                                </AlertDescription>
                                            </Alert>
                                        )}

                                        {selectedNode.data?.type === 'notify_user' && (
                                            <>
                                                <div className="space-y-1.5">
                                                    <Label>User</Label>
                                                    <Select value={nodeConfig.userId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, userId: value })}>
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {users.map((user) => (
                                                                <SelectItem key={user.id} value={user.id}>{user.name || user.email}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>Title</Label>
                                                    <Input value={nodeConfig.title || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, title: e.target.value })} />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>Message</Label>
                                                    <Textarea rows={2} value={nodeConfig.message || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, message: e.target.value })} />
                                                </div>
                                            </>
                                        )}

                                        {selectedNode.data?.type === 'stop' && (
                                            <div className="space-y-1.5">
                                                <Label>Reason</Label>
                                                <Input value={nodeConfig.reason || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, reason: e.target.value })} />
                                            </div>
                                        )}

                                        {selectedNode.data?.type === 'webhook' && (
                                            <>
                                                <div className="space-y-1.5">
                                                    <Label>URL</Label>
                                                    <Input value={nodeConfig.url || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, url: e.target.value })} />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>Method</Label>
                                                    <Select value={nodeConfig.method || 'POST'} onValueChange={(value) => setNodeConfig({ ...nodeConfig, method: value })}>
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="GET">GET</SelectItem>
                                                            <SelectItem value="POST">POST</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>Body (JSON)</Label>
                                                    <Textarea rows={3} value={nodeConfig.body || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, body: e.target.value })} />
                                                </div>
                                            </>
                                        )}

                                        <Button onClick={updateNodeConfig} className="mt-1 w-full">
                                            Update Step
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                                    Select a step on the canvas to configure its trigger, conditions, wait timing, or action details.
                                </div>
                            )}
                                </TabsContent>
                            </Tabs>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto p-3">
                            <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                                Execution Log
                            </p>
                            {executions.length === 0 ? (
                                <div className="p-8 text-center">
                                    <p className="text-sm text-muted-foreground/60">No executions yet</p>
                                </div>
                            ) : (
                                <div className="mt-3 space-y-3">
                                    {executions.map((exe) => (
                                        <div key={exe.id} className="rounded-2xl border p-3">
                                            <div className="mb-1.5 flex items-center justify-between">
                                                <Badge
                                                    variant="outline"
                                                    className={cn(
                                                        "h-5 text-[10px] font-bold",
                                                        exe.status === 'COMPLETED' && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                                                        exe.status === 'FAILED' && "border-destructive/30 bg-destructive/10 text-destructive",
                                                        exe.status !== 'COMPLETED' && exe.status !== 'FAILED' && "border-primary/30 bg-primary/10 text-primary"
                                                    )}
                                                >
                                                    {exe.status}
                                                </Badge>
                                                <span className="text-xs text-muted-foreground">
                                                    {formatWorkspaceDateTime(exe.startedAt)}
                                                </span>
                                            </div>
                                            <p className="text-xs font-semibold">
                                                {String(exe.entityType || "Record").replace(/_/g, " ")}
                                            </p>
                                            {exe.executionLog?.steps && (
                                                <div className="mt-2 border-t pt-2">
                                                    <ExecutionLogViewer steps={exe.executionLog.steps} />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Canvas */}
                <div className="relative flex-1 bg-background">
                    <ReactFlow
                        nodes={flowNodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={onNodeClick}
                        onInit={setReactFlowInstance}
                        nodeTypes={nodeTypes}
                        snapToGrid={true}
                        snapGrid={[12, 12]}
                        fitView
                        defaultEdgeOptions={{
                            type: 'smoothstep',
                            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--primary)' },
                            style: { strokeWidth: 2, stroke: 'var(--primary)' }
                        }}
                    >
                        <Controls className="bg-background border-muted rounded-xl shadow-lg" />
                        <MiniMap className="bg-background border-muted rounded-xl shadow-lg" />
                        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="color-mix(in srgb, var(--primary) 10%, transparent)" />
                    </ReactFlow>
                </div>
            </div>

            {/* Test Dialog */}
            {!isNew && (
                <TestWorkflowDialog
                    open={showTestDialog}
                    onClose={() => setShowTestDialog(false)}
                    automationId={automationId}
                    automationName={name}
                />
            )}
            <StandardDialog
                open={configDialogOpen && Boolean(selectedNode)}
                onClose={() => setConfigDialogOpen(false)}
                title={String(selectedNode?.data?.label ?? "Configure Step")}
                subtitle="Choose conditions and actions from controlled lists wherever values are known."
                maxWidth="lg"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setConfigDialogOpen(false)}>Cancel</Button>
                        <Button
                            onClick={() => {
                                updateNodeConfig();
                                setConfigDialogOpen(false);
                            }}
                        >
                            Save Step
                        </Button>
                    </>
                }
            >
                {selectedNode ? (
                    <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1">
                        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                            <div className="space-y-2">
                                <Label>Step Name</Label>
                                <Input value={nodeConfig.label || ""} onChange={(e) => setNodeConfig({ ...nodeConfig, label: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Step Type</Label>
                                <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm font-semibold">
                                    {selectedNode.data?.type}
                                </div>
                            </div>
                        </div>

                        {selectedNode.data?.type === 'trigger' && (
                            <div className="space-y-2 rounded-xl border bg-card p-4">
                                <Label>Trigger Event</Label>
                                <Select value={nodeConfig.triggerType || triggerType} onValueChange={(value) => setNodeConfig({ ...nodeConfig, triggerType: value })}>
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {TRIGGER_TYPES.map((trigger) => (
                                            <SelectItem key={trigger.value} value={trigger.value}>{trigger.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {['condition', 'multi_if_else', 'compare'].includes(selectedNode.data?.type) && (
                            <div className="space-y-3 rounded-xl border bg-card p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-extrabold">Conditions</p>
                                        <p className="text-xs text-muted-foreground">Use known field values from dropdowns where available.</p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => addCondition()}>
                                        <Plus className="size-4" />
                                        Add Condition
                                    </Button>
                                </div>
                                <Select value={nodeConfig.conditionLogic || 'AND'} onValueChange={(value) => setNodeConfig({ ...nodeConfig, conditionLogic: value })}>
                                    <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="AND">Match all conditions</SelectItem>
                                        <SelectItem value="OR">Match any condition</SelectItem>
                                    </SelectContent>
                                </Select>
                                {(Array.isArray(nodeConfig.conditions) && nodeConfig.conditions.length > 0 ? nodeConfig.conditions : [{ field: '', operator: 'equals', value: '' }]).map((condition: any, index: number) => {
                                    const valueOptions = fieldOptionsForValue(condition.field);
                                    const valueDisabled = ['contains_data', 'not_contains_data'].includes(condition.operator || 'equals');
                                    return (
                                        <div key={index} className="grid gap-2 rounded-lg border bg-muted/20 p-3 md:grid-cols-[minmax(220px,1.2fr)_150px_minmax(220px,1fr)_auto] md:items-center">
                                            <Select value={condition.field || ''} onValueChange={(value) => updateCondition(index, { field: value, value: "" })}>
                                                <SelectTrigger><SelectValue placeholder="Field" /></SelectTrigger>
                                                <SelectContent>
                                                    {allConditionFields.map((field) => (
                                                        <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Select value={condition.operator || 'equals'} onValueChange={(value) => updateCondition(index, { operator: value })}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="equals">Is</SelectItem>
                                                    <SelectItem value="not_equals">Is not</SelectItem>
                                                    <SelectItem value="in">Is one of</SelectItem>
                                                    <SelectItem value="not_in">Is not one of</SelectItem>
                                                    <SelectItem value="contains">Contains</SelectItem>
                                                    <SelectItem value="contains_data">Has value</SelectItem>
                                                    <SelectItem value="not_contains_data">No value</SelectItem>
                                                    <SelectItem value="greater_than">Greater than</SelectItem>
                                                    <SelectItem value="less_than">Less than</SelectItem>
                                                    <SelectItem value="before">Before</SelectItem>
                                                    <SelectItem value="after">After</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            {valueOptions.length > 0 && !valueDisabled ? (
                                                <MultiValueDropdown
                                                    options={valueOptions}
                                                    value={condition.value}
                                                    onChange={(value) => updateCondition(index, { value })}
                                                    className="h-10 w-full"
                                                />
                                            ) : (
                                                <Input
                                                    value={valueDisabled ? "" : condition.value || ""}
                                                    disabled={valueDisabled}
                                                    placeholder={valueDisabled ? "Not required" : "Value"}
                                                    onChange={(e) => updateCondition(index, { value: e.target.value })}
                                                />
                                            )}
                                            <Button variant="ghost" size="icon-sm" onClick={() => removeCondition(index)} disabled={(nodeConfig.conditions ?? []).length <= 1}>
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </div>
                                    );
                                })}
                                {selectedNode.data?.type === 'multi_if_else' ? (
                                    <div className="space-y-3 rounded-lg border border-dashed bg-muted/20 p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-bold">Else-if branches</p>
                                                <p className="text-xs text-muted-foreground">Branches run top to bottom; Else runs when nothing matches.</p>
                                            </div>
                                            <Button variant="outline" size="sm" onClick={addMultiBranch}>
                                                <Plus className="size-4" />
                                                Add Else-if
                                            </Button>
                                        </div>
                                        {(Array.isArray(nodeConfig.branches) ? nodeConfig.branches : []).map((branch: any, branchIndex: number) => (
                                            <div key={branchIndex} className="space-y-3 rounded-lg border bg-background p-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-sm font-bold">Else If {branchIndex + 1}</p>
                                                    <div className="flex items-center gap-2">
                                                        <Select
                                                            value={branch.conditionLogic || "AND"}
                                                            onValueChange={(value) => updateMultiBranch(branchIndex, { conditionLogic: value })}
                                                        >
                                                            <SelectTrigger size="sm" className="w-[170px]"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="AND">Match all</SelectItem>
                                                                <SelectItem value="OR">Match any</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        <Button variant="ghost" size="icon-sm" onClick={() => removeMultiBranch(branchIndex)} aria-label={`Remove else if ${branchIndex + 1}`}>
                                                            <Trash2 className="size-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    {(Array.isArray(branch.conditions) && branch.conditions.length > 0 ? branch.conditions : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }]).map((condition: any, conditionIndex: number) => {
                                                        const valueOptions = fieldOptionsForValue(condition.field);
                                                        const valueDisabled = ['contains_data', 'not_contains_data'].includes(condition.operator || 'equals');
                                                        const branchConditions = Array.isArray(branch.conditions) ? [...branch.conditions] : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }];
                                                        const updateBranchCondition = (patch: Record<string, any>) => {
                                                            branchConditions[conditionIndex] = { ...(branchConditions[conditionIndex] ?? {}), ...patch };
                                                            updateMultiBranch(branchIndex, {
                                                                conditions: branchConditions,
                                                                field: branchConditions[0]?.field,
                                                                operator: branchConditions[0]?.operator,
                                                                value: branchConditions[0]?.value,
                                                            });
                                                        };
                                                        return (
                                                            <div key={conditionIndex} className="grid gap-2 rounded-md border bg-muted/20 p-2 md:grid-cols-[minmax(220px,1.2fr)_150px_minmax(220px,1fr)_auto] md:items-center">
                                                                <Select value={condition.field || ''} onValueChange={(value) => updateBranchCondition({ field: value, value: "" })}>
                                                                    <SelectTrigger><SelectValue placeholder="Field" /></SelectTrigger>
                                                                    <SelectContent>
                                                                        {allConditionFields.map((field) => (
                                                                            <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                                <Select value={condition.operator || 'equals'} onValueChange={(value) => updateBranchCondition({ operator: value })}>
                                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="equals">Is</SelectItem>
                                                                        <SelectItem value="not_equals">Is not</SelectItem>
                                                                        <SelectItem value="in">Is one of</SelectItem>
                                                                        <SelectItem value="not_in">Is not one of</SelectItem>
                                                                        <SelectItem value="contains">Contains</SelectItem>
                                                                        <SelectItem value="contains_data">Has value</SelectItem>
                                                                        <SelectItem value="not_contains_data">No value</SelectItem>
                                                                        <SelectItem value="greater_than">Greater than</SelectItem>
                                                                        <SelectItem value="less_than">Less than</SelectItem>
                                                                        <SelectItem value="before">Before</SelectItem>
                                                                        <SelectItem value="after">After</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                                {valueOptions.length > 0 && !valueDisabled ? (
                                                                    <MultiValueDropdown
                                                                        options={valueOptions}
                                                                        value={condition.value}
                                                                        onChange={(value) => updateBranchCondition({ value })}
                                                                        className="h-10 w-full"
                                                                    />
                                                                ) : (
                                                                    <Input
                                                                        value={valueDisabled ? "" : condition.value || ""}
                                                                        disabled={valueDisabled}
                                                                        placeholder={valueDisabled ? "Not required" : "Value"}
                                                                        onChange={(event) => updateBranchCondition({ value: event.target.value })}
                                                                    />
                                                                )}
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon-sm"
                                                                    onClick={() => {
                                                                        const nextConditions = branchConditions.filter((_, index) => index !== conditionIndex);
                                                                        updateMultiBranch(branchIndex, {
                                                                            conditions: nextConditions,
                                                                            field: nextConditions[0]?.field,
                                                                            operator: nextConditions[0]?.operator,
                                                                            value: nextConditions[0]?.value,
                                                                        });
                                                                    }}
                                                                    disabled={branchConditions.length <= 1}
                                                                    aria-label={`Remove condition ${conditionIndex + 1}`}
                                                                >
                                                                    <Trash2 className="size-4" />
                                                                </Button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        const conditions = Array.isArray(branch.conditions) ? [...branch.conditions] : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }];
                                                        updateMultiBranch(branchIndex, { conditions: conditions.concat({ field: defaultConditionField, operator: "equals", value: [] }) });
                                                    }}
                                                >
                                                    <Plus className="size-4" />
                                                    Add condition
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        )}

                        {['update_field', 'update_lead', 'update_opportunity', 'update_activity'].includes(selectedNode.data?.type) && (
                            <div className="space-y-3 rounded-xl border bg-card p-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-extrabold">Field Updates</p>
                                    <Button variant="outline" size="sm" onClick={addFieldUpdate}>
                                        <Plus className="size-4" />
                                        Add Update
                                    </Button>
                                </div>
                                {(Array.isArray(nodeConfig.updates) && nodeConfig.updates.length > 0 ? nodeConfig.updates : [{ field: '', value: '' }]).map((update: any, index: number) => {
                                    const valueOptions = fieldOptionsForValue(update.field, fieldOptionsForNode);
                                    return (
                                        <div key={index} className="grid gap-2 rounded-lg border bg-muted/20 p-2 md:grid-cols-[1fr_1fr_auto]">
                                            <Select value={update.field || ''} onValueChange={(value) => updateFieldUpdate(index, { field: value, value: "" })}>
                                                <SelectTrigger><SelectValue placeholder="Field" /></SelectTrigger>
                                                <SelectContent>
                                                    {fieldOptionsForNode.map((field) => (
                                                        <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {valueOptions.length > 0 ? (
                                                <Select value={update.value || ''} onValueChange={(value) => updateFieldUpdate(index, { value })}>
                                                    <SelectTrigger><SelectValue placeholder="New value" /></SelectTrigger>
                                                    <SelectContent>
                                                        {valueOptions.map((option: { label: string; value: string }) => (
                                                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <Input value={update.value || ''} placeholder="New value" onChange={(e) => updateFieldUpdate(index, { value: e.target.value })} />
                                            )}
                                            <Button variant="ghost" size="icon-sm" onClick={() => removeFieldUpdate(index)} disabled={(nodeConfig.updates ?? []).length <= 1}>
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {['create_activity', 'add_activity'].includes(selectedNode.data?.type) && (
                            <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Activity Type</Label>
                                    <Select value={nodeConfig.activityTypeId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, activityTypeId: value, typeId: value })}>
                                        <SelectTrigger><SelectValue placeholder="Select activity type" /></SelectTrigger>
                                        <SelectContent>{activityTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Subject</Label>
                                    <Input value={nodeConfig.subject || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, subject: e.target.value })} />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label>Notes</Label>
                                    <Textarea rows={2} value={nodeConfig.notes || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, notes: e.target.value })} />
                                </div>
                            </div>
                        )}

                        {selectedNode.data?.type === 'add_opportunity' && (
                            <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-3">
                                <div className="space-y-2">
                                    <Label>Opportunity Type</Label>
                                    <Select value={nodeConfig.opportunityTypeId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, opportunityTypeId: value })}>
                                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                        <SelectContent>{opportunityTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Title</Label>
                                    <Input value={nodeConfig.title || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, title: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Amount</Label>
                                    <Input type="number" value={nodeConfig.amount || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, amount: e.target.value })} />
                                </div>
                            </div>
                        )}

                        {selectedNode.data?.type === 'create_task' && (
                            <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Task Title</Label>
                                    <Input value={nodeConfig.title || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, title: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Owner</Label>
                                    <Select value={nodeConfig.ownerId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, ownerId: value })}>
                                        <SelectTrigger><SelectValue placeholder="Record owner or select user" /></SelectTrigger>
                                        <SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name || user.email}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Priority</Label>
                                    <Select value={nodeConfig.priority || 'MEDIUM'} onValueChange={(value) => setNodeConfig({ ...nodeConfig, priority: value })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="LOW">Low</SelectItem>
                                            <SelectItem value="MEDIUM">Medium</SelectItem>
                                            <SelectItem value="HIGH">High</SelectItem>
                                            <SelectItem value="URGENT">Urgent</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Due At</Label>
                                    <Input type="datetime-local" value={nodeConfig.dueAt || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, dueAt: e.target.value })} />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label>Description</Label>
                                    <Textarea rows={2} value={nodeConfig.description || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, description: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Reminder At</Label>
                                    <Input type="datetime-local" value={nodeConfig.reminderAt || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, reminderAt: e.target.value })} />
                                </div>
                            </div>
                        )}

                        {['assign_task', 'reschedule_task', 'complete_task'].includes(selectedNode.data?.type) && (
                            <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
                                {selectedNode.data?.type === 'assign_task' && (
                                    <div className="space-y-2">
                                        <Label>Task Owner</Label>
                                        <Select value={nodeConfig.ownerId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, ownerId: value })}>
                                            <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                                            <SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name || user.email}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                )}
                                {selectedNode.data?.type === 'reschedule_task' && (
                                    <>
                                        <div className="space-y-2">
                                            <Label>Due At</Label>
                                            <Input type="datetime-local" value={nodeConfig.dueAt || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, dueAt: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Reminder At</Label>
                                            <Input type="datetime-local" value={nodeConfig.reminderAt || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, reminderAt: e.target.value })} />
                                        </div>
                                    </>
                                )}
                                {selectedNode.data?.type === 'complete_task' && (
                                    <Alert variant="info" className="md:col-span-2">
                                        <Info className="size-4" />
                                        <AlertDescription>This step marks the triggered task as completed and records the automation user as completer.</AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        )}

                        {['delay', 'wait', 'wait_until_activity', 'split_test'].includes(selectedNode.data?.type) && (
                            <div className="space-y-4 rounded-xl border bg-card p-4">
                                {selectedNode.data?.type === 'split_test' ? (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-extrabold">Traffic Split</p>
                                                <p className="text-xs text-muted-foreground">Percentages are evaluated top to bottom.</p>
                                            </div>
                                            <Button variant="outline" size="sm" onClick={addSplitVariant}>
                                                <Plus className="size-4" />
                                                Add Variant
                                            </Button>
                                        </div>
                                        {(Array.isArray(nodeConfig.splits) ? nodeConfig.splits : [{ label: "Variant A", percentage: 50 }, { label: "Variant B", percentage: 50 }]).map((split: any, index: number) => (
                                            <div key={index} className="grid gap-2 rounded-lg border bg-muted/20 p-2 md:grid-cols-[1fr_120px_auto]">
                                                <Input value={split.label || ''} placeholder="Variant label" onChange={(event) => updateSplitVariant(index, { label: event.target.value })} />
                                                <Input type="number" min={0} max={100} value={split.percentage ?? 0} onChange={(event) => updateSplitVariant(index, { percentage: Number(event.target.value || 0) })} />
                                                <Button variant="ghost" size="icon-sm" onClick={() => removeSplitVariant(index)} disabled={(nodeConfig.splits ?? []).length <= 2} aria-label={`Remove variant ${index + 1}`}>
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Resume At</Label>
                                            <Input type="datetime-local" value={nodeConfig.runAt || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, runAt: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Timezone</Label>
                                            <Input value={nodeConfig.timezone || getDisplaySettings().timezone || DEFAULT_WORKSPACE_TIME_ZONE} onChange={(e) => setNodeConfig({ ...nodeConfig, timezone: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Fallback Duration</Label>
                                            <Input type="number" value={nodeConfig.duration || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, duration: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Unit</Label>
                                            <Select value={nodeConfig.unit || 'hours'} onValueChange={(value) => setNodeConfig({ ...nodeConfig, unit: value })}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="minutes">Minutes</SelectItem>
                                                    <SelectItem value="hours">Hours</SelectItem>
                                                    <SelectItem value="days">Days</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Allowed From</Label>
                                            <Input type="time" value={nodeConfig.allowedFrom || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, allowedFrom: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Allowed Until</Label>
                                            <Input type="time" value={nodeConfig.allowedUntil || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, allowedUntil: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Max Wait Minutes</Label>
                                            <Input type="number" min={0} value={nodeConfig.maxWaitMinutes || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, maxWaitMinutes: e.target.value })} />
                                        </div>
                                        {selectedNode.data?.type === 'wait_until_activity' ? (
                                            <>
                                                <div className="space-y-2">
                                                    <Label>Timeout Duration</Label>
                                                    <Input type="number" value={nodeConfig.timeoutDuration || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, timeoutDuration: e.target.value })} />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Timeout Action</Label>
                                                    <Select value={nodeConfig.timeoutAction || 'continue'} onValueChange={(value) => setNodeConfig({ ...nodeConfig, timeoutAction: value })}>
                                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="continue">Continue</SelectItem>
                                                            <SelectItem value="exit">Exit</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        )}

                        {selectedNode.data?.type === 'assign_owner' && (
                            <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Record</Label>
                                    <Select value={nodeConfig.target || 'current'} onValueChange={(value) => setNodeConfig({ ...nodeConfig, target: value })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="current">Current record</SelectItem>
                                            <SelectItem value="lead">Lead</SelectItem>
                                            <SelectItem value="opportunity">Opportunity</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Owner</Label>
                                    <Select value={nodeConfig.ownerId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, ownerId: value })}>
                                        <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                                        <SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name || user.email}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}

                        {selectedNode.data?.type === 'change_stage' && (
                            <div className="space-y-2 rounded-xl border bg-card p-4">
                                <Label>Stage</Label>
                                <Select value={nodeConfig.stageId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, stageId: value })}>
                                    <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                                    <SelectContent>{stageOptions.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.typeName}: {stage.name}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        )}

                        {['add_to_list', 'remove_from_list'].includes(selectedNode.data?.type) && (
                            <div className="space-y-2 rounded-xl border bg-card p-4">
                                <Label>Lead List</Label>
                                <Select value={nodeConfig.listId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, listId: value })}>
                                    <SelectTrigger><SelectValue placeholder="Select list" /></SelectTrigger>
                                    <SelectContent>{leadLists.filter((list) => list.type === 'STATIC').map((list) => <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        )}

                        {['tag_lead', 'remove_tag', 'star_lead', 'increment_score', 'stop'].includes(selectedNode.data?.type) && (
                            <div className="space-y-2 rounded-xl border bg-card p-4">
                                <Label>{selectedNode.data?.type === 'increment_score' ? 'Score Change' : selectedNode.data?.type === 'stop' ? 'Reason' : 'Value'}</Label>
                                <Input
                                    type={selectedNode.data?.type === 'increment_score' ? 'number' : 'text'}
                                    value={selectedNode.data?.type === 'stop' ? nodeConfig.reason || '' : nodeConfig.value || ''}
                                    onChange={(e) => setNodeConfig(selectedNode.data?.type === 'stop' ? { ...nodeConfig, reason: e.target.value } : { ...nodeConfig, value: e.target.value })}
                                />
                            </div>
                        )}

                        {selectedNode.data?.type === 'clear_field' && (
                            <div className="space-y-2 rounded-xl border bg-card p-4">
                                <Label>Field to Clear</Label>
                                <Select value={nodeConfig.field || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, field: value })}>
                                    <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                                    <SelectContent>{fieldOptionsForNode.map((field) => <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        )}

                        {['send_email', 'notify_user', 'webhook'].includes(selectedNode.data?.type) && (
                            <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
                                {selectedNode.data?.type === 'send_email' ? (
                                    <div className="space-y-2">
                                        <Label>Channel</Label>
                                        <Select value={nodeConfig.channel || 'EMAIL'} onValueChange={(value) => setNodeConfig({ ...nodeConfig, channel: value })}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="EMAIL">Email</SelectItem>
                                                <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                                                <SelectItem value="SMS">SMS</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                ) : null}
                                {selectedNode.data?.type === 'notify_user' ? (
                                    <div className="space-y-2">
                                        <Label>User</Label>
                                        <Select value={nodeConfig.userId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, userId: value })}>
                                            <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                                            <SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name || user.email}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                ) : null}
                                {selectedNode.data?.type === 'webhook' ? (
                                    <>
                                        <div className="space-y-2">
                                            <Label>URL</Label>
                                            <Input value={nodeConfig.url || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, url: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Method</Label>
                                            <Select value={nodeConfig.method || 'POST'} onValueChange={(value) => setNodeConfig({ ...nodeConfig, method: value })}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="GET">GET</SelectItem>
                                                    <SelectItem value="POST">POST</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="space-y-2">
                                            <Label>{selectedNode.data?.type === 'send_email' ? 'To' : 'Title'}</Label>
                                            <Input value={selectedNode.data?.type === 'send_email' ? nodeConfig.to || '' : nodeConfig.title || ''} onChange={(e) => setNodeConfig(selectedNode.data?.type === 'send_email' ? { ...nodeConfig, to: e.target.value } : { ...nodeConfig, title: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Subject</Label>
                                            <Input value={nodeConfig.subject || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, subject: e.target.value })} />
                                        </div>
                                    </>
                                )}
                                <div className="space-y-2 md:col-span-2">
                                    <Label>{selectedNode.data?.type === 'webhook' ? 'Body (JSON)' : 'Message'}</Label>
                                    <Textarea rows={3} value={selectedNode.data?.type === 'webhook' ? nodeConfig.body || '' : nodeConfig.message || nodeConfig.body || ''} onChange={(e) => setNodeConfig(selectedNode.data?.type === 'webhook' ? { ...nodeConfig, body: e.target.value } : { ...nodeConfig, message: e.target.value, body: e.target.value })} />
                                </div>
                            </div>
                        )}

                        {['calculate_commission', 'award_points', 'evaluate_badges', 'distribute_lead', 'distribute_opportunity'].includes(selectedNode.data?.type) && (
                            <Alert variant="info">
                                <Info className="size-4" />
                                <AlertDescription>
                                    This step uses the matching module configuration when it runs. No extra fields are required on the node.
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>
                ) : null}
            </StandardDialog>
            <StandardDialog
                open={Boolean(addAfterNodeId)}
                onClose={() => setAddAfterNodeId(null)}
                title="Add automation step"
                maxWidth="xs"
            >
                <div className="space-y-1 py-1">
                    <div className="mb-2 rounded-md bg-muted/40 px-3 py-2">
                        <p className="text-xs font-bold text-foreground">Available for {triggerScopeLabel}</p>
                        <p className="text-[11px] leading-4 text-muted-foreground">Only steps that can run with this trigger context are shown.</p>
                    </div>
                    {clonedNodeData && (
                        <button
                            type="button"
                            onClick={() => pasteClonedNode(addAfterNodeId)}
                            className="flex w-full items-center gap-3 rounded-md bg-primary/[0.06] px-2 py-2 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <ClipboardPaste className="size-5 text-primary" />
                            <span className="text-sm font-extrabold">Paste {clonedNodeData.label || 'cloned step'}</span>
                        </button>
                    )}
                    {availableNodeTypes.filter((nodeType) => nodeType.type !== "trigger").map((nodeType) => {
                        const Icon = nodeType.icon;
                        return (
                            <button
                                key={nodeType.type}
                                type="button"
                                onClick={() => addNode(nodeType.type, addAfterNodeId)}
                                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <Icon className="size-5" style={{ color: nodeType.color }} />
                                <span className="text-sm font-semibold">{nodeType.label}</span>
                            </button>
                        );
                    })}
                </div>
            </StandardDialog>
        </motion.div>
    );
}

// Wrap with ReactFlowProvider
export default function AutomationBuilderPage() {
    return (
        <ReactFlowProvider>
            <AutomationBuilderContent />
        </ReactFlowProvider>
    );
}
