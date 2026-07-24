"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import * as z from "zod";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";

interface Role {
    id: string;
    name: string;
    description?: string;
    permissionTemplateId?: string | null;
    permissions: {
        modules: Record<string, string>;
        recordAccess: string;
        isPartnerRole?: boolean;
    };
}

interface RoleDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    role: Role | null;
    onSuccess: () => void;
}

const NO_TEMPLATE_VALUE = "__none__";

const formSchema = z.object({
    name: z.string().min(2, "Name is required"),
    description: z.string().optional(),
    recordAccess: z.enum(["OWN", "TEAM", "ALL"]),
    leadsPermission: z.enum(["none", "read", "write", "full"]),
    opportunitiesPermission: z.enum(["none", "read", "write", "full"]),
    activitiesPermission: z.enum(["none", "read", "write", "full"]),
    adminPermission: z.enum(["none", "read", "write", "full"]),
    permissionTemplateId: z.string().optional(),
    isPartnerRole: z.boolean(),
});

type RoleFormValues = z.infer<typeof formSchema>;

const modules: { key: keyof RoleFormValues; label: string }[] = [
    { key: "leadsPermission", label: "Leads" },
    { key: "opportunitiesPermission", label: "Opportunities" },
    { key: "activitiesPermission", label: "Activities" },
    { key: "adminPermission", label: "Admin & Settings" },
];

const permissionLevels = [
    { value: "none", label: "None - No Access", description: "Cannot view or interact" },
    { value: "read", label: "Read - View Only", description: "Can view but not edit" },
    { value: "write", label: "Write - Create & Edit", description: "Can create and edit own records" },
    { value: "full", label: "Full - All Access", description: "Complete control including delete" },
];

const recordAccessLevels = [
    { value: "OWN", label: "Own Records Only", description: "Can only see their own data" },
    { value: "TEAM", label: "Team Records", description: "Can see team members' data" },
    { value: "ALL", label: "All Records", description: "Can see all organization data" },
];

