
"use client";

import { useEffect, useState } from "react";
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
    Legend
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

export function AnalyticsDashboard() {
    const [oppStats, setOppStats] = useState([]);
    const [activityStats, setActivityStats] = useState({ byType: [], trend: [] });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                const [oppResponse, activityResponse] = await Promise.all([
                    apiFetch("/opportunities/stats"),
                    apiFetch("/activities/stats")
                ]);
                setOppStats(oppResponse);
                setActivityStats(activityResponse);
            } catch (error) {
                console.error("Failed to fetch analytics data:", error);
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, []);

    if (isLoading) {
        return <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
                <Card key={i} className="h-[400px] animate-pulse bg-muted/50" />
            ))}
        </div>;
    }

    return (
        <div className="grid gap-4 md:grid-cols-2">
            <Card className="col-span-1">
                <CardHeader>
                    <CardTitle>Pipeline Value by Stage</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={oppStats}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="stage" />
                            <YAxis />
                            <Tooltip
                                formatter={(value) => [`$${Number(value).toLocaleString()}`, "Value"]}
                            />
                            <Bar dataKey="value" fill="#8884d8" name="Total Value" />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card className="col-span-1">
                <CardHeader>
                    <CardTitle>Activity Trends (Last 7 Days)</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={activityStats.trend}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey="count"
                                stroke="#82ca9d"
                                name="Activities"
                                strokeWidth={2}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card className="col-span-full">
                <CardHeader>
                    <CardTitle>Activity Distribution</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={activityStats.byType} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis dataKey="type" type="category" />
                            <Tooltip />
                            <Bar dataKey="count" fill="#ffc658" name="Count" />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}
