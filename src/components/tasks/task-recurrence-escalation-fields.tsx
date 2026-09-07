"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type RecurrenceRule = {
    frequency: "DAILY" | "WEEKLY" | "MONTHLY";
    anchor?: "DUE_DATE" | "COMPLETION_DATE";
    endDate?: string | null;
};

export type RecurrenceEscalationValue = {
    recurrenceRule: RecurrenceRule | null;
    escalateAfterMinutes: number | null;
    escalateToUserId: string | null;
};

interface TaskRecurrenceEscalationFieldsProps {
    value: RecurrenceEscalationValue;
    onChange: (value: RecurrenceEscalationValue) => void;
    users: Array<{ id: string; name?: string | null; email?: string | null }>;
}

const NONE_FREQUENCY = "__none__";
const NONE_USER = "__none__";

export function TaskRecurrenceEscalationFields({ value, onChange, users }: TaskRecurrenceEscalationFieldsProps) {
    const rule = value.recurrenceRule;

    return (
        <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
                <Label>Repeat</Label>
                <Select
                    value={rule?.frequency ?? NONE_FREQUENCY}
                    onValueChange={(frequency) =>
                        onChange({
                            ...value,
                            recurrenceRule: frequency === NONE_FREQUENCY ? null : { anchor: "DUE_DATE", ...rule, frequency: frequency as RecurrenceRule["frequency"] },
                        })
                    }
                >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value={NONE_FREQUENCY}>Does not repeat</SelectItem>
                        <SelectItem value="DAILY">Daily</SelectItem>
                        <SelectItem value="WEEKLY">Weekly</SelectItem>
                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                    </SelectContent>
                </Select>
                {rule && (
                    <p className="text-xs text-muted-foreground">
                        Completing (or skipping) this task creates the next one automatically.
                    </p>
                )}
            </div>
            {rule && (
                <div className="space-y-2">
                    <Label>Based on</Label>
                    <Select
                        value={rule.anchor ?? "DUE_DATE"}
                        onValueChange={(anchor) => onChange({ ...value, recurrenceRule: { ...rule, anchor: anchor as RecurrenceRule["anchor"] } })}
                    >
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="DUE_DATE">Original due date (stable cadence)</SelectItem>
                            <SelectItem value="COMPLETION_DATE">When it&apos;s actually finished</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            )}
            <div className="space-y-2">
                <Label>Escalate if not done after (minutes)</Label>
                <Input
                    type="number"
                    min={0}
                    placeholder="No escalation"
                    value={value.escalateAfterMinutes ?? ""}
                    onChange={(e) => onChange({ ...value, escalateAfterMinutes: e.target.value ? Number(e.target.value) : null })}
                />
                <p className="text-xs text-muted-foreground">Counted from when the reminder fires, not from the due date.</p>
            </div>
            <div className="space-y-2">
                <Label>Escalate to</Label>
                <Select
                    value={value.escalateToUserId ?? NONE_USER}
                    onValueChange={(userId) => onChange({ ...value, escalateToUserId: userId === NONE_USER ? null : userId })}
                >
                    <SelectTrigger className="w-full"><SelectValue placeholder="No one" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value={NONE_USER}>No one</SelectItem>
                        {users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>{user.name || user.email || "User"}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
