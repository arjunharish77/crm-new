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
    useReactFlow,
    ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import { ExpressiveNode } from '@/components/automation/expressive-node';
import { FeatureGate } from '@/components/auth/feature-gate';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeInUp, spring } from '@/lib/motion';
import {
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
    Typography,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Switch,
    FormControlLabel,
    Drawer,
    AppBar,
    Toolbar,
    IconButton,
    Paper,
    Divider,
    Stack,
    List,
    Dialog,
    DialogTitle,
    DialogContent,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    CircularProgress,
    useTheme,
    alpha,
    Tab,
    Tabs,
    Chip,
} from '@mui/material';
import { ExecutionLogViewer } from '@/components/automation/execution-log-viewer';
import { formatWorkspaceDateTime } from '@/lib/date-format';
import {
    ArrowBack as ArrowLeftIcon,
    Save as SaveIcon,
    PlayArrow as PlayIcon,
    FlashOn as ZapIcon,
    CallSplit as GitBranchIcon,
    AccessTime as ClockIcon,
    Email as MailIcon,
    Storage as DatabaseIcon,
    Webhook as WebhookIcon,
    Science as TestIcon,
    Close as CloseIcon,
    Person as PersonIcon,
    RemoveCircleOutline as RemoveIcon,
    StopCircle as StopIcon,
    Notifications as NotificationIcon,
    Add as AddIcon,
    DeleteOutline as DeleteIcon,
    ContentPaste as PasteIcon
} from '@mui/icons-material';
import { TestWorkflowDialog } from '@/components/automation/TestWorkflowDialog';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { AutomationV2 } from '@/types/automation-v2';

// Node types palette
const NODE_TYPES = [
    { type: 'trigger', label: 'Trigger', icon: ZapIcon, color: '#2196f3' },
    { type: 'condition', label: 'If/Else', icon: GitBranchIcon, color: '#ff9800' },
    { type: 'multi_if_else', label: 'Multi If/Else', icon: GitBranchIcon, color: '#fb8c00' },
    { type: 'compare', label: 'Compare', icon: GitBranchIcon, color: '#f57c00' },
    { type: 'wait', label: 'Wait', icon: ClockIcon, color: '#607d8b' },
    { type: 'wait_until_activity', label: 'Wait Until Activity', icon: ClockIcon, color: '#546e7a' },
    { type: 'split_test', label: 'Split Test', icon: GitBranchIcon, color: '#7b1fa2' },
    { type: 'update_lead', label: 'Update Lead', icon: DatabaseIcon, color: '#4caf50' },
    { type: 'update_opportunity', label: 'Update Opportunity', icon: DatabaseIcon, color: '#4caf50' },
    { type: 'update_activity', label: 'Update Activity', icon: DatabaseIcon, color: '#43a047' },
    { type: 'add_activity', label: 'Add Activity', icon: PlayIcon, color: '#9c27b0' },
    { type: 'add_opportunity', label: 'Add Opportunity', icon: PlayIcon, color: '#8e24aa' },
    { type: 'distribute_lead', label: 'Distribute Lead', icon: GitBranchIcon, color: '#0288d1' },
    { type: 'distribute_opportunity', label: 'Distribute Opportunity', icon: GitBranchIcon, color: '#0288d1' },
    { type: 'assign_owner', label: 'Assign Owner', icon: PersonIcon, color: '#5c6bc0' },
    { type: 'change_stage', label: 'Change Stage', icon: DatabaseIcon, color: '#43a047' },
    { type: 'tag_lead', label: 'Tag Lead', icon: DatabaseIcon, color: '#00897b' },
    { type: 'remove_tag', label: 'Remove Tag', icon: RemoveIcon, color: '#00897b' },
    { type: 'add_to_list', label: 'Add to List', icon: DatabaseIcon, color: '#00695c' },
    { type: 'remove_from_list', label: 'Remove from List', icon: RemoveIcon, color: '#00695c' },
    { type: 'star_lead', label: 'Star Lead', icon: DatabaseIcon, color: '#f9a825' },
    { type: 'increment_score', label: 'Change Lead Score', icon: DatabaseIcon, color: '#7cb342' },
    { type: 'clear_field', label: 'Clear Field', icon: RemoveIcon, color: '#78909c' },
    { type: 'notify_user', label: 'Notify User', icon: NotificationIcon, color: '#ff7043' },
    { type: 'stop', label: 'Stop Automation', icon: StopIcon, color: '#d32f2f' },
    { type: 'send_email', label: 'Send Email / Notify', icon: MailIcon, color: '#ff5722' },
    { type: 'webhook', label: 'Webhook', icon: WebhookIcon, color: '#e91e63' },
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
];

