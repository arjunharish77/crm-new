"use client";

import { useState } from "react";
import {
    Button,
    Dialog,
    DialogContent,
    DialogContentText,
    DialogActions,
    DialogTitle,
    TextField,
    Stack,
    CircularProgress
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

interface SalesGroupDialogProps {
    onSuccess: () => void;
}

export function SalesGroupDialog({ onSuccess }: SalesGroupDialogProps) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({ name: "", description: "" });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            await apiFetch("/sales-groups", {
                method: "POST",
                body: JSON.stringify(form),
            });
            toast.success("Group created");
            setOpen(false);
            setForm({ name: "", description: "" });
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
            <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setOpen(true)}
                sx={{ borderRadius: 20 }}
            >
                Create Group
            </Button>

            <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Create Sales Group</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 3 }}>
                        Create a group to pool leads and manage assignments.
                    </DialogContentText>
                    <form id="create-group-form" onSubmit={handleSubmit}>
                        <Stack spacing={3}>
                            <TextField
                                label="Group Name"
                                placeholder="e.g. Enterprise Sales East"
                                required
                                fullWidth
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                            />
                            <TextField
                                label="Description"
                                placeholder="Optional description"
                                fullWidth
                                multiline
                                rows={2}
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                            />
                        </Stack>
                    </form>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setOpen(false)} color="inherit" sx={{ borderRadius: 20 }}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form="create-group-form"
                        variant="contained"
                        disabled={loading}
                        sx={{ borderRadius: 20 }}
                    >
                        {loading ? "Creating..." : "Create Group"}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
