"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useNodesState, useEdgesState, addEdge, Connection, Node, MarkerType, ReactFlowInstance } from "reactflow";
import { useFeature, useModuleEnabled } from "@/components/auth/feature-gate";
import { useConfirm } from "@/components/common/dialogs-provider";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { useRecordTitle } from "@/components/app-states/page-title";
import { TRIGGER_TYPES } from "@/components/automations/trigger-types";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { ACTIVITY_FIELDS, APP_EVENT_FIELDS, COMMUNICATION_FIELDS, LEAD_FIELDS, NODE_TYPES, OPPORTUNITY_FIELDS, OPPORTUNITY_TRIGGER_SCOPES, TASK_FIELDS, branchIdForLabel, configForNode, initialEdges, initialNodes, layoutWorkflow, multiIfLabels, nodeAllowedForScope, normalizeMultiIfElseBranches, sameConfig, samePosition, summarizeAutomationChanges } from "./builder-shared";

// The automation builder's state and handlers, moved here from page.tsx unchanged so the page
// and its panels and dialogs can share them.
export function useAutomationBuilder() {
    const [activePanel, setActivePanel] = useState("canvas");
    const router = useRouter();
    const confirm = useConfirm();
    const params = useParams();
    // A new automation gets its id on the first autosave; the address bar is updated in place
    // (no navigation, so nothing reloads and no leave prompt appears).
    const [createdId, setCreatedId] = useState<string | null>(null);
    const createdIdRef = useRef<string | null>(null);
    const routeId = params?.id as string;
    const automationId = createdId ?? routeId;
    const isNew = automationId === 'new';


    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [showTestDialog, setShowTestDialog] = useState(false);
    const [showEnrollDialog, setShowEnrollDialog] = useState(false);
    const [configDialogOpen, setConfigDialogOpen] = useState(false);
    const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
    const [addAfterNodeId, setAddAfterNodeId] = useState<string | null>(null);
    const [clonedNodeData, setClonedNodeData] = useState<Record<string, any> | null>(null);

    // Form state
    const [name, setName] = useState('');
    useRecordTitle(name);
    const [description, setDescription] = useState('');
    const [isActive, setIsActive] = useState(false);
    // Archived (decision 31): shown read-only with a Restore button.
    const [archivedAt, setArchivedAt] = useState<string | null>(null);
    // Save model (decision 29): the builder edits a draft; Publish makes it what runs.
    const [publishedVersion, setPublishedVersion] = useState(0);
    const [publishedAt, setPublishedAt] = useState<string | null>(null);
    const [hasDraft, setHasDraft] = useState(isNew);
    const [liveDefinition, setLiveDefinition] = useState<any>(null);
    const [loadError, setLoadError] = useState<'missing' | 'failed' | null>(null);
    const [triggerType, setTriggerType] = useState('LEAD_CREATED');
    const opportunityEnabled = useFeature("opportunityEnabled");
    const serviceDeskEnabled = useModuleEnabled("SERVICE_DESK");
    // Opportunity-scoped triggers disappear from new-selection pickers once the tenant
    // disables Opportunities -- an automation already saved with one keeps working
    // (nothing here touches runAutomationsForEvent), and stays selectable/visible in its
    // own picker via the currentValue carve-out so the Select doesn't go blank. Case
    // triggers get the same treatment against the newer module-entitlement system.
    const getAvailableTriggerTypes = (currentValue?: string) =>
        TRIGGER_TYPES.filter(
            (trigger) =>
                (opportunityEnabled || !OPPORTUNITY_TRIGGER_SCOPES.includes(trigger.scope) || trigger.value === currentValue) &&
                (serviceDeskEnabled || trigger.scope !== "case" || trigger.value === currentValue)
        );
    const [tabValue, setTabValue] = useState(0); // 0: Designer, 1: History
    const [executions, setExecutions] = useState<any[]>([]);
    const [activityTypes, setActivityTypes] = useState<any[]>([]);
    const [opportunityTypes, setOpportunityTypes] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [teams, setTeams] = useState<any[]>([]);
    const [otherAutomations, setOtherAutomations] = useState<any[]>([]);
    const [taskPlaybooks, setTaskPlaybooks] = useState<any[]>([]);
    const [leadLists, setLeadLists] = useState<any[]>([]);
    const [availableAppActions, setAvailableAppActions] = useState<any[]>([]);
    const [triggerOpportunityTypeId, setTriggerOpportunityTypeId] = useState("");
    const [triggerActivityTypeId, setTriggerActivityTypeId] = useState("");
    const [triggerAppId, setTriggerAppId] = useState("");
    const [triggerEventName, setTriggerEventName] = useState("");
    const [availableAutomationApps, setAvailableAutomationApps] = useState<Array<{ appId: string; appName: string }>>([]);
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
        apiFetch("/teams").then((data) => setTeams(Array.isArray(data) ? data : [])).catch(() => undefined);
        apiFetch("/automation-v2").then((data) => setOtherAutomations(Array.isArray(data) ? data.filter((item: any) => item.isActive) : [])).catch(() => undefined);
        apiFetch("/settings/task-playbooks?activeOnly=true").then((data) => setTaskPlaybooks(Array.isArray(data) ? data : [])).catch(() => undefined);
        apiFetch("/lead-lists").then((data) => setLeadLists(Array.isArray(data) ? data : [])).catch(() => undefined);
        apiFetch("/marketplace/available-actions").then((data) => setAvailableAppActions(Array.isArray(data) ? data : [])).catch(() => undefined);
        apiFetch("/marketplace/available-automation-apps").then((data) => setAvailableAutomationApps(Array.isArray(data) ? data : [])).catch(() => undefined);
        apiFetch("/custom-fields?objectType=LEAD").then((data) => setLeadCustomFields(Array.isArray(data) ? data : [])).catch(() => setLeadCustomFields([]));
        apiFetch("/custom-fields?objectType=OPPORTUNITY").then((data) => setOpportunityCustomFields(Array.isArray(data) ? data : [])).catch(() => setOpportunityCustomFields([]));
        apiFetch("/custom-fields?objectType=ACTIVITY").then((data) => setActivityCustomFields(Array.isArray(data) ? data : [])).catch(() => setActivityCustomFields([]));
        // Not when the address just changed to an automation this page created (it's already
        // loaded, and reloading would drop anything typed since the save).
        if (!isNew && routeId !== createdIdRef.current) {
            fetchAutomation();
            fetchExecutions();
        }
    }, [routeId]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchExecutions = async () => {
        try {
            const data = await apiFetch<any[]>(`/automation-v2/${automationId}/executions`);
            setExecutions(data);
        } catch (error) {
            console.error('Failed to fetch executions:', error);
        }
    };

    // Puts a definition ({ name, description, trigger, workflow }) into the builder: on load
    // (the draft if there is one, else what's published), discard, version restore, undo/redo.
    const applyDefinition = (definition: any) => {
        setName(definition?.name ?? '');
        setDescription(definition?.description || '');
        setTriggerType(definition?.trigger?.type || 'LEAD_CREATED');
        setTriggerOpportunityTypeId(definition?.trigger?.opportunityTypeId || "");
        setTriggerActivityTypeId(definition?.trigger?.activityTypeId || "");
        setTriggerAppId(definition?.trigger?.appId || "");
        setTriggerEventName(definition?.trigger?.eventName || "");
        const workflowConfig = definition?.workflow?.config ?? {};
        setMaxExecutionsPerRecord(Number(workflowConfig.maxExecutionsPerRecord ?? 10));
        setMaxStepsPerRun(Number(workflowConfig.maxStepsPerRun ?? 100));
        setExitConditionLogic(workflowConfig.exitConditionLogic === "AND" ? "AND" : "OR");
        setExitConditions(Array.isArray(workflowConfig.exitConditions) ? workflowConfig.exitConditions : []);
        const loadedNodes = Array.isArray(definition?.workflow?.nodes)
            ? definition.workflow.nodes.map((node: any) => ({ ...node, data: { ...node.data, nodeId: node.id } }))
            : [];
        const loadedEdges = Array.isArray(definition?.workflow?.edges) ? definition.workflow.edges : [];
        const normalizedWorkflow = normalizeMultiIfElseBranches(loadedNodes, loadedEdges);
        setNodes(normalizedWorkflow.nodes);
        setEdges(normalizedWorkflow.edges);
    };

    const fetchAutomation = async () => {
        try {
            const data = await apiFetch<any>(`/automation-v2/${automationId}`);
            setArchivedAt(data.deletedAt ?? null);
            setIsActive(data.isActive);
            setPublishedVersion(Number(data.publishedVersion ?? 0));
            setPublishedAt(data.publishedAt ?? null);
            setHasDraft(!!data.draft);
            setLiveDefinition({ name: data.name, description: data.description ?? null, trigger: data.trigger, workflow: data.workflow });
            applyDefinition(data.draft ?? data);
        } catch (error: any) {
            setLoadError(error?.status === 404 ? 'missing' : 'failed');
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
        setNodeConfig(configForNode(node, triggerType));
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
        // The panel now shows exactly what was applied, so nothing is left unapplied.
        const current = nodes.find((node) => node.id === selectedNode.id) ?? selectedNode;
        setNodeConfig(configForNode({ ...current, data: { ...current.data, ...normalizedConfig } }, normalizedConfig.triggerType ?? triggerType));

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
        const removedNode = nodes.find((node) => node.id === nodeId);
        const removedEdges = edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
        setNodes((nds) => nds.filter((node) => node.id !== nodeId));
        setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
        if (selectedNode?.id === nodeId) setSelectedNode(null);
        toast.success("Step removed", removedNode ? {
            action: {
                label: "Undo",
                onClick: () => {
                    setNodes((nds) => (nds.some((node) => node.id === nodeId) ? nds : nds.concat(removedNode)));
                    setEdges((eds) => eds.concat(removedEdges.filter((edge) => !eds.some((item) => item.id === edge.id))));
                },
            },
        } : undefined);
    };

    // The step being edited, as currently applied on the canvas, and whether the panel or dialog
    // holds edits that haven't been applied to it yet.
    const selectedNodeCurrent = selectedNode ? nodes.find((node) => node.id === selectedNode.id) ?? null : null;
    const nodeConfigDirty = !!selectedNodeCurrent && !sameConfig(nodeConfig, configForNode(selectedNodeCurrent, triggerType));
    const revertNodeConfig = () => {
        if (selectedNodeCurrent) setNodeConfig(configForNode(selectedNodeCurrent, triggerType));
    };
    const closeStepDialog = () => {
        revertNodeConfig();
        setConfigDialogOpen(false);
    };

    // Steps are removed only from their own menu (with Undo), never by a stray Backspace or
    // Delete on the canvas. Edges can still be removed with the keyboard.
    const onNodesChangeWithoutKeyboardDelete = useCallback(
        (changes: Parameters<typeof onNodesChange>[0]) => onNodesChange(changes.filter((change) => change.type !== "remove")),
        [onNodesChange],
    );

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

    // The automation as it would be saved. Unapplied step edits aren't part of it (saving is
    // refused until they're applied or reverted).
    // Opportunity and activity types are saved only for triggers that use them (the builder fills
    // in defaults for every trigger).
    const payloadScope = TRIGGER_TYPES.find((item) => item.value === triggerType)?.scope ?? "lead";
    const usesOpportunityType = ["opportunity", "activity_opportunity", "task_opportunity"].includes(payloadScope);
    const usesActivityType = payloadScope.startsWith("activity_");
    const buildPayload = () => ({
        name: name.trim(),
        description,
        trigger: {
            type: triggerType,
            opportunityTypeId: usesOpportunityType ? triggerOpportunityTypeId || undefined : undefined,
            activityTypeId: usesActivityType ? triggerActivityTypeId || undefined : undefined,
            appId: triggerType === "APP_EVENT" ? (triggerAppId || undefined) : undefined,
            eventName: triggerType === "APP_EVENT" ? (triggerEventName || undefined) : undefined,
        },
        workflow: {
            config: { maxExecutionsPerRecord, maxStepsPerRun, exitConditionLogic, exitConditions },
            nodes: nodes.map(n => ({
                ...n,
                data: Object.fromEntries(Object.entries(n.data).filter(([_, value]) => typeof value !== 'function')),
            })),
            edges,
        },
    });

    // Unsaved changes (UI/UX plan §5.12): compare what would be saved with what was last loaded
    // or saved. Layout-only node properties (position, size, selection) don't count.
    const payload = buildPayload();
    const snapshot = JSON.stringify({
        ...payload,
        workflow: {
            ...payload.workflow,
            nodes: payload.workflow.nodes.map((node: any) => ({ id: node.id, type: node.type, data: node.data })),
            edges: payload.workflow.edges.map((edge: any) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle ?? null, targetHandle: edge.targetHandle ?? null, label: edge.label ?? null })),
        },
    });
    const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
    useEffect(() => {
        if (!loading && savedSnapshot === null) setSavedSnapshot(snapshot);
    }, [loading, savedSnapshot, snapshot]);
    const dirty = savedSnapshot !== null && (snapshot !== savedSnapshot || nodeConfigDirty);
    useUnsavedChangesGuard(dirty, "the changes to this automation");
    const [nameError, setNameError] = useState<string | null>(null);

    const restoreArchived = async () => {
        try {
            await apiFetch(`/automation-v2/${automationId}/restore`, { method: 'POST' });
            setArchivedAt(null);
            toast.success('Automation restored');
        } catch (error: any) {
            toast.error(error?.message || "The automation couldn't be restored");
        }
    };

    // Autosave (decision 29): the draft is saved 1.5s after the last change; it never changes
    // what runs. A new automation is created as a draft once it has a name.
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const savingRef = useRef(false);
    const saveDraft = async (): Promise<boolean> => {
        if (archivedAt || savingRef.current) return false;
        if (!name.trim()) {
            setNameError("Give this automation a name.");
            return false;
        }
        const savingSnapshot = snapshot;
        const definition = payload;
        savingRef.current = true;
        setSaveState('saving');
        try {
            if (isNew) {
                const created = await apiFetch<{ id: string }>(`/automation-v2`, { method: 'POST', body: JSON.stringify({ ...definition, asDraft: true }) });
                setSavedSnapshot(savingSnapshot);
                setHasDraft(true);
                createdIdRef.current = created.id;
                setCreatedId(created.id);
                window.history.replaceState(window.history.state, '', `/dashboard/automations-v2/${created.id}`);
            } else {
                const saved = await apiFetch<any>(`/automation-v2/${automationId}`, { method: 'PATCH', body: JSON.stringify({ draft: definition }) });
                setSavedSnapshot(savingSnapshot);
                setHasDraft(!!saved?.draft || Number(saved?.publishedVersion ?? 0) === 0);
            }
            setSaveState('saved');
            return true;
        } catch (error: any) {
            setSaveState('error');
            toast.error(error?.message || "Your changes couldn't be saved");
            return false;
        } finally {
            savingRef.current = false;
        }
    };
    const saveDraftRef = useRef(saveDraft);
    useEffect(() => { saveDraftRef.current = saveDraft; });
    useEffect(() => {
        if (loading || savedSnapshot === null || snapshot === savedSnapshot || archivedAt || !name.trim()) return;
        const timer = window.setTimeout(() => { saveDraftRef.current(); }, 1500);
        return () => window.clearTimeout(timer);
    }, [loading, snapshot, savedSnapshot, archivedAt, name]);

    // Publish: save what's on screen, show what changes, then make it live as the next version.
    const [publishOpen, setPublishOpen] = useState(false);
    const [publishNotes, setPublishNotes] = useState("");
    const [publishing, setPublishing] = useState(false);
    const openPublish = async () => {
        if (archivedAt) return;
        if (!name.trim()) {
            setNameError("Give this automation a name.");
            document.getElementById("automation-name")?.focus();
            return;
        }
        if (nodeConfigDirty) {
            toast.error(`Apply or revert your changes to the "${String(selectedNodeCurrent?.data?.label ?? "selected")}" step before publishing`);
            return;
        }
        if (snapshot !== savedSnapshot && !(await saveDraft())) return;
        setPublishNotes("");
        setPublishOpen(true);
    };
    const publish = async () => {
        setPublishing(true);
        try {
            const result = await apiFetch<any>(`/automation-v2/${automationId}/publish`, { method: 'POST', body: JSON.stringify({ notes: publishNotes }) });
            setPublishedVersion(Number(result.publishedVersion ?? 0));
            setPublishedAt(result.publishedAt ?? null);
            setLiveDefinition({ name: result.name, description: result.description ?? null, trigger: result.trigger, workflow: result.workflow });
            setHasDraft(false);
            setPublishOpen(false);
            toast.success(`Published version ${result.publishedVersion}`, { description: isActive ? "It runs from now on." : "Turn it on to start running it." });
        } catch (error: any) {
            toast.error(error?.message || "The automation couldn't be published");
        } finally {
            setPublishing(false);
        }
    };
    const changeSummary = useMemo(() => summarizeAutomationChanges(liveDefinition, publishedVersion, payload), [liveDefinition, publishedVersion, snapshot]); // eslint-disable-line react-hooks/exhaustive-deps

    const discardChanges = async () => {
        const ok = await confirm({ title: "Discard unpublished changes?", description: `The builder goes back to version ${publishedVersion}, which is what runs now.`, confirmLabel: "Discard changes", destructive: true });
        if (!ok) return;
        try {
            const result = await apiFetch<any>(`/automation-v2/${automationId}/draft`, { method: 'DELETE' });
            resetHistory();
            applyDefinition(result);
            setHasDraft(false);
            setSavedSnapshot(null);
            toast.success("Changes discarded");
        } catch (error: any) {
            toast.error(error?.message || "The changes couldn't be discarded");
        }
    };

    // Versions: each publish, newest first; any one can be restored as the draft.
    const [versionsOpen, setVersionsOpen] = useState(false);
    const [versions, setVersions] = useState<any[] | null>(null);
    const [versionsError, setVersionsError] = useState(false);
    const openVersions = async () => {
        setVersionsOpen(true);
        setVersions(null);
        setVersionsError(false);
        try {
            const data = await apiFetch<any[]>(`/automation-v2/${automationId}/versions`);
            setVersions(Array.isArray(data) ? data : []);
        } catch {
            setVersionsError(true);
        }
    };
    const restoreVersion = async (version: number) => {
        if (hasDraft && !(await confirm({ title: `Restore version ${version} as the draft?`, description: "It replaces your unpublished changes. Nothing changes in what runs until you publish.", confirmLabel: "Restore as draft", destructive: true }))) return;
        try {
            const result = await apiFetch<any>(`/automation-v2/${automationId}/versions/${version}/restore`, { method: 'POST' });
            resetHistory();
            applyDefinition(result.draft ?? result);
            setHasDraft(!!result.draft);
            setSavedSnapshot(null);
            setVersionsOpen(false);
            toast.success(`Version ${version} is now the draft`, { description: "Publish it to make it live." });
        } catch (error: any) {
            toast.error(error?.message || "The version couldn't be restored");
        }
    };

    // On/off saves straight away and applies to the published version.
    const toggleActive = async (checked: boolean) => {
        const previous = isActive;
        setIsActive(checked);
        try {
            await apiFetch(`/automation-v2/${automationId}`, { method: 'PATCH', body: JSON.stringify({ isActive: checked }) });
            toast.success(checked ? `On: version ${publishedVersion} runs from now on` : "Off: it won't run");
        } catch (error: any) {
            setIsActive(previous);
            toast.error(error?.message || "The automation couldn't be changed");
        }
    };

    // Undo and redo over the builder's definition (decision 29); positions are laid out again.
    const historyRef = useRef<{ past: any[]; future: any[]; lastSnapshot: string | null; lastPayload: any; applying: boolean }>({ past: [], future: [], lastSnapshot: null, lastPayload: null, applying: false });
    const [historyCounts, setHistoryCounts] = useState({ past: 0, future: 0 });
    const resetHistory = () => {
        historyRef.current = { past: [], future: [], lastSnapshot: null, lastPayload: null, applying: true };
        setHistoryCounts({ past: 0, future: 0 });
    };
    useEffect(() => {
        if (loading) return;
        const history = historyRef.current;
        if (history.applying) {
            history.applying = false;
        } else if (history.lastSnapshot !== null && history.lastSnapshot !== snapshot) {
            history.past.push(history.lastPayload);
            if (history.past.length > 50) history.past.shift();
            history.future = [];
            setHistoryCounts({ past: history.past.length, future: 0 });
        }
        history.lastSnapshot = snapshot;
        history.lastPayload = payload;
    }, [snapshot, loading]); // eslint-disable-line react-hooks/exhaustive-deps
    const undo = () => {
        const history = historyRef.current;
        const previous = history.past.pop();
        if (!previous) return;
        history.future.push(history.lastPayload);
        history.applying = true;
        applyDefinition(previous);
        setHistoryCounts({ past: history.past.length, future: history.future.length });
    };
    const redo = () => {
        const history = historyRef.current;
        const next = history.future.pop();
        if (!next) return;
        history.past.push(history.lastPayload);
        history.applying = true;
        applyDefinition(next);
        setHistoryCounts({ past: history.past.length, future: history.future.length });
    };

    // ⌘S saves the draft now; ⌘Z / ⇧⌘Z undo and redo (outside text fields, which keep their own).
    const keysRef = useRef({ saveDraft, undo, redo });
    useEffect(() => { keysRef.current = { saveDraft, undo, redo }; });
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
            const key = event.key.toLowerCase();
            if (key === 's' && !event.shiftKey) {
                event.preventDefault();
                keysRef.current.saveDraft();
                return;
            }
            const target = event.target as HTMLElement | null;
            if (target && (target.closest('input, textarea, select, [contenteditable="true"]'))) return;
            if (key === 'z') {
                event.preventDefault();
                if (event.shiftKey) keysRef.current.redo(); else keysRef.current.undo();
            } else if (key === 'y') {
                event.preventDefault();
                keysRef.current.redo();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Steps in flow order: breadth-first from the trigger along the connections, with the label of
    // the branch that leads to each; steps not connected to the trigger come last.
    const stepOutline = useMemo(() => {
        const byId = new Map(nodes.map((node) => [node.id, node]));
        const outgoing = new Map<string, Array<{ target: string; label?: string }>>();
        for (const edge of edges) {
            const list = outgoing.get(edge.source) ?? [];
            list.push({ target: edge.target, label: edge.label ? String(edge.label) : undefined });
            outgoing.set(edge.source, list);
        }
        const order: Array<{ node: Node; depth: number; viaLabel?: string; connected: boolean }> = [];
        const seen = new Set<string>();
        const queue = nodes.filter((node) => node.data?.type === "trigger").map((node) => ({ id: node.id, depth: 0, viaLabel: undefined as string | undefined }));
        while (queue.length) {
            const next = queue.shift()!;
            if (seen.has(next.id) || !byId.has(next.id)) continue;
            seen.add(next.id);
            const node = byId.get(next.id)!;
            const parentType = String(node.data?.type ?? "");
            order.push({ node, depth: next.depth, viaLabel: next.viaLabel, connected: true });
            for (const edge of outgoing.get(next.id) ?? []) queue.push({ id: edge.target, depth: next.depth + 1, viaLabel: parentType === "branch" ? undefined : edge.label });
        }
        for (const node of nodes) if (!seen.has(node.id)) order.push({ node, depth: 0, connected: false });
        return order;
    }, [nodes, edges]);

    const focusStep = (node: Node) => {
        setSelectedNode(node);
        setNodes((current) => current.map((item) => ({ ...item, selected: item.id === node.id })));
        reactFlowInstance?.setCenter(node.position.x + 100, node.position.y + 40, { zoom: reactFlowInstance.getZoom(), duration: 300 });
    };

    // "A" adds a step after the selected one (outside text fields and dialogs).
    const addAfterRef = useRef<() => void>(() => undefined);
    useEffect(() => {
        addAfterRef.current = () => {
            const target = nodes.find((node) => node.selected) ?? selectedNode;
            if (target) setAddAfterNodeId(target.id);
        };
    });
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key.toLowerCase() !== "a" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
            const target = event.target as HTMLElement | null;
            if (target && target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"]')) return;
            event.preventDefault();
            addAfterRef.current();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

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
    // Distinct from activityConditionFields ("activity." -- the specific Activity that fired
    // this trigger, only meaningful for activity-scoped triggers): this is the lead's most
    // recent Activity of any kind, available regardless of what actually triggered the run.
    // Previously there was no way to reference "any/latest Activity" from a Lead- or
    // Opportunity-triggered automation at all -- only the triggering row itself was reachable.
    const leadActivityConditionFields = mergeFieldOptions(
        ACTIVITY_FIELDS.map((field) => ({
            ...field,
            key: `leadActivity.${field.key}`,
            label: `Lead's Latest Activity: ${field.label}`,
            options: field.key === "typeId" ? activityTypes.map((type) => ({ label: type.name, value: type.id })) : field.options,
        }))
    );
    const taskConditionFields = TASK_FIELDS.map((field) => ({
        ...field,
        key: `task.${field.key}`,
        label: `Task: ${field.label}`,
        options: field.key === "ownerId" ? users.map((user) => ({ label: user.name || user.email, value: user.id })) : field.options,
    }));
    const communicationConditionFields = COMMUNICATION_FIELDS.map((field) => ({
        ...field,
        key: `communication.${field.key}`,
        label: `Communication: ${field.label}`,
    }));
    const appEventConditionFields = APP_EVENT_FIELDS;

    const isOpportunityScopedTrigger = triggerScope === "opportunity" || triggerScope === "activity_opportunity" || triggerScope === "task_opportunity";
    const isActivityScopedTrigger = triggerScope === "activity_lead" || triggerScope === "activity_opportunity" || triggerScope === "activity_activity";
    const allConditionFields = triggerScope === "communication"
        ? [...communicationConditionFields, ...leadConditionFields, ...opportunityConditionFields]
        : triggerScope === "app_event"
        ? appEventConditionFields
        : triggerScope === "opportunity" || triggerScope === "task_opportunity"
        ? [...(triggerScope === "task_opportunity" ? taskConditionFields : []), ...leadConditionFields, ...opportunityConditionFields, ...leadActivityConditionFields]
        : triggerScope === "activity_opportunity"
            ? [...activityConditionFields, ...opportunityConditionFields, ...leadConditionFields, ...leadActivityConditionFields]
            : triggerScope === "activity_lead" || triggerScope === "activity_activity"
                ? [...activityConditionFields, ...leadConditionFields, ...leadActivityConditionFields]
                : triggerScope === "task_lead"
                    ? [...taskConditionFields, ...leadConditionFields, ...leadActivityConditionFields]
            : [...leadConditionFields, ...leadActivityConditionFields];
    const defaultConditionField = allConditionFields[0]?.key ?? "lead.source";

    const fieldMetaForValue = (fieldKey: string, source = allConditionFields) => source.find((field) => field.key === fieldKey || field.key.replace(/^(lead|opportunity|activity|task|communication)\./, "") === fieldKey);
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

    return {
        activePanel,
        setActivePanel,
        router,
        confirm,
        params,
        createdId,
        setCreatedId,
        createdIdRef,
        routeId,
        automationId,
        isNew,
        nodes,
        setNodes,
        onNodesChange,
        edges,
        setEdges,
        onEdgesChange,
        selectedNode,
        setSelectedNode,
        loading,
        setLoading,
        saving,
        setSaving,
        showTestDialog,
        setShowTestDialog,
        showEnrollDialog,
        setShowEnrollDialog,
        configDialogOpen,
        setConfigDialogOpen,
        reactFlowInstance,
        setReactFlowInstance,
        addAfterNodeId,
        setAddAfterNodeId,
        clonedNodeData,
        setClonedNodeData,
        name,
        setName,
        description,
        setDescription,
        isActive,
        setIsActive,
        archivedAt,
        setArchivedAt,
        publishedVersion,
        setPublishedVersion,
        publishedAt,
        setPublishedAt,
        hasDraft,
        setHasDraft,
        liveDefinition,
        setLiveDefinition,
        loadError,
        setLoadError,
        triggerType,
        setTriggerType,
        opportunityEnabled,
        serviceDeskEnabled,
        getAvailableTriggerTypes,
        tabValue,
        setTabValue,
        executions,
        setExecutions,
        activityTypes,
        setActivityTypes,
        opportunityTypes,
        setOpportunityTypes,
        users,
        setUsers,
        teams,
        setTeams,
        otherAutomations,
        setOtherAutomations,
        taskPlaybooks,
        setTaskPlaybooks,
        leadLists,
        setLeadLists,
        availableAppActions,
        setAvailableAppActions,
        triggerOpportunityTypeId,
        setTriggerOpportunityTypeId,
        triggerActivityTypeId,
        setTriggerActivityTypeId,
        triggerAppId,
        setTriggerAppId,
        triggerEventName,
        setTriggerEventName,
        availableAutomationApps,
        setAvailableAutomationApps,
        maxExecutionsPerRecord,
        setMaxExecutionsPerRecord,
        maxStepsPerRun,
        setMaxStepsPerRun,
        exitConditionLogic,
        setExitConditionLogic,
        exitConditions,
        setExitConditions,
        leadCustomFields,
        setLeadCustomFields,
        opportunityCustomFields,
        setOpportunityCustomFields,
        activityCustomFields,
        setActivityCustomFields,
        triggerOpportunityCustomFields,
        setTriggerOpportunityCustomFields,
        triggerActivityCustomFields,
        setTriggerActivityCustomFields,
        nodeConfig,
        setNodeConfig,
        fetchExecutions,
        applyDefinition,
        fetchAutomation,
        onConnect,
        onNodeClick,
        addNode,
        addBranchNodes,
        syncMultiIfBranchNodes,
        updateNodeConfig,
        removeNodeById,
        selectedNodeCurrent,
        nodeConfigDirty,
        revertNodeConfig,
        closeStepDialog,
        onNodesChangeWithoutKeyboardDelete,
        cloneNodeById,
        pasteClonedNode,
        payloadScope,
        usesOpportunityType,
        usesActivityType,
        buildPayload,
        payload,
        snapshot,
        savedSnapshot,
        setSavedSnapshot,
        dirty,
        nameError,
        setNameError,
        restoreArchived,
        saveState,
        setSaveState,
        savingRef,
        saveDraft,
        saveDraftRef,
        publishOpen,
        setPublishOpen,
        publishNotes,
        setPublishNotes,
        publishing,
        setPublishing,
        openPublish,
        publish,
        changeSummary,
        discardChanges,
        versionsOpen,
        setVersionsOpen,
        versions,
        setVersions,
        versionsError,
        setVersionsError,
        openVersions,
        restoreVersion,
        toggleActive,
        historyRef,
        historyCounts,
        setHistoryCounts,
        resetHistory,
        undo,
        redo,
        keysRef,
        stepOutline,
        focusStep,
        addAfterRef,
        flowNodes,
        updateMultiBranch,
        addMultiBranch,
        removeMultiBranch,
        updateCondition,
        addCondition,
        removeCondition,
        updateFieldUpdate,
        addFieldUpdate,
        removeFieldUpdate,
        updateSplitVariant,
        addSplitVariant,
        removeSplitVariant,
        updateExitCondition,
        addExitCondition,
        removeExitCondition,
        stageOptions,
        triggerScope,
        triggerScopeLabel,
        availableNodeTypes,
        selectedOpportunityType,
        opportunityStageOptions,
        selectedActivityType,
        customFieldOptions,
        normalizeCustomFieldType,
        customFieldToOption,
        mergeFieldOptions,
        leadConditionFields,
        opportunityConditionFields,
        activityConditionFields,
        leadActivityConditionFields,
        taskConditionFields,
        communicationConditionFields,
        appEventConditionFields,
        isOpportunityScopedTrigger,
        isActivityScopedTrigger,
        allConditionFields,
        defaultConditionField,
        fieldMetaForValue,
        fieldOptionsForValue,
        fieldOptionsForNode,
    };
}

export type AutomationBuilder = ReturnType<typeof useAutomationBuilder>;
