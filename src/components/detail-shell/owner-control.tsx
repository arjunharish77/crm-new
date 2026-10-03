"use client";

import { useState } from "react";
import { ChevronDown, UserRound } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StandardDialog } from "@/components/common/standard-dialog";
import { RecordPicker, type PickedRecord } from "@/components/common/record-picker";

// Owner in the record header (UI/UX plan §11.4 "Reassign owner": 3 clicks; decision 17: reason
// optional for one record). Uses the governed reassignment, so the assignment log, the previous
// owner's notification and any approval rule all apply.
export function OwnerControl({ entityType, entityId, ownerId, ownerName, onChanged }: {
    entityType: "LEAD" | "OPPORTUNITY";
    entityId: string;
    ownerId: string | null | undefined;
    ownerName: string | null | undefined;
    onChanged: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [picked, setPicked] = useState<PickedRecord | null>(null);
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);

    const save = async () => {
        if (!picked) return;
        setSaving(true);
        try {
            const result = await apiFetch<any>("/assignment/reassign", {
                method: "POST",
                body: JSON.stringify({ entityType, entityId, newOwnerId: picked.id, reason: reason.trim() || undefined }),
            });
            if (result?.pendingApproval) toast.success(`Reassignment to ${picked.label} sent for approval`);
            else toast.success(`Owner changed to ${picked.label}`);
            setOpen(false);
            onChanged();
        } catch (error: any) {
            toast.error(error?.message || "Couldn't change the owner");
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-muted-foreground"
                aria-label={`Owner: ${ownerName || "unassigned"}. Change owner`}
                onClick={() => { setPicked(null); setReason(""); setOpen(true); }}
            >
                <UserRound className="size-3.5" aria-hidden />
                <span className="max-w-40 truncate">{ownerName || "Unassigned"}</span>
                <ChevronDown className="size-3.5 opacity-70" aria-hidden />
            </Button>
            <StandardDialog
                open={open}
                onClose={() => setOpen(false)}
                title="Change owner"
                maxWidth="xs"
                actions={<>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button disabled={!picked || picked.id === ownerId} isLoading={saving} onClick={save}>Change owner</Button>
                </>}
            >
                <div className="space-y-4 pb-1">
                    <div className="space-y-1.5">
                        <Label htmlFor="owner-control-picker">New owner</Label>
                        <RecordPicker id="owner-control-picker" entity="user" value={picked?.id} allowClear={false} onChange={(_, record) => setPicked(record)} placeholder={ownerName || "Choose a person"} />
                        {picked && picked.id === ownerId ? <p className="text-xs text-muted-foreground">That&apos;s the current owner.</p> : null}
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="owner-control-reason">Reason (optional)</Label>
                        <Textarea id="owner-control-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
                    </div>
                </div>
            </StandardDialog>
        </>
    );
}
