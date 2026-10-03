'use client';

import { PageHeader } from "@/components/layout/page-header";

import React, { useEffect, useState } from 'react';
import {
    Plus,
    Gauge,
    Trash2,
    Pencil,
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
import { useAskText, useConfirm } from "@/components/common/dialogs-provider";
import { useArchiveActions } from "@/hooks/use-archive-actions";
import { ArchivedItemsSection } from "@/components/common/archived-items-section";
import Link from 'next/link';
import { ErrorState } from '@/components/common/error-state';
import { EmptyState } from '@/components/common/empty-state';
import { StatusBadge } from '@/components/common/status-badge';
import { useModuleEnabled } from '@/components/auth/feature-gate';
import { formatCount } from '@/lib/display/format';
import { humanizeEnum } from '@/lib/display/status';
import type { PredictiveRecordScore } from '@/types/leads';

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
    approvalMode?: 'MANUAL' | 'AUTO_PROMOTE_IF_BETTER';
    featureRetentionDays?: number;
    lastRecomputedAt?: string | null;
}

interface FeatureCatalogItem {
    id: string;
    targetModule: 'LEAD' | 'OPPORTUNITY';
    fieldKey: string;
    label: string;
    source: string;
    dataType: string;
    isIncluded: boolean;
    isSensitive: boolean;
    isProhibited: boolean;
    coveragePercent?: number | null;
    nonNullCount?: number;
    distinctCount?: number;
    lastProfiledAt?: string | null;
}

interface ScoringModelVersionSummary {
    id: string;
    versionNumber: number;
    algorithm: string;
    status: 'DRAFT' | 'PROMOTED' | 'RETIRED';
    metrics?: {
        trainCount?: number;
        holdoutCount?: number;
        holdout?: {
            sampleSize?: number;
            brierScore?: number | null;
            accuracy?: number | null;
            precision?: number | null;
            recall?: number | null;
            lift?: number | null;
        };
        advanced?: {
            driftFromPrevious?: { brierScoreDelta?: number | null };
            safeguards?: Array<{ code: string; severity: string; message: string }>;
        } | null;
        featureImportance?: Array<{ feature: string; importance: number }>;
    } | null;
    promotedBy?: string | null;
    promotedAt?: string | null;
    createdAt: string;
}

interface ScoringModelSummary {
    id: string;
    name: string;
    targetModule: 'LEAD' | 'OPPORTUNITY';
    objective: string;
    status: string;
    versions: ScoringModelVersionSummary[];
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
    approvalMode: 'MANUAL',
    featureRetentionDays: 365,
    lastRecomputedAt: null,
};

