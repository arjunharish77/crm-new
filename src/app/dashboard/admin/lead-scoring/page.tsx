'use client';

import React, { useEffect, useState } from 'react';
import {
    Plus,
    Trash2,
    Pencil,
    Gauge,
    Play,
    TrendingUp,
    TrendingDown,
    Info,
    Loader2,
    BrainCircuit,
    History,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatWorkspaceDateTime } from '@/lib/date-format';
import { toast } from 'sonner';
import { StandardDialog } from '@/components/common/standard-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface ScoringRule {
    id: string;
    name: string;
    description?: string;
    fieldKey: string;
    operator: string;
    value?: string;
    scoreChange: number;
    isActive: boolean;
    order: number;
}

interface SelfLearningSettings {
    isEnabled: boolean;
    targetModules: Array<'LEAD' | 'OPPORTUNITY'>;
    objective: 'CONVERSION' | 'OPPORTUNITY_CREATED' | 'WIN_PROBABILITY' | 'STALL_RISK';
    minimumHistoricalRecords: number;
    lookbackDays: number;
    retrainCadence: 'MANUAL' | 'WEEKLY' | 'MONTHLY';
    fallbackMode: 'RULE_SCORE' | 'ZERO' | 'KEEP_EXISTING';
    lastRecomputedAt?: string | null;
}

const FIELD_OPTIONS = [
    { value: 'source', label: 'Lead Source' },
    { value: 'company', label: 'Company' },
    { value: 'status', label: 'Status' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'name', label: 'Name' },
];

const OPERATOR_OPTIONS = [
    { value: 'EQUALS', label: 'Equals', needsValue: true },
    { value: 'NOT_EQUALS', label: 'Does not equal', needsValue: true },
    { value: 'CONTAINS', label: 'Contains', needsValue: true },
    { value: 'GT', label: 'Greater than (numeric)', needsValue: true },
    { value: 'LT', label: 'Less than (numeric)', needsValue: true },
    { value: 'IS_SET', label: 'Is set (has any value)', needsValue: false },
    { value: 'IS_NOT_SET', label: 'Is not set (empty)', needsValue: false },
];

const EMPTY_RULE = {
    name: '',
    description: '',
    fieldKey: 'source',
    operator: 'EQUALS',
    value: '',
    scoreChange: 10,
    isActive: true,
    order: 0,
};

const DEFAULT_SELF_LEARNING_SETTINGS: SelfLearningSettings = {
    isEnabled: false,
    targetModules: ['LEAD', 'OPPORTUNITY'],
    objective: 'CONVERSION',
    minimumHistoricalRecords: 25,
    lookbackDays: 365,
    retrainCadence: 'MANUAL',
    fallbackMode: 'RULE_SCORE',
    lastRecomputedAt: null,
};

