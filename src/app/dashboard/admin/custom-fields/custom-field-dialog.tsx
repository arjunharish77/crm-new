"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
    FormMessage,
    FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";

interface CustomField {
    id: string;
    key: string;
    label: string;
    objectType: "LEAD" | "OPPORTUNITY" | "ACTIVITY";
    fieldType: string;
    required: boolean;
    metadata?: any;
    order: number;
}

interface CustomFieldDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customField: CustomField | null;
    defaultObjectType: "LEAD" | "OPPORTUNITY" | "ACTIVITY";
    onSuccess: () => void;
}

const formSchema = z.object({
    label: z.string().min(2, "Label is required"),
    key: z.string().optional(),
    objectType: z.enum(["LEAD", "OPPORTUNITY", "ACTIVITY"]),
    fieldType: z.enum(["TEXT", "NUMBER", "DATE", "SELECT", "TEXTAREA", "CHECKBOX"]),
    required: z.boolean(),
    options: z.string().optional(),
});

const fieldTypes = [
    { value: "TEXT", label: "Text (Single Line)" },
    { value: "TEXTAREA", label: "Text Area (Multi-line)" },
    { value: "NUMBER", label: "Number" },
    { value: "DATE", label: "Date" },
    { value: "SELECT", label: "Dropdown (Select)" },
    { value: "CHECKBOX", label: "Checkbox (Yes/No)" },
];

export function CustomFieldDialog({
    open,
    onOpenChange,
    customField,
    defaultObjectType,
    onSuccess,
}: CustomFieldDialogProps) {
    const [loading, setLoading] = useState(false);
    const [generatedKey, setGeneratedKey] = useState("");

    const form = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            label: "",
            key: "",
            objectType: defaultObjectType,
            fieldType: "TEXT",
            required: false,
            options: "",
        },
    });

    const selectedFieldType = form.watch("fieldType");
    const label = form.watch("label");

    // Auto-generate key from label
    useEffect(() => {
        if (!customField && label) {
            const key = label
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "");
            setGeneratedKey(key);
            form.setValue("key", key);
        }
    }, [label, customField, form]);

    useEffect(() => {
        if (customField) {
            form.reset({
                label: customField.label,
                key: customField.key,
                objectType: customField.objectType,
                fieldType: customField.fieldType as any,
                required: customField.required,
                options: customField.metadata?.options?.join(", ") || "",
            });
            setGeneratedKey(customField.key);
        } else {
            form.reset({
                label: "",
                key: "",
                objectType: defaultObjectType,
                fieldType: "TEXT",
                required: false,
                options: "",
            });
            setGeneratedKey("");
        }
    }, [customField, defaultObjectType, form]);

    async function onSubmit(values: any) {
        setLoading(true);
        try {
            // Validate SELECT type has options
            if (values.fieldType === "SELECT" && !values.options?.trim()) {
                toast.error("Dropdown fields must have at least one option");
                setLoading(false);
                return;
            }

            // Validate key format
            const keyRegex = /^[a-z][a-z0-9_]*$/;
            if (!keyRegex.test(values.key || generatedKey)) {
                toast.error("Key must start with a letter and contain only lowercase letters, numbers, and underscores");
                setLoading(false);
                return;
            }

            let optionsArray = undefined;
            if (values.fieldType === "SELECT" && values.options) {
                optionsArray = values.options
                    .split(",")
                    .map((opt: string) => opt.trim())
                    .filter((opt: string) => opt.length > 0);
            }

            const payload = {
                label: values.label,
                key: values.key || generatedKey,
                objectType: values.objectType,
                type: values.fieldType, // Backend expects 'type' not 'fieldType'
                required: values.required,
                options: optionsArray, // Backend expects 'options' directly, not 'metadata.options'
                order: customField?.order || 999,
            };

            if (customField) {
                await apiFetch(`/custom-fields/${customField.id}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                toast.success("Custom field updated");
            } else {
                await apiFetch("/custom-fields", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast.success("Custom field created");
            }

            onSuccess();
        } catch (error: any) {
            toast.error(error.message || "Failed to save custom field");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {customField ? "Edit Custom Field" : "Create Custom Field"}
                    </DialogTitle>
                    <DialogDescription>
                        Add a custom field to extend your CRM objects
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="objectType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Object Type</FormLabel>
                                    <Select
                                        onValueChange={field.onChange}
                                        defaultValue={field.value}
                                        disabled={!!customField}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="LEAD">Lead</SelectItem>
                                            <SelectItem value="OPPORTUNITY">Opportunity</SelectItem>
                                            <SelectItem value="ACTIVITY">Activity</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {customField && (
                                        <FormDescription>
                                            Object type cannot be changed after creation
                                        </FormDescription>
                                    )}
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="label"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Field Label</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Company Size" {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        User-facing label shown in forms
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="key"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Field Key</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="company_size"
                                            {...field}
                                            disabled={!!customField}
                                            value={field.value || generatedKey}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Auto-generated from label. Must be unique per object type.
                                        {customField && " Cannot be changed after creation."}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="fieldType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Field Type</FormLabel>
                                    <Select
                                        onValueChange={field.onChange}
                                        defaultValue={field.value}
                                        disabled={!!customField}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {fieldTypes.map((type) => (
                                                <SelectItem key={type.value} value={type.value}>
                                                    {type.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {customField && (
                                        <FormDescription>
                                            Field type cannot be changed to preserve data integrity
                                        </FormDescription>
                                    )}
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {selectedFieldType === "SELECT" && (
                            <FormField
                                control={form.control}
                                name="options"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Dropdown Options</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Small, Medium, Large, Enterprise"
                                                {...field}
                                                rows={3}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Comma-separated list of options
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        <FormField
                            control={form.control}
                            name="required"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                    <div className="space-y-0.5">
                                        <FormLabel>Required Field</FormLabel>
                                        <FormDescription>
                                            Users must fill this field to save the record
                                        </FormDescription>
                                    </div>
                                    <FormControl>
                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
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
                                {loading
                                    ? "Saving..."
                                    : customField
                                        ? "Update Field"
                                        : "Create Field"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
