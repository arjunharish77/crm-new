"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

interface BulkUpdateStatusDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentSelection: string[];
    onSuccess: () => void;
}

export function BulkUpdateStatusDialog({
    open,
    onOpenChange,
    currentSelection,
    onSuccess,
}: BulkUpdateStatusDialogProps) {
    const [status, setStatus] = useState<string>("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!status) return;
        setLoading(true);
        try {
            await apiFetch("/leads/bulk", {
                method: "PATCH",
                body: JSON.stringify({
                    ids: currentSelection,
                    updates: { status },
                }),
            });
            toast.success("Leads improved successfully");
            onSuccess();
            onOpenChange(false);
        } catch (error) {
            toast.error("Failed to update status");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Update Status</DialogTitle>
                    <DialogDescription>
                        Update status for {currentSelection.length} selected leads.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select new status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="NEW">New</SelectItem>
                            <SelectItem value="CONTACTED">Contacted</SelectItem>
                            <SelectItem value="QUALIFIED">Qualified</SelectItem>
                            <SelectItem value="LOST">Lost</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={loading}
                    >
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={loading || !status}>
                        {loading ? "Updating..." : "Update Leads"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
