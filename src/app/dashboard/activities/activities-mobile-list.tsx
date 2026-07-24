"use client";

import Link from "next/link";
import { Activity } from "@/types/activities";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatWorkspaceRelativeTime } from "@/lib/date-format";

interface ActivitiesMobileListProps {
    data: Activity[];
}

export function ActivitiesMobileList({ data }: ActivitiesMobileListProps) {
    if (data.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed bg-accent p-8 text-center">
                <p className="text-sm text-muted-foreground">No activities found.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2 md:hidden">
            {data.map((activity) => (
                <div
                    key={activity.id}
                    className="rounded-2xl border bg-card p-4 transition-colors hover:bg-accent/50"
                >
                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                                {activity.type && (
                                    <Badge
                                        variant="outline"
                                        className="mb-1 rounded-md text-[0.625rem] font-bold uppercase"
                                        style={{
                                            backgroundColor: activity.type.color ? `${activity.type.color}14` : undefined,
                                            borderColor: activity.type.color ? `${activity.type.color}33` : undefined,
                                            color: activity.type.color ?? undefined,
                                        }}
                                    >
                                        {activity.type.name}
                                    </Badge>
                                )}
                                <p className="line-clamp-2 text-sm font-semibold">{activity.notes}</p>
                            </div>
                            {activity.outcome && (
                                <Badge
                                    variant="outline"
                                    className="shrink-0 rounded border-border bg-muted text-[0.625rem] font-bold text-muted-foreground"
                                >
                                    {activity.outcome}
                                </Badge>
                            )}
                        </div>

                        <p
                            className={cn(
                                "text-xs font-semibold",
                                activity.completedAt
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : activity.dueAt
                                        ? "text-amber-600 dark:text-amber-400"
                                        : "text-muted-foreground"
                            )}
                        >
                            {activity.completedAt
                                ? `✓ Completed ${formatWorkspaceRelativeTime(activity.completedAt)}`
                                : activity.dueAt
                                    ? `Due ${formatWorkspaceRelativeTime(activity.dueAt)}`
                                    : `Logged ${formatWorkspaceRelativeTime(activity.createdAt)}`}
                        </p>

                        {(activity.lead || activity.opportunity) && (
                            <div className="flex flex-wrap gap-3 border-t pt-2 text-[0.7rem] font-bold">
                                {activity.lead && (
                                    <Link
                                        href={`/dashboard/leads/${activity.lead.id}`}
                                        className="text-primary hover:underline"
                                    >
                                        Lead: {activity.lead.name}
                                    </Link>
                                )}
                                {activity.opportunity && (
                                    <Link
                                        href={`/dashboard/opportunities/${activity.opportunity.id}`}
                                        className="text-secondary hover:underline"
                                    >
                                        Opp: {activity.opportunity.title}
                                    </Link>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
