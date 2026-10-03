"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { Section } from "@/components/common/section";
import { ErrorState } from "@/components/common/error-state";
import { useConfirm } from "@/components/common/dialogs-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { humanizeEnum } from "@/lib/display/status";

type SensitiveFieldRule = { id: string; moduleName: string; fieldKey: string; createdAt: string };
const MODULES = ["LEADS", "OPPORTUNITIES", "ACTIVITIES", "TASKS", "PARTNERS", "PAYOUTS", "REPORTS", "FORMS"];

// Settings › Security & compliance › Export rules (UI/UX plan §5.17): an export that includes one
// of these fields waits for an admin to approve it. These rules were on the Exports page, which
// everyone can open.
export default function ExportRulesPage() {
    const confirm = useConfirm();
    const [rules, setRules] = useState<SensitiveFieldRule[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [moduleName, setModuleName] = useState(MODULES[0]);
    const [fieldKey, setFieldKey] = useState("");
    const [error, setError] = useState("");
    const [adding, setAdding] = useState(false);

    const load = useCallback(async () => {
        setFailed(false);
        try {
            const data = await apiFetch<SensitiveFieldRule[]>("/exports/sensitive-fields");
            setRules(Array.isArray(data) ? data : []);
        } catch {
            setFailed(true);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const add = async (event: React.FormEvent) => {
        event.preventDefault();
        const key = fieldKey.trim();
        if (!key) { setError("Enter the field's key, for example ssn or dateOfBirth."); return; }
        setError("");
        setAdding(true);
        try {
            await apiFetch("/exports/sensitive-fields", { method: "POST", body: JSON.stringify({ moduleName, fieldKey: key }) });
            setFieldKey("");
            toast.success(`${humanizeEnum(moduleName)} › ${key} now needs approval to export`);
            load();
        } catch (caught: any) {
            setError(caught?.message || "The rule couldn't be added.");
        } finally {
            setAdding(false);
        }
    };

    const remove = async (rule: SensitiveFieldRule) => {
        const ok = await confirm({ title: `Remove the rule for ${humanizeEnum(rule.moduleName)} › ${rule.fieldKey}?`, description: "Exports that include this field will run without approval, unless another rule applies.", confirmLabel: "Remove rule", destructive: true });
        if (!ok) return;
        try {
            await apiFetch(`/exports/sensitive-fields/${rule.id}`, { method: "DELETE" });
            setRules((current) => (current ?? []).filter((item) => item.id !== rule.id));
            toast.success("Rule removed");
        } catch (caught: any) {
            toast.error(caught?.message || "The rule couldn't be removed");
        }
    };

    return (
        <div className="min-w-0 max-w-4xl">
            <PageHeader title="Export rules" description="Fields that make an export wait for an admin's approval before it runs." />
            <Section layout="split" id="add-rule" title="Add a field" description="Use the field's key, as it appears in the field editor or the API.">
                <form onSubmit={add} className="flex flex-wrap items-end gap-2" noValidate>
                    <div className="space-y-1.5">
                        <Label htmlFor="rule-module">Data</Label>
                        <Select value={moduleName} onValueChange={setModuleName}>
                            <SelectTrigger id="rule-module" className="w-44"><SelectValue /></SelectTrigger>
                            <SelectContent>{MODULES.map((value) => <SelectItem key={value} value={value}>{humanizeEnum(value)}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div className="min-w-48 flex-1 space-y-1.5">
                        <Label htmlFor="rule-field">Field key</Label>
                        <Input id="rule-field" className="font-mono" value={fieldKey} onChange={(event) => setFieldKey(event.target.value)} aria-invalid={!!error || undefined} aria-describedby={error ? "rule-field-error" : undefined} />
                    </div>
                    <Button type="submit" variant="outline" isLoading={adding}><Plus className="size-4" />Add rule</Button>
                    {error ? <p id="rule-field-error" role="alert" className="w-full text-sm text-destructive">{error}</p> : null}
                </form>
            </Section>
            <Section layout="split" id="rules" title="Fields that need approval" description="Approve or reject waiting exports in My work › Approvals.">
                {failed ? <ErrorState variant="inline" description="The rules couldn't be loaded." onRetry={load} /> : rules === null ? (
                    <p role="status" className="text-sm text-muted-foreground">Loading…</p>
                ) : rules.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No fields need approval yet. Other approval policies may still apply.</p>
                ) : (
                    <ul className="divide-y rounded-lg border">
                        {rules.map((rule) => (
                            <li key={rule.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                                <span><span className="text-muted-foreground">{humanizeEnum(rule.moduleName)} › </span><code className="font-mono">{rule.fieldKey}</code></span>
                                <Button variant="ghost" size="icon-sm" aria-label={`Remove the rule for ${rule.fieldKey}`} onClick={() => remove(rule)}><X className="size-4" /></Button>
                            </li>
                        ))}
                    </ul>
                )}
            </Section>
        </div>
    );
}
