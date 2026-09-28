'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Plus, RefreshCw, LayoutDashboard, Loader2, X, Pencil, Trash2, Save, MoreVertical, History, Copy, UserCog, Archive, RotateCcw, Download, Star } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { ErrorState } from '@/components/common/error-state';
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
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StandardDialog } from '@/components/common/standard-dialog';
import { apiFetch } from '@/lib/api';
import { formatWorkspaceDate } from '@/lib/date-format';
import { toast } from 'sonner';
import { DashboardWidget, type DashboardCrossFilter } from './widget-library';
import { NbaPendingApprovalsPanel } from '@/components/next-best-action/nba-pending-approvals-panel';
// Gap checklist Module 17, item 4 (advanced dashboard builder: true 2D drag/drop grid).
// Replaces @dnd-kit's vertical-list-only reorder (drag up/down within a single column) with a
// real 2D grid -- widgets can be placed and resized on both axes, not just re-ordered.
// react-grid-layout 2.x rewrote its primary API to a composable (gridConfig/dragConfig/...)
// shape with no built-in width auto-measurement -- the `/legacy` subpath re-exports the
// original v1-compatible flat-props component (ReactGridLayout) plus WidthProvider, which is
// what every real-world usage of this library (including its own README) still assumes.
import ReactGridLayout, { WidthProvider } from 'react-grid-layout/legacy';
import { cn } from '@/lib/utils';

const GridLayout = WidthProvider(ReactGridLayout);
const GRID_COLUMNS = 12;
const GRID_ROW_HEIGHT = 32;

// Gap checklist Module 17, item 3 (advanced dashboard builder: "persona templates"). The
// backend (`seedDashboardPresetForTenant`) already accepts an explicit persona and only ever
// adds widgets whose title doesn't already exist -- genuinely safe to re-apply at any time,
// not just once. The only real gap was the UI: no persona picker existed, and the "Initialize
// Default Dashboard" button only ever appeared in the empty state, auto-detecting the persona
// with no way to explicitly pick or re-apply a different one's template afterward.
const PERSONA_OPTIONS = [
    { value: 'admin', label: 'Admin' },
    { value: 'manager', label: 'Manager' },
    { value: 'rep', label: 'Rep' },
    { value: 'partner', label: 'Partner' },
];

