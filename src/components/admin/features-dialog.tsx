"use client";

import { useEffect, useState } from "react";
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Switch,
    FormControlLabel,
    Stack,
    Typography,
    Box,
    CircularProgress
} from "@mui/material";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";

interface FeaturesDialogProps {
    tenantId: string;
    tenantName: string;
    trigger?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function FeaturesDialog({
    tenantId,
    tenantName,
    trigger,
    open: controlledOpen,
    onOpenChange,
}: FeaturesDialogProps) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    // Features state
    const [features, setFeatures] = useState({
        opportunityEnabled: true,
        automationEnabled: true,
        salesGroupsEnabled: true,
        formBuilderEnabled: true,
        advancedReporting: false,
        apiAccessEnabled: false,
    });
    const { token } = useAuth();

    // Handle controlled/uncontrolled state
    const isOpen = controlledOpen ?? open;
    const setIsOpen = (newOpen: boolean) => {
        if (onOpenChange) {
            onOpenChange(newOpen);
        } else {
            setOpen(newOpen);
        }
    };

    const handleOpen = () => setIsOpen(true);
    const handleClose = () => setIsOpen(false);

    useEffect(() => {
        if (isOpen && tenantId && token) {
            fetchFeatures();
        }
    }, [isOpen, tenantId, token]);

    const fetchFeatures = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/platform-admin/tenants/${tenantId}/feature-flags`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                // Merge with defaults to ensure all keys exist
                setFeatures((prev) => ({ ...prev, ...data }));
            } else {
                toast.error("Failed to fetch features");
            }
        } catch (error) {
            toast.error("Failed to load features");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/platform-admin/tenants/${tenantId}/feature-flags`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(features),
            });

            if (res.ok) {
                toast.success("Features updated successfully");
                setIsOpen(false);
            } else {
                toast.error("Failed to update features");
            }
        } catch (error) {
            toast.error("Failed to save changes");
        } finally {
            setSaving(false);
        }
    };

    const toggleFeature = (key: keyof typeof features) => {
        setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <>
            {trigger && <Box component="span" onClick={handleOpen}>{trigger}</Box>}
            <Dialog
                open={isOpen}
                onClose={handleClose}
                maxWidth="xs"
                fullWidth
                PaperProps={{
                    sx: { borderRadius: 3 }
                }}
            >
                <DialogTitle>Manage Features</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 2 }}>
                        Toggle features for <strong>{tenantName}</strong>.
                    </DialogContentText>

                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <CircularProgress size={24} />
                        </Box>
                    ) : (
                        <Stack spacing={2}>
                            <FeatureSwitch
                                label="Opportunities"
                                checked={features.opportunityEnabled}
                                onChange={() => toggleFeature("opportunityEnabled")}
                            />
                            <FeatureSwitch
                                label="Automations"
                                checked={features.automationEnabled}
                                onChange={() => toggleFeature("automationEnabled")}
                            />
                            <FeatureSwitch
                                label="Sales Groups"
                                checked={features.salesGroupsEnabled}
                                onChange={() => toggleFeature("salesGroupsEnabled")}
                            />
                            <FeatureSwitch
                                label="Form Builder"
                                checked={features.formBuilderEnabled}
                                onChange={() => toggleFeature("formBuilderEnabled")}
                            />
                            <FeatureSwitch
                                label="Advanced Reporting"
                                checked={features.advancedReporting}
                                onChange={() => toggleFeature("advancedReporting")}
                            />
                            <FeatureSwitch
                                label="API Access"
                                checked={features.apiAccessEnabled}
                                onChange={() => toggleFeature("apiAccessEnabled")}
                            />
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button onClick={handleClose} sx={{ borderRadius: 20, color: 'text.secondary' }} disabled={saving}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        variant="contained"
                        disabled={saving || loading}
                        sx={{ borderRadius: 20 }}
                    >
                        {saving ? "Saving..." : "Save Changes"}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

function FeatureSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
    return (
        <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2">{label}</Typography>
            <Switch checked={checked} onChange={onChange} color="primary" />
        </Stack>
    );
}