const OPPORTUNITY_FIELDS = [
    { key: "title", label: "Title" },
    { key: "amount", label: "Amount", type: "NUMBER" },
    { key: "expectedCloseDate", label: "Expected Close Date", type: "DATE" },
    { key: "priority", label: "Priority", type: "SELECT", options: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
    { key: "stageId", label: "Stage", type: "SELECT" },
    { key: "ownerId", label: "Owner" },
];

const ACTIVITY_FIELDS = [
    { key: "typeId", label: "Activity Type", type: "SELECT" },
    { key: "outcome", label: "Outcome", type: "SELECT", options: ["SUCCESS", "FOLLOW_UP_NEEDED", "NO_ANSWER", "VOICEMAIL", "NOT_INTERESTED"] },
    { key: "notes", label: "Notes" },
    { key: "dueAt", label: "Due Date", type: "DATE" },
    { key: "completedAt", label: "Completed At", type: "DATE" },
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

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

const nodeTypes = {
    expressive: ExpressiveNode,
};

function AutomationBuilderContent() {
    const router = useRouter();
    const params = useParams();
    const automationId = params?.id as string;
    const isNew = automationId === 'new';
    const theme = useTheme();

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [showTestDialog, setShowTestDialog] = useState(false);
    const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
    const [addAfterNodeId, setAddAfterNodeId] = useState<string | null>(null);
    const [clonedNodeData, setClonedNodeData] = useState<Record<string, any> | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [triggerType, setTriggerType] = useState('LEAD_CREATED');
    const [tabValue, setTabValue] = useState(0); // 0: Designer, 1: History
    const [executions, setExecutions] = useState<any[]>([]);
    const [activityTypes, setActivityTypes] = useState<any[]>([]);
    const [opportunityTypes, setOpportunityTypes] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [leadLists, setLeadLists] = useState<any[]>([]);
    const [triggerOpportunityTypeId, setTriggerOpportunityTypeId] = useState("");
    const [triggerActivityTypeId, setTriggerActivityTypeId] = useState("");
    const [triggerOpportunityCustomFields, setTriggerOpportunityCustomFields] = useState<any[]>([]);
    const [triggerActivityCustomFields, setTriggerActivityCustomFields] = useState<any[]>([]);

    // Node configuration
    const [nodeConfig, setNodeConfig] = useState<Record<string, any>>({});

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

            // Load workflow
            if (data.workflow?.nodes) {
                setNodes(data.workflow.nodes.map((node) => ({ ...node, data: { ...node.data, nodeId: node.id } })));
            }
            if (data.workflow?.edges) {
                setEdges(data.workflow.edges);
            }
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
        const nodeTypeInfo = NODE_TYPES.find((nt) => nt.type === type);
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
                    ? branchCount === 0 ? "If 1" : branchCount === 1 ? "Else If 1" : branchCount === 2 ? "Else" : `Else If ${branchCount}`
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
            addBranchNodes(newNode, ["If 1", "Else If 1", "Else"]);
        }
        setAddAfterNodeId(null);
    };

    const addBranchNodes = (parentNode: Node, labels: string[]) => {
        const branchNodes = labels.map((label, index) => ({
            id: `${parentNode.id}-${label.toLowerCase().replace(/\s+/g, "-")}`,
            type: "expressive",
            position: {
                x: parentNode.position.x + (index - (labels.length - 1) / 2) * 220,
                y: parentNode.position.y + 140,
            },
            data: {
                type: "branch",
                label,
                nodeId: `${parentNode.id}-${label.toLowerCase().replace(/\s+/g, "-")}`,
            },
        }));
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

    const updateNodeConfig = () => {
        if (!selectedNode) return;
        const normalizedConfig: Record<string, any> = {
            ...nodeConfig,
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
            const labels = ["If 1", ...Array.from({ length: branchCount }, (_, index) => `Else If ${index + 1}`), "Else"];
            const existingLabels = new Set(edges.filter((edge) => edge.source === selectedNode.id).map((edge) => String(edge.label ?? "")));
            const missingLabels = labels.filter((label) => !existingLabels.has(label));
            if (missingLabels.length > 0) {
                addBranchNodes(selectedNode, missingLabels);
            }
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
            branches: branches.concat({ field: "lead.source", operator: "equals", value: "" }),
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
        setNodeConfig({ ...nodeConfig, [key]: conditions.concat({ field: "lead.source", operator: "equals", value: "" }) });
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

    const stageOptions = opportunityTypes.flatMap((type) =>
        (type.stages ?? []).map((stage: any) => ({
            ...stage,
            typeName: type.name,
        }))
    );

    const triggerScope = TRIGGER_TYPES.find((item) => item.value === triggerType)?.scope ?? "lead";
    const selectedOpportunityType = opportunityTypes.find((type) => type.id === triggerOpportunityTypeId);
    const opportunityStageOptions = (selectedOpportunityType?.stages ?? []).map((stage: any) => stage.name);
    const selectedActivityType = activityTypes.find((type) => type.id === triggerActivityTypeId);

    const customFieldToOption = (field: any, prefix: string) => ({
        key: `${prefix}.${field.fieldKey}`,
        label: `${prefix === "opportunity" ? "Opportunity" : "Activity"}: ${field.fieldLabel}`,
        type: field.fieldType || "TEXT",
        options: field.fieldConfig?.options,
    });

    const leadConditionFields = LEAD_FIELDS.map((field) => ({ ...field, key: `lead.${field.key}`, label: `Lead: ${field.label}` }));
    const opportunityConditionFields = [
        ...OPPORTUNITY_FIELDS.map((field) => ({
            ...field,
            key: `opportunity.${field.key}`,
            label: `Opportunity: ${field.label}`,
            options: field.key === "stageId" ? opportunityStageOptions : field.options,
        })),
        ...triggerOpportunityCustomFields.filter((field) => field.isActive !== false).map((field) => customFieldToOption(field, "opportunity")),
    ];
    const activityConditionFields = [
        ...ACTIVITY_FIELDS.map((field) => ({
            ...field,
            key: `activity.${field.key}`,
            label: `Activity: ${field.label}`,
            options: field.key === "typeId" ? activityTypes.map((type) => type.name) : field.options,
        })),
        ...triggerActivityCustomFields.filter((field) => field.isActive !== false).map((field) => customFieldToOption(field, "activity")),
    ];

    const isOpportunityScopedTrigger = triggerScope === "opportunity" || triggerScope === "activity_opportunity" || triggerScope === "task_opportunity";
    const isActivityScopedTrigger = triggerScope === "activity_lead" || triggerScope === "activity_opportunity" || triggerScope === "activity_activity";
    const allConditionFields = triggerScope === "opportunity" || triggerScope === "task_opportunity"
        ? [...leadConditionFields, ...opportunityConditionFields]
        : triggerScope === "activity_opportunity"
            ? [...activityConditionFields, ...opportunityConditionFields, ...leadConditionFields]
            : triggerScope === "activity_lead" || triggerScope === "activity_activity"
                ? [...activityConditionFields, ...leadConditionFields]
            : leadConditionFields;

    const fieldMetaForValue = (fieldKey: string, source = allConditionFields) => source.find((field) => field.key === fieldKey || field.key.replace(/^(lead|opportunity|activity)\./, "") === fieldKey);
    const fieldOptionsForValue = (fieldKey: string, source = allConditionFields) => fieldMetaForValue(fieldKey, source)?.options ?? [];

    const fieldOptionsForNode = selectedNode?.data?.type === "update_opportunity"
        ? opportunityConditionFields.map((field) => ({ ...field, key: field.key.replace(/^opportunity\./, "") }))
        : selectedNode?.data?.type === "update_activity"
            ? activityConditionFields.map((field) => ({ ...field, key: field.key.replace(/^activity\./, "") }))
            : selectedNode?.data?.type === "condition" || selectedNode?.data?.type === "compare" || selectedNode?.data?.type === "multi_if_else"
                ? allConditionFields
                : LEAD_FIELDS;

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box
            component={motion.div}
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}
        >
            {/* Header */}
            <AppBar position="static" color="default" elevation={1} sx={{ bgcolor: 'background.paper' }}>
                <Toolbar>
                    <IconButton edge="start" onClick={() => router.push('/dashboard/automations-v2')} sx={{ mr: 2 }}>
                        <ArrowLeftIcon />
                    </IconButton>
                    <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: -0.5 }}>
                            {isNew ? 'New Automation' : 'Edit Workflow'}
                        </Typography>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                                {name || 'Untitled Automation'}
                            </Typography>
                            <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'text.disabled' }} />
                            <Typography variant="caption" color="text.secondary">
                                Designer View
                            </Typography>
                        </Stack>
                    </Box>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <FormControlLabel
                            control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
                            label={isActive ? "Active" : "Inactive"}
                        />
                        {!isNew && (
                            <Button
                                variant="outlined"
                                startIcon={<TestIcon />}
                                onClick={() => setShowTestDialog(true)}
                                size="small"
                                sx={{ textTransform: 'none', px: 3 }}
                            >
                                Test
                            </Button>
                        )}
                        <Button
                            variant="contained"
                            startIcon={<SaveIcon />}
                            onClick={handleSave}
                            disabled={saving}
                            size="small"
                            sx={{ textTransform: 'none', px: 3 }}
                        >
                            {saving ? 'Saving...' : 'Save'}
                        </Button>
                    </Stack>
                </Toolbar>
            </AppBar>

            <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Sidebar - Node Palette & Config */}
                <Paper
                    elevation={0}
                    sx={{
                        width: 320,
                        display: 'flex',
                        flexDirection: 'column',
                        zIndex: 10,
                        borderRight: 1,
                        borderColor: 'divider',
                        bgcolor: alpha(theme.palette.background.paper, 0.7),
                        backdropFilter: 'blur(16px)'
                    }}
                >
                    <Tabs
                        value={tabValue}
                        onChange={(_, v) => setTabValue(v)}
                        variant="fullWidth"
                        sx={{ borderBottom: 1, borderColor: 'divider' }}
                    >
                        <Tab label="Designer" sx={{ fontSize: '0.75rem', fontWeight: 700, minHeight: 48 }} />
                        <Tab label="History" sx={{ fontSize: '0.75rem', fontWeight: 700, minHeight: 48 }} />
                    </Tabs>

                    {tabValue === 0 ? (
                        <Box sx={{ p: 3, overflowY: 'auto', flex: 1 }}>
                            {/* Basic Info */}
                            <Box sx={{ mb: 2 }}>
                                <Typography variant="overline" sx={{ px: 1, fontWeight: 700, color: 'text.secondary', letterSpacing: 1.2 }}>
                                    Details
                                </Typography>
                                <Stack spacing={2} sx={{ mt: 1 }}>
                                    <TextField
                                        label="Name"
                                        fullWidth
                                        size="small"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                                    />
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Trigger</InputLabel>
                                        <Select
                                            value={triggerType}
                                            label="Trigger"
                                            onChange={(e) => setTriggerType(e.target.value)}
                                            sx={{ borderRadius: '12px' }}
                                        >
                                            {TRIGGER_TYPES.map((trigger) => (
                                                <MenuItem key={trigger.value} value={trigger.value}>{trigger.label}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    {isOpportunityScopedTrigger && (
                                        <FormControl fullWidth size="small">
                                            <InputLabel>Opportunity Type</InputLabel>
                                            <Select value={triggerOpportunityTypeId} label="Opportunity Type" onChange={(e) => setTriggerOpportunityTypeId(String(e.target.value))}>
                                                {opportunityTypes.map((type) => (
                                                    <MenuItem key={type.id} value={type.id}>{type.name}</MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    )}
                                    {isActivityScopedTrigger && (
                                        <>
                                            <FormControl fullWidth size="small">
                                                <InputLabel>Activity Type</InputLabel>
                                                <Select value={triggerActivityTypeId} label="Activity Type" onChange={(e) => setTriggerActivityTypeId(String(e.target.value))}>
                                                    {activityTypes.map((type) => (
                                                        <MenuItem key={type.id} value={type.id}>{type.name}</MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        </>
                                    )}
                                </Stack>
                            </Box>

                            {/* Node Add Guidance */}
                            <Box sx={{ mb: 2 }}>
                                <Typography variant="overline" sx={{ px: 1, fontWeight: 700, color: 'text.secondary', letterSpacing: 1.2 }}>
                                    Add Steps
                                </Typography>
                                <Paper variant="outlined" sx={{ p: 2, mt: 1, borderRadius: 2 }}>
                                    <Typography variant="body2" color="text.secondary">
                                        Click the + button on any node to add the next step. Click the trigger + to start a branch; click + repeatedly to create parallel branches from the same node.
                                    </Typography>
                                    {nodes.length === 0 && (
                                        <Button sx={{ mt: 2 }} variant="contained" onClick={() => addNode("trigger")}>
                                            Add trigger
                                        </Button>
                                    )}
                                </Paper>
                            </Box>

                            {/* Node Configuration */}
                            {selectedNode && (
                                <Paper
                                    elevation={0}
                                    sx={{
                                        mb: 2,
                                        borderRadius: '24px',
                                        bgcolor: alpha(theme.palette.primary.main, 0.05),
                                        border: `2px solid ${theme.palette.primary.main}`,
                                        p: 2
                                    }}
                                >
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                        <Box>
                                            <Typography variant="overline" sx={{ fontWeight: 800, color: 'primary.main', letterSpacing: 1.5 }}>
                                                Step Configuration
                                            </Typography>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                                {selectedNode.data?.label}
                                            </Typography>
                                        </Box>
                                        <IconButton size="small" onClick={() => setSelectedNode(null)} sx={{ bgcolor: 'background.paper' }}>
                                            <CloseIcon fontSize="small" />
                                        </IconButton>
                                    </Box>
                                    <Stack spacing={2}>
                                        {selectedNode.data?.type === 'trigger' && (
                                            <FormControl fullWidth size="small">
                                                <InputLabel>Trigger Event</InputLabel>
                                                <Select
                                                    value={nodeConfig.triggerType || triggerType}
                                                    label="Trigger Event"
                                                    onChange={(e) => setNodeConfig({ ...nodeConfig, triggerType: e.target.value })}
                                                >
                                                    {TRIGGER_TYPES.map((trigger) => (
                                                        <MenuItem key={trigger.value} value={trigger.value}>{trigger.label}</MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        )}

                                        {['condition', 'multi_if_else', 'compare'].includes(selectedNode.data?.type) && (
                                            <>
                                                <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
                                                    <Stack spacing={1.25}>
                                                        <Stack direction="row" alignItems="center" justifyContent="space-between">
                                                            <Typography variant="caption" fontWeight={800} color="text.secondary">
                                                                {selectedNode.data?.type === 'multi_if_else' ? 'If 1 conditions' : 'Conditions'}
                                                            </Typography>
                                                            <Button size="small" startIcon={<AddIcon />} onClick={() => addCondition()}>
                                                                Add
                                                            </Button>
                                                        </Stack>
                                                        <FormControl fullWidth size="small">
                                                            <InputLabel>Match</InputLabel>
                                                            <Select
                                                                value={nodeConfig.conditionLogic || 'AND'}
                                                                label="Match"
                                                                onChange={(e) => setNodeConfig({ ...nodeConfig, conditionLogic: e.target.value })}
                                                            >
                                                                <MenuItem value="AND">All conditions</MenuItem>
                                                                <MenuItem value="OR">Any condition</MenuItem>
                                                            </Select>
                                                        </FormControl>
                                                        {(Array.isArray(nodeConfig.conditions) && nodeConfig.conditions.length > 0 ? nodeConfig.conditions : [{ field: '', operator: 'equals', value: '' }]).map((condition: any, index: number) => (
                                                            <Paper key={index} variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}>
                                                                <Stack spacing={1}>
                                                                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                                                                        <Typography variant="caption" fontWeight={700}>
                                                                            Condition {index + 1}
                                                                        </Typography>
                                                                        <IconButton size="small" onClick={() => removeCondition(index)} disabled={(nodeConfig.conditions ?? []).length <= 1}>
                                                                            <DeleteIcon fontSize="small" />
                                                                        </IconButton>
                                                                    </Stack>
                                                                    <FormControl fullWidth size="small">
                                                                        <InputLabel>Field</InputLabel>
                                                                        <Select value={condition.field || ''} label="Field" onChange={(e) => updateCondition(index, { field: e.target.value })}>
                                                                            {allConditionFields.map((field) => (
                                                                                <MenuItem key={field.key} value={field.key}>{field.label}</MenuItem>
                                                                            ))}
                                                                        </Select>
                                                                    </FormControl>
                                                                    <FormControl fullWidth size="small">
                                                                        <InputLabel>Operator</InputLabel>
                                                                        <Select value={condition.operator || 'equals'} label="Operator" onChange={(e) => updateCondition(index, { operator: e.target.value })}>
                                                                            {fieldOptionsForValue(condition.field).length > 0 ? (
                                                                                [
                                                                                    <MenuItem key="equals" value="equals">Is</MenuItem>,
                                                                                    <MenuItem key="not_equals" value="not_equals">Is Not</MenuItem>,
                                                                                ]
                                                                            ) : (
                                                                                [
                                                                                    <MenuItem key="equals" value="equals">Equals</MenuItem>,
                                                                                    <MenuItem key="not_equals" value="not_equals">Not Equals</MenuItem>,
                                                                                ]
                                                                            )}
                                                                            <MenuItem value="contains">Contains</MenuItem>
                                                                            <MenuItem value="contains_data">Contains Data</MenuItem>
                                                                            <MenuItem value="not_contains_data">Does Not Contain Data</MenuItem>
                                                                            <MenuItem value="greater_than">Greater Than</MenuItem>
                                                                            <MenuItem value="less_than">Less Than</MenuItem>
                                                                            <MenuItem value="before">Before</MenuItem>
                                                                            <MenuItem value="after">After</MenuItem>
                                                                        </Select>
                                                                    </FormControl>
                                                                    {!['contains_data', 'not_contains_data'].includes(condition.operator || 'equals') && (
                                                                        fieldOptionsForValue(condition.field).length > 0 ? (
                                                                            <FormControl fullWidth size="small">
                                                                                <InputLabel>Value</InputLabel>
                                                                                <Select value={condition.value || ''} label="Value" onChange={(e) => updateCondition(index, { value: e.target.value })}>
                                                                                    {fieldOptionsForValue(condition.field).map((option: string) => (
                                                                                        <MenuItem key={option} value={option}>{option}</MenuItem>
                                                                                    ))}
                                                                                </Select>
                                                                            </FormControl>
                                                                        ) : (
                                                                            <TextField label="Value" fullWidth size="small" value={condition.value || ''} onChange={(e) => updateCondition(index, { value: e.target.value })} />
                                                                        )
                                                                    )}
                                                                </Stack>
                                                            </Paper>
                                                        ))}
                                                    </Stack>
                                                </Paper>
                                                {selectedNode.data?.type === 'multi_if_else' && (
                                                    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
                                                        <Stack spacing={1.25}>
                                                            <Stack direction="row" alignItems="center" justifyContent="space-between">
                                                                <Typography variant="caption" fontWeight={800} color="text.secondary">
                                                                    Else-if branches
                                                                </Typography>
                                                                <Button size="small" startIcon={<AddIcon />} onClick={addMultiBranch}>
                                                                    Add
                                                                </Button>
                                                            </Stack>
                                                            {(Array.isArray(nodeConfig.branches) ? nodeConfig.branches : []).map((branch: any, index: number) => (
                                                                <Paper key={index} variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}>
                                                                    <Stack spacing={1}>
                                                                        <Stack direction="row" alignItems="center" justifyContent="space-between">
                                                                            <Typography variant="caption" fontWeight={700}>
                                                                                Else If {index + 1}
                                                                            </Typography>
                                                                            <IconButton size="small" onClick={() => removeMultiBranch(index)}>
                                                                                <DeleteIcon fontSize="small" />
                                                                            </IconButton>
                                                                        </Stack>
                                                                        <FormControl fullWidth size="small">
                                                                            <InputLabel>Match</InputLabel>
                                                                            <Select
                                                                                value={branch.conditionLogic || 'AND'}
                                                                                label="Match"
                                                                                onChange={(e) => updateMultiBranch(index, { conditionLogic: e.target.value })}
                                                                            >
                                                                                <MenuItem value="AND">All conditions</MenuItem>
                                                                                <MenuItem value="OR">Any condition</MenuItem>
                                                                            </Select>
                                                                        </FormControl>
                                                                        {(Array.isArray(branch.conditions) && branch.conditions.length > 0 ? branch.conditions : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }]).map((condition: any, conditionIndex: number) => (
                                                                            <Paper key={conditionIndex} variant="outlined" sx={{ p: 1, borderRadius: 1 }}>
                                                                                <Stack spacing={1}>
                                                                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                                                        <Typography variant="caption" fontWeight={700}>Condition {conditionIndex + 1}</Typography>
                                                                                        <IconButton
                                                                                            size="small"
                                                                                            onClick={() => {
                                                                                                const conditions = Array.isArray(branch.conditions) ? [...branch.conditions] : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }];
                                                                                                conditions.splice(conditionIndex, 1);
                                                                                                updateMultiBranch(index, { conditions });
                                                                                            }}
                                                                                            disabled={(branch.conditions ?? []).length <= 1}
                                                                                        >
                                                                                            <DeleteIcon fontSize="small" />
                                                                                        </IconButton>
                                                                                    </Stack>
                                                                                    <FormControl fullWidth size="small">
                                                                                        <InputLabel>Field</InputLabel>
                                                                                        <Select
                                                                                            value={condition.field || ''}
                                                                                            label="Field"
                                                                                            onChange={(e) => {
                                                                                                const conditions = Array.isArray(branch.conditions) ? [...branch.conditions] : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }];
                                                                                                conditions[conditionIndex] = { ...(conditions[conditionIndex] ?? {}), field: e.target.value };
                                                                                                updateMultiBranch(index, { conditions, field: conditions[0]?.field, operator: conditions[0]?.operator, value: conditions[0]?.value });
                                                                                            }}
                                                                                        >
                                                                                            {allConditionFields.map((field) => (
                                                                                                <MenuItem key={field.key} value={field.key}>{field.label}</MenuItem>
                                                                                            ))}
                                                                                        </Select>
                                                                                    </FormControl>
                                                                                    <FormControl fullWidth size="small">
                                                                                        <InputLabel>Operator</InputLabel>
                                                                                        <Select
                                                                                            value={condition.operator || 'equals'}
                                                                                            label="Operator"
                                                                                            onChange={(e) => {
                                                                                                const conditions = Array.isArray(branch.conditions) ? [...branch.conditions] : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }];
                                                                                                conditions[conditionIndex] = { ...(conditions[conditionIndex] ?? {}), operator: e.target.value };
                                                                                                updateMultiBranch(index, { conditions, field: conditions[0]?.field, operator: conditions[0]?.operator, value: conditions[0]?.value });
                                                                                            }}
                                                                                        >
                                                                                            {fieldOptionsForValue(condition.field).length > 0 ? (
                                                                                                [
                                                                                                    <MenuItem key="equals" value="equals">Is</MenuItem>,
                                                                                                    <MenuItem key="not_equals" value="not_equals">Is Not</MenuItem>,
                                                                                                ]
                                                                                            ) : (
                                                                                                [
                                                                                                    <MenuItem key="equals" value="equals">Equals</MenuItem>,
                                                                                                    <MenuItem key="not_equals" value="not_equals">Not Equals</MenuItem>,
                                                                                                ]
                                                                                            )}
                                                                                            <MenuItem value="contains">Contains</MenuItem>
                                                                                            <MenuItem value="contains_data">Contains Data</MenuItem>
                                                                                            <MenuItem value="not_contains_data">Does Not Contain Data</MenuItem>
                                                                                            <MenuItem value="greater_than">Greater Than</MenuItem>
                                                                                            <MenuItem value="less_than">Less Than</MenuItem>
                                                                                            <MenuItem value="before">Before</MenuItem>
                                                                                            <MenuItem value="after">After</MenuItem>
                                                                                        </Select>
                                                                                    </FormControl>
                                                                                    {!['contains_data', 'not_contains_data'].includes(condition.operator || 'equals') && (
                                                                                        fieldOptionsForValue(condition.field).length > 0 ? (
                                                                                            <FormControl fullWidth size="small">
                                                                                                <InputLabel>Value</InputLabel>
                                                                                                <Select
                                                                                                    value={condition.value || ''}
                                                                                                    label="Value"
                                                                                                    onChange={(e) => {
                                                                                                        const conditions = Array.isArray(branch.conditions) ? [...branch.conditions] : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }];
                                                                                                        conditions[conditionIndex] = { ...(conditions[conditionIndex] ?? {}), value: e.target.value };
                                                                                                        updateMultiBranch(index, { conditions, field: conditions[0]?.field, operator: conditions[0]?.operator, value: conditions[0]?.value });
                                                                                                    }}
                                                                                                >
                                                                                                    {fieldOptionsForValue(condition.field).map((option: string) => (
                                                                                                        <MenuItem key={option} value={option}>{option}</MenuItem>
                                                                                                    ))}
                                                                                                </Select>
                                                                                            </FormControl>
                                                                                        ) : (
                                                                                            <TextField
                                                                                                label="Value"
                                                                                                fullWidth
                                                                                                size="small"
                                                                                                value={condition.value || ''}
                                                                                                onChange={(e) => {
                                                                                                    const conditions = Array.isArray(branch.conditions) ? [...branch.conditions] : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }];
                                                                                                    conditions[conditionIndex] = { ...(conditions[conditionIndex] ?? {}), value: e.target.value };
                                                                                                    updateMultiBranch(index, { conditions, field: conditions[0]?.field, operator: conditions[0]?.operator, value: conditions[0]?.value });
                                                                                                }}
                                                                                            />
                                                                                        )
                                                                                    )}
                                                                                </Stack>
                                                                            </Paper>
                                                                        ))}
                                                                        <Button
                                                                            size="small"
                                                                            startIcon={<AddIcon />}
                                                                            onClick={() => {
                                                                                const conditions = Array.isArray(branch.conditions) ? [...branch.conditions] : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }];
                                                                                updateMultiBranch(index, { conditions: conditions.concat({ field: "lead.source", operator: "equals", value: "" }) });
                                                                            }}
                                                                        >
                                                                            Add condition
                                                                        </Button>
                                                                    </Stack>
                                                                </Paper>
                                                            ))}
                                                            <Typography variant="caption" color="text.secondary">
                                                                The final Else branch is used when no condition matches.
                                                            </Typography>
                                                        </Stack>
                                                    </Paper>
                                                )}
                                            </>
                                        )}

                                        {['update_field', 'update_lead', 'update_opportunity', 'update_activity'].includes(selectedNode.data?.type) && (
                                            <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
                                                <Stack spacing={1.25}>
                                                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                                                        <Typography variant="caption" fontWeight={800} color="text.secondary">
                                                            Field updates
                                                        </Typography>
                                                        <Button size="small" startIcon={<AddIcon />} onClick={addFieldUpdate}>
                                                            Add
                                                        </Button>
                                                    </Stack>
                                                    {(Array.isArray(nodeConfig.updates) && nodeConfig.updates.length > 0 ? nodeConfig.updates : [{ field: '', value: '' }]).map((update: any, index: number) => (
                                                        <Paper key={index} variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}>
                                                            <Stack spacing={1}>
                                                                <Stack direction="row" alignItems="center" justifyContent="space-between">
                                                                    <Typography variant="caption" fontWeight={700}>Update {index + 1}</Typography>
                                                                    <IconButton size="small" onClick={() => removeFieldUpdate(index)} disabled={(nodeConfig.updates ?? []).length <= 1}>
                                                                        <DeleteIcon fontSize="small" />
                                                                    </IconButton>
                                                                </Stack>
                                                                <FormControl fullWidth size="small">
                                                                    <InputLabel>Field</InputLabel>
                                                                    <Select value={update.field || ''} label="Field" onChange={(e) => updateFieldUpdate(index, { field: e.target.value })}>
                                                                        {fieldOptionsForNode.map((field) => (
                                                                            <MenuItem key={field.key} value={field.key}>{field.label}</MenuItem>
                                                                        ))}
                                                                    </Select>
                                                                </FormControl>
                                                                {fieldOptionsForValue(update.field, fieldOptionsForNode).length > 0 ? (
                                                                    <FormControl fullWidth size="small">
                                                                        <InputLabel>New Value</InputLabel>
                                                                        <Select value={update.value || ''} label="New Value" onChange={(e) => updateFieldUpdate(index, { value: e.target.value })}>
                                                                            {fieldOptionsForValue(update.field, fieldOptionsForNode).map((option: string) => (
                                                                                <MenuItem key={option} value={option}>{option}</MenuItem>
                                                                            ))}
                                                                        </Select>
                                                                    </FormControl>
                                                                ) : (
                                                                    <TextField label="New Value" fullWidth size="small" value={update.value || ''} onChange={(e) => updateFieldUpdate(index, { value: e.target.value })} />
                                                                )}
                                                            </Stack>
                                                        </Paper>
                                                    ))}
                                                </Stack>
                                            </Paper>
                                        )}

                                        {selectedNode.data?.type === 'send_email' && (
                                            <>
                                                <TextField label="To" fullWidth size="small" value={nodeConfig.to || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, to: e.target.value })} />
                                                <TextField label="Subject" fullWidth size="small" value={nodeConfig.subject || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, subject: e.target.value })} />
                                                <TextField label="Body" fullWidth multiline rows={3} size="small" value={nodeConfig.body || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, body: e.target.value })} />
                                            </>
                                        )}

                                        {['create_activity', 'add_activity'].includes(selectedNode.data?.type) && (
                                            <>
                                                <FormControl fullWidth size="small">
                                                    <InputLabel>Activity Type</InputLabel>
                                                    <Select value={nodeConfig.activityTypeId || ''} label="Activity Type" onChange={(e) => setNodeConfig({ ...nodeConfig, activityTypeId: e.target.value, typeId: e.target.value })}>
                                                        {activityTypes.map((type) => (
                                                            <MenuItem key={type.id} value={type.id}>{type.name}</MenuItem>
                                                        ))}
                                                    </Select>
                                                </FormControl>
                                                <TextField label="Subject" fullWidth size="small" value={nodeConfig.subject || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, subject: e.target.value })} />
                                                <TextField label="Notes" fullWidth multiline rows={2} size="small" value={nodeConfig.notes || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, notes: e.target.value })} />
                                            </>
                                        )}

                                        {selectedNode.data?.type === 'add_opportunity' && (
                                            <>
                                                <FormControl fullWidth size="small">
                                                    <InputLabel>Opportunity Type</InputLabel>
                                                    <Select value={nodeConfig.opportunityTypeId || ''} label="Opportunity Type" onChange={(e) => setNodeConfig({ ...nodeConfig, opportunityTypeId: e.target.value })}>
                                                        {opportunityTypes.map((type) => (
                                                            <MenuItem key={type.id} value={type.id}>{type.name}</MenuItem>
                                                        ))}
                                                    </Select>
                                                </FormControl>
                                                <TextField label="Title" fullWidth size="small" value={nodeConfig.title || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, title: e.target.value })} />
                                                <TextField label="Amount" type="number" fullWidth size="small" value={nodeConfig.amount || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, amount: e.target.value })} />
                                            </>
                                        )}

                                        {['delay', 'wait', 'wait_until_activity', 'split_test'].includes(selectedNode.data?.type) && (
                                            <Stack direction="row" spacing={1}>
                                                <TextField label="Duration" type="number" fullWidth size="small" value={nodeConfig.duration || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, duration: e.target.value })} />
                                                <FormControl fullWidth size="small">
                                                    <InputLabel>Unit</InputLabel>
                                                    <Select value={nodeConfig.unit || 'hours'} label="Unit" onChange={(e) => setNodeConfig({ ...nodeConfig, unit: e.target.value })}>
                                                        <MenuItem value="minutes">Minutes</MenuItem>
                                                        <MenuItem value="hours">Hours</MenuItem>
                                                        <MenuItem value="days">Days</MenuItem>
                                                    </Select>
                                                </FormControl>
                                            </Stack>
                                        )}

                                        {['tag_lead', 'star_lead'].includes(selectedNode.data?.type) && (
                                            <TextField label={selectedNode.data?.type === 'tag_lead' ? "Tags" : "Star Reason"} fullWidth size="small" value={nodeConfig.value || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, value: e.target.value })} />
                                        )}

                                        {selectedNode.data?.type === 'remove_tag' && (
                                            <TextField label="Tag to remove" fullWidth size="small" value={nodeConfig.value || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, value: e.target.value })} />
                                        )}

                                        {['add_to_list', 'remove_from_list'].includes(selectedNode.data?.type) && (
                                            <FormControl fullWidth size="small">
                                                <InputLabel>Lead List</InputLabel>
                                                <Select value={nodeConfig.listId || ''} label="Lead List" onChange={(e) => setNodeConfig({ ...nodeConfig, listId: e.target.value })}>
                                                    {leadLists.filter((list) => list.type === 'STATIC').map((list) => (
                                                        <MenuItem key={list.id} value={list.id}>{list.name}</MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        )}

                                        {selectedNode.data?.type === 'increment_score' && (
                                            <TextField label="Score change" type="number" fullWidth size="small" value={nodeConfig.value || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, value: e.target.value })} />
                                        )}

                                        {selectedNode.data?.type === 'clear_field' && (
                                            <FormControl fullWidth size="small">
                                                <InputLabel>Field to clear</InputLabel>
                                                <Select value={nodeConfig.field || ''} label="Field to clear" onChange={(e) => setNodeConfig({ ...nodeConfig, field: e.target.value })}>
                                                    {fieldOptionsForNode.map((field) => (
                                                        <MenuItem key={field.key} value={field.key}>{field.label}</MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        )}

                                        {selectedNode.data?.type === 'assign_owner' && (
                                            <>
                                                <FormControl fullWidth size="small">
                                                    <InputLabel>Record</InputLabel>
                                                    <Select value={nodeConfig.target || 'current'} label="Record" onChange={(e) => setNodeConfig({ ...nodeConfig, target: e.target.value })}>
                                                        <MenuItem value="current">Current record</MenuItem>
                                                        <MenuItem value="lead">Lead</MenuItem>
                                                        <MenuItem value="opportunity">Opportunity</MenuItem>
                                                    </Select>
                                                </FormControl>
                                                <FormControl fullWidth size="small">
                                                    <InputLabel>Owner</InputLabel>
                                                    <Select value={nodeConfig.ownerId || ''} label="Owner" onChange={(e) => setNodeConfig({ ...nodeConfig, ownerId: e.target.value })}>
                                                        {users.map((user) => (
                                                            <MenuItem key={user.id} value={user.id}>{user.name || user.email}</MenuItem>
                                                        ))}
                                                    </Select>
                                                </FormControl>
                                            </>
                                        )}

                                        {selectedNode.data?.type === 'change_stage' && (
                                            <FormControl fullWidth size="small">
                                                <InputLabel>Stage</InputLabel>
                                                <Select value={nodeConfig.stageId || ''} label="Stage" onChange={(e) => setNodeConfig({ ...nodeConfig, stageId: e.target.value })}>
                                                    {stageOptions.map((stage) => (
                                                        <MenuItem key={stage.id} value={stage.id}>{stage.typeName}: {stage.name}</MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        )}

                                        {selectedNode.data?.type === 'notify_user' && (
                                            <>
                                                <FormControl fullWidth size="small">
                                                    <InputLabel>User</InputLabel>
                                                    <Select value={nodeConfig.userId || ''} label="User" onChange={(e) => setNodeConfig({ ...nodeConfig, userId: e.target.value })}>
                                                        {users.map((user) => (
                                                            <MenuItem key={user.id} value={user.id}>{user.name || user.email}</MenuItem>
                                                        ))}
                                                    </Select>
                                                </FormControl>
                                                <TextField label="Title" fullWidth size="small" value={nodeConfig.title || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, title: e.target.value })} />
                                                <TextField label="Message" fullWidth multiline rows={2} size="small" value={nodeConfig.message || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, message: e.target.value })} />
                                            </>
                                        )}

                                        {selectedNode.data?.type === 'stop' && (
                                            <TextField label="Reason" fullWidth size="small" value={nodeConfig.reason || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, reason: e.target.value })} />
                                        )}

                                        {selectedNode.data?.type === 'webhook' && (
                                            <>
                                                <TextField label="URL" fullWidth size="small" value={nodeConfig.url || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, url: e.target.value })} />
                                                <FormControl fullWidth size="small">
                                                    <InputLabel>Method</InputLabel>
                                                    <Select value={nodeConfig.method || 'POST'} label="Method" onChange={(e) => setNodeConfig({ ...nodeConfig, method: e.target.value })}>
                                                        <MenuItem value="GET">GET</MenuItem>
                                                        <MenuItem value="POST">POST</MenuItem>
                                                    </Select>
                                                </FormControl>
                                                <TextField label="Body (JSON)" fullWidth multiline rows={3} size="small" value={nodeConfig.body || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, body: e.target.value })} />
                                            </>
                                        )}

                                        <Button variant="contained" onClick={updateNodeConfig} fullWidth sx={{ mt: 1, textTransform: 'none' }}>
                                            Update Step
                                        </Button>
                                    </Stack>
                                </Paper>
                            )}
                        </Box>
                    ) : (
                        <Box sx={{ p: 3, overflowY: 'auto', flex: 1 }}>
                            <Typography variant="overline" sx={{ px: 1, fontWeight: 700, color: 'text.secondary', letterSpacing: 1.2 }}>
                                Execution Log
                            </Typography>
                            {executions.length === 0 ? (
                                <Box sx={{ p: 4, textAlign: 'center' }}>
                                    <Typography variant="body2" color="text.disabled">No executions yet</Typography>
                                </Box>
                            ) : (
                                <Stack spacing={2} sx={{ mt: 2 }}>
                                    {executions.map((exe) => (
                                        <Card key={exe.id} variant="outlined" sx={{ borderRadius: '16px' }}>
                                            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                                                    <Chip
                                                        label={exe.status}
                                                        size="small"
                                                        color={exe.status === 'COMPLETED' ? 'success' : exe.status === 'FAILED' ? 'error' : 'info'}
                                                        sx={{ height: 20, fontSize: '0.625rem', fontWeight: 700 }}
                                                    />
                                                    <Typography variant="caption" color="text.secondary">
                                                        {formatWorkspaceDateTime(exe.startedAt)}
                                                    </Typography>
                                                </Stack>
                                                <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
                                                    {exe.entityType}: {exe.entityId}
                                                </Typography>
                                                {exe.executionLog?.steps && (
                                                    <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                                                        <ExecutionLogViewer steps={exe.executionLog.steps} />
                                                    </Box>
                                                )}
                                            </CardContent>
                                        </Card>
                                    ))}
                                </Stack>
                            )}
                        </Box>
                    )}
                </Paper>

                {/* Canvas */}
                <Box
                    sx={{ flex: 1, bgcolor: 'background.default', position: 'relative' }}
                >
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
                            markerEnd: { type: MarkerType.ArrowClosed, color: theme.palette.primary.main },
                            style: { strokeWidth: 2, stroke: theme.palette.primary.main }
                        }}
                    >
                        <Controls className="bg-background border-muted rounded-xl shadow-lg" />
                        <MiniMap className="bg-background border-muted rounded-xl shadow-lg" />
                        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color={alpha(theme.palette.primary.main, 0.1)} />
                    </ReactFlow>
                </Box>
            </Box>

            {/* Test Dialog */}
            {!isNew && (
                <TestWorkflowDialog
                    open={showTestDialog}
                    onClose={() => setShowTestDialog(false)}
                    automationId={automationId}
                    automationName={name}
                />
            )}
            <Dialog open={Boolean(addAfterNodeId)} onClose={() => setAddAfterNodeId(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Add automation step</DialogTitle>
                <DialogContent>
                    <List dense disablePadding>
                        {clonedNodeData && (
                            <ListItemButton
                                onClick={() => pasteClonedNode(addAfterNodeId)}
                                sx={{ borderRadius: 1, mb: 1, bgcolor: alpha(theme.palette.primary.main, 0.06) }}
                            >
                                <ListItemIcon sx={{ minWidth: 36 }}>
                                    <PasteIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                                </ListItemIcon>
                                <ListItemText
                                    primary={`Paste ${clonedNodeData.label || 'cloned step'}`}
                                    primaryTypographyProps={{ variant: 'body2', fontWeight: 800 }}
                                />
                            </ListItemButton>
                        )}
                        {NODE_TYPES.filter((nodeType) => nodeType.type !== "trigger").map((nodeType) => {
                            const Icon = nodeType.icon;
                            return (
                                <ListItemButton
                                    key={nodeType.type}
                                    onClick={() => addNode(nodeType.type, addAfterNodeId)}
                                    sx={{ borderRadius: 1, mb: 0.5 }}
                                >
                                    <ListItemIcon sx={{ minWidth: 36 }}>
                                        <Icon sx={{ color: nodeType.color, fontSize: 20 }} />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={nodeType.label}
                                        primaryTypographyProps={{ variant: 'body2', fontWeight: 700 }}
                                    />
                                </ListItemButton>
                            );
                        })}
                    </List>
                </DialogContent>
            </Dialog>
        </Box>
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
