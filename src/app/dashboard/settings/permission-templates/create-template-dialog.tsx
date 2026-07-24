"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { StandardDialog } from "@/components/common/standard-dialog";

interface CreatePermissionTemplateDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

const formSchema = z.object({
    name: z.string().min(2, "Template name is required"),
    description: z.string().optional(),
    permissions: z.array(z.string()).min(1, "At least one permission must be selected"),
});

const AVAILABLE_PERMISSIONS = [
    {
        category: "Leads", permissions: [
            { id: "leads.view", label: "View Leads" },
            { id: "leads.create", label: "Create Leads" },
            { id: "leads.edit", label: "Edit Leads" },
            { id: "leads.delete", label: "Delete Leads" },
        ]
    },
    {
        category: "Opportunities", permissions: [
            { id: "opportunities.view", label: "View Opportunities" },
            { id: "opportunities.create", label: "Create Opportunities" },
            { id: "opportunities.edit", label: "Edit Opportunities" },
        ]
    },
    {
        category: "Users", permissions: [
            { id: "users.view", label: "View Users" },
            { id: "users.manage", label: "Manage Users" },
        ]
    },
];

export function CreatePermissionTemplateDialog({
    open,
    onOpenChange,
    onSuccess,
}: CreatePermissionTemplateDialogProps) {
    const [loading, setLoading] = useState(false);

    const { control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            description: "",
            permissions: [] as string[],
        },
    });

    const selectedPermissions = watch("permissions");

    const handleClose = () => {
        onOpenChange(false);
        reset();
    };

    const handlePermissionToggle = (permissionId: string) => {
        const current = selectedPermissions;
        if (current.includes(permissionId)) {
            setValue("permissions", current.filter(id => id !== permissionId));
        } else {
            setValue("permissions", [...current, permissionId]);
        }
    };

    async function onSubmit(values: any) {
        setLoading(true);
        try {
            // Mock API call
            await new Promise(resolve => setTimeout(resolve, 1000));

            toast.success("Permission template created");
            handleClose();
            onSuccess();
        } catch (error: any) {
            toast.error(error.message || "Failed to create template");
        } finally {
            setLoading(false);
        }
    }

    return (
        <StandardDialog
            open={open}
            onClose={handleClose}
            title="Create Permission Template"
            subtitle="Define a set of permissions that can be assigned to roles."
            icon={<ShieldCheck className="size-4" />}
            maxWidth="md"
            actions={
                <>
                    <Button variant="ghost" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form="create-template-form"
                        disabled={loading}
                    >
                        {loading ? "Creating..." : "Create Template"}
                    </Button>
                </>
            }
        >
            <form id="create-template-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 pb-1">
                <Controller
                    name="name"
                    control={control}
                    render={({ field }) => (
                        <div className="space-y-1.5">
                            <Label htmlFor="template-name">Template Name</Label>
                            <Input
                                id="template-name"
                                {...field}
                                placeholder="e.g. Sales Manager Standard"
                                autoFocus
                                aria-invalid={!!errors.name}
                            />
                            {errors.name && (
                                <p className="text-xs text-destructive">{errors.name.message as string}</p>
                            )}
                        </div>
                    )}
                />

                <Controller
                    name="description"
                    control={control}
                    render={({ field }) => (
                        <div className="space-y-1.5">
                            <Label htmlFor="template-description">Description</Label>
                            <Textarea
                                id="template-description"
                                {...field}
                                placeholder="Describe who this template is for"
                                rows={2}
                                aria-invalid={!!errors.description}
                            />
                            {errors.description && (
                                <p className="text-xs text-destructive">{errors.description.message as string}</p>
                            )}
                        </div>
                    )}
                />

                <div>
                    <p className="mb-1.5 text-sm font-medium">
                        Permissions
                    </p>
                    {errors.permissions && (
                        <p className="mb-1.5 text-xs text-destructive">
                            {errors.permissions.message as string}
                        </p>
                    )}
                    <div className="max-h-[300px] divide-y overflow-auto rounded-lg border">
                        {AVAILABLE_PERMISSIONS.map((group) => (
                            <div key={group.category} className="p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {group.category}
                                </p>
                                <div className="mt-1.5 flex flex-col gap-1.5">
                                    {group.permissions.map((perm) => (
                                        <label key={perm.id} className="flex items-center gap-2 text-sm">
                                            <Checkbox
                                                checked={selectedPermissions.includes(perm.id)}
                                                onCheckedChange={() => handlePermissionToggle(perm.id)}
                                            />
                                            {perm.label}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </form>
        </StandardDialog>
    );
}
