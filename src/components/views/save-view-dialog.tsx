"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FilterConfig } from "@/types/filters";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

const formSchema = z.object({
    name: z.string().min(2, "Name is required"),
    isDefault: z.boolean().default(false),
    isShared: z.boolean().default(false),
});

interface SaveViewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    module: string;
    filters: FilterConfig;
    onSuccess: (savedView: any) => void;
}

export function SaveViewDialog({
    open,
    onOpenChange,
    module,
    filters,
    onSuccess,
}: SaveViewDialogProps) {
    const [loading, setLoading] = useState(false);

    const form = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            isDefault: false,
            isShared: false,
        },
    });

    async function onSubmit(values: any) {
        setLoading(true);
        try {
            const savedView = await apiFetch("/saved-views", {
                method: "POST",
                body: JSON.stringify({
                    ...values,
                    module,
                    filters,
                }),
            });
            toast.success("View saved successfully");
            onSuccess(savedView);
            onOpenChange(false);
            form.reset();
        } catch (error) {
            toast.error("Failed to save view");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Save View</DialogTitle>
                    <DialogDescription>
                        Save current filters as a named view for quick access.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>View Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g. Hot Leads in NY" {...field} />
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="isDefault"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                    <div className="space-y-0.5">
                                        <FormLabel>Set as Default</FormLabel>
                                        <FormDescription>
                                            Load this view automatically when opening the leads page
                                        </FormDescription>
                                    </div>
                                    <FormControl>
                                        <Switch
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="isShared"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                    <div className="space-y-0.5">
                                        <FormLabel>Share with Team</FormLabel>
                                        <FormDescription>
                                            Allow other team members to see this view
                                        </FormDescription>
                                    </div>
                                    <FormControl>
                                        <Switch
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={loading}>
                                {loading ? "Saving..." : "Save View"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
