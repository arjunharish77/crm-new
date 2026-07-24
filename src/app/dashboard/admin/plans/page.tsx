"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Database, Edit, Loader2, Plus, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import * as z from "zod";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
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
import { Switch } from "@/components/ui/switch";

interface Plan {
    id: string;
    name: string;
    description?: string;
    price: number;
    billingCycle: "MONTHLY" | "YEARLY";
    features: string[];
    limits: {
        users: number;
        storage: number;
        apiCalls: number;
    };
    isActive: boolean;
}

const planSchema = z.object({
    name: z.string().min(2, "Name is required"),
    description: z.string().optional(),
    price: z.number().min(0, "Price must be positive"),
    billingCycle: z.enum(["MONTHLY", "YEARLY"]),
    limits: z.object({
        users: z.number().min(1, "At least 1 user"),
        storage: z.number().min(1, "At least 1 GB"),
        apiCalls: z.number().min(100, "At least 100 calls"),
    }),
});

type PlanFormValues = z.infer<typeof planSchema>;

const DEFAULT_VALUES: PlanFormValues = {
    name: "",
    description: "",
    price: 0,
    billingCycle: "MONTHLY",
    limits: {
        users: 5,
        storage: 10,
        apiCalls: 1000,
    },
};

interface FormFieldProps {
    label: string;
    error?: string;
    children: React.ReactNode;
}

function FormField({ label, error, children }: FormFieldProps) {
    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            {children}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
    );
}

function parseInteger(value: string) {
    return Number.parseInt(value, 10) || 0;
}

function parseDecimal(value: string) {
    return Number.parseFloat(value) || 0;
}

