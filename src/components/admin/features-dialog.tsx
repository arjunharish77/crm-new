"use client";

import { ReactNode, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/providers/auth-provider";

interface FeaturesDialogProps {
    tenantId: string;
    tenantName: string;
    trigger?: ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

const FEATURE_LABELS = [
    ["opportunityEnabled", "Opportunities"],
    ["automationEnabled", "Automations"],
    ["salesGroupsEnabled", "Sales Groups"],
    ["formBuilderEnabled", "Form Builder"],
    ["advancedReporting", "Advanced Reporting"],
    ["apiAccessEnabled", "API Access"],
] as const;

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
    const [features, setFeatures] = useState({
        opportunityEnabled: true,
        automationEnabled: true,
        salesGroupsEnabled: true,
        formBuilderEnabled: true,
        advancedReporting: true,
        apiAccessEnabled: false,
    });
    const { token } = useAuth();

    const isOpen = controlledOpen ?? open;
    const setIsOpen = (newOpen: boolean) => {
        if (onOpenChange) {
            onOpenChange(newOpen);
        } else {
            setOpen(newOpen);
        }
    };

    useEffect(() => {
        if (isOpen && tenantId && token) {
            fetchFeatures();
        }
    }, [isOpen, tenantId, token]);

    const fetchFeatures = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/platform-admin/tenants/${tenantId}/feature-flags`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
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
            const res = await fetch(`/api/platform-admin/tenants/${tenantId}/feature-flags`, {
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
            {trigger ? (
                <span className="inline-flex" onClick={() => setIsOpen(true)}>
                    {trigger}
                </span>
            ) : null}
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>Manage Features</DialogTitle>
                        <DialogDescription>
                            Toggle features for <strong>{tenantName}</strong>.
                        </DialogDescription>
                    </DialogHeader>

                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {FEATURE_LABELS.map(([key, label]) => (
                                <FeatureSwitch
                                    key={key}
                                    label={label}
                                    checked={features[key]}
                                    onChange={() => toggleFeature(key)}
                                />
                            ))}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsOpen(false)} disabled={saving}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={saving || loading}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {saving ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function FeatureSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
            <Label className="text-sm font-medium">{label}</Label>
            <Switch checked={checked} onCheckedChange={onChange} />
        </div>
    );
}
