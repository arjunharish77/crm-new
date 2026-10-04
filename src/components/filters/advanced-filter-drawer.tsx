'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Loader2, Plus, Trash2 } from 'lucide-react';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { OPERATORS_BY_TYPE, type FilterField, type FilterFieldType, type FilterOperator } from '@/types/filters';
import { formatWorkspaceDateInput, workspaceDateInputToIso } from '@/lib/date-format';
import { RELATIVE_DATE_TOKENS } from '@/lib/query-filters';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAskText } from "@/components/common/dialogs-provider";
import { storageGet, storageSet, userScopedKey } from "@/lib/storage";

export interface FilterCondition {
    id: string;
    field: string;
    operator: string;
    value: any;
}

export interface FilterGroup {
    id: string;
    logic: 'AND' | 'OR';
    conditions: FilterCondition[];
}

interface SavedFilterPreset {
    name: string;
    groups: FilterGroup[];
}

const USER_TOKEN_OPTIONS = [
    { label: 'Me', value: '@me' },
    { label: 'My team', value: '@myteam' },
];

function emptyGroups(): FilterGroup[] {
    return [{ id: 'g1', logic: 'AND', conditions: [{ id: 'c1', field: '', operator: 'equals', value: '' }] }];
}

function loadPresets(storageKey?: string): SavedFilterPreset[] {
    if (!storageKey || typeof window === 'undefined') return [];
    try {
        const raw = storageGet(userScopedKey(`advanced-filters.${storageKey}`));
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function savePresets(storageKey: string, presets: SavedFilterPreset[]) {
    try {
        storageSet(userScopedKey(`advanced-filters.${storageKey}`), JSON.stringify(presets));
    } catch {
        // Private browsing / storage disabled -- the preset just doesn't persist this session.
    }
}

interface AdvancedFilterDrawerProps {
    open: boolean;
    onClose: () => void;
    fields: FilterField[];
    onApply: (filters: FilterGroup[]) => void;
    // Reopening previously always reset to one blank condition, discarding whatever was already
    // applied -- this preserves it instead, same as any other "edit what's already there" UI.
    initialGroups?: FilterGroup[];
    // "Saved filters" (gap checklist sub-item) -- a per-browser-profile named-preset list,
    // localStorage-backed like this module's own established DataTable-density/keyboard-
    // shortcut-enablement precedent, scoped per module via this key so Leads/Opportunities/
    // Activities/Lists presets never collide.
    storageKey?: string;
    // "Query preview/count" (gap checklist sub-item) -- the page supplies its own live count
    // lookup (typically its own list endpoint called with limit=1, reading back meta.total) so
    // this component stays data-source-agnostic.
    previewCount?: (groups: FilterGroup[]) => Promise<number>;
}

export function AdvancedFilterDrawer({ open, onClose, fields, onApply, initialGroups, storageKey, previewCount }: AdvancedFilterDrawerProps) {
    const askText = useAskText();
    const [groups, setGroups] = useState<FilterGroup[]>(initialGroups?.length ? initialGroups : emptyGroups());
    const [presets, setPresets] = useState<SavedFilterPreset[]>([]);
    const [preview, setPreview] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; count: number | null }>({ status: 'idle', count: null });

    useEffect(() => {
        if (!open) return;
        setGroups(initialGroups?.length ? initialGroups : emptyGroups());
        setPresets(loadPresets(storageKey));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Debounced live count -- "≈N records match" updates as the draft filter changes, not just
    // after clicking Apply, so a user can tell a condition is too narrow/wide before committing.
    // The "loading" indicator itself is set immediately on every keystroke (below), but the
    // actual count fetch is debounced via the shared `useDebouncedValue` hook -- otherwise
    // debouncing the loading indicator too would double the perceived delay (debounce, THEN the
    // round-trip), rather than just coalescing rapid-fire fetches into one.
    const debouncedGroups = useDebouncedValue(groups, 400);

    useEffect(() => {
        if (!open || !previewCount) return;
        const hasAnyCondition = groups.some((group) => group.conditions.some((condition) => condition.field));
        setPreview(hasAnyCondition ? (current) => ({ ...current, status: 'loading' }) : { status: 'idle', count: null });
    }, [groups, open, previewCount]);

    useEffect(() => {
        if (!open || !previewCount) return;
        const hasAnyCondition = debouncedGroups.some((group) => group.conditions.some((condition) => condition.field));
        if (!hasAnyCondition) return;
        previewCount(debouncedGroups)
            .then((count) => setPreview({ status: 'ready', count }))
            .catch(() => setPreview({ status: 'error', count: null }));
    }, [debouncedGroups, open, previewCount]);

    const handleAddCondition = (groupId: string) => {
        setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, conditions: [...g.conditions, { id: `c-${Date.now()}`, field: '', operator: 'equals', value: '' }] } : g));
    };

    const handleRemoveCondition = (groupId: string, conditionId: string) => {
        setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, conditions: g.conditions.filter((c) => c.id !== conditionId) } : g));
    };

    const handleUpdateCondition = (groupId: string, conditionId: string, updates: Partial<FilterCondition>) => {
        setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, conditions: g.conditions.map((c) => c.id === conditionId ? { ...c, ...updates } : c) } : g));
    };

    const handleAddGroup = () => {
        setGroups((prev) => [...prev, { id: `g-${Date.now()}`, logic: 'AND', conditions: [{ id: `c-${Date.now()}`, field: '', operator: 'equals', value: '' }] }]);
    };

    const handleRemoveGroup = (groupId: string) => {
        setGroups((prev) => (prev.length > 1 ? prev.filter((g) => g.id !== groupId) : prev));
    };

    const fieldFor = (fieldKey: string) => fields.find((field) => field.key === fieldKey);
    const operatorsFor = (fieldKey: string) => {
        const type = (fieldFor(fieldKey)?.type || 'text') as FilterFieldType;
        return OPERATORS_BY_TYPE[type] || OPERATORS_BY_TYPE.text;
    };
    const resetForField = (fieldKey: string) => ({ field: fieldKey, operator: operatorsFor(fieldKey)[0]?.value || 'equals', value: '' });
    const valueArray = (value: unknown) => Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];

    const savePresetAsNew = async () => {
        if (!storageKey) return;
        const name = await askText({ title: "Save filter", label: "Filter name", confirmLabel: "Save", singleLine: true, required: true });
        if (!name) return;
        const next = [...presets.filter((p) => p.name !== name), { name, groups }];
        setPresets(next);
        savePresets(storageKey, next);
    };

    const applyPreset = (preset: SavedFilterPreset) => setGroups(preset.groups);

    const deletePreset = (name: string) => {
        if (!storageKey) return;
        const next = presets.filter((p) => p.name !== name);
        setPresets(next);
        savePresets(storageKey, next);
    };

    const openerRef = useRef<HTMLElement | null>(null);

    const renderValueInput = (groupId: string, condition: FilterCondition, conditionLabel: string) => {
        const field = fieldFor(condition.field);
        const fieldType = (field?.type || 'text') as FilterFieldType;
        const options = field?.options || [];

        if (condition.operator === 'is_empty' || condition.operator === 'is_not_empty') {
            return <div className="min-w-0 w-full flex-1" />;
        }

        if (fieldType === 'boolean') {
            return (
                <Select
                    value={condition.value === true ? 'true' : condition.value === false ? 'false' : ''}
                    onValueChange={(value) => handleUpdateCondition(groupId, condition.id, { value: value === 'true' })}
                >
                    <SelectTrigger aria-label={`${conditionLabel} value`} size="sm" className="min-w-0 w-full flex-1"><SelectValue placeholder="Value" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                </Select>
            );
        }

        if ((fieldType === 'select' || fieldType === 'user') && (options.length > 0 || fieldType === 'user')) {
            // "Current user/team tokens" -- @me/@myteam are prepended to whatever real options
            // (e.g. actual users) the page supplied, same dropdown-backed multi-select as select
            // fields already use.
            const allOptions = fieldType === 'user' ? [...USER_TOKEN_OPTIONS, ...options] : options;
            const values = valueArray(condition.value);
            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button aria-label={`${conditionLabel} values`} variant="outline" size="sm" className="min-w-0 max-w-full h-auto min-h-8 whitespace-normal flex-1 justify-between">
                            {values.length === 0 ? 'Select values' : values.length === 1 ? allOptions.find((o) => o.value === values[0])?.label ?? '1 selected' : `${values.length} selected`}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-64 w-64 max-w-[calc(100dvw-2rem)] overflow-y-auto">
                        {allOptions.map((option) => (
                            <DropdownMenuCheckboxItem
                                key={option.value}
                                checked={values.includes(option.value)}
                                onCheckedChange={(checked) => {
                                    const nextValues = checked ? [...new Set([...values, option.value])] : values.filter((v) => v !== option.value);
                                    handleUpdateCondition(groupId, condition.id, { value: nextValues });
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

        if (fieldType === 'date') {
            // "Relative dates" (gap checklist sub-item) -- a mode picker alongside the exact-date
            // input(s); picking a token stores it as the literal condition value (e.g. "@today"),
            // which query-filters.ts's applyFilterCondition resolves server-side.
            const isBetween = condition.operator === 'between';
            const rawValue = isBetween && Array.isArray(condition.value) ? condition.value : [condition.value ?? '', ''];
            const mode = (v: unknown) => (typeof v === 'string' && RELATIVE_DATE_TOKENS.some((t) => t.value === v)) ? v : '__exact__';

            const renderOne = (index: 0 | 1) => {
                const current = isBetween ? rawValue[index] : condition.value;
                const currentMode = mode(current);
                const setValue = (next: unknown) => {
                    if (!isBetween) return handleUpdateCondition(groupId, condition.id, { value: next });
                    const nextPair = [...rawValue];
                    nextPair[index] = next;
                    handleUpdateCondition(groupId, condition.id, { value: nextPair });
                };
                return (
                    <div key={index} className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <Select value={currentMode} onValueChange={(value) => setValue(value === '__exact__' ? '' : value)}>
                            <SelectTrigger aria-label={`${conditionLabel} ${isBetween ? (index === 0 ? "start" : "end") : "date"} mode`} size="sm" className="min-w-0 w-full"><SelectValue placeholder="When" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__exact__">Exact date</SelectItem>
                                {RELATIVE_DATE_TOKENS.map((token) => <SelectItem key={token.value} value={token.value}>{token.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        {currentMode === '__exact__' && (
                            <Input aria-label={`${conditionLabel} ${isBetween ? (index === 0 ? "start date" : "end date") : "date"}`}
                                type="date"
                                value={formatWorkspaceDateInput(typeof current === 'string' ? current : '')}
                                onChange={(event) => setValue(workspaceDateInputToIso(event.target.value) ?? '')}
                                className="min-w-0 w-full flex-1"
                            />
                        )}
                    </div>
                );
            };

            return isBetween ? (
                <div className="flex flex-1 flex-col gap-1.5">
                    {renderOne(0)}
                    {renderOne(1)}
                </div>
            ) : renderOne(0);
        }

        return (
            <Input aria-label={`${conditionLabel} value`}
                type={fieldType === 'number' ? 'number' : 'text'}
                placeholder={condition.operator === 'in' || condition.operator === 'not_in' || fieldType === 'tags' ? 'Comma-separated values' : 'Value'}
                value={Array.isArray(condition.value) ? condition.value.join(', ') : condition.value ?? ''}
                onChange={(event) => {
                    const value = condition.operator === 'in' || condition.operator === 'not_in' || fieldType === 'tags'
                        ? event.target.value.split(',').map((item) => item.trim()).filter(Boolean)
                        : event.target.value;
                    handleUpdateCondition(groupId, condition.id, { value });
                }}
                className="min-w-0 w-full flex-1"
            />
        );
    };

    const previewLabel = useMemo(() => {
        if (!previewCount) return null;
        if (preview.status === 'loading') return <span className="inline-flex items-center gap-1.5"><Loader2 className="size-3 animate-spin" />Counting matches...</span>;
        if (preview.status === 'ready') return `≈${preview.count?.toLocaleString()} record${preview.count === 1 ? '' : 's'} match`;
        if (preview.status === 'error') return 'Could not preview count';
        return 'Add a condition to preview how many records match';
    }, [preview, previewCount]);

    return (
        <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
            <SheetContent onOpenAutoFocus={() => { openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }} onCloseAutoFocus={(event) => { if (openerRef.current?.isConnected) { event.preventDefault(); openerRef.current.focus(); } }} className="flex w-full flex-col gap-0 sm:max-w-2xl [&_[data-slot=select-trigger]]:whitespace-normal [&_[data-slot=select-trigger]]:h-auto [&_[data-slot=select-trigger]]:min-h-8 [&_[data-slot=select-value]]:line-clamp-none [&_[data-slot=select-value]]:break-words">
                <SheetHeader className="border-b pb-4">
                    <SheetTitle>Advanced Filters</SheetTitle>
                    <SheetDescription>Build complex queries with AND/OR logic across groups.</SheetDescription>
                </SheetHeader>

                <div className="@container/filter min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                    {storageKey && (
                        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/30 p-2">
                            <Bookmark className="size-3.5 shrink-0 text-muted-foreground" />
                            {presets.length === 0 ? (
                                <span className="text-xs text-muted-foreground">No saved filters yet.</span>
                            ) : presets.map((preset) => (
                                <span key={preset.name} className="flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs">
                                    <button type="button" className="font-medium hover:underline" onClick={() => applyPreset(preset)}>{preset.name}</button>
                                    <button type="button" aria-label={`Delete ${preset.name}`} className="text-muted-foreground hover:text-destructive" onClick={() => deletePreset(preset.name)}>
                                        <Trash2 className="size-3" />
                                    </button>
                                </span>
                            ))}
                            <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs" onClick={savePresetAsNew}>Save filter…</Button>
                        </div>
                    )}

                    {groups.map((group, gIndex) => (
                        <div key={group.id} className="rounded-xl border bg-muted/30 p-4">
                            <div className="mb-4 flex flex-wrap items-center gap-3">
                                <span className="text-sm font-bold">Group {gIndex + 1}</span>
                                <Select value={group.logic} onValueChange={(value) => setGroups((prev) => prev.map((g) => g.id === group.id ? { ...g, logic: value as any } : g))}>
                                    <SelectTrigger aria-label={`Group ${gIndex + 1} matching logic`} size="sm" className="min-w-0 max-w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="AND">Match ALL (AND)</SelectItem>
                                        <SelectItem value="OR">Match ANY (OR)</SelectItem>
                                    </SelectContent>
                                </Select>
                                {groups.length > 1 && (
                                    <Button aria-label={`Remove group ${gIndex + 1}`} variant="ghost" size="icon-sm" className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleRemoveGroup(group.id)}>
                                        <Trash2 className="size-4" />
                                    </Button>
                                )}
                            </div>

                            <div className="flex flex-col gap-3">
                                {group.conditions.map((condition, cIndex) => (
                                    <div key={condition.id} role="group" aria-label={`Group ${gIndex + 1} condition ${cIndex + 1}`} className="flex flex-col items-stretch gap-2.5 @min-[580px]/filter:flex-row @min-[580px]/filter:items-center">
                                        <Select value={condition.field} onValueChange={(value) => handleUpdateCondition(group.id, condition.id, resetForField(value))}>
                                            <SelectTrigger aria-label={`Group ${gIndex + 1} condition ${cIndex + 1} field`} size="sm" className="min-w-0 w-full flex-1"><SelectValue placeholder="Field" /></SelectTrigger>
                                            <SelectContent>
                                                {fields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                                            </SelectContent>
                                        </Select>

                                        <Select value={condition.operator} onValueChange={(value) => handleUpdateCondition(group.id, condition.id, { operator: value as FilterOperator, value: '' })}>
                                            <SelectTrigger aria-label={`Group ${gIndex + 1} condition ${cIndex + 1} operator`} size="sm" className="min-w-0 max-w-full"><SelectValue placeholder="Operator" /></SelectTrigger>
                                            <SelectContent>
                                                {operatorsFor(condition.field).map((operator) => <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>)}
                                            </SelectContent>
                                        </Select>

                                        {renderValueInput(group.id, condition, `Group ${gIndex + 1} condition ${cIndex + 1}`)}

                                        <Button variant="ghost" size="icon-sm" aria-label={`Remove group ${gIndex + 1} condition ${cIndex + 1}`} className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleRemoveCondition(group.id, condition.id)}>
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                ))}
                                <Button variant="ghost" size="sm" className="w-fit" onClick={() => handleAddCondition(group.id)}>
                                    <Plus className="size-4" />
                                    Add Condition
                                </Button>
                            </div>
                        </div>
                    ))}
                    <Button variant="outline" size="sm" className="w-fit" onClick={handleAddGroup}>
                        <Plus className="size-4" />
                        Add Group
                    </Button>
                </div>

                <SheetFooter className="flex-row flex-wrap items-center justify-between gap-3 border-t">
                    <span className="text-xs text-muted-foreground">{previewLabel}</span>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button onClick={() => { onApply(groups); onClose(); }}>Apply Filters</Button>
                    </div>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
