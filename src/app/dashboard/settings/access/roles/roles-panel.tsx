"use client";

import { PanelHeader } from "@/components/layout/panel-header";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Edit, Loader2, Plus, Shield, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { fadeInUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { RoleDialog } from "./role-dialog";
import { useConfirm } from "@/components/common/dialogs-provider";

interface Role {
    id: string;
    name: string;
    description?: string;
    permissions: {
        modules: Record<string, string>;
        recordAccess: string;
    };
    _count?: {
        users: number;
    };
}

// Permission level -> badge colour.
const PERMISSION_BADGE_CLASSNAMES: Record<string, string> = {
    full: "bg-tertiary/12 text-tertiary border-tertiary/25",
    write: "bg-primary/8 text-primary border-primary/20",
    read: "bg-secondary/15 text-secondary border-secondary/30",
    none: "bg-muted text-muted-foreground border-border",
};
const DEFAULT_PERMISSION_BADGE_CLASSNAME = "bg-muted text-muted-foreground border-border";

export function RolesPanel({ embedded }: { embedded?: boolean }) {
    const confirm = useConfirm();
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

    const fetchRoles = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const data = await apiFetch("/roles");
            setRoles(data);
        } catch (error) {
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRoles();
    }, [fetchRoles]);

    const handleDelete = async (id: string) => {
        if (!(await confirm({ title: "Delete this role?", description: "People with this role will need another one.", confirmLabel: "Delete role", destructive: true }))) {
            return;
        }

        try {
            await apiFetch(`/roles/${id}`, { method: "DELETE" });
            toast.success("Role deleted");
            fetchRoles();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete role");
        }
    };

    const handleEdit = (role: Role) => {
        setEditingRole(role);
        setDialogOpen(true);
    };

    const handleCreate = () => {
        setEditingRole(null);
        setDialogOpen(true);
    };

    return (
        <motion.div
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            className="min-w-0"
        >
            <PanelHeader embedded={embedded} title="Roles" description="A role sets which modules someone can use and which records they can see." actions={
                <Button onClick={handleCreate}><Plus className="size-4" />Create role</Button>
            } />

            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
            ) : loadError ? (
                <div role="alert" className="rounded-lg border p-4 text-sm">Unable to load roles. <Button variant="outline" size="sm" onClick={fetchRoles}>Retry</Button></div>
            ) : roles.length === 0 ? (
                <div className="mt-4 rounded-3xl border border-dashed border-border p-6 text-center">
                    <Shield className="mx-auto mb-4 h-16 w-16 text-muted-foreground/30" />
                    <h2 className="text-base font-semibold text-muted-foreground">No roles found</h2>
                    <Button variant="ghost" onClick={handleCreate} className="mt-2">
                        Add your first role
                    </Button>
                </div>
            ) : (
                <div className="mt-4 grid gap-4 2xl:grid-cols-2">
                    {roles.map((role) => (
                        <Card
                            key={role.id}
                            className="min-w-0 gap-4 py-5"
                        >
                            <CardHeader className="px-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                            <Shield size={18} />
                                        </div>
                                        <div className="min-w-0 break-words">
                                            <h2 className="text-base font-semibold">{role.name}</h2>
                                            <p className="text-xs text-muted-foreground">
                                                {role._count?.users || 0} users assigned
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={() => handleEdit(role)}
                                            aria-label={`Edit ${role.name}`}
                                        >
                                            <Edit size={16} />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => handleDelete(role.id)}
                                            aria-label={`Delete ${role.name}`}
                                        >
                                            <Trash2 size={16} />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <div className="mx-5 border-t border-border/60" />
                            <CardContent className="space-y-4 px-5">
                                <p className="break-words text-sm text-muted-foreground">
                                    {role.description || "No description provided for this role."}
                                </p>

                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Module Access
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {Object.entries(role.permissions.modules).map(([module, level]) => (
                                            <Badge
                                                key={module}
                                                variant="outline"
                                                className={cn(
                                                    "max-w-full whitespace-normal break-all rounded-md text-xs",
                                                    PERMISSION_BADGE_CLASSNAMES[level] ?? DEFAULT_PERMISSION_BADGE_CLASSNAME
                                                )}
                                            >
                                                {`${module.charAt(0).toUpperCase()}${module.slice(1)}: ${level}`}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <ShieldCheck size={14} className="text-secondary" />
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            Record Data Access
                                        </p>
                                    </div>
                                    <p className="mt-1 text-sm font-bold text-secondary">
                                        {role.permissions.recordAccess.replace("_", " ")}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <RoleDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                role={editingRole}
                onSuccess={() => {
                    setDialogOpen(false);
                    fetchRoles();
                }}
            />
        </motion.div>
    );
}
