'use client';

import React, { useState, useEffect } from 'react';
import { History, ArrowRight, Loader2, Check, ListFilter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { apiFetch } from '@/lib/api';
import { formatWorkspaceRelativeTime } from '@/lib/date-format';
import { cn } from '@/lib/utils';

interface HistoryItem {
    id: string;
    action: string;
    createdAt: string;
    user: { name: string; email: string };
    valueLabels?: {
        stages?: Record<string, string>;
        opportunityTypes?: Record<string, string>;
        activityTypes?: Record<string, string>;
    };
    changes: {
        before: any;
        after: any;
        diff: any;
    };
}

const SKIP_FIELDS = new Set(['tenantId', 'objectId', 'createdAt', 'updatedAt', 'deletedAt', 'deletedBy', 'hash']);

function labelForField(field: string) {
    return field
        .replace(/Id$/, "")
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .replace(/^./, (value) => value.toUpperCase());
}

function humanizeToken(value: string) {
    return value
        .replace(/^stage_/, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatValue(value: any, field?: string, item?: HistoryItem) {
    if (value === null || value === undefined || value === "") return "Empty";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.length ? value.join(", ") : "Empty";
    if (typeof value === "object") return JSON.stringify(value);
    const stringValue = String(value);
    if (field === "stageId") return item?.valueLabels?.stages?.[stringValue] || humanizeToken(stringValue);
    if (field === "opportunityTypeId") return item?.valueLabels?.opportunityTypes?.[stringValue] || humanizeToken(stringValue);
    if (field === "typeId") return item?.valueLabels?.activityTypes?.[stringValue] || humanizeToken(stringValue);
    if (["status", "source", "priority", "outcome", "slaStatus"].includes(field || "")) return humanizeToken(stringValue);
    return stringValue;
}

function changedFields(item: HistoryItem) {
    if (item.changes.diff && typeof item.changes.diff === "object") {
        return Object.entries(item.changes.diff)
            .filter(([key]) => !SKIP_FIELDS.has(key))
            .map(([field, value]: any) => ({
                field,
                before: value?.before,
                after: value?.after,
            }));
    }

    const before = item.changes.before ?? {};
    const after = item.changes.after ?? {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys]
        .filter((key) => !SKIP_FIELDS.has(key) && JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
        .map((field) => ({ field, before: before[field], after: after[field] }));
}

interface RecordHistoryProps {
    entityType: string;
    entityId: string;
}

export function RecordHistory({ entityType, entityId }: RecordHistoryProps) {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [fieldFilter, setFieldFilter] = useState<string[]>([]);
    const [filterOpen, setFilterOpen] = useState(false);

    useEffect(() => {
        if (entityId) {
            apiFetch(`/governance/history/${entityType}/${entityId}`)
                .then(setHistory)
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [entityType, entityId]);

    if (loading) return (
        <div className="flex justify-center p-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
    );

    const availableFields = [...new Set(history.flatMap((item) => changedFields(item).map((field) => field.field)))];
    const filteredHistory = fieldFilter.length === 0
        ? history
        : history
            .map((item) => ({
                ...item,
                __filteredFields: changedFields(item).filter((field) => fieldFilter.includes(field.field)),
            }))
            .filter((item: any) => item.action !== "UPDATE" || item.__filteredFields.length > 0);

    if (history.length === 0) return (
        <div className="p-8 text-center opacity-60">
            <History className="mx-auto mb-2 size-10" />
            <p className="text-sm">No history records found for this {entityType.toLowerCase()}.</p>
        </div>
    );

    const toggleField = (field: string) => {
        setFieldFilter((prev) =>
            prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
        );
    };

    return (
        <div className="flex flex-col gap-2.5 p-0.5">
            {availableFields.length > 0 && (
                <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-[34px] w-full justify-start rounded-[10px] font-semibold sm:w-80"
                        >
                            <ListFilter className="size-4" />
                            {fieldFilter.length > 0 ? `${fieldFilter.length} selected` : "Filter fields"}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="start">
                        <Command>
                            <CommandInput placeholder="Search fields" />
                            <CommandList>
                                <CommandEmpty>No fields found.</CommandEmpty>
                                <CommandGroup>
                                    {availableFields.map((field) => (
                                        <CommandItem
                                            key={field}
                                            value={field}
                                            onSelect={() => toggleField(field)}
                                        >
                                            <Check
                                                className={cn(
                                                    "size-4",
                                                    fieldFilter.includes(field) ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            {labelForField(field)}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            )}

            {filteredHistory.map((item: any, idx) => (
                <div key={item.id} className="relative pl-8">
                    {/* Vertical Line */}
                    {idx < history.length - 1 && (
                        <div className="absolute bottom-[-14px] left-[11px] top-[18px] w-0.5 bg-border" />
                    )}

                    {/* Dot */}
                    <div className="absolute left-0 top-1 z-10 flex size-6 items-center justify-center">
                        <span className="size-3 rounded-full bg-primary" />
                    </div>

                    {/* Content */}
                    <div className="rounded-2xl border bg-card/75 p-3">
                        {(() => {
                            const fields = item.__filteredFields ?? changedFields(item);
                            const actor = item.user?.name || item.user?.email || "Unknown User";
                            const actionLabel = item.action === 'CREATE'
                                ? `Created by ${actor}`
                                : item.action === 'UPDATE'
                                    ? `${entityType[0]}${entityType.slice(1).toLowerCase()} modified by ${actor}`
                                    : `${item.action} by ${actor}`;
                            return (
                                <>
                                    <div className="mb-1 flex items-start justify-between">
                                        <span className="text-sm font-extrabold">
                                            {actionLabel}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {formatWorkspaceRelativeTime(item.createdAt)}
                                        </span>
                                    </div>

                                    <p className="mb-1 block text-xs text-muted-foreground">
                                        by {item.user.name} ({item.user.email})
                                    </p>

                                    {item.action === 'UPDATE' && fields.length > 0 && (
                                        <div className="mt-1 flex flex-col gap-1.5">
                                            {fields.map((field: { field: string; before: any; after: any }) => (
                                                <div key={field.field} className="rounded-lg border bg-surface-container-lowest p-2">
                                                    <p className="text-xs font-extrabold text-muted-foreground">
                                                        {labelForField(field.field)}
                                                    </p>
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <Badge variant="outline" className="max-w-[220px] truncate">
                                                            {formatValue(field.before, field.field, item)}
                                                        </Badge>
                                                        <ArrowRight className="size-3.5 text-muted-foreground/60" />
                                                        <Badge variant="outline" className="max-w-[220px] truncate border-emerald-500/40 text-emerald-600">
                                                            {formatValue(field.after, field.field, item)}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                </div>
            ))}
        </div>
    );
}
