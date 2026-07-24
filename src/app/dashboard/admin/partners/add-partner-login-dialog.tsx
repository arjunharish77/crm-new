"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Role } from "@/types/user";

type PartnerProfile = {
    id: string;
    legalBusinessName: string;
    partnerLoginRole?: "PRIMARY" | "MANAGER" | "MEMBER" | "FINANCE";
    user?: { id: string; name: string; email: string } | null;
};

interface AddPartnerLoginDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    partner: PartnerProfile | null;
    logins: PartnerProfile[];
    onSuccess: () => void;
}

const formSchema = z.object({
    name: z.string().min(2, "Name is required"),
    email: z.string().email("Valid email is required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    roleId: z.string().min(1, "Partner role is required"),
    partnerLoginRole: z.enum(["MANAGER", "MEMBER", "FINANCE"]),
    parentPartnerProfileId: z.string().optional(),
    canAccessPayouts: z.boolean(),
});

export function AddPartnerLoginDialog({ open, onOpenChange, partner, logins, onSuccess }: AddPartnerLoginDialogProps) {
    const [loading, setLoading] = useState(false);
    const [partnerRoles, setPartnerRoles] = useState<Role[]>([]);

    const { control, handleSubmit, reset, formState: { errors } } = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            email: "",
            password: "",
            roleId: "",
            partnerLoginRole: "MEMBER" as const,
            parentPartnerProfileId: "",
            canAccessPayouts: false,
        },
    });

    useEffect(() => {
        if (!open) return;
        apiFetch("/roles")
            .then((data) => {
                const roles = Array.isArray(data) ? data : [];
                setPartnerRoles(roles.filter((role: Role) => role.permissions?.isPartnerRole));
            })
            .catch(() => setPartnerRoles([]));
    }, [open]);

    const handleClose = () => {
        onOpenChange(false);
        reset();
    };

    async function onSubmit(values: z.infer<typeof formSchema>) {
        if (!partner) return;
        setLoading(true);
        try {
            await apiFetch(`/partners/${partner.id}/logins`, {
                method: "POST",
                body: JSON.stringify({
                    ...values,
                    parentPartnerProfileId: values.parentPartnerProfileId || null,
                }),
            });
            toast.success("Partner login created");
            handleClose();
            onSuccess();
        } catch (error: any) {
            toast.error(error.message || "Failed to create partner login");
        } finally {
            setLoading(false);
        }
    }

    return (
        <StandardDialog
            open={open}
            onClose={handleClose}
            title="Add Partner Login"
            subtitle={partner ? `Create an additional login under ${partner.legalBusinessName}.` : "Create an additional partner login."}
            icon={<UserPlus className="size-5" />}
            actions={
                <>
                    <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
                    <Button type="submit" form="add-partner-login-form" disabled={loading || !partner}>
                        {loading ? "Creating..." : "Create Login"}
                    </Button>
                </>
            }
        >
            <form id="add-partner-login-form" onSubmit={handleSubmit(onSubmit)}>
                <div className="space-y-4">
                    <Controller name="name" control={control} render={({ field }) => (
                        <Field label="Login Name" error={errors.name?.message}>
                            <Input {...field} />
                        </Field>
                    )} />
                    <Controller name="email" control={control} render={({ field }) => (
                        <Field label="Email" error={errors.email?.message}>
                            <Input {...field} type="email" />
                        </Field>
                    )} />
                    <Controller name="password" control={control} render={({ field }) => (
                        <Field label="Temporary Password" error={errors.password?.message}>
                            <Input {...field} type="password" />
                        </Field>
                    )} />
                    <Controller name="roleId" control={control} render={({ field }) => (
                        <Field label="Partner Role" error={errors.roleId?.message}>
                            <Select value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger className="w-full"><SelectValue placeholder="Select partner role" /></SelectTrigger>
                                <SelectContent>
                                    {partnerRoles.map((role) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </Field>
                    )} />
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Controller name="partnerLoginRole" control={control} render={({ field }) => (
                            <Field label="Login Role">
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="MANAGER">Manager</SelectItem>
                                        <SelectItem value="MEMBER">Member</SelectItem>
                                        <SelectItem value="FINANCE">Finance</SelectItem>
                                    </SelectContent>
                                </Select>
                            </Field>
                        )} />
                        <Controller name="parentPartnerProfileId" control={control} render={({ field }) => (
                            <Field label="Reports To">
                                <Select value={field.value || "__primary__"} onValueChange={(value) => field.onChange(value === "__primary__" ? "" : value)}>
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__primary__">Primary login</SelectItem>
                                        {logins.map((login) => (
                                            <SelectItem key={login.id} value={login.id}>
                                                {login.user?.name || login.user?.email || login.id}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        )} />
                    </div>
                    <Controller name="canAccessPayouts" control={control} render={({ field }) => (
                        <label className="flex items-center justify-between gap-3 rounded-xl border bg-surface-container-low p-3 text-sm font-semibold">
                            Payout module visible for this login
                            <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                        </label>
                    )} />
                </div>
            </form>
        </StandardDialog>
    );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            {children}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
    );
}
