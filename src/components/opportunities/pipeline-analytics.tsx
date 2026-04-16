"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { DollarSign, Hash } from "lucide-react";

interface StageStat {
    stage: string;
    value: number;
    count: number;
}

export function PipelineAnalytics() {
    const [stats, setStats] = useState<StageStat[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        apiFetch("/opportunities/stats")
            .then(setStats)
            .catch(() => toast.error("Failed to load analytics"))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div>Loading analytics...</div>;

    const totalValue = stats.reduce((acc, curr) => acc + curr.value, 0);
    const totalCount = stats.reduce((acc, curr) => acc + curr.count, 0);

    // Sort by something meaningful? Usually pipeline order is best, but API returns mapped stats.
    // The API response order depends on how grouping happened. 
    // Ideally, we want stage order. But we don't have stage order in the stats response explicitly unless we join/sort.
    // The current API implementation maps using `stages.find`, so if `stages` are sorted by order, we might get lucky or need to sort.
    // Let's assume for now the API returns them in a reasonable order or we rely on the chart.
    // Actually, `groupBy` result order is undefined, but the `map` uses `stages.find`. 
    // Wait, the API `stages.findMany()` typically returns by ID or creation unless ordered.
    // We should probably rely on the backend to sort, or just display as is for MVP. 

    // Bright colors for charts
    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#8dd1e1'];

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Pipeline Value</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Opportunities</CardTitle>
                        <Hash className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalCount}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card className="col-span-2">
                    <CardHeader>
                        <CardTitle>Pipeline Value by Stage</CardTitle>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="stage"
                                        stroke="#888888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        stroke="#888888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => `$${value}`}
                                    />
                                    <Tooltip
                                        formatter={(value: any) => [formatCurrency(value), "Value"]}
                                        cursor={{ fill: 'transparent' }}
                                    />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                        {stats.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* We could add another chart here later, e.g. Count by Stage */}
            </div>
        </div>
    );
}
