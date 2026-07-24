'use client';

import React from 'react';
import { History, ArrowRight, User } from 'lucide-react';
import { formatWorkspaceRelativeTime } from '@/lib/date-format';
import { OpportunityStageHistory } from '@/types/opportunities';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface OpportunityStageHistoryProps {
    history: OpportunityStageHistory[];
}

export function OpportunityStageHistoryList({ history }: OpportunityStageHistoryProps) {
    if (history.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-border bg-surface-container-lowest py-8 text-center text-muted-foreground">
                <History className="mx-auto mb-2 size-10 opacity-20" />
                <p className="text-sm">No stage transitions recorded yet</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2.5">
            {history.map((item) => (
                <div
                    key={item.id}
                    className="rounded-xl border border-border bg-surface-container-lowest p-3 transition-colors hover:border-primary/10 hover:bg-primary/[0.02]"
                >
                    <div className="flex items-center gap-3">
                        <Avatar className="size-7.5">
                            <AvatarFallback className="bg-secondary-container text-on-secondary-container">
                                <History className="size-4" />
                            </AvatarFallback>
                        </Avatar>

                        <div className="flex-1">
                            <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                                {item.fromStage ? (
                                    <span className="text-sm font-bold text-muted-foreground">{item.fromStage.name}</span>
                                ) : (
                                    <span className="text-sm font-bold text-muted-foreground/60">Initial</span>
                                )}

                                <ArrowRight className="size-3.5 text-muted-foreground/60" />

                                <span className="text-sm font-extrabold text-primary">{item.toStage.name}</span>
                            </div>

                            <div className="flex items-center gap-1.5">
                                <div className="flex items-center gap-1">
                                    <User className="size-3 text-muted-foreground/60" />
                                    <span className="text-xs text-muted-foreground">{item.changedBy.name}</span>
                                </div>
                                <span className="text-xs text-muted-foreground/60">•</span>
                                <span className="text-xs text-muted-foreground">{formatWorkspaceRelativeTime(item.changedAt)}</span>
                            </div>
                        </div>
                    </div>

                    {item.notes && (
                        <div className="mt-2.5 pl-[42px]">
                            <p className="text-sm text-muted-foreground italic">&quot;{item.notes}&quot;</p>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
