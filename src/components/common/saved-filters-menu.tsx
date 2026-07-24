'use client';

import React, { useState } from 'react';
import { Bookmark, Plus, Trash2, Star, Filter, Loader2 } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StandardDialog } from '@/components/common/standard-dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SavedFilter {
    id: string;
    name: string;
    module: string;
    filters: any;
    columns?: string[];
    isDefault: boolean;
    isShared: boolean;
    user?: { name: string };
}

interface SavedFiltersMenuProps {
    /** Which module these filters belong to (e.g. 'leads', 'opportunities') */
    module: string;
    /** The current active filter config */
    activeFilter?: any;
    /** Called when a saved filter is selected */
    onApply: (filters: any) => void;
    /** Called when filter is cleared */
    onClear?: () => void;
}

export function SavedFiltersMenu({ module, activeFilter, onApply, onClear }: SavedFiltersMenuProps) {
    const [open, setOpen] = useState(false);
    const [views, setViews] = useState<SavedFilter[]>([]);
    const [loading, setLoading] = useState(false);
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [saveAsDefault, setSaveAsDefault] = useState(false);
    const [saving, setSaving] = useState(false);
    const [activeViewId, setActiveViewId] = useState<string | null>(null);

    const fetchViews = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const data = await apiFetch<SavedFilter[]>(`/saved-views?module=${module}`);
            setViews(Array.isArray(data) ? data : []);
        } catch {
            toast.error('Failed to load saved filters');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (next) fetchViews();
    };

    const handleApply = (view: SavedFilter) => {
        setActiveViewId(view.id);
        onApply(view.filters);
        setOpen(false);
    };

    const handleSave = async () => {
        if (!saveName.trim()) return;
        setSaving(true);
        try {
            const saved = await apiFetch<SavedFilter>('/saved-views', {
                method: 'POST',
                body: JSON.stringify({
                    name: saveName.trim(),
                    module,
                    filters: activeFilter || {},
                    isDefault: saveAsDefault,
                }),
            });
            setViews(prev => [saved, ...prev]);
            setActiveViewId(saved.id);
            setSaveDialogOpen(false);
            setSaveName('');
            setSaveAsDefault(false);
            toast.success('Filter saved');
        } catch {
            toast.error('Failed to save filter');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (viewId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await apiFetch(`/saved-views/${viewId}`, { method: 'DELETE' });
            setViews(prev => prev.filter(v => v.id !== viewId));
            if (activeViewId === viewId) {
                setActiveViewId(null);
                onClear?.();
            }
            toast.success('Filter deleted');
        } catch {
            toast.error('Failed to delete filter');
        }
    };

    const handleClear = () => {
        setActiveViewId(null);
        onClear?.();
        setOpen(false);
    };

    const activeView = views.find(v => v.id === activeViewId);

    return (
        <>
            <DropdownMenu open={open} onOpenChange={handleOpenChange}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className={cn(
                                    "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    activeView ? "border-primary bg-primary/6 text-primary" : "border-border text-muted-foreground"
                                )}
                            >
                                <Filter className="size-4" />
                                {activeView ? activeView.name : 'Saved Filters'}
                            </button>
                        </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Saved Filters</TooltipContent>
                </Tooltip>

                <DropdownMenuContent align="start" className="min-w-[260px] rounded-xl">
                    <div className="px-2 pt-1 pb-1.5">
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full rounded-lg font-semibold"
                            onClick={() => { setOpen(false); setSaveDialogOpen(true); }}
                            disabled={!activeFilter || Object.keys(activeFilter).length === 0}
                        >
                            <Plus className="size-4" />
                            Save current filter
                        </Button>
                    </div>

                    <DropdownMenuSeparator />

                    {loading ? (
                        <div className="flex justify-center py-3">
                            <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : views.length === 0 ? (
                        <div className="px-2 py-3 text-center">
                            <span className="text-xs text-muted-foreground/60">No saved filters yet</span>
                        </div>
                    ) : (
                        <>
                            {activeViewId && (
                                <DropdownMenuItem onClick={handleClear}>
                                    <span className="text-xs text-muted-foreground">Clear filter</span>
                                </DropdownMenuItem>
                            )}
                            {views.map(view => (
                                <DropdownMenuItem
                                    key={view.id}
                                    onClick={() => handleApply(view)}
                                    className="group justify-between"
                                >
                                    <div className="flex min-w-0 items-center gap-2">
                                        {view.isDefault
                                            ? <Star className="size-3.5 shrink-0 text-amber-500" />
                                            : <Bookmark className="size-3.5 shrink-0" />}
                                        <div className="min-w-0">
                                            <p className={cn("truncate text-sm", view.isDefault ? "font-bold" : "font-normal")}>
                                                {view.name}
                                            </p>
                                            {view.isShared && (
                                                <p className="truncate text-xs text-muted-foreground">by {view.user?.name}</p>
                                            )}
                                        </div>
                                    </div>
                                    {!view.isShared && (
                                        <button
                                            type="button"
                                            onClick={(e) => handleDelete(view.id, e)}
                                            className="shrink-0 rounded p-1 opacity-0 hover:bg-destructive/10 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            aria-label="Delete filter"
                                        >
                                            <Trash2 className="size-3.5 text-destructive" />
                                        </button>
                                    )}
                                </DropdownMenuItem>
                            ))}
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            <StandardDialog
                open={saveDialogOpen}
                onClose={() => setSaveDialogOpen(false)}
                title="Save Current Filter"
                maxWidth="xs"
                actions={
                    <>
                        <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={!saveName.trim() || saving}>
                            {saving ? <Loader2 className="size-4 animate-spin" /> : 'Save Filter'}
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="save-filter-name">Filter name</Label>
                        <Input
                            id="save-filter-name"
                            autoFocus
                            placeholder="e.g. Hot leads this week"
                            value={saveName}
                            onChange={e => setSaveName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSave()}
                        />
                    </div>
                    <label htmlFor="save-default" className="flex items-center gap-2 text-sm">
                        <Checkbox
                            id="save-default"
                            checked={saveAsDefault}
                            onCheckedChange={(checked) => setSaveAsDefault(checked === true)}
                        />
                        Set as default view
                    </label>
                </div>
            </StandardDialog>
        </>
    );
}