export default function PlansPage() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

    const {
        control,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<PlanFormValues>({
        resolver: zodResolver(planSchema),
        defaultValues: DEFAULT_VALUES,
    });

    const fetchPlans = async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/plans");
            setPlans(data);
        } catch (error) {
            toast.error("Failed to fetch plans");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPlans();
    }, []);

    const handleCreate = () => {
        setEditingPlan(null);
        reset(DEFAULT_VALUES);
        setDialogOpen(true);
    };

    const handleEdit = (plan: Plan) => {
        setEditingPlan(plan);
        reset({
            name: plan.name,
            description: plan.description || "",
            price: plan.price,
            billingCycle: plan.billingCycle,
            limits: plan.limits,
        });
        setDialogOpen(true);
    };

    const handleSave = async (values: PlanFormValues) => {
        try {
            if (editingPlan) {
                await apiFetch(`/plans/${editingPlan.id}`, {
                    method: "PATCH",
                    body: JSON.stringify(values),
                });
                toast.success("Plan updated");
            } else {
                await apiFetch("/plans", {
                    method: "POST",
                    body: JSON.stringify(values),
                });
                toast.success("Plan created");
            }
            setDialogOpen(false);
            fetchPlans();
        } catch (error) {
            toast.error("Failed to save plan");
        }
    };

    const handleToggleActive = async (plan: Plan) => {
        try {
            await apiFetch(`/plans/${plan.id}`, {
                method: "PATCH",
                body: JSON.stringify({ isActive: !plan.isActive }),
            });
            fetchPlans();
        } catch (error) {
            toast.error("Failed to update status");
        }
    };

    return (
        <div className="mx-auto max-w-[1200px] px-4 py-4 md:px-6">
            <div className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-xl font-semibold tracking-normal text-foreground">Subscription Plans</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Manage pricing tiers and feature limits.</p>
                </div>
                <Button onClick={handleCreate}>
                    <Plus className="h-4 w-4" />
                    Create Plan
                </Button>
            </div>

            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
            ) : (
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {plans.map((plan) => (
                        <Card key={plan.id} className="h-full gap-4 rounded-lg py-5">
                            <CardHeader className="gap-4 px-5">
                                <div className="flex items-start justify-between gap-4">
                                    <CardTitle className="text-base">{plan.name}</CardTitle>
                                    <Switch
                                        size="sm"
                                        checked={plan.isActive}
                                        onCheckedChange={() => handleToggleActive(plan)}
                                        aria-label={`Toggle ${plan.name} active status`}
                                    />
                                </div>
                                <div className="text-3xl font-semibold text-primary">
                                    ${plan.price}
                                    <span className="text-sm font-normal text-muted-foreground">
                                        /{plan.billingCycle === "MONTHLY" ? "mo" : "yr"}
                                    </span>
                                </div>
                            </CardHeader>
                            <CardContent className="flex-1 space-y-4 px-5">
                                <div>
                                    <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                                        <Users className="h-4 w-4 text-muted-foreground" />
                                        Users Limit
                                    </div>
                                    <p className="text-sm text-muted-foreground">{plan.limits.users} users</p>
                                </div>
                                <div>
                                    <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                                        <Database className="h-4 w-4 text-muted-foreground" />
                                        Storage Limit
                                    </div>
                                    <p className="text-sm text-muted-foreground">{plan.limits.storage} GB</p>
                                </div>
                                <div>
                                    <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                                        API Limit
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {plan.limits.apiCalls.toLocaleString()} calls/day
                                    </p>
                                </div>
                            </CardContent>
                            <CardFooter className="border-t border-border px-5 pt-4">
                                <Button variant="outline" className="w-full" onClick={() => handleEdit(plan)}>
                                    <Edit className="h-4 w-4" />
                                    Edit Plan
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>{editingPlan ? "Edit Plan" : "Create Plan"}</DialogTitle>
                    </DialogHeader>
                    <form id="plan-form" className="space-y-4" onSubmit={handleSubmit(handleSave)}>
                        <Controller
                            name="name"
                            control={control}
                            render={({ field }) => (
                                <FormField label="Plan Name" error={errors.name?.message}>
                                    <Input {...field} />
                                </FormField>
                            )}
                        />

                        <div className="grid gap-4 sm:grid-cols-2">
                            <Controller
                                name="price"
                                control={control}
                                render={({ field }) => (
                                    <FormField label="Price" error={errors.price?.message}>
                                        <div className="relative">
                                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                                $
                                            </span>
                                            <Input
                                                type="number"
                                                className="pl-7"
                                                value={field.value}
                                                onChange={(event) => field.onChange(parseDecimal(event.target.value))}
                                            />
                                        </div>
                                    </FormField>
                                )}
                            />
                            <Controller
                                name="billingCycle"
                                control={control}
                                render={({ field }) => (
                                    <FormField label="Billing Cycle" error={errors.billingCycle?.message}>
                                        <Select value={field.value} onValueChange={field.onChange}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="MONTHLY">Monthly</SelectItem>
                                                <SelectItem value="YEARLY">Yearly</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </FormField>
                                )}
                            />
                        </div>

                        <div className="space-y-3">
                            <h2 className="text-sm font-semibold">Limits</h2>
                            <div className="grid gap-4 sm:grid-cols-3">
                                <Controller
                                    name="limits.users"
                                    control={control}
                                    render={({ field }) => (
                                        <FormField label="Users" error={errors.limits?.users?.message}>
                                            <Input
                                                type="number"
                                                value={field.value}
                                                onChange={(event) => field.onChange(parseInteger(event.target.value))}
                                            />
                                        </FormField>
                                    )}
                                />
                                <Controller
                                    name="limits.storage"
                                    control={control}
                                    render={({ field }) => (
                                        <FormField label="Storage (GB)" error={errors.limits?.storage?.message}>
                                            <Input
                                                type="number"
                                                value={field.value}
                                                onChange={(event) => field.onChange(parseInteger(event.target.value))}
                                            />
                                        </FormField>
                                    )}
                                />
                                <Controller
                                    name="limits.apiCalls"
                                    control={control}
                                    render={({ field }) => (
                                        <FormField label="API Calls" error={errors.limits?.apiCalls?.message}>
                                            <Input
                                                type="number"
                                                value={field.value}
                                                onChange={(event) => field.onChange(parseInteger(event.target.value))}
                                            />
                                        </FormField>
                                    )}
                                />
                            </div>
                        </div>
                    </form>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" form="plan-form">
                            Save Plan
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