export function DashboardManager() {
    const [widgets, setWidgets] = useState<any[]>([]);
    const [tabs, setTabs] = useState<any[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const [savedLayouts, setSavedLayouts] = useState<any[]>([]);
    const [activeFilter, setActiveFilter] = useState<DashboardCrossFilter>(null);
    const [newTabName, setNewTabName] = useState('');
    const [addingTab, setAddingTab] = useState(false);
    const [layoutName, setLayoutName] = useState('');
    const [savingLayout, setSavingLayout] = useState(false);
    const [restoringSnapshotId, setRestoringSnapshotId] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [editingWidget, setEditingWidget] = useState<any | null>(null);
    const [selectedPersona, setSelectedPersona] = useState('admin');
    const [applyingTemplate, setApplyingTemplate] = useState(false);
    // Gap checklist Module 17 ("dashboard/report versioning"). A "dashboard" here is a
    // DashboardTab -- versionHistoryTabId tracks which tab's publish/history dialog is open.
    const [versionHistoryTabId, setVersionHistoryTabId] = useState<string | null>(null);
    // Gap checklist Module 10's "mobile responsive pass" item -- react-grid-layout's plain
    // (non-Responsive) variant has one fixed column count regardless of viewport (see
    // GRID_COLUMNS above), so a widget positioned for a 12-column desktop layout gets squeezed
    // into illegible slivers on a narrow screen. Drag/resize is a desktop power-user feature
    // anyway, so mobile gets a simple, read-order-preserving stacked list instead of trying to
    // teach react-grid-layout a second, responsive column count.
    const [isMobile, setIsMobile] = useState(true);

    useEffect(() => {
        const workspace = document.getElementById('dashboard-workspace');
        if (!workspace) return;
        const update = () => setIsMobile(workspace.clientWidth < 900);
        const observer = new ResizeObserver(update);
        observer.observe(workspace);
        update();
        return () => observer.disconnect();
    }, []);

    // A widget shared to this viewer (TEAM/TENANT visibility) has no tab this viewer's own tab
    // list can meaningfully place it into -- see the migration header for why tabs are per-owner,
    // not per-viewer. Those widgets always render under this pseudo-tab instead.
    const SHARED_TAB_ID = '__shared__';

    const fetchAll = useCallback(async () => {
        try {
            setLoading(true);
            setLoadError(false);
            const [widgetData, tabData, layoutData] = await Promise.all([
                apiFetch<any[]>('/dashboard-widgets'),
                apiFetch<any[]>('/dashboard-tabs'),
                apiFetch<any[]>('/dashboard-layouts'),
            ]);
            setWidgets(Array.isArray(widgetData) ? widgetData : []);
            setTabs(Array.isArray(tabData) ? tabData : []);
            setSavedLayouts(Array.isArray(layoutData) ? layoutData : []);
        } catch (err) {
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    // Once tabs load, default to the user's own default tab (or the first tab) -- never leaves
    // activeTabId pointing at a tab that no longer exists.
    useEffect(() => {
        if (!tabs.length) return;
        if (activeTabId && (activeTabId === SHARED_TAB_ID || tabs.some((tab) => tab.id === activeTabId))) return;
        setActiveTabId(tabs.find((tab) => tab.isDefault)?.id ?? tabs[0].id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabs]);

    // Lets the global create menu (header.tsx) open the "Add Widget" dialog on load -- read via
    // window.location, not next/navigation's useSearchParams, matching this app's existing
    // convention (views/page.tsx, tasks/page.tsx) since this page isn't wrapped in a Suspense
    // boundary.
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get("create") === "1") {
            setIsAdding(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const hasSharedWidgets = widgets.some((widget) => widget.isOwner === false);
    const defaultTabId = tabs.find((tab) => tab.isDefault)?.id ?? tabs[0]?.id ?? null;
    const visibleWidgets = useMemo(() => {
        if (activeTabId === SHARED_TAB_ID) return widgets.filter((widget) => widget.isOwner === false);
        return widgets.filter((widget) => widget.isOwner !== false && (widget.tabId ?? defaultTabId) === activeTabId);
    }, [widgets, activeTabId, defaultTabId]);

    const gridLayoutItems = useMemo(() => visibleWidgets.map((widget) => ({
        i: widget.id,
        x: widget.layout?.x ?? 0,
        y: widget.layout?.y ?? 0,
        w: widget.layout?.w ?? 4,
        h: widget.layout?.h ?? 3,
        isDraggable: widget.isOwner !== false,
        isResizable: widget.isOwner !== false,
    })), [visibleWidgets]);

    // Reading order for the mobile stacked list -- top-to-bottom, left-to-right by each
    // widget's own desktop grid position, so the stacked order still matches what the widget's
    // owner arranged rather than an arbitrary fetch order.
    const mobileOrderedWidgets = useMemo(
        () => [...visibleWidgets].sort((a, b) => (a.layout?.y ?? 0) - (b.layout?.y ?? 0) || (a.layout?.x ?? 0) - (b.layout?.x ?? 0)),
        [visibleWidgets],
    );

    const switchTab = (tabId: string) => {
        setActiveTabId(tabId);
        setActiveFilter(null);
        // Fire-and-forget usage tracking (gap checklist Module 17's "usage metrics" sub-item) --
        // only on an actual tab switch, not every render.
        if (tabId !== SHARED_TAB_ID) {
            apiFetch(`/dashboard-tabs/${tabId}/open`, { method: 'POST' }).catch(() => undefined);
        }
    };

    const handleLayoutSettled = async (nextLayout: Array<{ i: string; x: number; y: number; w: number; h: number }>) => {
        const changed = nextLayout.filter((item) => {
            const widget = widgets.find((w) => w.id === item.i);
            if (!widget || widget.isOwner === false) return false;
            const layout = widget.layout ?? {};
            return layout.x !== item.x || layout.y !== item.y || layout.w !== item.w || layout.h !== item.h;
        });
        if (!changed.length) return;
        setWidgets((current) => current.map((widget) => {
            const item = nextLayout.find((entry) => entry.i === widget.id);
            return item ? { ...widget, layout: { x: item.x, y: item.y, w: item.w, h: item.h } } : widget;
        }));
        try {
            await Promise.all(changed.map((item) =>
                apiFetch(`/dashboard-widgets/${item.i}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ layout: { x: item.x, y: item.y, w: item.w, h: item.h } }),
                })
            ));
        } catch (err) {
            console.error('Failed to persist widget layout', err);
            toast.error('Layout could not be saved');
            fetchAll();
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
            await fetchAll();
            toast.success('Default dashboard initialized');
        } catch (err) {
            console.error('Failed to initialize defaults', err);
            toast.error('Failed to initialize default dashboard');
        } finally {
            setLoading(false);
        }
    };

    // Explicitly re-appliable at any time, unlike the empty-state-only `initializeDefaults`
    // above (kept as-is for that first-run flow). Safe to click repeatedly or across personas --
    // the backend only ever adds widgets whose title isn't already present, never duplicates or
    // overwrites existing ones.
    const applyPersonaTemplate = async () => {
        setApplyingTemplate(true);
        try {
            const result = await apiFetch<{ created: unknown[] }>('/dashboard-widgets/presets', {
                method: 'POST',
                body: JSON.stringify({ persona: selectedPersona }),
            });
            await fetchAll();
            const createdCount = Array.isArray(result.created) ? result.created.length : 0;
            toast.success(
                createdCount > 0
                    ? `Added ${createdCount} widget${createdCount === 1 ? '' : 's'} from the ${selectedPersona} template`
                    : `Every widget in the ${selectedPersona} template is already on your dashboard`
            );
        } catch (err) {
            console.error('Failed to apply persona template', err);
            toast.error('Failed to apply persona template');
        } finally {
            setApplyingTemplate(false);
        }
    };

    // Gap checklist Module 17, item 4 ("dashboard tabs").
    const createTab = async () => {
        if (!newTabName.trim()) return;
        try {
            const created = await apiFetch<any>('/dashboard-tabs', { method: 'POST', body: JSON.stringify({ name: newTabName.trim() }) });
            setTabs((current) => [...current, created]);
            setActiveTabId(created.id);
            setNewTabName('');
            setAddingTab(false);
        } catch (err: any) {
            toast.error(err.message || 'Failed to create tab');
        }
    };

    const renameTab = async (id: string, name: string) => {
        try {
            const updated = await apiFetch<any>(`/dashboard-tabs/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
            setTabs((current) => current.map((tab) => (tab.id === id ? updated : tab)));
        } catch (err: any) {
            toast.error(err.message || 'Failed to rename tab');
        }
    };

    // Gap checklist Module 10's user workspace personalization item, "preferred dashboard"
    // sub-item -- previously isDefault only ever got set implicitly (first tab created, or
    // whichever tab a deletion promotes); this is the first real user-facing action to pick one.
    const setDefaultTab = async (id: string) => {
        try {
            const updated = await apiFetch<any>(`/dashboard-tabs/${id}/set-default`, { method: 'POST' });
            setTabs((current) => current.map((tab) => (tab.id === id ? updated : { ...tab, isDefault: false })));
            toast.success('Set as your default tab');
        } catch (err: any) {
            toast.error(err.message || 'Failed to set default tab');
        }
    };

    const deleteTab = async (id: string) => {
        try {
            const remaining = await apiFetch<any[]>(`/dashboard-tabs/${id}`, { method: 'DELETE' });
            setTabs(Array.isArray(remaining) ? remaining : []);
            await fetchAll();
            toast.success('Tab deleted -- its widgets moved to your default tab');
        } catch (err: any) {
            toast.error(err.message || 'Failed to delete tab');
        }
    };

    // Gap checklist Module 17 ("dashboard/report versioning": draft/publish, clone, owner
    // transfer, deprecation workflow). A version snapshots the tab's name plus the full
    // definition of every widget currently on it.
    const publishTabVersion = async (id: string) => {
        const notes = window.prompt('Publish notes (optional)') ?? undefined;
        try {
            const updated = await apiFetch<any>(`/dashboard-tabs/${id}/versions`, { method: 'POST', body: JSON.stringify({ publishNotes: notes || null }) });
            setTabs((current) => current.map((tab) => (tab.id === id ? updated : tab)));
            toast.success(`Published version ${updated.currentVersion}`);
        } catch (err: any) {
            toast.error(err.message || 'Failed to publish version');
        }
    };

    const cloneTab = async (id: string, name: string) => {
        const newName = window.prompt('Name for the cloned dashboard', `${name} (Copy)`);
        if (!newName || !newName.trim()) return;
        try {
            const created = await apiFetch<any>(`/dashboard-tabs/${id}/clone`, { method: 'POST', body: JSON.stringify({ name: newName.trim() }) });
            await fetchAll();
            setActiveTabId(created.id);
            toast.success(`Cloned to "${created.name}"`);
        } catch (err: any) {
            toast.error(err.message || 'Failed to clone tab');
        }
    };

    const transferTabOwner = async (id: string) => {
        const newOwnerUserId = window.prompt("New owner's user id");
        if (!newOwnerUserId || !newOwnerUserId.trim()) return;
        try {
            await apiFetch(`/dashboard-tabs/${id}/transfer`, { method: 'POST', body: JSON.stringify({ newOwnerUserId: newOwnerUserId.trim() }) });
            await fetchAll();
            toast.success('Dashboard ownership transferred');
        } catch (err: any) {
            toast.error(err.message || 'Failed to transfer ownership');
        }
    };

    const toggleTabDeprecation = async (tab: any) => {
        const nextStatus = tab.deprecationStatus === 'DEPRECATED' ? 'ACTIVE' : 'DEPRECATED';
        const reason = nextStatus === 'DEPRECATED' ? window.prompt('Deprecation reason (optional)') ?? undefined : undefined;
        try {
            const updated = await apiFetch<any>(`/dashboard-tabs/${tab.id}/deprecation`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus, reason: reason || null }) });
            setTabs((current) => current.map((item) => (item.id === tab.id ? updated : item)));
        } catch (err: any) {
            toast.error(err.message || 'Failed to update deprecation status');
        }
    };

    // Gap checklist Module 17, item 4 ("saved dashboard states"). Captures tab assignment + grid
    // position for every widget you own -- never a widget's data-source config.
    const saveLayout = async () => {
        if (!layoutName.trim()) return;
        setSavingLayout(true);
        try {
            const snapshot = await apiFetch<any>('/dashboard-layouts', { method: 'POST', body: JSON.stringify({ name: layoutName.trim() }) });
            setSavedLayouts((current) => [snapshot, ...current.filter((item) => item.id !== snapshot.id)]);
            setLayoutName('');
            toast.success(`Saved layout "${snapshot.name}"`);
        } catch (err: any) {
            toast.error(err.message || 'Failed to save layout');
        } finally {
            setSavingLayout(false);
        }
    };

    const restoreLayout = async () => {
        if (!restoringSnapshotId) return;
        try {
            const result = await apiFetch<{ restored: number; skipped: number }>(`/dashboard-layouts/${restoringSnapshotId}/restore`, { method: 'POST' });
            await fetchAll();
            toast.success(`Restored ${result.restored} widget${result.restored === 1 ? '' : 's'}${result.skipped ? ` (${result.skipped} no longer exist)` : ''}`);
        } catch (err: any) {
            toast.error(err.message || 'Failed to restore layout');
        }
    };

    const deleteSnapshot = async (id: string) => {
        try {
            await apiFetch(`/dashboard-layouts/${id}`, { method: 'DELETE' });
            setSavedLayouts((current) => current.filter((item) => item.id !== id));
            if (restoringSnapshotId === id) setRestoringSnapshotId('');
        } catch (err: any) {
            toast.error(err.message || 'Failed to delete saved layout');
        }
    };

    if (loadError) return <><PageHeader title="Dashboard" /><ErrorState description="Dashboard widgets and layouts could not be loaded." onRetry={fetchAll} /></>;
    if (loading && widgets.length === 0) {
        return (
            <div className="flex justify-center p-16">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (widgets.length === 0) {
        return (
            <div className="rounded-3xl border border-dashed border-border bg-card px-4 py-12 text-center">
                <LayoutDashboard className="mx-auto mb-4 size-16 text-muted-foreground/40" />
                <h2 className="mb-2 text-2xl font-bold">Welcome to your Dashboard</h2>
                <p className="mb-8 text-muted-foreground">You haven&apos;t added any widgets yet. Start by initializing the default set.</p>
                <Button size="lg" className="h-auto min-h-10 whitespace-normal rounded-lg" onClick={initializeDefaults}>
                    <Plus className="size-4" />
                    Initialize Default Dashboard
                </Button>
            </div>
        );
    }

    return (
        <div>
            <PageHeader title="Dashboard" description="Your saved performance views and widgets." actions={<>
                <Button variant="outline" onClick={fetchAll} disabled={loading}><RefreshCw className="size-4" />Refresh</Button>
                <Button onClick={() => setIsAdding(true)}><Plus className="size-4" />Add Widget</Button>
            </>} />
            <details className="mb-4 rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">Add widgets from a template</summary>
                <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                    <Label htmlFor="dashboard-persona">Template</Label>
                    <Select value={selectedPersona} onValueChange={setSelectedPersona}>
                        <SelectTrigger id="dashboard-persona" className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>{PERSONA_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button variant="outline" onClick={applyPersonaTemplate} disabled={applyingTemplate}>{applyingTemplate ? 'Applying...' : 'Apply Template'}</Button>
                </div>
            </details>

            <div className="mb-4 flex flex-wrap items-center gap-2 border-b pb-3">
                {tabs.map((tab) => (
                    <div key={tab.id} className="group relative flex min-w-0 max-w-full items-center">
                        <button
                            onClick={() => switchTab(tab.id)}
                            className={cn(
                                'min-w-0 break-words rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                                activeTabId === tab.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                            )}
                        >
                            {tab.name}
                            {tab.deprecationStatus === 'DEPRECATED' ? (
                                <Badge variant="outline" className="ml-1.5 py-0 text-[10px]">Deprecated</Badge>
                            ) : null}
                        </button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="ml-0.5 rounded p-1 shrink-0 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${tab.name} tab options`}>
                                    <MoreVertical className="size-3" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuItem onClick={() => {
                                    const next = window.prompt('Rename tab', tab.name);
                                    if (next && next.trim()) renameTab(tab.id, next.trim());
                                }}>
                                    <Pencil className="size-4" />
                                    Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setDefaultTab(tab.id)} disabled={tab.isDefault}>
                                    <Star className="size-4" />
                                    {tab.isDefault ? 'Your default tab' : 'Set as Default'}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => publishTabVersion(tab.id)}>
                                    <Save className="size-4" />
                                    Publish Version{tab.currentVersion ? ` (current: v${tab.currentVersion})` : ''}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setVersionHistoryTabId(tab.id)}>
                                    <History className="size-4" />
                                    Version History
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => cloneTab(tab.id, tab.name)}>
                                    <Copy className="size-4" />
                                    Clone
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => transferTabOwner(tab.id)}>
                                    <UserCog className="size-4" />
                                    Transfer Owner
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => toggleTabDeprecation(tab)}>
                                    <Archive className="size-4" />
                                    {tab.deprecationStatus === 'DEPRECATED' ? 'Reactivate' : 'Deprecate'}
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <a href={`/api/dashboard-tabs/${tab.id}/export/pdf`} target="_blank" rel="noreferrer">
                                        <Download className="size-4" />
                                        Export PDF
                                    </a>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => deleteTab(tab.id)}
                                    disabled={tabs.length <= 1}
                                >
                                    <Trash2 className="size-4" />
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                ))}
                {hasSharedWidgets ? (
                    <button
                        onClick={() => switchTab(SHARED_TAB_ID)}
                        className={cn(
                            'min-w-0 break-words rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                            activeTabId === SHARED_TAB_ID ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                        )}
                    >
                        Shared with you
                    </button>
                ) : null}
                {addingTab ? (
                    <div className="flex items-center gap-1">
                        <Input
                            autoFocus
                            value={newTabName}
                            onChange={(e) => setNewTabName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') createTab(); if (e.key === 'Escape') setAddingTab(false); }}
                            aria-label="Tab name" placeholder="Tab name"
                            className="h-8 w-32"
                        />
                        <Button size="icon-sm" variant="ghost" aria-label="Create tab" onClick={createTab}><Plus className="size-4" /></Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Cancel new tab" onClick={() => { setAddingTab(false); setNewTabName(''); }}><X className="size-4" /></Button>
                    </div>
                ) : (
                    <Button size="icon-sm" variant="ghost" onClick={() => setAddingTab(true)} aria-label="Add tab">
                        <Plus className="size-4" />
                    </Button>
                )}
            </div>

            <div className="mb-4 flex min-w-0 flex-wrap items-center gap-2 rounded-xl border bg-muted/20 p-2">
                <span className="text-xs font-bold uppercase text-muted-foreground">Saved Layouts</span>
                <Input value={layoutName} onChange={(e) => setLayoutName(e.target.value)} aria-label="Layout name" placeholder="Layout name" className="h-8 w-40" />
                <Button size="sm" variant="outline" onClick={saveLayout} disabled={savingLayout || !layoutName.trim()}>
                    <Save className="size-4" />
                    Save Current
                </Button>
                {savedLayouts.length > 0 ? (
                    <>
                        <Select value={restoringSnapshotId} onValueChange={setRestoringSnapshotId}>
                            <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Choose a saved layout" /></SelectTrigger>
                            <SelectContent>
                                {savedLayouts.map((snapshot) => <SelectItem key={snapshot.id} value={snapshot.id}>{snapshot.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" onClick={restoreLayout} disabled={!restoringSnapshotId}>Restore</Button>
                        {restoringSnapshotId ? (
                            <Button size="icon-sm" variant="ghost" onClick={() => deleteSnapshot(restoringSnapshotId)} aria-label="Delete saved layout">
                                <Trash2 className="size-4 text-destructive" />
                            </Button>
                        ) : null}
                    </>
                ) : null}
            </div>

            {activeFilter ? (
                <div className="mb-4 flex items-center gap-2">
                    <Badge variant="outline" className="flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5">
                        Filtering by: {activeFilter.label}
                        <button onClick={() => setActiveFilter(null)} className="rounded-full p-0.5 hover:bg-accent" aria-label="Clear filter">
                            <X className="size-3" />
                        </button>
                    </Badge>
                </div>
            ) : null}

            <NbaPendingApprovalsPanel />

            {isMobile ? (
                <div className="flex flex-col gap-4">
                    {mobileOrderedWidgets.map((widget) => (
                        <div key={widget.id} className="min-h-[220px]">
                            <DashboardWidget
                                widget={widget}
                                onEdit={() => setEditingWidget(widget)}
                                onDelete={() => handleDeleteWidget(widget.id)}
                                crossFilter={activeFilter}
                                onCrossFilter={setActiveFilter}
                            />
                        </div>
                    ))}
                </div>
            ) : (
                <GridLayout
                    className="layout"
                    layout={gridLayoutItems}
                    cols={GRID_COLUMNS}
                    rowHeight={GRID_ROW_HEIGHT}
                    margin={[16, 16]}
                    compactType="vertical"
                    draggableHandle=".widget-drag-handle"
                    onLayoutChange={(nextLayout: ReadonlyArray<{ i: string; x: number; y: number; w: number; h: number }>) => handleLayoutSettled([...nextLayout])}
                >
                    {visibleWidgets.map((widget) => (
                        <div key={widget.id}>
                            <div className="relative h-full">
                                <DashboardWidget
                                    widget={widget}
                                    onEdit={() => setEditingWidget(widget)}
                                    onDelete={() => handleDeleteWidget(widget.id)}
                                    crossFilter={activeFilter}
                                    onCrossFilter={setActiveFilter}
                                />
                                {widget.isOwner !== false ? (
                                    <div className="widget-drag-handle absolute top-2 left-1/2 h-2 w-10 -translate-x-1/2 cursor-grab rounded-full bg-foreground/10 opacity-0 transition-opacity hover:opacity-100" />
                                ) : null}
                            </div>
                        </div>
                    ))}
                </GridLayout>
            )}

            <AddWidgetDialog
                open={isAdding || !!editingWidget}
                widget={editingWidget}
                defaultTabId={activeTabId === SHARED_TAB_ID ? defaultTabId : activeTabId}
                existingWidgets={visibleWidgets}
                onClose={() => {
                    setIsAdding(false);
                    setEditingWidget(null);
                }}
                onAdded={fetchAll}
            />

            <TabVersionHistoryDialog
                tabId={versionHistoryTabId}
                onClose={() => setVersionHistoryTabId(null)}
                onRestored={fetchAll}
            />
        </div>
    );
}

// Gap checklist Module 17 ("dashboard/report versioning" -- change history + rollback).
function TabVersionHistoryDialog({ tabId, onClose, onRestored }: { tabId: string | null; onClose: () => void; onRestored: () => void }) {
    const [versions, setVersions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [retryKey, setRetryKey] = useState(0);
    const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

    useEffect(() => {
        if (!tabId) return;
        let current = true;
        setLoading(true);
        setLoadError(false);
        setVersions([]);
        apiFetch<any[]>(`/dashboard-tabs/${tabId}/versions`)
            .then((data) => { if (current) setVersions(Array.isArray(data) ? data : []); })
            .catch(() => { if (current) setLoadError(true); })
            .finally(() => { if (current) setLoading(false); });
        return () => { current = false; };
    }, [tabId, retryKey]);

    const restore = async (version: number) => {
        if (!tabId) return;
        setRestoringVersion(version);
        try {
            const result = await apiFetch<{ restored: number; skipped: number }>(`/dashboard-tabs/${tabId}/versions/${version}/restore`, { method: 'POST' });
            toast.success(`Restored ${result.restored} widget${result.restored === 1 ? '' : 's'}${result.skipped ? ` (${result.skipped} no longer exist)` : ''}`);
            onRestored();
            onClose();
        } catch (err: any) {
            toast.error(err.message || 'Failed to restore version');
        } finally {
            setRestoringVersion(null);
        }
    };

    return (
        <StandardDialog open={!!tabId} onClose={onClose} title="Version History" subtitle="Restoring publishes the old snapshot again as a new version -- nothing is ever lost.">
            {loading ? (
                <div className="flex justify-center p-8"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
            ) : loadError ? <ErrorState description="Dashboard versions could not be loaded." onRetry={() => setRetryKey(value => value + 1)} /> : versions.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No published versions yet -- use &quot;Publish Version&quot; to create the first one.</p>
            ) : (
                <div className="space-y-2 p-4">
                    {versions.map((version) => (
                        <div key={version.id} className="flex min-w-0 flex-wrap items-center justify-between rounded-lg bg-accent p-3">
                            <div className="min-w-0 flex-1 basis-40 break-words">
                                <div className="text-sm font-bold">Version {version.version}</div>
                                <div className="text-xs text-muted-foreground">
                                    {version.publishNotes || 'No notes'} • {formatWorkspaceDate(version.publishedAt)}
                                </div>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => restore(version.version)} disabled={restoringVersion === version.version}>
                                <RotateCcw className="size-4" />
                                {restoringVersion === version.version ? 'Restoring...' : 'Restore'}
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </StandardDialog>
    );
}

const WIDGET_TYPE_OPTIONS = [
    { value: 'STAT', label: 'Stat Summary' },
    { value: 'TREND', label: 'Trend Chart' },
    { value: 'BAR', label: 'Bar Comparison' },
    { value: 'FUNNEL', label: 'Sales Funnel' },
    // Gap checklist Module 17, item 4 (chart library beyond stat/bar/trend/funnel).
    { value: 'AREA', label: 'Area Chart' },
    { value: 'PIE', label: 'Pie / Donut' },
    { value: 'STACKED_BAR', label: 'Stacked Bar' },
    { value: 'SCORE_DISTRIBUTION', label: 'Score Distribution' },
    { value: 'HEATMAP', label: 'Heatmap / Cohort Matrix' },
    { value: 'TABLE', label: 'Table' },
    { value: 'NBA', label: 'Next Best Actions' },
    // Gap checklist Module 17's chart-library expansion (sankey diagram, pivot table).
    { value: 'SANKEY', label: 'Sankey (Source -> Stage Flow)' },
    { value: 'PIVOT', label: 'Pivot Table' },
];

// Gap checklist Module 16's app-backed reports, "expose ... through ... widgets" half -- built
// per explicit user decision. Only STAT/BAR/TABLE are offered here, matching exactly what
// getAppReportBackedWidgetData (crm.ts) knows how to reshape an app report's rows into.
const APP_REPORT_WIDGET_TYPES = ['STAT', 'BAR', 'TABLE'];

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
        types: ['STAT', 'BAR', 'SCORE_DISTRIBUTION'],
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
    // Gap checklist Module 17 (Advanced Analytics and BI Layer) -- new report keys wired to
    // the new PIE/STACKED_BAR/FUNNEL/TABLE/HEATMAP chart types added for this module.
    {
        value: 'marketing_attribution_summary',
        label: 'Marketing Attribution (by source)',
        types: ['STAT', 'PIE', 'BAR'],
        metrics: [{ value: 'credit', label: 'Attribution credit' }],
    },
    {
        value: 'sender_reputation',
        label: 'Sender Reputation',
        types: ['STAT', 'STACKED_BAR'],
        metrics: [
            { value: 'totals.sent', label: 'Total sent (across channels)' },
            { value: 'totals.failed', label: 'Total failed' },
        ],
    },
    {
        value: 'funnel_explorer',
        label: 'Funnel Explorer (stage aging)',
        types: ['STAT', 'FUNNEL', 'TABLE'],
        metrics: [{ value: 'reEntryCount', label: 'Re-entry count' }],
    },
    {
        value: 'campaign_roi',
        label: 'Campaign & Journey ROI',
        types: ['STAT', 'TABLE'],
        metrics: [{ value: 'journeys.length', label: 'Journeys tracked' }],
    },
    {
        value: 'cohort_funnel_progression',
        label: 'Cohort Progression (heatmap)',
        types: ['STAT', 'HEATMAP'],
        metrics: [{ value: 'rows.length', label: 'Cohorts' }],
    },
];

function AddWidgetDialog({ open, widget, defaultTabId, existingWidgets, onClose, onAdded }: {
    open: boolean,
    widget?: any | null,
    defaultTabId?: string | null,
    existingWidgets?: any[],
    onClose: () => void,
    onAdded: () => void,
}) {
    const [title, setTitle] = useState('');
    const [source, setSource] = useState<'module' | 'report' | 'app_report'>('module');
    const [type, setType] = useState('STAT');
    const [module, setModule] = useState('LEADS');
    const [moduleGroupBy, setModuleGroupBy] = useState('status');
    const [reportKey, setReportKey] = useState(REPORT_WIDGET_OPTIONS[0].value);
    const selectedReport = REPORT_WIDGET_OPTIONS.find((option) => option.value === reportKey) ?? REPORT_WIDGET_OPTIONS[0];
    const [reportMetric, setReportMetric] = useState(selectedReport.metrics[0].value);
    // Gap checklist Module 16's app-backed reports, "expose ... through ... widgets" half.
    const [availableAppReports, setAvailableAppReports] = useState<Array<{ id: string; appId: string; appName: string; key: string; name: string; columnSchema: Array<{ key: string; label: string; type: string }> }>>([]);
    // "appId::reportKey" -- the persisted config keys off these two real values (appReportAppId/
    // appReportKey), not this join-row's own synthetic id, so this composite is derivable without
    // waiting on availableAppReports to have loaded first when editing an existing widget.
    const [appReportSelection, setAppReportSelection] = useState('');
    const selectedAppReport = availableAppReports.find((option) => `${option.appId}::${option.key}` === appReportSelection) ?? null;
    const [appReportMetric, setAppReportMetric] = useState('__count__');
    const [appReportGroupField, setAppReportGroupField] = useState('');
    const [appReportValueField, setAppReportValueField] = useState('');
    // Per-widget refresh policy -- blank means manual-refresh-only (the pre-existing behavior).
    // Stored inside config.refreshPolicy rather than a new column since DashboardWidget.config
    // is already the established free-form settings bag for this table.
    const [autoRefreshMinutes, setAutoRefreshMinutes] = useState('');
    // Dashboard sharing (gap checklist Module 17, item 3). Viewing only -- edit/delete stay
    // restricted to the widget's creator regardless of visibility.
    const [visibility, setVisibility] = useState<'PRIVATE' | 'TEAM' | 'TENANT'>('PRIVATE');
    const [sharedWithTeamId, setSharedWithTeamId] = useState('');
    const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
    // Gap checklist Module 17's chart-library expansion, "pivot table" sub-item -- reuses an
    // existing Metric (its own groupBy becomes the pivot's row dimension) plus one column
    // dimension picked here, rather than a second query-definition UI.
    const [pivotMetricId, setPivotMetricId] = useState('');
    const [pivotColumnObject, setPivotColumnObject] = useState('lead');
    const [pivotColumnField, setPivotColumnField] = useState('');
    const [pivotMetrics, setPivotMetrics] = useState<any[]>([]);
    const [pivotCatalog, setPivotCatalog] = useState<Record<string, string[]>>({});

    useEffect(() => {
        if (!open || teams.length > 0) return;
        apiFetch<Array<{ id: string; name: string }>>('/teams')
            .then((result) => setTeams(Array.isArray(result) ? result : []))
            .catch(() => undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open || availableAppReports.length > 0) return;
        apiFetch<typeof availableAppReports>('/marketplace/available-reports')
            .then((result) => setAvailableAppReports(Array.isArray(result) ? result : []))
            .catch(() => undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open || type !== 'PIVOT') return;
        apiFetch<any[]>('/metrics')
            .then((result) => setPivotMetrics(Array.isArray(result) ? result.filter((metric) => metric.groupBy) : []))
            .catch(() => undefined);
        apiFetch<{ objects: Record<string, string[]> }>('/reports/query')
            .then((result) => setPivotCatalog(result.objects ?? {}))
            .catch(() => undefined);
    }, [open, type]);

    useEffect(() => {
        if (!open) return;
        const config = widget?.config ?? {};
        const isReportBacked = Boolean(config.reportKey);
        const isAppReportBacked = Boolean(config.appReportKey);
        setTitle(widget?.title ?? '');
        setType(widget?.type ?? 'STAT');
        setSource(isAppReportBacked ? 'app_report' : isReportBacked ? 'report' : 'module');
        setModule(String(config.module ?? 'LEADS'));
        setModuleGroupBy(String(config.groupBy ?? 'status'));
        const nextReportKey = String(config.reportKey ?? REPORT_WIDGET_OPTIONS[0].value);
        const nextReport = REPORT_WIDGET_OPTIONS.find((option) => option.value === nextReportKey) ?? REPORT_WIDGET_OPTIONS[0];
        setReportKey(nextReport.value);
        setReportMetric(String(config.metric ?? nextReport.metrics[0].value));
        setAppReportSelection(config.appReportAppId && config.appReportKey ? `${config.appReportAppId}::${config.appReportKey}` : '');
        setAppReportMetric(String(config.metric ?? '__count__'));
        setAppReportGroupField(String(config.groupField ?? ''));
        setAppReportValueField(String(config.valueField ?? ''));
        setAutoRefreshMinutes(config.refreshPolicy?.autoRefreshMinutes ? String(config.refreshPolicy.autoRefreshMinutes) : '');
        setVisibility(widget?.visibility ?? 'PRIVATE');
        setSharedWithTeamId(widget?.sharedWithTeamId ?? '');
        setPivotMetricId(String(config.pivot?.metricId ?? ''));
        setPivotColumnObject(String(config.pivot?.columnGroupBy?.object ?? 'lead'));
        setPivotColumnField(String(config.pivot?.columnGroupBy?.field ?? ''));
    }, [open, widget]);

    useEffect(() => {
        if (source !== 'report') return;
        if (!selectedReport.types.includes(type)) setType(selectedReport.types[0]);
        if (!selectedReport.metrics.some((metric) => metric.value === reportMetric)) {
            setReportMetric(selectedReport.metrics[0].value);
        }
    }, [reportMetric, selectedReport, source, type]);

    useEffect(() => {
        if (source !== 'app_report') return;
        if (!APP_REPORT_WIDGET_TYPES.includes(type)) setType(APP_REPORT_WIDGET_TYPES[0]);
        if (!appReportSelection && availableAppReports.length > 0) {
            setAppReportSelection(`${availableAppReports[0].appId}::${availableAppReports[0].key}`);
        }
    }, [source, type, appReportSelection, availableAppReports]);

    useEffect(() => {
        if (source !== 'app_report' || !selectedAppReport) return;
        setAppReportGroupField((current) => current || selectedAppReport.columnSchema[0]?.key || '');
        setAppReportValueField((current) => current || selectedAppReport.columnSchema[1]?.key || selectedAppReport.columnSchema[0]?.key || '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [source, selectedAppReport]);

    const handleSave = async () => {
        // NBA and SANKEY are neither module- nor report-backed in any configurable sense -- NBA
        // is always "my own pending recommendations," and SANKEY is always the opportunity
        // pipeline's own lead-source-to-stage flow. PIVOT references a Metric directly instead
        // of the module/report source picker.
        const config: Record<string, any> = type === 'NBA' || type === 'SANKEY'
            ? {}
            : type === 'PIVOT'
                ? { pivot: { metricId: pivotMetricId, columnGroupBy: { object: pivotColumnObject, field: pivotColumnField } } }
                : source === 'report'
                    ? { reportKey, metric: reportMetric }
                    : source === 'app_report'
                        ? { appReportAppId: selectedAppReport?.appId ?? '', appReportKey: selectedAppReport?.key ?? '', metric: appReportMetric }
                        : { module, metric: 'COUNT' };
        if (source === 'module' && type === 'TREND') {
            config.groupBy = 'createdAt';
        }
        if (source === 'module' && type === 'BAR' && module === 'LEADS') {
            config.groupBy = moduleGroupBy;
        }
        if (source === 'app_report' && type === 'BAR') {
            config.groupField = appReportGroupField;
            config.valueField = appReportValueField;
        }
        const parsedAutoRefresh = Number(autoRefreshMinutes);
        if (autoRefreshMinutes.trim() && Number.isFinite(parsedAutoRefresh) && parsedAutoRefresh >= 1) {
            config.refreshPolicy = { autoRefreshMinutes: Math.round(parsedAutoRefresh) };
        }

        // Gap checklist Module 17, item 4 (true 2D grid). Previously this unconditionally reset
        // `layout` on every save, including edits -- harmless when layout was purely a CSS
        // half/full-width toggle, but with react-grid-layout now controlling real pixel
        // position/size, that would snap a widget back to a default spot every time its title
        // or config was edited. Layout is now only set on create; drag/resize handle it after
        // that. New widgets are placed below whatever's already on the active tab, not stacked
        // at (0,0) on top of each other.
        const isChartType = type === 'TREND' || type === 'BAR' || type === 'FUNNEL' || type === 'AREA' || type === 'PIE' || type === 'STACKED_BAR' || type === 'HEATMAP' || type === 'TABLE' || type === 'SANKEY' || type === 'PIVOT';
        const nextY = (existingWidgets ?? []).reduce((max, item) => Math.max(max, (item.layout?.y ?? 0) + (item.layout?.h ?? 3)), 0);
        const createLayout = { x: 0, y: nextY, w: isChartType ? 8 : 4, h: isChartType ? 4 : 3 };

        try {
            await apiFetch(widget ? `/dashboard-widgets/${widget.id}` : '/dashboard-widgets', {
                method: widget ? 'PATCH' : 'POST',
                body: JSON.stringify({
                    title,
                    type,
                    config,
                    ...(widget ? {} : { layout: createLayout, tabId: defaultTabId ?? null }),
                    visibility,
                    sharedWithTeamId: visibility === 'TEAM' ? sharedWithTeamId || null : null,
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
                        <Label htmlFor="dashboard-field-1">Data Source</Label>
                        <Select value={source} onValueChange={(value) => setSource(value as 'module' | 'report' | 'app_report')}>
                            <SelectTrigger id="dashboard-field-1" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="module">CRM module</SelectItem>
                                <SelectItem value="report">Inbuilt report</SelectItem>
                                <SelectItem value="app_report">App report</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="dashboard-field-2">Widget Type</Label>
                        <Select value={type} onValueChange={setType}>
                            <SelectTrigger id="dashboard-field-2" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(source === 'report'
                                    ? WIDGET_TYPE_OPTIONS.filter((option) => selectedReport.types.includes(option.value))
                                    : source === 'app_report'
                                        ? WIDGET_TYPE_OPTIONS.filter((option) => APP_REPORT_WIDGET_TYPES.includes(option.value))
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

                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="widget-auto-refresh">Auto-refresh every (minutes)</Label>
                    <Input
                        id="widget-auto-refresh"
                        type="number"
                        min={1}
                        placeholder="Manual refresh only"
                        value={autoRefreshMinutes}
                        onChange={(e) => setAutoRefreshMinutes(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Leave blank to only refresh this widget manually or on page load.</p>
                </div>

                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="dashboard-field-3">Sharing</Label>
                    <Select value={visibility} onValueChange={(value) => setVisibility(value as 'PRIVATE' | 'TEAM' | 'TENANT')}>
                        <SelectTrigger id="dashboard-field-3" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="PRIVATE">Only me</SelectItem>
                            <SelectItem value="TEAM">My team</SelectItem>
                            <SelectItem value="TENANT">Everyone in this workspace</SelectItem>
                        </SelectContent>
                    </Select>
                    {visibility === 'TEAM' ? (
                        <Select value={sharedWithTeamId} onValueChange={setSharedWithTeamId}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select a team" />
                            </SelectTrigger>
                            <SelectContent>
                                {teams.map((team) => (
                                    <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                        Sharing only affects who can view this widget -- only you can edit or delete it.
                    </p>
                </div>

                {type === 'NBA' ? (
                    <p className="text-xs text-muted-foreground">
                        Shows your own pending Next-Best-Action recommendations across Leads and Opportunities -- no additional configuration needed.
                    </p>
                ) : type === 'SANKEY' ? (
                    <p className="text-xs text-muted-foreground">
                        Shows the opportunity pipeline&apos;s lead-source-to-stage flow -- no additional configuration needed.
                    </p>
                ) : type === 'PIVOT' ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="dashboard-field-4">Metric (row dimension)</Label>
                            <Select value={pivotMetricId} onValueChange={setPivotMetricId}>
                                <SelectTrigger id="dashboard-field-4" className="w-full"><SelectValue placeholder="Choose a metric" /></SelectTrigger>
                                <SelectContent>
                                    {pivotMetrics.map((metric) => <SelectItem key={metric.id} value={metric.id}>{metric.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            {!pivotMetrics.length ? (
                                <p className="text-xs text-muted-foreground">No eligible metrics -- a pivot needs a Metric with a group-by dimension already set (Reports page &gt; Metrics).</p>
                            ) : null}
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="dashboard-field-5">Column Dimension</Label>
                            <div className="grid gap-1.5 sm:grid-cols-2">
                                <Select
                                    value={pivotColumnObject}
                                    onValueChange={(object) => { setPivotColumnObject(object); setPivotColumnField((pivotCatalog[object] ?? [])[0] ?? ''); }}
                                >
                                    <SelectTrigger id="dashboard-field-5" className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {Object.keys(pivotCatalog).map((object) => <SelectItem key={object} value={object}>{object}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Select value={pivotColumnField} onValueChange={setPivotColumnField}>
                                    <SelectTrigger className="w-full"><SelectValue placeholder="Field" /></SelectTrigger>
                                    <SelectContent>
                                        {(pivotCatalog[pivotColumnObject] ?? []).map((field) => <SelectItem key={field} value={field}>{field}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                ) : source === 'module' ? (
                    <>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="dashboard-field-6">Data Module</Label>
                            <Select value={module} onValueChange={setModule}>
                                <SelectTrigger id="dashboard-field-6" className="w-full">
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
                                <Label htmlFor="dashboard-field-7">Group Leads By</Label>
                                <Select value={moduleGroupBy} onValueChange={setModuleGroupBy}>
                                    <SelectTrigger id="dashboard-field-7" className="w-full">
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
                ) : source === 'app_report' ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5 sm:col-span-2">
                            <Label htmlFor="dashboard-field-8">App Report</Label>
                            <Select value={appReportSelection} onValueChange={setAppReportSelection}>
                                <SelectTrigger id="dashboard-field-8" className="w-full">
                                    <SelectValue placeholder="Choose a report" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableAppReports.map((option) => (
                                        <SelectItem key={option.id} value={`${option.appId}::${option.key}`}>
                                            {option.appName} -- {option.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {!availableAppReports.length ? (
                                <p className="text-xs text-muted-foreground">No app reports available -- an app needs to be installed and granted &quot;reports&quot; access first.</p>
                            ) : null}
                        </div>
                        {type === 'STAT' ? (
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="dashboard-field-9">Metric</Label>
                                <Select value={appReportMetric} onValueChange={setAppReportMetric}>
                                    <SelectTrigger id="dashboard-field-9" className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__count__">Row count</SelectItem>
                                        {(selectedAppReport?.columnSchema ?? []).map((column) => (
                                            <SelectItem key={column.key} value={column.key}>Sum of {column.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : null}
                        {type === 'BAR' ? (
                            <>
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="dashboard-field-10">Group By Column</Label>
                                    <Select value={appReportGroupField} onValueChange={setAppReportGroupField}>
                                        <SelectTrigger id="dashboard-field-10" className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(selectedAppReport?.columnSchema ?? []).map((column) => (
                                                <SelectItem key={column.key} value={column.key}>{column.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="dashboard-field-11">Value Column</Label>
                                    <Select value={appReportValueField} onValueChange={setAppReportValueField}>
                                        <SelectTrigger id="dashboard-field-11" className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(selectedAppReport?.columnSchema ?? []).map((column) => (
                                                <SelectItem key={column.key} value={column.key}>{column.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </>
                        ) : null}
                        {type === 'TABLE' ? (
                            <p className="text-xs text-muted-foreground sm:col-span-2">Shows this report&apos;s rows directly -- no additional configuration needed.</p>
                        ) : null}
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="dashboard-field-12">Report</Label>
                            <Select value={reportKey} onValueChange={setReportKey}>
                                <SelectTrigger id="dashboard-field-12" className="w-full">
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
                            <Label htmlFor="dashboard-field-13">Metric</Label>
                            <Select value={reportMetric} onValueChange={setReportMetric}>
                                <SelectTrigger id="dashboard-field-13" className="w-full">
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
