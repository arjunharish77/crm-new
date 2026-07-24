"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface TableSkeletonProps {
    rows?: number;
    columns?: number;
    hasToolbar?: boolean;
}

// Deterministic widths to avoid hydration mismatch from Math.random()
const HEADER_WIDTHS = [75, 85, 65, 90, 70, 80, 60, 95];
const ROW_WIDTHS = [68, 82, 55, 90, 72, 60, 88, 77, 65, 93, 58, 85, 70, 95, 63, 80];

export function TableSkeleton({ rows = 8, columns = 5, hasToolbar = true }: TableSkeletonProps) {
    return (
        <div className="overflow-hidden rounded-xl border bg-card">
            {hasToolbar && (
                <div className="flex gap-2 border-b px-4 py-3">
                    <Skeleton className="h-8 w-20 rounded-lg" />
                    <Skeleton className="h-8 w-20 rounded-lg" />
                    <Skeleton className="h-8 w-20 rounded-lg" />
                    <div className="grow" />
                    <Skeleton className="h-8 w-[100px] rounded-lg" />
                </div>
            )}

            {/* Header row */}
            <div
                className="grid gap-4 border-b px-4 py-3"
                style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
            >
                {Array.from({ length: columns }).map((_, i) => (
                    <Skeleton key={`h-${i}`} className="h-5" style={{ width: `${HEADER_WIDTHS[i % HEADER_WIDTHS.length]}%` }} />
                ))}
            </div>

            {/* Data rows */}
            {Array.from({ length: rows }).map((_, rowIdx) => (
                <div
                    key={`r-${rowIdx}`}
                    className="grid gap-4 border-b px-4 py-3 last:border-b-0"
                    style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
                >
                    {Array.from({ length: columns }).map((_, colIdx) => (
                        <Skeleton
                            key={`c-${rowIdx}-${colIdx}`}
                            className="h-[18px]"
                            style={{ width: `${ROW_WIDTHS[(rowIdx * columns + colIdx) % ROW_WIDTHS.length]}%` }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

interface PageSkeletonProps {
    hasHeader?: boolean;
    cardCount?: number;
}

export function PageSkeleton({ hasHeader = true, cardCount = 3 }: PageSkeletonProps) {
    return (
        <div>
            {hasHeader && (
                <div className="mb-8">
                    <Skeleton className="h-9 w-60" />
                    <Skeleton className="mt-1 h-5 w-80" />
                </div>
            )}
            <div className="flex flex-col gap-4">
                {Array.from({ length: cardCount }).map((_, i) => (
                    <div key={i} className="rounded-xl border bg-card p-6">
                        <Skeleton className="h-6 w-[30%]" />
                        <Skeleton className="mt-2 h-[18px] w-[80%]" />
                        <Skeleton className="mt-1 h-[18px] w-[60%]" />
                    </div>
                ))}
            </div>
        </div>
    );
}

interface DashboardSkeletonProps {
    statCount?: number;
}

export function DashboardSkeleton({ statCount = 4 }: DashboardSkeletonProps) {
    return (
        <div>
            {/* Stat cards */}
            <div
                className={cn(
                    "mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2",
                    statCount === 4 ? "md:grid-cols-4" : "md:grid-cols-3"
                )}
            >
                {Array.from({ length: statCount }).map((_, i) => (
                    <div key={i} className="rounded-xl border bg-card p-6">
                        <Skeleton className="h-4 w-[40%]" />
                        <Skeleton className="mt-2 h-9 w-[60%]" />
                        <Skeleton className="mt-1 h-3.5 w-[50%]" />
                    </div>
                ))}
            </div>

            {/* Chart area */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border bg-card p-6">
                    <Skeleton className="h-6 w-[30%]" />
                    <Skeleton className="mt-4 h-60 w-full rounded-lg" />
                </div>
                <div className="rounded-xl border bg-card p-6">
                    <Skeleton className="h-6 w-[30%]" />
                    <Skeleton className="mt-4 h-60 w-full rounded-lg" />
                </div>
            </div>
        </div>
    );
}
