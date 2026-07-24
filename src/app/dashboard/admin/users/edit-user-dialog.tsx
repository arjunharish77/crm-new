"use client";

import { KeyboardEvent, ReactNode, useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Edit, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import * as z from "zod";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Badge } from "@/components/ui/badge";
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

interface EditUserDialogProps {
    user: User | null;
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
    skills: z.array(z.object({
        category: z.string().min(1, "Category is required"),
        values: z.array(z.string()).min(1, "At least one value is required"),
    })),
});

type EditUserFormValues = z.infer<typeof formSchema>;

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

function transformSkillsToArray(skillsObj: unknown): EditUserFormValues["skills"] {
    if (!skillsObj || typeof skillsObj !== "object") return [];
    return Object.entries(skillsObj).map(([category, values]) => ({
        category,
        values: Array.isArray(values) ? values.map(String) : [String(values)],
    }));
}

interface SkillValueInputProps {
    values: string[];
    onChange: (values: string[]) => void;
}

function SkillValueInput({ values, onChange }: SkillValueInputProps) {
    const [input, setInput] = useState("");

    const addValue = () => {
        const trimmed = input.trim();
        if (trimmed && !values.includes(trimmed)) {
            onChange([...values, trimmed]);
            setInput("");
        }
    };

    const removeValue = (valueToRemove: string) => {
        onChange(values.filter((value) => value !== valueToRemove));
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            addValue();
        }
    };

    return (
        <div className="space-y-2">
            {values.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {values.map((value) => (
                        <Badge key={value} variant="secondary" className="gap-1 pr-1">
                            {value}
                            <button
                                type="button"
                                className="rounded-sm p-0.5 hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => removeValue(value)}
                                aria-label={`Remove ${value}`}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            ) : null}
            <div className="flex gap-2">
                <Input
                    placeholder="Type value & Enter"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                />
                <Button type="button" variant="outline" onClick={addValue}>
                    Add
                </Button>
            </div>
        </div>
    );
}

export function EditUserDialog({
    user,
    open,
    onOpenChange,
    onSuccess,
}: EditUserDialogProps) {
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
    } = useForm<EditUserFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            email: "",
            roleId: "",
            permissionTemplateId: "",
            teamId: "",
            managerId: "",
            skills: [],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: "skills",
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

                    const potentialManagers = (Array.isArray(usersData) ? usersData : [])
                        .filter((candidate: User) => candidate.id !== user?.id);
                    setManagers(potentialManagers);
                } catch (error) {
                    toast.error("Failed to load form data");
                }
            };
            loadData();

            if (user) {
                reset({
                    name: user.name,
                    email: user.email,
                    roleId: user.role?.id || user.roleId || "",
                    permissionTemplateId: user.permissionTemplateId || "",
                    teamId: user.team?.id || user.teamId || "",
                    managerId: user.manager?.id || user.managerId || "",
                    skills: transformSkillsToArray(user.skills || {}),
                });
            }
        }
    }, [open, user, reset]);

    const handleClose = () => {
        onOpenChange(false);
    };

    async function onSubmit(values: EditUserFormValues) {
        if (!user) return;
        setLoading(true);
        try {
            const skillsObj = values.skills.reduce<Record<string, string[]>>((acc, curr) => {
                acc[curr.category] = curr.values;
                return acc;
            }, {});

            await apiFetch(`/users/${user.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    name: values.name,
                    roleId: values.roleId,
                    teamId: values.teamId,
                    managerId: values.managerId,
                    skills: skillsObj,
                }),
            });

            toast.success("User updated successfully");
            handleClose();
            onSuccess();
        } catch (error: any) {
            toast.error(error.message || "Failed to update user");
        } finally {
            setLoading(false);
        }
    }

    return (
        <StandardDialog
            open={open}
            onClose={handleClose}
            title="Edit User"
            subtitle="Update user details and assignment skills."
            icon={<Edit className="h-5 w-5" />}
            actions={
                <>
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button type="submit" form="edit-user-form" disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {loading ? "Saving..." : "Save Changes"}
                    </Button>
                </>
            }
        >
            <form id="edit-user-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Controller
                        name="name"
                        control={control}
                        render={({ field }) => (
                            <Field label="Full Name" error={errors.name?.message}>
                                <Input {...field} />
                            </Field>
                        )}
                    />
                    <Controller
                        name="email"
                        control={control}
                        render={({ field }) => (
                            <Field label="Email">
                                <Input {...field} disabled />
                            </Field>
                        )}
                    />
                </div>

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

                <div className="rounded-lg border border-border p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <h2 className="text-sm font-semibold">Assignment Skills</h2>
                        <Button type="button" size="sm" variant="outline" onClick={() => append({ category: "", values: [] })}>
                            <Plus className="h-4 w-4" />
                            Add Category
                        </Button>
                    </div>

                    {fields.length === 0 ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">No skills assigned.</p>
                    ) : null}

                    <div className="space-y-3">
                        {fields.map((field, index) => (
                            <div key={field.id} className="relative rounded-lg bg-muted/40 p-4 pr-12">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    className="absolute right-2 top-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => remove(index)}
                                    aria-label="Remove skill category"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>

                                <div className="space-y-3">
                                    <Controller
                                        name={`skills.${index}.category`}
                                        control={control}
                                        render={({ field }) => (
                                            <Field
                                                label="Category (Key)"
                                                error={errors.skills?.[index]?.category?.message}
                                            >
                                                <Input {...field} placeholder="e.g. Language" />
                                            </Field>
                                        )}
                                    />

                                    <Controller
                                        name={`skills.${index}.values`}
                                        control={control}
                                        render={({ field }) => (
                                            <Field label="Values" error={errors.skills?.[index]?.values?.message}>
                                                <SkillValueInput values={field.value} onChange={field.onChange} />
                                            </Field>
                                        )}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </form>
        </StandardDialog>
    );
}
