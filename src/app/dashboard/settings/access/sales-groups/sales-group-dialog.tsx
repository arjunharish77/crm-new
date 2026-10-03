"use client";

import { FormEvent, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";

interface SalesGroupDialogProps {
    onSuccess: () => void;
}

const NO_TEMPLATE_VALUE = "__none__";

export function SalesGroupDialog({ onSuccess }: SalesGroupDialogProps) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [templates, setTemplates] = useState<any[]>([]);
    const [form, setForm] = useState({ name: "", description: "", permissionTemplateId: "" });

    useEffect(() => {
        if (open) {
            apiFetch("/permission-templates")
                .then((data) => setTemplates(Array.isArray(data) ? data : []))
                .catch(() => setTemplates([]));
        }
    }, [open]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            await apiFetch("/sales-groups", {
                method: "POST",
                body: JSON.stringify(form),
            });
            toast.success("Group created");
            setOpen(false);
            setForm({ name: "", description: "", permissionTemplateId: "" });
            onSuccess();
        } catch (error: any) {
            console.error("Failed to create sales group:", error);
            toast.error("Failed to create group: " + (error.message || "Unknown error"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                Create Group
            </Button>

            <StandardDialog
                open={open}
                onClose={() => setOpen(false)}
                title="Create Sales Group"
                subtitle="Create a group to pool leads and manage assignments."
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" form="create-group-form" disabled={loading}>
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {loading ? "Creating..." : "Create Group"}
                        </Button>
                    </>
                }
            >
                <form id="create-group-form" onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="sales-group-name">Group Name</Label>
                        <Input
                            id="sales-group-name"
                            placeholder="e.g. Enterprise Sales East"
                            required
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="sales-group-description">Description</Label>
                        <Textarea
                            id="sales-group-description"
                            placeholder="Optional description"
                            rows={2}
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Permission Template</Label>
                        <Select
                            value={form.permissionTemplateId || NO_TEMPLATE_VALUE}
                            onValueChange={(value) =>
                                setForm({ ...form, permissionTemplateId: value === NO_TEMPLATE_VALUE ? "" : value })
                            }
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
                </form>
            </StandardDialog>
        </>
    );
}
