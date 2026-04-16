'use client';

import * as React from 'react';
import { Card, CardContent, Typography, Box, Avatar, useTheme, alpha } from '@mui/material';

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

export function StatCard({ title, value, icon, trend, color = 'primary.main' }: StatCardProps) {
    const theme = useTheme();

    return (
        <Card sx={{ height: '100%', position: 'relative', overflow: 'hidden' }}>
            <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 1 }}>
                        {title}
                    </Typography>
                    <Avatar
                        sx={{
                            bgcolor: trend?.isPositive ? alpha(theme.palette.success.main, 0.08) : (trend ? alpha(theme.palette.error.main, 0.08) : alpha(theme.palette.primary.main, 0.08)),
                            color: trend?.isPositive ? 'success.main' : (trend ? 'error.main' : 'primary.main'),
                            width: 44,
                            height: 44,
                            borderRadius: '12px',
                            border: '1px solid',
                            borderColor: trend?.isPositive ? alpha(theme.palette.success.main, 0.2) : (trend ? alpha(theme.palette.error.main, 0.2) : alpha(theme.palette.primary.main, 0.2)),
                        }}
                    >
                        <Box sx={{ fontSize: 22, display: 'flex' }}>
                            {icon}
                        </Box>
                    </Avatar>
                </Box>

                <Typography variant="h3" sx={{ fontWeight: 800, mb: 1, letterSpacing: -1 }}>
                    {value}
                </Typography>

                {trend && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography
                            variant="body2"
                            sx={{
                                fontWeight: 600,
                                color: trend.isPositive ? 'success.main' : 'error.main',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                        >
                            {trend.isPositive ? '+' : '-'}{Math.abs(trend.value)}%
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {trend.label}
                        </Typography>
                    </Box>
                )}
            </CardContent>

            {/* Subtle background decoration */}
            <Box
                sx={{
                    position: 'absolute',
                    right: -10,
                    bottom: -10,
                    opacity: 0.05,
                    transform: 'rotate(-15deg)',
                    zIndex: 0
                }}
            >
                {React.cloneElement(icon as any, { sx: { fontSize: 100 } })}
            </Box>
        </Card>
    );
}
