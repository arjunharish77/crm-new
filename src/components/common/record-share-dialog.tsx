"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface RecordShareDialogProps {
    open: boolean;
    onClose: () => void;
    recordType: "leads" | "opportunities";
    recordId: string;
    recordLabel?: string;
}

// Explicit per-record sharing on top of the normal ownerId + recordAccess model -- grants a
// specific user or team access to this one record without changing who owns it or opening up
// every OWN-scoped user's whole record access level. Deliberately modeled on Saved View
// sharing's target-menu UI (save-view-dialog.tsx) rather than inventing a new interaction
// pattern, scoped to Users + Teams only (no sales groups/roles at the record level).
export function RecordShareDialog({ open, onClose, recordType, recordId, recordLabel }: RecordShareDialogProps) {
    const [users, setUsers] = useState<Array<{ id: string; name?: string; email?: string }>>([]);
    const [teams, setTeams] = useState<Array<{ id: string; name?: string }>>([]);
    const [sharedUserIds, setSharedUserIds] = useState<string[]>([]);
    const [sharedTeamIds, setSharedTeamIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        Promise.all([
            apiFetch<any[]>("/users").catch(() => []),
            apiFetch<any[]>("/teams").catch(() => []),
            apiFetch<any>(`/${recordType}/${recordId}/share`).catch(() => ({ sharedUserIds: [], sharedTeamIds: [] })),
        ])
            .then(([userData, teamData, share]) => {
                setUsers(Array.isArray(userData) ? userData : []);
                setTeams(Array.isArray(teamData) ? teamData : []);
                setSharedUserIds(Array.isArray(share?.sharedUserIds) ? share.sharedUserIds : []);
                setSharedTeamIds(Array.isArray(share?.sharedTeamIds) ? share.sharedTeamIds : []);
            })
            .finally(() => setLoading(false));
    }, [open, recordType, recordId]);

    const toggle = (values: string[], id: string, checked: boolean) =>
        checked ? [...new Set([...values, id])] : values.filter((value) => value !== id);

    const save = async () => {
        setSaving(true);
        try {
            await apiFetch(`/${recordType}/${recordId}/share`, {
                method: "PUT",
                body: JSON.stringify({ sharedUserIds, sharedTeamIds }),
            });
            toast.success("Sharing updated");
            onClose();
        } catch (error: any) {
            toast.error(error?.message || "Failed to update sharing");
        } finally {
            setSaving(false);
        }
    };

    return (
        <StandardDialog
            open={open}
            onClose={onClose}
            title="Share record"
            subtitle={recordLabel}
            icon={<Users className="size-4" />}
            maxWidth="xs"
            actions={
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={loading || saving} onClick={save}>{saving ? "Saving..." : "Save"}</Button>
                </>
            }
        >
            <div className="space-y-3 py-2">
                <p className="text-xs text-muted-foreground">
                    Grant specific users or teams access to this record, on top of the normal ownership and role-based access rules.
                </p>
                <div className="space-y-1.5">
                    <Label>Users</Label>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="w-full justify-between" disabled={loading}>
                                {sharedUserIds.length === 0 ? "Select users" : `${sharedUserIds.length} selected`}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-64 w-72 overflow-y-auto">
                            {users.length === 0 ? (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">No users available</div>
                            ) : users.map((option) => (
                                <DropdownMenuCheckboxItem
                                    key={option.id}
                                    checked={sharedUserIds.includes(option.id)}
                                    onCheckedChange={(checked) => setSharedUserIds(toggle(sharedUserIds, option.id, Boolean(checked)))}
                                >
                                    {option.name || option.email || option.id}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <div className="space-y-1.5">
                    <Label>Teams</Label>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="w-full justify-between" disabled={loading}>
                                {sharedTeamIds.length === 0 ? "Select teams" : `${sharedTeamIds.length} selected`}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-64 w-72 overflow-y-auto">
                            {teams.length === 0 ? (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">No teams available</div>
                            ) : teams.map((option) => (
                                <DropdownMenuCheckboxItem
                                    key={option.id}
                                    checked={sharedTeamIds.includes(option.id)}
                                    onCheckedChange={(checked) => setSharedTeamIds(toggle(sharedTeamIds, option.id, Boolean(checked)))}
                                >
                                    {option.name || option.id}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </StandardDialog>
    );
}
