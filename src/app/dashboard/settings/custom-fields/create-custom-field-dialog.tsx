"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    FormControlLabel,
    Checkbox,
    Stack,
    FormHelperText
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";

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
            options: ""
        },
    });

    const watchType = watch("type");

    const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const label = e.target.value;
        const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        setValue("label", label);
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
                    ? values.options.split(',').map((s: string) => s.trim()).filter(Boolean)
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
            <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setOpen(true)}
                sx={{ borderRadius: 20 }}
            >
                Add Field
            </Button>

            <Dialog
                open={open}
                onClose={handleClose}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: { borderRadius: 3 }
                }}
            >
                <DialogTitle>Add Custom Field</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 3 }}>
                        Define a new field for {objectType}.
                    </DialogContentText>

                    <form id="create-field-form" onSubmit={handleSubmit(onSubmit)}>
                        <Stack spacing={3}>
                            <Controller
                                name="label"
                                control={control}
                                render={({ field }) => (
                                    <TextField
                                        {...field}
                                        label="Label"
                                        placeholder="e.g. Budget"
                                        fullWidth
                                        onChange={(e: any) => {
                                            field.onChange(e);
                                            handleLabelChange(e);
                                        }}
                                        error={!!errors.label}
                                        helperText={errors.label?.message as string}
                                    />
                                )}
                            />

                            <Controller
                                name="key"
                                control={control}
                                render={({ field }) => (
                                    <TextField
                                        {...field}
                                        label="Key (Database Name)"
                                        placeholder="e.g. budget_amount"
                                        fullWidth
                                        helperText={(errors.key?.message as string) || "Unique identifier used in API."}
                                        error={!!errors.key}
                                    />
                                )}
                            />

                            <Controller
                                name="type"
                                control={control}
                                render={({ field }) => (
                                    <FormControl fullWidth error={!!errors.type}>
                                        <InputLabel>Type</InputLabel>
                                        <Select
                                            {...field}
                                            label="Type"
                                        >
                                            {fieldTypes.map((type) => (
                                                <MenuItem key={type} value={type}>
                                                    {type}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                        <FormHelperText>{errors.type?.message as string}</FormHelperText>
                                    </FormControl>
                                )}
                            />

                            {(watchType === 'DROPDOWN' || watchType === 'MULTI_SELECT') && (
                                <Controller
                                    name="options"
                                    control={control}
                                    render={({ field }) => (
                                        <TextField
                                            {...field}
                                            label="Options (Comma Separated)"
                                            placeholder="Option A, Option B"
                                            fullWidth
                                            error={!!errors.options}
                                            helperText={errors.options?.message as string}
                                        />
                                    )}
                                />
                            )}

                            <Controller
                                name="required"
                                control={control}
                                render={({ field }) => (
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={field.value}
                                                onChange={field.onChange}
                                            />
                                        }
                                        label="Required Field"
                                    />
                                )}
                            />
                        </Stack>
                    </form>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button onClick={handleClose} sx={{ borderRadius: 20, color: 'text.secondary' }}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form="create-field-form"
                        variant="contained"
                        disabled={loading}
                        sx={{ borderRadius: 20 }}
                    >
                        {loading ? "Saving..." : "Save"}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
