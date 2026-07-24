'use client';

import React, { useEffect, useState } from 'react';
import { History, ArrowRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { formatWorkspaceRelativeTime } from '@/lib/date-format';
import { cn } from '@/lib/utils';

interface AuditEntry {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    before: Record<string, any> | null;
    after: Record<string, any> | null;
    diff: Record<string, any> | null;
    createdAt: string;
    user: {
        id: string;
        name: string;
        email: string;
    };
}

interface FieldHistoryPanelProps {
    entityType: string;
    entityId: string;
}

const ACTION_BADGE_CLASSNAMES: Record<string, string> = {
    LEAD_CREATED: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
    LEAD_UPDATED: 'bg-sky-500/15 text-sky-600 border-sky-500/30',
    LEAD_DELETED: 'bg-destructive/15 text-destructive border-destructive/30',
    OPPORTUNITY_CREATED: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
    OPPORTUNITY_UPDATED: 'bg-sky-500/15 text-sky-600 border-sky-500/30',
    STAGE_CHANGED: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
    DEFAULT: 'bg-muted text-muted-foreground border-border',
};

const DOT_CLASSNAMES: Record<string, string> = {
    LEAD_CREATED: 'bg-emerald-500',
    LEAD_UPDATED: 'bg-sky-500',
    LEAD_DELETED: 'bg-destructive',
    OPPORTUNITY_CREATED: 'bg-emerald-500',
    OPPORTUNITY_UPDATED: 'bg-sky-500',
    STAGE_CHANGED: 'bg-amber-500',
    DEFAULT: 'bg-muted-foreground/40',
};

function formatValue(val: any): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (Array.isArray(val)) return val.join(', ') || '—';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
}

function ChangedFields({ before, after }: { before: any; after: any }) {
    if (!before && !after) return null;

    const allKeys = new Set([
        ...Object.keys(before || {}),
        ...Object.keys(after || {}),
    ]);

    // Filter out internal/metadata fields
    const skipKeys = new Set(['tenantId', 'updatedAt', 'createdAt', 'deletedAt', 'deletedBy', 'hash']);
    const changedKeys = [...allKeys].filter(k => {
        if (skipKeys.has(k)) return false;
        return JSON.stringify((before || {})[k]) !== JSON.stringify((after || {})[k]);
    });

    if (changedKeys.length === 0) return null;

    return (
        <div className="mt-1 flex flex-col gap-1">
            {changedKeys.slice(0, 5).map(key => (
                <div key={key} className="flex flex-wrap items-center gap-1.5">
                    <span className="min-w-20 text-xs font-semibold text-muted-foreground">
                        {key}
                    </span>
                    <span className="max-w-[120px] truncate rounded px-1.5 py-0.5 text-xs text-white line-through opacity-80 bg-destructive">
                        {formatValue((before || {})[key])}
                    </span>
                    <ArrowRight className="size-3 text-muted-foreground/60" />
                    <span className="max-w-[120px] truncate rounded px-1.5 py-0.5 text-xs text-white bg-emerald-600">
                        {formatValue((after || {})[key])}
                    </span>
                </div>
            ))}
            {changedKeys.length > 5 && (
                <span className="text-xs text-muted-foreground/70">
                    +{changedKeys.length - 5} more fields changed
                </span>
            )}
        </div>
    );
}

export function FieldHistoryPanel({ entityType, entityId }: FieldHistoryPanelProps) {
    const [history, setHistory] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!entityId) return;
        apiFetch<any>(
            `/governance/audit-logs?entityType=${entityType.toUpperCase()}&entityId=${entityId}`
        )
            .then(data => {
                // Filter entries for this specific entity
                const entries: AuditEntry[] = (Array.isArray(data) ? data : data?.data || [])
                    .filter((e: any) => e.entityId === entityId)
                    .map((entry: any) => ({
                        ...entry,
                        before: entry.before ?? entry.changes?.before ?? null,
                        after: entry.after ?? entry.changes?.after ?? null,
                        diff: entry.diff ?? entry.changes?.diff ?? null,
                    }));
                setHistory(entries);
            })
            .catch(() => toast.error('Failed to load field history'))
            .finally(() => setLoading(false));
    }, [entityId, entityType]);

    return (
        <div>
            <div className="mb-2 flex items-center gap-2">
                <History className="size-5 text-primary" />
                <span className="text-base font-bold">
                    Field History
                </span>
                {history.length > 0 && (
                    <Badge variant="secondary" className="h-5 text-[0.7rem]">
                        {history.length}
                    </Badge>
                )}
            </div>

            {loading ? (
                <div className="flex justify-center py-6">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
            ) : history.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground/60">
                    <History className="mx-auto mb-2 size-8" />
                    <p className="text-sm">No history recorded yet.</p>
                </div>
            ) : (
                <div className="relative">
                    {/* Vertical timeline line */}
                    <div className="absolute inset-y-0 left-[11px] z-0 w-0.5 bg-border" />

                    <div className="flex flex-col gap-4">
                        {history.map((entry) => {
                            const badgeClassName = ACTION_BADGE_CLASSNAMES[entry.action] || ACTION_BADGE_CLASSNAMES.DEFAULT;
                            const dotClassName = DOT_CLASSNAMES[entry.action] || DOT_CLASSNAMES.DEFAULT;
                            return (
                                <div key={entry.id} className="relative z-10 flex gap-2">
                                    {/* Dot */}
                                    <div
                                        className={cn(
                                            "flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-card shadow-[0_0_0_2px_var(--border)]",
                                            dotClassName
                                        )}
                                    >
                                        <History className="size-3 text-white" />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 pb-2">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <Badge variant="outline" className={cn("h-5 text-[0.65rem] font-bold uppercase", badgeClassName)}>
                                                {entry.action.replace(/_/g, ' ')}
                                            </Badge>
                                            <span className="text-xs font-semibold">
                                                {entry.user.name}
                                            </span>
                                            <span className="text-xs text-muted-foreground/60">
                                                {formatWorkspaceRelativeTime(entry.createdAt)}
                                            </span>
                                        </div>

                                        {entry.before && entry.after && (
                                            <ChangedFields before={entry.before} after={entry.after} />
                                        )}

                                        {entry.diff && !entry.before && (
                                            <p className="mt-1 block text-xs text-muted-foreground">
                                                {JSON.stringify(entry.diff).slice(0, 120)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
