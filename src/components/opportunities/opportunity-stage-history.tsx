'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';
import { formatWorkspaceDateTime, formatWorkspaceRelativeTime } from '@/lib/date-format';
import { OpportunityStageHistory } from '@/types/opportunities';

interface OpportunityStageHistoryProps {
    history: OpportunityStageHistory[];
}

// Stage changes as compact divided rows (UI/UX plan §10.5), with the Won/Lost reason under the
// move it was given for.
export function OpportunityStageHistoryList({ history }: OpportunityStageHistoryProps) {
    if (history.length === 0) {
        return <p className="py-6 text-center text-sm text-muted-foreground">No stage changes yet.</p>;
    }

    return (
        <ol className="divide-y rounded-lg border">
            {history.map((item) => (
                <li key={item.id} data-stage-history-item className="px-3 py-2.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
                        <span className="text-muted-foreground">{item.fromStage ? item.fromStage.name : "Created in"}</span>
                        <ArrowRight className="size-3.5 text-muted-foreground" aria-label="to" />
                        <span className="font-medium">{item.toStage.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground" title={formatWorkspaceDateTime(item.changedAt)}>
                            {item.changedBy?.name ? `${item.changedBy.name} · ` : ""}{formatWorkspaceRelativeTime(item.changedAt)}
                        </span>
                    </div>
                    {item.notes ? <p className="mt-1 break-words text-sm text-muted-foreground">{item.notes}</p> : null}
                </li>
            ))}
        </ol>
    );
}
