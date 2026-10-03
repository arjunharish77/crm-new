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
import { ArrowLeft, Users, Target, TrendingUp, Activity, Phone, UserPlus, UserMinus } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { useRecordTitle } from "@/components/app-states/page-title";
import { ErrorState } from "@/components/common/error-state";
import { EmptyState } from "@/components/common/empty-state";
import { StandardDialog } from "@/components/common/standard-dialog";
import { FormField } from "@/components/common/form-field";
import { RecordPicker, type PickedRecord } from "@/components/common/record-picker";
import { useConfirm } from "@/components/common/dialogs-provider";
import { humanizeEnum } from "@/lib/display/status";

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

// Adds one user to the team (POST /teams/:id/members, admin only). The picker lists every user,
// so someone already on the team is caught here, inline, rather than as a server error.
function AddMemberDialog({ open, teamId, teamName, memberUserIds, onClose, onAdded }: {
    open: boolean;
    teamId: string;
    teamName: string;
    memberUserIds: string[];
    onClose: () => void;
    onAdded: (name: string) => void;
}) {
    const [picked, setPicked] = useState<PickedRecord | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const close = () => {
        setPicked(null);
        setError(null);
        onClose();
    };

    const submit = async () => {
        if (!picked) {
            setError("Choose a user to add.");
            return;
        }
        if (memberUserIds.includes(picked.id)) {
            setError(`${picked.label} is already on this team.`);
            return;
        }
        setSaving(true);
        try {
            await apiFetch(`/teams/${teamId}/members`, { method: "POST", body: JSON.stringify({ userId: picked.id }) });
            onAdded(picked.label);
            setPicked(null);
            setError(null);
        } catch (err: any) {
            setError(err?.message || "The member couldn't be added.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <StandardDialog
            open={open}
            onClose={close}
            title="Add member"
            subtitle={`Add a user to ${teamName}.`}
            maxWidth="xs"
            actions={
                <>
                    <Button variant="outline" onClick={close} disabled={saving}>Cancel</Button>
                    <Button onClick={submit} isLoading={saving} disabled={saving}>Add member</Button>
                </>
            }
        >
            <FormField id="team-member-user" label="User" required error={error}>
                <RecordPicker
                    entity="user"
                    value={picked?.id ?? null}
                    allowClear={false}
                    invalid={!!error}
                    describedBy={error ? "team-member-user-error" : undefined}
                    onChange={(_, record) => {
                        setPicked(record);
                        setError(record && memberUserIds.includes(record.id) ? `${record.label} is already on this team.` : null);
                    }}
                />
            </FormField>
        </StandardDialog>
    );
}

// Gap checklist Module 17's "embedded analytics surfaces" sub-item ("partner/counselor/team
// mini dashboards"). Previously there was no per-team detail page anywhere in this codebase --
// `settings/teams` was a flat admin list only -- so this is a genuinely new page, not a widget
// dropped into an existing one. The mini-dashboard reuses the existing rep-performance report
// filtered to this team's own members rather than a new aggregation pipeline.
export default function TeamDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const confirm = useConfirm();
    const [team, setTeam] = useState<TeamDetail | null>(null);
    useRecordTitle(team?.name);
    const [performance, setPerformance] = useState<TeamPerformance | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [removingUserId, setRemovingUserId] = useState<string | null>(null);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const [teamData, performanceData] = await Promise.all([
                apiFetch<TeamDetail>(`/teams/${params.id}`),
                apiFetch<TeamPerformance>(`/teams/${params.id}/performance`),
            ]);
            setTeam(teamData);
            setPerformance(performanceData);
        } catch (error: any) {
            if (error?.status === 404) setNotFound(true);
            else setLoadError(error?.message || "The team couldn't be loaded.");
        } finally {
            setLoading(false);
        }
    }, [params.id]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    // Refreshes the member list without the page skeleton (performance totals stay as loaded).
    const reloadTeam = useCallback(async () => {
        try {
            setTeam(await apiFetch<TeamDetail>(`/teams/${params.id}`));
        } catch (error: any) {
            toast.error(error?.message || "The member list couldn't be refreshed");
        }
    }, [params.id]);

    const removeMember = async (member: TeamMember) => {
        if (!team) return;
        const name = member.user?.name || member.user?.email || "this user";
        const ok = await confirm({
            title: `Remove ${name} from ${team.name}?`,
            description: "They keep their account and records; they just stop counting as part of this team.",
            confirmLabel: "Remove member",
            destructive: true,
        });
        if (!ok) return;
        setRemovingUserId(member.userId);
        try {
            await apiFetch(`/teams/${team.id}/members/${member.userId}`, { method: "DELETE" });
            toast.success(`${name} removed from ${team.name}`);
            await reloadTeam();
        } catch (error: any) {
            toast.error(error?.message || "The member couldn't be removed");
        } finally {
            setRemovingUserId(null);
        }
    };

    if (loading) {
        return (
            <div className="mx-auto max-w-[1200px] p-4">
                <Skeleton className="mb-4 h-8 w-64" />
                <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="mx-auto max-w-[1200px] p-4">
                <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/settings/access/teams")} className="mb-3">
                    <ArrowLeft className="size-4" />
                    Back to Teams
                </Button>
                <ErrorState title="Team couldn't be loaded" description={loadError} onRetry={fetchAll} />
            </div>
        );
    }

    if (notFound || !team) {
        return (
            <div className="mx-auto max-w-[1200px] p-4">
                <Button variant="ghost" onClick={() => router.push("/dashboard/settings/access/teams")}>
                    <ArrowLeft className="size-4" />
                    Back to Teams
                </Button>
                <p className="mt-4 text-sm text-muted-foreground">Team not found.</p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[1200px] p-4">
            <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/settings/access/teams")} className="mb-3">
                <ArrowLeft className="size-4" />
                Back to Teams
            </Button>

            <div className="mb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Avatar className="size-12 bg-primary/10 text-primary">
                        <AvatarFallback><Users className="size-5" /></AvatarFallback>
                    </Avatar>
                    <div>
                        <h1 className="text-xl font-semibold">{team.name}</h1>
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
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-lg font-bold">Members ({team.memberCount})</h2>
                        <Button size="sm" onClick={() => setAddOpen(true)}>
                            <UserPlus className="size-4" />
                            Add member
                        </Button>
                    </div>
                    {team.members.length === 0 ? (
                        <EmptyState
                            variant="inline"
                            icon={<Users />}
                            title="No members yet"
                            description="Add users to this team to include them in its assignment and reporting."
                            action={<Button variant="outline" size="sm" onClick={() => setAddOpen(true)}><UserPlus className="size-4" />Add member</Button>}
                        />
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
                                    <TableHead><span className="sr-only">Actions</span></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {team.members.map((member) => {
                                    const row = performance?.rows.find((item) => item.repId === member.userId);
                                    return (
                                        <TableRow key={member.id}>
                                            <TableCell className="font-medium">{member.user?.name ?? "Unknown"}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{member.role ? humanizeEnum(member.role) : "Member"}</TableCell>
                                            <TableCell>{row?.leadsOwned ?? 0}</TableCell>
                                            <TableCell>{row?.opportunitiesOwned ?? 0}</TableCell>
                                            <TableCell>{row?.wonOpportunities ?? 0}</TableCell>
                                            <TableCell>{row?.activitiesCreated ?? 0}</TableCell>
                                            <TableCell>{row?.conversionRate !== null && row?.conversionRate !== undefined ? `${(row.conversionRate * 100).toFixed(1)}%` : "—"}</TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                    aria-label={`Remove ${member.user?.name ?? "member"} from ${team.name}`}
                                                    isLoading={removingUserId === member.userId}
                                                    disabled={removingUserId === member.userId}
                                                    onClick={() => removeMember(member)}
                                                >
                                                    {removingUserId === member.userId ? null : <UserMinus className="size-4" />}
                                                    Remove
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <AddMemberDialog
                open={addOpen}
                teamId={team.id}
                teamName={team.name}
                memberUserIds={team.members.map((member) => member.userId)}
                onClose={() => setAddOpen(false)}
                onAdded={(name) => {
                    setAddOpen(false);
                    toast.success(`${name} added to ${team.name}`);
                    reloadTeam();
                }}
            />
        </div>
    );
}
