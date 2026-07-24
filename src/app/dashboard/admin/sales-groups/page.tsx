"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceRelativeTime } from "@/lib/date-format";
import { ColumnDef } from "@tanstack/react-table";
import { Settings, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { SalesGroupDialog } from "./sales-group-dialog";
import { ManageMembersDialog } from "./manage-members-dialog";
import { DataTable } from "@/components/ui/data-table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";

const NO_TEMPLATE_VALUE = "__none__";

export default function SalesGroupsPage() {
    const [groups, setGroups] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedGroup, setSelectedGroup] = useState<any>(null);
    const [templates, setTemplates] = useState<any[]>([]);
    const [manageMembersOpen, setManageMembersOpen] = useState(false);

    const fetchGroups = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/sales-groups");
            setGroups(data);
            if (selectedGroup?.id) {
                const refreshed = (Array.isArray(data) ? data : []).find((group: any) => group.id === selectedGroup.id);
                if (refreshed) {
                    setSelectedGroup(refreshed);
                }
            }
        } catch (error) {
            toast.error("Failed to load sales groups");
        } finally {
            setLoading(false);
        }
    }, [selectedGroup?.id]);

    useEffect(() => {
        fetchGroups();
        apiFetch("/permission-templates").then((data) => setTemplates(Array.isArray(data) ? data : [])).catch(() => setTemplates([]));
    }, [fetchGroups]);

    const updateGroupTemplate = async (group: any, permissionTemplateId: string) => {
        try {
            await apiFetch(`/sales-groups/${group.id}`, {
                method: "PATCH",
                body: JSON.stringify({ permissionTemplateId: permissionTemplateId || null }),
            });
            toast.success("Permission template updated");
            fetchGroups();
        } catch (error: any) {
            toast.error(error.message || "Failed to update permission template");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure? This will remove all members from the group.")) return;
        try {
            await apiFetch(`/sales-groups/${id}`, { method: "DELETE" });
            toast.success("Sales group deleted");
            fetchGroups();
        } catch (error) {
            toast.error("Failed to delete group");
        }
    };

    const handleManageMembers = (group: any) => {
        setSelectedGroup(group);
        setManageMembersOpen(true);
    };

    const columns = useMemo<ColumnDef<any, any>[]>(() => [
        {
            accessorKey: 'name',
            header: 'Group Name',
            size: 280,
            cell: ({ row }) => (
                <div className="flex flex-col gap-0.5 py-1">
                    <span className="text-sm font-bold">{row.original.name}</span>
                    {row.original.description && (
                        <span className="max-w-[300px] truncate text-xs text-muted-foreground">
                            {row.original.description}
                        </span>
                    )}
                </div>
            )
        },
        {
            id: 'members',
            header: 'Members',
            size: 190,
            cell: ({ row }) => {
                const members = row.original.members || [];
                const count = row.original._count?.members || 0;
                const visibleMembers = members.slice(0, 4);

                return (
                    <div className="flex items-center gap-3">
                        <div className="flex -space-x-2">
                            {visibleMembers.map((member: any) => (
                                <Tooltip key={member.id}>
                                    <TooltipTrigger asChild>
                                        <Avatar className="size-7 border-2 border-background bg-primary/20 text-xs font-bold text-primary">
                                            <AvatarFallback>{member.user.name?.charAt(0) ?? "U"}</AvatarFallback>
                                        </Avatar>
                                    </TooltipTrigger>
                                    <TooltipContent>{member.user.name}</TooltipContent>
                                </Tooltip>
                            ))}
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground">{count} total</span>
                    </div>
                )
            }
        },
        {
            accessorKey: 'permissionTemplateId',
            header: 'Permission Template',
            size: 240,
            cell: ({ row }) => (
                <div onClick={(event) => event.stopPropagation()}>
                    <Select
                        value={row.original.permissionTemplateId ?? NO_TEMPLATE_VALUE}
                        onValueChange={(value) => updateGroupTemplate(row.original, value === NO_TEMPLATE_VALUE ? "" : value)}
                    >
                        <SelectTrigger size="sm" className="w-full min-w-[210px]">
                            <SelectValue placeholder="No template" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NO_TEMPLATE_VALUE}>No template</SelectItem>
                        {templates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                </div>
            )
        },
        {
            accessorKey: 'createdAt',
            header: 'Created',
            size: 150,
            cell: ({ row }) => (
                <span className="text-sm text-muted-foreground">
                    {formatWorkspaceRelativeTime(row.original.createdAt)}
                </span>
            )
        },
        {
            id: 'actions',
            header: 'Actions',
            size: 170,
            cell: ({ row }) => (
                <div className="flex justify-end gap-1">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleManageMembers(row.original);
                        }}
                        className="border-dashed"
                    >
                        <Settings className="size-4" />
                        Members
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(row.original.id);
                        }}
                    >
                        <Trash2 className="size-4" />
                    </Button>
                </div>
            )
        }
    ], [templates, updateGroupTemplate, handleManageMembers, handleDelete]);

    return (
        <motion.div
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            className="mx-auto max-w-[1200px] px-4 py-4 md:px-6"
        >
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-xl font-semibold tracking-normal text-foreground">Sales Groups</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Organize your sales team into units for intelligent routing and reporting
                    </p>
                </div>
                <SalesGroupDialog onSuccess={fetchGroups} />
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex items-center gap-3 border-b border-border bg-primary/5 p-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Users className="size-5" />
                    </div>
                    <h2 className="text-sm font-semibold">Sales Organization</h2>
                </div>
                <DataTable
                    storageKey="sales-groups-table"
                    data={groups}
                    columns={columns}
                    loading={loading}
                    getRowId={(row) => row.id}
                    emptyState={{
                        icon: <Users className="size-10 text-muted-foreground opacity-50" />,
                        title: "No sales groups found",
                        description: "Create a group to organize users for routing and reporting.",
                    }}
                />
            </div>

            {selectedGroup && (
                <ManageMembersDialog
                    open={manageMembersOpen}
                    onOpenChange={setManageMembersOpen}
                    group={selectedGroup}
                    onSuccess={fetchGroups}
                />
            )}
        </motion.div>
    );
}
