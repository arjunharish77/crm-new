"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Users, Target, TrendingUp, Activity, Phone } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";

type TeamMember = { id: string; userId: string; role: string | null; joinedAt: string; user: { id: string; name: string; email: string } | null };
type TeamDetail = {
    id: string; name: string; description: string | null; department: string | null;
    timezone: string; isActive: boolean; members: TeamMember[]; memberCount: number;
};
type RepPerformanceRow = {
    repId: string; repName: string; leadsOwned: number; opportunitiesOwned: number;
    wonOpportunities: number; activitiesCreated: number; callsCreated: number;
    conversionRate: number | null; avgFirstResponseMinutes: number | null;
};
type TeamPerformance = {
    rows: RepPerformanceRow[];
    totals: { leadsOwned: number; opportunitiesOwned: number; wonOpportunities: number; activitiesCreated: number; callsCreated: number };
};

// Gap checklist Module 17's "embedded analytics surfaces" sub-item ("partner/counselor/team
// mini dashboards"). Previously there was no per-team detail page anywhere in this codebase --
// `settings/teams` was a flat admin list only -- so this is a genuinely new page, not a widget
// dropped into an existing one. The mini-dashboard reuses the existing rep-performance report
// filtered to this team's own members rather than a new aggregation pipeline.
export default function TeamDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const [team, setTeam] = useState<TeamDetail | null>(null);
    const [performance, setPerformance] = useState<TeamPerformance | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [teamData, performanceData] = await Promise.all([
                apiFetch<TeamDetail>(`/teams/${params.id}`),
                apiFetch<TeamPerformance>(`/teams/${params.id}/performance`),
            ]);
            setTeam(teamData);
            setPerformance(performanceData);
        } catch (error: any) {
            if (error?.status === 404) setNotFound(true);
            else toast.error(error.message || "Failed to load team");
        } finally {
            setLoading(false);
        }
    }, [params.id]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    if (loading) {
        return (
            <div className="mx-auto max-w-[1200px] p-4">
                <Skeleton className="mb-4 h-8 w-64" />
                <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
        );
    }

    if (notFound || !team) {
        return (
            <div className="mx-auto max-w-[1200px] p-4">
                <Button variant="ghost" onClick={() => router.push("/dashboard/settings/teams")}>
                    <ArrowLeft className="size-4" />
                    Back to Teams
                </Button>
                <p className="mt-4 text-sm text-muted-foreground">Team not found.</p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[1200px] p-4">
            <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/settings/teams")} className="mb-3">
                <ArrowLeft className="size-4" />
                Back to Teams
            </Button>

            <div className="mb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Avatar className="size-12 bg-primary/10 text-primary">
                        <AvatarFallback><Users className="size-5" /></AvatarFallback>
                    </Avatar>
                    <div>
                        <h1 className="text-xl font-extrabold">{team.name}</h1>
                        {team.description ? <p className="text-sm text-muted-foreground">{team.description}</p> : null}
                    </div>
                </div>
                <Badge variant="outline" className={team.isActive ? "border-primary/20 bg-primary/10 text-primary" : "text-muted-foreground"}>
                    {team.isActive ? "Active" : "Inactive"}
                </Badge>
            </div>

            {performance ? (
                <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                    <StatCard title="Leads Owned" value={performance.totals.leadsOwned} icon={<Users />} />
                    <StatCard title="Opportunities" value={performance.totals.opportunitiesOwned} icon={<Target />} />
                    <StatCard title="Won" value={performance.totals.wonOpportunities} icon={<TrendingUp />} />
                    <StatCard title="Activities" value={performance.totals.activitiesCreated} icon={<Activity />} />
                    <StatCard title="Calls" value={performance.totals.callsCreated} icon={<Phone />} />
                </div>
            ) : null}

            <Card className="mb-4 rounded-2xl">
                <CardContent className="p-6">
                    <h2 className="mb-3 text-lg font-bold">Members ({team.memberCount})</h2>
                    {team.members.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No members in this team yet.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Leads Owned</TableHead>
                                    <TableHead>Opportunities</TableHead>
                                    <TableHead>Won</TableHead>
                                    <TableHead>Activities</TableHead>
                                    <TableHead>Conversion Rate</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {team.members.map((member) => {
                                    const row = performance?.rows.find((item) => item.repId === member.userId);
                                    return (
                                        <TableRow key={member.id}>
                                            <TableCell className="font-medium">{member.user?.name ?? "Unknown"}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{member.role ?? "Member"}</TableCell>
                                            <TableCell>{row?.leadsOwned ?? 0}</TableCell>
                                            <TableCell>{row?.opportunitiesOwned ?? 0}</TableCell>
                                            <TableCell>{row?.wonOpportunities ?? 0}</TableCell>
                                            <TableCell>{row?.activitiesCreated ?? 0}</TableCell>
                                            <TableCell>{row?.conversionRate !== null && row?.conversionRate !== undefined ? `${(row.conversionRate * 100).toFixed(1)}%` : "—"}</TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
