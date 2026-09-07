"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

type Outcome = {
    id: string;
    groupId: string;
    parentOutcomeId: string | null;
    name: string;
    isActive: boolean;
    requiredFields: string[];
};

type Group = {
    id: string;
    name: string;
    isActive: boolean;
    outcomes: Outcome[];
};

const INTEREST_LEVELS = ["HOT", "WARM", "COLD"] as const;

export function LogCallOutcomeDialog({
    open,
    onClose,
    leadId,
    opportunityId,
    callLogId,
    campaignMemberId,
    restrictToGroupId,
    onLogged,
}: {
    open: boolean;
    onClose: () => void;
    leadId?: string | null;
    opportunityId?: string | null;
    callLogId?: string | null;
    // When logging a campaign call, the campaign's own disposition set is used automatically
    // and the group selector is skipped -- the agent picks straight from that set's outcomes.
    campaignMemberId?: string | null;
    restrictToGroupId?: string | null;
    onLogged?: () => void;
}) {
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(true);
    const [groupId, setGroupId] = useState(restrictToGroupId ?? "");
    const [outcomeId, setOutcomeId] = useState("");
    const [subOutcomeId, setSubOutcomeId] = useState("");
    const [reasonLost, setReasonLost] = useState("");
    const [interestLevel, setInterestLevel] = useState("");
    const [nextAction, setNextAction] = useState("");
    const [callbackAt, setCallbackAt] = useState("");
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        apiFetch<Group[]>("/disposition-groups")
            .then((data) => setGroups((Array.isArray(data) ? data : []).filter((g) => g.isActive)))
            .catch(() => toast.error("Failed to load call dispositions"))
            .finally(() => setLoading(false));
    }, [open]);

    const activeGroup = groups.find((g) => g.id === groupId) ?? null;
    const topLevelOutcomes = (activeGroup?.outcomes ?? []).filter((o) => !o.parentOutcomeId && o.isActive);
    const selectedOutcome = topLevelOutcomes.find((o) => o.id === outcomeId) ?? null;
    const subOutcomes = (activeGroup?.outcomes ?? []).filter((o) => o.parentOutcomeId === outcomeId && o.isActive);
    const effectiveOutcome = subOutcomes.find((o) => o.id === subOutcomeId) ?? selectedOutcome;
    const requiredFields = effectiveOutcome?.requiredFields ?? [];

    const reset = () => {
        setGroupId(restrictToGroupId ?? "");
        setOutcomeId("");
        setSubOutcomeId("");
        setReasonLost("");
        setInterestLevel("");
        setNextAction("");
        setCallbackAt("");
        setNotes("");
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const save = async () => {
        if (!effectiveOutcome) {
            toast.error("Select a disposition outcome");
            return;
        }
        for (const field of requiredFields) {
            const value = { reasonLost, interestLevel, nextAction, callbackAt, notes }[field];
            if (!value) {
                toast.error(`This outcome requires ${field}`);
                return;
            }
        }
        setSaving(true);
        try {
            await apiFetch("/call-dispositions", {
                method: "POST",
                body: JSON.stringify({
                    leadId: leadId || null,
                    opportunityId: opportunityId || null,
                    callLogId: callLogId || null,
                    dispositionOutcomeId: effectiveOutcome.id,
                    reasonLost: reasonLost || null,
                    interestLevel: interestLevel || null,
                    nextAction: nextAction || null,
                    callbackAt: callbackAt ? new Date(callbackAt).toISOString() : null,
                    notes: notes || null,
                    campaignMemberId: campaignMemberId || null,
                }),
            });
            toast.success("Call outcome logged");
            onLogged?.();
            handleClose();
        } catch (error: any) {
            toast.error(error?.message || "Failed to log call outcome");
        } finally {
            setSaving(false);
        }
    };

    return (
        <StandardDialog
            open={open}
            onClose={handleClose}
            title="Log Call Outcome"
            subtitle="Record what happened on this call"
            maxWidth="sm"
            actions={
                <>
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button disabled={saving || loading || !effectiveOutcome} onClick={save}>
                        {saving ? "Saving..." : "Log Outcome"}
                    </Button>
                </>
            }
        >
            <div className="space-y-3 p-[18px] pt-1">
                {loading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                ) : groups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No call disposition groups configured yet. Ask an admin to set them up under Settings &gt; Call Dispositions.
                    </p>
                ) : (
                    <>
                        {!restrictToGroupId && (
                            <div className="space-y-1.5">
                                <Label>Disposition Group</Label>
                                <Select
                                    value={groupId}
                                    onValueChange={(value) => {
                                        setGroupId(value);
                                        setOutcomeId("");
                                        setSubOutcomeId("");
                                    }}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select a group" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {groups.map((group) => (
                                            <SelectItem key={group.id} value={group.id}>
                                                {group.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {groupId && (
                            <div className="space-y-1.5">
                                <Label>Outcome</Label>
                                <Select
                                    value={outcomeId}
                                    onValueChange={(value) => {
                                        setOutcomeId(value);
                                        setSubOutcomeId("");
                                    }}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select an outcome" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {topLevelOutcomes.map((outcome) => (
                                            <SelectItem key={outcome.id} value={outcome.id}>
                                                {outcome.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {outcomeId && subOutcomes.length > 0 && (
                            <div className="space-y-1.5">
                                <Label>Sub-Outcome</Label>
                                <Select value={subOutcomeId} onValueChange={setSubOutcomeId}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select a sub-outcome" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {subOutcomes.map((outcome) => (
                                            <SelectItem key={outcome.id} value={outcome.id}>
                                                {outcome.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {effectiveOutcome && (
                            <>
                                <div className="space-y-1.5">
                                    <Label>
                                        Interest Level {requiredFields.includes("interestLevel") && <span className="text-destructive">*</span>}
                                    </Label>
                                    <Select value={interestLevel} onValueChange={setInterestLevel}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Not captured" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {INTEREST_LEVELS.map((level) => (
                                                <SelectItem key={level} value={level}>
                                                    {level}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Next Action {requiredFields.includes("nextAction") && <span className="text-destructive">*</span>}</Label>
                                    <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="e.g. Send proposal" />
                                </div>

                                <div className="space-y-1.5">
                                    <Label>
                                        Callback Date/Time {requiredFields.includes("callbackAt") && <span className="text-destructive">*</span>}
                                    </Label>
                                    <Input type="datetime-local" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} />
                                    <p className="text-xs text-muted-foreground">Setting this creates a Task due at this time.</p>
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Reason Lost {requiredFields.includes("reasonLost") && <span className="text-destructive">*</span>}</Label>
                                    <Input value={reasonLost} onChange={(e) => setReasonLost(e.target.value)} placeholder="Only if this call ended the deal" />
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Notes {requiredFields.includes("notes") && <span className="text-destructive">*</span>}</Label>
                                    <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </StandardDialog>
    );
}
