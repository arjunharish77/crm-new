"use client";

import { ReactNode, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, UserPlus } from "lucide-react";
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
import { apiFetch } from "@/lib/api";
import { Role, User } from "@/types/user";

interface InviteUserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

interface PermissionTemplate {
    id: string;
    name: string;
}

interface Team {
    id: string;
    name: string;
}

const NONE_VALUE = "__none__";

const formSchema = z.object({
    name: z.string().min(2, "Name is required"),
    email: z.string().email("Valid email is required"),
    roleId: z.string().min(1, "Role is required"),
    permissionTemplateId: z.string().optional(),
    teamId: z.string().optional(),
    managerId: z.string().optional(),
    password: z.string().min(6, "Password must be at least 6 characters"),
});

type InviteUserFormValues = z.infer<typeof formSchema>;

interface FieldProps {
    label: string;
    error?: string;
    children: ReactNode;
}

function Field({ label, error, children }: FieldProps) {
    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            {children}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
    );
}

export function InviteUserDialog({
    open,
    onOpenChange,
    onSuccess,
}: InviteUserDialogProps) {
    const [loading, setLoading] = useState(false);
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissionTemplates, setPermissionTemplates] = useState<PermissionTemplate[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [managers, setManagers] = useState<User[]>([]);

    const {
        control,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<InviteUserFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            email: "",
            roleId: "",
            permissionTemplateId: "",
            teamId: "",
            managerId: "",
            password: "",
        },
    });

    useEffect(() => {
        if (open) {
            const loadData = async () => {
                try {
                    const [rolesData, usersData, teamsData, templateData] = await Promise.all([
                        apiFetch("/roles"),
                        apiFetch("/users"),
                        apiFetch("/teams"),
                        apiFetch("/permission-templates"),
                    ]);
                    setRoles(Array.isArray(rolesData) ? rolesData : []);
                    setPermissionTemplates(Array.isArray(templateData) ? templateData : []);
                    setTeams(Array.isArray(teamsData) ? teamsData : []);
                    setManagers(Array.isArray(usersData) ? usersData : []);
                } catch (error) {
                    toast.error("Failed to load form data");
                }
            };
            loadData();
        }
    }, [open]);

    const handleClose = () => {
        onOpenChange(false);
        reset();
    };

    async function onSubmit(values: InviteUserFormValues) {
        setLoading(true);
        try {
            await apiFetch("/users", {
                method: "POST",
                body: JSON.stringify({
                    ...values,
                    status: "ACTIVE",
                }),
            });

            toast.success("User invited successfully");
            handleClose();
            onSuccess();
        } catch (error: any) {
            toast.error(error.message || "Failed to invite user");
        } finally {
            setLoading(false);
        }
    }

    return (
        <StandardDialog
            open={open}
            onClose={handleClose}
            title="Invite User"
            subtitle="Add a new team member to your organization."
            icon={<UserPlus className="h-5 w-5" />}
            actions={
                <>
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button type="submit" form="invite-user-form" disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {loading ? "Inviting..." : "Invite User"}
                    </Button>
                </>
            }
        >
            <form id="invite-user-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Controller
                    name="name"
                    control={control}
                    render={({ field }) => (
                        <Field label="Full Name" error={errors.name?.message}>
                            <Input {...field} placeholder="John Doe" />
                        </Field>
                    )}
                />

                <Controller
                    name="email"
                    control={control}
                    render={({ field }) => (
                        <Field label="Email" error={errors.email?.message}>
                            <Input {...field} type="email" placeholder="john@example.com" />
                        </Field>
                    )}
                />

                <Controller
                    name="password"
                    control={control}
                    render={({ field }) => (
                        <Field label="Temporary Password" error={errors.password?.message}>
                            <Input {...field} type="password" placeholder="Min. 6 characters" />
                        </Field>
                    )}
                />

                <Controller
                    name="roleId"
                    control={control}
                    render={({ field }) => (
                        <Field label="Role" error={errors.roleId?.message}>
                            <Select value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent>
                                    {roles.map((role) => (
                                        <SelectItem key={role.id} value={role.id}>
                                            {role.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    )}
                />

                <Controller
                    name="permissionTemplateId"
                    control={control}
                    render={({ field }) => (
                        <Field label="Permission Template Override">
                            <Select
                                value={field.value || NONE_VALUE}
                                onValueChange={(value) => field.onChange(value === NONE_VALUE ? "" : value)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE_VALUE}>Use role template</SelectItem>
                                    {permissionTemplates.map((template) => (
                                        <SelectItem key={template.id} value={template.id}>
                                            {template.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                    <Controller
                        name="teamId"
                        control={control}
                        render={({ field }) => (
                            <Field label="Team">
                                <Select
                                    value={field.value || NONE_VALUE}
                                    onValueChange={(value) => field.onChange(value === NONE_VALUE ? "" : value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE_VALUE}>None</SelectItem>
                                        {teams.map((team) => (
                                            <SelectItem key={team.id} value={team.id}>
                                                {team.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        )}
                    />
                    <Controller
                        name="managerId"
                        control={control}
                        render={({ field }) => (
                            <Field label="Manager">
                                <Select
                                    value={field.value || NONE_VALUE}
                                    onValueChange={(value) => field.onChange(value === NONE_VALUE ? "" : value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE_VALUE}>None</SelectItem>
                                        {managers.map((manager) => (
                                            <SelectItem key={manager.id} value={manager.id}>
                                                {manager.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        )}
                    />
                </div>
            </form>
        </StandardDialog>
    );
}