export function RoleDialog({
    open,
    onOpenChange,
    role,
    onSuccess,
}: RoleDialogProps) {
    const [loading, setLoading] = useState(false);
    const [templates, setTemplates] = useState<any[]>([]);

    const { control, handleSubmit, reset, formState: { errors } } = useForm<RoleFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            description: "",
            recordAccess: "OWN",
            leadsPermission: "none",
            opportunitiesPermission: "none",
            activitiesPermission: "none",
            adminPermission: "none",
            permissionTemplateId: "",
            isPartnerRole: false,
        },
    });

    useEffect(() => {
        if (open) {
            apiFetch("/permission-templates").then((data) => setTemplates(Array.isArray(data) ? data : [])).catch(() => setTemplates([]));
        }
        if (role) {
            reset({
                name: role.name,
                description: role.description || "",
                recordAccess: role.permissions.recordAccess as any,
                leadsPermission: (role.permissions.modules.leads as any) || "none",
                opportunitiesPermission: (role.permissions.modules.opportunities as any) || "none",
                activitiesPermission: (role.permissions.modules.activities as any) || "none",
                adminPermission: (role.permissions.modules.admin as any) || "none",
                permissionTemplateId: role.permissionTemplateId ?? "",
                isPartnerRole: !!role.permissions.isPartnerRole,
            });
        } else {
            reset({
                name: "",
                description: "",
                recordAccess: "OWN",
                leadsPermission: "none",
                opportunitiesPermission: "none",
                activitiesPermission: "none",
                adminPermission: "none",
                permissionTemplateId: "",
                isPartnerRole: false,
            });
        }
    }, [role, open, reset]);

    const handleClose = () => {
        onOpenChange(false);
    };

    async function onSubmit(values: RoleFormValues) {
        setLoading(true);
        try {
            const payload = {
                name: values.name,
                description: values.description || undefined,
                permissionTemplateId: values.permissionTemplateId || null,
                permissions: {
                    modules: {
                        leads: values.leadsPermission,
                        opportunities: values.opportunitiesPermission,
                        activities: values.activitiesPermission,
                        admin: values.adminPermission,
                    },
                    recordAccess: values.recordAccess,
                    isPartnerRole: values.isPartnerRole,
                },
            };

            if (role) {
                await apiFetch(`/roles/${role.id}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                toast.success("Role updated");
            } else {
                await apiFetch("/roles", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast.success("Role created");
            }

            onSuccess();
        } catch (error: any) {
            toast.error(error.message || "Failed to save role");
        } finally {
            setLoading(false);
        }
    }

    return (
        <StandardDialog
            open={open}
            onClose={handleClose}
            title={role ? "Edit Role" : "Create Role"}
            subtitle="Define role permissions for module access and data visibility"
            icon={<ShieldCheck className="h-5 w-5" />}
            maxWidth="md"
            actions={
                <>
                    <Button variant="outline" onClick={handleClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button type="submit" form="role-form" disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {loading ? "Saving..." : role ? "Update Role" : "Create Role"}
                    </Button>
                </>
            }
        >
            <form id="role-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Controller
                    name="name"
                    control={control}
                    render={({ field }) => (
                        <div className="space-y-2">
                            <Label htmlFor="role-name">Role Name</Label>
                            <Input id="role-name" placeholder="Sales Manager" {...field} />
                            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                        </div>
                    )}
                />

                <Controller
                    name="description"
                    control={control}
                    render={({ field }) => (
                        <div className="space-y-2">
                            <Label htmlFor="role-description">Description (Optional)</Label>
                            <Textarea
                                id="role-description"
                                rows={2}
                                placeholder="Brief description of this role..."
                                {...field}
                            />
                        </div>
                    )}
                />

                <Controller
                    name="permissionTemplateId"
                    control={control}
                    render={({ field }) => (
                        <div className="space-y-2">
                            <Label>Permission Template</Label>
                            <Select
                                value={field.value || NO_TEMPLATE_VALUE}
                                onValueChange={(value) => field.onChange(value === NO_TEMPLATE_VALUE ? "" : value)}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_TEMPLATE_VALUE}>No template</SelectItem>
                                    {templates.map((template) => (
                                        <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                />

                <div className="border-t border-border" />

                <Controller
                    name="isPartnerRole"
                    control={control}
                    render={({ field }) => (
                        <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                            <div className="space-y-1">
                                <Label htmlFor="role-partner-role">External partner role</Label>
                                <p className="text-xs text-muted-foreground">
                                    Users with this role are treated as channel partners, blocked from admin screens, and owner-scoped to their own CRM records.
                                </p>
                            </div>
                            <Switch
                                id="role-partner-role"
                                checked={field.value}
                                onCheckedChange={field.onChange}
                            />
                        </div>
                    )}
                />

                <div>
                    <h3 className="text-sm font-semibold">Module Permissions</h3>
                    <p className="mb-3 text-sm text-muted-foreground">Set access levels for each module</p>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {modules.map((module) => (
                            <Controller
                                key={module.key}
                                name={module.key}
                                control={control}
                                render={({ field }) => (
                                    <div className="space-y-2">
                                        <Label>{module.label}</Label>
                                        <Select value={field.value as string} onValueChange={field.onChange}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {permissionLevels.map((level) => (
                                                    <SelectItem key={level.value} value={level.value}>
                                                        <div className="flex flex-col">
                                                            <span>{level.label}</span>
                                                            <span className="text-xs text-muted-foreground">{level.description}</span>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                            />
                        ))}
                    </div>
                </div>

                <Controller
                    name="recordAccess"
                    control={control}
                    render={({ field }) => (
                        <div className="space-y-2">
                            <Label>Record Access Scope</Label>
                            <Select value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {recordAccessLevels.map((level) => (
                                        <SelectItem key={level.value} value={level.value}>
                                            <div className="flex flex-col">
                                                <span>{level.label}</span>
                                                <span className="text-xs text-muted-foreground">{level.description}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">Controls which records users with this role can access</p>
                        </div>
                    )}
                />
            </form>
        </StandardDialog>
    );
}
