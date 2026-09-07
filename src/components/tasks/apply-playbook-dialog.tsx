"use client";

import { useEffect, useState } from "react";
import { ClipboardList, CheckCircle2, Loader2 } from "lucide-react";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

interface ApplyPlaybookDialogProps {
    open: boolean;
    onClose: () => void;
    leadId?: string | null;
    opportunityId?: string | null;
    targetModule: "LEAD" | "OPPORTUNITY";
    onApplied?: () => void;
}

export function ApplyPlaybookDialog({ open, onClose, leadId, opportunityId, targetModule, onApplied }: ApplyPlaybookDialogProps) {
    const [playbooks, setPlaybooks] = useState<any[]>([]);
    const [playbookId, setPlaybookId] = useState("");
    const [applying, setApplying] = useState(false);
    const [result, setResult] = useState<{ taskCount: number } | null>(null);

    useEffect(() => {
        if (!open) return;
        setResult(null);
        apiFetch(`/settings/task-playbooks?activeOnly=true&targetModule=${targetModule}`)
            .then((data) => {
                const list = Array.isArray(data) ? data : [];
                setPlaybooks(list);
                setPlaybookId((current) => current || list[0]?.id || "");
            })
            .catch(() => setPlaybooks([]));
    }, [open, targetModule]);

    const handleApply = async () => {
        if (!playbookId) return;
        setApplying(true);
        try {
            const response = await apiFetch(`/task-playbooks/${playbookId}/apply`, {
                method: "POST",
                body: JSON.stringify({ leadId, opportunityId }),
            });
            setResult({ taskCount: Array.isArray(response?.tasks) ? response.tasks.length : 0 });
            onApplied?.();
        } catch (error: any) {
            toast.error(error?.message || "Failed to apply playbook");
        } finally {
            setApplying(false);
        }
    };

    const handleClose = () => {
        onClose();
        setResult(null);
    };

    return (
        <StandardDialog open={open} onClose={handleClose} title="Apply Task Playbook" icon={<ClipboardList className="size-5" />} maxWidth="sm">
            {playbooks.length === 0 ? (
                <Alert>
                    <AlertDescription>
                        No active playbooks apply here yet. Create one under Settings &gt; Task Playbooks.
                    </AlertDescription>
                </Alert>
            ) : result ? (
                <Alert>
                    <CheckCircle2 className="size-4" />
                    <AlertDescription>
                        Created {result.taskCount} task{result.taskCount === 1 ? "" : "s"}.
                    </AlertDescription>
                </Alert>
            ) : (
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label>Playbook</Label>
                        <Select value={playbookId} onValueChange={setPlaybookId}>
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {playbooks.map((playbook) => (
                                    <SelectItem key={playbook.id} value={playbook.id}>
                                        {playbook.name} ({playbook.itemCount} task{playbook.itemCount === 1 ? "" : "s"})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex justify-end">
                        <Button onClick={handleApply} disabled={applying || !playbookId}>
                            {applying ? <Loader2 className="size-4 animate-spin" /> : <ClipboardList className="size-4" />}
                            {applying ? "Applying..." : "Apply Playbook"}
                        </Button>
                    </div>
                </div>
            )}
        </StandardDialog>
    );
}

