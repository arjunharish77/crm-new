"use client";

import { ReactNode, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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

const formSchema = z.object({
    name: z.string().min(2, "Tenant name must be at least 2 characters"),
    plan: z.enum(["BASIC", "PRO", "ENTERPRISE"]),
    adminEmail: z.string().email("Invalid email address"),
    adminName: z.string().min(2, "Admin name must be at least 2 characters"),
    features: z.object({
        opportunityEnabled: z.boolean().default(true),
        automationEnabled: z.boolean().default(true),
        salesGroupsEnabled: z.boolean().default(true),
        formBuilderEnabled: z.boolean().default(true),
        advancedReporting: z.boolean().default(true),
        apiAccessEnabled: z.boolean().default(false),
    }),
});

type CreateTenantFormValues = z.infer<typeof formSchema>;

type CreateTenantDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
};

const FEATURE_FIELDS = [
    { name: "features.opportunityEnabled", label: "Opportunities" },
    { name: "features.automationEnabled", label: "Automation" },
    { name: "features.salesGroupsEnabled", label: "Sales Groups" },
    { name: "features.formBuilderEnabled", label: "Form Builder" },
    { name: "features.advancedReporting", label: "Advanced Reporting" },
    { name: "features.apiAccessEnabled", label: "API Access" },
] as const;

const DEFAULT_VALUES: CreateTenantFormValues = {
    name: "",
    plan: "BASIC",
    adminEmail: "",
    adminName: "",
    features: {
        opportunityEnabled: true,
        automationEnabled: true,
        salesGroupsEnabled: true,
        formBuilderEnabled: true,
        advancedReporting: true,
        apiAccessEnabled: false,
    },
};

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

export function CreateTenantDialog({ open, onOpenChange, onSuccess }: CreateTenantDialogProps) {
    const [loading, setLoading] = useState(false);
    const [credentials, setCredentials] = useState<{
        email: string;
        password: string;
    } | null>(null);

    const {
        control,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<CreateTenantFormValues>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: DEFAULT_VALUES,
    });

    async function onSubmit(values: CreateTenantFormValues) {
        setLoading(true);
        try {
            const res = await apiFetch("/platform-admin/tenants", {
                method: "POST",
                body: JSON.stringify(values),
            });

            setCredentials({
                email: res.admin.email,
                password: res.admin.temporaryPassword,
            });

            toast.success("Tenant created successfully!");
            onSuccess();
        } catch (error: any) {
            toast.error(error.message || "Failed to create tenant");
        } finally {
            setLoading(false);
        }
    }

    function handleClose() {
        if (credentials) {
            setCredentials(null);
            reset(DEFAULT_VALUES);
        }
        onOpenChange(false);
    }

    function copyPassword() {
        if (credentials) {
            navigator.clipboard.writeText(credentials.password);
            toast.success("Password copied to clipboard!");
        }
    }

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : handleClose())}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>{credentials ? "Tenant Created" : "Create New Tenant"}</DialogTitle>
                    <DialogDescription>
                        {credentials
                            ? "Save these credentials securely. The password will only be shown once."
                            : "Enter the details below to provision a new tenant environment."}
                    </DialogDescription>
                </DialogHeader>

                {credentials ? (
                    <div className="space-y-4">
                        <div className="rounded-lg border border-tertiary/30 bg-tertiary/10 px-4 py-3">
                            <h3 className="text-sm font-semibold text-tertiary">Credentials</h3>
                            <p className="mt-1 text-sm text-muted-foreground">Please copy these now.</p>
                        </div>

                        <div className="rounded-lg border border-border bg-muted/40 p-4">
                            <div className="space-y-4">
                                <div>
                                    <p className="text-xs font-semibold uppercase text-muted-foreground">Email</p>
                                    <p className="mt-1 font-mono text-sm">{credentials.email}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase text-muted-foreground">Temporary Password</p>
                                    <div className="mt-1 flex items-center justify-between gap-3">
                                        <p className="min-w-0 truncate font-mono text-sm">{credentials.password}</p>
                                        <Button type="button" variant="ghost" size="icon-sm" onClick={copyPassword}>
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <form id="create-tenant-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                        <Controller
                            name="name"
                            control={control}
                            render={({ field }) => (
                                <Field label="Tenant Name" error={errors.name?.message}>
                                    <Input {...field} placeholder="Acme Corp" />
                                </Field>
                            )}
                        />

                        <Controller
                            name="plan"
                            control={control}
                            render={({ field }) => (
                                <Field label="Plan" error={errors.plan?.message}>
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="BASIC">Basic</SelectItem>
                                            <SelectItem value="PRO">Pro</SelectItem>
                                            <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </Field>
                            )}
                        />

                        <div className="grid gap-4 sm:grid-cols-2">
                            <Controller
                                name="adminName"
                                control={control}
                                render={({ field }) => (
                                    <Field label="Admin Name" error={errors.adminName?.message}>
                                        <Input {...field} placeholder="John Doe" />
                                    </Field>
                                )}
                            />
                            <Controller
                                name="adminEmail"
                                control={control}
                                render={({ field }) => (
                                    <Field label="Admin Email" error={errors.adminEmail?.message}>
                                        <Input {...field} placeholder="admin@example.com" />
                                    </Field>
                                )}
                            />
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-muted-foreground">Feature Flags</h3>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {FEATURE_FIELDS.map((feature) => (
                                    <Controller
                                        key={feature.name}
                                        name={feature.name}
                                        control={control}
                                        render={({ field }) => (
                                            <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={(checked) => field.onChange(checked === true)}
                                                />
                                                {feature.label}
                                            </label>
                                        )}
                                    />
                                ))}
                            </div>
                        </div>
                    </form>
                )}

                <DialogFooter>
                    {credentials ? (
                        <Button onClick={handleClose} className="w-full">
                            Done
                        </Button>
                    ) : (
                        <>
                            <Button variant="outline" onClick={handleClose}>
                                Cancel
                            </Button>
                            <Button type="submit" form="create-tenant-form" disabled={loading}>
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                {loading ? "Creating..." : "Create Tenant"}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
