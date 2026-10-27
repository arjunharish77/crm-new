"use client";

import { useEffect, useState } from "react";
import { ListPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { StandardSheet } from "@/components/common/standard-sheet";
import { FormField } from "@/components/common/form-field";
import { SelectField } from "./select-field";
import { EmptyState } from "@/components/common/empty-state";
import { useConfirm } from "@/components/common/dialogs-provider";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FIELD_TYPE_OPTIONS, fieldTypeLabel, type VoiceBotField } from "../types";

type Editing = { field: VoiceBotField | null } | null;

// The bot's fields (decision 19): what it finds out on a call, saved on its activity. Each is a
// custom field of the bot's own activity type, so it shows on the activity and in reports.
// Changes here save straight away.
export function FieldsPanel({ botId, fields, onChanged }: { botId: string; fields: VoiceBotField[]; onChanged: (removedKey?: string) => Promise<void> }) {
    const confirm = useConfirm();
    const [editing, setEditing] = useState<Editing>(null);
    const remove = async (field: VoiceBotField) => {
        const ok = await confirm({
            title: `Delete the field "${field.label}"?`,
            description: "The bot stops asking for it, and its mappings and step links are removed. Values already saved on past calls stay in their history.",
            confirmLabel: "Delete field",
            destructive: true,
        });
        if (!ok) return;
        try {
            await apiFetch(`/voice-bots/${botId}/fields/${field.id}`, { method: "DELETE" });
            toast.success(`${field.label} deleted`);
            await onChanged(field.key);
        } catch (error: any) {
            toast.error(error?.message || "The field couldn't be deleted");
        }
    };
    return (
        <div className="space-y-4 py-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h2 className="text-base font-semibold">Fields</h2>
                    <p className="max-w-2xl text-sm text-muted-foreground">What the bot finds out on a call. Each answer is saved on the bot&apos;s activity, and can be copied to the lead or opportunity in Mapping. Changes here save straight away.</p>
                </div>
                <Button variant="outline" onClick={() => setEditing({ field: null })} disabled={fields.length >= 40}><Plus className="size-4" />Add field</Button>
            </div>
            {fields.length === 0 ? (
                <EmptyState variant="inline" icon={<ListPlus className="size-8 text-muted-foreground" />} title="No fields yet" description="Add what the bot should find out, such as course interest, budget or preferred intake." action={<Button variant="outline" onClick={() => setEditing({ field: null })}><Plus className="size-4" />Add field</Button>} />
            ) : (
                <div className="overflow-x-auto rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Field</TableHead>
                                <TableHead className="hidden sm:table-cell">Type</TableHead>
                                <TableHead className="hidden md:table-cell">How the bot asks</TableHead>
                                <TableHead className="hidden lg:table-cell">Must ask</TableHead>
                                <TableHead className="w-24"><span className="sr-only">Actions</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {fields.map((field) => (
                                <TableRow key={field.id}>
                                    <TableCell className="font-medium">{field.label}</TableCell>
                                    <TableCell className="hidden text-muted-foreground sm:table-cell">{fieldTypeLabel(field.type)}{field.options.length ? ` · ${field.options.length} choices` : ""}</TableCell>
                                    <TableCell className="hidden max-w-96 truncate text-muted-foreground md:table-cell">{field.question || "—"}</TableCell>
                                    <TableCell className="hidden lg:table-cell">{field.mustAsk ? "Yes" : "No"}{field.confirm ? ", repeats back" : ""}</TableCell>
                                    <TableCell>
                                        <div className="flex justify-end">
                                            <IconButton label={`Edit ${field.label}`} onClick={() => setEditing({ field })}><Pencil className="size-4" /></IconButton>
                                            <IconButton label={`Delete ${field.label}`} onClick={() => remove(field)}><Trash2 className="size-4" /></IconButton>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
            <FieldSheet botId={botId} editing={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await onChanged(); }} />
        </div>
    );
}

function FieldSheet({ botId, editing, onClose, onSaved }: { botId: string; editing: Editing; onClose: () => void; onSaved: () => Promise<void> }) {
    const field = editing?.field ?? null;
    const [label, setLabel] = useState("");
    const [type, setType] = useState("TEXT");
    const [options, setOptions] = useState("");
    const [question, setQuestion] = useState("");
    const [mustAsk, setMustAsk] = useState(false);
    const [repeat, setRepeat] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<{ label?: string; options?: string }>({});

    useEffect(() => {
        if (!editing) return;
        setLabel(field?.label ?? ""); setType(field?.type ?? "TEXT"); setOptions((field?.options ?? []).join("\n"));
        setQuestion(field?.question ?? ""); setMustAsk(field?.mustAsk ?? false); setRepeat(field?.confirm ?? false); setErrors({});
    }, [editing, field]);

    const needsOptions = type === "DROPDOWN" || type === "MULTI_SELECT";
    const optionList = options.split("\n").map((option) => option.trim()).filter(Boolean);
    const save = async () => {
        const next: typeof errors = {};
        if (!label.trim()) next.label = "Give the field a name.";
        if (needsOptions && optionList.length < 2) next.options = "Add at least two choices, one per line.";
        setErrors(next);
        if (Object.keys(next).length) return;
        setSaving(true);
        try {
            const body = JSON.stringify({ label: label.trim(), type, options: needsOptions ? optionList : [], question, mustAsk, confirm: repeat });
            if (field) await apiFetch(`/voice-bots/${botId}/fields/${field.id}`, { method: "PATCH", body });
            else await apiFetch(`/voice-bots/${botId}/fields`, { method: "POST", body });
            toast.success(field ? "Field saved" : "Field added");
            await onSaved();
        } catch (error: any) {
            toast.error(error?.message || "The field couldn't be saved");
        } finally {
            setSaving(false);
        }
    };
    return (
        <StandardSheet open={!!editing} onClose={saving ? () => undefined : onClose} title={field ? `Edit ${field.label}` : "Add field"} description="Saved on this bot's activity after every call."
            actions={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={save} isLoading={saving} disabled={saving}>{field ? "Save field" : "Add field"}</Button></>}>
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save(); }}>
                <FormField id="bot-field-label" label="Name" required error={errors.label}>
                    <Input value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} placeholder="Preferred intake" autoFocus />
                </FormField>
                <SelectField id="bot-field-type" label="Type" help={field ? "Changing the type doesn't convert answers already saved." : undefined} value={type} onValueChange={setType}>{FIELD_TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectField>
                {needsOptions ? (
                    <FormField id="bot-field-options" label="Choices" required error={errors.options} help="One per line. The bot maps what the caller says to one of these.">
                        <Textarea rows={5} value={options} onChange={(event) => setOptions(event.target.value)} placeholder={"January 2027\nJuly 2027"} />
                    </FormField>
                ) : null}
                <FormField id="bot-field-question" label="How the bot asks" help="A natural question; the bot adapts it to the caller's language.">
                    <Textarea rows={2} maxLength={500} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Which intake are you planning for?" />
                </FormField>
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="space-y-0.5">
                        <Label htmlFor="bot-field-must">Must ask</Label>
                        <p className="text-xs text-muted-foreground">The bot doesn&apos;t end the call without trying to get this.</p>
                    </div>
                    <Switch id="bot-field-must" checked={mustAsk} onCheckedChange={setMustAsk} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="space-y-0.5">
                        <Label htmlFor="bot-field-confirm">Repeat back before saving</Label>
                        <p className="text-xs text-muted-foreground">For names, numbers and dates, where mishearing is likely.</p>
                    </div>
                    <Switch id="bot-field-confirm" checked={repeat} onCheckedChange={setRepeat} />
                </div>
            </form>
        </StandardSheet>
    );
}
