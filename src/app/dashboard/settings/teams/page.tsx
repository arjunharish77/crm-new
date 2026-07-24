"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button as UiButton } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Team } from "@/types/user";
import { apiFetch } from "@/lib/api";

import { CreateTeamDialog } from "./create-team-dialog";

export default function TeamsPage() {
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedRows, setSelectedRows] = useState<string[]>([]);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

    const fetchTeams = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/teams");
            setTeams(
                (Array.isArray(data) ? data : []).map((team: any) => ({
                    id: team.id,
                    name: team.name,
                    description: team.description,
                    leadId: team.leadId,
                    memberCount: team._count?.members ?? team.memberCount ?? team.members?.length ?? 0,
                    createdAt: team.createdAt,
                }))
            );
        } catch (error: any) {
            toast.error(error.message || "Failed to fetch teams");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTeams();
    }, [fetchTeams]);

    const handleCreateSuccess = () => {
        setCreateDialogOpen(false);
        setSelectedTeam(null);
        fetchTeams();
    };

    const handleEdit = (team: Team) => {
        setSelectedTeam(team);
        setCreateDialogOpen(true);
    };

    const handleDelete = async (team: Team) => {
        if (!confirm(`Delete team "${team.name}"?`)) return;

        try {
            await apiFetch(`/teams/${team.id}`, { method: "DELETE" });
            toast.success("Team deleted");
            fetchTeams();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete team");
        }
    };

    const columns = useMemo<ColumnDef<Team, any>[]>(() => [
        {
            accessorKey: 'name',
            header: 'Team Name',
            size: 260,
            cell: ({ row }) => (
                <div className="flex h-full items-center gap-3">
                    <Avatar className="size-8 bg-primary/10 text-primary">
                        <AvatarFallback>
                            <Users className="size-4" />
                        </AvatarFallback>
                    </Avatar>
                    <div>
                        <div className="text-sm font-semibold">{row.original.name}</div>
                        {row.original.description ? (
                            <div className="text-xs text-muted-foreground">{row.original.description}</div>
                        ) : null}
                    </div>
                </div>
            ),
        },
        {
            accessorKey: 'memberCount',
            header: 'Members',
            size: 140,
            cell: ({ row }) => (
                <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                    {row.original.memberCount} members
                </Badge>
            ),
        },
        {
            id: 'actions',
            header: '',
            size: 110,
            cell: ({ row }) => (
                <div className="flex gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <UiButton
                                variant="ghost"
                                size="icon-sm"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleEdit(row.original);
                                }}
                            >
                                <Pencil className="size-4" />
                            </UiButton>
                        </TooltipTrigger>
                        <TooltipContent>Edit</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <UiButton
                                variant="ghost"
                                size="icon-sm"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleDelete(row.original);
                                }}
                            >
                                <Trash2 className="size-4" />
                            </UiButton>
                        </TooltipTrigger>
                        <TooltipContent>Delete</TooltipContent>
                    </Tooltip>
                </div>
            ),
        },
    ], []);

    return (
        <div className="mx-auto max-w-[1600px] px-3 py-3 md:px-4 md:py-4">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold tracking-[-0.5px]">Teams</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Organize users into functional groups for assignment and reporting.
                    </p>
                </div>
                <Button
                    className="rounded-full px-3"
                    onClick={() => {
                        setSelectedTeam(null);
                        setCreateDialogOpen(true);
                    }}
                >
                    <Plus className="size-4" />
                    Create Team
                </Button>
            </div>

            <Card className="h-[600px] w-full overflow-hidden">
                    <DataTable
                        storageKey="settings-teams-table"
                        data={teams}
                        columns={columns}
                        loading={loading}
                        getRowId={(row) => row.id}
                        enableRowSelection
                        rowSelectionIds={selectedRows}
                        onRowSelectionIdsChange={setSelectedRows}
                        emptyState={{
                            icon: <Users className="size-10 text-muted-foreground opacity-50" />,
                            title: "No teams defined",
                            description: "Create teams to group your users.",
                            action: (
                                <Button variant="outline" onClick={() => setCreateDialogOpen(true)}>
                                    <Plus className="size-4" />
                                    Create Team
                                </Button>
                            ),
                        }}
                    />
            </Card>

            <CreateTeamDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                team={selectedTeam}
                onSuccess={handleCreateSuccess}
            />
        </div>
    );
}
