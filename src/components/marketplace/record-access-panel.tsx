"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState } from "@/components/common/error-state";
import { humanizeEnum } from "@/lib/display/status";

type RecordAccess = "ALL" | "OWN" | "TEAM";
type FieldAccess = "readonly" | "hidden";

// GET/PATCH /api/marketplace/installs/[id]/record-scope. Narrows what the app can see on top of
// its module grants: OWN/TEAM act as the chosen user (or that user's team), and field rules use
// the same shape as a role's fieldPermissions, e.g. { leads: { email: "hidden" } }.
type RecordScope = {
    recordAccess: RecordAccess;
    ownerUserId: string | null;
    fieldPermissions: Record<string, unknown> | null;
};

type UserOption = { id: string; name?: string | null; email?: string | null };
type FieldRule = { key: number; module: string; field: string; access: FieldAccess };

const RECORD_ACCESS_OPTIONS: Array<{ value: RecordAccess; label: string; description: string }> = [
    { value: "ALL", label: "All records", description: "The app sees every record its module permissions allow." },
    { value: "OWN", label: "Records one user owns", description: "The app only sees records owned by the user below." },
    { value: "TEAM", label: "Records a user's team owns", description: "The app only sees records owned by the user below or their team." },
];

// The modules the app API applies field rules to, with the fields an admin most often restricts.
// A rule saved earlier for a field outside this list is kept and shown as is.
const FIELD_MODULES: Record<string, string[]> = {
    leads: ["name", "email", "phone", "company", "source", "status", "score", "tags", "ownerId"],
    opportunities: ["title", "amount", "expectedCloseDate", "priority", "stageId", "leadId", "tags", "ownerId"],
};

const FIELD_ACCESS_LABEL: Record<FieldAccess, string> = { readonly: "Read only", hidden: "Hidden" };

function rulesFromScope(fieldPermissions: Record<string, unknown> | null): FieldRule[] {
    const rules: FieldRule[] = [];
    if (!fieldPermissions || typeof fieldPermissions !== "object") return rules;
    for (const [module, fields] of Object.entries(fieldPermissions)) {
        if (!fields || typeof fields !== "object" || Array.isArray(fields)) continue;
        for (const [field, access] of Object.entries(fields as Record<string, unknown>)) {
            if (access === "readonly" || access === "hidden") rules.push({ key: rules.length, module, field, access });
        }
    }
    return rules;
}

function scopeFromRules(rules: FieldRule[]): Record<string, Record<string, FieldAccess>> | null {
    const result: Record<string, Record<string, FieldAccess>> = {};
    for (const rule of rules) {
        if (!rule.field) continue;
        result[rule.module] = { ...(result[rule.module] ?? {}), [rule.field]: rule.access };
    }
    return Object.keys(result).length ? result : null;
}

function fieldLabel(field: string) {
    // camelCase field keys ("expectedCloseDate") read as words in the picker.
    return humanizeEnum(field.replace(/([a-z])([A-Z])/g, "$1_$2"));
}