export default function LeadScoringAdminPage() {
    const confirm = useConfirm();
    const [archiveToken, setArchiveToken] = useState(0);
    const { archive } = useArchiveActions({ basePath: "/lead-scoring/rules", archiveKind: "lead-scoring-rule", noun: "scoring rule", onChange: () => { fetchRules(); setArchiveToken((token) => token + 1); } });
    const askText = useAskText();
    const [activeSection, setActiveSection] = useState('self-learning');
    const [loadErrors, setLoadErrors] = useState<Record<string, boolean>>({});
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
    const [modelSummaries, setModelSummaries] = useState<ScoringModelSummary[]>([]);
    const [loadingModels, setLoadingModels] = useState(true);
    const [promotingVersionId, setPromotingVersionId] = useState<string | null>(null);
    const [featureCatalog, setFeatureCatalog] = useState<FeatureCatalogItem[]>([]);
    const [loadingFeatureCatalog, setLoadingFeatureCatalog] = useState(true);
    const [profilingFeatures, setProfilingFeatures] = useState(false);

    const fetchModelVersions = async () => {
        setLoadingModels(true);
        setLoadErrors(current => ({ ...current, models: false }));
        try {
            const data = await apiFetch<ScoringModelSummary[]>('/lead-scoring/self-learning/models');
            setModelSummaries(Array.isArray(data) ? data : []);
        } catch {
            setLoadErrors(current => ({ ...current, models: true }));
        } finally {
            setLoadingModels(false);
        }
    };

    const fetchFeatureCatalog = async () => {
        setLoadingFeatureCatalog(true);
        setLoadErrors(current => ({ ...current, features: false }));
        try {
            const data = await apiFetch<FeatureCatalogItem[]>('/lead-scoring/self-learning/feature-catalog');
            setFeatureCatalog(Array.isArray(data) ? data : []);
        } catch {
            setLoadErrors(current => ({ ...current, features: true }));
        } finally {
            setLoadingFeatureCatalog(false);
        }
    };

    const handleProfileFeatures = async () => {
        setProfilingFeatures(true);
        try {
            const data = await apiFetch<FeatureCatalogItem[]>('/lead-scoring/self-learning/feature-catalog', { method: 'POST' });
            setFeatureCatalog(Array.isArray(data) ? data : []);
            toast.success('Feature coverage refreshed from latest score snapshots');
        } catch {
            toast.error('Failed to profile features');
        } finally {
            setProfilingFeatures(false);
        }
    };

    const updateFeatureFlag = async (item: FeatureCatalogItem, patch: Partial<FeatureCatalogItem>) => {
        const nextItem = { ...item, ...patch };
        setFeatureCatalog((current) => current.map((row) => row.id === item.id ? nextItem : row));
        try {
            const data = await apiFetch<FeatureCatalogItem[]>('/lead-scoring/self-learning/feature-catalog', {
                method: 'PUT',
                body: JSON.stringify({ items: [nextItem] }),
            });
            setFeatureCatalog(Array.isArray(data) ? data : []);
        } catch {
            toast.error('Failed to update feature setting');
            await fetchFeatureCatalog();
        }
    };

    const handlePromoteVersion = async (versionId: string) => {
        const reviewNotes = await askText({ title: "Promote this version?", description: "It becomes the calibration for live predictive scores right away, and the version promoted now is retired.", label: "Review notes (optional)", confirmLabel: "Promote" });
        if (reviewNotes === null) return;
        setPromotingVersionId(versionId);
        try {
            await apiFetch(`/lead-scoring/self-learning/models/${versionId}/promote`, {
                method: 'POST',
                body: JSON.stringify({ reviewNotes }),
            });
            toast.success('Model version promoted. Live scores will use it from the next recompute onward.');
            await fetchModelVersions();
        } catch {
            toast.error('Failed to promote model version');
        } finally {
            setPromotingVersionId(null);
        }
    };

    const fetchRules = async () => {
        setLoading(true);
        setLoadErrors(current => ({ ...current, rules: false }));
        try {
            const data = await apiFetch<ScoringRule[]>('/lead-scoring/rules');
            setRules(Array.isArray(data) ? data : []);
        } catch {
            setLoadErrors(current => ({ ...current, rules: true }));
        } finally {
            setLoading(false);
        }
    };

    const fetchSelfLearningSettings = async () => {
        setLoadingSelfLearning(true);
        setLoadErrors(current => ({ ...current, settings: false }));
        try {
            const data = await apiFetch<SelfLearningSettings>('/lead-scoring/self-learning/settings');
            setSelfLearningSettings({ ...DEFAULT_SELF_LEARNING_SETTINGS, ...data });
        } catch {
            setLoadErrors(current => ({ ...current, settings: true }));
        } finally {
            setLoadingSelfLearning(false);
        }
    };

    useEffect(() => {
        fetchRules();
        fetchSelfLearningSettings();
        fetchModelVersions();
        fetchFeatureCatalog();
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

    // Delete archives the rule (decision 31): Undo in the toast, restore from Archived for 30 days.
    const handleDelete = async (ruleId: string) => {
        const rule = rules.find((item) => item.id === ruleId);
        if (rule) await archive({ id: ruleId, name: rule.name });
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
        if (!(await confirm({ title: "Recompute scores for all leads?", description: "It runs in the background and can take a while in a large workspace.", confirmLabel: "Recompute" }))) return;
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
        if (!(await confirm({ title: "Recompute predictive scores?", description: "It runs in the background, stores score snapshots and updates lead scores when that's turned on.", confirmLabel: "Recompute" }))) return;
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
            <PageHeader title="Lead scoring" description="Configure predictive scoring and fallback rules." actions={
                <div className="flex max-w-full flex-wrap gap-2">
                    <Button variant="outline" onClick={handleRecomputeAll} disabled={recomputing || loading || !!loadErrors.rules}>
                        {recomputing ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                        Recompute All
                    </Button>
                    <Button onClick={handleAdd}>
                        <Plus className="size-4" />
                        Add Rule
                    </Button>
                </div>
            } />

            <Tabs value={activeSection} onValueChange={setActiveSection} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="self-learning">Predictive</TabsTrigger>
                    <TabsTrigger value="features">Features</TabsTrigger>
                    <TabsTrigger value="rules">Rules</TabsTrigger>
                </TabsList>

                <TabsContent value="self-learning" forceMount hidden={activeSection !== "self-learning"} className="space-y-4">
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
                    ) : loadErrors.settings ? (
                        <div role="alert" className="rounded-lg border p-4 text-sm">Failed to load predictive scoring settings. <Button variant="outline" size="sm" onClick={fetchSelfLearningSettings}>Retry</Button></div>
                    ) : (
                        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
                            <div className="rounded-xl border bg-card p-4">
                                <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <h2 className="text-sm font-bold">Predictive Scoring Controls</h2>
                                        <p className="mt-1 text-xs text-muted-foreground">Enable scoring, choose target modules, and configure the historical data window.</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            aria-label="Enable predictive scoring"
                                            checked={selfLearningSettings.isEnabled}
                                            onCheckedChange={(checked) => setSelfLearningSettings((current) => ({ ...current, isEnabled: checked }))}
                                        />
                                        <span className="text-xs font-semibold">{selfLearningSettings.isEnabled ? 'Enabled' : 'Disabled'}</span>
                                    </div>
                                </div>

                                <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Target Modules</Label>
                                        <div className="grid gap-2 rounded-lg border p-3">
                                            <label className="flex flex-wrap items-center justify-between gap-3 text-sm">
                                                Leads
                                                <Switch
                                                    checked={selfLearningSettings.targetModules.includes('LEAD')}
                                                    onCheckedChange={(checked) => toggleTargetModule('LEAD', checked)}
                                                />
                                            </label>
                                            <label className="flex flex-wrap items-center justify-between gap-3 text-sm">
                                                Opportunities
                                                <Switch
                                                    checked={selfLearningSettings.targetModules.includes('OPPORTUNITY')}
                                                    onCheckedChange={(checked) => toggleTargetModule('OPPORTUNITY', checked)}
                                                />
                                            </label>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="scoring-objective">Objective</Label>
                                        <Select
                                            value={selfLearningSettings.objective}
                                            onValueChange={(value) => setSelfLearningSettings((current) => ({ ...current, objective: value as SelfLearningSettings['objective'] }))}
                                        >
                                            <SelectTrigger id="scoring-objective" className="w-full"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="CONVERSION">Lead conversion</SelectItem>
                                                <SelectItem value="OPPORTUNITY_CREATED">Opportunity creation</SelectItem>
                                                <SelectItem value="WIN_PROBABILITY">Opportunity win probability</SelectItem>
                                                <SelectItem value="STALL_RISK">Stall risk</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="scoring-minimum-historical-records">Minimum Historical Records</Label>
                                        <Input id="scoring-minimum-historical-records"
                                            type="number"
                                            min={1}
                                            value={selfLearningSettings.minimumHistoricalRecords}
                                            onChange={(event) => setSelfLearningSettings((current) => ({ ...current, minimumHistoricalRecords: Number(event.target.value || 1) }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="scoring-lookback-window">Lookback Window</Label>
                                        <Select
                                            value={String(selfLearningSettings.lookbackDays)}
                                            onValueChange={(value) => setSelfLearningSettings((current) => ({ ...current, lookbackDays: Number(value) }))}
                                        >
                                            <SelectTrigger id="scoring-lookback-window" className="w-full"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="90">Last 90 days</SelectItem>
                                                <SelectItem value="180">Last 180 days</SelectItem>
                                                <SelectItem value="365">Last 12 months</SelectItem>
                                                <SelectItem value="730">Last 24 months</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="scoring-retrain-cadence">Retrain Cadence</Label>
                                        <Select
                                            value={selfLearningSettings.retrainCadence}
                                            onValueChange={(value) => setSelfLearningSettings((current) => ({ ...current, retrainCadence: value as SelfLearningSettings['retrainCadence'] }))}
                                        >
                                            <SelectTrigger id="scoring-retrain-cadence" className="w-full"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="MANUAL">Manual</SelectItem>
                                                <SelectItem value="WEEKLY">Weekly</SelectItem>
                                                <SelectItem value="MONTHLY">Monthly</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="scoring-fallback-mode">Fallback Mode</Label>
                                        <Select
                                            value={selfLearningSettings.fallbackMode}
                                            onValueChange={(value) => setSelfLearningSettings((current) => ({ ...current, fallbackMode: value as SelfLearningSettings['fallbackMode'] }))}
                                        >
                                            <SelectTrigger id="scoring-fallback-mode" className="w-full"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="RULE_SCORE">Use rule score</SelectItem>
                                                <SelectItem value="KEEP_EXISTING">Keep existing score</SelectItem>
                                                <SelectItem value="ZERO">Use zero</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="scoring-promotion-approval">Promotion Approval</Label>
                                        <Select
                                            value={selfLearningSettings.approvalMode ?? 'MANUAL'}
                                            onValueChange={(value) => setSelfLearningSettings((current) => ({ ...current, approvalMode: value as SelfLearningSettings['approvalMode'] }))}
                                        >
                                            <SelectTrigger id="scoring-promotion-approval" className="w-full"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="MANUAL">Manual review</SelectItem>
                                                <SelectItem value="AUTO_PROMOTE_IF_BETTER">Auto-promote if better</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="scoring-feature-retention-days">Feature Retention Days</Label>
                                        <Input id="scoring-feature-retention-days"
                                            type="number"
                                            min={30}
                                            value={selfLearningSettings.featureRetentionDays ?? 365}
                                            onChange={(event) => setSelfLearningSettings((current) => ({ ...current, featureRetentionDays: Number(event.target.value || 365) }))}
                                        />
                                    </div>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Button onClick={handleSaveSelfLearningSettings} disabled={savingSelfLearning}>
                                        {savingSelfLearning ? <Loader2 className="size-4 animate-spin" /> : null}
                                        Save Settings
                                    </Button>
                                    <Button variant="outline" onClick={handleSelfLearningRecompute} disabled={recomputingSelfLearning || selfLearningSettings.targetModules.length === 0}>
                                        {recomputingSelfLearning ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                                        Recompute Scores
                                    </Button>
                                </div>
                            </div>

                            <div className="rounded-xl border bg-card p-4">
                                <div className="mb-4 flex items-center gap-2">
                                    <History className="size-4 text-primary" />
                                    <h2 className="text-sm font-bold">Current State</h2>
                                </div>
                                <div className="space-y-3 text-sm">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <span className="text-muted-foreground">Status</span>
                                        <Badge variant={selfLearningSettings.isEnabled ? 'default' : 'outline'}>{selfLearningSettings.isEnabled ? 'Enabled' : 'Fallback only'}</Badge>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <span className="text-muted-foreground">Modules</span>
                                        <span className="font-semibold">{selfLearningSettings.targetModules.join(', ') || 'None'}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-3">
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

                    <div className="rounded-xl border bg-card p-4">
                        <div className="mb-4 flex items-center gap-2">
                            <BrainCircuit className="size-4 text-primary" />
                            <h2 className="text-sm font-bold">Model Versions</h2>
                        </div>
                        <p className="mb-4 text-xs text-muted-foreground">
                            Every recompute trains a new candidate version and evaluates it on held-out data it never saw during training. Nothing changes live scores until you promote a version — promoting retires whichever version was previously active. Promoting an older version is how you roll back.
                        </p>
                        {loadingModels ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : loadErrors.models ? (
                        <div role="alert" className="rounded-lg border p-4 text-sm">Failed to load scoring model versions. <Button variant="outline" size="sm" onClick={fetchModelVersions}>Retry</Button></div>
                    ) : modelSummaries.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">No model versions yet — run a predictive score recompute to train the first one.</p>
                        ) : (
                            <div className="space-y-6">
                                {modelSummaries.map((model) => (
                                    <div key={model.id}>
                                        <div className="mb-2 flex items-center gap-2">
                                            <Badge variant="outline">{model.targetModule}</Badge>
                                            <span className="text-sm font-semibold">{model.name}</span>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Version</TableHead>
                                                        <TableHead>Status</TableHead>
                                                        <TableHead>Algorithm</TableHead>
                                                        <TableHead>Brier</TableHead>
                                                        <TableHead>Holdout accuracy</TableHead>
                                                        <TableHead>Precision / Recall</TableHead>
                                                        <TableHead>Lift</TableHead>
                                                        <TableHead>Train / Holdout</TableHead>
                                                        <TableHead>Created</TableHead>
                                                        <TableHead className="text-right">Action</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {model.versions.map((version) => (
                                                        <TableRow key={version.id}>
                                                            <TableCell className="font-medium">v{version.versionNumber}</TableCell>
                                                            <TableCell>
                                                                <Badge variant={version.status === 'PROMOTED' ? 'default' : version.status === 'RETIRED' ? 'outline' : 'secondary'}>
                                                                    {version.status}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <Badge variant="outline" className="cursor-default">
                                                                            {version.algorithm === 'GRADIENT_BOOSTED_TREES_V1'
                                                                                ? 'ML service GBT'
                                                                                : version.algorithm === 'LOGISTIC_REGRESSION_V1'
                                                                                    ? 'Fitted logistic'
                                                                                    : 'Weighted calibration'}
                                                                        </Badge>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>
                                                                        {version.algorithm === 'GRADIENT_BOOSTED_TREES_V1'
                                                                            ? 'Gradient-boosted trees from the dedicated ML service won model comparison on held-out records.'
                                                                            : version.algorithm === 'LOGISTIC_REGRESSION_V1'
                                                                            ? 'A logistic regression model was fit on this tenant\'s data and outperformed the fixed heuristic on held-out records, so it was used.'
                                                                            : 'The fixed weighted-calibration heuristic was used -- either there wasn\'t enough contrast in the data to fit a model, or it didn\'t beat the heuristic on held-out records.'}
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </TableCell>
                                                            <TableCell>
                                                                {version.metrics?.holdout?.brierScore != null ? version.metrics.holdout.brierScore.toFixed(3) : '—'}
                                                            </TableCell>
                                                            <TableCell>
                                                                {version.metrics?.holdout?.accuracy != null
                                                                    ? `${Math.round(version.metrics.holdout.accuracy * 100)}%`
                                                                    : '—'}
                                                            </TableCell>
                                                            <TableCell>
                                                                {version.metrics?.holdout?.precision != null || version.metrics?.holdout?.recall != null
                                                                    ? `${Math.round((version.metrics.holdout.precision ?? 0) * 100)}% / ${Math.round((version.metrics.holdout.recall ?? 0) * 100)}%`
                                                                    : '—'}
                                                            </TableCell>
                                                            <TableCell>
                                                                {version.metrics?.holdout?.lift != null ? `${version.metrics.holdout.lift.toFixed(2)}x` : '—'}
                                                            </TableCell>
                                                            <TableCell className="text-xs text-muted-foreground">
                                                                {version.metrics?.trainCount ?? 0} / {version.metrics?.holdoutCount ?? 0}
                                                            </TableCell>
                                                            <TableCell className="text-xs text-muted-foreground">{formatWorkspaceDateTime(version.createdAt)}</TableCell>
                                                            <TableCell className="text-right">
                                                                {version.status === 'PROMOTED' ? (
                                                                    <span className="text-xs text-muted-foreground">Active</span>
                                                                ) : (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        disabled={promotingVersionId === version.id}
                                                                        onClick={() => handlePromoteVersion(version.id)}
                                                                    >
                                                                        {promotingVersionId === version.id ? <Loader2 className="size-3 animate-spin" /> : null}
                                                                        {version.status === 'RETIRED' ? 'Roll back to this' : 'Promote'}
                                                                    </Button>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <ScorePreviewSection />
                </TabsContent>

                <TabsContent value="features" forceMount hidden={activeSection !== "features"} className="space-y-4">
                    <div className="rounded-xl border bg-card p-4">
                        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-bold">Feature Catalog</h2>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Include or exclude scoring inputs, mark sensitive fields, prohibit restricted fields, and preview coverage before training.
                                </p>
                            </div>
                            <Button variant="outline" onClick={handleProfileFeatures} disabled={profilingFeatures}>
                                {profilingFeatures ? <Loader2 className="size-4 animate-spin" /> : <Gauge className="size-4" />}
                                Profile Coverage
                            </Button>
                        </div>

                        {loadingFeatureCatalog ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : loadErrors.features ? (
                        <div role="alert" className="rounded-lg border p-4 text-sm">Failed to load scoring feature catalog. <Button variant="outline" size="sm" onClick={fetchFeatureCatalog}>Retry</Button></div>
                    ) : featureCatalog.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-6 text-center">
                                <p className="text-sm font-semibold">No profiled features yet</p>
                                <p className="mt-1 text-xs text-muted-foreground">Run a predictive recompute, then profile coverage to inspect available model inputs.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-lg border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Feature</TableHead>
                                            <TableHead>Module</TableHead>
                                            <TableHead>Source</TableHead>
                                            <TableHead>Coverage</TableHead>
                                            <TableHead>Use</TableHead>
                                            <TableHead>Sensitive</TableHead>
                                            <TableHead>Prohibited</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {featureCatalog.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell>
                                                    <p className="text-sm font-semibold">{item.label}</p>
                                                    <p className="text-xs text-muted-foreground">{item.fieldKey}</p>
                                                </TableCell>
                                                <TableCell><Badge variant="outline">{item.targetModule}</Badge></TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{item.source}</TableCell>
                                                <TableCell className="text-sm">
                                                    {item.coveragePercent == null ? '—' : `${item.coveragePercent}%`}
                                                    <p className="text-xs text-muted-foreground">{item.nonNullCount ?? 0} values</p>
                                                </TableCell>
                                                <TableCell>
                                                    <Switch
                                                        checked={item.isIncluded && !item.isProhibited}
                                                        disabled={item.isProhibited}
                                                        onCheckedChange={(checked) => updateFeatureFlag(item, { isIncluded: checked })}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Switch
                                                        checked={item.isSensitive}
                                                        onCheckedChange={(checked) => updateFeatureFlag(item, { isSensitive: checked })}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Switch
                                                        checked={item.isProhibited}
                                                        onCheckedChange={(checked) => updateFeatureFlag(item, { isProhibited: checked, isIncluded: checked ? false : item.isIncluded })}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="rules" forceMount hidden={activeSection !== "rules"} className="space-y-4">
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
                    ) : loadErrors.rules ? (
                        <div role="alert" className="rounded-lg border p-4 text-sm">Failed to load scoring rules. <Button variant="outline" size="sm" onClick={fetchRules}>Retry</Button></div>
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
                    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                        <div className="min-w-0 space-y-2">
                            <Label htmlFor="scoring-field">Field</Label>
                            <Select
                                value={form.fieldKey}
                                onValueChange={value => setForm(f => ({ ...f, fieldKey: value }))}
                            >
                                <SelectTrigger id="scoring-field" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {FIELD_OPTIONS.map(o => (
                                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="min-w-0 space-y-2">
                            <Label htmlFor="scoring-operator">Operator</Label>
                            <Select
                                value={form.operator}
                                onValueChange={value => setForm(f => ({ ...f, operator: value }))}
                            >
                                <SelectTrigger id="scoring-operator" className="w-full">
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
                    <div className="flex flex-wrap items-center gap-4">
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
            <ArchivedItemsSection kind="lead-scoring-rule" basePath="/lead-scoring/rules" noun="scoring rule" title="Archived rules" refreshToken={archiveToken} onChange={() => fetchRules()} />
        </div>
    );
}

// GET /lead-scoring/self-learning/scores returns at most this many rows, newest first.
const SCORE_PREVIEW_LIMIT = 500;

// "Score preview" -- the live predictive scores records have right now, so an admin can see
// what the current model and settings actually produce before or after a recompute.
function ScorePreviewSection() {
    const moduleEnabled = useModuleEnabled('PREDICTIVE_SCORING');
    const [recordType, setRecordType] = useState<'LEAD' | 'OPPORTUNITY'>('LEAD');
    const [scores, setScores] = useState<PredictiveRecordScore[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        if (!moduleEnabled) return;
        const controller = new AbortController();
        setLoading(true);
        setLoadError(false);
        apiFetch<PredictiveRecordScore[]>(`/lead-scoring/self-learning/scores?recordType=${recordType}`, { signal: controller.signal })
            .then((data) => setScores(Array.isArray(data) ? data : []))
            .catch((error) => {
                if (error?.name === 'AbortError') return;
                setLoadError(true);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [moduleEnabled, recordType, reloadKey]);

    const recordLabel = recordType === 'LEAD' ? 'lead' : 'opportunity';

    return (
        <div className="rounded-xl border bg-card p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-bold">Score preview</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        The predictive scores records have right now, most recently calculated first. Recompute scores to refresh them.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Select value={recordType} onValueChange={(value) => setRecordType(value as 'LEAD' | 'OPPORTUNITY')}>
                        <SelectTrigger aria-label="Record type" className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="LEAD">Leads</SelectItem>
                            <SelectItem value="OPPORTUNITY">Opportunities</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)} disabled={!moduleEnabled || loading}>
                        Refresh
                    </Button>
                </div>
            </div>

            {!moduleEnabled ? (
                <ErrorState kind="module" variant="inline" description="Turn on Predictive scoring in Settings › Modules to see scores." />
            ) : loading ? (
                <div className="flex justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
            ) : loadError ? (
                <ErrorState variant="inline" description="Predictive scores couldn't be loaded." onRetry={() => setReloadKey((key) => key + 1)} />
            ) : scores.length === 0 ? (
                <EmptyState
                    variant="inline"
                    title={`No ${recordLabel} scores yet`}
                    description="Run Recompute scores to calculate them."
                />
            ) : (
                <>
                    {/* Up to 500 rows: scroll inside the card so the rest of the page stays reachable. */}
                    <div className="max-h-120 overflow-auto rounded-lg border">
                        <Table>
                            <TableHeader className="sticky top-0 z-10 bg-card">
                                <TableRow>
                                    <TableHead>Record</TableHead>
                                    <TableHead>Band</TableHead>
                                    <TableHead>{recordType === 'LEAD' ? 'Conversion' : 'Win'} probability</TableHead>
                                    <TableHead>Fit</TableHead>
                                    <TableHead>Engagement</TableHead>
                                    <TableHead>Confidence</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead>Top driver</TableHead>
                                    <TableHead>Calculated</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {scores.map((score) => {
                                    const probability = score.recordType === 'OPPORTUNITY' ? score.winProbability : score.conversionProbability;
                                    const topDriver = (score.topDrivers ?? score.reasons ?? [])[0];
                                    return (
                                        <TableRow key={score.id}>
                                            <TableCell>
                                                <Link
                                                    href={score.recordType === 'OPPORTUNITY' ? `/dashboard/opportunities/${score.recordId}` : `/dashboard/leads/${score.recordId}`}
                                                    className="text-sm text-primary hover:underline"
                                                >
                                                    Open {score.recordType === 'OPPORTUNITY' ? 'opportunity' : 'lead'}
                                                </Link>
                                                <div className="font-mono text-xs text-muted-foreground">{score.recordId.slice(0, 8)}</div>
                                            </TableCell>
                                            <TableCell><StatusBadge kind="scoreBand" value={score.scoreBand} /></TableCell>
                                            <TableCell className="tabular-nums">{probability != null ? `${probability}%` : '—'}</TableCell>
                                            <TableCell className="tabular-nums">{score.fitScore ?? '—'}</TableCell>
                                            <TableCell className="tabular-nums">{score.engagementScore ?? '—'}</TableCell>
                                            <TableCell className="tabular-nums">{score.confidence != null ? `${score.confidence}%` : '—'}</TableCell>
                                            <TableCell className="text-xs">{humanizeEnum(score.source)}</TableCell>
                                            <TableCell className="max-w-64 whitespace-normal break-words text-xs text-muted-foreground">
                                                {topDriver ? (
                                                    <span className="inline-flex items-start gap-1">
                                                        {topDriver.type === 'POSITIVE' ? <TrendingUp className="mt-0.5 size-3 shrink-0" /> : topDriver.type === 'NEGATIVE' ? <TrendingDown className="mt-0.5 size-3 shrink-0" /> : null}
                                                        {topDriver.label}
                                                    </span>
                                                ) : '—'}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{score.calculatedAt ? formatWorkspaceDateTime(score.calculatedAt) : '—'}</TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                        {scores.length >= SCORE_PREVIEW_LIMIT
                            ? `Showing the ${formatCount(SCORE_PREVIEW_LIMIT)} most recently calculated ${recordLabel} scores. Older scores aren't listed here.`
                            : `${formatCount(scores.length)} ${recordLabel} score${scores.length === 1 ? '' : 's'}.`}
                    </p>
                </>
            )}
        </div>
    );
}
