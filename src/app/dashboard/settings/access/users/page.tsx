"use client";

import { PageHeader } from "@/components/layout/page-header";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { ColumnDef } from "@tanstack/react-table";
import { Copy, MoreHorizontal, KeyRound, Laptop, Pencil, Shield, ShieldOff, UserPlus, UserX, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, Button as IconButton } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { formatWorkspaceDateTime, formatWorkspaceRelativeTime } from "@/lib/date-format";
import { User } from "@/types/user";
import { InviteUserDialog } from "./invite-user-dialog";
import { EditUserDialog } from "./edit-user-dialog";
import { BulkActionsToolbar } from "@/components/bulk-actions/bulk-toolbar";
import { BulkAssignManagerDialog } from "./bulk-assign-manager-dialog";
import { StandardDialog } from "@/components/common/standard-dialog";
import { useConfirm } from "@/components/common/dialogs-provider";

export default function UsersPage() {
    const confirm = useConfirm();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [sessionsError, setSessionsError] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [userToEdit, setUserToEdit] = useState<User | null>(null);
    const [selectedRows, setSelectedRows] = useState<string[]>([]);
    const [isAllSelected, setIsAllSelected] = useState(false);
    const [deactivating, setDeactivating] = useState(false);
    const deactivationPending = useRef(false);
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
        setLoadError(false);
        try {
            const data = await apiFetch<User[]>("/users");
            // Stub data enhancement for missing fields till backend is ready
            const enhancedData = (Array.isArray(data) ? data : []).map((u) => ({
                ...u,
                team: u.team || { id: 'unassigned', name: 'Unassigned' },
                manager: u.manager || undefined,
                lastLoginAt: u.lastLoginAt,
            }));
            setUsers(enhancedData);
            setTotalItems(enhancedData.length); // Assuming no pagination for now, or get from meta if available
        } catch (error: any) {
            setLoadError(true);
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
        setSessions([]);
        setSessionsError(false);
        try {
            const data = await apiFetch<any[]>(`/admin/users/${user.id}/sessions`);
            setSessions(Array.isArray(data) ? data : []);
        } catch (error: any) {
            setSessionsError(true);
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
        if (!(await confirm({ title: `Reset two-factor for ${user.name || user.email}?`, description: "They'll need to set it up again. Their backup codes and remembered devices are cleared.", confirmLabel: "Reset two-factor", destructive: true }))) return;
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
        const targets = [...new Set(ids)];
        if (!targets.length || deactivationPending.current) return;
        if (!(await confirm({ title: `Deactivate ${targets.length} user${targets.length === 1 ? "" : "s"}?`, description: "They can't sign in until they're reactivated.", confirmLabel: "Deactivate", destructive: true }))) return;

        deactivationPending.current = true;
        setDeactivating(true);
        try {
            const results = await Promise.allSettled(targets.map(id =>
                apiFetch(`/users/${id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: "INACTIVE" }),
                })
            ));
            const failedIds = targets.filter((_, index) => results[index].status === "rejected");
            const completed = targets.length - failedIds.length;
            await fetchUsers();
            setSelectedRows(failedIds);
            setIsAllSelected(false);
            if (failedIds.length) {
                toast.error(`${completed} of ${targets.length} users deactivated. ${failedIds.length} failed and remain selected for retry.`);
            } else {
                toast.success(`${completed} users deactivated`);
            }
        } finally {
            deactivationPending.current = false;
            setDeactivating(false);
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
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(row.original)}><Pencil className="size-4" />Edit</Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${row.original.name || row.original.email}`}><MoreHorizontal className="size-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => viewSessions(row.original)}><Laptop className="size-4" />View active sessions</DropdownMenuItem>
                            <DropdownMenuItem disabled={generatingResetLinkId === row.original.id} onSelect={() => generatePasswordResetLink(row.original)}><KeyRound className="size-4" />Generate password reset link</DropdownMenuItem>
                            <DropdownMenuItem disabled={resettingMfaId === row.original.id} onSelect={() => resetUserMfa(row.original)}><ShieldOff className="size-4" />Reset MFA</DropdownMenuItem>
                            {row.original.status === 'ACTIVE' && <DropdownMenuItem disabled={deactivating} onSelect={() => handleDeactivate([row.original.id])}><UserX className="size-4" />Deactivate user</DropdownMenuItem>}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            ),
        },
    ], [handleDeactivate, resettingMfaId, generatingResetLinkId, deactivating]);

    const [assignManagerDialogOpen, setAssignManagerDialogOpen] = useState(false);

    return (
        <div className="min-w-0">
            <PageHeader title="Users" description="Manage access, roles, and team assignments." actions={
                <Button onClick={() => setDialogOpen(true)}><UserPlus className="size-4" />Invite User</Button>
            } />
            {loadError && <div role="alert" className="mb-4 rounded-lg border p-4 text-sm">Unable to load users. <Button variant="outline" size="sm" onClick={fetchUsers}>Retry</Button></div>}

            <div hidden={loadError} className="flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
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
                disabled={deactivating}
                activateDeactivateLabel={deactivating ? "Deactivating…" : "Deactivate"}
                onActivateDeactivate={() => handleDeactivate(selectedRows)}
                onAssignManager={() => setAssignManagerDialogOpen(true)}
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
                    ) : sessionsError ? (
                        <div role="alert" className="text-sm">Unable to load sessions. <Button variant="outline" size="sm" onClick={() => sessionsFor && viewSessions(sessionsFor)}>Retry</Button></div>
                    ) : sessions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No active sessions.</p>
                    ) : (
                        sessions.map((session) => (
                            <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                                <div className="min-w-0 flex-1 basis-48 break-words">
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
                            <Input aria-label="Password reset link" readOnly value={resetLink.url} className="font-mono text-xs" onFocus={(event) => event.target.select()} />
                            <Button
                                variant="outline"
                                size="icon"
                                aria-label="Copy password reset link"
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
