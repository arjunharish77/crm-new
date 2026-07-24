"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";

interface ManageMembersDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    group: any;
    onSuccess: () => void;
}

export function ManageMembersDialog({ open, onOpenChange, group, onSuccess }: ManageMembersDialogProps) {
    const [users, setUsers] = useState<any[]>([]); // All users in tenant
    const [selectedUser, setSelectedUser] = useState("");
    const [selectedRole, setSelectedRole] = useState("MEMBER");
    const [adding, setAdding] = useState(false);

    // Fetch all tenant users to populate dropdown
    useEffect(() => {
        if (open) {
            apiFetch("/users").then(setUsers).catch(() => toast.error("Failed to load users"));
        }
    }, [open]);

    const handleAddMember = async () => {
        if (!selectedUser) return;
        setAdding(true);
        try {
            await apiFetch(`/sales-groups/${group.id}/members`, {
                method: "POST",
                body: JSON.stringify({ userId: selectedUser, role: selectedRole }),
            });
            toast.success("Member added");
            onSuccess(); // Refresh parent to get updated group
            setSelectedUser("");
        } catch (error) {
            toast.error("Failed to add member");
        } finally {
            setAdding(false);
        }
    };

    const handleRemoveMember = async (userId: string) => {
        try {
            await apiFetch(`/sales-groups/${group.id}/members/${userId}`, {
                method: "DELETE",
            });
            toast.success("Member removed");
            onSuccess();
        } catch (error) {
            toast.error("Failed to remove member");
        }
    };

    const handleClose = () => {
        onOpenChange(false);
    };

    // Filter out users who are already members
    const availableUsers = users.filter(
        (u) => !group.members?.some((m: any) => m.user.id === u.id)
    );

    return (
        <StandardDialog
            open={open}
            onClose={handleClose}
            title={`Manage Members: ${group.name}`}
            subtitle="Add or remove users from this sales group."
            maxWidth="sm"
            actions={
                <Button variant="outline" onClick={handleClose}>
                    Close
                </Button>
            }
        >
            <div className="space-y-4">
                <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                        <Select value={selectedUser} onValueChange={setSelectedUser}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Add user" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableUsers.map((u) => (
                                    <SelectItem key={u.id} value={u.id}>
                                        {u.name} ({u.email})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Select value={selectedRole} onValueChange={setSelectedRole}>
                        <SelectTrigger className="w-[120px] shrink-0">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="MEMBER">Member</SelectItem>
                            <SelectItem value="MANAGER">Manager</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        size="icon"
                        onClick={handleAddMember}
                        disabled={!selectedUser || adding}
                        aria-label="Add member"
                    >
                        {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                    </Button>
                </div>

                <div className="max-h-[300px] overflow-y-auto rounded-lg border border-border">
                    {group.members?.length === 0 && (
                        <p className="py-6 text-center text-sm text-muted-foreground">No members yet.</p>
                    )}
                    {group.members?.map((member: any) => (
                        <div
                            key={member.id}
                            className="flex items-center justify-between gap-3 border-b border-border p-3 last:border-b-0"
                        >
                            <div className="flex items-center gap-3">
                                <Avatar className="size-8 text-sm">
                                    <AvatarFallback>{member.user.name?.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="text-sm font-medium">{member.user.name}</p>
                                    <p className="text-xs text-muted-foreground">{member.user.email}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="h-5 rounded text-[10px]">
                                    {member.role}
                                </Badge>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => handleRemoveMember(member.user.id)}
                                    aria-label={`Remove ${member.user.name}`}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </StandardDialog>
    );
}
