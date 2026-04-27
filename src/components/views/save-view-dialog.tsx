"use client";

import { useEffect, useState } from "react";
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Stack,
    Switch,
    TextField,
    Typography,
} from "@mui/material";
import { FilterConfig } from "@/types/filters";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

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
    const [name, setName] = useState("");
    const [isDefault, setIsDefault] = useState(false);
    const [isShared, setIsShared] = useState(false);

    useEffect(() => {
        if (!open) {
            setName("");
            setIsDefault(false);
            setIsShared(false);
        }
    }, [open]);

    const onSubmit = async () => {
        if (name.trim().length < 2) {
            toast.error("View name is required");
            return;
        }

        setLoading(true);
        try {
            const savedView = await apiFetch("/saved-views", {
                method: "POST",
                body: JSON.stringify({
                    name: name.trim(),
                    isDefault,
                    isShared,
                    module,
                    filters,
                }),
            });
            toast.success("View saved successfully");
            onSuccess(savedView);
            onOpenChange(false);
        } catch {
            toast.error("Failed to save view");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={() => onOpenChange(false)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ pb: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 900 }}>Save View</Typography>
                <Typography variant="body2" color="text.secondary">
                    Save the current filters as a named view.
                </Typography>
            </DialogTitle>
            <DialogContent>
                <Stack spacing={1.5} sx={{ mt: 1 }}>
                    <TextField
                        label="View Name"
                        placeholder="Hot leads in NY"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        size="small"
                        fullWidth
                        autoFocus
                    />
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, px: 1.25 }}>
                        <FormControlLabel
                            control={<Switch checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />}
                            label={
                                <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 800 }}>Set as default</Typography>
                                    <Typography variant="caption" color="text.secondary">Load this view automatically for this module.</Typography>
                                </Box>
                            }
                            sx={{ py: 0.5, alignItems: "center", width: "100%", m: 0 }}
                        />
                    </Box>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, px: 1.25 }}>
                        <FormControlLabel
                            control={<Switch checked={isShared} onChange={(event) => setIsShared(event.target.checked)} />}
                            label={
                                <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 800 }}>Share with team</Typography>
                                    <Typography variant="caption" color="text.secondary">Allow other users to see this view.</Typography>
                                </Box>
                            }
                            sx={{ py: 0.5, alignItems: "center", width: "100%", m: 0 }}
                        />
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.25 }}>
                <Button onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
                <Button variant="contained" onClick={onSubmit} disabled={loading}>
                    {loading ? "Saving..." : "Save View"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
