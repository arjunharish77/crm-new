"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DollarSign, Hash } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface StageStat {
    stage: string;
    value: number;
    count: number;
}

export function OpportunityStageAnalytics() {
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
    const colors = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#8dd1e1"];

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Open Opportunity Value</CardTitle>
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
                        <CardTitle>Opportunity Value by Stage</CardTitle>
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
                                        tickFormatter={(value) =>
                                            formatCurrency(Number(value), undefined, {
                                                notation: "compact",
                                                maximumFractionDigits: 1,
                                            })
                                        }
                                    />
                                    <Tooltip
                                        formatter={(value: unknown) => [formatCurrency(Number(value)), "Value"]}
                                        cursor={{ fill: "transparent" }}
                                    />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                        {stats.map((entry, index) => (
                                            <Cell key={`${entry.stage}-${index}`} fill={colors[index % colors.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
