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
import { format } from 'date-fns';
import { ExecutionLogViewer } from '@/components/automation/execution-log-viewer';
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
    Close as CloseIcon
} from '@mui/icons-material';
import { TestWorkflowDialog } from '@/components/automation/TestWorkflowDialog';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { AutomationV2 } from '@/types/automation-v2';

// Node types palette
const NODE_TYPES = [
    { type: 'trigger', label: 'Trigger', icon: ZapIcon, color: '#2196f3' },
    { type: 'condition', label: 'Condition (If/Then)', icon: GitBranchIcon, color: '#ff9800' },
    { type: 'update_field', label: 'Update Field', icon: DatabaseIcon, color: '#4caf50' },
    { type: 'create_activity', label: 'Create Activity', icon: PlayIcon, color: '#9c27b0' },
    { type: 'send_email', label: 'Send Email', icon: MailIcon, color: '#ff5722' },
    { type: 'webhook', label: 'Webhook', icon: WebhookIcon, color: '#e91e63' },
    { type: 'delay', label: 'Delay', icon: ClockIcon, color: '#607d8b' },
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

    // Form state
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [triggerType, setTriggerType] = useState('LEAD_CREATED');
    const [tabValue, setTabValue] = useState(0); // 0: Designer, 1: History
    const [executions, setExecutions] = useState<any[]>([]);

    // Node configuration
    const [nodeConfig, setNodeConfig] = useState<Record<string, any>>({});

    useEffect(() => {
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

            // Load workflow
            if (data.workflow?.nodes) {
                setNodes(data.workflow.nodes);
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
        const config = node.data || {};
        if (node.data?.type === 'trigger') {
            config.triggerType = triggerType;
        }
        setNodeConfig(config);
    }, [triggerType]);

    const addNode = (type: string) => {
        const nodeTypeInfo = NODE_TYPES.find((nt) => nt.type === type);
        if (!nodeTypeInfo) return;

        const newNode: Node = {
            id: `${type}-${Date.now()}`,
            type: 'expressive',
            position: { x: 250, y: nodes.length * 100 + 50 },
            data: {
                label: nodeTypeInfo.label,
                type,
            },
        };

        setNodes((nds) => nds.concat(newNode));
    };

    const updateNodeConfig = () => {
        if (!selectedNode) return;

        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === selectedNode.id) {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            ...nodeConfig,
                        },
                    };
                }
                return node;
            })
        );

        if (selectedNode.data?.type === 'trigger' && nodeConfig.triggerType) {
            setTriggerType(nodeConfig.triggerType);
        }

        toast.success("Node configuration updated");
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
                trigger: { type: triggerType },
                workflow: {
                    nodes: nodes.map(n => ({
                        ...n,
                        data: n.id === selectedNode?.id ? { ...n.data, ...nodeConfig } : n.data
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

    const onDragStart = (event: React.DragEvent, nodeType: string) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const type = event.dataTransfer.getData('application/reactflow');

            if (typeof type === 'undefined' || !type) {
                return;
            }

            const nodeTypeInfo = NODE_TYPES.find((nt) => nt.type === type);
            if (!nodeTypeInfo) return;

            const position = reactFlowInstance?.project({
                x: event.clientX - 320 - 50, // rough adjustment for sidebar
                y: event.clientY - 64 // rough adjustment for header
            }) || { x: event.clientX - 400, y: event.clientY - 100 };

            const newNode: Node = {
                id: `${type}-${Date.now()}`,
                type: 'expressive',
                position,
                data: {
                    label: nodeTypeInfo.label,
                    type,
                },
            };

            setNodes((nds) => nds.concat(newNode));
        },
        [reactFlowInstance, setNodes]
    );

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
                            <Box sx={{ mb: 4 }}>
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
                                            <MenuItem value="LEAD_CREATED">Lead Created</MenuItem>
                                            <MenuItem value="OPPORTUNITY_CREATED">Opportunity Created</MenuItem>
                                            <MenuItem value="STAGE_CHANGED">Stage Changed</MenuItem>
                                            <MenuItem value="MANUAL">Manual Trigger</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Stack>
                            </Box>

                            {/* Node Palette */}
                            <Box sx={{ mb: 4 }}>
                                <Typography variant="overline" sx={{ px: 1, fontWeight: 700, color: 'text.secondary', letterSpacing: 1.2 }}>
                                    Add Steps
                                </Typography>
                                <List dense disablePadding sx={{ mt: 1 }}>
                                    {NODE_TYPES.map((nodeType) => {
                                        const Icon = nodeType.icon;
                                        return (
                                            <ListItemButton
                                                key={nodeType.type}
                                                draggable
                                                onDragStart={(event) => onDragStart(event, nodeType.type)}
                                                onClick={() => addNode(nodeType.type)}
                                                sx={{
                                                    border: '1px solid',
                                                    borderColor: alpha(theme.palette.divider, 0.5),
                                                    mb: 1.5,
                                                    borderRadius: '20px',
                                                    py: 1.5,
                                                    bgcolor: 'background.paper',
                                                    transition: theme.transitions.create(['all'], { duration: 200 }),
                                                    '&:hover': {
                                                        borderColor: nodeType.color,
                                                        bgcolor: alpha(nodeType.color, 0.04),
                                                        transform: 'scale(1.02) translateX(4px)',
                                                        boxShadow: `0 4px 12px ${alpha(nodeType.color, 0.1)}`
                                                    }
                                                }}
                                            >
                                                <ListItemIcon sx={{ minWidth: 40 }}>
                                                    <Icon sx={{ color: nodeType.color, fontSize: 20 }} />
                                                </ListItemIcon>
                                                <ListItemText
                                                    primary={nodeType.label}
                                                    primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                                                />
                                            </ListItemButton>
                                        );
                                    })}
                                </List>
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
                                                    <MenuItem value="LEAD_CREATED">Lead Created</MenuItem>
                                                    <MenuItem value="OPPORTUNITY_CREATED">Opportunity Created</MenuItem>
                                                    <MenuItem value="STAGE_CHANGED">Stage Changed</MenuItem>
                                                    <MenuItem value="MANUAL">Manual Trigger</MenuItem>
                                                </Select>
                                            </FormControl>
                                        )}

                                        {selectedNode.data?.type === 'condition' && (
                                            <>
                                                <TextField label="Field to Check" fullWidth size="small" value={nodeConfig.field || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, field: e.target.value })} />
                                                <FormControl fullWidth size="small">
                                                    <InputLabel>Operator</InputLabel>
                                                    <Select value={nodeConfig.operator || 'equals'} label="Operator" onChange={(e) => setNodeConfig({ ...nodeConfig, operator: e.target.value })}>
                                                        <MenuItem value="equals">Equals</MenuItem>
                                                        <MenuItem value="not_equals">Not Equals</MenuItem>
                                                        <MenuItem value="contains">Contains</MenuItem>
                                                        <MenuItem value="greater_than">Greater Than</MenuItem>
                                                    </Select>
                                                </FormControl>
                                                <TextField label="Value" fullWidth size="small" value={nodeConfig.value || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, value: e.target.value })} />
                                            </>
                                        )}

                                        {selectedNode.data?.type === 'update_field' && (
                                            <>
                                                <TextField label="Field Name" fullWidth size="small" value={nodeConfig.field || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, field: e.target.value })} />
                                                <TextField label="New Value" fullWidth size="small" value={nodeConfig.value || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, value: e.target.value })} />
                                            </>
                                        )}

                                        {selectedNode.data?.type === 'send_email' && (
                                            <>
                                                <TextField label="To" fullWidth size="small" value={nodeConfig.to || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, to: e.target.value })} />
                                                <TextField label="Subject" fullWidth size="small" value={nodeConfig.subject || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, subject: e.target.value })} />
                                                <TextField label="Body" fullWidth multiline rows={3} size="small" value={nodeConfig.body || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, body: e.target.value })} />
                                            </>
                                        )}

                                        {selectedNode.data?.type === 'create_activity' && (
                                            <>
                                                <FormControl fullWidth size="small">
                                                    <InputLabel>Type</InputLabel>
                                                    <Select value={nodeConfig.type || 'NOTE'} label="Type" onChange={(e) => setNodeConfig({ ...nodeConfig, type: e.target.value })}>
                                                        <MenuItem value="NOTE">Note</MenuItem>
                                                        <MenuItem value="CALL">Call</MenuItem>
                                                        <MenuItem value="EMAIL">Email</MenuItem>
                                                    </Select>
                                                </FormControl>
                                                <TextField label="Subject" fullWidth size="small" value={nodeConfig.subject || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, subject: e.target.value })} />
                                                <TextField label="Notes" fullWidth multiline rows={2} size="small" value={nodeConfig.notes || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, notes: e.target.value })} />
                                            </>
                                        )}

                                        {selectedNode.data?.type === 'delay' && (
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
                                                        {format(new Date(exe.startedAt), 'MMM d, HH:mm')}
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
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                >
                    <ReactFlow
                        nodes={nodes}
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
