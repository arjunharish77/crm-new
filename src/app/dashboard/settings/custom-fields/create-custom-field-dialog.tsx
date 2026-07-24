"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import * as z from "zod";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

const fieldTypes = ["TEXT", "NUMBER", "DROPDOWN", "MULTI_SELECT", "DATE", "DATETIME", "BOOLEAN"];

const formSchema = z.object({
    label: z.string().min(2, "Label is required"),
    key: z.string().min(2, "Key is required").regex(/^[a-z0-9_]+$/, "Key must be lowercase alphanumeric with underscores"),
    type: z.string().min(1, "Type is required"),
    required: z.boolean().default(false),
    options: z.string().optional(), // Comma separated for SELECT
});

interface CreateCustomFieldDialogProps {
    objectType: string;
    onSuccess: () => void;
}

export function CreateCustomFieldDialog({ objectType, onSuccess }: CreateCustomFieldDialogProps) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const { control, handleSubmit, watch, setValue, reset, formState: { errors, dirtyFields } } = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            label: "",
            key: "",
            type: "TEXT",
            required: false,
            options: "",
        },
    });

    const watchType = watch("type");

    const handleLabelChange = (value: string) => {
        const key = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        setValue("label", value);
        if (!dirtyFields.key) {
            setValue("key", key);
        }
    };

    const handleClose = () => {
        setOpen(false);
        reset();
    };

    async function onSubmit(values: any) {
        setLoading(true);
        try {
            const payload: any = {
                ...values,
                objectType,
                options: (values.type === 'DROPDOWN' || values.type === 'MULTI_SELECT') && values.options
                    ? values.options.split(',').map((s: string) => s.trim()).filter((option: string) => option.length > 0)
                    : undefined
            };

            await apiFetch("/custom-fields", {
                method: "POST",
                body: JSON.stringify(payload),
            });

            toast.success("Field created successfully");
            handleClose();
            onSuccess();
        } catch (error: any) {
            toast.error(error.message || "Failed to create field");
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                Add Field
            </Button>

            <StandardDialog
                open={open}
                onClose={handleClose}
                title="Add Custom Field"
                subtitle={`Define a new field for ${objectType}.`}
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="outline" onClick={handleClose}>
                            Cancel
                        </Button>
                        <Button type="submit" form="create-field-form" disabled={loading}>
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {loading ? "Saving..." : "Save"}
                        </Button>
                    </>
                }
            >
                <form id="create-field-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <Controller
                        name="label"
                        control={control}
                        render={({ field }) => (
                            <div className="space-y-2">
                                <Label htmlFor="field-label">Label</Label>
                                <Input
                                    id="field-label"
                                    placeholder="e.g. Budget"
                                    {...field}
                                    onChange={(e) => {
                                        field.onChange(e);
                                        handleLabelChange(e.target.value);
                                    }}
                                />
                                {errors.label && <p className="text-xs text-destructive">{errors.label.message}</p>}
                            </div>
                        )}
                    />

                    <Controller
                        name="key"
                        control={control}
                        render={({ field }) => (
                            <div className="space-y-2">
                                <Label htmlFor="field-key">Key (Database Name)</Label>
                                <Input id="field-key" placeholder="e.g. budget_amount" {...field} />
                                <p className="text-xs text-muted-foreground">
                                    {errors.key?.message || "Unique identifier used in API."}
                                </p>
                            </div>
                        )}
                    />

                    <Controller
                        name="type"
                        control={control}
                        render={({ field }) => (
                            <div className="space-y-2">
                                <Label>Type</Label>
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {fieldTypes.map((type) => (
                                            <SelectItem key={type} value={type}>{type}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
                            </div>
                        )}
                    />

                    {(watchType === 'DROPDOWN' || watchType === 'MULTI_SELECT') && (
                        <Controller
                            name="options"
                            control={control}
                            render={({ field }) => (
                                <div className="space-y-2">
                                    <Label htmlFor="field-options">Options (Comma Separated)</Label>
                                    <Input id="field-options" placeholder="Option A, Option B" {...field} />
                                    {errors.options && <p className="text-xs text-destructive">{errors.options.message}</p>}
                                </div>
                            )}
                        />
                    )}

                    <Controller
                        name="required"
                        control={control}
                        render={({ field }) => (
                            <label className="flex items-center gap-2 text-sm font-medium">
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                Required Field
                            </label>
                        )}
                    />
                </form>
            </StandardDialog>
        </>
    );
}
