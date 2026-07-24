"use client";

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

// Same permission-level -> color mapping the MUI version used (success/primary/info/disabled),
// ported to Tailwind classes keyed off the M3 tokens this app actually defines.
const PERMISSION_BADGE_CLASSNAMES: Record<string, string> = {
    full: "bg-tertiary/12 text-tertiary border-tertiary/25",
    write: "bg-primary/8 text-primary border-primary/20",
    read: "bg-secondary/15 text-secondary border-secondary/30",
    none: "bg-muted text-muted-foreground border-border",
};
const DEFAULT_PERMISSION_BADGE_CLASSNAME = "bg-muted text-muted-foreground border-border";

export default function RolesPage() {
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

    const fetchRoles = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/roles");
            setRoles(data);
        } catch (error) {
            toast.error("Failed to fetch roles");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRoles();
    }, [fetchRoles]);

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this role? Users with this role will need to be reassigned.")) {
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
            className="mx-auto max-w-[1400px] px-4 py-4 md:px-6"
        >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-xl font-semibold tracking-normal text-foreground">Roles & Permissions</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Define and manage access policies for team members and modules
                    </p>
                </div>
                <Button onClick={handleCreate}>
                    <Plus size={18} />
                    Create Role
                </Button>
            </div>

            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
            ) : roles.length === 0 ? (
                <div className="mt-4 rounded-3xl border border-dashed border-border p-16 text-center">
                    <Shield className="mx-auto mb-4 h-16 w-16 text-muted-foreground/30" />
                    <h2 className="text-base font-semibold text-muted-foreground">No roles found</h2>
                    <Button variant="ghost" onClick={handleCreate} className="mt-2">
                        Add your first role
                    </Button>
                </div>
            ) : (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {roles.map((role) => (
                        <Card
                            key={role.id}
                            className="gap-4 rounded-3xl py-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                        >
                            <CardHeader className="px-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                            <Shield size={18} />
                                        </div>
                                        <div>
                                            <h2 className="text-base font-bold">{role.name}</h2>
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
                                <p className="text-sm text-muted-foreground">
                                    {role.description || "No description provided for this role."}
                                </p>

                                <div>
                                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                                        Module Access
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {Object.entries(role.permissions.modules).map(([module, level]) => (
                                            <Badge
                                                key={module}
                                                variant="outline"
                                                className={cn(
                                                    "rounded-md text-[10px] font-bold uppercase",
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
                                        <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
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
