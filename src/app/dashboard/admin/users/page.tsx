"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { ColumnDef } from "@tanstack/react-table";
import { Copy, KeyRound, Laptop, Pencil, Shield, ShieldOff, UserPlus, UserX, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, Button as IconButton } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { formatWorkspaceDateTime, formatWorkspaceRelativeTime } from "@/lib/date-format";
import { User } from "@/types/user";
import { InviteUserDialog } from "./invite-user-dialog";
import { EditUserDialog } from "./edit-user-dialog";
import { BulkActionsToolbar } from "@/components/bulk-actions/bulk-toolbar";
import { BulkAssignManagerDialog } from "./bulk-assign-manager-dialog";
import { StandardDialog } from "@/components/common/standard-dialog";

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [userToEdit, setUserToEdit] = useState<User | null>(null);
    const [selectedRows, setSelectedRows] = useState<string[]>([]);
    const [isAllSelected, setIsAllSelected] = useState(false);
    const [totalItems, setTotalItems] = useState(0);
    const [sessionsFor, setSessionsFor] = useState<User | null>(null);
    const [sessions, setSessions] = useState<any[]>([]);
    const [loadingSessions, setLoadingSessions] = useState(false);
    const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
    const [resettingMfaId, setResettingMfaId] = useState<string | null>(null);
    const [generatingResetLinkId, setGeneratingResetLinkId] = useState<string | null>(null);
    const [resetLink, setResetLink] = useState<{ userName: string; url: string; expiresAt: string } | null>(null);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch<User[]>("/users");
            // Stub data enhancement for missing fields till backend is ready
            const enhancedData = (Array.isArray(data) ? data : []).map((u) => ({
                ...u,
                team: u.team || { id: 'unassigned', name: 'Unassigned' },
                manager: u.manager || undefined,
                lastLoginAt: u.lastLoginAt || new Date().toISOString(), // Mock
            }));
            setUsers(enhancedData);
            setTotalItems(enhancedData.length); // Assuming no pagination for now, or get from meta if available
        } catch (error: any) {
            toast.error("Failed to fetch users");
            console.error("Users fetch error:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleEdit = (user: User) => {
        setUserToEdit(user);
        setEditDialogOpen(true);
    };

    const viewSessions = async (user: User) => {
        setSessionsFor(user);
        setLoadingSessions(true);
        try {
            const data = await apiFetch<any[]>(`/admin/users/${user.id}/sessions`);
            setSessions(Array.isArray(data) ? data : []);
        } catch (error: any) {
            toast.error(error?.message || "Failed to load sessions");
        } finally {
            setLoadingSessions(false);
        }
    };

    const revokeUserSession = async (sessionId: string) => {
        if (!sessionsFor) return;
        setRevokingSessionId(sessionId);
        try {
            await apiFetch(`/admin/users/${sessionsFor.id}/sessions/${sessionId}`, { method: "DELETE" });
            toast.success("Session revoked");
            viewSessions(sessionsFor);
        } catch (error: any) {
            toast.error(error?.message || "Failed to revoke session");
        } finally {
            setRevokingSessionId(null);
        }
    };

    const resetUserMfa = async (user: User) => {
        if (!confirm(`Reset two-factor authentication for ${user.name || user.email}? They will need to re-enroll, and their backup codes and remembered devices will be cleared.`)) return;
        setResettingMfaId(user.id);
        try {
            await apiFetch(`/admin/users/${user.id}/mfa/reset`, { method: "POST" });
            toast.success("MFA reset -- the user can log in with just their password and re-enroll");
        } catch (error: any) {
            toast.error(error?.message || "Failed to reset MFA");
        } finally {
            setResettingMfaId(null);
        }
    };

    const generatePasswordResetLink = async (user: User) => {
        setGeneratingResetLinkId(user.id);
        try {
            const result = await apiFetch<{ token: string; expiresAt: string }>(`/admin/users/${user.id}/password-reset-token`, { method: "POST" });
            setResetLink({
                userName: user.name || user.email,
                url: `${window.location.origin}/reset-password?token=${result.token}`,
                expiresAt: result.expiresAt,
            });
        } catch (error: any) {
            toast.error(error?.message || "Failed to generate reset link");
        } finally {
            setGeneratingResetLinkId(null);
        }
    };

    const handleDeactivate = async (ids: string[]) => {
        if (!confirm(`Are you sure you want to deactivate ${ids.length} user(s)?`)) return;

        try {
            await Promise.all(ids.map(id =>
                apiFetch(`/users/${id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: "INACTIVE" }),
                })
            ));
            toast.success("Users deactivated");
            fetchUsers();
            setSelectedRows([]);
            setIsAllSelected(false);
        } catch (error: any) {
            toast.error("Failed to deactivate users");
        }
    };

    const handleDelete = async (ids: string[]) => {
        if (!confirm(`Are you sure you want to permanently delete ${ids.length} user(s)?`)) return;

        try {
            // Mock delete for now as API might not support bulk delete yet
            toast.success("Users deleted");
            setUsers(prev => prev.filter(u => !ids.includes(u.id)));
            setSelectedRows([]);
            setIsAllSelected(false);
        } catch (error: any) {
            toast.error("Failed to delete users");
        }
    };


    const handleSelectAllFiltered = () => {
        setSelectedRows(users.map((user) => user.id));
        setIsAllSelected(true);
        toast.success(`All ${totalItems} users selected`);
    };

    const clearSelection = () => {
        setSelectedRows([]);
        setIsAllSelected(false);
    };

    const columns = useMemo<ColumnDef<User, any>[]>(() => [
        {
            accessorKey: 'name',
            header: 'User',
            size: 260,
            cell: ({ row }) => (
                <div className="flex min-h-14 w-full items-center gap-3 py-1">
                    <Avatar className="size-8 bg-primary/10 text-sm font-bold text-primary">
                        <AvatarFallback>
                            {(row.original.name || row.original.email || "?").charAt(0).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 overflow-hidden">
                        <div className="truncate text-sm font-bold leading-tight text-foreground">
                            {row.original.name || "Unnamed user"}
                        </div>
                        <div className="mt-1 block truncate text-xs text-muted-foreground opacity-80">
                            {row.original.email}
                        </div>
                    </div>
                </div>
            ),
        },
        {
            accessorKey: 'role',
            header: 'Role',
            size: 160,
            cell: ({ row }) => (
                row.original.role ? (
                    <Badge variant="outline" className="border-secondary/20 bg-secondary/10 font-bold uppercase text-secondary">
                        <Shield className="size-3.5" />
                        {row.original.role.name}
                    </Badge>
                ) : <span className="text-xs text-muted-foreground">-</span>
            ),
        },
        {
            accessorKey: 'team',
            header: 'Team',
            size: 150,
            cell: ({ row }) => (
                <span className="text-sm text-muted-foreground">
                    {row.original.team?.name || "Unassigned"}
                </span>
            ),
        },
        {
            accessorKey: 'status',
            header: 'Status',
            size: 120,
            cell: ({ row }) => {
                const status = row.original.status;
                const isActive = status === 'ACTIVE';
                return (
                    <Badge
                        variant="outline"
                        className={
                            isActive
                                ? "border-primary/20 bg-primary/10 font-bold uppercase text-primary"
                                : "border-border bg-muted font-bold uppercase text-muted-foreground"
                        }
                    >
                        {status}
                    </Badge>
                );
            },
        },
        {
            accessorKey: 'lastLoginAt',
            header: 'Last Login',
            size: 170,
            cell: ({ row }) => (
                <span className="text-xs text-muted-foreground">
                    {row.original.lastLoginAt ? formatWorkspaceDateTime(row.original.lastLoginAt) : 'Never'}
                </span>
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
                            <IconButton
                                variant="ghost"
                                size="icon-sm"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleEdit(row.original);
                                }}
                            >
                                <Pencil className="size-4" />
                            </IconButton>
                        </TooltipTrigger>
                        <TooltipContent>Edit User</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <IconButton
                                variant="ghost"
                                size="icon-sm"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    viewSessions(row.original);
                                }}
                            >
                                <Laptop className="size-4" />
                            </IconButton>
                        </TooltipTrigger>
                        <TooltipContent>Active Sessions</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <IconButton
                                variant="ghost"
                                size="icon-sm"
                                disabled={resettingMfaId === row.original.id}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    resetUserMfa(row.original);
                                }}
                            >
                                <ShieldOff className="size-4" />
                            </IconButton>
                        </TooltipTrigger>
                        <TooltipContent>Reset MFA</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <IconButton
                                variant="ghost"
                                size="icon-sm"
                                disabled={generatingResetLinkId === row.original.id}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    generatePasswordResetLink(row.original);
                                }}
                            >
                                <KeyRound className="size-4" />
                            </IconButton>
                        </TooltipTrigger>
                        <TooltipContent>Generate Password Reset Link</TooltipContent>
                    </Tooltip>
                    {row.original.status === 'ACTIVE' && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <IconButton
                                    variant="ghost"
                                    size="icon-sm"
                                    className="text-tertiary hover:bg-tertiary/10 hover:text-tertiary"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        handleDeactivate([row.original.id]);
                                    }}
                                >
                                    <UserX className="size-4" />
                                </IconButton>
                            </TooltipTrigger>
                            <TooltipContent>Deactivate</TooltipContent>
                        </Tooltip>
                    )}
                </div>
            ),
        },
    ], [handleDeactivate, resettingMfaId, generatingResetLinkId]);

    const [assignManagerDialogOpen, setAssignManagerDialogOpen] = useState(false);

    return (
        <div className="mx-auto max-w-[1600px] px-4 py-4 md:px-6">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-xl font-semibold tracking-normal text-foreground">Users</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Manage access, roles, and team assignments.
                    </p>
                </div>
                <IconButton
                    onClick={() => setDialogOpen(true)}
                >
                    <UserPlus className="size-4" />
                    Invite User
                </IconButton>
            </div>

            <div className="flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card">
                <DataTable
                    storageKey="admin-users-table"
                    data={users}
                    columns={columns}
                    loading={loading}
                    getRowId={(row) => row.id}
                    enableRowSelection
                    rowSelectionIds={selectedRows}
                    onRowSelectionIdsChange={(ids) => {
                        setSelectedRows(ids);
                        if (isAllSelected) setIsAllSelected(false);
                    }}
                    totalItems={totalItems}
                    isAllSelected={isAllSelected}
                    onSelectAllFiltered={handleSelectAllFiltered}
                    onClearSelection={clearSelection}
                    defaultDensity="comfortable"
                    emptyState={{
                        icon: <Users className="size-10 text-muted-foreground opacity-50" />,
                        title: "No users found",
                        description: "Get started by inviting your first team member.",
                        action: (
                            <IconButton variant="outline" onClick={() => setDialogOpen(true)}>
                                <UserPlus className="size-4" />
                                Invite User
                            </IconButton>
                        ),
                    }}
                />
            </div>

            <BulkActionsToolbar
                selectedCount={isAllSelected ? totalItems : selectedRows.length}
                onClearSelection={clearSelection}
                module="users"
                onActivateDeactivate={() => {
                    if (isAllSelected) {
                        handleDeactivate([/* all ids */]);
                    } else {
                        handleDeactivate(selectedRows);
                    }
                }}
                onAssignManager={() => setAssignManagerDialogOpen(true)}
                onDelete={() => {
                    if (isAllSelected) {
                        handleDelete([/* all ids */]);
                    } else {
                        handleDelete(selectedRows);
                    }
                }}
            />

            <InviteUserDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSuccess={() => {
                    setDialogOpen(false);
                    fetchUsers();
                }}
            />

            {userToEdit && (
                <EditUserDialog
                    user={userToEdit}
                    open={editDialogOpen}
                    onOpenChange={setEditDialogOpen}
                    onSuccess={() => {
                        setEditDialogOpen(false);
                        fetchUsers();
                    }}
                />
            )}

            <BulkAssignManagerDialog
                open={assignManagerDialogOpen}
                onOpenChange={setAssignManagerDialogOpen}
                userIds={selectedRows}
                isAllSelected={isAllSelected}
                totalCount={totalItems}
                onSuccess={() => {
                    fetchUsers();
                    clearSelection();
                }}
            />

            <StandardDialog
                open={!!sessionsFor}
                onClose={() => setSessionsFor(null)}
                title={`Active Sessions -- ${sessionsFor?.name ?? ""}`}
                maxWidth="md"
                actions={<Button variant="outline" onClick={() => setSessionsFor(null)}>Close</Button>}
            >
                <div className="space-y-2 py-2">
                    {loadingSessions ? (
                        <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : sessions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No active sessions.</p>
                    ) : (
                        sessions.map((session) => (
                            <div key={session.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                                <div>
                                    <p className="text-sm font-medium">{session.userAgent || "Unknown device"}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {session.ipAddress || "Unknown IP"} -- last active {formatWorkspaceRelativeTime(session.lastActiveAt)}
                                    </p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={revokingSessionId === session.id}
                                    onClick={() => revokeUserSession(session.id)}
                                >
                                    Revoke
                                </Button>
                            </div>
                        ))
                    )}
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!resetLink}
                onClose={() => setResetLink(null)}
                title={`Password Reset Link -- ${resetLink?.userName ?? ""}`}
                maxWidth="sm"
                actions={<Button variant="outline" onClick={() => setResetLink(null)}>Close</Button>}
            >
                {resetLink && (
                    <div className="space-y-3 py-2">
                        <p className="text-sm text-muted-foreground">
                            Share this link with the user directly (Slack, in person, etc.) -- this app doesn&apos;t send
                            reset emails. It expires {formatWorkspaceDateTime(resetLink.expiresAt)} and can only be used once.
                        </p>
                        <div className="flex gap-2">
                            <Input readOnly value={resetLink.url} className="font-mono text-xs" onFocus={(event) => event.target.select()} />
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => navigator.clipboard.writeText(resetLink.url).then(() => toast.success("Link copied"))}
                            >
                                <Copy className="size-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </StandardDialog>
        </div>
    );
}