export default function LeadScoringAdminPage() {
    const [rules, setRules] = useState<ScoringRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<ScoringRule | null>(null);
    const [form, setForm] = useState<typeof EMPTY_RULE>({ ...EMPTY_RULE });
    const [saving, setSaving] = useState(false);
    const [recomputing, setRecomputing] = useState(false);
    const [selfLearningSettings, setSelfLearningSettings] = useState<SelfLearningSettings>(DEFAULT_SELF_LEARNING_SETTINGS);
    const [loadingSelfLearning, setLoadingSelfLearning] = useState(true);
    const [savingSelfLearning, setSavingSelfLearning] = useState(false);
    const [recomputingSelfLearning, setRecomputingSelfLearning] = useState(false);

    const fetchRules = async () => {
        try {
            const data = await apiFetch<ScoringRule[]>('/lead-scoring/rules');
            setRules(Array.isArray(data) ? data : []);
        } catch {
            toast.error('Failed to load scoring rules');
        } finally {
            setLoading(false);
        }
    };

    const fetchSelfLearningSettings = async () => {
        try {
            const data = await apiFetch<SelfLearningSettings>('/lead-scoring/self-learning/settings');
            setSelfLearningSettings({ ...DEFAULT_SELF_LEARNING_SETTINGS, ...data });
        } catch {
            toast.error('Failed to load predictive scoring settings');
        } finally {
            setLoadingSelfLearning(false);
        }
    };

    useEffect(() => {
        fetchRules();
        fetchSelfLearningSettings();
    }, []);

    const handleAdd = () => {
        setEditingRule(null);
        setForm({ ...EMPTY_RULE });
        setDialogOpen(true);
    };

    const handleEdit = (rule: ScoringRule) => {
        setEditingRule(rule);
        setForm({
            name: rule.name,
            description: rule.description || '',
            fieldKey: rule.fieldKey,
            operator: rule.operator,
            value: rule.value || '',
            scoreChange: rule.scoreChange,
            isActive: rule.isActive,
            order: rule.order,
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            const payload = {
                ...form,
                value: form.value || undefined,
            };
            if (editingRule) {
                const updated = await apiFetch<ScoringRule>(`/lead-scoring/rules/${editingRule.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(payload),
                });
                setRules(prev => prev.map(r => r.id === editingRule.id ? updated : r));
                toast.success('Rule updated');
            } else {
                const created = await apiFetch<ScoringRule>('/lead-scoring/rules', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
                setRules(prev => [...prev, created]);
                toast.success('Rule created');
            }
            setDialogOpen(false);
        } catch {
            toast.error('Failed to save rule');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (ruleId: string) => {
        if (!confirm('Delete this scoring rule?')) return;
        try {
            await apiFetch(`/lead-scoring/rules/${ruleId}`, { method: 'DELETE' });
            setRules(prev => prev.filter(r => r.id !== ruleId));
            toast.success('Rule deleted');
        } catch {
            toast.error('Failed to delete rule');
        }
    };

    const handleToggle = async (rule: ScoringRule) => {
        try {
            const updated = await apiFetch<ScoringRule>(`/lead-scoring/rules/${rule.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ isActive: !rule.isActive }),
            });
            setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
        } catch {
            toast.error('Failed to toggle rule');
        }
    };

    const handleRecomputeAll = async () => {
        if (!confirm('Recompute scores for ALL leads? This runs in the background and may take a moment for large teams.')) return;
        setRecomputing(true);
        try {
            const result = await apiFetch<{ queued: boolean; alreadyRunning: boolean }>('/lead-scoring/recompute-all', { method: 'POST' });
            toast.success(
                result.alreadyRunning
                    ? 'A recompute is already running — you\'ll be notified when it finishes.'
                    : 'Recompute queued. You can keep working — you\'ll get a notification when it\'s done.'
            );
        } catch {
            toast.error('Failed to queue recompute');
        } finally {
            setRecomputing(false);
        }
    };

    const handleSaveSelfLearningSettings = async () => {
        setSavingSelfLearning(true);
        try {
            const settings = await apiFetch<SelfLearningSettings>('/lead-scoring/self-learning/settings', {
                method: 'PUT',
                body: JSON.stringify(selfLearningSettings),
            });
            setSelfLearningSettings({ ...DEFAULT_SELF_LEARNING_SETTINGS, ...settings });
            toast.success('Predictive scoring settings saved');
        } catch {
            toast.error('Failed to save predictive scoring settings');
        } finally {
            setSavingSelfLearning(false);
        }
    };

    const handleSelfLearningRecompute = async () => {
        if (!confirm('Recompute predictive scores for selected modules? This runs in the background and will store score snapshots and update Lead.score when enabled.')) return;
        setRecomputingSelfLearning(true);
        try {
            const result = await apiFetch<{ queued: boolean; alreadyRunning: boolean }>('/lead-scoring/self-learning/recompute', {
                method: 'POST',
                body: JSON.stringify({ targetModules: selfLearningSettings.targetModules }),
            });
            toast.success(
                result.alreadyRunning
                    ? 'A predictive recompute is already running — you\'ll be notified when it finishes.'
                    : 'Predictive score recompute queued. You can keep working — you\'ll get a notification when it\'s done.'
            );
        } catch {
            toast.error('Failed to queue predictive score recompute');
        } finally {
            setRecomputingSelfLearning(false);
        }
    };

    const toggleTargetModule = (module: 'LEAD' | 'OPPORTUNITY', enabled: boolean) => {
        setSelfLearningSettings((current) => ({
            ...current,
            targetModules: enabled
                ? [...new Set([...current.targetModules, module])]
                : current.targetModules.filter((item) => item !== module),
        }));
    };

    const needsValue = OPERATOR_OPTIONS.find(o => o.value === form.operator)?.needsValue ?? true;

    return (
        <div>
            {/* Header */}
            <div className="mb-6 flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                    <Gauge className="size-7 text-primary" />
                    <div>
                        <h1 className="text-xl font-extrabold">Lead Scoring</h1>
                        <p className="text-sm text-muted-foreground">
                            Define rules to automatically score leads based on their attributes.
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleRecomputeAll} disabled={recomputing}>
                        {recomputing ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                        Recompute All
                    </Button>
                    <Button onClick={handleAdd}>
                        <Plus className="size-4" />
                        Add Rule
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="self-learning" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="self-learning">Predictive Scoring</TabsTrigger>
                    <TabsTrigger value="rules">Rule Fallback</TabsTrigger>
                </TabsList>

                <TabsContent value="self-learning" className="space-y-4">
                    <Alert variant="info">
                        <BrainCircuit />
                        <AlertDescription>
                            Predictive Scoring uses explainable feature snapshots plus historic conversion/win-rate calibration. Rule scoring remains the fallback when predictive scoring is disabled or confidence is low.
                        </AlertDescription>
                    </Alert>

                    {loadingSelfLearning ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="size-6 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
                            <div className="rounded-xl border bg-card p-4">
                                <div className="mb-4 flex items-start justify-between gap-4">
                                    <div>
                                        <h2 className="text-sm font-bold">Predictive Scoring Controls</h2>
                                        <p className="mt-1 text-xs text-muted-foreground">Enable scoring, choose target modules, and configure the historical data window.</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={selfLearningSettings.isEnabled}
                                            onCheckedChange={(checked) => setSelfLearningSettings((current) => ({ ...current, isEnabled: checked }))}
                                        />
                                        <span className="text-xs font-semibold">{selfLearningSettings.isEnabled ? 'Enabled' : 'Disabled'}</span>
                                    </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Target Modules</Label>
                                        <div className="grid gap-2 rounded-lg border p-3">
                                            <label className="flex items-center justify-between gap-3 text-sm">
                                                Leads
                                                <Switch
                                                    checked={selfLearningSettings.targetModules.includes('LEAD')}
                                                    onCheckedChange={(checked) => toggleTargetModule('LEAD', checked)}
                                                />
                                            </label>
                                            <label className="flex items-center justify-between gap-3 text-sm">
                                                Opportunities
                                                <Switch
                                                    checked={selfLearningSettings.targetModules.includes('OPPORTUNITY')}
                                                    onCheckedChange={(checked) => toggleTargetModule('OPPORTUNITY', checked)}
                                                />
                                            </label>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Objective</Label>
                                        <Select
                                            value={selfLearningSettings.objective}
                                            onValueChange={(value) => setSelfLearningSettings((current) => ({ ...current, objective: value as SelfLearningSettings['objective'] }))}
                                        >
                                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="CONVERSION">Lead conversion</SelectItem>
                                                <SelectItem value="OPPORTUNITY_CREATED">Opportunity creation</SelectItem>
                                                <SelectItem value="WIN_PROBABILITY">Opportunity win probability</SelectItem>
                                                <SelectItem value="STALL_RISK">Stall risk</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Minimum Historical Records</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            value={selfLearningSettings.minimumHistoricalRecords}
                                            onChange={(event) => setSelfLearningSettings((current) => ({ ...current, minimumHistoricalRecords: Number(event.target.value || 1) }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Lookback Window</Label>
                                        <Select
                                            value={String(selfLearningSettings.lookbackDays)}
                                            onValueChange={(value) => setSelfLearningSettings((current) => ({ ...current, lookbackDays: Number(value) }))}
                                        >
                                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="90">Last 90 days</SelectItem>
                                                <SelectItem value="180">Last 180 days</SelectItem>
                                                <SelectItem value="365">Last 12 months</SelectItem>
                                                <SelectItem value="730">Last 24 months</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Retrain Cadence</Label>
                                        <Select
                                            value={selfLearningSettings.retrainCadence}
                                            onValueChange={(value) => setSelfLearningSettings((current) => ({ ...current, retrainCadence: value as SelfLearningSettings['retrainCadence'] }))}
                                        >
                                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="MANUAL">Manual</SelectItem>
                                                <SelectItem value="WEEKLY">Weekly</SelectItem>
                                                <SelectItem value="MONTHLY">Monthly</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Fallback Mode</Label>
                                        <Select
                                            value={selfLearningSettings.fallbackMode}
                                            onValueChange={(value) => setSelfLearningSettings((current) => ({ ...current, fallbackMode: value as SelfLearningSettings['fallbackMode'] }))}
                                        >
                                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="RULE_SCORE">Use rule score</SelectItem>
                                                <SelectItem value="KEEP_EXISTING">Keep existing score</SelectItem>
                                                <SelectItem value="ZERO">Use zero</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Button onClick={handleSaveSelfLearningSettings} disabled={savingSelfLearning}>
                                        {savingSelfLearning ? <Loader2 className="size-4 animate-spin" /> : null}
                                        Save Settings
                                    </Button>
                                    <Button variant="outline" onClick={handleSelfLearningRecompute} disabled={recomputingSelfLearning || selfLearningSettings.targetModules.length === 0}>
                                        {recomputingSelfLearning ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                                        Recompute Predictive Scores
                                    </Button>
                                </div>
                            </div>

                            <div className="rounded-xl border bg-card p-4">
                                <div className="mb-4 flex items-center gap-2">
                                    <History className="size-4 text-primary" />
                                    <h2 className="text-sm font-bold">Current State</h2>
                                </div>
                                <div className="space-y-3 text-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-muted-foreground">Status</span>
                                        <Badge variant={selfLearningSettings.isEnabled ? 'default' : 'outline'}>{selfLearningSettings.isEnabled ? 'Enabled' : 'Fallback only'}</Badge>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-muted-foreground">Modules</span>
                                        <span className="font-semibold">{selfLearningSettings.targetModules.join(', ') || 'None'}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-muted-foreground">Last recomputed</span>
                                        <span className="text-right font-semibold">{selfLearningSettings.lastRecomputedAt ? formatWorkspaceDateTime(selfLearningSettings.lastRecomputedAt) : 'Never'}</span>
                                    </div>
                                    <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                                        Recompute runs in the background — you don&apos;t need to stay on this page. You&apos;ll get a notification when it finishes.
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="rules" className="space-y-4">
                    <Alert variant="info">
                        <Info />
                        <AlertDescription>
                            Rules are evaluated in order. The <strong>Score Change</strong> can be positive (add points) or negative (subtract points). Final score is clamped to <strong>0–100</strong>.
                        </AlertDescription>
                    </Alert>

                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="size-6 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-xl border">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                                        <TableHead>Rule Name</TableHead>
                                        <TableHead>Condition</TableHead>
                                        <TableHead>Score Δ</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rules.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                                                No rules yet. Add one to start scoring leads automatically.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        rules
                                            .sort((a, b) => a.order - b.order)
                                            .map(rule => (
                                                <TableRow key={rule.id} className={cn(!rule.isActive && "opacity-50")}>
                                                    <TableCell>
                                                        <p className="text-sm font-semibold">{rule.name}</p>
                                                        {rule.description && (
                                                            <p className="text-xs text-muted-foreground">{rule.description}</p>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <p className="font-mono text-xs">
                                                            <strong>{rule.fieldKey}</strong>{' '}
                                                            {rule.operator.replace(/_/g, ' ').toLowerCase()}{' '}
                                                            {rule.value ? <em>&quot;{rule.value}&quot;</em> : ''}
                                                        </p>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant="outline"
                                                            className={cn(
                                                                "font-bold",
                                                                rule.scoreChange > 0
                                                                    ? "border-primary/20 bg-primary/10 text-primary"
                                                                    : rule.scoreChange < 0
                                                                        ? "border-destructive/20 bg-destructive/10 text-destructive"
                                                                        : "border-border bg-muted text-muted-foreground"
                                                            )}
                                                        >
                                                            {rule.scoreChange >= 0 ? <TrendingUp /> : <TrendingDown />}
                                                            {rule.scoreChange >= 0 ? '+' : ''}{rule.scoreChange}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Switch checked={rule.isActive} onCheckedChange={() => handleToggle(rule)} />
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-0.5">
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(rule)}>
                                                                        <Pencil className="size-4" />
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Edit</TooltipContent>
                                                            </Tooltip>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon-sm"
                                                                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                                        onClick={() => handleDelete(rule.id)}
                                                                    >
                                                                        <Trash2 className="size-4" />
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Delete</TooltipContent>
                                                            </Tooltip>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* Add/Edit Dialog */}
            <StandardDialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                title={editingRule ? 'Edit Scoring Rule' : 'New Scoring Rule'}
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={!form.name.trim() || saving}>
                            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                            {saving ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="rule-name">Rule name *</Label>
                        <Input
                            id="rule-name"
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="rule-description">Description</Label>
                        <Input
                            id="rule-description"
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        />
                    </div>

                    <p className="pt-1 text-sm font-bold">Condition</p>
                    <div className="flex gap-3">
                        <div className="flex-1 space-y-2">
                            <Label>Field</Label>
                            <Select
                                value={form.fieldKey}
                                onValueChange={value => setForm(f => ({ ...f, fieldKey: value }))}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {FIELD_OPTIONS.map(o => (
                                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex-[1.5] space-y-2">
                            <Label>Operator</Label>
                            <Select
                                value={form.operator}
                                onValueChange={value => setForm(f => ({ ...f, operator: value }))}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {OPERATOR_OPTIONS.map(o => (
                                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    {needsValue && (
                        <div className="space-y-2">
                            <Label htmlFor="rule-value">Value</Label>
                            <Input
                                id="rule-value"
                                value={form.value}
                                onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                                placeholder='e.g. "Website" or "50"'
                            />
                        </div>
                    )}

                    <p className="pt-1 text-sm font-bold">Score Impact</p>
                    <div className="flex items-center gap-4">
                        <div className="w-40 space-y-2">
                            <Label htmlFor="rule-score-change">Score change</Label>
                            <Input
                                id="rule-score-change"
                                type="number"
                                value={form.scoreChange}
                                onChange={e => setForm(f => ({ ...f, scoreChange: parseInt(e.target.value) || 0 }))}
                            />
                            <p className="text-xs text-muted-foreground">Positive = add, negative = subtract</p>
                        </div>
                        <div className="w-24 space-y-2">
                            <Label htmlFor="rule-order">Order</Label>
                            <Input
                                id="rule-order"
                                type="number"
                                value={form.order}
                                onChange={e => setForm(f => ({ ...f, order: parseInt(e.target.value) || 0 }))}
                            />
                            <p className="text-xs text-muted-foreground">Lower = first</p>
                        </div>
                        <div className="flex items-center gap-2 pt-6">
                            <Switch
                                id="rule-active"
                                checked={form.isActive}
                                onCheckedChange={checked => setForm(f => ({ ...f, isActive: checked }))}
                            />
                            <Label htmlFor="rule-active">Active</Label>
                        </div>
                    </div>
                </div>
            </StandardDialog>
        </div>
    );
}
