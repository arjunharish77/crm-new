'use client';

import React, { useEffect, useState } from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    Typography,
    Box,
    Skeleton,
    useTheme,
    alpha,
    IconButton,
    Menu,
    MenuItem
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { apiFetch } from '@/lib/api';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line,
    Cell,
    PieChart,
    Pie
} from 'recharts';
import { StatCard } from './stat-card';
import {
    TrendingUp as TrendingUpIcon,
    People as PeopleIcon,
    Work as WorkIcon,
    History as HistoryIcon
} from '@mui/icons-material';

interface WidgetProps {
    widget: {
        id: string;
        title: string;
        type: string;
        config: any;
        layout: any;
    };
    onEdit?: () => void;
    onDelete?: () => void;
}

export function DashboardWidget({ widget, onEdit, onDelete }: WidgetProps) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const theme = useTheme();

    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const result = await apiFetch(`/dashboard-widgets/${widget.id}/data`);
                setData(result);
            } catch (err: any) {
                setError(err.message || 'Failed to load widget data');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [widget.id]);

    const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };
    const handleMenuClose = () => {
        setAnchorEl(null);
    };

    if (loading) return <Skeleton variant="rectangular" height="100%" sx={{ borderRadius: 4 }} />;
    if (error) return (
        <Card sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="error">{error}</Typography>
        </Card>
    );

    const renderContent = () => {
        switch (widget.type) {
            case 'STAT':
                return (
                    <StatCard
                        title={widget.title}
                        value={data}
                        icon={<TrendingUpIcon />}
                    />
                );

            case 'TREND':
                return (
                    <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
                            <XAxis
                                dataKey="group"
                                stroke={theme.palette.text.secondary}
                                fontSize={12}
                            />
                            <YAxis
                                stroke={theme.palette.text.secondary}
                                fontSize={12}
                            />
                            <Tooltip />
                            <Line
                                type="monotone"
                                dataKey="value"
                                stroke={theme.palette.primary.main}
                                strokeWidth={2}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                );

            case 'BAR':
                return (
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
                            <XAxis dataKey="group" fontSize={12} />
                            <YAxis fontSize={12} />
                            <Tooltip />
                            <Bar dataKey="value" fill={theme.palette.secondary.main} radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                );

            case 'FUNNEL':
                // Funnel implementation using customized Bar chart or specialized component
                return (
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={data} layout="vertical">
                            <XAxis type="number" hide />
                            <YAxis dataKey="stage" type="category" width={100} fontSize={11} />
                            <Tooltip />
                            <Bar dataKey="count" fill={theme.palette.primary.light} radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                );

            default:
                return <Typography>Unknown widget type: {widget.type}</Typography>;
        }
    };

    // Stats are rendered differently (already contain their own card)
    if (widget.type === 'STAT') return renderContent();

    return (
        <Card sx={{ height: '100%', borderRadius: 4 }}>
            <CardHeader
                title={widget.title}
                titleTypographyProps={{ variant: 'subtitle1', fontWeight: 700 }}
                action={
                    <>
                        <IconButton onClick={handleMenuClick} size="small">
                            <MoreVertIcon />
                        </IconButton>
                        <Menu anchorEl={anchorEl} open={open} onClose={handleMenuClose}>
                            <MenuItem onClick={() => { handleMenuClose(); onEdit?.(); }}>Edit</MenuItem>
                            <MenuItem onClick={() => { handleMenuClose(); onDelete?.(); }} sx={{ color: 'error.main' }}>Delete</MenuItem>
                        </Menu>
                    </>
                }
            />
            <CardContent>
                {renderContent()}
            </CardContent>
        </Card>
    );
}
