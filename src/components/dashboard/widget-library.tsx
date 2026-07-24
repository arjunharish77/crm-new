'use client';

import { useEffect, useState } from 'react';
import { MoreVertical, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
} from 'recharts';
import { StatCard } from './stat-card';

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

    if (loading) return <Skeleton className="size-full rounded-2xl" />;
    if (error) return (
        <Card className="flex h-full items-center justify-center">
            <p className="text-sm text-destructive">{error}</p>
        </Card>
    );

    const renderContent = () => {
        switch (widget.type) {
            case 'STAT':
                return (
                    <StatCard
                        title={widget.title}
                        value={data}
                        icon={<TrendingUp />}
                    />
                );

            case 'TREND':
                return (
                    <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                            <XAxis
                                dataKey="group"
                                stroke="var(--muted-foreground)"
                                fontSize={12}
                            />
                            <YAxis
                                stroke="var(--muted-foreground)"
                                fontSize={12}
                            />
                            <Tooltip />
                            <Line
                                type="monotone"
                                dataKey="value"
                                stroke="var(--primary)"
                                strokeWidth={2}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                );

            case 'BAR':
                return (
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                            <XAxis dataKey="group" fontSize={12} />
                            <YAxis fontSize={12} />
                            <Tooltip />
                            <Bar dataKey="value" fill="var(--secondary)" radius={[4, 4, 0, 0]} />
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
                            <Bar dataKey="count" fill="var(--primary-container)" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                );

            default:
                return <p className="text-sm">Unknown widget type: {widget.type}</p>;
        }
    };

    const renderMenu = () => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm">
                    <MoreVertical className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit?.()}>Edit</DropdownMenuItem>
                <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete?.()}
                >
                    Delete
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );

    if (widget.type === 'STAT') {
        return (
            <div className="relative h-full">
                {renderContent()}
                <div className="absolute right-2 top-2">
                    {renderMenu()}
                </div>
            </div>
        );
    }

    return (
        <Card className="h-full rounded-2xl">
            <CardHeader>
                <CardTitle className="text-base font-bold">{widget.title}</CardTitle>
                <CardAction>
                    {renderMenu()}
                </CardAction>
            </CardHeader>
            <CardContent>
                {renderContent()}
            </CardContent>
        </Card>
    );
}
