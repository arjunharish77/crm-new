'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Plus, RefreshCw, LayoutDashboard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { StandardDialog } from '@/components/common/standard-dialog';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { DashboardWidget } from './widget-library';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

interface SortableWidgetProps {
    widget: any;
    onEdit: (widget: any) => void;
    onDelete: (id: string) => void;
}

function SortableWidget({ widget, onEdit, onDelete }: SortableWidgetProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: widget.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        height: '100%'
    };

    return (
        <div
            className={cn(
                "col-span-12",
                widget.layout?.w === 2 ? "" : "md:col-span-6 lg:col-span-4"
            )}
            ref={setNodeRef}
            style={style}
            {...attributes}
        >
            <div className="relative h-full">
                <DashboardWidget
                    widget={widget}
                    onEdit={() => onEdit(widget)}
                    onDelete={() => onDelete(widget.id)}
                />
                <div
                    {...listeners}
                    className="absolute top-2 left-1/2 h-2 w-10 -translate-x-1/2 cursor-grab rounded-full bg-foreground/10 opacity-0 transition-opacity hover:opacity-100"
                />
            </div>
        </div>
    );
}

export function DashboardManager() {
    const [widgets, setWidgets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [editingWidget, setEditingWidget] = useState<any | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const fetchWidgets = useCallback(async () => {
        try {
            setLoading(true);
            const data = await apiFetch('/dashboard-widgets');
            setWidgets(data);
        } catch (err) {
            console.error('Failed to fetch widgets', err);
            toast.error('Failed to load dashboard widgets');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchWidgets();
    }, [fetchWidgets]);

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = widgets.findIndex(i => i.id === active.id);
            const newIndex = widgets.findIndex(i => i.id === over.id);
            const nextWidgets = arrayMove(widgets, oldIndex, newIndex).map((widget, index) => ({
                ...widget,
                layout: {
                    ...(widget.layout ?? {}),
                    y: index,
                    x: widget.layout?.x ?? 0,
                }
            }));

            setWidgets(nextWidgets);

            try {
                await Promise.all(
                    nextWidgets.map((widget) =>
                        apiFetch(`/dashboard-widgets/${widget.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({
                                layout: widget.layout,
                            })
                        })
                    )
                );
            } catch (err) {
                console.error('Failed to persist widget order', err);
                toast.error('Widget order could not be saved');
                fetchWidgets();
            }
        }
    };

    const handleDeleteWidget = async (id: string) => {
        try {
            await apiFetch(`/dashboard-widgets/${id}`, { method: 'DELETE' });
            setWidgets(prev => prev.filter(w => w.id !== id));
            toast.success('Widget removed');
        } catch (err) {
            console.error('Failed to delete widget', err);
            toast.error('Failed to delete widget');
        }
    };

    const initializeDefaults = async () => {
        try {
            setLoading(true);
            await apiFetch('/dashboard-widgets/presets', { method: 'POST' });
            await fetchWidgets();
            toast.success('Default dashboard initialized');
        } catch (err) {
            console.error('Failed to initialize defaults', err);
            toast.error('Failed to initialize default dashboard');
        } finally {
            setLoading(false);
        }
    };

    if (loading && widgets.length === 0) {
        return (
            <div className="flex justify-center p-16">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (widgets.length === 0) {
        return (
            <div className="rounded-3xl border border-dashed border-border bg-card py-24 text-center">
                <LayoutDashboard className="mx-auto mb-4 size-16 text-muted-foreground/40" />
                <h2 className="mb-2 text-2xl font-bold">Welcome to your Dashboard</h2>
                <p className="mb-8 text-muted-foreground">You haven&apos;t added any widgets yet. Start by initializing the default set.</p>
                <Button size="lg" className="rounded-2xl" onClick={initializeDefaults}>
                    <Plus className="size-4" />
                    Initialize Default Dashboard
                </Button>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-3xl font-extrabold">Dashboard</h1>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={fetchWidgets}>
                        <RefreshCw className="size-4" />
                        Refresh
                    </Button>
                    <Button className="rounded-2xl" onClick={() => setIsAdding(true)}>
                        <Plus className="size-4" />
                        Add Widget
                    </Button>
                </div>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={widgets.map(w => w.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="grid grid-cols-12 gap-6">
                        {widgets.map((widget) => (
                            <SortableWidget
                                key={widget.id}
                                widget={widget}
                                onEdit={setEditingWidget}
                                onDelete={handleDeleteWidget}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            <AddWidgetDialog
                open={isAdding || !!editingWidget}
                widget={editingWidget}
                onClose={() => {
                    setIsAdding(false);
                    setEditingWidget(null);
                }}
                onAdded={fetchWidgets}
            />
        </div>
    );
}

const WIDGET_TYPE_OPTIONS = [
    { value: 'STAT', label: 'Stat Summary' },
    { value: 'TREND', label: 'Trend Chart' },
    { value: 'BAR', label: 'Bar Comparison' },
    { value: 'FUNNEL', label: 'Sales Funnel' },
];

const DATA_MODULE_OPTIONS = [
    { value: 'LEADS', label: 'Leads' },
    { value: 'OPPORTUNITIES', label: 'Opportunities' },
    { value: 'ACTIVITIES', label: 'Activities' },
];

const REPORT_WIDGET_OPTIONS = [
    {
        value: 'sla_response_breaches',
        label: 'SLA Response Breaches',
        types: ['STAT', 'BAR'],
        metrics: [
            { value: 'totals.responseBreaches', label: 'Response breaches' },
            { value: 'totals.activitySlaBreaches', label: 'Activity SLA breaches' },
            { value: 'breachRate', label: 'Breach rate by owner' },
        ],
    },
    {
        value: 'rep_performance',
        label: 'Rep Performance',
        types: ['STAT', 'BAR'],
        metrics: [
            { value: 'wonOpportunities', label: 'Won opportunities' },
            { value: 'activitiesCreated', label: 'Activities created' },
            { value: 'conversionRate', label: 'Conversion rate' },
            { value: 'avgFirstResponseMinutes', label: 'Avg first response' },
        ],
    },
    {
        value: 'reassignment_impact',
        label: 'Reassignment Impact',
        types: ['STAT', 'BAR'],
        metrics: [
            { value: 'wonConversionRate', label: 'Won conversion rate' },
            { value: 'opportunityConversionRate', label: 'Opportunity conversion rate' },
            { value: 'responseBreachRate', label: 'Response breach rate' },
            { value: 'wonOpportunities', label: 'Won opportunities' },
        ],
    },
    {
        value: 'activity_call_volume_trends',
        label: 'Activity & Call Volume',
        types: ['STAT', 'TREND', 'BAR'],
        metrics: [
            { value: 'activities', label: 'Activities' },
            { value: 'calls', label: 'Calls' },
            { value: 'completed', label: 'Completed' },
            { value: 'overdue', label: 'Overdue' },
        ],
    },
    {
        value: 'commission_payout_summary',
        label: 'Commission & Payout Summary',
        types: ['STAT', 'BAR'],
        metrics: [
            { value: 'totals.netCommission', label: 'Net commission' },
            { value: 'totals.paidPayout', label: 'Paid payout' },
            { value: 'totals.invoiceTotal', label: 'Invoice total' },
            { value: 'payoutStatusCounts', label: 'Payout status counts' },
            { value: 'netCommission', label: 'Partner net commission' },
        ],
    },
    {
        value: 'data_quality',
        label: 'Data Quality',
        types: ['STAT', 'BAR'],
        metrics: [
            { value: 'totals.duplicateLeads', label: 'Duplicate leads' },
            { value: 'totals.staleLeads', label: 'Stale leads' },
            { value: 'totals.missingOwner', label: 'Missing owner' },
            { value: 'issues', label: 'Issues by type' },
        ],
    },
    {
        value: 'predictive_scoring',
        label: 'Predictive Scoring',
        types: ['STAT', 'BAR'],
        metrics: [
            { value: 'hotLeads', label: 'Hot leads' },
            { value: 'highRiskOpportunities', label: 'High-risk opportunities' },
            { value: 'staleHighFitLeads', label: 'Stale high-fit leads' },
            { value: 'avgConversionProbability', label: 'Avg conversion probability' },
            { value: 'leadScoreDistribution', label: 'Lead score distribution' },
            { value: 'opportunityScoreDistribution', label: 'Opportunity score distribution' },
            { value: 'scoreToConversionPerformance', label: 'Score-to-conversion performance' },
        ],
    },
];

function AddWidgetDialog({ open, widget, onClose, onAdded }: { open: boolean, widget?: any | null, onClose: () => void, onAdded: () => void }) {
    const [title, setTitle] = useState('');
    const [source, setSource] = useState<'module' | 'report'>('module');
    const [type, setType] = useState('STAT');
    const [module, setModule] = useState('LEADS');
    const [moduleGroupBy, setModuleGroupBy] = useState('status');
    const [reportKey, setReportKey] = useState(REPORT_WIDGET_OPTIONS[0].value);
    const selectedReport = REPORT_WIDGET_OPTIONS.find((option) => option.value === reportKey) ?? REPORT_WIDGET_OPTIONS[0];
    const [reportMetric, setReportMetric] = useState(selectedReport.metrics[0].value);

    useEffect(() => {
        if (!open) return;
        const config = widget?.config ?? {};
        const isReportBacked = Boolean(config.reportKey);
        setTitle(widget?.title ?? '');
        setType(widget?.type ?? 'STAT');
        setSource(isReportBacked ? 'report' : 'module');
        setModule(String(config.module ?? 'LEADS'));
        setModuleGroupBy(String(config.groupBy ?? 'status'));
        const nextReportKey = String(config.reportKey ?? REPORT_WIDGET_OPTIONS[0].value);
        const nextReport = REPORT_WIDGET_OPTIONS.find((option) => option.value === nextReportKey) ?? REPORT_WIDGET_OPTIONS[0];
        setReportKey(nextReport.value);
        setReportMetric(String(config.metric ?? nextReport.metrics[0].value));
    }, [open, widget]);

    useEffect(() => {
        if (source !== 'report') return;
        if (!selectedReport.types.includes(type)) setType(selectedReport.types[0]);
        if (!selectedReport.metrics.some((metric) => metric.value === reportMetric)) {
            setReportMetric(selectedReport.metrics[0].value);
        }
    }, [reportMetric, selectedReport, source, type]);

    const handleSave = async () => {
        const config: Record<string, any> = source === 'report'
            ? { reportKey, metric: reportMetric }
            : { module, metric: 'COUNT' };
        if (source === 'module' && type === 'TREND') {
            config.groupBy = 'createdAt';
        }
        if (source === 'module' && type === 'BAR' && module === 'LEADS') {
            config.groupBy = moduleGroupBy;
        }

        try {
            await apiFetch(widget ? `/dashboard-widgets/${widget.id}` : '/dashboard-widgets', {
                method: widget ? 'PATCH' : 'POST',
                body: JSON.stringify({
                    title,
                    type,
                    config,
                    layout: { ...(widget?.layout ?? {}), w: type === 'TREND' || type === 'BAR' || type === 'FUNNEL' ? 2 : 1, h: 1 }
                })
            });
            onAdded();
            onClose();
            toast.success(widget ? 'Widget updated' : 'Widget added');
        } catch (err) {
            console.error('Failed to save widget', err);
            toast.error('Failed to save widget');
        }
    };

    return (
        <StandardDialog
            open={open}
            onClose={onClose}
            title={widget ? "Edit Dashboard Widget" : "Add Dashboard Widget"}
            maxWidth="sm"
            actions={
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave} disabled={!title.trim()}>{widget ? "Save Changes" : "Add Widget"}</Button>
                </>
            }
        >
            <div className="flex flex-col gap-4 pt-1">
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="widget-title">Widget Title</Label>
                    <Input
                        id="widget-title"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                    />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <Label>Data Source</Label>
                        <Select value={source} onValueChange={(value) => setSource(value as 'module' | 'report')}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="module">CRM module</SelectItem>
                                <SelectItem value="report">Inbuilt report</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label>Widget Type</Label>
                        <Select value={type} onValueChange={setType}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(source === 'report'
                                    ? WIDGET_TYPE_OPTIONS.filter((option) => selectedReport.types.includes(option.value))
                                    : WIDGET_TYPE_OPTIONS
                                ).map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {source === 'module' ? (
                    <>
                        <div className="flex flex-col gap-1.5">
                            <Label>Data Module</Label>
                            <Select value={module} onValueChange={setModule}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {DATA_MODULE_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {type === 'BAR' && module === 'LEADS' ? (
                            <div className="flex flex-col gap-1.5">
                                <Label>Group Leads By</Label>
                                <Select value={moduleGroupBy} onValueChange={setModuleGroupBy}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="status">Status</SelectItem>
                                        <SelectItem value="source">Source</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : null}
                    </>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                            <Label>Report</Label>
                            <Select value={reportKey} onValueChange={setReportKey}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {REPORT_WIDGET_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label>Metric</Label>
                            <Select value={reportMetric} onValueChange={setReportMetric}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {selectedReport.metrics.map((metric) => (
                                        <SelectItem key={metric.value} value={metric.value}>
                                            {metric.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )}
            </div>
        </StandardDialog>
    );
}
