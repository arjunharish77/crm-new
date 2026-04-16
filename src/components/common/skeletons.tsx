"use client";

import React from "react";
import { Box, Skeleton, Card, Stack } from "@mui/material";

interface TableSkeletonProps {
    rows?: number;
    columns?: number;
    hasToolbar?: boolean;
}

export function TableSkeleton({ rows = 8, columns = 5, hasToolbar = true }: TableSkeletonProps) {
    return (
        <Card sx={{ overflow: "hidden" }}>
            {hasToolbar && (
                <Box
                    sx={{
                        px: 2,
                        py: 1.5,
                        borderBottom: "1px solid",
                        borderColor: "divider",
                        display: "flex",
                        gap: 1,
                    }}
                >
                    <Skeleton variant="rounded" width={80} height={32} />
                    <Skeleton variant="rounded" width={80} height={32} />
                    <Skeleton variant="rounded" width={80} height={32} />
                    <Box sx={{ flexGrow: 1 }} />
                    <Skeleton variant="rounded" width={100} height={32} />
                </Box>
            )}

            {/* Header row */}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${columns}, 1fr)`,
                    gap: 2,
                    px: 2,
                    py: 1.5,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                }}
            >
                {Array.from({ length: columns }).map((_, i) => (
                    <Skeleton key={`h-${i}`} variant="text" width={`${60 + Math.random() * 40}%`} height={20} />
                ))}
            </Box>

            {/* Data rows */}
            {Array.from({ length: rows }).map((_, rowIdx) => (
                <Box
                    key={`r-${rowIdx}`}
                    sx={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${columns}, 1fr)`,
                        gap: 2,
                        px: 2,
                        py: 1.5,
                        borderBottom: "1px solid",
                        borderColor: "divider",
                    }}
                >
                    {Array.from({ length: columns }).map((_, colIdx) => (
                        <Skeleton
                            key={`c-${rowIdx}-${colIdx}`}
                            variant="text"
                            width={`${50 + Math.random() * 50}%`}
                            height={18}
                        />
                    ))}
                </Box>
            ))}
        </Card>
    );
}

interface PageSkeletonProps {
    hasHeader?: boolean;
    cardCount?: number;
}

export function PageSkeleton({ hasHeader = true, cardCount = 3 }: PageSkeletonProps) {
    return (
        <Box>
            {hasHeader && (
                <Box sx={{ mb: 4 }}>
                    <Skeleton variant="text" width={240} height={36} />
                    <Skeleton variant="text" width={320} height={20} sx={{ mt: 0.5 }} />
                </Box>
            )}
            <Stack spacing={3}>
                {Array.from({ length: cardCount }).map((_, i) => (
                    <Card key={i} sx={{ p: 3 }}>
                        <Skeleton variant="text" width="30%" height={24} />
                        <Skeleton variant="text" width="80%" height={18} sx={{ mt: 1 }} />
                        <Skeleton variant="text" width="60%" height={18} sx={{ mt: 0.5 }} />
                    </Card>
                ))}
            </Stack>
        </Box>
    );
}

interface DashboardSkeletonProps {
    statCount?: number;
}

export function DashboardSkeleton({ statCount = 4 }: DashboardSkeletonProps) {
    return (
        <Box>
            {/* Stat cards */}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: `repeat(${statCount}, 1fr)` },
                    gap: 3,
                    mb: 4,
                }}
            >
                {Array.from({ length: statCount }).map((_, i) => (
                    <Card key={i} sx={{ p: 3 }}>
                        <Skeleton variant="text" width="40%" height={16} />
                        <Skeleton variant="text" width="60%" height={36} sx={{ mt: 1 }} />
                        <Skeleton variant="text" width="50%" height={14} sx={{ mt: 0.5 }} />
                    </Card>
                ))}
            </Box>

            {/* Chart area */}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
                <Card sx={{ p: 3 }}>
                    <Skeleton variant="text" width="30%" height={24} />
                    <Skeleton variant="rounded" width="100%" height={240} sx={{ mt: 2 }} />
                </Card>
                <Card sx={{ p: 3 }}>
                    <Skeleton variant="text" width="30%" height={24} />
                    <Skeleton variant="rounded" width="100%" height={240} sx={{ mt: 2 }} />
                </Card>
            </Box>
        </Box>
    );
}
