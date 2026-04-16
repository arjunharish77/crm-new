"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
    Button,
    TextField,
    Stack,
} from "@mui/material";
import { Groups as TeamsIcon } from "@mui/icons-material";
import { StandardDialog } from "@/components/common/standard-dialog";

interface CreateTeamDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

const formSchema = z.object({
    name: z.string().min(2, "Team name is required"),
    description: z.string().optional(),
});

export function CreateTeamDialog({
    open,
    onOpenChange,
    onSuccess,
}: CreateTeamDialogProps) {
    const [loading, setLoading] = useState(false);

    const { control, handleSubmit, reset, formState: { errors } } = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            description: "",
        },
    });

    const handleClose = () => {
        onOpenChange(false);
        reset();
    };

    async function onSubmit(values: any) {
        setLoading(true);
        try {
            // Mock API call
            await new Promise(resolve => setTimeout(resolve, 1000));
            // In real implementation: await apiFetch("/teams", { method: "POST", body: JSON.stringify(values) });

            toast.success("Team created successfully");
            handleClose();
            onSuccess();
        } catch (error: any) {
            toast.error(error.message || "Failed to create team");
        } finally {
            setLoading(false);
        }
    }

    return (
        <StandardDialog
            open={open}
            onClose={handleClose}
            title="Create Team"
            subtitle="Add a new functional group for your users."
            icon={<TeamsIcon />}
            actions={
                <>
                    <Button onClick={handleClose} sx={{ color: 'text.secondary' }}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form="create-team-form"
                        variant="contained"
                        disabled={loading}
                    >
                        {loading ? "Creating..." : "Create Team"}
                    </Button>
                </>
            }
        >
            <form id="create-team-form" onSubmit={handleSubmit(onSubmit)}>
                <Stack spacing={3}>
                    <Controller
                        name="name"
                        control={control}
                        render={({ field }) => (
                            <TextField
                                {...field}
                                label="Team Name"
                                placeholder="e.g. Engineering"
                                fullWidth
                                error={!!errors.name}
                                helperText={errors.name?.message as string}
                                autoFocus
                            />
                        )}
                    />

                    <Controller
                        name="description"
                        control={control}
                        render={({ field }) => (
                            <TextField
                                {...field}
                                label="Description"
                                placeholder="Brief description of the team's purpose"
                                fullWidth
                                multiline
                                rows={3}
                                error={!!errors.description}
                                helperText={errors.description?.message as string}
                            />
                        )}
                    />
                </Stack>
            </form>
        </StandardDialog>
    );
}
