'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    trend?: {
        value: number;
        label: string;
        isPositive: boolean;
    };
    color?: string;
}

export function StatCard({ title, value, icon, trend }: StatCardProps) {
    const toneClassName = trend
        ? trend.isPositive
            ? "bg-primary/8 text-primary border-primary/20"
            : "bg-destructive/8 text-destructive border-destructive/20"
        : "bg-primary/8 text-primary border-primary/20";

    return (
        <Card className="relative h-full overflow-hidden">
            <CardContent>
                <div className="mb-4 flex items-center justify-between">
                    <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                        {title}
                    </span>
                    <div
                        className={cn(
                            "flex size-11 items-center justify-center rounded-xl border text-[22px]",
                            toneClassName
                        )}
                    >
                        {icon}
                    </div>
                </div>

                <div className="mb-1 text-3xl font-extrabold tracking-tight">
                    {value}
                </div>

                {trend && (
                    <div className="flex items-center gap-1">
                        <span
                            className={cn(
                                "flex items-center text-sm font-semibold",
                                trend.isPositive ? "text-primary" : "text-destructive"
                            )}
                        >
                            {trend.isPositive ? '+' : '-'}{Math.abs(trend.value)}%
                        </span>
                        <span className="text-xs text-muted-foreground">{trend.label}</span>
                    </div>
                )}
            </CardContent>

            {/* Subtle background decoration */}
            <div className="pointer-events-none absolute -right-2.5 -bottom-2.5 z-0 rotate-[-15deg] opacity-5">
                {React.isValidElement(icon)
                    ? React.cloneElement(icon as React.ReactElement<any>, { size: 100 })
                    : icon}
            </div>
        </Card>
    );
}
