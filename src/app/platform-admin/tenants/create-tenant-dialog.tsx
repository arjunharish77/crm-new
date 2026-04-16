"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
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
import { toast } from "sonner";
import { Plus, Loader2, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface CreateTenantDialogProps {
    onSuccess: () => void;
}

export function CreateTenantDialog({ onSuccess }: CreateTenantDialogProps) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const [form, setForm] = useState({
        name: "",
        plan: "Pro",
        adminName: "",
        adminEmail: "",
        adminPassword: "",
        opportunityEnabled: true,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            await apiFetch("/platform-admin/tenants", {
                method: "POST",
                body: JSON.stringify(form),
            });
            toast.success("Tenant provisioned successfully");
            setOpen(false);
            setForm({
                name: "",
                plan: "Pro",
                adminName: "",
                adminEmail: "",
                adminPassword: "",
                opportunityEnabled: true,
            });
            onSuccess();
        } catch (error: any) {
            toast.error(error.message || "Failed to provision tenant");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="mr-2 h-4 w-4" /> Create Tenant
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Provision New Tenant</DialogTitle>
                    <DialogDescription>
                        Create a new tenant workspace and its first admin user.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Tenant Name</Label>
                        <Input
                            id="name"
                            required
                            placeholder="Acme Corp"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="plan">Plan</Label>
                        <Select
                            value={form.plan}
                            onValueChange={(value) => setForm({ ...form, plan: value })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select plan" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Basic">Basic</SelectItem>
                                <SelectItem value="Pro">Pro</SelectItem>
                                <SelectItem value="Enterprise">Enterprise</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center justify-between space-x-2 py-2 border-t pt-4">
                        <div className="space-y-0.5">
                            <Label htmlFor="opportunity-toggle" className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-primary" />
                                Opportunities Module
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                Enable pipelines and lead conversion for this tenant.
                            </p>
                        </div>
                        <Switch
                            id="opportunity-toggle"
                            checked={form.opportunityEnabled}
                            onCheckedChange={(checked) => setForm({ ...form, opportunityEnabled: checked })}
                        />
                    </div>

                    <div className="border-t pt-4 mt-4">
                        <h4 className="text-sm font-medium mb-3">Tenant Admin Account</h4>
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="adminName">Admin Name</Label>
                                <Input
                                    id="adminName"
                                    required
                                    placeholder="John Doe"
                                    value={form.adminName}
                                    onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="adminEmail">Admin Email</Label>
                                <Input
                                    id="adminEmail"
                                    required
                                    type="email"
                                    placeholder="john@acme.com"
                                    value={form.adminEmail}
                                    onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="adminPassword">Password</Label>
                                <Input
                                    id="adminPassword"
                                    required
                                    type="password"
                                    placeholder="*******"
                                    value={form.adminPassword}
                                    onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Provision Tenant
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
