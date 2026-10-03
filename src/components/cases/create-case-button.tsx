"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StandardDialog } from "@/components/common/standard-dialog";
import { LifeBuoy } from "lucide-react";
import { Slot } from "@radix-ui/react-slot";

interface CreateCaseButtonProps {
    relatedLeadId?: string;
    relatedOpportunityId?: string;
    requesterName?: string | null;
    requesterEmail?: string | null;
    trigger?: React.ReactNode;
    // Controlled: open from elsewhere (a record's "More" menu); then no trigger is rendered.
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

// Reusable "Create Case" entry point for Lead/Opportunity detail pages -- pre-links the new
// case to whichever record it's opened from, and prefills the requester from that record
// when available. Follows the same trigger-prop convention CreateActivityDialog/
// CreateOpportunityDialog already use, so it drops into the same action-button rows.
export function CreateCaseButton({ relatedLeadId, relatedOpportunityId, requesterName, requesterEmail, trigger, open: controlledOpen, onOpenChange }: CreateCaseButtonProps) {
    const router = useRouter();
    const [internalOpen, setInternalOpen] = useState(false);
    const controlled = controlledOpen !== undefined;
    const open = controlled ? controlledOpen : internalOpen;
    const setOpen = (next: boolean) => (controlled ? onOpenChange?.(next) : setInternalOpen(next));
    const [submitting, setSubmitting] = useState(false);
    const [subject, setSubject] = useState("");
    const [description, setDescription] = useState("");

    const handleCreate = async () => {
        if (!subject.trim()) {
            toast.error("Subject is required");
            return;
        }
        setSubmitting(true);
        try {
            const created = await apiFetch<any>("/cases", {
                method: "POST",
                body: JSON.stringify({
                    subject: subject.trim(),
                    description: description || null,
                    relatedLeadId: relatedLeadId || null,
                    relatedOpportunityId: relatedOpportunityId || null,
                    requesterName: requesterName || null,
                    requesterEmail: requesterEmail || null,
                }),
            });
            toast.success(`Case #${created.caseNumber} created`);
            setOpen(false);
            setSubject("");
            setDescription("");
            router.push(`/dashboard/cases/${created.id}`);
        } catch (error: any) {
            toast.error(error?.message || "Failed to create case");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            {/* Slot, not a <span onClick> (UI/UX plan gap check D6). */}
            {controlled ? null : (
                <Slot onClick={() => setOpen(true)}>
                    {trigger ?? (
                        <Button variant="outline">
                            <LifeBuoy className="size-4" />
                            Create case
                        </Button>
                    )}
                </Slot>
            )}
            <StandardDialog
                open={open}
                onClose={() => setOpen(false)}
                title="Create case"
                icon={<LifeBuoy className="size-5" />}
                maxWidth="xs"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreate} disabled={submitting || !subject.trim()}>
                            {submitting ? "Creating..." : "Create Case"}
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label>Subject</Label>
                        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief summary of the issue" />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Description</Label>
                        <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="More detail about the request" />
                    </div>
                </div>
            </StandardDialog>
        </>
    );
}
