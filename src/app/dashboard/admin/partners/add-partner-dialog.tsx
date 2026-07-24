"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Role } from "@/types/user";

interface AddPartnerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

const formSchema = z.object({
    name: z.string().min(2, "Name is required"),
    email: z.string().email("Valid email is required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    roleId: z.string().min(1, "Partner role is required"),
    legalBusinessName: z.string().min(2, "Legal business name is required"),
    gstin: z.string().optional(),
    panNumber: z.string().optional(),
    registeredState: z.string().optional(),
});

export function AddPartnerDialog({ open, onOpenChange, onSuccess }: AddPartnerDialogProps) {
    const [loading, setLoading] = useState(false);
    const [partnerRoles, setPartnerRoles] = useState<Role[]>([]);

    const { control, handleSubmit, reset, formState: { errors } } = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            email: "",
            password: "",
            roleId: "",
            legalBusinessName: "",
            gstin: "",
            panNumber: "",
            registeredState: "",
        },
    });

    useEffect(() => {
        if (open) {
            apiFetch("/roles")
                .then((data) => {
                    const roles = Array.isArray(data) ? data : [];
                    setPartnerRoles(roles.filter((role: Role) => role.permissions?.isPartnerRole));
                })
                .catch(() => setPartnerRoles([]));
        }
    }, [open]);

    const handleClose = () => {
        onOpenChange(false);
        reset();
    };

    async function onSubmit(values: any) {
        setLoading(true);
        try {
            await apiFetch("/partners", {
                method: "POST",
                body: JSON.stringify({
                    ...values,
                    gstin: values.gstin || null,
                    panNumber: values.panNumber || null,
                    registeredState: values.registeredState || null,
                }),
            });
            toast.success("Partner created successfully");
            handleClose();
            onSuccess();
        } catch (error: any) {
            toast.error(error.message || "Failed to create partner");
        } finally {
            setLoading(false);
        }
    }

    return (
        <StandardDialog
            open={open}
            onClose={handleClose}
            title="Add Partner"
            subtitle="Create a channel partner account. Partners only see their own assigned leads/opportunities and their own commission/payout data."
            icon={<UserPlus className="size-5" />}
            actions={
                <>
                    <Button type="button" variant="ghost" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button type="submit" form="add-partner-form" disabled={loading}>
                        {loading ? "Creating..." : "Create Partner"}
                    </Button>
                </>
            }
        >
            <form id="add-partner-form" onSubmit={handleSubmit(onSubmit)}>
                <div className="space-y-4">
                    {partnerRoles.length === 0 && (
                        <div className="rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
                            No partner role exists yet. Create a role first (Settings → Roles) and enable
                            &quot;External partner role&quot; on it, then come back here.
                        </div>
                    )}

                    <Controller
                        name="name"
                        control={control}
                        render={({ field }) => (
                            <Field label="Contact Name" error={errors.name?.message as string}>
                                <Input {...field} aria-invalid={!!errors.name} />
                            </Field>
                        )}
                    />

                    <Controller
                        name="email"
                        control={control}
                        render={({ field }) => (
                            <Field label="Email" error={errors.email?.message as string}>
                                <Input {...field} type="email" aria-invalid={!!errors.email} />
                            </Field>
                        )}
                    />

                    <Controller
                        name="password"
                        control={control}
                        render={({ field }) => (
                            <Field label="Temporary Password" error={errors.password?.message as string}>
                                <Input {...field} type="password" placeholder="Min. 6 characters" aria-invalid={!!errors.password} />
                            </Field>
                        )}
                    />

                    <Controller
                        name="roleId"
                        control={control}
                        render={({ field }) => (
                            <Field label="Partner Role" error={errors.roleId?.message as string}>
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger aria-invalid={!!errors.roleId} className="w-full">
                                        <SelectValue placeholder="Select partner role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                    {partnerRoles.map((role) => (
                                        <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                                    ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        )}
                    />

                    <Controller
                        name="legalBusinessName"
                        control={control}
                        render={({ field }) => (
                            <Field
                                label="Legal Business Name"
                                error={errors.legalBusinessName?.message as string}
                                hint="Appears as the supplier name on the partner's self-generated invoices"
                            >
                                <Input {...field} aria-invalid={!!errors.legalBusinessName} />
                            </Field>
                        )}
                    />

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Controller
                            name="gstin"
                            control={control}
                            render={({ field }) => (
                                <Field label="GSTIN (optional)">
                                    <Input {...field} placeholder="Leave blank if not GST-registered" />
                                </Field>
                            )}
                        />
                        <Controller
                            name="panNumber"
                            control={control}
                            render={({ field }) => (
                                <Field label="PAN (optional)">
                                    <Input {...field} />
                                </Field>
                            )}
                        />
                    </div>

                    <Controller
                        name="registeredState"
                        control={control}
                        render={({ field }) => (
                            <Field label="Registered State (optional)" hint="Used for CGST+SGST vs IGST place-of-supply logic on invoices">
                                <Input {...field} />
                            </Field>
                        )}
                    />
                </div>
            </form>
        </StandardDialog>
    );
}

function Field({
    label,
    error,
    hint,
    children,
}: {
    label: string;
    error?: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            {children}
            {error ? (
                <p className="text-xs text-destructive">{error}</p>
            ) : hint ? (
                <p className="text-xs text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    );
}
