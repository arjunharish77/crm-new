"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { PERMISSION_MODULES } from "@/lib/module-access";
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
    // One level per module in lib/module-access.ts; "unset" means the role doesn't limit it.
    modules: z.record(z.string(), z.enum(["unset", "none", "read", "write", "full"])),
    permissionTemplateId: z.string().optional(),
    isPartnerRole: z.boolean(),
});

type RoleFormValues = z.infer<typeof formSchema>;

// Every module the server enforces (decided 2026-10-03). New roles start with no access to the
// core sales modules, as before; the rest aren't limited until set.
const NEW_ROLE_NONE = ["leads", "opportunities", "activities", "admin", "integrations"];
type ModuleChoice = "unset" | "none" | "read" | "write" | "full";

function moduleChoicesFrom(saved: Record<string, string> | undefined, isNew: boolean): Record<string, ModuleChoice> {
    return Object.fromEntries(PERMISSION_MODULES.map((module) => {
        const value = saved?.[module.key];
        const choice = value === "none" || value === "read" || value === "write" || value === "full" ? value : isNew && NEW_ROLE_NONE.includes(module.key) ? "none" : "unset";
        return [module.key, choice];
    }));
}

const permissionLevels: { value: ModuleChoice; label: string; description: string }[] = [
    { value: "unset", label: "Not limited", description: "Not set for this role, so it isn't limited" },
    { value: "none", label: "No access", description: "Hidden, and its data can't be read or changed" },
    { value: "read", label: "View only", description: "Can see but not change" },
    { value: "write", label: "Create and edit", description: "Can add and change, not delete" },
    { value: "full", label: "Full", description: "Everything, including delete" },
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
            modules: moduleChoicesFrom(undefined, true),
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
                modules: moduleChoicesFrom(role.permissions.modules, false),
                permissionTemplateId: role.permissionTemplateId ?? "",
                isPartnerRole: !!role.permissions.isPartnerRole,
            });
        } else {
            reset({
                name: "",
                description: "",
                recordAccess: "OWN",
                modules: moduleChoicesFrom(undefined, true),
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
                // Keep everything this dialog doesn't edit (field permissions, modules it doesn't
                // list); saving used to replace the whole permissions object.
                permissions: {
                    ...(role?.permissions ?? {}),
                    modules: {
                        ...Object.fromEntries(Object.entries(role?.permissions?.modules ?? {}).filter(([key]) => !PERMISSION_MODULES.some((module) => module.key === key))),
                        ...Object.fromEntries(Object.entries(values.modules).filter(([, level]) => level !== "unset")),
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
                            <Label htmlFor="role-template">Permission Template</Label>
                            <Select
                                value={field.value || NO_TEMPLATE_VALUE}
                                onValueChange={(value) => field.onChange(value === NO_TEMPLATE_VALUE ? "" : value)}
                            >
                                <SelectTrigger id="role-template" className="w-full min-w-0">
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

                    <div className="grid gap-4">
                        {PERMISSION_MODULES.map((module) => (
                            <Controller
                                key={module.key}
                                name={`modules.${module.key}`}
                                control={control}
                                render={({ field }) => (
                                    <div className="space-y-2">
                                        <Label htmlFor={`role-${module.key}`}>{module.label}</Label>
                                        <p className="text-xs text-muted-foreground">{module.description}</p>
                                        <Select value={field.value as string} onValueChange={field.onChange}>
                                            <SelectTrigger id={`role-${module.key}`} className="w-full min-w-0">
                                                <SelectValue>{permissionLevels.find((level) => level.value === field.value)?.label}</SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                                {permissionLevels.map((level) => (
                                                    <SelectItem key={level.value} value={level.value}>
                                                        <div className="flex min-w-0 flex-col whitespace-normal break-words">
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
                            <Label htmlFor="role-record-access">Record Access Scope</Label>
                            <Select value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger id="role-record-access" className="w-full min-w-0">
                                    <SelectValue>{recordAccessLevels.find((level) => level.value === field.value)?.label}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {recordAccessLevels.map((level) => (
                                        <SelectItem key={level.value} value={level.value}>
                                            <div className="flex min-w-0 flex-col whitespace-normal break-words">
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