export function RecordAccessPanel({ installId }: { installId: string }) {
    const [saved, setSaved] = useState<RecordScope | null>(null);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [recordAccess, setRecordAccess] = useState<RecordAccess>("ALL");
    const [ownerUserId, setOwnerUserId] = useState<string>("");
    const [rules, setRules] = useState<FieldRule[]>([]);
    const [nextKey, setNextKey] = useState(0);
    const [saving, setSaving] = useState(false);

    const applyScope = useCallback((scope: RecordScope) => {
        const loadedRules = rulesFromScope(scope.fieldPermissions);
        setSaved(scope);
        setRecordAccess(scope.recordAccess ?? "ALL");
        setOwnerUserId(scope.ownerUserId ?? "");
        setRules(loadedRules);
        setNextKey(loadedRules.length);
    }, []);

    const load = useCallback(() => {
        setLoading(true);
        setLoadError(null);
        Promise.all([
            apiFetch<RecordScope>(`/marketplace/installs/${installId}/record-scope`),
            // The user list only fills the owner picker; the scope can still be read without it.
            apiFetch<UserOption[]>("/users").catch(() => [] as UserOption[]),
        ])
            .then(([scope, usersData]) => {
                applyScope(scope);
                setUsers(Array.isArray(usersData) ? usersData : []);
            })
            .catch((error: { message?: string }) => setLoadError(error?.message || "The record access settings couldn't be loaded."))
            .finally(() => setLoading(false));
    }, [installId, applyScope]);

    useEffect(() => { load(); }, [load]);

    if (loading) return <p role="status" className="py-6 text-sm text-muted-foreground">Loading record access…</p>;
    if (loadError || !saved) return <ErrorState variant="inline" description={loadError ?? "The record access settings couldn't be loaded."} onRetry={load} />;

    const draftFieldPermissions = scopeFromRules(rules);
    const draftOwner = recordAccess === "ALL" ? null : ownerUserId || null;
    const dirty =
        recordAccess !== (saved.recordAccess ?? "ALL") ||
        (recordAccess !== "ALL" && draftOwner !== (saved.ownerUserId ?? null)) ||
        JSON.stringify(draftFieldPermissions) !== JSON.stringify(scopeFromRules(rulesFromScope(saved.fieldPermissions)));
    const needsOwner = recordAccess !== "ALL" && !ownerUserId;
    const ownerKnown = !ownerUserId || users.some((user) => user.id === ownerUserId);

    const save = async () => {
        setSaving(true);
        try {
            const updated = await apiFetch<RecordScope>(`/marketplace/installs/${installId}/record-scope`, {
                method: "PATCH",
                body: JSON.stringify({ recordAccess, ownerUserId: draftOwner, fieldPermissions: draftFieldPermissions }),
            });
            applyScope(updated);
            toast.success("Record access saved");
        } catch (error: any) {
            toast.error(error?.message || "Record access couldn't be saved");
        } finally {
            setSaving(false);
        }
    };

    const addRule = () => {
        setRules((current) => [...current, { key: nextKey, module: "leads", field: "", access: "hidden" }]);
        setNextKey((key) => key + 1);
    };
    const updateRule = (key: number, patch: Partial<FieldRule>) => setRules((current) => current.map((rule) => (rule.key === key ? { ...rule, ...patch } : rule)));
    const removeRule = (key: number) => setRules((current) => current.filter((rule) => rule.key !== key));

    return (
        <div className="space-y-5">
            <p className="text-xs text-muted-foreground">
                Narrow which records and fields this app can reach, on top of its module permissions. It applies to every app API request.
            </p>

            <div className="space-y-1.5">
                <Label htmlFor={`record-access-${installId}`}>Records the app can see</Label>
                <Select value={recordAccess} onValueChange={(value) => setRecordAccess(value as RecordAccess)}>
                    <SelectTrigger id={`record-access-${installId}`} className="w-full sm:w-72"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {RECORD_ACCESS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{RECORD_ACCESS_OPTIONS.find((option) => option.value === recordAccess)?.description}</p>
            </div>

            {recordAccess !== "ALL" && (
                <div className="space-y-1.5">
                    <Label htmlFor={`record-access-owner-${installId}`}>Acts as user</Label>
                    <Select value={ownerUserId} onValueChange={setOwnerUserId}>
                        <SelectTrigger id={`record-access-owner-${installId}`} className="w-full sm:w-72" aria-invalid={needsOwner || undefined}>
                            <SelectValue placeholder="Choose a user" />
                        </SelectTrigger>
                        <SelectContent>
                            {!ownerKnown && <SelectItem value={ownerUserId}>Unknown user ({ownerUserId})</SelectItem>}
                            {users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name || user.email || user.id}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <p className={needsOwner ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                        {needsOwner ? "Choose the user whose records the app can see." : "The app sees the records this user would own."}
                    </p>
                </div>
            )}

            <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <p className="text-sm font-medium">Field rules</p>
                        <p className="text-xs text-muted-foreground">Hidden fields come back empty. Read-only fields are ignored when the app writes.</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={addRule}>
                        <Plus className="size-3.5" />
                        Add field rule
                    </Button>
                </div>
                {rules.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">No field rules. The app sees every field on the records it can reach.</p>
                ) : (
                    <ul className="space-y-2">
                        {rules.map((rule) => {
                            const knownFields = FIELD_MODULES[rule.module] ?? [];
                            const fieldOptions = rule.field && !knownFields.includes(rule.field) ? [rule.field, ...knownFields] : knownFields;
                            const moduleOptions = FIELD_MODULES[rule.module] ? Object.keys(FIELD_MODULES) : [rule.module, ...Object.keys(FIELD_MODULES)];
                            return (
                                <li key={rule.key} className="flex min-w-0 flex-wrap items-center gap-2">
                                    <Select value={rule.module} onValueChange={(value) => updateRule(rule.key, { module: value, field: "" })}>
                                        <SelectTrigger className="w-40" aria-label="Module"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {moduleOptions.map((module) => <SelectItem key={module} value={module}>{humanizeEnum(module)}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Select value={rule.field} onValueChange={(value) => updateRule(rule.key, { field: value })}>
                                        <SelectTrigger className="w-44" aria-label="Field" aria-invalid={!rule.field || undefined}><SelectValue placeholder="Choose a field" /></SelectTrigger>
                                        <SelectContent>
                                            {fieldOptions.map((field) => <SelectItem key={field} value={field}>{fieldLabel(field)}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Select value={rule.access} onValueChange={(value) => updateRule(rule.key, { access: value as FieldAccess })}>
                                        <SelectTrigger className="w-32" aria-label="Access"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {(Object.keys(FIELD_ACCESS_LABEL) as FieldAccess[]).map((access) => <SelectItem key={access} value={access}>{FIELD_ACCESS_LABEL[access]}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Button variant="ghost" size="icon-sm" aria-label="Remove field rule" onClick={() => removeRule(rule.key)}>
                                        <Trash2 className="size-4" />
                                    </Button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
                {dirty && (
                    <Button variant="outline" disabled={saving} onClick={() => applyScope(saved)}>
                        Discard changes
                    </Button>
                )}
                <Button isLoading={saving} disabled={!dirty || needsOwner || rules.some((rule) => !rule.field)} onClick={save}>
                    Save record access
                </Button>
            </div>
        </div>
    );
}
